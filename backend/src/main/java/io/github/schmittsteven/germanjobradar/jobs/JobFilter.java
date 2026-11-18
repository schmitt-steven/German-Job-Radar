package io.github.schmittsteven.germanjobradar.jobs;

import java.util.List;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

/** The filters of {@code GET /api/jobs}. Blank text and an empty source list mean no filter. */
public record JobFilter(
    JobView view,
    @Nullable String query,
    @Nullable String company,
    @Nullable String location,
    List<SourceType> sources) {
}
