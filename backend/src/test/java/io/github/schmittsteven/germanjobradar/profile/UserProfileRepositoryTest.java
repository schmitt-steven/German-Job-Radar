package io.github.schmittsteven.germanjobradar.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import io.github.schmittsteven.germanjobradar.persistence.RepositoryTest;

@Import(UserProfileRepository.class)
class UserProfileRepositoryTest extends RepositoryTest {

    @Autowired
    private UserProfileRepository profiles;

    @Test
    void theProfileStartsEmpty() {
        UserProfile profile = profiles.get();

        assertThat(profile.getSearchTerms()).isEmpty();
        assertThat(profile.getLocationPlz()).isNull();
        assertThat(profile.getLocationName()).isNull();
        assertThat(profile.getSearchRadius()).isNull();
    }

    @Test
    void saveKeepsAllFields() {
        profiles.save(new UserProfile(List.of("Software-Entwickler"), "50667", "Köln", 50));

        UserProfile profile = profiles.get();

        assertThat(profile.getSearchTerms()).containsExactly("Software-Entwickler");
        assertThat(profile.getLocationPlz()).isEqualTo("50667");
        assertThat(profile.getLocationName()).isEqualTo("Köln");
        assertThat(profile.getSearchRadius()).isEqualTo(50);
    }

    @Test
    void aMissingRadiusStaysNullNextToALocation() {
        profiles.save(new UserProfile(List.of("A"), "50667", "Köln", null));

        assertThat(profiles.get().getSearchRadius()).isNull();
    }

    @Test
    void saveReplacesTheSearchTermsAndKeepsTheirOrder() {
        profiles.save(new UserProfile(List.of("A"), null, null, null));

        profiles.save(new UserProfile(List.of("C", "B"), null, null, null));

        assertThat(profiles.get().getSearchTerms()).containsExactly("C", "B");
    }

    @Test
    void saveCanClearEverything() {
        profiles.save(new UserProfile(List.of("A"), "50667", "Köln", 50));

        profiles.save(new UserProfile());

        UserProfile profile = profiles.get();
        assertThat(profile.getSearchTerms()).isEmpty();
        assertThat(profile.getLocationPlz()).isNull();
        assertThat(profile.getSearchRadius()).isNull();
    }
}
