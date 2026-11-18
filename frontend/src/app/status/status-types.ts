export type SourceType = 'ARBEITSAGENTUR';

export interface SourceResult {
  sourceConfigId: number;
  sourceType: SourceType;
  companySlug: string | null;
  rawCount: number;
  error: string | null;
}

export type RunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELED';

export type RunPhase = 'FETCHING' | 'ANALYZING';

export interface Run {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  overallStatus: RunStatus;
  phase: RunPhase | null;
  remainingCount: number | null;
  newJobCount: number;
  isInitialSearch: boolean;
  sourceCount: number;
  finishedSourceCount: number;
  failedSourceCount: number;
  checkedJobCount: number;
  sourceResults: SourceResult[];
}

export type SearchBlockedReason = 'NO_SEARCH_TERMS' | 'NO_LOCATION' | 'NO_RADIUS' | 'NO_SOURCES';

export interface SearchStatus {
  blockedReason: SearchBlockedReason | null;
  run: Run | null;
}

export type JobView =
  | 'ALL'
  | 'NEW'
  | 'UNSEEN'
  | 'APPLIED'
  | 'REJECTED'
  | 'EXCLUDED'
  | 'HEARTED'
  | 'OFFLINE'
  | 'SORTED_OUT';

export interface Status {
  search: SearchStatus;
  counts: Record<JobView, number>;
}
