import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { StatusService } from '../status/status-service';
import { JobService } from './job-service';
import { JobDetail, JobStatus, JobSummary, JobUpdate, Reaction } from './job-types';

/**
 * Saves changes of a job and keeps what the list and the details show in step.
 * A changed job stays in place in the list until it is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class JobChanges {
  private readonly jobService = inject(JobService);
  private readonly statusService = inject(StatusService);

  private readonly saved = signal<ReadonlyMap<number, JobSummary>>(new Map());

  /** The job being saved, and the one whose last save failed. */
  readonly savingId = signal<number | null>(null);
  readonly failedId = signal<number | null>(null);

  /** The job with its saved changes over what was loaded, the same object if it has none. */
  apply<T extends JobSummary>(job: T): T {
    const change = this.saved().get(job.id);
    return change ? { ...job, ...change } : job;
  }

  /**
   * Opens the job, see JobService.openJob. An unseen job leaves "Ungesehen" right away,
   * the real counts follow once the backend answers.
   */
  open(job: JobSummary): Observable<JobDetail> {
    const current = this.apply(job);
    // Only the jobs of "Alle" count as unseen.
    if (!current.isSeen && current.isOnline && current.reaction !== 'EXCLUDED') {
      this.statusService.adjustCount('UNSEEN', -1);
    }
    this.remember({ ...current, isSeen: true });

    // Also on a failure or a cancel, so a wrong guess doesn't last until the next poll.
    return this.jobService.openJob(job.id).pipe(finalize(() => this.statusService.refresh()));
  }

  /** Sets the reaction, or takes it back if the job already has it. */
  toggleReaction(job: JobSummary, reaction: Reaction): void {
    this.save(job, { reaction: job.reaction === reaction ? 'NONE' : reaction });
  }

  setStatus(job: JobSummary, status: JobStatus): void {
    if (job.status !== status) {
      this.save(job, { status });
    }
  }

  private save(job: JobSummary, update: JobUpdate): void {
    if (this.savingId() !== null) {
      return;
    }
    this.savingId.set(job.id);
    this.failedId.set(null);

    this.jobService.updateJob(job.id, update).subscribe({
      next: (updated) => {
        this.remember(updated);
        this.savingId.set(null);
        // The counts of the sidebar views changed.
        this.statusService.refresh();
      },
      error: () => {
        this.savingId.set(null);
        this.failedId.set(job.id);
      },
    });
  }

  private remember(job: JobSummary): void {
    this.saved.update((saved) => new Map(saved).set(job.id, job));
  }
}
