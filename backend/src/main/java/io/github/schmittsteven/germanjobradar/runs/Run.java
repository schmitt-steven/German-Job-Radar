package io.github.schmittsteven.germanjobradar.runs;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.jspecify.annotations.Nullable;

public class Run {
    @Nullable
    private Long id;
    private final Instant startedAt;

    @Nullable
    private Instant finishedAt;
    private RunStatus overallStatus;
    private int newJobCount;
    private final boolean isInitialSearch;
    private final int sourceCount;
    private final List<RunSourceResult> sourceResults;

    public Run(@Nullable Long id, Instant startedAt, @Nullable Instant finishedAt, RunStatus overallStatus, int newJobCount, boolean isInitialSearch, int sourceCount, List<RunSourceResult> sourceResults) {
        this.id = id;
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.overallStatus = overallStatus;
        this.newJobCount = newJobCount;
        this.isInitialSearch = isInitialSearch;
        this.sourceCount = sourceCount;
        this.sourceResults = new ArrayList<>(sourceResults);
    }

    public static Run start(Instant startedAt, boolean isInitialSearch, int sourceCount) {
        return new Run(null, startedAt, null, RunStatus.RUNNING, 0, isInitialSearch, sourceCount, List.of());
    }

    public void finish(Instant finishedAt, RunStatus overallStatus, int newJobCount, List<RunSourceResult> sourceResults) {
        this.finishedAt = finishedAt;
        this.overallStatus = overallStatus;
        this.newJobCount = newJobCount;
        setSourceResults(sourceResults);
    }

    void setSourceResults(List<RunSourceResult> saved) {
        this.sourceResults.clear();
        this.sourceResults.addAll(saved);
    }

    @Nullable
    public Long getId() {
        return id;
    }

    void setId(long id) {
        this.id = id;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    @Nullable
    public Instant getFinishedAt() {
        return finishedAt;
    }

    public RunStatus getOverallStatus() {
        return overallStatus;
    }

    public int getNewJobCount() {
        return newJobCount;
    }

    public boolean isInitialSearch() {
        return isInitialSearch;
    }

    public int getSourceCount() {
        return sourceCount;
    }

    public List<RunSourceResult> getSourceResults() {
        return List.copyOf(sourceResults);
    }

    public int getFinishedSourceCount() {
        return sourceResults.size();
    }

    public int getFailedSourceCount() {
        return (int) sourceResults.stream().filter(result -> result.error() != null).count();
    }

    public int getCheckedJobCount() {
        return sourceResults.stream().mapToInt(RunSourceResult::rawCount).sum();
    }
}
