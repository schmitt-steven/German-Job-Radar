package io.github.schmittsteven.germanjobradar.profile;

import java.util.List;

import org.jspecify.annotations.Nullable;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserProfileRequest(
    @NotNull(message = "Die Suchbegriffe fehlen.")
    @Size(max = 1, message = "Es ist höchstens 1 Suchbegriff erlaubt.")
    List<String> searchTerms,
    @Nullable String locationPlz,
    @Nullable String locationName,
    @Nullable
    @Min(value = 1, message = "Der Radius muss zwischen 1 und 100 km liegen.")
    @Max(value = 100, message = "Der Radius muss zwischen 1 und 100 km liegen.")
    Integer searchRadius) {

    @AssertTrue(message = "PLZ und Ortsname müssen zusammen angegeben werden.")
    public boolean isLocationComplete() {
        return (locationPlz == null) == (locationName == null);
    }
}
