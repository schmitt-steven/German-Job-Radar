import { JobView, SourceType } from '../status/status-types';

export interface JobSummary {
  id: number;
  title: string;
  company: string;
  location: string;
  sources: SourceType[];
  publishedAt: string | null;
  status: JobStatus;
  reaction: Reaction;
  isNew: boolean;
  isSeen: boolean;
  isOnline: boolean;
  isTemporaryAgencyWork: boolean;
}

export interface JobPosting {
  id: number;
  source: SourceType;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  publishedAt: string | null;
  isTemporaryAgencyWork: boolean;
  lastSeenAt: string;
  goneAt: string | null;
  isMain: boolean;
}

export interface JobDetail extends JobSummary {
  /** Why the main posting's description couldn't be loaded, only set by opening the job. */
  descriptionError: string | null;
  postings: JobPosting[];
}

/** The fields `PATCH /api/jobs/{id}` accepts, any subset. */
export interface JobUpdate {
  status?: JobStatus;
  reaction?: Reaction;
}

export type JobStatus = 'NOT_APPLIED' | 'APPLIED' | 'REJECTED';

export type Reaction = 'NONE' | 'HEARTED' | 'EXCLUDED';

export interface JobFilter {
  view: JobView;
  query: string | null;
  company: string | null;
  location: string | null;
  source: SourceType[];
  sort: JobSorting;
}

export type JobSorting = 'DATE' | 'RELEVANCE';

export interface LocationAndCompanyValues {
  locations: string[];
  companies: string[];
}
