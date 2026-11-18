package io.github.schmittsteven.germanjobradar.job_sources;

import org.jspecify.annotations.Nullable;

public class SourceConfig {
    @Nullable
    private final Long id;
    private final SourceType type;
    private boolean isEnabled;

    @Nullable
    private String companySlug;

    public SourceConfig(SourceType type, boolean isEnabled, @Nullable String companySlug) {
        this(null, type, isEnabled, companySlug);
    }

    public SourceConfig(@Nullable Long id, SourceType type, boolean isEnabled, @Nullable String companySlug) {
        this.id = id;
        this.type = type;
        this.isEnabled = isEnabled;
        this.companySlug = companySlug;
    }

    @Nullable
    public Long getId() {
        return id;
    }

    public SourceType getType() {
        return type;
    }

    public boolean isEnabled() {
        return isEnabled;
    }

    public String getCompanySlug() {
        return companySlug;
    }

    public void setEnabled(boolean isEnabled) {
        this.isEnabled = isEnabled;
    }

    public void setCompanySlug(String companySlug) {
        this.companySlug = companySlug;
    }
}
