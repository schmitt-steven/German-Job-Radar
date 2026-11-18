package io.github.schmittsteven.germanjobradar.persistence;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;

import org.jspecify.annotations.Nullable;

/** Instants as ISO text with a fixed 3 fraction digits, so text order is time order. */
public final class SqliteTimestamps {

    private static final DateTimeFormatter FORMAT = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();

    private SqliteTimestamps() {
    }

    @Nullable
    public static String format(@Nullable Instant instant) {
        return instant == null ? null : FORMAT.format(instant);
    }

    @Nullable
    public static Instant parse(@Nullable String text) {
        return text == null ? null : Instant.parse(text);
    }
}
