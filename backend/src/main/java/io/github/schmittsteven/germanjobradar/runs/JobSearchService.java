package io.github.schmittsteven.germanjobradar.runs;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.schmittsteven.germanjobradar.job_sources.JobDescriptionLoader;
import io.github.schmittsteven.germanjobradar.job_sources.JobSource;
import io.github.schmittsteven.germanjobradar.job_sources.SearchCriteria;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.jobs.Job;
import io.github.schmittsteven.germanjobradar.jobs.JobPosting;
import io.github.schmittsteven.germanjobradar.jobs.JobRepository;
import io.github.schmittsteven.germanjobradar.profile.UserProfile;
import io.github.schmittsteven.germanjobradar.profile.UserProfileRepository;
import jakarta.annotation.PreDestroy;

/**
 * Runs a search in the background. Everything a run finds stays in memory
 * until one transaction at the end, so a canceled or crashed run leaves the jobs as they were.
 */
@Service
public class JobSearchService {

    private static final Logger log = LoggerFactory.getLogger(JobSearchService.class);

    private static final Duration LOOKUP_AFTER_UNSEEN =Duration.ofDays(7);

    private final Map<SourceType, JobSource> sourcesByType = new EnumMap<>(SourceType.class);
    private final SourceConfigRepository sourceConfigs;
    private final JobRepository jobs;
    private final RunRepository runs;
    private final UserProfileRepository userProfileRepository;
    private final JobDescriptionLoader descriptionLoader;
    private final TransactionTemplate transactionTemplate;
    private final Executor executor;

    @Nullable
    private ActiveRun activeRun;

    @Autowired
    public JobSearchService(List<JobSource> sources, SourceConfigRepository sourceConfigs, JobRepository jobs,
            RunRepository runs, UserProfileRepository userProfileRepository, JobDescriptionLoader descriptionLoader,
            PlatformTransactionManager transactionManager) {
        this(sources, sourceConfigs, jobs, runs, userProfileRepository, descriptionLoader, transactionManager,
                Executors.newSingleThreadExecutor(task -> {
                    Thread thread = new Thread(task, "job-search");
                    thread.setDaemon(true);
                    return thread;
                }));
    }

    // Tests pass an executor they control.
    JobSearchService(List<JobSource> sources, SourceConfigRepository sourceConfigs, JobRepository jobs,
            RunRepository runs, UserProfileRepository userProfileRepository, JobDescriptionLoader descriptionLoader,
            PlatformTransactionManager transactionManager, Executor executor) {
        for (JobSource source : sources) {
            sourcesByType.put(source.type(), source);
        }
        this.sourceConfigs = sourceConfigs;
        this.jobs = jobs;
        this.runs = runs;
        this.userProfileRepository = userProfileRepository;
        this.descriptionLoader = descriptionLoader;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.executor = executor;
    }

    /** Creates the run and returns it as it starts, the search continues in the background. */
    public synchronized Run start() {
        ActiveRun alreadyRunning = activeRun;
        if (alreadyRunning != null) {
            throw new RunAlreadyRunningException(Objects.requireNonNull(alreadyRunning.run.getId()));
        }
        UserProfile profile = userProfileRepository.get();
        List<SourceConfig> sources = sourceConfigs.findEnabled();
        findBlockedReason(profile, sources).ifPresent(reason -> {
            throw new SearchBlockedException(reason);
        });

        Run run = Run.start(Instant.now(), jobs.isEmpty(), sources.size());
        runs.insert(run);
        Run startedSnapshot = runs.findById(Objects.requireNonNull(run.getId())).orElseThrow();
        SearchCriteria criteria = new SearchCriteria(
                profile.getSearchTerms(),
                Objects.requireNonNull(profile.getLocationPlz()),
                Objects.requireNonNull(profile.getSearchRadius()),
                false);

        ActiveRun newActiveRun = new ActiveRun(run);
        this.activeRun = newActiveRun;
        executor.execute(() -> execute(newActiveRun, criteria, sources));
        return startedSnapshot;
    }

    /** Ends the run as canceled and drops everything it found. Ignored once the run has begun to save. */
    public synchronized void cancel(long runId) {
        ActiveRun toCancel = activeRun;
        if (toCancel == null || !Objects.equals(toCancel.run.getId(), runId)) {
            throw new RunNotRunningException(runId);
        }
        if (toCancel.isSaving) {
            return;
        }
        toCancel.isCanceled = true;
        activeRun = null;
        Thread worker = toCancel.worker;
        if (worker != null) {
            worker.interrupt();
        }
        toCancel.run.finish(Instant.now(), RunStatus.CANCELED, 0, List.of());
        runs.finish(toCancel.run);
    }

    public synchronized boolean isRunning() {
        return activeRun != null;
    }

    /** What this run knows only in memory, empty unless it is the one running right now. */
    public synchronized Optional<RunProgress> findProgress(long runId) {
        return Optional.ofNullable(activeRun)
                .filter(current -> Objects.equals(current.run.getId(), runId))
                .map(current -> current.progress);
    }

    /** The first reason a search can't start right now, empty if it can. */
    public Optional<SearchBlockedReason> findBlockedReason() {
        return findBlockedReason(userProfileRepository.get(), sourceConfigs.findEnabled());
    }

    // No run can be going yet, so a run still marked as running is one a crash left behind.
    @EventListener(ApplicationReadyEvent.class)
    void failInterruptedRuns() {
        int count = runs.failRunning(Instant.now());
        if (count > 0) {
            log.warn("Marked {} interrupted run(s) as failed", count);
        }
    }

    // On app shutdown: cancels a running run and stops the worker thread.
    @PreDestroy
    void shutdown() {
        Run runToCancel;
        synchronized (this) {
            runToCancel = activeRun == null ? null : activeRun.run;
        }
        if (runToCancel != null) {
            cancel(Objects.requireNonNull(runToCancel.getId()));
        }
        if (executor instanceof ExecutorService service) {
            service.shutdownNow();
        }
    }

    // Checks in the order the API reports them: terms, location, radius, sources.
    private static Optional<SearchBlockedReason> findBlockedReason(UserProfile profile, List<SourceConfig> enabledSources) {
        if (profile.getSearchTerms().isEmpty()) {
            return Optional.of(SearchBlockedReason.NO_SEARCH_TERMS);
        }
        if (profile.getLocationPlz() == null) {
            return Optional.of(SearchBlockedReason.NO_LOCATION);
        }
        if (profile.getSearchRadius() == null) {
            return Optional.of(SearchBlockedReason.NO_RADIUS);
        }
        if (enabledSources.isEmpty()) {
            return Optional.of(SearchBlockedReason.NO_SOURCES);
        }
        return Optional.empty();
    }

    // The background run: fetch, match, load descriptions, save, with cancel and failure handling.
    private void execute(ActiveRun activeRun, SearchCriteria criteria, List<SourceConfig> sources) {
        try {
            attachWorker(activeRun);
            List<SourceFetch> fetches = fetchAll(activeRun, criteria, sources);
            Matches matches = match(fetches);
            Descriptions descriptions = loadDescriptions(activeRun, matches);
            List<Job> newJobs = createJobs(descriptions.newPostingsByKey().values());
            List<JobPosting> updatedPostings = matches.updatedPostings().stream()
                    .map(posting -> descriptions.reloadedByKey().getOrDefault(PostingKey.of(posting), posting))
                    .toList();
            save(activeRun, fetches, updatedPostings, newJobs);
        } catch (RunCanceledException e) {
            // cancel() has already recorded the run as canceled
        } catch (RuntimeException e) {
            fail(activeRun, e);
        } finally {
            // An interrupt from cancel() must not reach the executor's next task.
            Thread.interrupted();
            release(activeRun);
        }
    }

    // Fetches the sources one after another and publishes the progress after each.
    private List<SourceFetch> fetchAll(ActiveRun activeRun, SearchCriteria criteria, List<SourceConfig> sources) {
        List<SourceFetch> fetches = new ArrayList<>();
        for (SourceConfig config : sources) {
            activeRun.throwIfCanceled();
            SourceFetch fetch = fetch(activeRun, config, criteria);
            fetches.add(fetch);
            activeRun.progress = new RunProgress(RunPhase.FETCHING, null, fetches.size(),
                    (int) fetches.stream().filter(SourceFetch::isFailed).count(),
                    fetches.stream().mapToInt(SourceFetch::rawCount).sum());
        }
        return fetches;
    }

    // Searches one source and looks up its due postings. A failing source only fails itself, the others still run.
    private SourceFetch fetch(ActiveRun activeRun, SourceConfig config, SearchCriteria criteria) {
        try {
            JobSource source = sourcesByType.get(config.getType());
            if (source == null) {
                throw new IllegalStateException("No adapter for " + config.getType());
            }
            List<JobPosting> found = source.search(config, criteria).stream()
                    .map(posting -> posting.withSourceConfig(config))
                    .toList();
            List<JobPosting> lookedUp = source.isListComplete() ? List.of() : lookUpDuePostings(activeRun, source, config, found);
            return new SourceFetch(config, found, lookedUp, null);
        } catch (RunCanceledException e) {
            throw e;
        } catch (RuntimeException e) {
            // An interrupt from cancel() can surface as any exception.
            activeRun.throwIfCanceled();
            log.warn("Source {} failed", config.getType(), e);
            String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return new SourceFetch(config, List.of(), List.of(), message);
        }
    }

    // For sources that can't prove a posting is gone: ask the source about the ones the search no longer returns.
    private List<JobPosting> lookUpDuePostings(ActiveRun activeRun, JobSource source, SourceConfig config, List<JobPosting> found) {
        Set<String> foundIds = new HashSet<>();
        found.forEach(posting -> foundIds.add(posting.externalId()));
        List<JobPosting> due = jobs.findDuePostings(config, Instant.now().minus(LOOKUP_AFTER_UNSEEN)).stream()
                .filter(posting -> !foundIds.contains(posting.externalId()))
                .toList();

        List<JobPosting> lookedUp = new ArrayList<>();
        for (JobPosting posting : due) {
            activeRun.throwIfCanceled();
            Optional<Boolean> onlineState;
            try {
                onlineState = source.isOnline(posting);
            } catch (RuntimeException e) {
                continue;
            }
            if (onlineState.isPresent()) {
                Instant now = Instant.now();
                lookedUp.add(onlineState.get() ? posting.withLastSeenAt(now) : posting.withGoneAt(now));
            }
        }
        return lookedUp;
    }

    // Only reads the database. There is no Deduplicator yet, so every unknown posting is a new job.
    private Matches match(List<SourceFetch> fetches) {
        List<JobPosting> updated = new ArrayList<>();
        List<JobPosting> outdated = new ArrayList<>();
        Map<PostingKey, JobPosting> added = new LinkedHashMap<>();
        for (SourceFetch fetch : fetches) {
            Map<String, JobPosting> saved = jobs.findPostings(fetch.config(),
                    fetch.found().stream().map(JobPosting::externalId).toList());
            for (JobPosting found : fetch.found()) {
                JobPosting known = saved.get(found.externalId());
                if (known == null) {
                    added.put(PostingKey.of(found), found);
                    continue;
                }
                JobPosting refreshed = known.refreshedWith(found);
                updated.add(refreshed);
                if (known.isDescriptionOutdatedBy(found)) {
                    outdated.add(refreshed);
                }
            }
        }
        Set<Long> excludedIds = jobs.findPostingIdsOfExcludedJobs(outdated.stream().map(JobPosting::id).toList());
        outdated.removeIf(posting -> excludedIds.contains(posting.id()));
        return new Matches(updated, outdated, added);
    }

    // Loads the missing descriptions of the new postings, then the outdated ones, each newest first,
    // so a stopped source leaves the oldest without one.
    private Descriptions loadDescriptions(ActiveRun activeRun, Matches matches) {
        Map<PostingKey, JobPosting> newPostingsByKey = new LinkedHashMap<>(matches.newPostingsByKey());
        Map<PostingKey, JobPosting> reloadedByKey = new HashMap<>();
        List<JobPosting> toLoad = Stream.concat(
                newestFirst(matches.newPostingsByKey().values().stream().filter(posting -> posting.description() == null)),
                newestFirst(matches.outdatedPostings().stream()))
                .toList();

        int[] remaining = { toLoad.size() };
        activeRun.progress = activeRun.progress.analyzing(remaining[0]);
        descriptionLoader.loadAll(toLoad, () -> activeRun.isCanceled, loaded -> {
            PostingKey key = PostingKey.of(loaded);
            if (newPostingsByKey.containsKey(key)) {
                newPostingsByKey.put(key, loaded);
            } else if (loaded.description() != null) {
                reloadedByKey.put(key, loaded);
            }
            remaining[0]--;
            activeRun.progress = activeRun.progress.analyzing(remaining[0]);
        });
        activeRun.throwIfCanceled();
        return new Descriptions(newPostingsByKey, reloadedByKey);
    }

    private Stream<JobPosting> newestFirst(Stream<JobPosting> postings) {
        return postings
                .filter(posting -> !sourcesByType.get(posting.sourceConfig().getType()).isListSource())
                .sorted(Comparator.comparing(JobPosting::publishedAt, Comparator.nullsLast(Comparator.reverseOrder())));
    }

    // Makes one new job per posting, all found now.
    private List<Job> createJobs(Collection<JobPosting> newPostings) {
        Instant foundAt = Instant.now();
        return newPostings.stream().map(posting -> new Job(foundAt, posting)).toList();
    }

    // Writes everything in one transaction and finishes the run. A cancel that arrives after beginSaving is ignored.
    private void save(ActiveRun activeRun, List<SourceFetch> fetches, List<JobPosting> updatedPostings, List<Job> newJobs) {
        beginSaving(activeRun);
        List<RunSourceResult> results = fetches.stream()
                .map(fetch -> new RunSourceResult(fetch.config(), fetch.rawCount(), fetch.error()))
                .toList();
        long failedCount = fetches.stream().filter(SourceFetch::isFailed).count();
        RunStatus status = failedCount == 0 ? RunStatus.SUCCESS
                : failedCount == fetches.size() ? RunStatus.FAILED : RunStatus.PARTIAL;

        transactionTemplate.executeWithoutResult(txStatus -> {
            updatedPostings.forEach(jobs::updatePosting);
            fetches.forEach(fetch -> fetch.lookedUpPostings().forEach(jobs::updatePosting));
            newJobs.forEach(jobs::insert);
            activeRun.run.finish(Instant.now(), status, newJobs.size(), results);
            runs.finish(activeRun.run);
        });
    }

    // Marks the run as failed after an unexpected error. Nothing was saved, unless a cancel came first.
    private void fail(ActiveRun activeRun, RuntimeException cause) {
        if (!tryBeginSaving(activeRun)) {
            return;
        }
        log.error("Run {} failed", activeRun.run.getId(), cause);
        try {
            activeRun.run.finish(Instant.now(), RunStatus.FAILED, 0, List.of());
            runs.finish(activeRun.run);
        } catch (RuntimeException e) {
            log.error("Run {} could not be marked as failed", activeRun.run.getId(), e);
        }
    }

    // Remembers the worker thread so cancel() can interrupt it, unless the run was canceled before it began.
    private synchronized void attachWorker(ActiveRun activeRun) {
        activeRun.throwIfCanceled();
        activeRun.worker = Thread.currentThread();
    }

    // Marks the run as saving, or throws if it was canceled first.
    private void beginSaving(ActiveRun activeRun) {
        if (!tryBeginSaving(activeRun)) {
            throw new RunCanceledException();
        }
    }

    // Marks the run as saving, so cancel() ignores it from then on. False if it was canceled first.
    private synchronized boolean tryBeginSaving(ActiveRun activeRun) {
        if (activeRun.isCanceled) {
            return false;
        }
        activeRun.isSaving = true;
        return true;
    }

    // Clears the active run when its worker is done, unless cancel() already did.
    private synchronized void release(ActiveRun finishedRun) {
        if (activeRun == finishedRun) {
            activeRun = null;
        }
    }

    private record PostingKey(long sourceConfigId, String externalId) {

        static PostingKey of(JobPosting posting) {
            return new PostingKey(Objects.requireNonNull(posting.sourceConfig().getId()), posting.externalId());
        }
    }

    private record SourceFetch(SourceConfig config, List<JobPosting> found, List<JobPosting> lookedUpPostings, @Nullable String error) {

        boolean isFailed() {
            return error != null;
        }

        int rawCount() {
            return found.size();
        }
    }

    // outdatedPostings are the updated ones whose stored description is older than the source's version.
    private record Matches(List<JobPosting> updatedPostings, List<JobPosting> outdatedPostings, Map<PostingKey, JobPosting> newPostingsByKey) {
    }

    private record Descriptions(Map<PostingKey, JobPosting> newPostingsByKey, Map<PostingKey, JobPosting> reloadedByKey) {
    }

    private static class RunCanceledException extends RuntimeException {
    }

    // isCanceled is only set by cancel(); isSaving and worker change under the service's lock.
    private static class ActiveRun {

        final Run run;
        volatile boolean isCanceled;
        volatile RunProgress progress = new RunProgress(RunPhase.FETCHING, null, 0, 0, 0);
        boolean isSaving;

        @Nullable
        Thread worker;

        ActiveRun(Run run) {
            this.run = run;
        }

        // Checkpoint for the worker: stops it once cancel() was called.
        void throwIfCanceled() {
            if (isCanceled) {
                throw new RunCanceledException();
            }
        }
    }
}
