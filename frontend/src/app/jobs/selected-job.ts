import { Injectable, computed, signal } from '@angular/core';
import { JobSummary } from './job-types';

/** The job open in the details panel. It stays when the sidebar view changes. */
@Injectable({ providedIn: 'root' })
export class SelectedJob {
  private readonly selectedSummary = signal<JobSummary | null>(null);

  /** The list's data of the job, enough to show the panel's header before the details arrive. */
  readonly summary = this.selectedSummary.asReadonly();
  readonly id = computed(() => this.selectedSummary()?.id ?? null);

  select(summary: JobSummary): void {
    this.selectedSummary.set(summary);
  }
}
