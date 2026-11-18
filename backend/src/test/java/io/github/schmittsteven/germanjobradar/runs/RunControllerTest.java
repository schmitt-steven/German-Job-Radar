package io.github.schmittsteven.germanjobradar.runs;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.schmittsteven.germanjobradar.web.PagingConfig;

@WebMvcTest(RunController.class)
@Import(PagingConfig.class)
class RunControllerTest {

    private static final Instant STARTED_AT = Instant.parse("2026-10-17T08:30:00Z");

    @Autowired
    private MockMvc mvc;

    @Value("${server.port}")
    private int port;

    @MockitoBean
    private JobSearchService jobSearchService;

    @MockitoBean
    private RunRepository runRepository;

    @Test
    void startingARunAnswersAcceptedWithTheRunningRun() throws Exception {
        when(jobSearchService.start()).thenReturn(runningRun(7));
        when(jobSearchService.findProgress(7)).thenReturn(Optional.of(new RunProgress(RunPhase.FETCHING, null, 0, 0, 0)));

        mvc.perform(api(post("/api/runs")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.overallStatus").value("RUNNING"))
                .andExpect(jsonPath("$.phase").value("FETCHING"))
                .andExpect(jsonPath("$.remainingCount").doesNotExist())
                .andExpect(jsonPath("$.finishedAt").doesNotExist())
                .andExpect(jsonPath("$.isInitialSearch").value(true))
                .andExpect(jsonPath("$.sourceCount").value(1))
                .andExpect(jsonPath("$.finishedSourceCount").value(0))
                .andExpect(jsonPath("$.sourceResults").isEmpty());
    }

    @Test
    void aRunThatIsAlreadyRunningIsAConflict() throws Exception {
        when(jobSearchService.start()).thenThrow(new RunAlreadyRunningException(7));

        mvc.perform(api(post("/api/runs")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RUN_RUNNING"))
                .andExpect(jsonPath("$.detail").value("Run 7 is still running"))
                .andExpect(jsonPath("$.instance").value("/api/runs"));
    }

    @Test
    void aBlockedSearchIsAConflict() throws Exception {
        when(jobSearchService.start()).thenThrow(new SearchBlockedException(SearchBlockedReason.NO_LOCATION));

        mvc.perform(api(post("/api/runs")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SEARCH_BLOCKED"))
                .andExpect(jsonPath("$.detail").value("Search is blocked: NO_LOCATION"));
    }

    @Test
    void theHistoryIsAPageAndOnlyTheActiveRunShowsProgress() throws Exception {
        Run active = runningRun(8);
        Run finished = runningRun(7);
        finished.finish(STARTED_AT.plusSeconds(30), RunStatus.SUCCESS, 3, List.of());
        when(runRepository.findPage(any(Pageable.class))).thenAnswer(invocation ->
                new PageImpl<>(List.of(active, finished), invocation.getArgument(0), 12));
        when(jobSearchService.findProgress(8)).thenReturn(Optional.of(new RunProgress(RunPhase.ANALYZING, 5, 1, 0, 40)));
        when(jobSearchService.findProgress(7)).thenReturn(Optional.empty());

        mvc.perform(api(get("/api/runs")).param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.size").value(2))
                .andExpect(jsonPath("$.page.number").value(0))
                .andExpect(jsonPath("$.page.totalElements").value(12))
                .andExpect(jsonPath("$.page.totalPages").value(6))
                .andExpect(jsonPath("$.content[0].id").value(8))
                .andExpect(jsonPath("$.content[0].phase").value("ANALYZING"))
                .andExpect(jsonPath("$.content[0].remainingCount").value(5))
                .andExpect(jsonPath("$.content[0].checkedJobCount").value(40))
                .andExpect(jsonPath("$.content[1].id").value(7))
                .andExpect(jsonPath("$.content[1].overallStatus").value("SUCCESS"))
                .andExpect(jsonPath("$.content[1].phase").doesNotExist())
                .andExpect(jsonPath("$.content[1].newJobCount").value(3));
    }

    @Test
    void cancelingARunAnswersAcceptedAndCancelsIt() throws Exception {
        mvc.perform(api(post("/api/runs/7/cancel")))
                .andExpect(status().isAccepted());

        verify(jobSearchService).cancel(7);
    }

    @Test
    void cancelingARunThatIsNotRunningIsAConflict() throws Exception {
        doThrow(new RunNotRunningException(7)).when(jobSearchService).cancel(7);

        mvc.perform(api(post("/api/runs/7/cancel")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RUN_NOT_RUNNING"))
                .andExpect(jsonPath("$.instance").value("/api/runs/7/cancel"));
    }

    // The filter in front of /api needs the local host with the server port and the header.
    private MockHttpServletRequestBuilder api(MockHttpServletRequestBuilder request) {
        return request.header("Host", "localhost:" + port).header("X-Job-Radar", "1");
    }

    private static Run runningRun(long id) {
        Run run = Run.start(STARTED_AT, true, 1);
        run.setId(id);
        return run;
    }
}
