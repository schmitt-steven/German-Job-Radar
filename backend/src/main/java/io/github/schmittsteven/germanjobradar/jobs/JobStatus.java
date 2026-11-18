package io.github.schmittsteven.germanjobradar.jobs;

public enum JobStatus {
    NOT_APPLIED("Nicht beworben"), APPLIED("Beworben"), REJECTED("Abgelehnt");

    private final String name;

    JobStatus(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
