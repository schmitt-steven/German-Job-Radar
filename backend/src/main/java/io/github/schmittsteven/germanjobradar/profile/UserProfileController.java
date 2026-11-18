package io.github.schmittsteven.germanjobradar.profile;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

import io.github.schmittsteven.germanjobradar.places.PlaceDirectory;
import io.github.schmittsteven.germanjobradar.web.InvalidRequestException;

@RestController
public class UserProfileController {

    private final UserProfileRepository repository;
    private final PlaceDirectory placeDirectory;

    public UserProfileController(UserProfileRepository repository, PlaceDirectory placeDirectory) {
        this.repository = repository;
        this.placeDirectory = placeDirectory;
    }

    @PutMapping("/api/profile")
    public UserProfile save(@Valid @RequestBody UserProfileRequest request) {
        validatePlace(request);
        UserProfile profile = new UserProfile(
            request.searchTerms(),
            request.locationPlz(),
            request.locationName(),
            request.searchRadius()
        );
        repository.save(profile);
        return profile;
    }

    @GetMapping("/api/profile")
    public UserProfile get() {
        return repository.get();
    }

    private void validatePlace(UserProfileRequest request) {
        var locationName = request.locationName();
        var locationPlz = request.locationPlz();
        if (locationName == null || locationPlz == null) {
            return;
        }
        if (!placeDirectory.contains(locationPlz, locationName)) {
            throw new InvalidRequestException("Ort und PLZ stimmen nicht überein. Bitte überprüfe deine Eingabe.");
        }
    }
}
