package io.github.schmittsteven.germanjobradar.web;

/** An unknown id in the path, answered with {@code 404} and {@code NOT_FOUND}. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

}
