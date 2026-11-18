package io.github.schmittsteven.germanjobradar.jobs;

import java.time.Instant;
import java.time.LocalDate;

import org.jspecify.annotations.Nullable;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;

public record JobPosting(
        @Nullable Long id,
        @Nullable SourceConfig sourceConfig,
        String externalId,
        String url,
        String title,
        String company,
        String location,
        String description,
        LocalDate publishedAt,
        boolean isTemporaryAgencyWork,
        Instant lastSeenAt,
        Instant goneAt,
        @Nullable Instant changedAt) {

    public JobPosting(@Nullable Long id, @Nullable SourceConfig sourceConfig, String externalId, String url, String title, String company, String location, String description, LocalDate publishedAt, boolean isTemporaryAgencyWork, Instant lastSeenAt, Instant goneAt) {
        this(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, null);
    }

    public JobPosting(String externalId, String url, String title, String company, String location, String description, LocalDate publishedAt, boolean isTemporaryAgencyWork, Instant lastSeenAt, Instant goneAt) {
        this(null, null, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, null);
    }

    public JobPosting withId(long id) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    public JobPosting withDetails(String description, boolean isTemporaryAgencyWork, @Nullable Instant changedAt) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    public JobPosting withChangedAt(@Nullable Instant changedAt) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    public JobPosting withSourceConfig(SourceConfig sourceConfig) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    public JobPosting withLastSeenAt(Instant lastSeenAt) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    public JobPosting withGoneAt(Instant goneAt) {
        return new JobPosting(id, sourceConfig, externalId, url, title, company, location, description, publishedAt, isTemporaryAgencyWork, lastSeenAt, goneAt, changedAt);
    }

    /** This saved posting with the fields of a fresh search result. Keeps a loaded description when the result has none. */
    public JobPosting refreshedWith(JobPosting found) {
        boolean isDescriptionFound = found.description != null;
        return new JobPosting(id, sourceConfig, externalId, found.url, found.title, found.company, found.location,
                isDescriptionFound ? found.description : description, found.publishedAt,
                isDescriptionFound ? found.isTemporaryAgencyWork : isTemporaryAgencyWork, found.lastSeenAt, null,
                isDescriptionFound ? found.changedAt : changedAt);
    }

    /** True if this saved posting holds a description and the search result says the source changed it since. */
    public boolean isDescriptionOutdatedBy(JobPosting found) {
        if (description == null || changedAt == null || found.changedAt == null) {
            return false;
        }
        return found.changedAt.isAfter(changedAt);
    }
}
