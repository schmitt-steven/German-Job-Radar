package io.github.schmittsteven.germanjobradar.job_sources;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;

import io.github.schmittsteven.germanjobradar.jobs.JobPosting;

class JobDescriptionLoaderTest {

    private static final SourceConfig CONFIG = new SourceConfig(SourceType.ARBEITSAGENTUR, true, null);

    private final FakeSource source = new FakeSource();
    private final JobDescriptionLoader loader = new JobDescriptionLoader(List.of(source), Duration.ZERO);
    private final List<JobPosting> loaded = new ArrayList<>();

    @Test
    void loadsEveryPostingInTheGivenOrder() {
        loader.loadAll(postings("a", "b", "c"), () -> false, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("a", "b", "c");
        assertThat(loaded).extracting(JobPosting::description).containsExactly("text a", "text b", "text c");
    }

    @ParameterizedTest
    @ValueSource(ints = { 429, 403 })
    void stopsTheSourceAfterBlockedStatus(int status) {
        source.failures.put("b", HttpClientErrorException.create(HttpStatus.valueOf(status), "", null, null, null));

        loader.loadAll(postings("a", "b", "c", "d"), () -> false, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("a");
        assertThat(source.calls).containsExactly("a", "b");
    }

    @Test
    void skipsAPostingThatFailedForAnotherReason() {
        source.failures.put("b", HttpServerErrorException.create(HttpStatus.INTERNAL_SERVER_ERROR, "", null, null, null));

        loader.loadAll(postings("a", "b", "c"), () -> false, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("a", "c");
    }

    @Test
    void doesNotStopOnOtherClientErrors() {
        source.failures.put("a", HttpClientErrorException.create(HttpStatus.NOT_FOUND, "", null, null, null));

        loader.loadAll(postings("a", "b"), () -> false, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("b");
    }

    @Test
    void stopsWhenCanceled() {
        loader.loadAll(postings("a", "b", "c"), () -> loaded.size() == 1, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("a");
        assertThat(source.calls).containsExactly("a");
    }

    @Test
    void waitsBetweenCallsToTheSameSource() {
        Duration pause = Duration.ofMillis(100);
        JobDescriptionLoader pacedLoader = new JobDescriptionLoader(List.of(source), pause);

        Instant start = Instant.now();
        pacedLoader.loadAll(postings("a", "b", "c"), () -> false, loaded::add);

        assertThat(Duration.between(start, Instant.now())).isGreaterThanOrEqualTo(pause.multipliedBy(2));
    }

    @Test
    void stopsWhenInterruptedWhileWaiting() {
        JobDescriptionLoader pacedLoader = new JobDescriptionLoader(List.of(source), Duration.ofSeconds(30));
        Thread.currentThread().interrupt();

        pacedLoader.loadAll(postings("a", "b", "c"), () -> false, loaded::add);

        assertThat(loaded).extracting(JobPosting::externalId).containsExactly("a");
        assertThat(Thread.interrupted()).isTrue();
    }

    private static List<JobPosting> postings(String... externalIds) {
        return java.util.Arrays.stream(externalIds)
                .map(id -> new JobPosting(id, "https://example.test/" + id, "Title " + id, "Company", "Köln", null, null, false, Instant.now(), null)
                        .withSourceConfig(CONFIG))
                .toList();
    }

    private static class FakeSource implements JobSource {

        final Map<String, RuntimeException> failures = new HashMap<>();
        final List<String> calls = new ArrayList<>();

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
            throw new UnsupportedOperationException();
        }

        @Override
        public JobPosting loadDetails(JobPosting posting) {
            calls.add(posting.externalId());
            RuntimeException failure = failures.get(posting.externalId());
            if (failure != null) {
                throw failure;
            }
            return posting.withDetails("text " + posting.externalId(), false, null);
        }

        @Override
        public Optional<Boolean> isOnline(JobPosting posting) {
            throw new UnsupportedOperationException();
        }
    }
}
