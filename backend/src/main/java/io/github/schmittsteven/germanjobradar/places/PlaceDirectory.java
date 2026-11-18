package io.github.schmittsteven.germanjobradar.places;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
public class PlaceDirectory {

    private static final String RESOURCE = "places/places.csv";
    private static final int MAX_SUGGESTIONS = 10;
    // A PLZ must have this share of the largest PLZ's street count to represent a place.
    private static final double MIN_STREET_SHARE = 0.1;

    private record Row(String plz, String name, String district, int streetCount) {
    }

    private record Indexed(PlaceSuggestion suggestion, String foldedName) {
    }

    private static final Comparator<Indexed> BY_NAME = Comparator
            .comparing(Indexed::foldedName)
            .thenComparing(indexed -> indexed.suggestion().district(), Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(indexed -> indexed.suggestion().plz());

    private final List<Indexed> places;
    private final List<Indexed> pairs;
    private final Set<String> pairKeys;

    public PlaceDirectory() {
        List<Row> rows = readRows();
        Set<String> ambiguousNames = findAmbiguousNames(rows);
        this.places = buildPlaces(rows, ambiguousNames);
        this.pairs = buildPairs(rows, ambiguousNames);
        this.pairKeys = rows.stream().map(row -> pairKey(row.plz(), row.name())).collect(Collectors.toSet());
    }

    public List<PlaceSuggestion> suggest(String text) {
        String folded = fold(text.strip());
        if (folded.isEmpty()) {
            return List.of();
        }
        List<PlaceSuggestion> suggestions = new ArrayList<>();
        for (Indexed place : places) {
            if (suggestions.size() == MAX_SUGGESTIONS) {
                return suggestions;
            }
            if (place.foldedName().startsWith(folded)) {
                suggestions.add(place.suggestion());
            }
        }
        for (Indexed pair : pairs) {
            if (suggestions.size() == MAX_SUGGESTIONS) {
                break;
            }
            if (pair.foldedName().startsWith(folded) || pair.suggestion().plz().startsWith(folded)) {
                suggestions.add(pair.suggestion());
            }
        }
        return suggestions;
    }

    public boolean contains(String plz, String name) {
        return plz != null && name != null && pairKeys.contains(pairKey(plz, name));
    }

    private static List<Row> readRows() {
        List<Row> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new ClassPathResource(RESOURCE).getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                List<String> fields = splitCsvLine(line);
                rows.add(new Row(fields.get(0), fields.get(1), fields.get(2), Integer.parseInt(fields.get(3))));
            }
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read " + RESOURCE, e);
        }
        return rows;
    }

    // The file only quotes a field to protect a comma, it never has an escaped quote.
    private static List<String> splitCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean isInQuotes = false;
        for (char c : line.toCharArray()) {
            if (c == '"') {
                isInQuotes = !isInQuotes;
            } else if (c == ',' && !isInQuotes) {
                fields.add(field.toString());
                field.setLength(0);
            } else {
                field.append(c);
            }
        }
        fields.add(field.toString());
        return fields;
    }

    private static Set<String> findAmbiguousNames(List<Row> rows) {
        Map<String, Set<String>> districtsByName = new LinkedHashMap<>();
        for (Row row : rows) {
            districtsByName.computeIfAbsent(row.name(), name -> new HashSet<>()).add(row.district());
        }
        return districtsByName.entrySet().stream()
                .filter(entry -> entry.getValue().size() > 1)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    private static List<Indexed> buildPlaces(List<Row> rows, Set<String> ambiguousNames) {
        Map<String, List<Row>> rowsByPlace = rows.stream()
                .collect(Collectors.groupingBy(row -> row.name() + "\u0000" + row.district()));
        return rowsByPlace.values().stream()
                .map(placeRows -> {
                    Row representative = pickRepresentative(placeRows);
                    return index(new PlaceSuggestion(
                            representative.plz(),
                            representative.name(),
                            districtFor(representative, ambiguousNames),
                            true));
                })
                .sorted(BY_NAME)
                .toList();
    }

    private static List<Indexed> buildPairs(List<Row> rows, Set<String> ambiguousNames) {
        return rows.stream()
                .map(row -> index(new PlaceSuggestion(row.plz(), row.name(), districtFor(row, ambiguousNames), false)))
                .sorted(BY_NAME)
                .toList();
    }

    private static Row pickRepresentative(List<Row> placeRows) {
        int largest = placeRows.stream().mapToInt(Row::streetCount).max().orElseThrow();
        return placeRows.stream()
                .filter(row -> row.streetCount() >= largest * MIN_STREET_SHARE)
                .min(Comparator.comparing(Row::plz))
                .orElseThrow();
    }

    private static String districtFor(Row row, Set<String> ambiguousNames) {
        return ambiguousNames.contains(row.name()) ? row.district() : null;
    }

    private static Indexed index(PlaceSuggestion suggestion) {
        return new Indexed(suggestion, fold(suggestion.name()));
    }

    private static String pairKey(String plz, String name) {
        return plz + "\u0000" + name;
    }

    private static String fold(String text) {
        return text.toLowerCase(Locale.ROOT)
                .replace("ä", "ae")
                .replace("ö", "oe")
                .replace("ü", "ue")
                .replace("ß", "ss");
    }

}
