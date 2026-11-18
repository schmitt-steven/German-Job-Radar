package io.github.schmittsteven.germanjobradar.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

class JobPostingTest {

    private static final SourceConfig CONFIG = new SourceConfig(1L, SourceType.ARBEITSAGENTUR, true, null);
    private static final Instant EARLIER = Instant.parse("2026-10-01T08:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-20T08:00:00Z");

    private final JobPosting saved = new JobPosting(5L, CONFIG, "a", "https://example.test/old", "Alter Titel", "Alte GmbH",
            "Köln", "Volltext", LocalDate.of(2026, 9, 1), true, EARLIER, EARLIER);

    @Test
    void refreshedWithTakesTheFieldsOfTheSearchResult() {
        JobPosting found = new JobPosting("a", "https://example.test/new", "Neuer Titel", "Neue GmbH", "Bonn", null,
                LocalDate.of(2026, 9, 2), false, LATER, null);

        JobPosting refreshed = saved.refreshedWith(found);

        assertThat(refreshed.id()).isEqualTo(5L);
        assertThat(refreshed.sourceConfig()).isSameAs(CONFIG);
        assertThat(refreshed.url()).isEqualTo("https://example.test/new");
        assertThat(refreshed.title()).isEqualTo("Neuer Titel");
        assertThat(refreshed.company()).isEqualTo("Neue GmbH");
        assertThat(refreshed.location()).isEqualTo("Bonn");
        assertThat(refreshed.publishedAt()).isEqualTo(LocalDate.of(2026, 9, 2));
        assertThat(refreshed.lastSeenAt()).isEqualTo(LATER);
        assertThat(refreshed.goneAt()).isNull();
    }

    @Test
    void refreshedWithKeepsTheLoadedDescriptionAndTheZeitarbeitTag() {
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null);

        JobPosting refreshed = saved.refreshedWith(found);

        assertThat(refreshed.description()).isEqualTo("Volltext");
        assertThat(refreshed.isTemporaryAgencyWork()).isTrue();
    }

    @Test
    void refreshedWithTakesTheDescriptionOfTheResultWhenItHasOne() {
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", "Neuer Text", null, false, LATER, null);

        JobPosting refreshed = saved.refreshedWith(found);

        assertThat(refreshed.description()).isEqualTo("Neuer Text");
        assertThat(refreshed.isTemporaryAgencyWork()).isFalse();
    }

    @Test
    void refreshedWithKeepsTheChangedAtOfTheHeldDescription() {
        JobPosting heldText = saved.withChangedAt(EARLIER);
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null).withChangedAt(LATER);

        assertThat(heldText.refreshedWith(found).changedAt()).isEqualTo(EARLIER);
    }

    @Test
    void refreshedWithTakesTheChangedAtOfTheResultWhenItBringsTheDescription() {
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", "Neuer Text", null, false, LATER, null).withChangedAt(LATER);

        assertThat(saved.withChangedAt(EARLIER).refreshedWith(found).changedAt()).isEqualTo(LATER);
    }

    @Test
    void theDescriptionIsOutdatedWhenTheResultIsNewer() {
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null).withChangedAt(LATER);

        assertThat(saved.withChangedAt(EARLIER).isDescriptionOutdatedBy(found)).isTrue();
    }

    @Test
    void theDescriptionIsNotOutdatedWhenNoChangedAtWasStored() {
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null).withChangedAt(LATER);

        assertThat(saved.isDescriptionOutdatedBy(found)).isFalse();
    }

    @Test
    void theDescriptionIsNotOutdatedWhenTheResultIsNotNewer() {
        JobPosting same = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null).withChangedAt(EARLIER);
        JobPosting withoutChangedAt = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null);

        assertThat(saved.withChangedAt(EARLIER).isDescriptionOutdatedBy(same)).isFalse();
        assertThat(saved.withChangedAt(LATER).isDescriptionOutdatedBy(same)).isFalse();
        assertThat(saved.withChangedAt(EARLIER).isDescriptionOutdatedBy(withoutChangedAt)).isFalse();
    }

    @Test
    void aPostingWithoutDescriptionIsNeverOutdated() {
        JobPosting withoutText = saved.withDetails(null, false, null);
        JobPosting found = new JobPosting("a", "u", "t", "c", "l", null, null, false, LATER, null).withChangedAt(LATER);

        assertThat(withoutText.isDescriptionOutdatedBy(found)).isFalse();
    }

    @Test
    void lastSeenAtAndGoneAtChangeOnlyThemselves() {
        assertThat(saved.withLastSeenAt(LATER).lastSeenAt()).isEqualTo(LATER);
        assertThat(saved.withLastSeenAt(LATER).goneAt()).isEqualTo(EARLIER);
        assertThat(saved.withGoneAt(null).goneAt()).isNull();
        assertThat(saved.withGoneAt(null).lastSeenAt()).isEqualTo(EARLIER);
    }
}
