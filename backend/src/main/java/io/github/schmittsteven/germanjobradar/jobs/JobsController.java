package io.github.schmittsteven.germanjobradar.jobs;

import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.web.InvalidRequestException;
import io.github.schmittsteven.germanjobradar.web.NotFoundException;

@RestController
public class JobsController {

    private final JobRepository jobRepository;
    private final JobOpener jobOpener;

    public JobsController(JobRepository jobRepository, JobOpener jobOpener) {
        this.jobRepository = jobRepository;
        this.jobOpener = jobOpener;
    }

    // Page and size come from Pageable (defaults 0 and 50). No fitLevel until milestone 3.
    @GetMapping("/api/jobs")
    public Page<JobSummaryResponse> getJobs(
        @RequestParam(defaultValue = "ALL") JobView view,
        @RequestParam(required = false) @Nullable String query,
        @RequestParam(required = false) @Nullable String company,
        @RequestParam(required = false) @Nullable String location,
        @RequestParam(defaultValue = "") List<SourceType> source,
        @RequestParam(defaultValue = "DATE") JobSorting sort,
        Pageable pageable
    ) {
        if (sort != JobSorting.DATE) {
            throw new InvalidRequestException("Sorting " + sort + " is not supported yet.");
        }
        return jobRepository.findSummaries(new JobFilter(view, query, company, location, source), pageable);
    }

    @GetMapping("/api/jobs/location-and-company-values")
    public LocationAndCompanyValuesResponse getLocationAndCompanyValues(@RequestParam(defaultValue = "ALL") JobView view) {
        return jobRepository.findLocationAndCompanyValues(view);
    }

    @GetMapping("/api/jobs/{id}")
    public JobDetailResponse getJob(@PathVariable long id) {
        Job job = findJob(id);
        return JobDetailResponse.from(job, jobRepository.isNew(id));
    }

    @PostMapping("/api/jobs/{id}/open")
    public JobDetailResponse openJob(@PathVariable long id) {
        OpenedJob opened = jobOpener.open(findJob(id));
        return JobDetailResponse.from(opened.job(), jobRepository.isNew(id), opened.descriptionError());
    }

    @PatchMapping("/api/jobs/{id}")
    public JobSummaryResponse updateJob(@PathVariable long id, @RequestBody JobUpdateRequest request) {
        Job job = findJob(id);
        if (request.status() != null) {
            job.setStatus(request.status());
        }
        if (request.reaction() != null) {
            job.setReaction(request.reaction());
        }
        jobRepository.update(job);
        return JobSummaryResponse.from(job, jobRepository.isNew(id));
    }

    // Milestone 2.
    @DeleteMapping("/api/jobs")
    public void deleteAllJobs() {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED);
    }

    private Job findJob(long id) {
        return jobRepository.findById(id).orElseThrow(() -> new NotFoundException("Job " + id + " does not exist"));
    }
}
