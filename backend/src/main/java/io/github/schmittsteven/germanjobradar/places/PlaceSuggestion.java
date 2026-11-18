package io.github.schmittsteven.germanjobradar.places;

public record PlaceSuggestion(
    String plz,
    String name,
    String district,
    boolean isPlaceOnly) {
}
