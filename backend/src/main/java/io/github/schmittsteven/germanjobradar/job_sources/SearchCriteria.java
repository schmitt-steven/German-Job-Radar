package io.github.schmittsteven.germanjobradar.job_sources;

import java.util.List;

public record SearchCriteria(
    List<String> searchTerms,
    String plz,
    int searchRadius,
    boolean isTemporaryAgencyWorkExcluded) {
}
