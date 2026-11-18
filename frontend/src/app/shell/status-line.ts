import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StatusService } from '../status/status-service';
import { Run } from '../status/status-types';
import { formatRunTime } from '../runs/run-time';

type Tone = 'idle' | 'busy' | 'error';

/** "Letzte Suche:" is muted, the value bright (or red), the detail muted again. */
interface StatusLineContent {
  tone: Tone;
  label: string | null;
  value: string | null;
  detail: string | null;
}

@Component({
  selector: 'app-status-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `
    @if (content(); as content) {
      <span class="dot" [class]="content.tone" aria-hidden="true"></span>
      @if (content.label) {
        <span>{{ content.label }}</span>
      }
      @if (content.value) {
        <span class="value" [class.error]="content.tone === 'error'">{{ content.value }}</span>
      }
      @if (content.detail) {
        <span>{{ content.detail }}</span>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 13px;
      color: var(--text-muted);
    }

    .dot {
      flex: none;
      width: 6px;
      height: 6px;
      margin-right: 4px;
      border-radius: 50%;
      background: var(--fit-low);
    }

    .dot.busy {
      background: var(--fit-high);
      animation: pulse 1.6s ease-in-out infinite;
    }

    .dot.error {
      background: var(--red);
    }

    .value {
      color: var(--text);
    }

    .value.error {
      color: var(--red-text);
    }

    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dot.busy {
        animation: none;
      }
    }
  `,
})
export class StatusLine {
  private readonly statusService = inject(StatusService);

  readonly content = computed<StatusLineContent | null>(() => {
    const status = this.statusService.status();
    if (!status) {
      return null;
    }
    const run = status.search.run;
    if (!run) {
      return { tone: 'idle', label: 'Noch keine Suche', value: null, detail: null };
    }
    return describeRun(run, new Date());
  });
}

function describeRun(run: Run, now: Date): StatusLineContent {
  switch (run.overallStatus) {
    case 'RUNNING':
      if (run.phase === 'ANALYZING') {
        const detail = run.remainingCount === null ? null : `noch ${run.remainingCount}`;
        return { tone: 'busy', label: null, value: 'Analysiere Jobs…', detail };
      }
      return {
        tone: 'busy',
        label: null,
        value: 'Suche läuft…',
        detail: `${run.finishedSourceCount}/${run.sourceCount} Quellen`,
      };
    case 'FAILED':
      return { tone: 'error', label: null, value: 'Letzte Suche fehlgeschlagen', detail: null };
    case 'CANCELED':
      return { tone: 'idle', label: null, value: 'Letzte Suche abgebrochen', detail: null };
    case 'SUCCESS':
    case 'PARTIAL': {
      const finishedAt = new Date(run.finishedAt ?? run.startedAt);
      return {
        tone: 'idle',
        label: 'Letzte Suche:',
        value: formatRunTime(finishedAt, now),
        detail: failedSourcesText(run.failedSourceCount),
      };
    }
  }
}

function failedSourcesText(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1 ? '· 1 Quelle fehlgeschlagen' : `· ${count} Quellen fehlgeschlagen`;
}
