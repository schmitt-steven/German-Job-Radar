package io.github.schmittsteven.germanjobradar.status;

import java.util.Map;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.jobs.JobView;
import io.github.schmittsteven.germanjobradar.runs.RunResponse;
import io.github.schmittsteven.germanjobradar.runs.SearchBlockedReason;

public record StatusResponse(Search search, Map<JobView, Long> counts) {

    /** {@code run} is the latest run, null before the first search. */
    public record Search(@Nullable SearchBlockedReason blockedReason, @Nullable RunResponse run) {
    }
}
