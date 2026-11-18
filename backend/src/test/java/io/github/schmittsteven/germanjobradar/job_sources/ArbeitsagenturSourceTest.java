package io.github.schmittsteven.germanjobradar.job_sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;

import io.github.schmittsteven.germanjobradar.jobs.JobPosting;

class ArbeitsagenturSourceTest {

    private static final String API_URL = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc";
    private static final String SEARCH_URL = API_URL + "/v6/jobs";
    private static final String DETAILS_URL = API_URL + "/v4/jobdetails/";

    // 13644-271261-S and 19376-44518786-1019-S, Base64 with and without padding
    private static final String PADDED_REFNR = "13644-271261-S";
    private static final String PADDED_REFNR_ID = "MTM2NDQtMjcxMjYxLVM%3D";
    private static final String UNPADDED_REFNR = "19376-44518786-1019-S";
    private static final String UNPADDED_REFNR_ID = "MTkzNzYtNDQ1MTg3ODYtMTAxOS1T";

    private static final String TEMPORARY_REFNR = "10001-1003906543-S";
    private static final String TEMPORARY_REFNR_ID = "MTAwMDEtMTAwMzkwNjU0My1T";
    private static final String NO_FLAG_REFNR = "10001-1002773798-S";
    private static final String NO_FLAG_REFNR_ID = "MTAwMDEtMTAwMjc3Mzc5OC1T";

    private static final SearchCriteria KOELN = new SearchCriteria(List.of("Software-Entwickler"), "50667", 50, false);
    private static final SearchCriteria KOELN_WITHOUT_TEMPORARY = new SearchCriteria(List.of("Software-Entwickler"), "50667", 50, true);
    private static final SourceConfig CONFIG = new SourceConfig(SourceType.ARBEITSAGENTUR, true, null);

    private MockRestServiceServer server;
    private ArbeitsagenturSource source;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        source = new ArbeitsagenturSource(builder);
    }

    @Test
    void searchMapsTheFieldsOfAResultRow() {
        expectSearch("search_full.json");

        List<JobPosting> postings = source.search(CONFIG, KOELN);

        assertThat(postings).hasSize(243);
        JobPosting posting = findPosting(postings, PADDED_REFNR);
        assertThat(posting.url()).isEqualTo("https://www.arbeitsagentur.de/jobsuche/jobdetail/13644-271261-S");
        assertThat(posting.title()).isEqualTo("Software-Entwickler (w/m/d)");
        assertThat(posting.company()).isEqualTo("Schönhofer SALES AND ENGINEERING");
        assertThat(posting.location()).isEqualTo("Troisdorf");
        assertThat(posting.publishedAt()).isEqualTo(LocalDate.of(2026, 9, 3));
        assertThat(posting.description()).isNull();
        assertThat(posting.changedAt()).isEqualTo(Instant.parse("2026-10-01T05:07:30.951Z"));
        assertThat(posting.isTemporaryAgencyWork()).isFalse();
        assertThat(posting.lastSeenAt()).isNotNull();
        assertThat(posting.goneAt()).isNull();
        server.verify();
    }

    @Test
    void searchAsksOnlyOnceAndDoesNotTagTemporaryAgencyWork() {
        expectSearch("search_full.json");

        List<JobPosting> postings = source.search(CONFIG, KOELN);

        assertThat(postings).noneMatch(JobPosting::isTemporaryAgencyWork);
        server.verify();
    }

    @Test
    void searchLeavesOutTemporaryAgencyWorkWhenExcluded() {
        server.expect(requestTo(startsWith(SEARCH_URL)))
                .andExpect(queryParam("was", "Software-Entwickler"))
                .andExpect(queryParam("zeitarbeit", "false"))
                .andRespond(withSuccess(fixture("search_zeitarbeit_false.json"), MediaType.APPLICATION_JSON));

        List<JobPosting> postings = source.search(CONFIG, KOELN_WITHOUT_TEMPORARY);

        assertThat(postings).hasSize(219);
        server.verify();
    }

    @Test
    void searchFailsOnAnUnknownLocation() {
        expectSearch("search_unknown_location.json");

        assertThatThrownBy(() -> source.search(CONFIG, KOELN))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("50667");
    }

    @Test
    void loadDetailsReturnsThePostingWithItsDescription() {
        expectDetails(UNPADDED_REFNR_ID, withSuccess(fixture("details_0.json"), MediaType.APPLICATION_JSON));
        JobPosting posting = posting(UNPADDED_REFNR);

        JobPosting loaded = source.loadDetails(posting);

        assertThat(loaded.description()).startsWith("HDI AG\nDeine Aufgaben");
        assertThat(loaded.description()).hasSize(2115);
        assertThat(loaded.externalId()).isEqualTo(UNPADDED_REFNR);
        assertThat(loaded.title()).isEqualTo(posting.title());
        assertThat(loaded.isTemporaryAgencyWork()).isFalse();
        assertThat(loaded.changedAt()).isEqualTo(Instant.parse("2026-10-20T08:45:10.307Z"));
    }

    @Test
    void loadDetailsEncodesARefnrWhoseBase64IsPadded() {
        expectDetails(PADDED_REFNR_ID, withSuccess(fixture("details_1.json"), MediaType.APPLICATION_JSON));

        JobPosting loaded = source.loadDetails(posting(PADDED_REFNR));

        assertThat(loaded.description()).startsWith("## Deine Aufgaben:");
        server.verify();
    }

    @Test
    void loadDetailsTagsTemporaryAgencyWork() {
        expectDetails(TEMPORARY_REFNR_ID, withSuccess(fixture("details_zeitarbeit.json"), MediaType.APPLICATION_JSON));

        JobPosting loaded = source.loadDetails(posting(TEMPORARY_REFNR));

        assertThat(loaded.isTemporaryAgencyWork()).isTrue();
    }

    @Test
    void loadDetailsTreatsAMissingFlagAsNotTemporaryAgencyWork() {
        expectDetails(NO_FLAG_REFNR_ID, withSuccess(fixture("details_no_flag.json"), MediaType.APPLICATION_JSON));

        JobPosting loaded = source.loadDetails(posting(NO_FLAG_REFNR));

        assertThat(loaded.description()).isNotBlank();
        assertThat(loaded.isTemporaryAgencyWork()).isFalse();
    }

    @Test
    void isOnlineIsTrueOnA200() {
        expectDetails(UNPADDED_REFNR_ID, withSuccess(fixture("details_0.json"), MediaType.APPLICATION_JSON));

        assertThat(source.isOnline(posting(UNPADDED_REFNR))).contains(true);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "lookup_removed_10001-1002716922-S.json",
        "lookup_really_removed_10000-1184124233-S.json"
    })
    void isOnlineIsFalseOnA404WithPostingNotFound(String fixtureName) {
        expectDetails(UNPADDED_REFNR_ID, withStatus(HttpStatus.NOT_FOUND)
                .contentType(MediaType.APPLICATION_JSON)
                .body(fixture(fixtureName)));

        assertThat(source.isOnline(posting(UNPADDED_REFNR))).contains(false);
    }

    @Test
    void isOnlineIsEmptyOnA404WithAnotherCode() {
        expectDetails(UNPADDED_REFNR_ID, withStatus(HttpStatus.NOT_FOUND)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"messages\": [{\"code\": \"SOMETHING_ELSE\"}]}"));

        assertThat(source.isOnline(posting(UNPADDED_REFNR))).isEmpty();
    }

    @Test
    void isOnlineIsEmptyOnAnyOtherStatus() {
        expectDetails(UNPADDED_REFNR_ID, withStatus(HttpStatus.FORBIDDEN));

        assertThat(source.isOnline(posting(UNPADDED_REFNR))).isEqualTo(Optional.empty());
    }

    private void expectSearch(String fixtureName) {
        server.expect(requestTo(allOf(startsWith(SEARCH_URL), not(containsString("zeitarbeit")))))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-API-Key", "jobboerse-jobsuche"))
                .andExpect(queryParam("was", "Software-Entwickler"))
                .andExpect(queryParam("wo", "50667"))
                .andExpect(queryParam("umkreis", "50"))
                .andExpect(queryParam("size", "500"))
                .andRespond(withSuccess(fixture(fixtureName), MediaType.APPLICATION_JSON));
    }

    private void expectDetails(String id, ResponseCreator response) {
        server.expect(requestTo(DETAILS_URL + id))
                .andExpect(header("X-API-Key", "jobboerse-jobsuche"))
                .andRespond(response);
    }

    private static Resource fixture(String name) {
        return new ClassPathResource("arbeitsagentur/" + name);
    }

    private static JobPosting findPosting(List<JobPosting> postings, String externalId) {
        return postings.stream()
                .filter(posting -> posting.externalId().equals(externalId))
                .findFirst()
                .orElseThrow();
    }

    private static JobPosting posting(String externalId) {
        return new JobPosting(externalId, null, "Title", "Company", "Köln", null, null, false, Instant.now(), null);
    }
}
