package io.github.schmittsteven.germanjobradar.places;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class PlaceDirectoryTest {

    private final PlaceDirectory directory = new PlaceDirectory();

    @Test
    void bareCityComesBeforeItsPairs() {
        List<PlaceSuggestion> suggestions = directory.suggest("Köln");

        assertThat(suggestions.get(0)).isEqualTo(new PlaceSuggestion("50667", "Köln", null, true));
        assertThat(suggestions.get(1)).isEqualTo(new PlaceSuggestion("50667", "Köln", null, false));
    }

    @ParameterizedTest
    @CsvSource({"Köln,50667", "München,80331", "Berlin,10115", "Calberlah,38547"})
    void barePlaceGetsItsRepresentativePlz(String name, String plz) {
        PlaceSuggestion bare = directory.suggest(name).get(0);

        assertThat(bare.name()).isEqualTo(name);
        assertThat(bare.isPlaceOnly()).isTrue();
        assertThat(bare.plz()).isEqualTo(plz);
    }

    @Test
    void ignoresCaseAndFindsUmlautsSpelledOut() {
        List<PlaceSuggestion> expected = directory.suggest("Köln");

        assertThat(directory.suggest("KÖLN")).isEqualTo(expected);
        assertThat(directory.suggest("koeln")).isEqualTo(expected);
        assertThat(directory.suggest("Weissenburg")).extracting(PlaceSuggestion::name).contains("Weißenburg in Bayern");
    }

    @Test
    void matchesOnlyTheStartOfAName() {
        assertThat(directory.suggest("ölner")).isEmpty();
    }

    @Test
    void aPlzPrefixFindsPairsOnly() {
        List<PlaceSuggestion> suggestions = directory.suggest("5066");

        assertThat(suggestions).isNotEmpty();
        assertThat(suggestions).allSatisfy(suggestion -> {
            assertThat(suggestion.plz()).startsWith("5066");
            assertThat(suggestion.isPlaceOnly()).isFalse();
        });
        assertThat(suggestions).contains(new PlaceSuggestion("50667", "Köln", null, false));
    }

    @Test
    void repeatedNamesShowTheirDistrict() {
        List<PlaceSuggestion> bare = directory.suggest("Aach").stream().filter(PlaceSuggestion::isPlaceOnly).toList();

        assertThat(bare).containsExactly(
                new PlaceSuggestion("78267", "Aach", "Landkreis Konstanz", true),
                new PlaceSuggestion("54298", "Aach", "Landkreis Trier-Saarburg", true),
                new PlaceSuggestion("52062", "Aachen", null, true));
    }

    @Test
    void returnsAtMostTenAndKeepsBarePlacesFirst() {
        List<PlaceSuggestion> suggestions = directory.suggest("Ber");

        assertThat(suggestions).hasSize(10);
        List<Boolean> isPlaceOnly = suggestions.stream().map(PlaceSuggestion::isPlaceOnly).toList();
        assertThat(isPlaceOnly).isSortedAccordingTo((a, b) -> Boolean.compare(b, a));
    }

    @Test
    void unknownTextFindsNothing() {
        assertThat(directory.suggest("Zzqxkv")).isEmpty();
        assertThat(directory.suggest("99999")).isEmpty();
    }

    @Test
    void containsOnlyKnownPairs() {
        assertThat(directory.contains("50667", "Köln")).isTrue();
        assertThat(directory.contains("50667", "München")).isFalse();
        assertThat(directory.contains("99999", "Köln")).isFalse();
        assertThat(directory.contains("50667", "köln")).isFalse();
        assertThat(directory.contains(null, "Köln")).isFalse();
    }

}
