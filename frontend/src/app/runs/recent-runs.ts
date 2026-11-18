import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, filter, map, switchMap } from 'rxjs';
import { StatusService } from '../status/status-service';
import { Run } from '../status/status-types';
import { RunService } from './run-service';
import { formatRunTime } from './run-time';

const RUN_COUNT = 4;

interface RunRow {
  id: number;
  time: string;
  outcome: string;
  isFailed: boolean;
  detail: string;
}

@Component({
  selector: 'section[app-recent-runs]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-labelledby': 'recent-runs-label', '[hidden]': 'rows().length === 0' },
  template: `
    <h2 id="recent-runs-label" class="group-label">Suchläufe</h2>
    <ol>
      @for (row of rows(); track row.id) {
        <li>
          <span class="head">
            <span class="time">{{ row.time }}</span>
            <span class="outcome" [class.failed]="row.isFailed">{{ row.outcome }}</span>
          </span>
          <span class="detail">{{ row.detail }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    :host([hidden]) {
      display: none;
    }

    ol {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 9px 12px 10px 26px;
    }

    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .time {
      display: inline-block;
      font-weight: 500;
      color: var(--text-secondary);
    }

    /* The formatter writes "heute" for the status line, here it starts the row. */
    .time::first-letter {
      text-transform: uppercase;
    }

    .outcome {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .outcome.failed {
      color: var(--red-text);
    }

    .detail {
      font-size: 12px;
      color: var(--text-dim);
    }
  `,
})
export class RecentRuns {
  private readonly statusService = inject(StatusService);
  private readonly runService = inject(RunService);

  private readonly latestRun = computed(() => this.statusService.status()?.search.run ?? null);
  /** Undefined until the first status, so the history loads once and again for every new run. */
  private readonly latestRunId = computed(() =>
    this.statusService.status() ? (this.latestRun()?.id ?? null) : undefined,
  );

  private readonly history = toSignal(
    toObservable(this.latestRunId).pipe(
      filter((id) => id !== undefined),
      switchMap(() =>
        this.runService.getRecent(RUN_COUNT).pipe(
          map((page) => page.content),
          // Keeps the last list while the backend is unreachable.
          catchError(() => EMPTY),
        ),
      ),
    ),
    { initialValue: [] },
  );

  readonly rows = computed(() => {
    // The status has the latest run fresh on every poll, the history only from when it loaded.
    const latest = this.latestRun();
    const older = this.history().filter((run) => run.id !== latest?.id);
    const runs = (latest ? [latest, ...older] : older).slice(0, RUN_COUNT);
    const now = new Date();
    return runs.map((run) => toRow(run, now));
  });
}

function toRow(run: Run, now: Date): RunRow {
  const sources = `${run.sourceCount} ${run.sourceCount === 1 ? 'Quelle' : 'Quellen'}`;
  const checked = `${run.checkedJobCount} ${run.checkedJobCount === 1 ? 'Job' : 'Jobs'} geprüft`;
  return {
    id: run.id,
    time: formatRunTime(new Date(run.startedAt), now),
    outcome: outcomeOf(run),
    isFailed: run.overallStatus === 'FAILED',
    // A canceled run saved nothing, so it has nothing checked to show.
    detail: run.overallStatus === 'CANCELED' ? sources : `${sources} · ${checked}`,
  };
}

function outcomeOf(run: Run): string {
  switch (run.overallStatus) {
    case 'RUNNING':
      return 'läuft…';
    case 'FAILED':
      return 'fehlgeschlagen';
    case 'CANCELED':
      return 'abgebrochen';
    case 'SUCCESS':
    case 'PARTIAL':
      return `+${run.newJobCount} ${run.newJobCount === 1 ? 'Job' : 'Jobs'}`;
  }
}
