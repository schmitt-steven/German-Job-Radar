package io.github.schmittsteven.germanjobradar.runs;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;

public record RunSourceResult(@Nullable Long id, SourceConfig sourceConfig, int rawCount, @Nullable String error) {

    public RunSourceResult(SourceConfig sourceConfig, int rawCount, @Nullable String error) {
        this(null, sourceConfig, rawCount, error);
    }

    public RunSourceResult withId(long id) {
        return new RunSourceResult(id, sourceConfig, rawCount, error);
    }
}
