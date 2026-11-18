package io.github.schmittsteven.germanjobradar.runs;

public class SearchBlockedException extends RuntimeException {

    private final SearchBlockedReason reason;

    public SearchBlockedException(SearchBlockedReason reason) {
        super("Search is blocked: " + reason);
        this.reason = reason;
    }

    public SearchBlockedReason getReason() {
        return reason;
    }
}
