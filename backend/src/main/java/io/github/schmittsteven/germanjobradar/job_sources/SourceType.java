package io.github.schmittsteven.germanjobradar.job_sources;

public enum SourceType {
    ARBEITSAGENTUR("Arbeitsagentur");

    private String name;

    SourceType(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
