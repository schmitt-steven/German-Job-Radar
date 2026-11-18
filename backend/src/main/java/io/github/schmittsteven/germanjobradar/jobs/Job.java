package io.github.schmittsteven.germanjobradar.jobs;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.jspecify.annotations.Nullable;

public class Job {
    @Nullable
    private Long id;

    // Moment the job was first found
    private final Instant foundAt;

    @Nullable
    private Instant openedAt;

    private Reaction reaction;
    private JobStatus status;
    private final List<JobPosting> postings;

    public Job(Instant foundAt, JobPosting firstPosting) {
        this(null, foundAt, null, Reaction.NONE, JobStatus.NOT_APPLIED, List.of(firstPosting));
    }

    public Job(@Nullable Long id, Instant foundAt, @Nullable Instant openedAt, Reaction reaction, JobStatus status,
            List<JobPosting> postings) {
        if (postings.isEmpty()) {
            throw new IllegalArgumentException("A job needs at least one posting");
        }
        this.id = id;
        this.foundAt = foundAt;
        this.openedAt = openedAt;
        this.reaction = reaction;
        this.status = status;
        this.postings = new ArrayList<>(postings);
    }

    @Nullable
    public Long getId() {
        return id;
    }

    void setId(long id) {
        this.id = id;
    }

    public Instant getFoundAt() {
        return foundAt;
    }

    @Nullable
    public Instant getOpenedAt() {
        return openedAt;
    }

    public Reaction getReaction() {
        return reaction;
    }

    public JobStatus getStatus() {
        return status;
    }

    public List<JobPosting> getPostings() {
        return List.copyOf(postings);
    }

    /** The posting with the longest description, the earliest added on a tie. */
    public JobPosting getMainPosting() {
        return postings.stream()
                .max(Comparator.comparingInt(Job::descriptionLength))
                .orElseThrow();
    }

    public boolean isOffline() {
        return postings.stream().allMatch(posting -> posting.goneAt() != null);
    }

    public void addPosting(JobPosting posting) {
        postings.add(posting);
    }

    void setPostings(List<JobPosting> saved) {
        postings.clear();
        postings.addAll(saved);
    }

    public void replacePosting(JobPosting posting) {
        int index = indexOfPosting(posting);
        postings.set(index, posting);
    }

    public void markOpened(Instant now) {
        if (openedAt == null) {
            openedAt = now;
        }
    }

    public void setReaction(Reaction reaction) {
        this.reaction = reaction;
    }

    public void setStatus(JobStatus status) {
        this.status = status;
    }

    private int indexOfPosting(JobPosting posting) {
        if (posting.id() != null) {
            for (int i = 0; i < postings.size(); i++) {
                if (posting.id().equals(postings.get(i).id())) {
                    return i;
                }
            }
        }
        throw new IllegalArgumentException(
                "Posting " + posting.externalId() + " is not a saved posting of this job");
    }

    private static int descriptionLength(JobPosting posting) {
        String description = posting.description();
        return description == null ? 0 : description.length();
    }
}
