package io.github.schmittsteven.germanjobradar.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.persistence.RepositoryTest;
import io.github.schmittsteven.germanjobradar.runs.Run;
import io.github.schmittsteven.germanjobradar.runs.RunRepository;
import io.github.schmittsteven.germanjobradar.runs.RunStatus;

@Import({ JobRepository.class, SourceConfigRepository.class, RunRepository.class })
class JobRepositoryTest extends RepositoryTest {

    private static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    @Autowired
    private JobRepository jobs;

    @Autowired
    private RunRepository runs;

    @Autowired
    private SourceConfigRepository sourceConfigs;

    private SourceConfig arbeitsagentur;

    @BeforeEach
    void loadSourceConfig() {
        arbeitsagentur = sourceConfigs.findAll().getFirst();
    }

    @Test
    void insertSavesTheJobWithItsPostings() {
        JobPosting posting = posting("10000-1-S", "Java Entwickler");
        Job job = new Job(NOW, posting);

        jobs.insert(job);

        Job loaded = jobs.findById(job.getId()).orElseThrow();
        assertThat(loaded.getFoundAt()).isEqualTo(NOW);
        assertThat(loaded.getOpenedAt()).isNull();
        assertThat(loaded.getReaction()).isEqualTo(Reaction.NONE);
        assertThat(loaded.getStatus()).isEqualTo(JobStatus.NOT_APPLIED);
        assertThat(loaded.getPostings()).hasSize(1);
        assertThat(loaded.getMainPosting().id()).isEqualTo(job.getMainPosting().id());
    }

    @Test
    void postingFieldsSurviveARoundTrip() {
        JobPosting posting = new JobPosting(null, arbeitsagentur, "10000-2-S", "https://example.test/2", "Backend",
                "ACME GmbH",
                "Köln", "Beschreibung", LocalDate.of(2026, 9, 3), true, NOW, NOW.plusSeconds(60));
        Job job = new Job(NOW, posting);
        jobs.insert(job);

        JobPosting loaded = jobs.findById(job.getId()).orElseThrow().getPostings().getFirst();

        assertThat(loaded.sourceConfig().getId()).isEqualTo(arbeitsagentur.getId());
        assertThat(loaded.externalId()).isEqualTo("10000-2-S");
        assertThat(loaded.url()).isEqualTo("https://example.test/2");
        assertThat(loaded.title()).isEqualTo("Backend");
        assertThat(loaded.company()).isEqualTo("ACME GmbH");
        assertThat(loaded.location()).isEqualTo("Köln");
        assertThat(loaded.description()).isEqualTo("Beschreibung");
        assertThat(loaded.publishedAt()).isEqualTo(LocalDate.of(2026, 9, 3));
        assertThat(loaded.isTemporaryAgencyWork()).isTrue();
        assertThat(loaded.lastSeenAt()).isEqualTo(NOW);
        assertThat(loaded.goneAt()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    void nullablePostingFieldsStayNull() {
        JobPosting posting = new JobPosting(null, arbeitsagentur, "10000-3-S", "https://example.test/3", "Backend",
                null,
                null, null, null, false, NOW, null);
        Job job = new Job(NOW, posting);
        jobs.insert(job);

        JobPosting loaded = jobs.findById(job.getId()).orElseThrow().getPostings().getFirst();

        assertThat(loaded.company()).isNull();
        assertThat(loaded.location()).isNull();
        assertThat(loaded.description()).isNull();
        assertThat(loaded.publishedAt()).isNull();
        assertThat(loaded.goneAt()).isNull();
    }

    @Test
    void updateSavesOpenedAtReactionAndStatus() {
        Job job = new Job(NOW, posting("10000-4-S", "A"));
        jobs.insert(job);
        jobs.addPosting(job, posting("10000-5-S", "B"));

        job.markOpened(NOW.plusSeconds(5));
        job.setReaction(Reaction.HEARTED);
        job.setStatus(JobStatus.APPLIED);
        jobs.update(job);

        Job loaded = jobs.findById(job.getId()).orElseThrow();
        assertThat(loaded.getOpenedAt()).isEqualTo(NOW.plusSeconds(5));
        assertThat(loaded.getReaction()).isEqualTo(Reaction.HEARTED);
        assertThat(loaded.getStatus()).isEqualTo(JobStatus.APPLIED);
        assertThat(loaded.getPostings()).hasSize(2);
    }

    @Test
    void updatePostingSavesTheChangedFields() {
        Job job = new Job(NOW, posting("10000-6-S", "Backend"));
        jobs.insert(job);
        JobPosting stored = job.getPostings().getFirst();

        Instant changedAt = Instant.parse("2026-10-20T08:45:10.307Z");
        JobPosting detailed = stored.withDetails("Volltext", true, changedAt);
        jobs.updatePosting(job, detailed);

        JobPosting loaded = jobs.findById(job.getId()).orElseThrow().getPostings().getFirst();
        assertThat(loaded.description()).isEqualTo("Volltext");
        assertThat(loaded.isTemporaryAgencyWork()).isTrue();
        assertThat(loaded.changedAt()).isEqualTo(changedAt);
    }

    @Test
    void insertSavesTheChangedAtOfAPosting() {
        Instant changedAt = Instant.parse("2026-10-01T05:07:30.951Z");
        Job job = new Job(NOW, posting("10000-16-S", "Backend").withChangedAt(changedAt));
        jobs.insert(job);

        JobPosting loaded = jobs.findById(job.getId()).orElseThrow().getPostings().getFirst();
        assertThat(loaded.changedAt()).isEqualTo(changedAt);
    }

    @Test
    void findPostingIdsOfExcludedJobsReturnsOnlyThoseOfExcludedJobs() {
        Job excluded = new Job(NOW, posting("10000-17-S", "A"));
        excluded.setReaction(Reaction.EXCLUDED);
        Job normal = new Job(NOW, posting("10000-18-S", "B"));
        jobs.insert(excluded);
        jobs.insert(normal);
        long excludedPostingId = excluded.getPostings().getFirst().id();
        long normalPostingId = normal.getPostings().getFirst().id();

        assertThat(jobs.findPostingIdsOfExcludedJobs(List.of(excludedPostingId, normalPostingId)))
                .containsExactly(excludedPostingId);
        assertThat(jobs.findPostingIdsOfExcludedJobs(List.of())).isEmpty();
    }

    @Test
    void updatePostingReplacesThePostingInTheJobAndMovesTheMainPosting() {
        Job job = new Job(NOW, posting("10000-14-S", "A"));
        jobs.insert(job);
        jobs.addPosting(job, posting("10000-15-S", "B"));
        JobPosting saved = job.getPostings().getLast();
        assertThat(job.getMainPosting().externalId()).isEqualTo("10000-14-S");

        jobs.updatePosting(job, saved.withDetails("Volltext", false, null));

        assertThat(job.getPostings()).hasSize(2);
        assertThat(job.getMainPosting().externalId()).isEqualTo("10000-15-S");
    }

    @Test
    void updatePostingOfAPostingFromAnotherJobIsRejected() {
        Job job = new Job(NOW, posting("10000-16-S", "A"));
        jobs.insert(job);
        Job other = new Job(NOW, posting("10000-17-S", "B"));
        jobs.insert(other);

        assertThatThrownBy(() -> jobs.updatePosting(job, other.getPostings().getFirst()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void findByPostingFindsTheJobBySourceAndExternalId() {
        Job job = new Job(NOW, posting("10000-7-S", "Backend"));
        jobs.insert(job);

        assertThat(jobs.findByPosting(arbeitsagentur, "10000-7-S").orElseThrow().getId()).isEqualTo(job.getId());
        assertThat(jobs.findByPosting(arbeitsagentur, "unknown")).isEmpty();
    }

    @Test
    void findByIdOfAnUnknownJobIsEmpty() {
        assertThat(jobs.findById(-1)).isEmpty();
    }

    @Test
    void aPostingIsUniquePerSourceAndExternalId() {
        jobs.insert(new Job(NOW, posting("10000-8-S", "Backend")));
        Job second = new Job(NOW, posting("10000-8-S", "Backend"));

        assertThatThrownBy(() -> jobs.insert(second)).isInstanceOf(Exception.class);
    }

    @Test
    void aPostingWithoutASavedSourceConfigIsRejected() {
        Job job = new Job(NOW, new JobPosting("10000-9-S", "https://example.test/9", "Backend", null, null, null, null,
                false, NOW, null));

        assertThatThrownBy(() -> jobs.insert(job)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void postingsOfAJobAreReturnedInInsertOrder() {
        Job job = new Job(NOW, posting("10000-12-S", "A"));
        job.addPosting(posting("10000-13-S", "B"));
        jobs.insert(job);

        List<JobPosting> loaded = jobs.findById(job.getId()).orElseThrow().getPostings();

        assertThat(loaded).extracting(JobPosting::title).containsExactly("A", "B");
    }

    @Test
    void isEmptyUntilAJobIsSaved() {
        assertThat(jobs.isEmpty()).isTrue();

        jobs.insert(new Job(NOW, posting("10000-17-S", "A")));

        assertThat(jobs.isEmpty()).isFalse();
    }

    @Test
    void findPostingsReturnsTheSavedOnesByExternalId() {
        jobs.insert(new Job(NOW, posting("10000-18-S", "A")));
        jobs.insert(new Job(NOW, posting("10000-19-S", "B")));

        var found = jobs.findPostings(arbeitsagentur, List.of("10000-18-S", "10000-20-S"));

        assertThat(found).containsOnlyKeys("10000-18-S");
        assertThat(found.get("10000-18-S").title()).isEqualTo("A");
        assertThat(found.get("10000-18-S").sourceConfig().getId()).isEqualTo(arbeitsagentur.getId());
    }

    @Test
    void findPostingsOfNoIdsIsEmpty() {
        assertThat(jobs.findPostings(arbeitsagentur, List.of())).isEmpty();
    }

    @Test
    void findDuePostingsLeavesOutSeenGoneAndExcluded() {
        Instant cutoff = NOW.minusSeconds(3600);
        jobs.insert(new Job(NOW, posting("due", "A").withLastSeenAt(cutoff.minusSeconds(1))));
        jobs.insert(new Job(NOW, posting("recent", "B").withLastSeenAt(cutoff.plusSeconds(1))));
        jobs.insert(new Job(NOW, posting("gone", "C").withLastSeenAt(cutoff.minusSeconds(1)).withGoneAt(NOW)));
        Job excluded = new Job(NOW, posting("excluded", "D").withLastSeenAt(cutoff.minusSeconds(1)));
        jobs.insert(excluded);
        excluded.setReaction(Reaction.EXCLUDED);
        jobs.update(excluded);
        Job hearted = new Job(NOW, posting("hearted", "E").withLastSeenAt(cutoff.minusSeconds(1)));
        jobs.insert(hearted);
        hearted.setReaction(Reaction.HEARTED);
        jobs.update(hearted);

        List<JobPosting> due = jobs.findDuePostings(arbeitsagentur, cutoff);

        assertThat(due).extracting(JobPosting::externalId).containsExactly("due", "hearted");
    }

    @Test
    void updatePostingWithoutItsJobSavesTheChangedFields() {
        Job job = new Job(NOW, posting("10000-21-S", "Backend"));
        jobs.insert(job);

        jobs.updatePosting(job.getPostings().getFirst().withGoneAt(NOW));

        assertThat(jobs.findById(job.getId()).orElseThrow().isOffline()).isTrue();
    }

    @Test
    void countByViewFollowsTheRulesOfTheJobList() {
        Run initial = Run.start(NOW.minusSeconds(7200), true, 1);
        runs.insert(initial);
        initial.finish(NOW.minusSeconds(7100), RunStatus.SUCCESS, 5, List.of());
        runs.finish(initial);
        Run latest = Run.start(NOW.minusSeconds(3600), false, 1);
        runs.insert(latest);
        latest.finish(NOW.minusSeconds(3500), RunStatus.SUCCESS, 1, List.of());
        runs.finish(latest);
        Instant old = NOW.minusSeconds(5000);
        Instant recent = NOW.minusSeconds(3000);

        insertJob("old", old, null, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("new", recent, null, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("opened", old, NOW, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("hearted", recent, null, Reaction.HEARTED, JobStatus.NOT_APPLIED, false);
        insertJob("applied", old, NOW, Reaction.NONE, JobStatus.APPLIED, false);
        insertJob("rejected", old, NOW, Reaction.NONE, JobStatus.REJECTED, false);
        insertJob("excluded", recent, null, Reaction.EXCLUDED, JobStatus.APPLIED, false);
        insertJob("gone", old, null, Reaction.NONE, JobStatus.NOT_APPLIED, true);
        insertJob("goneApplied", recent, null, Reaction.NONE, JobStatus.APPLIED, true);

        Map<JobView, Long> counts = jobs.countByView();

        assertThat(counts).containsOnly(
                entry(JobView.ALL, 6L),
                entry(JobView.NEW, 2L),
                entry(JobView.UNSEEN, 3L),
                entry(JobView.HEARTED, 1L),
                entry(JobView.APPLIED, 2L),
                entry(JobView.REJECTED, 1L),
                entry(JobView.EXCLUDED, 1L),
                entry(JobView.OFFLINE, 2L));
    }

    @Test
    void countByViewOfNoJobsIsZeroForEveryView() {
        assertThat(jobs.countByView()).hasSize(JobView.values().length - 1).containsValue(0L).doesNotContainValue(1L);
    }

    @Test
    void countByViewHasNoNewJobsUntilARunFoundSome() {
        Run initial = Run.start(NOW.minusSeconds(7200), true, 1);
        runs.insert(initial);
        initial.finish(NOW.minusSeconds(7100), RunStatus.SUCCESS, 1, List.of());
        runs.finish(initial);
        insertJob("first", NOW.minusSeconds(7150), null, Reaction.NONE, JobStatus.NOT_APPLIED, false);

        assertThat(jobs.countByView()).containsEntry(JobView.NEW, 0L).containsEntry(JobView.ALL, 1L);
    }

    @Test
    void findSummariesFollowsTheViewsAndTheirCounts() {
        Run latest = Run.start(NOW.minusSeconds(3600), false, 1);
        runs.insert(latest);
        latest.finish(NOW.minusSeconds(3500), RunStatus.SUCCESS, 1, List.of());
        runs.finish(latest);
        Instant old = NOW.minusSeconds(5000);
        Instant recent = NOW.minusSeconds(3000);
        insertJob("old", old, null, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("new", recent, null, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("opened", old, NOW, Reaction.NONE, JobStatus.NOT_APPLIED, false);
        insertJob("hearted", recent, null, Reaction.HEARTED, JobStatus.NOT_APPLIED, false);
        insertJob("applied", old, NOW, Reaction.NONE, JobStatus.APPLIED, false);
        insertJob("excluded", recent, null, Reaction.EXCLUDED, JobStatus.APPLIED, false);
        insertJob("gone", old, null, Reaction.NONE, JobStatus.NOT_APPLIED, true);

        for (JobView view : JobView.values()) {
            if (view != JobView.SORTED_OUT) {
                assertThat(findSummaries(filter(view)).getTotalElements()).isEqualTo(jobs.countByView().get(view));
            }
        }
        assertThat(titles(filter(JobView.NEW))).containsExactlyInAnyOrder("new", "hearted");
        assertThat(titles(filter(JobView.OFFLINE))).containsExactly("gone");
        assertThat(findSummaries(filter(JobView.SORTED_OUT)).getTotalElements()).isZero();
    }

    @Test
    void findSummariesSortsByPublishedDateThenFoundDateNewestFirst() {
        insertDatedJob("published-old", Instant.parse("2026-08-01T10:00:00Z"), LocalDate.of(2026, 9, 1));
        insertDatedJob("published-new", Instant.parse("2026-08-02T10:00:00Z"), LocalDate.of(2026, 9, 3));
        insertDatedJob("undated", Instant.parse("2026-08-30T10:00:00Z"), null);
        insertDatedJob("undated-later", Instant.parse("2026-09-02T12:00:00Z"), null);

        assertThat(titles(filter(JobView.ALL)))
                .containsExactly("published-new", "undated-later", "published-old", "undated");
    }

    @Test
    void findSummariesFiltersByQueryCompanyLocationAndSource() {
        jobs.insert(new Job(NOW, new JobPosting(null, arbeitsagentur, "q1", "https://example.test/1", "Java Entwickler",
                "ACME GmbH", "Köln", "Spring und 100% Remote", null, false, NOW, null)));
        jobs.insert(new Job(NOW, new JobPosting(null, arbeitsagentur, "q2", "https://example.test/2", "Tester",
                "Beta AG", "Berlin", "Selenium", null, false, NOW, null)));

        assertThat(titles(filter("java", null, null, List.of()))).containsExactly("Java Entwickler");
        assertThat(titles(filter("beta", null, null, List.of()))).containsExactly("Tester");
        assertThat(titles(filter("selenium", null, null, List.of()))).containsExactly("Tester");
        assertThat(titles(filter("100%", null, null, List.of()))).containsExactly("Java Entwickler");
        assertThat(titles(filter("%", null, null, List.of()))).containsExactly("Java Entwickler");
        assertThat(titles(filter(null, "ACME GmbH", null, List.of()))).containsExactly("Java Entwickler");
        assertThat(titles(filter(null, null, "Berlin", List.of()))).containsExactly("Tester");
        assertThat(titles(filter(null, null, null, List.of(SourceType.ARBEITSAGENTUR)))).hasSize(2);
        assertThat(titles(filter("java", null, "Berlin", List.of()))).isEmpty();
        assertThat(titles(filter("  ", "", null, List.of()))).hasSize(2);
    }

    @Test
    void findSummariesMapsTheMainPostingAndPages() {
        Run latest = Run.start(NOW.minusSeconds(3600), false, 1);
        runs.insert(latest);
        latest.finish(NOW.minusSeconds(3500), RunStatus.SUCCESS, 1, List.of());
        runs.finish(latest);
        JobPosting posting = new JobPosting(null, arbeitsagentur, "m1", "https://example.test/m1", "Backend", "ACME",
                "Köln", "Text", LocalDate.of(2026, 9, 3), true, NOW, null);
        Job job = new Job(NOW, posting);
        jobs.insert(job);
        for (int i = 0; i < 3; i++) {
            jobs.insert(new Job(NOW.minusSeconds(100 + i), posting("p" + i, "Filler " + i)));
        }

        Page<JobSummaryResponse> page = jobs.findSummaries(filter(JobView.ALL), PageRequest.of(0, 2));

        assertThat(page.getTotalElements()).isEqualTo(4);
        assertThat(page.getContent()).hasSize(2);
        assertThat(jobs.findSummaries(filter(JobView.ALL), PageRequest.of(1, 2)).getContent()).hasSize(2);
        assertThat(findSummaries(filter(JobView.ALL)).getContent()).contains(new JobSummaryResponse(job.getId(), "Backend", "ACME", "Köln",
                List.of(SourceType.ARBEITSAGENTUR), LocalDate.of(2026, 9, 3), JobStatus.NOT_APPLIED, Reaction.NONE,
                true, false, true, true));
    }

    @Test
    void findLocationAndCompanyValuesListsTheMainPostingValuesOfTheViewInGermanOrder() {
        insertCompanyJob("f1", "Zeiss AG", "Berlin", Reaction.NONE);
        insertCompanyJob("f2", "Ärzteverbund", "Köln", Reaction.NONE);
        insertCompanyJob("f3", "acme", "Berlin", Reaction.NONE);
        insertCompanyJob("f4", "Excluded GmbH", "Aachen", Reaction.EXCLUDED);
        insertCompanyJob("f5", " ", null, Reaction.NONE);
        Job twoPostings = new Job(NOW, new JobPosting(null, arbeitsagentur, "f6", "https://example.test/f6", "Main",
                "Main GmbH", "Bonn", "Die längere Beschreibung", null, false, NOW, null));
        twoPostings.addPosting(new JobPosting(null, arbeitsagentur, "f7", "https://example.test/f7", "Other",
                "Other GmbH", "Essen", "Kurz", null, false, NOW, null));
        jobs.insert(twoPostings);

        LocationAndCompanyValuesResponse all = jobs.findLocationAndCompanyValues(JobView.ALL);
        LocationAndCompanyValuesResponse excluded = jobs.findLocationAndCompanyValues(JobView.EXCLUDED);

        assertThat(all.companies()).containsExactly("acme", "Ärzteverbund", "Main GmbH", "Zeiss AG");
        assertThat(all.locations()).containsExactly("Berlin", "Bonn", "Köln");
        assertThat(excluded).isEqualTo(new LocationAndCompanyValuesResponse(List.of("Aachen"), List.of("Excluded GmbH")));
        assertThat(jobs.findLocationAndCompanyValues(JobView.SORTED_OUT))
                .isEqualTo(new LocationAndCompanyValuesResponse(List.of(), List.of()));
    }

    private void insertCompanyJob(String externalId, String company, String location, Reaction reaction) {
        JobPosting posting = new JobPosting(null, arbeitsagentur, externalId, "https://example.test/" + externalId,
                externalId, company, location, null, null, false, NOW, null);
        jobs.insert(new Job(null, NOW, null, reaction, JobStatus.NOT_APPLIED, List.of(posting)));
    }

    private JobFilter filter(JobView view) {
        return new JobFilter(view, null, null, null, List.of());
    }

    private JobFilter filter(String query, String company, String location, List<SourceType> sources) {
        return new JobFilter(JobView.ALL, query, company, location, sources);
    }

    private Page<JobSummaryResponse> findSummaries(JobFilter filter) {
        return jobs.findSummaries(filter, PageRequest.of(0, 50));
    }

    private List<String> titles(JobFilter filter) {
        return findSummaries(filter).getContent().stream().map(JobSummaryResponse::title).toList();
    }

    private void insertDatedJob(String title, Instant foundAt, LocalDate publishedAt) {
        jobs.insert(new Job(foundAt, new JobPosting(null, arbeitsagentur, title, "https://example.test/" + title, title,
                null, null, null, publishedAt, false, NOW, null)));
    }

    private void insertJob(String externalId, Instant foundAt, Instant openedAt, Reaction reaction, JobStatus status,
            boolean isGone) {
        JobPosting posting = posting(externalId, externalId);
        Job job = new Job(null, foundAt, openedAt, reaction, status,
                List.of(isGone ? posting.withGoneAt(NOW) : posting));
        jobs.insert(job);
    }

    private JobPosting posting(String externalId, String title) {
        return new JobPosting(null, arbeitsagentur, externalId, "https://example.test/" + externalId, title, null, null,
                null, null, false, NOW, null);
    }
}
