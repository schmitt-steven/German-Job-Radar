package io.github.schmittsteven.germanjobradar.job_sources;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SourceConfigRepository {

    private final JdbcClient jdbc;

    public SourceConfigRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<SourceConfig> findAll() {
        return jdbc.sql("SELECT id, type, is_enabled, company_slug FROM source_config ORDER BY id")
                .query((rs, rowNum) -> new SourceConfig(
                        rs.getLong("id"),
                        SourceType.valueOf(rs.getString("type")),
                        rs.getBoolean("is_enabled"),
                        rs.getString("company_slug")))
                .list();
    }

    public Map<Long, SourceConfig> findAllById() {
        return findAll().stream().collect(Collectors.toMap(config -> Objects.requireNonNull(config.getId()), Function.identity()));
    }

    public List<SourceConfig> findEnabled() {
        return findAll().stream().filter(config -> config.isEnabled()).toList();
    }
}
