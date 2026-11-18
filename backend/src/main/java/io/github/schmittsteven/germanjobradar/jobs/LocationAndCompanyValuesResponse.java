package io.github.schmittsteven.germanjobradar.jobs;

import java.util.List;

/** The values for the company and location dropdowns of one view. */
public record LocationAndCompanyValuesResponse(List<String> locations, List<String> companies) {
}
