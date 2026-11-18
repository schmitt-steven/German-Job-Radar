import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { PopupMessage } from '../popups/popup-message';
import { RunService } from '../runs/run-service';
import { StatusService } from '../status/status-service';
import { SearchBlockedReason } from '../status/status-types';
import { StatusLine } from './status-line';

const PROFILE_HINT = 'Erst Profil ausfüllen';

const BLOCKED_HINTS: Record<SearchBlockedReason, string> = {
  NO_SEARCH_TERMS: PROFILE_HINT,
  NO_LOCATION: PROFILE_HINT,
  NO_RADIUS: PROFILE_HINT,
  NO_SOURCES: 'Keine Quelle aktiv',
};

@Component({
  selector: 'header[app-top-bar]',
  imports: [RouterLink, Icon, PopupMessage, StatusLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="wordmark">Job Radar</span>

    @if (isRunning()) {
      <button
        type="button"
        class="search-button btn-soft"
        [disabled]="isCanceling()"
        (click)="cancel()"
      >
        <app-icon name="stop-filled-alt" />
        <span>{{ isCanceling() ? 'Wird abgebrochen…' : 'Abbrechen' }}</span>
      </button>
    } @else {
      <button
        type="button"
        class="search-button btn-primary"
        [disabled]="!canStart()"
        [attr.aria-describedby]="blockedHint() ? 'search-blocked-hint' : null"
        (click)="start()"
      >
        <app-icon name="search" />
        <span>Suchen</span>
      </button>
      @if (blockedHint(); as hint) {
        <!-- A profile hint leads to the fields that are missing. -->
        @if (hint === profileHint) {
          <a id="search-blocked-hint" class="hint" routerLink="/settings">{{ hint }}</a>
        } @else {
          <span id="search-blocked-hint" class="hint">{{ hint }}</span>
        }
      }
    }

    <app-status-line />
    <app-popup-message />

    @if (isRunning()) {
      <div class="scan-track" aria-hidden="true"><div class="scan"></div></div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 20px;
      min-height: var(--top-bar-height);
      padding: 10px 24px;
      background: var(--bg-page);
    }

    @media (min-width: 1220px) {
      :host {
        position: sticky;
        top: 0;
        z-index: 5;
      }
    }

    .wordmark {
      padding-right: 12px;
      font-weight: 600;
      font-size: 16px;
      letter-spacing: -0.005em;
      color: var(--text-strong);
    }

    .search-button {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 40px;
      padding: 0 18px;
      border-radius: var(--radius-button);
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    /* Pulls the hint next to the button, the bar's gap is meant for the main parts. */
    .hint {
      margin-left: -10px;
      font-size: 13px;
      color: var(--text-dim);
    }

    a.hint {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
      text-underline-offset: 3px;
    }

    a.hint:hover {
      color: var(--text-muted);
      text-decoration-color: currentColor;
    }

    .scan-track {
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 1px;
      background: var(--line);
      overflow: hidden;
    }

    .scan {
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        var(--fit-high) 40%,
        #e4f5ea 50%,
        var(--fit-high) 60%,
        transparent
      );
      background-size: 200% 100%;
      animation: scan 1.8s linear infinite;
    }

    @keyframes scan {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scan {
        animation: none;
        background: var(--fit-medium);
      }
    }
  `,
})
export class TopBar {
  private readonly statusService = inject(StatusService);
  private readonly runService = inject(RunService);

  private readonly latestRunId = computed(() => this.statusService.status()?.search.run?.id ?? null);
  /** Latest run id at the "Suchen" click, cleared implicitly once a newer run shows up. */
  private readonly runIdBeforeStart = signal<number | null | undefined>(undefined);
  private readonly cancelingRunId = signal<number | null>(null);

  readonly profileHint = PROFILE_HINT;

  readonly isRunning = this.statusService.isRunning;
  readonly isStarting = computed(
    () => this.runIdBeforeStart() !== undefined && this.runIdBeforeStart() === this.latestRunId(),
  );
  readonly isCanceling = computed(
    () => this.isRunning() && this.cancelingRunId() === this.latestRunId(),
  );
  readonly blockedHint = computed(() => {
    const reason = this.statusService.status()?.search.blockedReason;
    return reason ? BLOCKED_HINTS[reason] : null;
  });
  readonly canStart = computed(
    () => this.statusService.status() !== null && !this.blockedHint() && !this.isStarting(),
  );

  start(): void {
    this.runIdBeforeStart.set(this.latestRunId());
    this.runService.start().subscribe({
      next: () => this.statusService.refresh(),
      error: () => {
        this.runIdBeforeStart.set(undefined);
        this.statusService.refresh();
      },
    });
  }

  cancel(): void {
    const runId = this.latestRunId();
    if (runId === null) {
      return;
    }
    this.cancelingRunId.set(runId);
    this.runService.cancel(runId).subscribe({
      next: () => this.statusService.refresh(),
      error: () => {
        this.cancelingRunId.set(null);
        this.statusService.refresh();
      },
    });
  }
}
