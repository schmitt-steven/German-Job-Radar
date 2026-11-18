package io.github.schmittsteven.germanjobradar.job_sources;

import java.util.List;
import java.util.Optional;

import io.github.schmittsteven.germanjobradar.jobs.JobPosting;

public interface JobSource {

    public SourceType type();
    
    public boolean isListSource();

    public boolean isListComplete();

    public List<JobPosting> search(SourceConfig config, SearchCriteria criteria);

    public JobPosting loadDetails(JobPosting posting);

    public Optional<Boolean> isOnline(JobPosting posting);
}
