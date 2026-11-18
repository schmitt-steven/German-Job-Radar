import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, catchError, map, of, startWith, switchMap, tap, timer } from 'rxjs';
import { JobView, Status } from './status-types';

const BUSY_POLL_MS = 2_000;
const IDLE_POLL_MS = 30_000;

/** Polls /api/status for the top bar, sidebar and popups. */
@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly http = inject(HttpClient);
  private readonly refreshRequests = new Subject<void>();

  private readonly latest = signal<Status | null>(null);
  /** Null until the first answer arrives. */
  readonly status = this.latest.asReadonly();
  readonly isRunning = computed(() => this.status()?.search.run?.overallStatus === 'RUNNING');

  constructor() {
    // One loop: fetch, wait, refresh() again. switchMap drops the pending request or wait on every refresh().
    this.refreshRequests
      .pipe(
        startWith(undefined),
        switchMap(() =>
          this.http.get<Status>('/api/status').pipe(
            tap((status) => this.latest.set(status)),
            map(() => (this.isRunning() ? BUSY_POLL_MS : IDLE_POLL_MS)),
            // Keeps the last status and the loop alive while the backend is unreachable.
            catchError(() => of(BUSY_POLL_MS)),
            switchMap((delay) => timer(delay)),
          ),
        ),
      )
      .subscribe(() => this.refresh());
  }

  /** Changes a count right away, before the next poll brings the real one. */
  adjustCount(view: JobView, delta: number): void {
    this.latest.update((status) =>
      status && {
        ...status,
        counts: { ...status.counts, [view]: Math.max(0, status.counts[view] + delta) },
      },
    );
  }

  /** Polls now, call it after every action that changes jobs, runs, profile or settings. */
  refresh(): void {
    this.refreshRequests.next();
  }
}
