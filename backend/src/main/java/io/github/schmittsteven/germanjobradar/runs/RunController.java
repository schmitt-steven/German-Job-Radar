package io.github.schmittsteven.germanjobradar.runs;

import java.util.Objects;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController 
public class RunController {

    private final JobSearchService jobSearchService;
    private final RunRepository runRepository;

    public RunController(JobSearchService jobSearchService, RunRepository runRepository) {
        this.jobSearchService = jobSearchService;
        this.runRepository = runRepository;
    }
    
    @PostMapping("/api/runs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RunResponse startRun() {
        return this.toResponse(jobSearchService.start());
    }

    @GetMapping("/api/runs")
    public Page<RunResponse> getRunHistory(Pageable pageable) {
        return this.runRepository.findPage(pageable).map(this::toResponse);
    }

    @PostMapping("/api/runs/{id}/cancel")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void cancelRun(@PathVariable long id) {
        this.jobSearchService.cancel(id);
    } 
    
    private RunResponse toResponse(Run run) {
        RunProgress progress = jobSearchService.findProgress(Objects.requireNonNull(run.getId())).orElse(null);
        return RunResponse.from(run, progress);
    }
}
