package io.github.schmittsteven.germanjobradar.status;

import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.schmittsteven.germanjobradar.jobs.JobRepository;
import io.github.schmittsteven.germanjobradar.runs.JobSearchService;
import io.github.schmittsteven.germanjobradar.runs.RunProgress;
import io.github.schmittsteven.germanjobradar.runs.RunRepository;
import io.github.schmittsteven.germanjobradar.runs.RunResponse;

/** Reads every part of the status in one transaction, so the parts never contradict each other. */
@Service
public class StatusService {

    private final JobSearchService jobSearchService;
    private final RunRepository runRepository;
    private final JobRepository jobRepository;

    public StatusService(JobSearchService jobSearchService, RunRepository runRepository, JobRepository jobRepository) {
        this.jobSearchService = jobSearchService;
        this.runRepository = runRepository;
        this.jobRepository = jobRepository;
    }

    @Transactional(readOnly = true)
    public StatusResponse getStatus() {
        StatusResponse.Search search = new StatusResponse.Search(
                this.jobSearchService.findBlockedReason().orElse(null),
                this.findLatestRun());
        return new StatusResponse(search, this.jobRepository.countByView());
    }

    private RunResponse findLatestRun() {
        return this.runRepository.findLatest()
                .map(run -> {
                    RunProgress progress = jobSearchService.findProgress(Objects.requireNonNull(run.getId())).orElse(null);
                    return RunResponse.from(run, progress);
                })
                .orElse(null);
    }
}
