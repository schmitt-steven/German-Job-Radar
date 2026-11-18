package io.github.schmittsteven.germanjobradar.jobs;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;

import io.github.schmittsteven.germanjobradar.job_sources.JobDescriptionLoader;

/** Opening a job. Queuing it for scoring follows in milestone 3. */
@Service
public class JobOpener {

    private final JobRepository jobRepository;
    private final JobDescriptionLoader descriptionLoader;
    private final Clock clock;

    @Autowired
    public JobOpener(JobRepository jobRepository, JobDescriptionLoader descriptionLoader) {
        this(jobRepository, descriptionLoader, Clock.systemUTC());
    }

    JobOpener(JobRepository jobRepository, JobDescriptionLoader descriptionLoader, Clock clock) {
        this.jobRepository = jobRepository;
        this.descriptionLoader = descriptionLoader;
        this.clock = clock;
    }

    /** Marks the job seen and loads the main posting's description if it has none. Safe to call on every selection. */
    public OpenedJob open(Job job) {
        // Saved before the description loads, so the counts drop right away even with a slow source.
        job.markOpened(clock.instant());
        jobRepository.update(job);

        JobPosting mainPosting = job.getMainPosting();
        if (mainPosting.description() != null) {
            return new OpenedJob(job, null);
        }
        // Loaded outside a transaction, so a slow source doesn't hold the database.
        try {
            JobPosting loaded = this.descriptionLoader.load(mainPosting);
            jobRepository.updatePosting(job, loaded);
            return new OpenedJob(job, null);
        } catch (RestClientException e) {
            return new OpenedJob(job, e.getMessage());
        }
    }
}
