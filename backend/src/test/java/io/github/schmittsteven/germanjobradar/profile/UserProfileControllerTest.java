package io.github.schmittsteven.germanjobradar.profile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import io.github.schmittsteven.germanjobradar.places.PlaceDirectory;
import io.github.schmittsteven.germanjobradar.web.ApiExceptionHandler;

class UserProfileControllerTest {

    private final UserProfileRepository repository = mock(UserProfileRepository.class);

    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new UserProfileController(repository, new PlaceDirectory()))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();

    @Test
    void getReturnsTheStoredProfile() throws Exception {
        when(repository.get()).thenReturn(new UserProfile(List.of("Software-Entwickler"), "50667", "Köln", 50));

        mvc.perform(get("/api/profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchTerms[0]").value("Software-Entwickler"))
                .andExpect(jsonPath("$.locationPlz").value("50667"))
                .andExpect(jsonPath("$.locationName").value("Köln"))
                .andExpect(jsonPath("$.searchRadius").value(50));
    }

    @Test
    void putSavesAndReturnsTheProfile() throws Exception {
        saveProfile("""
                {"searchTerms": ["Software-Entwickler"], "locationPlz": "50667", "locationName": "Köln", "searchRadius": 50}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchTerms[0]").value("Software-Entwickler"))
                .andExpect(jsonPath("$.locationPlz").value("50667"))
                .andExpect(jsonPath("$.locationName").value("Köln"))
                .andExpect(jsonPath("$.searchRadius").value(50));

        verify(repository).save(any(UserProfile.class));
    }

    @Test
    void anEmptyProfileCanBeSaved() throws Exception {
        saveProfile("""
                {"searchTerms": [], "locationPlz": null, "locationName": null, "searchRadius": null}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchTerms").isEmpty())
                .andExpect(jsonPath("$.locationPlz").doesNotExist())
                .andExpect(jsonPath("$.searchRadius").doesNotExist());

        verify(repository).save(any(UserProfile.class));
    }

    @Test
    void aPartialProfileCanBeSaved() throws Exception {
        saveProfile("""
                {"searchTerms": ["Software-Entwickler"], "searchRadius": null}
                """).andExpect(status().isOk());
        saveProfile("""
                {"searchTerms": [], "locationPlz": "50667", "locationName": "Köln"}
                """).andExpect(status().isOk());
        saveProfile("""
                {"searchTerms": [], "searchRadius": 30}
                """).andExpect(status().isOk());
    }

    @Test
    void missingSearchTermsAreInvalid() throws Exception {
        expectInvalid(saveProfile("""
                {"searchRadius": 30}
                """));
    }

    @Test
    void theRadiusLimitsAreInclusive() throws Exception {
        saveProfile(profileJson("[\"Software-Entwickler\"]", "50667", "Köln", "1")).andExpect(status().isOk());
        saveProfile(profileJson("[\"Software-Entwickler\"]", "50667", "Köln", "100")).andExpect(status().isOk());
    }

    @Test
    void aRadiusOutsideOneToHundredIsInvalid() throws Exception {
        expectInvalid(saveProfile(profileJson("[\"Software-Entwickler\"]", "50667", "Köln", "0")));
        expectInvalid(saveProfile(profileJson("[\"Software-Entwickler\"]", "50667", "Köln", "101")));
    }

    @Test
    void moreThanOneSearchTermIsInvalid() throws Exception {
        expectInvalid(saveProfile(profileJson("[\"Java\", \"Kotlin\"]", "50667", "Köln", "50")));
    }

    @Test
    void aPlzWithoutAPlaceIsInvalid() throws Exception {
        expectInvalid(saveProfile("""
                {"searchTerms": ["Software-Entwickler"], "locationPlz": "50667", "searchRadius": 50}
                """));
    }

    @Test
    void aPlaceWithoutAPlzIsInvalid() throws Exception {
        expectInvalid(saveProfile("""
                {"searchTerms": ["Software-Entwickler"], "locationName": "Köln", "searchRadius": 50}
                """));
    }

    @Test
    void aPlzOfAnotherPlaceIsInvalid() throws Exception {
        expectInvalid(saveProfile(profileJson("[\"Software-Entwickler\"]", "10115", "Köln", "50")));
    }

    @Test
    void aPlaceThatDoesNotExistIsInvalid() throws Exception {
        expectInvalid(saveProfile(profileJson("[\"Software-Entwickler\"]", "99999", "Zzqxkv", "50")));
    }

    private ResultActions saveProfile(String json) throws Exception {
        return mvc.perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String profileJson(String searchTerms, String plz, String name, String radius) {
        return """
                {"searchTerms": %s, "locationPlz": "%s", "locationName": "%s", "searchRadius": %s}
                """.formatted(searchTerms, plz, name, radius);
    }

    private void expectInvalid(ResultActions result) throws Exception {
        result.andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.instance").value("/api/profile"));
        verify(repository, never()).save(any(UserProfile.class));
    }

}
