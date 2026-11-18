import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { JobDetail, JobFilter, JobSummary, JobUpdate, LocationAndCompanyValues } from './job-types';
import { Observable } from 'rxjs';
import { Page } from '../page';
import { JobView } from '../status/status-types';

const PAGE_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);

  getJobs(filter: JobFilter, page: number): Observable<Page<JobSummary>> {
    const params: Record<string, string | number> = {
      view: filter.view,
      page,
      size: PAGE_SIZE,
    };

    if (filter.query) {
      params['query'] = filter.query;
    }
    if (filter.company) {
      params['company'] = filter.company;
    }
    if (filter.location) {
      params['location'] = filter.location;
    }

    return this.http.get<Page<JobSummary>>('/api/jobs', { params: params });
  }

  /** Marks the job seen and loads its description if it is missing, safe to send on every selection. */
  openJob(id: number): Observable<JobDetail> {
    return this.http.post<JobDetail>(`/api/jobs/${id}/open`, null);
  }

  updateJob(id: number, update: JobUpdate): Observable<JobSummary> {
    return this.http.patch<JobSummary>(`/api/jobs/${id}`, update);
  }

  getLocationsAndCompanies(view: JobView): Observable<LocationAndCompanyValues> {
    return this.http.get<LocationAndCompanyValues>('/api/jobs/location-and-company-values', {
      params: { view: view },
    });
  }
}
