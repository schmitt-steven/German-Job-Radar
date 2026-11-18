package io.github.schmittsteven.germanjobradar.runs;

import org.jspecify.annotations.Nullable;

/** What a running run knows only in memory. {@code remainingCount} is null while fetching. */
public record RunProgress(
    RunPhase phase,
    @Nullable Integer remainingCount,
    int finishedSourceCount,
    int failedSourceCount,
    int checkedJobCount) {

    public RunProgress analyzing(int remainingCount) {
        return new RunProgress(RunPhase.ANALYZING, remainingCount, finishedSourceCount, failedSourceCount, checkedJobCount);
    }
}
