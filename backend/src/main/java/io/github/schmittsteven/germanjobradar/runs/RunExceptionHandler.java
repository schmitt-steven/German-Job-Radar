package io.github.schmittsteven.germanjobradar.runs;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import io.github.schmittsteven.germanjobradar.web.ApiExceptionHandler;
import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice(assignableTypes = RunController.class)
public class RunExceptionHandler {

    @ExceptionHandler(RunAlreadyRunningException.class)
    public ProblemDetail handleRunAlreadyRunning(RunAlreadyRunningException e, HttpServletRequest request) {
        return ApiExceptionHandler.problem(HttpStatus.CONFLICT, e.getMessage(), "RUN_RUNNING", request);
    }

    @ExceptionHandler(RunNotRunningException.class)
    public ProblemDetail handleRunNotRunning(RunNotRunningException e, HttpServletRequest request) {
        return ApiExceptionHandler.problem(HttpStatus.CONFLICT, e.getMessage(), "RUN_NOT_RUNNING", request);
    }

    @ExceptionHandler(SearchBlockedException.class)
    public ProblemDetail handleSearchBlocked(SearchBlockedException e, HttpServletRequest request) {
        return ApiExceptionHandler.problem(HttpStatus.CONFLICT, e.getMessage(), "SEARCH_BLOCKED", request);
    }
}
