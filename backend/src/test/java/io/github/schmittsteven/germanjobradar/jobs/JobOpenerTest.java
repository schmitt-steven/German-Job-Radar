package io.github.schmittsteven.germanjobradar.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;

import io.github.schmittsteven.germanjobradar.job_sources.JobDescriptionLoader;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.persistence.RepositoryTest;

@Import({ JobRepository.class, SourceConfigRepository.class })
class JobOpenerTest extends RepositoryTest {

    private static final Instant FOUND_AT = Instant.parse("2026-10-17T08:30:00Z");
    private static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    @Autowired
    private JobRepository jobs;

    @Autowired
    private SourceConfigRepository sourceConfigs;

    private final JobDescriptionLoader loader = mock(JobDescriptionLoader.class);
    private JobOpener opener;
    private SourceConfig arbeitsagentur;

    @BeforeEach
    void setUp() {
        arbeitsagentur = sourceConfigs.findAll().getFirst();
        opener = new JobOpener(jobs, loader, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void marksTheJobSeenWithoutLoadingAnExistingDescription() {
        Job job = savedJob("Beschreibung");

        OpenedJob opened = opener.open(job);

        assertThat(opened.job().getOpenedAt()).isEqualTo(NOW);
        assertThat(opened.descriptionError()).isNull();
        assertThat(jobs.findById(job.getId()).orElseThrow().getOpenedAt()).isEqualTo(NOW);
        verify(loader, never()).load(any());
    }

    @Test
    void keepsTheFirstOpenedAt() {
        Instant firstOpenedAt = NOW.minus(1, ChronoUnit.DAYS);
        Job job = savedJob("Beschreibung");
        job.markOpened(firstOpenedAt);
        jobs.update(job);

        opener.open(jobs.findById(job.getId()).orElseThrow());

        assertThat(jobs.findById(job.getId()).orElseThrow().getOpenedAt()).isEqualTo(firstOpenedAt);
    }

    @Test
    void loadsAndSavesAMissingDescription() {
        Job job = savedJob(null);
        when(loader.load(any())).thenAnswer(call -> call.<JobPosting>getArgument(0).withDetails("Geladen", true, null));

        OpenedJob opened = opener.open(job);

        assertThat(opened.job().getMainPosting().description()).isEqualTo("Geladen");
        assertThat(opened.descriptionError()).isNull();
        JobPosting saved = jobs.findById(job.getId()).orElseThrow().getMainPosting();
        assertThat(saved.description()).isEqualTo("Geladen");
        assertThat(saved.isTemporaryAgencyWork()).isTrue();
    }

    @Test
    void savesTheJobSeenBeforeLoadingTheDescription() {
        Job job = savedJob(null);
        when(loader.load(any())).thenAnswer(call -> {
            assertThat(jobs.findById(job.getId()).orElseThrow().getOpenedAt()).isEqualTo(NOW);
            return call.<JobPosting>getArgument(0).withDetails("Geladen", false, null);
        });

        opener.open(job);

        verify(loader).load(any());
    }

    @Test
    void aFailedLoadStillMarksTheJobSeenAndReturnsTheError() {
        Job job = savedJob(null);
        when(loader.load(any()))
                .thenThrow(HttpServerErrorException.create(HttpStatus.SERVICE_UNAVAILABLE, "", null, null, null));

        OpenedJob opened = opener.open(job);

        assertThat(opened.descriptionError()).contains("503");
        Job saved = jobs.findById(job.getId()).orElseThrow();
        assertThat(saved.getOpenedAt()).isEqualTo(NOW);
        assertThat(saved.getMainPosting().description()).isNull();
    }

    private Job savedJob(String description) {
        Job job = new Job(FOUND_AT, new JobPosting(null, arbeitsagentur, "10000-1-S", "https://example.test/1",
                "Java Entwickler", "ACME", "Köln", description, null, false, FOUND_AT, null));
        jobs.insert(job);
        return job;
    }
}
