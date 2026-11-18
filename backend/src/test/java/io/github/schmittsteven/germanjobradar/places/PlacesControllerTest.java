package io.github.schmittsteven.germanjobradar.places;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import io.github.schmittsteven.germanjobradar.web.ApiExceptionHandler;

class PlacesControllerTest {

    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new PlacesController(new PlaceDirectory()))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();

    @Test
    void returnsSuggestionsInTheDocumentedShape() throws Exception {
        mvc.perform(get("/api/places").param("query", "Köln"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].plz").value("50667"))
                .andExpect(jsonPath("$[0].name").value("Köln"))
                .andExpect(jsonPath("$[0].district").doesNotExist())
                .andExpect(jsonPath("$[0].isPlaceOnly").value(true))
                .andExpect(jsonPath("$[1].isPlaceOnly").value(false));
    }

    @Test
    void anUnknownPlaceIsAnEmptyList() throws Exception {
        mvc.perform(get("/api/places").param("query", "Zzqxkv"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void aShortOrMissingQueryIsInvalid() throws Exception {
        mvc.perform(get("/api/places").param("query", "K"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.instance").value("/api/places"));
        mvc.perform(get("/api/places"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

}
