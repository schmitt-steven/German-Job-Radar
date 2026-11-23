import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../icons/icon';
import { injectJobView, jobViewParams } from '../jobs/job-view';
import { RecentRuns } from '../runs/recent-runs';
import { StatusService } from '../status/status-service';
import { JobView } from '../status/status-types';

interface ViewLink {
  view: JobView;
  label: string;
  isDividedFromAbove?: boolean;
}

// "Von KI aussortiert" joins with triage in milestone 4.
const VIEW_LINKS: ViewLink[] = [
  { view: 'ALL', label: 'Alle' },
  { view: 'UNSEEN', label: 'Ungesehen' },
  { view: 'HEARTED', label: 'Gemerkt' },
  { view: 'APPLIED', label: 'Beworben' },
  { view: 'REJECTED', label: 'Abgelehnt' },
  { view: 'EXCLUDED', label: 'Ausgeschlossen', isDividedFromAbove: true },
  { view: 'OFFLINE', label: 'Nicht mehr online' },
];

@Component({
  selector: 'aside[app-sidebar]',
  imports: [RouterLink, RouterLinkActive, RecentRuns, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pinned-column' },
  template: `
    <a
      class="new-tile"
      routerLink="/"
      [queryParams]="params('NEW')"
      [attr.aria-current]="currentView() === 'NEW' ? 'page' : null"
    >
      <span>Neueste Treffer</span>
      <span class="new-count">{{ counts()?.NEW }}</span>
    </a>

    <nav aria-labelledby="job-views-label">
      <h2 id="job-views-label" class="group-label">Jobs</h2>
      @for (link of viewLinks; track link.view) {
        @if (link.isDividedFromAbove) {
          <div class="divider" role="separator"></div>
        }
        <a
          class="view-link"
          routerLink="/"
          [queryParams]="params(link.view)"
          [attr.aria-current]="currentView() === link.view ? 'page' : null"
        >
          <span class="label">{{ link.label }}</span>
          <span class="count">{{ counts()?.[link.view] }}</span>
        </a>
      }
    </nav>

    <section app-recent-runs></section>

    <a
      class="settings"
      routerLink="/settings"
      routerLinkActive
      ariaCurrentWhenActive="page"
    >
      <app-icon name="settings" [size]="16" />
      Einstellungen
    </a>
  `,
  styles: `
    :host {
      flex: 1 1 236px;
      display: flex;
      flex-direction: column;
      gap: var(--space-7);
      padding: var(--space-6) var(--space-4) var(--space-5) 0;
      border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
      background: var(--bg-sidebar);
    }

    a {
      text-decoration: none;
    }

    .new-tile {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
      border-radius: 0 var(--radius-button) var(--radius-button) 0;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-left: none;
      background:
        linear-gradient(to top, rgba(255, 240, 220, 0.015), rgba(255, 240, 220, 0) 70%),
        rgba(255, 240, 220, 0.025);
      color: var(--text);
      font-weight: 500;
      transition: background 0.2s;
    }

    .new-tile:hover,
    .new-tile[aria-current] {
      background:
        linear-gradient(to top, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0) 70%),
        rgba(255, 255, 255, 0.05);
    }

    .new-tile[aria-current] {
      border-color: rgba(236, 233, 226, 0.3);
    }

    .new-count {
      font-family: var(--font-display);
      font-size: var(--text-4xl);
      font-weight: 400;
      line-height: 1.1;
    }

    nav {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .view-link {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 36px;
      padding: 0 var(--space-3) 0 var(--space-6);
      border-radius: 0 var(--radius-control) var(--radius-control) 0;
      transition: background 0.15s;
    }

    .view-link:hover {
      background: rgba(255, 255, 255, 0.035);
    }

    .view-link .label {
      flex: 1;
      color: var(--text-muted);
    }

    /* Brighter than the mock's #736C62, which misses the AA contrast at 12px. */
    .view-link .count {
      font-size: var(--text-sm);
      color: var(--text-dim);
    }

    .view-link[aria-current] {
      background:
        linear-gradient(to top, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0) 65%),
        rgba(255, 255, 255, 0.06);
    }

    .view-link[aria-current] .label {
      font-weight: 500;
      color: var(--text-strong);
    }

    .view-link[aria-current] .count {
      color: var(--text-secondary);
    }

    .divider {
      height: 1px;
      margin: var(--space-1-5) var(--space-3) var(--space-1-5) var(--space-6);
      background: rgba(255, 255, 255, 0.06);
    }

    .settings {
      margin-top: auto;
      /* Its content is shorter than 40px, so in a short window it would shrink. */
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 40px;
      padding: 0 var(--space-3) 0 var(--space-6);
      border-radius: 0 var(--radius-control) var(--radius-control) 0;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left: none;
      color: var(--text-secondary);
      transition:
        background 0.15s,
        color 0.15s,
        border-color 0.15s;
    }

    .settings:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.22);
      color: var(--text-strong);
    }

    .settings[aria-current] {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.22);
      color: var(--text-strong);
    }
  `,
})
export class Sidebar {
  private readonly statusService = inject(StatusService);
  private readonly router = inject(Router);

  readonly viewLinks = VIEW_LINKS;
  readonly counts = computed(() => this.statusService.status()?.counts ?? null);
  private readonly jobView = injectJobView();
  private readonly isJobsPage = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.isAtJobsPage()),
    ),
    { initialValue: this.isAtJobsPage() },
  );
  /** Null away from the jobs page, so no view is marked in the settings. */
  readonly currentView = computed(() => (this.isJobsPage() ? this.jobView() : null));

  params(view: JobView): Record<string, string> | null {
    return jobViewParams(view);
  }

  /** The jobs page is the root, every other page has a path. */
  private isAtJobsPage(): boolean {
    return !this.router.parseUrl(this.router.url).root.hasChildren();
  }
}
