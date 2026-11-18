package io.github.schmittsteven.germanjobradar.jobs;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;

/** The fields of {@link JobSummaryResponse} plus the postings. Triage and assessment follow with the AI milestones. */
public record JobDetailResponse(
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
    boolean isTemporaryAgencyWork,
    @Nullable String descriptionError,
    List<JobPostingResponse> postings) {

    public static JobDetailResponse from(Job job, boolean isNew) {
        return from(job, isNew, null);
    }

    /** {@code descriptionError} is only set by opening the job. */
    public static JobDetailResponse from(Job job, boolean isNew, @Nullable String descriptionError) {
        JobSummaryResponse summary = JobSummaryResponse.from(job, isNew);
        JobPosting mainPosting = job.getMainPosting();
        List<JobPostingResponse> postings = job.getPostings().stream()
                .map(posting -> JobPostingResponse.from(posting, posting == mainPosting))
                .toList();
        return new JobDetailResponse(
                summary.id(),
                summary.title(),
                summary.company(),
                summary.location(),
                summary.sources(),
                summary.publishedAt(),
                summary.status(),
                summary.reaction(),
                summary.isNew(),
                summary.isSeen(),
                summary.isOnline(),
                summary.isTemporaryAgencyWork(),
                descriptionError,
                postings);
    }
}
