package io.github.schmittsteven.germanjobradar.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import io.github.schmittsteven.germanjobradar.job_sources.SourceConfig;
import io.github.schmittsteven.germanjobradar.job_sources.SourceType;
import io.github.schmittsteven.germanjobradar.web.ApiExceptionHandler;

class JobsControllerTest {

    private static final Instant NOW = Instant.parse("2026-10-17T08:30:00Z");

    private final JobRepository repository = mock(JobRepository.class);

    private final JobOpener opener = mock(JobOpener.class);

    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new JobsController(repository, opener))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();

    @Test
    void locationAndCompanyValuesAreThoseOfTheGivenView() throws Exception {
        when(repository.findLocationAndCompanyValues(JobView.APPLIED))
                .thenReturn(new LocationAndCompanyValuesResponse(List.of("Berlin", "Köln"), List.of("ACME GmbH")));

        mvc.perform(get("/api/jobs/location-and-company-values").param("view", "APPLIED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.companies[0]").value("ACME GmbH"))
                .andExpect(jsonPath("$.locations[1]").value("Köln"));
    }

    @Test
    void locationAndCompanyValuesOfAnUnknownViewAreAnInvalidRequest() throws Exception {
        mvc.perform(get("/api/jobs/location-and-company-values").param("view", "NOPE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void getJobReturnsItsPostingsAndMarksTheMainOne() throws Exception {
        when(repository.findById(42)).thenReturn(Optional.of(job()));
        when(repository.isNew(42)).thenReturn(true);

        mvc.perform(get("/api/jobs/42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.title").value("Main"))
                .andExpect(jsonPath("$.isNew").value(true))
                .andExpect(jsonPath("$.isSeen").value(false))
                .andExpect(jsonPath("$.descriptionError").doesNotExist())
                .andExpect(jsonPath("$.postings[0].isMain").value(false))
                .andExpect(jsonPath("$.postings[1].isMain").value(true))
                .andExpect(jsonPath("$.postings[1].source").value("ARBEITSAGENTUR"))
                .andExpect(jsonPath("$.postings[1].lastSeenAt").value("2026-10-17T08:30:00Z"));
    }

    @Test
    void anUnknownJobIsNotFound() throws Exception {
        when(repository.findById(7)).thenReturn(Optional.empty());

        mvc.perform(get("/api/jobs/7"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        patchJob(7, "{\"status\": \"APPLIED\"}")
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/jobs/7/open"))
                .andExpect(status().isNotFound());
        verify(repository, never()).update(any());
        verify(opener, never()).open(any());
    }

    @Test
    void openHandsTheJobToTheOpener() throws Exception {
        Job job = job();
        when(repository.findById(42)).thenReturn(Optional.of(job));
        when(opener.open(job)).thenReturn(new OpenedJob(job, "503 Service Unavailable"));

        mvc.perform(post("/api/jobs/42/open"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.descriptionError").value("503 Service Unavailable"));
    }

    @Test
    void patchChangesOnlyTheGivenFields() throws Exception {
        Job job = job();
        when(repository.findById(42)).thenReturn(Optional.of(job));

        patchJob(42, "{\"reaction\": \"HEARTED\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reaction").value("HEARTED"))
                .andExpect(jsonPath("$.status").value("NOT_APPLIED"));
        patchJob(42, "{\"status\": \"APPLIED\"}")
                .andExpect(jsonPath("$.reaction").value("HEARTED"))
                .andExpect(jsonPath("$.status").value("APPLIED"));

        assertThat(job.getReaction()).isEqualTo(Reaction.HEARTED);
        assertThat(job.getStatus()).isEqualTo(JobStatus.APPLIED);
        verify(repository, times(2)).update(job);
    }

    @Test
    void patchWithAnUnknownValueIsAnInvalidRequest() throws Exception {
        when(repository.findById(42)).thenReturn(Optional.of(job()));

        patchJob(42, "{\"status\": \"HIRED\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        verify(repository, never()).update(any());
    }

    private ResultActions patchJob(long id, String body) throws Exception {
        return mvc.perform(patch("/api/jobs/" + id).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static Job job() {
        SourceConfig source = new SourceConfig(1L, SourceType.ARBEITSAGENTUR, true, null);
        JobPosting other = new JobPosting(100L, source, "a", "https://example.test/a", "Other", "ACME", "Köln",
                null, null, false, NOW, null);
        JobPosting main = new JobPosting(101L, source, "b", "https://example.test/b", "Main", "ACME", "Köln",
                "Beschreibung", null, false, NOW, null);
        return new Job(42L, NOW, null, Reaction.NONE, JobStatus.NOT_APPLIED, List.of(other, main));
    }
}
