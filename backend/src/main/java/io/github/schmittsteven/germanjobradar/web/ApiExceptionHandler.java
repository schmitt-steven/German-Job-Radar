package io.github.schmittsteven.germanjobradar.web;

import java.net.URI;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(InvalidRequestException.class)
    public ProblemDetail handleInvalidRequest(InvalidRequestException e, HttpServletRequest request) {
        return invalidRequest(e.getMessage(), request);
    }

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail handleNotFound(NotFoundException e, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, e.getMessage(), "NOT_FOUND", request);
    }

    // An unknown enum value or a wrong type, in the body or in a parameter.
    @ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class })
    public ProblemDetail handleUnreadableRequest(Exception e, HttpServletRequest request) {
        return invalidRequest(e.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleConstraintViolation(MethodArgumentNotValidException e, HttpServletRequest request) {
        String message = e.getBindingResult().getAllErrors().stream()
                .map(error -> error.getDefaultMessage())
                .sorted()
                .collect(Collectors.joining(" "));
        return invalidRequest(message, request);
    }

    /** The error body of the API: a ProblemDetail with the {@code code} the frontend maps to its text. */
    public static ProblemDetail problem(HttpStatus status, String detail, String code, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        return problem;
    }

    private ProblemDetail invalidRequest(String message, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, message, "INVALID_REQUEST", request);
    }

}
