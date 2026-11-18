import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  linkedSignal,
  signal,
} from '@angular/core';
import { JobService } from './job-service';
import { injectJobView } from './job-view';
import { JobFilter, JobSummary } from './job-types';
import { Page } from '../page';
import {
  rxResource,
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { debounce, filter, map, of, pairwise, timer } from 'rxjs';
import { finishedRun } from '../status/finished-run';
import { StatusService } from '../status/status-service';
import { JobView } from '../status/status-types';
import { EmptyState } from './empty-state';
import { JobCard } from './job-card';
import { JobToolbar } from './job-toolbar';
import { JobChanges } from './job-changes';
import { SelectedJob } from './selected-job';

export const QUERY_DEBOUNCE_MS = 300;

const TITLES: Record<JobView, string> = {
  ALL: 'Alle Jobs',
  NEW: 'Neu seit letzter Suche',
  UNSEEN: 'Ungesehen',
  HEARTED: 'Gemerkt',
  APPLIED: 'Beworben',
  REJECTED: 'Abgelehnt',
  EXCLUDED: 'Ausgeschlossen',
  OFFLINE: 'Nicht mehr online',
  SORTED_OUT: 'Von KI aussortiert',
};

@Component({
  selector: 'main[app-job-list]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, JobCard, JobToolbar],
  template: `
    <div class="heading">
      <h1>{{ title() }}</h1>
      @if (jobs.isLoading()) {
        <span
          class="loading spinner spinner-delayed"
          role="img"
          aria-label="Jobs werden geladen"
        ></span>
      }
    </div>
    <app-job-toolbar
      [view]="currentView()"
      [(query)]="query"
      [(company)]="company"
      [(location)]="location"
    />

    @if (jobs.error() && pageNumber() === 0) {
      <p>Jobs konnten nicht geladen werden.</p>
    } @else if (loaded(); as loaded) {
      @if (loaded.jobs.length === 0) {
        @if (isNoNewJobsTextShown()) {
          <app-empty-state
            icon="radar"
            headline="Noch keine neuen Jobs"
            text="Neue Treffer der nächsten Suche erscheinen hier."
          />
        } @else {
          <app-empty-state icon="filter" headline="Kein Signal" text="Nichts passt zu diesen Filtern." />
        }
      } @else {
        <ul [attr.aria-busy]="jobs.isLoading()">
          @for (job of rows(); track job.id) {
            <li
              app-job-card
              [job]="job"
              [isOfflineBadgeShown]="isOfflineBadgeShown()"
              [isSelected]="job.id === selectedJob.id()"
              (selected)="selectedJob.select(job)"
            ></li>
          }
        </ul>
      }
      @if (loaded.hasMore) {
        <div class="more">
          @if (jobs.error()) {
            <p role="alert">Weitere Jobs konnten nicht geladen werden.</p>
          }
          <button class="btn-soft" type="button" [disabled]="jobs.isLoading()" (click)="loadMore()">
            Mehr laden
          </button>
          <p>{{ loaded.jobs.length }} von {{ loaded.total }} Jobs</p>
        </div>
      }
    }
  `,
  styles: `
    .heading {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 12px;
    }

    h1 {
      font-size: 26px;
      line-height: 1.15;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    p {
      margin: 0;
      color: var(--text-muted);
    }

    .more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }

    .more button {
      height: 40px;
      padding: 0 22px;
      border-radius: var(--radius-button);
      color: var(--text-secondary);
    }

    .more p {
      font-size: 13px;
      color: var(--text-dim);
    }
  `,
})
export class JobList {
  private readonly jobService = inject(JobService);
  protected readonly selectedJob = inject(SelectedJob);
  private readonly changes = inject(JobChanges);

  readonly currentView = injectJobView();
  readonly title = computed(() => TITLES[this.currentView()]);

  readonly query = signal<string | null>(null);
  readonly company = signal<string | null>(null);
  readonly location = signal<string | null>(null);

  readonly isOfflineBadgeShown = computed(() =>
    ['HEARTED', 'APPLIED', 'REJECTED'].includes(this.currentView()),
  );

  /** The query once typing paused, so not every keystroke loads the jobs. A cleared one applies at once. */
  private readonly debouncedQuery = toSignal(
    toObservable(this.query).pipe(
      debounce((query) => (query ? timer(QUERY_DEBOUNCE_MS) : of(null))),
    ),
    { initialValue: null },
  );

  private readonly filter = computed<JobFilter>(() => ({
    view: this.currentView(),
    query: this.debouncedQuery(),
    company: this.company(),
    location: this.location(),
    source: [],
    sort: 'DATE',
  }));

  /** Only without filters, otherwise the filters are why the list is empty. */
  readonly isNoNewJobsTextShown = computed(() => {
    const filter = this.filter();
    return filter.view === 'NEW' && !filter.query && !filter.company && !filter.location;
  });

  /** Back to the first page whenever the filter changes. */
  readonly pageNumber = linkedSignal({ source: this.filter, computation: () => 0 });

  readonly jobs = rxResource({
    params: () => ({ filter: this.filter(), page: this.pageNumber() }),
    stream: ({ params }) => this.jobService.getJobs(params.filter, params.page),
  });

  /** The jobs of all loaded pages. Stays while the next page or filter loads, so the list doesn't flash empty. */
  readonly loaded = linkedSignal<Page<JobSummary> | undefined, LoadedJobs | undefined>({
    // value() throws in the error state, hasValue() guards it.
    source: () => (this.jobs.hasValue() ? this.jobs.value() : undefined),
    computation: (page, previous) => {
      if (!page) {
        return previous?.value;
      }
      const shownJobs = page.page.number === 0 ? [] : (previous?.value?.jobs ?? []);
      // The order can shift between pages, so a job may come again.
      const shownIds = new Set(shownJobs.map((job) => job.id));
      return {
        jobs: [...shownJobs, ...page.content.filter((job) => !shownIds.has(job.id))],
        total: page.page.totalElements,
        hasMore: page.page.number + 1 < page.page.totalPages,
      };
    },
  });

  /** The loaded jobs with the changes saved since they were loaded. */
  protected readonly rows = computed(
    () => this.loaded()?.jobs.map((job) => this.changes.apply(job)) ?? [],
  );

  constructor() {
    // The list was empty before the initial search, so its jobs show at once, without "Anzeigen".
    toObservable(inject(StatusService).status)
      .pipe(
        pairwise(),
        map(([previous, current]) => finishedRun(previous, current)),
        filter((run) => !!run?.isInitialSearch && run.newJobCount > 0),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.reload());
  }

  /** Loads the first page again with the current filter. */
  private reload(): void {
    this.pageNumber.set(0);
    this.jobs.reload();
  }

  loadMore(): void {
    if (this.jobs.error()) {
      this.jobs.reload();
    } else {
      this.pageNumber.update((number) => number + 1);
    }
  }
}

interface LoadedJobs {
  jobs: JobSummary[];
  total: number;
  hasMore: boolean;
}
