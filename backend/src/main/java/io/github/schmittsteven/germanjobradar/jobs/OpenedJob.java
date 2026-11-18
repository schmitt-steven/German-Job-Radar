package io.github.schmittsteven.germanjobradar.jobs;

import org.jspecify.annotations.Nullable;

/** A job after opening it. {@code descriptionError} is set if its missing description couldn't be loaded. */
public record OpenedJob(Job job, @Nullable String descriptionError) {
}
