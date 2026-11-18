package io.github.schmittsteven.germanjobradar.jobs;

import org.jspecify.annotations.Nullable;

/** The body of {@code PATCH /api/jobs/{id}}. A missing field stays as it is. */
public record JobUpdateRequest(@Nullable JobStatus status, @Nullable Reaction reaction) {
}
