package io.github.schmittsteven.germanjobradar.runs;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceConfigRepository;
import io.github.schmittsteven.germanjobradar.persistence.SqliteTimestamps;

@Repository
public class RunRepository {

    private final JdbcClient jdbc;
    private final SourceConfigRepository sourceConfigs;

    public RunRepository(JdbcClient jdbc, SourceConfigRepository sourceConfigs) {
        this.jdbc = jdbc;
        this.sourceConfigs = sourceConfigs;
    }

    /** Saves a run that has just started. */
    public void insert(Run run) {
        long id = jdbc.sql("""
                INSERT INTO run (started_at, overall_status, new_job_count, is_initial_search, source_count)
                VALUES (:startedAt, :overallStatus, :newJobCount, :isInitialSearch, :sourceCount)
                RETURNING id""")
                .param("startedAt", SqliteTimestamps.format(run.getStartedAt()))
                .param("overallStatus", run.getOverallStatus().name())
                .param("newJobCount", run.getNewJobCount())
                .param("isInitialSearch", run.isInitialSearch())
                .param("sourceCount", run.getSourceCount())
                .query(Long.class)
                .single();
        run.setId(id);
    }

    /** Saves the end state of the run together with its source results. */
    @Transactional
    public void finish(Run run) {
        jdbc.sql("UPDATE run SET finished_at = :finishedAt, overall_status = :overallStatus, new_job_count = :newJobCount WHERE id = :id")
                .param("finishedAt", SqliteTimestamps.format(run.getFinishedAt()))
                .param("overallStatus", run.getOverallStatus().name())
                .param("newJobCount", run.getNewJobCount())
                .param("id", run.getId())
                .update();
        List<RunSourceResult> saved = run.getSourceResults().stream().map(result -> {
            long id = jdbc.sql("""
                    INSERT INTO run_source_result (run_id, source_config_id, raw_count, error)
                    VALUES (:runId, :sourceConfigId, :rawCount, :error)
                    RETURNING id""")
                    .param("runId", run.getId())
                    .param("sourceConfigId", result.sourceConfig().getId())
                    .param("rawCount", result.rawCount())
                    .param("error", result.error())
                    .query(Long.class)
                    .single();
            return result.withId(id);
        }).toList();
        run.setSourceResults(saved);
    }

    /** Ends every run still marked as running, for runs a crash left behind. */
    public int failRunning(Instant finishedAt) {
        return jdbc.sql("UPDATE run SET finished_at = :finishedAt, overall_status = 'FAILED' WHERE overall_status = 'RUNNING'")
                .param("finishedAt", SqliteTimestamps.format(finishedAt))
                .update();
    }

    public Optional<Run> findById(long id) {
        return loadRuns("WHERE id = :id", Map.of("id", id)).stream().findFirst();
    }

    /** The newest run, empty before the first search. */
    public Optional<Run> findLatest() {
        return findLatest(1).stream().findFirst();
    }

    /** Newest first. */
    public List<Run> findLatest(int limit) {
        return loadRuns("ORDER BY started_at DESC, id DESC LIMIT :limit", Map.of("limit", limit));
    }

    /** Newest first. The sort of the pageable is ignored. */
    public Page<Run> findPage(Pageable pageable) {
        List<Run> content = loadRuns("ORDER BY started_at DESC, id DESC LIMIT :limit OFFSET :offset",
                Map.of("limit", pageable.getPageSize(), "offset", pageable.getOffset()));
        long total = jdbc.sql("SELECT COUNT(*) FROM run").query(Long.class).single();
        return new PageImpl<>(content, pageable, total);
    }

    private List<Run> loadRuns(String clause, Map<String, Object> params) {
        Map<Long, SourceConfig> sources = sourceConfigs.findAllById();
        List<Run> runs = jdbc.sql("SELECT * FROM run " + clause)
                .params(params)
                .query((rs, rowNum) -> new Run(
                        rs.getLong("id"),
                        SqliteTimestamps.parse(rs.getString("started_at")),
                        SqliteTimestamps.parse(rs.getString("finished_at")),
                        RunStatus.valueOf(rs.getString("overall_status")),
                        rs.getInt("new_job_count"),
                        rs.getBoolean("is_initial_search"),
                        rs.getInt("source_count"),
                        List.of()))
                .list();
        if (runs.isEmpty()) {
            return runs;
        }
        Map<Long, List<RunSourceResult>> resultsByRun = jdbc
                .sql("SELECT * FROM run_source_result WHERE run_id IN (:runIds) ORDER BY id")
                .param("runIds", runs.stream().map(Run::getId).toList())
                .query((rs, rowNum) -> Map.entry(
                        rs.getLong("run_id"),
                        new RunSourceResult(
                                rs.getLong("id"),
                                sources.get(rs.getLong("source_config_id")),
                                rs.getInt("raw_count"),
                                rs.getString("error"))))
                .list().stream()
                .collect(Collectors.groupingBy(Map.Entry::getKey, Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
        return runs.stream()
                .map(run -> new Run(run.getId(), run.getStartedAt(), run.getFinishedAt(), run.getOverallStatus(),
                        run.getNewJobCount(), run.isInitialSearch(), run.getSourceCount(),
                        resultsByRun.getOrDefault(run.getId(), List.of())))
                .toList();
    }
}
