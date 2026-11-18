package io.github.schmittsteven.germanjobradar.job_sources;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;

import io.github.schmittsteven.germanjobradar.jobs.JobPosting;

@Component
public class JobDescriptionLoader {

    private static final Duration MIN_PAUSE_BETWEEN_CALLS = Duration.ofMillis(500);

    private final Map<SourceType, JobSource> sourcesByType = new EnumMap<>(SourceType.class);
    private final Duration pauseBetweenCalls;

    @Autowired
    public JobDescriptionLoader(List<JobSource> sources) {
        this(sources, MIN_PAUSE_BETWEEN_CALLS);
    }

    public JobDescriptionLoader(List<JobSource> sources, Duration pauseBetweenCalls) {
        for (JobSource source : sources) {
            sourcesByType.put(source.type(), source);
        }
        this.pauseBetweenCalls = pauseBetweenCalls;
    }

    // Postings come newest first. A 429 or 403 stops the calls to that source for this call only.
    public void loadAll(List<JobPosting> postings, BooleanSupplier isCanceled, Consumer<JobPosting> onLoaded) {
        Set<SourceType> stoppedSources = EnumSet.noneOf(SourceType.class);
        Map<SourceType, Instant> lastCallAt = new EnumMap<>(SourceType.class);

        for (JobPosting posting : postings) {
            if (isCanceled.getAsBoolean()) {
                return;
            }
            SourceType type = posting.sourceConfig().getType();
            if (stoppedSources.contains(type)) {
                continue;
            }
            if (!waitForTurn(lastCallAt.get(type))) {
                return;
            }
            lastCallAt.put(type, Instant.now());
            try {
                onLoaded.accept(sourcesByType.get(type).loadDetails(posting));
            } catch (HttpClientErrorException e) {
                int status = e.getStatusCode().value();
                if (status == 429 || status == 403) {
                    stoppedSources.add(type);
                }
            } catch (RestClientException e) {
                // The description stays null, the next run tries again.
            }
        }
    }

    /** One posting with its details, for a job the user opened. Throws the source's {@link RestClientException}. */
    public JobPosting load(JobPosting posting) {
        return sourcesByType.get(posting.sourceConfig().getType()).loadDetails(posting);
    }

    // False if the thread was interrupted, which is how a cancel stops a sleeping run.
    private boolean waitForTurn(Instant lastCallAt) {
        if (lastCallAt == null) {
            return true;
        }
        Duration remaining = pauseBetweenCalls.minus(Duration.between(lastCallAt, Instant.now()));
        if (remaining.isNegative() || remaining.isZero()) {
            return true;
        }
        try {
            Thread.sleep(remaining);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
