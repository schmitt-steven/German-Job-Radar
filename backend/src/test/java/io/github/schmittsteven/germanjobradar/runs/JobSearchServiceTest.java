package io.github.schmittsteven.germanjobradar.runs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;

import io.github.schmittsteven.germanjobradar.job_sources.JobDescriptionLoader;
import io.github.schmittsteven.germanjobradar.job_sources.JobSource;
import io.github.schmittsteven.germanjobradar.job_sources.SearchCriteria;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.jobs.Job;
import io.github.schmittsteven.germanjobradar.jobs.JobPosting;
import io.github.schmittsteven.germanjobradar.jobs.JobRepository;
import io.github.schmittsteven.germanjobradar.jobs.Reaction;
import io.github.schmittsteven.germanjobradar.persistence.RepositoryTest;
import io.github.schmittsteven.germanjobradar.profile.UserProfile;
import io.github.schmittsteven.germanjobradar.profile.UserProfileRepository;

// The run commits on its own, so the test can't run inside a rolled-back transaction.
@Import({ JobRepository.class, RunRepository.class, SourceConfigRepository.class, UserProfileRepository.class })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JobSearchServiceTest extends RepositoryTest {

    private static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    private static final Instant OLD_CHANGED_AT = Instant.parse("2026-10-01T05:07:30.951Z");
    private static final Instant NEW_CHANGED_AT = Instant.parse("2026-10-20T08:45:10.307Z");

    @Autowired
    private JobRepository jobs;

    @Autowired
    private RunRepository runs;

    @Autowired
    private SourceConfigRepository sourceConfigs;

    @Autowired
    private UserProfileRepository userProfileRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcClient jdbc;

    private final FakeSource source = new FakeSource();
    private SourceConfig arbeitsagentur;
    private JobSearchService service;

    @BeforeEach
    void setUp() {
        arbeitsagentur = sourceConfigs.findAll().getFirst();
        userProfileRepository.save(new UserProfile(List.of("Java"), "50667", "Köln", 50));
        service = newService(Runnable::run);
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("DELETE FROM run").update();
        jdbc.sql("DELETE FROM job").update();
        jdbc.sql("UPDATE source_config SET is_enabled = 1").update();
        userProfileRepository.save(new UserProfile());
    }

    @Test
    void startRejectsASearchWithoutSearchTerms() {
        userProfileRepository.save(new UserProfile(List.of(), "50667", "Köln", 50));

        assertBlockedBy(SearchBlockedReason.NO_SEARCH_TERMS);
    }

    @Test
    void startRejectsASearchWithoutLocation() {
        userProfileRepository.save(new UserProfile(List.of("Java"), null, null, 50));

        assertBlockedBy(SearchBlockedReason.NO_LOCATION);
    }

    @Test
    void startRejectsASearchWithoutRadius() {
        userProfileRepository.save(new UserProfile(List.of("Java"), "50667", "Köln", null));

        assertBlockedBy(SearchBlockedReason.NO_RADIUS);
    }

    @Test
    void startRejectsASearchWithoutEnabledSources() {
        jdbc.sql("UPDATE source_config SET is_enabled = 0").update();

        assertBlockedBy(SearchBlockedReason.NO_SOURCES);
    }

    @Test
    void aBlockedStartCreatesNoRun() {
        userProfileRepository.save(new UserProfile());

        assertThatThrownBy(service::start).isInstanceOf(SearchBlockedException.class);

        assertThat(runs.findLatest(10)).isEmpty();
    }

    @Test
    void searchCriteriaComeFromTheProfile() {
        service.start();

        assertThat(source.criteria).isEqualTo(new SearchCriteria(List.of("Java"), "50667", 50, false));
    }

    @Test
    void firstRunSavesEveryPostingAsANewJobWithItsDescription() {
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 1)), posting("b", LocalDate.of(2026, 10, 2)));

        Run started = service.start();

        Run run = runs.findById(started.getId()).orElseThrow();
        assertThat(started.getOverallStatus()).isEqualTo(RunStatus.RUNNING);
        assertThat(run.getOverallStatus()).isEqualTo(RunStatus.SUCCESS);
        assertThat(run.isInitialSearch()).isTrue();
        assertThat(run.getNewJobCount()).isEqualTo(2);
        assertThat(run.getFinishedAt()).isNotNull();
        assertThat(run.getSourceResults()).singleElement().satisfies(result -> {
            assertThat(result.sourceConfig().getId()).isEqualTo(arbeitsagentur.getId());
            assertThat(result.rawCount()).isEqualTo(2);
            assertThat(result.error()).isNull();
        });
        Job job = jobs.findByPosting(arbeitsagentur, "a").orElseThrow();
        assertThat(job.getReaction()).isEqualTo(Reaction.NONE);
        assertThat(job.getMainPosting().description()).isEqualTo("text a");
        assertThat(job.getMainPosting().lastSeenAt()).isNotNull();
        assertThat(jobs.findByPosting(arbeitsagentur, "b")).isPresent();
    }

    @Test
    void loadsDescriptionsNewestFirst() {
        source.found = List.of(
                posting("old", LocalDate.of(2026, 9, 1)),
                posting("new", LocalDate.of(2026, 10, 1)),
                posting("undated", null),
                posting("mid", LocalDate.of(2026, 9, 15)));

        service.start();

        assertThat(source.detailCalls).containsExactly("new", "mid", "old", "undated");
    }

    @Test
    void takesTheZeitarbeitTagFromTheDetails() {
        source.found = List.of(posting("a", null));
        source.temporaryAgencyWork.put("a", true);

        service.start();

        assertThat(jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting().isTemporaryAgencyWork()).isTrue();
    }

    @Test
    void aStoppedSourceStillSavesTheJobsWithoutDescription() {
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 3)), posting("b", LocalDate.of(2026, 10, 2)),
                posting("c", LocalDate.of(2026, 10, 1)));
        source.detailFailures.put("b", HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "", null, null, null));

        service.start();

        assertThat(source.detailCalls).containsExactly("a", "b");
        assertThat(descriptionOf("a")).isEqualTo("text a");
        assertThat(descriptionOf("b")).isNull();
        assertThat(descriptionOf("c")).isNull();
    }

    @Test
    void aKnownPostingIsUpdatedWithoutBecomingANewJob() {
        saveJob(savedPosting("a").withDetails("Volltext", true, null).withGoneAt(NOW.minusSeconds(60)));
        source.found = List.of(new JobPosting("a", "https://example.test/new", "Neuer Titel", "ACME", "Bonn", null,
                LocalDate.of(2026, 10, 5), false, NOW, null));

        service.start();

        Run run = runs.findLatest(1).getFirst();
        assertThat(run.getNewJobCount()).isZero();
        assertThat(run.isInitialSearch()).isFalse();
        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(posting.title()).isEqualTo("Neuer Titel");
        assertThat(posting.location()).isEqualTo("Bonn");
        assertThat(posting.lastSeenAt()).isEqualTo(NOW);
        assertThat(posting.goneAt()).isNull();
        assertThat(posting.description()).isEqualTo("Volltext");
        assertThat(posting.isTemporaryAgencyWork()).isTrue();
        assertThat(source.detailCalls).isEmpty();
    }

    @Test
    void aKnownPostingWithANewerChangedAtGetsItsDescriptionReloaded() {
        saveJob(savedPosting("a").withDetails("Alter Text", false, OLD_CHANGED_AT));
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 1)).withChangedAt(NEW_CHANGED_AT));
        source.changedAtOnLoad.put("a", NEW_CHANGED_AT);

        service.start();

        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(source.detailCalls).containsExactly("a");
        assertThat(posting.description()).isEqualTo("text a");
        assertThat(posting.changedAt()).isEqualTo(NEW_CHANGED_AT);
        assertThat(runs.findLatest(1).getFirst().getNewJobCount()).isZero();
    }

    @Test
    void aKnownPostingWithTheSameChangedAtKeepsItsDescription() {
        saveJob(savedPosting("a").withDetails("Alter Text", false, OLD_CHANGED_AT));
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 1)).withChangedAt(OLD_CHANGED_AT));

        service.start();

        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(source.detailCalls).isEmpty();
        assertThat(posting.description()).isEqualTo("Alter Text");
        assertThat(posting.changedAt()).isEqualTo(OLD_CHANGED_AT);
    }

    @Test
    void aFailedReloadKeepsTheOldTextAndChangedAtButUpdatesTheOtherFields() {
        saveJob(savedPosting("a").withDetails("Alter Text", false, OLD_CHANGED_AT));
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 1)).withChangedAt(NEW_CHANGED_AT).withLastSeenAt(NOW));
        source.detailFailures.put("a", new RestClientException("boom"));

        service.start();

        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(source.detailCalls).containsExactly("a");
        assertThat(posting.description()).isEqualTo("Alter Text");
        assertThat(posting.changedAt()).isEqualTo(OLD_CHANGED_AT);
        assertThat(posting.lastSeenAt()).isEqualTo(NOW);
    }

    @Test
    void anExcludedJobsPostingIsNotReloaded() {
        Job excluded = saveJob(savedPosting("a").withDetails("Alter Text", false, OLD_CHANGED_AT));
        excluded.setReaction(Reaction.EXCLUDED);
        jobs.update(excluded);
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 1)).withChangedAt(NEW_CHANGED_AT));

        service.start();

        assertThat(source.detailCalls).isEmpty();
        assertThat(descriptionOf("a")).isEqualTo("Alter Text");
    }

    @Test
    void outdatedPostingsAreReloadedAfterTheNewJobs() {
        saveJob(savedPosting("old").withDetails("Alter Text", false, OLD_CHANGED_AT));
        source.found = List.of(
                posting("old", LocalDate.of(2026, 10, 1)).withChangedAt(NEW_CHANGED_AT),
                posting("new", LocalDate.of(2026, 9, 1)));

        service.start();

        assertThat(source.detailCalls).containsExactly("new", "old");
    }

    @Test
    void anExcludedJobGetsItsPostingUpdatedButStaysExcluded() {
        Job excluded = saveJob(savedPosting("a"));
        excluded.setReaction(Reaction.EXCLUDED);
        jobs.update(excluded);
        source.found = List.of(posting("a", null).withLastSeenAt(NOW));

        service.start();

        Job job = jobs.findByPosting(arbeitsagentur, "a").orElseThrow();
        assertThat(job.getReaction()).isEqualTo(Reaction.EXCLUDED);
        assertThat(job.getMainPosting().lastSeenAt()).isEqualTo(NOW);
    }

    @Test
    void marksAPostingGoneThatTheSourceNoLongerKnows() {
        saveJob(savedPosting("a").withLastSeenAt(daysAgo(8)));
        source.online.put("a", false);

        service.start();

        assertThat(jobs.findByPosting(arbeitsagentur, "a").orElseThrow().isOffline()).isTrue();
    }

    @Test
    void refreshesTheLastSeenOfAPostingThatIsStillOnline() {
        saveJob(savedPosting("a").withLastSeenAt(daysAgo(8)));
        source.online.put("a", true);

        service.start();

        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(posting.goneAt()).isNull();
        assertThat(posting.lastSeenAt()).isAfter(daysAgo(1));
    }

    @Test
    void leavesAPostingAloneWhenTheSourceCantTell() {
        Instant lastSeenAt = daysAgo(8).truncatedTo(ChronoUnit.MILLIS);
        saveJob(savedPosting("a").withLastSeenAt(lastSeenAt));

        service.start();

        JobPosting posting = jobs.findByPosting(arbeitsagentur, "a").orElseThrow().getMainPosting();
        assertThat(posting.goneAt()).isNull();
        assertThat(posting.lastSeenAt()).isEqualTo(lastSeenAt);
        assertThat(source.lookups).containsExactly("a");
    }

    @Test
    void looksUpOnlyPostingsThatAreDue() {
        saveJob(savedPosting("recent").withLastSeenAt(daysAgo(2)));
        saveJob(savedPosting("returned").withLastSeenAt(daysAgo(9)));
        saveJob(savedPosting("alreadyGone").withLastSeenAt(daysAgo(9)).withGoneAt(daysAgo(8)));
        Job excluded = saveJob(savedPosting("excluded").withLastSeenAt(daysAgo(9)));
        excluded.setReaction(Reaction.EXCLUDED);
        jobs.update(excluded);
        saveJob(savedPosting("due").withLastSeenAt(daysAgo(9)));
        source.found = List.of(posting("returned", null));

        service.start();

        assertThat(source.lookups).containsExactly("due");
    }

    @Test
    void aFailedSourceFailsTheRunAndSavesNothingElse() {
        saveJob(savedPosting("a").withLastSeenAt(daysAgo(8)));
        source.searchFailure = new IllegalStateException("Ort unbekannt");
        source.online.put("a", false);

        service.start();

        Run run = runs.findLatest(1).getFirst();
        assertThat(run.getOverallStatus()).isEqualTo(RunStatus.FAILED);
        assertThat(run.getNewJobCount()).isZero();
        assertThat(run.getSourceResults()).singleElement().satisfies(result -> {
            assertThat(result.rawCount()).isZero();
            assertThat(result.error()).isEqualTo("Ort unbekannt");
        });
        assertThat(jobs.findByPosting(arbeitsagentur, "a").orElseThrow().isOffline()).isFalse();
        assertThat(source.lookups).isEmpty();
    }

    @Test
    void anUnexpectedErrorRollsEverythingBack() {
        JobPosting withoutTitle = new JobPosting("b", "https://example.test/b", null, "ACME", "Köln", null, null, false, Instant.now(), null);
        source.found = List.of(posting("a", null), withoutTitle);

        service.start();

        Run run = runs.findLatest(1).getFirst();
        assertThat(run.getOverallStatus()).isEqualTo(RunStatus.FAILED);
        assertThat(run.getFinishedAt()).isNotNull();
        assertThat(run.getNewJobCount()).isZero();
        assertThat(run.getSourceResults()).isEmpty();
        assertThat(jobs.isEmpty()).isTrue();
        assertThat(service.isRunning()).isFalse();
    }

    @Test
    void aRunCanStartAgainWhenTheLastOneIsDone() {
        service.start();
        service.start();

        assertThat(runs.findLatest(10)).hasSize(2);
    }

    @Test
    void cancelEndsTheRunAndSavesNothing() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        service = newService(executor);
        source.found = List.of(posting("a", null));
        source.blockSearch = new CountDownLatch(1);

        Run started = service.start();
        assertThat(source.searchStarted.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(service.isRunning()).isTrue();
        assertThat(service.findProgress(started.getId())).get().extracting(RunProgress::phase).isEqualTo(RunPhase.FETCHING);
        assertThat(service.findProgress(started.getId() + 1)).isEmpty();
        service.cancel(started.getId());
        assertThat(service.findProgress(started.getId())).isEmpty();
        executor.shutdown();
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        Run run = runs.findById(started.getId()).orElseThrow();
        assertThat(run.getOverallStatus()).isEqualTo(RunStatus.CANCELED);
        assertThat(run.getFinishedAt()).isNotNull();
        assertThat(run.getNewJobCount()).isZero();
        assertThat(run.getSourceResults()).isEmpty();
        assertThat(jobs.isEmpty()).isTrue();
        assertThat(service.isRunning()).isFalse();
    }

    @Test
    void cancelDuringTheDescriptionsSavesNothing() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        service = newService(executor);
        source.found = List.of(posting("a", LocalDate.of(2026, 10, 2)), posting("b", LocalDate.of(2026, 10, 1)));
        source.blockDetails = new CountDownLatch(1);

        Run started = service.start();
        assertThat(source.detailsStarted.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(service.findProgress(started.getId())).get().satisfies(progress -> {
            assertThat(progress.phase()).isEqualTo(RunPhase.ANALYZING);
            assertThat(progress.remainingCount()).isEqualTo(2);
            assertThat(progress.finishedSourceCount()).isEqualTo(1);
            assertThat(progress.checkedJobCount()).isEqualTo(2);
        });
        service.cancel(started.getId());
        executor.shutdown();
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        assertThat(runs.findById(started.getId()).orElseThrow().getOverallStatus()).isEqualTo(RunStatus.CANCELED);
        assertThat(jobs.isEmpty()).isTrue();
        assertThat(source.detailCalls).containsExactly("a");
    }

    @Test
    void startRejectsASecondRunWhileOneIsRunning() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        service = newService(executor);
        source.blockSearch = new CountDownLatch(1);

        Run started = service.start();
        assertThat(source.searchStarted.await(5, TimeUnit.SECONDS)).isTrue();

        assertThatThrownBy(service::start).isInstanceOf(RunAlreadyRunningException.class);
        assertThat(runs.findLatest(10)).hasSize(1);

        service.cancel(started.getId());
        executor.shutdown();
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    void failsTheRunsAnEarlierCrashLeftRunning() {
        Run leftBehind = Run.start(NOW, false, 1);
        runs.insert(leftBehind);

        service.failInterruptedRuns();

        Run run = runs.findById(leftBehind.getId()).orElseThrow();
        assertThat(run.getOverallStatus()).isEqualTo(RunStatus.FAILED);
        assertThat(run.getFinishedAt()).isNotNull();
    }

    @Test
    void cancelOfAFinishedOrUnknownRunIsRejected() {
        Run started = service.start();

        assertThatThrownBy(() -> service.cancel(started.getId())).isInstanceOf(RunNotRunningException.class);
        assertThatThrownBy(() -> service.cancel(9999)).isInstanceOf(RunNotRunningException.class);
        assertThat(runs.findById(started.getId()).orElseThrow().getOverallStatus()).isEqualTo(RunStatus.SUCCESS);
    }

    private JobSearchService newService(Executor executor) {
        JobDescriptionLoader loader = new JobDescriptionLoader(List.of(source), Duration.ZERO);
        return new JobSearchService(List.of(source), sourceConfigs, jobs, runs, userProfileRepository, loader, transactionManager, executor);
    }

    private void assertBlockedBy(SearchBlockedReason reason) {
        assertThat(service.findBlockedReason()).contains(reason);
        assertThatThrownBy(service::start)
                .isInstanceOfSatisfying(SearchBlockedException.class, e -> assertThat(e.getReason()).isEqualTo(reason));
    }

    private String descriptionOf(String externalId) {
        return jobs.findByPosting(arbeitsagentur, externalId).orElseThrow().getMainPosting().description();
    }

    private Job saveJob(JobPosting posting) {
        Job job = new Job(NOW, posting);
        jobs.insert(job);
        return job;
    }

    private JobPosting savedPosting(String externalId) {
        return posting(externalId, LocalDate.of(2026, 10, 1)).withSourceConfig(arbeitsagentur).withLastSeenAt(NOW);
    }

    private static JobPosting posting(String externalId, LocalDate publishedAt) {
        return new JobPosting(externalId, "https://example.test/" + externalId, "Title " + externalId, "ACME", "Köln", null,
                publishedAt, false, Instant.now(), null);
    }

    private static Instant daysAgo(int days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    private class FakeSource implements JobSource {

        List<JobPosting> found = List.of();
        RuntimeException searchFailure;
        SearchCriteria criteria;
        final Map<String, Boolean> online = new HashMap<>();
        final Map<String, Boolean> temporaryAgencyWork = new HashMap<>();
        final Map<String, Instant> changedAtOnLoad = new HashMap<>();
        final Map<String, RuntimeException> detailFailures = new HashMap<>();
        final List<String> detailCalls = new ArrayList<>();
        final List<String> lookups = new ArrayList<>();
        final CountDownLatch searchStarted = new CountDownLatch(1);
        final CountDownLatch detailsStarted = new CountDownLatch(1);
        CountDownLatch blockSearch;
        CountDownLatch blockDetails;

        @Override
        public SourceType type() {
            return SourceType.ARBEITSAGENTUR;
        }

        @Override
        public boolean isListSource() {
            return false;
        }

        @Override
        public boolean isListComplete() {
            return false;
        }

        @Override
        public List<JobPosting> search(SourceConfig config, SearchCriteria criteria) {
            this.criteria = criteria;
            searchStarted.countDown();
            await(blockSearch);
            if (searchFailure != null) {
                throw searchFailure;
            }
            return found;
        }

        @Override
        public JobPosting loadDetails(JobPosting posting) {
            detailCalls.add(posting.externalId());
            detailsStarted.countDown();
            await(blockDetails);
            RuntimeException failure = detailFailures.get(posting.externalId());
            if (failure != null) {
                throw failure;
            }
            return posting.withDetails("text " + posting.externalId(),
                    temporaryAgencyWork.getOrDefault(posting.externalId(), false),
                    changedAtOnLoad.get(posting.externalId()));
        }

        @Override
        public Optional<Boolean> isOnline(JobPosting posting) {
            lookups.add(posting.externalId());
            return Optional.ofNullable(online.get(posting.externalId()));
        }

        private void await(CountDownLatch latch) {
            if (latch == null) {
                return;
            }
            try {
                latch.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted", e);
            }
        }
    }
}
