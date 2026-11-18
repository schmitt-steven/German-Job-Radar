package io.github.schmittsteven.germanjobradar.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class JobTest {

    private static final Instant NOW = Instant.now();

    @Test
    void aJobNeedsAtLeastOnePosting() {
        assertThatThrownBy(() -> new Job(null, NOW, null, Reaction.NONE, JobStatus.NOT_APPLIED, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theMainPostingIsTheOneWithTheLongestDescription() {
        Job job = new Job(NOW, posting("A", "kurz"));
        job.addPosting(posting("B", "ein deutlich längerer Text"));
        job.addPosting(posting("C", "mittel lang"));

        assertThat(job.getMainPosting().externalId()).isEqualTo("B");
    }

    @Test
    void theMainPostingChangesWhenAnotherPostingGetsALongerDescription() {
        Job job = new Job(NOW, posting("A", null));
        assertThat(job.getMainPosting().externalId()).isEqualTo("A");

        job.addPosting(posting("B", "Text"));

        assertThat(job.getMainPosting().externalId()).isEqualTo("B");
    }

    @Test
    void theEarliestPostingWinsATie() {
        Job job = new Job(NOW, posting("A", "gleich"));
        job.addPosting(posting("B", "gleich"));

        assertThat(job.getMainPosting().externalId()).isEqualTo("A");
    }

    @Test
    void theFirstPostingIsTheMainPostingWhenNoneHasADescription() {
        Job job = new Job(NOW, posting("A", null));
        job.addPosting(posting("B", null));

        assertThat(job.getMainPosting().externalId()).isEqualTo("A");
    }

    @Test
    void replacePostingNeedsASavedPostingOfTheJob() {
        Job job = new Job(NOW, posting("A", null));

        assertThatThrownBy(() -> job.replacePosting(posting("A", "Text"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aJobIsOfflineWhenAllItsPostingsAreGone() {
        Job job = new Job(NOW, posting("A", null, NOW));
        assertThat(job.isOffline()).isTrue();

        job.addPosting(posting("B", null));
        assertThat(job.isOffline()).isFalse();
    }

    @Test
    void markOpenedKeepsTheFirstTime() {
        Job job = new Job(NOW, posting("A", null));

        job.markOpened(NOW.plusSeconds(1));
        job.markOpened(NOW.plusSeconds(2));

        assertThat(job.getOpenedAt()).isEqualTo(NOW.plusSeconds(1));
    }

    private static JobPosting posting(String externalId, String description) {
        return posting(externalId, description, null);
    }

    private static JobPosting posting(String externalId, String description, Instant goneAt) {
        return new JobPosting(externalId, "https://example.test/" + externalId, "Titel", null, null, description, null,
                false, NOW, goneAt);
    }
}
