package io.github.schmittsteven.germanjobradar.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.github.schmittsteven.germanjobradar.jobs.JobRepository;
import io.github.schmittsteven.germanjobradar.jobs.JobView;
import io.github.schmittsteven.germanjobradar.runs.JobSearchService;
import io.github.schmittsteven.germanjobradar.runs.Run;
import io.github.schmittsteven.germanjobradar.runs.RunPhase;
import io.github.schmittsteven.germanjobradar.runs.RunProgress;
import io.github.schmittsteven.germanjobradar.runs.RunRepository;
import io.github.schmittsteven.germanjobradar.runs.RunStatus;
import io.github.schmittsteven.germanjobradar.runs.SearchBlockedReason;

class StatusServiceTest {

    private static final Instant STARTED_AT = Instant.parse("2026-10-17T08:30:00Z");

    private final JobSearchService jobSearchService = mock(JobSearchService.class);
    private final RunRepository runRepository = mock(RunRepository.class);
    private final JobRepository jobRepository = mock(JobRepository.class);
    private final StatusService statusService = new StatusService(jobSearchService, runRepository, jobRepository);

    @BeforeEach
    void stubNoBlockNoRunNoJobs() {
        when(jobSearchService.findBlockedReason()).thenReturn(Optional.empty());
        when(runRepository.findLatest()).thenReturn(Optional.empty());
        when(jobRepository.countByView()).thenReturn(Map.of());
    }

    @Test
    void beforeTheFirstSearchThereIsNoRun() {
        StatusResponse status = statusService.getStatus();

        assertThat(status.search().blockedReason()).isNull();
        assertThat(status.search().run()).isNull();
    }

    @Test
    void reportsTheBlockedReason() {
        when(jobSearchService.findBlockedReason()).thenReturn(Optional.of(SearchBlockedReason.NO_LOCATION));

        assertThat(statusService.getStatus().search().blockedReason()).isEqualTo(SearchBlockedReason.NO_LOCATION);
    }

    @Test
    void reportsTheLatestRunWithItsProgressWhileItRuns() {
        Run run = new Run(7L, STARTED_AT, null, RunStatus.RUNNING, 0, false, 1, List.of());
        when(runRepository.findLatest()).thenReturn(Optional.of(run));
        when(jobSearchService.findProgress(7)).thenReturn(Optional.of(new RunProgress(RunPhase.ANALYZING, 140, 1, 0, 380)));

        var latest = statusService.getStatus().search().run();

        assertThat(latest.id()).isEqualTo(7);
        assertThat(latest.phase()).isEqualTo(RunPhase.ANALYZING);
        assertThat(latest.remainingCount()).isEqualTo(140);
        assertThat(latest.checkedJobCount()).isEqualTo(380);
    }

    @Test
    void aFinishedRunHasNoPhase() {
        Run run = new Run(7L, STARTED_AT, STARTED_AT.plusSeconds(60), RunStatus.SUCCESS, 3, false, 1, List.of());
        when(runRepository.findLatest()).thenReturn(Optional.of(run));
        when(jobSearchService.findProgress(7)).thenReturn(Optional.empty());

        var latest = statusService.getStatus().search().run();

        assertThat(latest.overallStatus()).isEqualTo(RunStatus.SUCCESS);
        assertThat(latest.phase()).isNull();
        assertThat(latest.newJobCount()).isEqualTo(3);
    }

    @Test
    void passesOnTheCountsPerView() {
        when(jobRepository.countByView()).thenReturn(Map.of(JobView.ALL, 230L, JobView.NEW, 12L));

        assertThat(statusService.getStatus().counts()).containsOnly(
                Map.entry(JobView.ALL, 230L), Map.entry(JobView.NEW, 12L));
    }
}
