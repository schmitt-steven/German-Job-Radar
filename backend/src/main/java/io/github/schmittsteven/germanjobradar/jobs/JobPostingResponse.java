package io.github.schmittsteven.germanjobradar.jobs;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

public record JobPostingResponse(
    long id,
    SourceType source,
    String url,
    String title,
    @Nullable String company,
    @Nullable String location,
    @Nullable String description,
    @Nullable LocalDate publishedAt,
    boolean isTemporaryAgencyWork,
    Instant lastSeenAt,
    @Nullable Instant goneAt,
    boolean isMain) {

    public static JobPostingResponse from(JobPosting posting, boolean isMain) {
        return new JobPostingResponse(
                Objects.requireNonNull(posting.id()),
                Objects.requireNonNull(posting.sourceConfig()).getType(),
                posting.url(),
                posting.title(),
                posting.company(),
                posting.location(),
                posting.description(),
                posting.publishedAt(),
                posting.isTemporaryAgencyWork(),
                posting.lastSeenAt(),
                posting.goneAt(),
                isMain);
    }
}
