package io.github.schmittsteven.germanjobradar.jobs;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

public record JobSummaryResponse(
    long id,
    String title,
    String company,
    String location,
    List<SourceType> sources,
    @Nullable LocalDate publishedAt,
    JobStatus status,
    Reaction reaction,
    boolean isNew,
    boolean isSeen,
    boolean isOnline,
    boolean isTemporaryAgencyWork) {

    /** {@code isNew} depends on the latest run, so the caller passes it in. */
    public static JobSummaryResponse from(Job job, boolean isNew) {
        JobPosting mainPosting = job.getMainPosting();
        List<SourceType> sources = job.getPostings().stream()
                .map(posting -> Objects.requireNonNull(posting.sourceConfig()).getType())
                .distinct()
                .toList();
        return new JobSummaryResponse(
                Objects.requireNonNull(job.getId()),
                mainPosting.title(),
                mainPosting.company(),
                mainPosting.location(),
                sources,
                mainPosting.publishedAt(),
                job.getStatus(),
                job.getReaction(),
                isNew,
                job.getOpenedAt() != null,
                !job.isOffline(),
                job.getPostings().stream().anyMatch(JobPosting::isTemporaryAgencyWork));
    }
}
