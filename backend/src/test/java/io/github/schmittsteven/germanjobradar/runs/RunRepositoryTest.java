package io.github.schmittsteven.germanjobradar.runs;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.persistence.RepositoryTest;

@Import({ RunRepository.class, SourceConfigRepository.class })
class RunRepositoryTest extends RepositoryTest {

    private static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MILLIS);

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
    void insertSavesARunningRun() {
        Run run = Run.start(NOW, true, 1);

        runs.insert(run);

        Run loaded = runs.findById(run.getId()).orElseThrow();
        assertThat(loaded.getStartedAt()).isEqualTo(NOW);
        assertThat(loaded.getFinishedAt()).isNull();
        assertThat(loaded.getOverallStatus()).isEqualTo(RunStatus.RUNNING);
        assertThat(loaded.getNewJobCount()).isZero();
        assertThat(loaded.isInitialSearch()).isTrue();
        assertThat(loaded.getSourceCount()).isEqualTo(1);
        assertThat(loaded.getSourceResults()).isEmpty();
    }

    @Test
    void finishSavesTheEndStateAndTheSourceResults() {
        Run run = Run.start(NOW, false, 1);
        runs.insert(run);

        run.finish(NOW.plusSeconds(30), RunStatus.PARTIAL, 12, List.of(
                new RunSourceResult(arbeitsagentur, 243, null),
                new RunSourceResult(arbeitsagentur, 0, "Timeout")));
        runs.finish(run);

        Run loaded = runs.findById(run.getId()).orElseThrow();
        assertThat(loaded.getFinishedAt()).isEqualTo(NOW.plusSeconds(30));
        assertThat(loaded.getOverallStatus()).isEqualTo(RunStatus.PARTIAL);
        assertThat(loaded.getNewJobCount()).isEqualTo(12);
        assertThat(loaded.getSourceResults()).extracting(RunSourceResult::rawCount).containsExactly(243, 0);
        assertThat(loaded.getSourceResults()).extracting(RunSourceResult::error).containsExactly(null, "Timeout");
        assertThat(loaded.getSourceResults().getFirst().sourceConfig().getId()).isEqualTo(arbeitsagentur.getId());
        assertThat(loaded.getCheckedJobCount()).isEqualTo(243);
        assertThat(loaded.getFinishedSourceCount()).isEqualTo(2);
        assertThat(loaded.getFailedSourceCount()).isEqualTo(1);
    }

    @Test
    void findPageReturnsTheNewestRunsFirstWithTheTotal() {
        for (int i = 0; i < 3; i++) {
            runs.insert(Run.start(NOW.plusSeconds(i), false, 1));
        }

        Page<Run> secondPage = runs.findPage(PageRequest.of(1, 2));

        assertThat(secondPage.getTotalElements()).isEqualTo(3);
        assertThat(secondPage.getTotalPages()).isEqualTo(2);
        assertThat(secondPage.getContent()).extracting(Run::getStartedAt).containsExactly(NOW);
        assertThat(runs.findPage(PageRequest.of(0, 2)).getContent())
                .extracting(Run::getStartedAt).containsExactly(NOW.plusSeconds(2), NOW.plusSeconds(1));
    }

    @Test
    void aCanceledRunHasNoSourceResults() {
        Run run = Run.start(NOW, false, 1);
        runs.insert(run);

        run.finish(NOW.plusSeconds(2), RunStatus.CANCELED, 0, List.of());
        runs.finish(run);

        Run loaded = runs.findById(run.getId()).orElseThrow();
        assertThat(loaded.getOverallStatus()).isEqualTo(RunStatus.CANCELED);
        assertThat(loaded.getSourceResults()).isEmpty();
    }

    @Test
    void findLatestReturnsTheNewestRunsFirst() {
        for (int i = 0; i < 3; i++) {
            runs.insert(Run.start(NOW.plusSeconds(i), false, 1));
        }

        List<Run> latest = runs.findLatest(2);

        assertThat(latest).extracting(Run::getStartedAt).containsExactly(NOW.plusSeconds(2), NOW.plusSeconds(1));
    }

    @Test
    void findLatestAttachesTheResultsToTheirOwnRun() {
        Run first = Run.start(NOW, true, 1);
        runs.insert(first);
        first.finish(NOW.plusSeconds(1), RunStatus.SUCCESS, 5, List.of(new RunSourceResult(arbeitsagentur, 5, null)));
        runs.finish(first);
        Run second = Run.start(NOW.plusSeconds(10), false, 1);
        runs.insert(second);

        List<Run> latest = runs.findLatest(10);

        assertThat(latest.get(0).getSourceResults()).isEmpty();
        assertThat(latest.get(1).getSourceResults()).hasSize(1);
    }

    @Test
    void failRunningEndsOnlyTheRunsStillRunning() {
        Run running = Run.start(NOW, false, 1);
        runs.insert(running);
        Run done = Run.start(NOW, false, 1);
        runs.insert(done);
        done.finish(NOW.plusSeconds(1), RunStatus.SUCCESS, 2, List.of());
        runs.finish(done);

        int count = runs.failRunning(NOW.plusSeconds(60));

        assertThat(count).isEqualTo(1);
        Run failed = runs.findById(running.getId()).orElseThrow();
        assertThat(failed.getOverallStatus()).isEqualTo(RunStatus.FAILED);
        assertThat(failed.getFinishedAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(runs.findById(done.getId()).orElseThrow().getOverallStatus()).isEqualTo(RunStatus.SUCCESS);
    }

    @Test
    void findByIdOfAnUnknownRunIsEmpty() {
        assertThat(runs.findById(-1)).isEmpty();
    }
}
