import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Page } from '../page';
import { Run } from '../status/status-types';

@Injectable({ providedIn: 'root' })
export class RunService {
  private readonly http = inject(HttpClient);

  /** The newest runs first. */
  getRecent(count: number): Observable<Page<Run>> {
    return this.http.get<Page<Run>>('/api/runs', { params: { size: count } });
  }

  start(): Observable<Run> {
    return this.http.post<Run>('/api/runs', null);
  }

  cancel(runId: number): Observable<void> {
    return this.http.post<void>(`/api/runs/${runId}/cancel`, null);
  }
}
