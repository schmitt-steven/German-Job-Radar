package io.github.schmittsteven.germanjobradar.runs;

public class RunAlreadyRunningException extends RuntimeException {

    public RunAlreadyRunningException(long runId) {
        super("Run " + runId + " is still running");
    }
}
