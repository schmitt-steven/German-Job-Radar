package io.github.schmittsteven.germanjobradar.runs;

public class RunNotRunningException extends RuntimeException {

    public RunNotRunningException(long runId) {
        super("Run " + runId + " is not running");
    }
}
