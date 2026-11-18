package io.github.schmittsteven.germanjobradar.places;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.schmittsteven.germanjobradar.web.InvalidRequestException;

@RestController
public class PlacesController {

    private static final int MIN_QUERY_LENGTH = 3;

    private final PlaceDirectory placeDirectory;

    public PlacesController(PlaceDirectory placeDirectory) {
        this.placeDirectory = placeDirectory;
    }

    @GetMapping("/api/places")
    public List<PlaceSuggestion> places(@RequestParam(name = "query", defaultValue = "") String query) {
        if (query.strip().length() < MIN_QUERY_LENGTH) {
            throw new InvalidRequestException("query needs at least " + MIN_QUERY_LENGTH + " characters");
        }
        return placeDirectory.suggest(query);
    }

}
