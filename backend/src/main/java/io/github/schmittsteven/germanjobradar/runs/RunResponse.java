package io.github.schmittsteven.germanjobradar.runs;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

public record RunResponse(
    long id,
    Instant startedAt,
    @Nullable Instant finishedAt,
    RunStatus overallStatus,
    @Nullable RunPhase phase,
    @Nullable Integer remainingCount,
    int newJobCount,
    boolean isInitialSearch,
    int sourceCount,
    int finishedSourceCount,
    int failedSourceCount,
    int checkedJobCount,
    List<SourceResultResponse> sourceResults) {

    /** {@code progress} is the in-memory state of a running run, null for a finished one. */
    public static RunResponse from(Run run, @Nullable RunProgress progress) {
        List<SourceResultResponse> sourceResults = run.getSourceResults().stream()
                .map(SourceResultResponse::from)
                .toList();
        if (progress != null) {
            return new RunResponse(
                    Objects.requireNonNull(run.getId()), run.getStartedAt(), run.getFinishedAt(), run.getOverallStatus(),
                    progress.phase(), progress.remainingCount(), run.getNewJobCount(), run.isInitialSearch(),
                    run.getSourceCount(), progress.finishedSourceCount(), progress.failedSourceCount(),
                    progress.checkedJobCount(), sourceResults);
        }
        return new RunResponse(
                Objects.requireNonNull(run.getId()), run.getStartedAt(), run.getFinishedAt(), run.getOverallStatus(),
                null, null, run.getNewJobCount(), run.isInitialSearch(),
                run.getSourceCount(), run.getFinishedSourceCount(), run.getFailedSourceCount(),
                run.getCheckedJobCount(), sourceResults);
    }

    public record SourceResultResponse(
        long sourceConfigId,
        SourceType sourceType,
        @Nullable String companySlug,
        int rawCount,
        @Nullable String error) {

        static SourceResultResponse from(RunSourceResult result) {
            return new SourceResultResponse(
                    Objects.requireNonNull(result.sourceConfig().getId()),
                    result.sourceConfig().getType(),
                    result.sourceConfig().getCompanySlug(),
                    result.rawCount(),
                    result.error());
        }
    }
}
