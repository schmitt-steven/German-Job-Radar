CREATE TABLE source_config (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    company_slug TEXT
) STRICT;

CREATE UNIQUE INDEX source_config_type_slug ON source_config (type, company_slug) WHERE company_slug IS NOT NULL;
-- SQLite treats NULLs as distinct, so sources without a slug need their own index
CREATE UNIQUE INDEX source_config_type_no_slug ON source_config (type) WHERE company_slug IS NULL;

-- AA currently the only implemented source
INSERT INTO source_config (type, is_enabled) VALUES ('ARBEITSAGENTUR', 1);

CREATE TABLE job (
    id INTEGER PRIMARY KEY,
    found_at TEXT NOT NULL,
    opened_at TEXT,
    reaction TEXT NOT NULL DEFAULT 'NONE' CHECK (reaction IN ('NONE', 'HEARTED', 'EXCLUDED')),
    status TEXT NOT NULL DEFAULT 'NOT_APPLIED' CHECK (status IN ('NOT_APPLIED', 'APPLIED', 'REJECTED'))
) STRICT;

CREATE INDEX job_found_at ON job (found_at);

CREATE TABLE job_posting (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES job (id) ON DELETE CASCADE,
    source_config_id INTEGER NOT NULL REFERENCES source_config (id),
    external_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    description TEXT,
    published_at TEXT,
    is_temporary_agency_work INTEGER NOT NULL DEFAULT 0 CHECK (is_temporary_agency_work IN (0, 1)),
    last_seen_at TEXT NOT NULL,
    gone_at TEXT,
    UNIQUE (source_config_id, external_id)
) STRICT;

CREATE INDEX job_posting_job_id ON job_posting (job_id);

CREATE TABLE run (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    overall_status TEXT NOT NULL CHECK (overall_status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELED')),
    new_job_count INTEGER NOT NULL DEFAULT 0,
    is_initial_search INTEGER NOT NULL CHECK (is_initial_search IN (0, 1)),
    source_count INTEGER NOT NULL
) STRICT;

CREATE TABLE run_source_result (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES run (id) ON DELETE CASCADE,
    source_config_id INTEGER NOT NULL REFERENCES source_config (id),
    raw_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
) STRICT;

CREATE INDEX run_source_result_run_id ON run_source_result (run_id);

CREATE TABLE user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    location_plz TEXT,
    location_name TEXT,
    search_radius INTEGER CHECK (search_radius BETWEEN 1 AND 100),
    CHECK ((location_plz IS NULL) = (location_name IS NULL))
) STRICT;

INSERT INTO user_profile (id) VALUES (1);

CREATE TABLE user_profile_search_term (
    id INTEGER PRIMARY KEY,
    term TEXT NOT NULL
) STRICT;
