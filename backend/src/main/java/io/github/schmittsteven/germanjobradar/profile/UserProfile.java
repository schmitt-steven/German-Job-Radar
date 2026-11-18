package io.github.schmittsteven.germanjobradar.profile;

import java.util.ArrayList;
import java.util.List;

import org.jspecify.annotations.Nullable;

public class UserProfile {
    private final List<String> searchTerms;

    @Nullable
    private String locationPlz;

    @Nullable
    private String locationName;

    @Nullable
    private Integer searchRadius;

    public UserProfile() {
        this(List.of(), null, null, null);
    }

    public UserProfile(List<String> searchTerms, @Nullable String locationPlz, @Nullable String locationName, @Nullable Integer searchRadius) {
        this.searchTerms = new ArrayList<>(searchTerms);
        setLocation(locationPlz, locationName);
        this.searchRadius = searchRadius;
    }

    public List<String> getSearchTerms() {
        return List.copyOf(searchTerms);
    }

    @Nullable
    public String getLocationPlz() {
        return locationPlz;
    }

    @Nullable
    public String getLocationName() {
        return locationName;
    }

    @Nullable
    public Integer getSearchRadius() {
        return searchRadius;
    }

    public void setSearchTerms(List<String> searchTerms) {
        this.searchTerms.clear();
        this.searchTerms.addAll(searchTerms);
    }

    public void setLocation(@Nullable String locationPlz, @Nullable String locationName) {
        this.locationPlz = locationPlz;
        this.locationName = locationName;
    }

    public void setSearchRadius(@Nullable Integer searchRadius) {
        this.searchRadius = searchRadius;
    }
}
