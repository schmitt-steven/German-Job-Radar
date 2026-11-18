package io.github.schmittsteven.germanjobradar.job_sources;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import io.github.schmittsteven.germanjobradar.jobs.JobPosting;
import tools.jackson.databind.JsonNode;

@Component
public class ArbeitsagenturSource implements JobSource {

    private static final String API_URL = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc";
    private static final String BASE_URL = "https://www.arbeitsagentur.de";
    private static final String PUBLIC_KEY = "jobboerse-jobsuche";
    private static final ZoneId SOURCE_ZONE = ZoneId.of("Europe/Berlin");
    private static final int PAGE_SIZE = 500;
    private static final int MAX_ATTEMPTS = 3;
    private static final Duration MIN_PAUSE_BETWEEN_CALLS = Duration.ofMillis(500);
    private static final long MAX_JITTER_MILLIS = 150;
    private static final Duration BACKOFF_STEP = Duration.ofSeconds(5);

    private final RestClient client;

    public ArbeitsagenturSource() {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(30));
        this(RestClient.builder().requestFactory(requestFactory));
    }

    // Tests pass a builder bound to a MockRestServiceServer.
    ArbeitsagenturSource(RestClient.Builder clientBuilder) {
        this.client = clientBuilder
                .baseUrl(API_URL)
                .defaultHeader("X-API-Key", PUBLIC_KEY)
                .build();
    }

    @Override
    public SourceType type() {
        return SourceType.ARBEITSAGENTUR;
    }

    @Override
    public boolean isListSource() {
        return false;
    }

    @Override
    public boolean isListComplete() {
        return false;
    }

    @Override
    public List<JobPosting> search(SourceConfig config, SearchCriteria criteria) {
        Map<String, JobPosting> postingsByExternalId = new LinkedHashMap<>();
        boolean isFirstTerm = true;
        for (String term : criteria.searchTerms()) {
            if (!isFirstTerm) {
                pauseBetweenCalls();
            }
            isFirstTerm = false;
            for (JobPosting posting : searchForTerm(term, criteria)) {
                postingsByExternalId.putIfAbsent(posting.externalId(), posting);
            }
        }
        return List.copyOf(postingsByExternalId.values());
    }

    @Override
    public JobPosting loadDetails(JobPosting posting) {
        JsonNode details = client.get()
                .uri("/v4/jobdetails/{id}", encodeRefnr(posting.externalId()))
                .retrieve()
                .body(JsonNode.class);
        // The flag is missing on many normal postings, which counts as false.
        return posting.withDetails(
                details.path("stellenangebotsBeschreibung").asString(null),
                details.path("istArbeitnehmerUeberlassung").asBoolean(false),
                toChangedAt(details));
    }

    @Override
    public Optional<Boolean> isOnline(JobPosting posting) {
        try {
            return client.get()
                    .uri("/v4/jobdetails/{id}", encodeRefnr(posting.externalId()))
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 200) {
                            return Optional.of(true);
                        }
                        if (status == 404) {
                            JsonNode body = response.bodyTo(JsonNode.class);
                            String code = body.path("messages").path(0).path("code").asString("");
                            if (code.equals("STELLENANGEBOT_NICHT_GEFUNDEN")) {
                                return Optional.of(false);
                            }
                        }
                        return Optional.<Boolean>empty();
                    });
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    private List<JobPosting> searchForTerm(String term, SearchCriteria criteria) {
        JsonNode result = fetchJobs(term, criteria);
        if (result.path("woOutput").path("suchmodus").asString("").equals("UNGUELTIG")) {
            throw new IllegalStateException("API der Arbeitsagentur kennt diesen Ort nicht: " + criteria.plz());
        }

        Map<String, JobPosting> postingsByRefnr = new LinkedHashMap<>();
        Instant now = Instant.now();
        for (JsonNode row : result.path("ergebnisliste")) {
            String refnr = row.path("referenznummer").asString();
            postingsByRefnr.putIfAbsent(refnr, toPosting(refnr, row, now));
        }
        return List.copyOf(postingsByRefnr.values());
    }

    private JobPosting toPosting(String refnr, JsonNode row, Instant now) {
        String publishedAt = row.path("datumErsteVeroeffentlichung").asString(null);
        return new JobPosting(
                refnr,
                BASE_URL + "/jobsuche/jobdetail/" + refnr,
                row.path("stellenangebotsTitel").asString(null),
                row.path("firma").asString(null),
                row.path("stellenlokationen").path(0).path("adresse").path("ort").asString(null),
                null,
                publishedAt == null ? null : LocalDate.parse(publishedAt),
                false,
                now,
                null).withChangedAt(toChangedAt(row));
    }

    // Local time without a zone, only ever compared with the same posting's earlier value.
    private static Instant toChangedAt(JsonNode node) {
        String changedAt = node.path("aenderungsdatum").asString(null);
        return changedAt == null ? null : LocalDateTime.parse(changedAt).atZone(SOURCE_ZONE).toInstant();
    }

    private JsonNode fetchJobs(String term, SearchCriteria criteria) {
        for (int attempt = 1;; attempt++) {
            try {
                return client.get()
                        .uri(uriBuilder -> {
                            uriBuilder.path("/v6/jobs")
                                    .queryParam("was", "{was}")
                                    .queryParam("wo", "{wo}")
                                    .queryParam("umkreis", "{umkreis}")
                                    .queryParam("size", PAGE_SIZE);
                            if (criteria.isTemporaryAgencyWorkExcluded()) {
                                uriBuilder.queryParam("zeitarbeit", false);
                            }
                            return uriBuilder.build(Map.of(
                                    "was", term,
                                    "wo", criteria.plz(),
                                    "umkreis", criteria.searchRadius()));
                        })
                        .retrieve()
                        .body(JsonNode.class);
            } catch (HttpClientErrorException.TooManyRequests e) {
                if (attempt == MAX_ATTEMPTS) {
                    throw e;
                }
                pause(BACKOFF_STEP.multipliedBy(attempt));
            }
        }
    }

    private static String encodeRefnr(String refnr) {
        return Base64.getEncoder().encodeToString(refnr.getBytes(StandardCharsets.UTF_8));
    }

    private static void pauseBetweenCalls() {
        long jitterMillis = ThreadLocalRandom.current().nextLong(MAX_JITTER_MILLIS + 1);
        pause(MIN_PAUSE_BETWEEN_CALLS.plusMillis(jitterMillis));
    }

    private static void pause(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Unterbrochen beim Warten zwischen Anfragen an die Arbeitsagentur", e);
        }
    }
}
