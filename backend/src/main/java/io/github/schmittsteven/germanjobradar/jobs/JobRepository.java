package io.github.schmittsteven.germanjobradar.jobs;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Collator;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.persistence.SqliteTimestamps;

@Repository
public class JobRepository {

    // Every job with its online and new state, the base of the job list and the counts.
    private static final String JOB_STATE = """
            job_state AS (
                SELECT j.*,
                       EXISTS (SELECT 1 FROM job_posting p WHERE p.job_id = j.id AND p.gone_at IS NULL) AS is_online,
                       j.found_at >= (SELECT started_at FROM run
                                      WHERE new_job_count > 0 AND is_initial_search = 0
                                      ORDER BY started_at DESC, id DESC LIMIT 1) AS is_new
                FROM job j
            )""";

    // m is the main posting: the one with the longest description, the first saved on a tie.
    private static final String FROM_JOBS_WITH_MAIN_POSTING = """
            FROM job_state s
            JOIN job_posting m ON m.id = (SELECT p.id FROM job_posting p WHERE p.job_id = s.id
                                          ORDER BY COALESCE(LENGTH(p.description), 0) DESC, p.id LIMIT 1)
            """;

    private static final Collator GERMAN_ORDER = Collator.getInstance(Locale.GERMAN);

    private final JdbcClient jdbc;
    private final SourceConfigRepository sourceConfigs;

    public JobRepository(JdbcClient jdbc, SourceConfigRepository sourceConfigs) {
        this.jdbc = jdbc;
        this.sourceConfigs = sourceConfigs;
    }

    /** Saves the job with its postings. */
    @Transactional
    public void insert(Job job) {
        long id = jdbc.sql("""
                INSERT INTO job (found_at, opened_at, reaction, status)
                VALUES (:foundAt, :openedAt, :reaction, :status)
                RETURNING id""")
                .param("foundAt", SqliteTimestamps.format(job.getFoundAt()))
                .param("openedAt", SqliteTimestamps.format(job.getOpenedAt()))
                .param("reaction", job.getReaction().name())
                .param("status", job.getStatus().name())
                .query(Long.class)
                .single();
        job.setId(id);
        job.setPostings(job.getPostings().stream().map(posting -> insertPosting(job, posting)).toList());
    }

    /** Saves the job's own fields, not its postings. */
    @Transactional
    public void update(Job job) {
        jdbc.sql("UPDATE job SET opened_at = :openedAt, reaction = :reaction, status = :status WHERE id = :id")
                .param("openedAt", SqliteTimestamps.format(job.getOpenedAt()))
                .param("reaction", job.getReaction().name())
                .param("status", job.getStatus().name())
                .param("id", job.getId())
                .update();
    }

    /** Saves a new posting and adds it to the job. */
    @Transactional
    public void addPosting(Job job, JobPosting posting) {
        job.addPosting(insertPosting(job, posting));
    }

    /** Saves the changed posting and replaces it in the job. */
    @Transactional
    public void updatePosting(Job job, JobPosting posting) {
        job.replacePosting(posting);
        updatePosting(posting);
    }

    /** Saves the changed posting, for callers that don't hold its job. */
    @Transactional
    public void updatePosting(JobPosting posting) {
        jdbc.sql("""
                UPDATE job_posting
                SET url = :url, title = :title, company = :company, location = :location, description = :description,
                    published_at = :publishedAt, is_temporary_agency_work = :isTemporaryAgencyWork,
                    last_seen_at = :lastSeenAt, gone_at = :goneAt, changed_at = :changedAt
                WHERE id = :id""")
                .param("url", posting.url())
                .param("title", posting.title())
                .param("company", posting.company())
                .param("location", posting.location())
                .param("description", posting.description())
                .param("publishedAt", toText(posting.publishedAt()))
                .param("isTemporaryAgencyWork", posting.isTemporaryAgencyWork())
                .param("lastSeenAt", SqliteTimestamps.format(posting.lastSeenAt()))
                .param("goneAt", SqliteTimestamps.format(posting.goneAt()))
                .param("changedAt", SqliteTimestamps.format(posting.changedAt()))
                .param("id", posting.id())
                .update();
    }

    public Optional<Job> findById(long id) {
        Map<Long, SourceConfig> sources = sourceConfigs.findAllById();
        List<JobPosting> postings = jdbc.sql("SELECT * FROM job_posting WHERE job_id = :jobId ORDER BY id")
                .param("jobId", id)
                .query((rs, rowNum) -> mapPosting(rs, sources))
                .list();
        return jdbc.sql("SELECT * FROM job WHERE id = :id")
                .param("id", id)
                .query((rs, rowNum) -> mapJob(rs, postings))
                .optional();
    }

    /** Whether the job was found by the latest run that found any, as in the job list. */
    public boolean isNew(long jobId) {
        return jdbc.sql("WITH " + JOB_STATE + " SELECT COALESCE(is_new, 0) FROM job_state WHERE id = :id")
                .param("id", jobId)
                .query(Boolean.class)
                .optional()
                .orElse(false);
    }

    public Optional<Job> findByPosting(SourceConfig sourceConfig, String externalId) {
        List<Long> jobIds = jdbc.sql(
                "SELECT job_id FROM job_posting WHERE source_config_id = :sourceConfigId AND external_id = :externalId")
                .param("sourceConfigId", sourceConfig.getId())
                .param("externalId", externalId)
                .query(Long.class)
                .list();
        return jobIds.isEmpty() ? Optional.empty() : findById(jobIds.getFirst());
    }

    public boolean isEmpty() {
        return !jdbc.sql("SELECT EXISTS (SELECT 1 FROM job)").query(Boolean.class).single();
    }

    /** The number of jobs per view, with the rules of the job list. {@code SORTED_OUT} is not counted yet. */
    public Map<JobView, Long> countByView() {
        String columns = Arrays.stream(JobView.values())
                .filter(view -> view != JobView.SORTED_OUT)
                .map(view -> "COUNT(*) FILTER (WHERE " + viewCondition(view) + ") AS \"" + view.name() + "\"")
                .collect(Collectors.joining(", "));
        return jdbc.sql("WITH " + JOB_STATE + " SELECT " + columns + " FROM job_state")
                .query(rs -> {
                    Map<JobView, Long> counts = new EnumMap<>(JobView.class);
                    rs.next();
                    for (JobView view : JobView.values()) {
                        if (view != JobView.SORTED_OUT) {
                            counts.put(view, rs.getLong(view.name()));
                        }
                    }
                    return counts;
                });
    }

    /** One page of the job list, newest first. Nothing is sorted out before triage exists, so that view is empty. */
    public Page<JobSummaryResponse> findSummaries(JobFilter filter, Pageable pageable) {
        Map<String, Object> params = new HashMap<>();
        String from = FROM_JOBS_WITH_MAIN_POSTING + " WHERE " + viewCondition(filter.view())
                + filterConditions(filter, params);

        long total = jdbc.sql("WITH " + JOB_STATE + " SELECT COUNT(*) " + from)
                .params(params)
                .query(Long.class)
                .single();
        params.put("limit", pageable.getPageSize());
        params.put("offset", pageable.getOffset());
        List<JobSummaryResponse> summaries = jdbc.sql("WITH " + JOB_STATE + """
                SELECT s.id, s.opened_at, s.reaction, s.status, s.is_online, s.is_new,
                       m.title, m.company, m.location, m.published_at,
                       EXISTS (SELECT 1 FROM job_posting p
                               WHERE p.job_id = s.id AND p.is_temporary_agency_work = 1) AS is_temporary_agency_work,
                       (SELECT group_concat(DISTINCT sc.type) FROM job_posting p
                        JOIN source_config sc ON sc.id = p.source_config_id WHERE p.job_id = s.id) AS sources
                """ + from + """

                ORDER BY COALESCE(m.published_at, SUBSTR(s.found_at, 1, 10)) DESC, s.found_at DESC, s.id DESC
                LIMIT :limit OFFSET :offset""")
                .params(params)
                .query((rs, rowNum) -> mapSummary(rs))
                .list();
        return new PageImpl<>(summaries, pageable, total);
    }

    /** The distinct locations and companies of the main postings of all jobs in this view, in German order. */
    public LocationAndCompanyValuesResponse findLocationAndCompanyValues(JobView view) {
        String where = " WHERE " + viewCondition(view);
        return new LocationAndCompanyValuesResponse(
                distinctMainPostingValues("location", where),
                distinctMainPostingValues("company", where));
    }

    private List<String> distinctMainPostingValues(String column, String where) {
        return jdbc.sql("WITH " + JOB_STATE + " SELECT DISTINCT m." + column + " " + FROM_JOBS_WITH_MAIN_POSTING
                + where + " AND TRIM(m." + column + ") <> ''")
                .query(String.class)
                .list().stream()
                .sorted(GERMAN_ORDER)
                .toList();
    }

    /**
     * The saved postings of this source with one of the given external IDs, by
     * external ID.
     */
    public Map<String, JobPosting> findPostings(SourceConfig sourceConfig, Collection<String> externalIds) {
        if (externalIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, SourceConfig> sources = sourceConfigs.findAllById();
        return jdbc.sql(
                "SELECT * FROM job_posting WHERE source_config_id = :sourceConfigId AND external_id IN (:externalIds)")
                .param("sourceConfigId", sourceConfig.getId())
                .param("externalIds", externalIds)
                .query((rs, rowNum) -> mapPosting(rs, sources))
                .list().stream()
                .collect(Collectors.toMap(JobPosting::externalId, Function.identity()));
    }

    /** The ids among the given posting ids whose job is excluded. */
    public Set<Long> findPostingIdsOfExcludedJobs(Collection<Long> postingIds) {
        if (postingIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(jdbc.sql("""
                SELECT p.id FROM job_posting p JOIN job j ON j.id = p.job_id
                WHERE j.reaction = 'EXCLUDED' AND p.id IN (:postingIds)""")
                .param("postingIds", postingIds)
                .query(Long.class)
                .list());
    }

    /**
     * Postings of this source that are not gone, were last seen before the given
     * moment and belong to a job that is not excluded.
     */
    public List<JobPosting> findDuePostings(SourceConfig sourceConfig, Instant lastSeenBefore) {
        Map<Long, SourceConfig> sources = sourceConfigs.findAllById();
        return jdbc.sql("""
                SELECT p.* FROM job_posting p JOIN job j ON j.id = p.job_id
                WHERE p.source_config_id = :sourceConfigId AND p.gone_at IS NULL AND p.last_seen_at < :lastSeenBefore
                  AND j.reaction <> 'EXCLUDED'
                ORDER BY p.id""")
                .param("sourceConfigId", sourceConfig.getId())
                .param("lastSeenBefore", SqliteTimestamps.format(lastSeenBefore))
                .query((rs, rowNum) -> mapPosting(rs, sources))
                .list();
    }

    private JobPosting insertPosting(Job job, JobPosting posting) {
        SourceConfig sourceConfig = posting.sourceConfig();
        if (sourceConfig == null || sourceConfig.getId() == null) {
            throw new IllegalArgumentException("Posting " + posting.externalId() + " has no saved source config");
        }
        long id = jdbc
                .sql("""
                        INSERT INTO job_posting (job_id, source_config_id, external_id, url, title, company, location, description,
                                                 published_at, is_temporary_agency_work, last_seen_at, gone_at, changed_at)
                        VALUES (:jobId, :sourceConfigId, :externalId, :url, :title, :company, :location, :description,
                                :publishedAt, :isTemporaryAgencyWork, :lastSeenAt, :goneAt, :changedAt)
                        RETURNING id""")
                .param("jobId", job.getId())
                .param("sourceConfigId", sourceConfig.getId())
                .param("externalId", posting.externalId())
                .param("url", posting.url())
                .param("title", posting.title())
                .param("company", posting.company())
                .param("location", posting.location())
                .param("description", posting.description())
                .param("publishedAt", toText(posting.publishedAt()))
                .param("isTemporaryAgencyWork", posting.isTemporaryAgencyWork())
                .param("lastSeenAt", SqliteTimestamps.format(posting.lastSeenAt()))
                .param("goneAt", SqliteTimestamps.format(posting.goneAt()))
                .param("changedAt", SqliteTimestamps.format(posting.changedAt()))
                .query(Long.class)
                .single();
        return posting.withId(id);
    }

    // The rules of the job list, shared by the list and the counts.
    private static String viewCondition(JobView view) {
        return switch (view) {
            case ALL -> "reaction <> 'EXCLUDED' AND is_online";
            case NEW -> "reaction <> 'EXCLUDED' AND is_online AND is_new";
            case UNSEEN -> "reaction <> 'EXCLUDED' AND is_online AND opened_at IS NULL";
            case HEARTED -> "reaction = 'HEARTED'";
            case APPLIED -> "reaction <> 'EXCLUDED' AND status = 'APPLIED'";
            case REJECTED -> "reaction <> 'EXCLUDED' AND status = 'REJECTED'";
            case EXCLUDED -> "reaction = 'EXCLUDED'";
            case OFFLINE -> "reaction <> 'EXCLUDED' AND NOT is_online";
            case SORTED_OUT -> "0 = 1";
        };
    }

    // Adds the " AND ..." conditions of the filter and puts their parameters into params.
    private static String filterConditions(JobFilter filter, Map<String, Object> params) {
        StringBuilder conditions = new StringBuilder();
        if (filter.query() != null && !filter.query().isBlank()) {
            params.put("query", "%" + escapeLike(filter.query().strip()) + "%");
            conditions.append(" ").append("""
                    AND EXISTS (SELECT 1 FROM job_posting p WHERE p.job_id = s.id
                                AND (p.title LIKE :query ESCAPE '\\' OR p.company LIKE :query ESCAPE '\\'
                                     OR p.description LIKE :query ESCAPE '\\'))""");
        }
        if (filter.company() != null && !filter.company().isBlank()) {
            params.put("company", filter.company());
            conditions.append(" AND m.company = :company");
        }
        if (filter.location() != null && !filter.location().isBlank()) {
            params.put("location", filter.location());
            conditions.append(" AND m.location = :location");
        }
        if (!filter.sources().isEmpty()) {
            params.put("sources", filter.sources().stream().map(Enum::name).toList());
            conditions.append(" ").append("""
                    AND EXISTS (SELECT 1 FROM job_posting p JOIN source_config sc ON sc.id = p.source_config_id
                                WHERE p.job_id = s.id AND sc.type IN (:sources))""");
        }
        return conditions.toString();
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static JobSummaryResponse mapSummary(ResultSet rs) throws SQLException {
        String publishedAt = rs.getString("published_at");
        List<SourceType> sources = Arrays.stream(rs.getString("sources").split(",")).map(SourceType::valueOf).toList();
        return new JobSummaryResponse(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("company"),
                rs.getString("location"),
                sources,
                publishedAt == null ? null : LocalDate.parse(publishedAt),
                JobStatus.valueOf(rs.getString("status")),
                Reaction.valueOf(rs.getString("reaction")),
                rs.getBoolean("is_new"),
                rs.getString("opened_at") != null,
                rs.getBoolean("is_online"),
                rs.getBoolean("is_temporary_agency_work"));
    }

    private static Job mapJob(ResultSet rs, List<JobPosting> postings) throws SQLException {
        return new Job(
                rs.getLong("id"),
                SqliteTimestamps.parse(rs.getString("found_at")),
                SqliteTimestamps.parse(rs.getString("opened_at")),
                Reaction.valueOf(rs.getString("reaction")),
                JobStatus.valueOf(rs.getString("status")),
                postings);
    }

    private static JobPosting mapPosting(ResultSet rs, Map<Long, SourceConfig> sources) throws SQLException {
        String publishedAt = rs.getString("published_at");
        return new JobPosting(
                rs.getLong("id"),
                sources.get(rs.getLong("source_config_id")),
                rs.getString("external_id"),
                rs.getString("url"),
                rs.getString("title"),
                rs.getString("company"),
                rs.getString("location"),
                rs.getString("description"),
                publishedAt == null ? null : LocalDate.parse(publishedAt),
                rs.getBoolean("is_temporary_agency_work"),
                SqliteTimestamps.parse(rs.getString("last_seen_at")),
                SqliteTimestamps.parse(rs.getString("gone_at")),
                SqliteTimestamps.parse(rs.getString("changed_at")));
    }

    private static String toText(LocalDate date) {
        return date == null ? null : date.toString();
    }
}
