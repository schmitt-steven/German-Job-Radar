import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icon } from '../icons/icon';
import { DescriptionText } from './description-text';
import { EmptyState } from './empty-state';
import { StatusService } from '../status/status-service';
import { SOURCE_LABELS, formatGoneAt, formatPublishedAt } from './job-format';
import { JobChanges } from './job-changes';
import { SourceType } from '../status/status-types';
import { JobPosting, JobStatus, JobSummary } from './job-types';
import { SelectedJob } from './selected-job';

const STEPS: readonly { status: JobStatus; label: string }[] = [
  { status: 'NOT_APPLIED', label: 'Nicht beworben' },
  { status: 'APPLIED', label: 'Beworben' },
  { status: 'REJECTED', label: 'Abgelehnt' },
];

@Component({
  selector: 'section[app-job-details]',
  imports: [DescriptionText, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown(); as shown) {
      <header>
        <div class="title-row">
          <h2>{{ shown.title }}</h2>
          @if (!shown.isOnline) {
            <span class="badge-outline">Nicht mehr online</span>
          }
          <div class="reactions">
            <button
              class="btn-soft heart"
              type="button"
              [attr.aria-pressed]="shown.reaction === 'HEARTED'"
              [disabled]="changes.savingId() === shown.id"
              (click)="changes.toggleReaction(shown, 'HEARTED')"
            >
              <app-icon [name]="shown.reaction === 'HEARTED' ? 'favorite-filled' : 'favorite'" />
              {{ shown.reaction === 'HEARTED' ? 'Gemerkt' : 'Merken' }}
            </button>
            <button
              class="exclude"
              type="button"
              [attr.aria-pressed]="shown.reaction === 'EXCLUDED'"
              [disabled]="changes.savingId() === shown.id"
              (click)="changes.toggleReaction(shown, 'EXCLUDED')"
            >
              <app-icon [name]="shown.reaction === 'EXCLUDED' ? 'close-filled' : 'close-outline'" />
              {{ shown.reaction === 'EXCLUDED' ? 'Ausgeschlossen' : 'Ausschließen' }}
            </button>
          </div>
        </div>
        @if (changes.failedId() === shown.id) {
          <p class="error" role="alert">Speichern fehlgeschlagen. Bitte noch einmal versuchen.</p>
        }
        <div class="meta">
          <span class="item"
            ><app-icon name="building" /><span>{{ shown.company }}</span></span
          >
          @if (shown.isTemporaryAgencyWork) {
            <span class="badge-neutral">Zeitarbeit</span>
          }
          <span class="item"
            ><app-icon name="location" /><span>{{ shown.location }}</span></span
          >
          @if (publishedLabel(); as published) {
            <span class="item"
              ><app-icon name="calendar" /><span>{{ published }}</span></span
            >
          }
        </div>
        <div class="sources">
          <span class="label item"><app-icon name="link" />Gefunden auf:</span>
          @if (detail(); as detail) {
            @for (posting of detail.postings; track posting.id) {
              <span class="source">
                <a [href]="posting.url" target="_blank" rel="noopener noreferrer">{{
                  sourceLabel(posting.source)
                }}</a>
                @if (goneLabel(posting); as gone) {
                  <span class="gone">{{ gone }}</span>
                }
              </span>
            }
          } @else {
            <!-- The links come with the details, until then the list's sources without them. -->
            @for (source of shown.sources; track source) {
              <span class="source">{{ sourceLabel(source) }}</span>
            }
          }
        </div>
      </header>

      <section class="status" role="group" aria-label="Status">
        <h3>Status</h3>
        <div class="steps">
          @for (step of steps; track step.status; let i = $index) {
            @if (i > 0) {
              <span
                class="connector"
                [class.reached]="i <= currentStep()"
                aria-hidden="true"
              ></span>
            }
            <button
              class="step"
              type="button"
              [class.reached]="i <= currentStep()"
              [class.rejected]="step.status === 'REJECTED'"
              [attr.aria-pressed]="i === currentStep()"
              [disabled]="changes.savingId() === shown.id"
              (click)="changes.setStatus(shown, step.status)"
            >
              <span class="node"></span>
              <span>{{ step.label }}</span>
            </button>
          }
        </div>
      </section>

      <section
        class="description"
        aria-labelledby="description-title"
        [attr.aria-busy]="job.isLoading()"
      >
        <div class="description-head">
          <h3 id="description-title">Stellenanzeige</h3>
          @if (description() && mainPosting(); as main) {
            <span class="source-note"
              >Text von
              <a [href]="main.url" target="_blank" rel="noopener noreferrer">{{
                mainSourceLabel()
              }}</a></span
            >
          }
        </div>
        @if (detail(); as detail) {
          @if (description(); as text) {
            <app-description-text [text]="text" />
          } @else if (detail.descriptionError) {
            <p>
              Beschreibung konnte nicht geladen werden ·
              <button class="link" type="button" (click)="job.reload()">Erneut versuchen</button>
            </p>
          }
        } @else if (job.error()) {
          <p role="alert">
            Beschreibung konnte nicht geladen werden ·
            <button class="link" type="button" (click)="job.reload()">Erneut versuchen</button>
          </p>
        } @else {
          <p class="loading" role="status">
            <span class="spinner" aria-hidden="true"></span>
            Beschreibung wird geladen…
          </p>
        }
      </section>
    } @else {
      @if (hasNoJobs()) {
        <app-empty-state icon="search" headline="Noch keine Jobs" text="Starte oben eine Suche." />
      } @else {
        <app-empty-state
          icon="document"
          headline="Kein Job ausgewählt"
          text="Wähle einen Job aus der Liste."
        />
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-10);
    }

    header {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    /* The buttons move below the title once it would get narrower than 300px. */
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--space-3) var(--space-4);
    }

    h2 {
      flex: 1 1 300px;
      min-width: 0;
      font-size: var(--text-4xl);
      line-height: 1.15;
      letter-spacing: -0.01em;
      text-wrap: balance;
      /* A word wider than the panel hyphenates, or breaks as a last resort. */
      hyphens: auto;
      overflow-wrap: break-word;
    }

    .reactions {
      flex: none;
      display: flex;
      gap: var(--space-1-5);
      margin-top: -1px;
    }

    .reactions button {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 36px;
      padding: 0 var(--space-4) 0 var(--space-3);
      border-radius: var(--radius-button);
      font-size: var(--text-sm);
      font-weight: 500;
      cursor: pointer;
    }

    .reactions button:disabled {
      cursor: progress;
    }

    .heart[aria-pressed='true'] {
      background-color: var(--text);
      border-color: var(--text);
      color: var(--bg-sidebar);
      font-weight: 600;
    }

    .heart[aria-pressed='true']:hover:enabled {
      background-color: #fbf8f2;
      border-color: #fbf8f2;
    }

    .heart app-icon {
      color: var(--text-muted);
      transition: transform 0.2s;
    }

    .heart[aria-pressed='false']:hover:enabled app-icon {
      transform: scale(1.12);
    }

    .heart[aria-pressed='true'] app-icon {
      color: inherit;
    }

    .reactions button:active:enabled {
      transform: scale(0.98);
    }

    .exclude {
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-dim);
      transition:
        background-color 0.15s,
        border-color 0.15s,
        color 0.15s;
    }

    .exclude:hover:enabled {
      background-color: rgba(229, 115, 111, 0.1);
      color: var(--red-text);
    }

    .exclude[aria-pressed='true'] {
      background-color: rgba(229, 115, 111, 0.14);
      border-color: rgba(229, 115, 111, 0.28);
      color: var(--red-text);
    }

    .exclude app-icon {
      color: var(--text-muted);
    }

    .exclude:hover:enabled app-icon,
    .exclude[aria-pressed='true'] app-icon {
      color: var(--red);
    }

    .error {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--red-text);
    }

    .status {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .status h3 {
      font-size: var(--text-2xl);
      line-height: 1.2;
    }

    .steps {
      display: flex;
      align-items: center;
    }

    .step {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 36px;
      padding: 0 var(--space-1);
      border: 0;
      background: none;
      font-size: var(--text-sm);
      color: var(--text-dim);
      cursor: pointer;
    }

    .step:disabled {
      cursor: progress;
    }

    .step.reached {
      color: var(--text-muted);
    }

    .step[aria-pressed='true'] {
      color: var(--text-strong);
    }

    .node {
      width: 12px;
      height: 12px;
      border: 1.5px solid rgba(236, 233, 226, 0.4);
      border-radius: 50%;
      transition:
        background 0.2s,
        border-color 0.2s,
        box-shadow 0.2s;
    }

    .step:hover:enabled .node {
      border-color: rgba(236, 233, 226, 0.6);
    }

    .step.reached .node {
      border-color: var(--text);
      background: var(--text);
    }

    .step[aria-pressed='true'] .node {
      box-shadow: 0 0 0 4px rgba(255, 236, 210, 0.09);
    }

    .step.rejected[aria-pressed='true'] .node {
      border-color: var(--red);
      background: var(--red);
    }

    .connector {
      flex: 1;
      min-width: 16px;
      height: 1px;
      margin: 0 var(--space-2);
      background: rgba(236, 233, 226, 0.22);
    }

    .connector.reached {
      background: rgba(236, 233, 226, 0.55);
    }

    .meta,
    .sources {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-2);
      color: var(--text-muted);
      font-size: var(--text-base);
    }

    .meta {
      column-gap: var(--space-4);
    }

    .item {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1-5);
    }

    .item app-icon {
      color: var(--text-muted);
    }

    .sources {
      padding-top: var(--space-1-5);
      gap: var(--space-1) var(--space-3);
      font-size: var(--text-sm);
    }

    .label,
    .gone {
      color: var(--text-dim);
    }

    .source {
      display: inline-flex;
      align-items: baseline;
      gap: var(--space-1-5);
    }

    .source a {
      color: var(--text-muted);
      text-decoration: underline;
      text-decoration-color: transparent;
      text-underline-offset: 3px;
      transition: color 0.15s;
    }

    .source a:hover {
      color: var(--text-secondary-alt);
      text-decoration-color: rgba(226, 222, 214, 0.4);
    }

    .badge-neutral,
    .badge-outline {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 var(--space-1-5);
      border-radius: var(--radius-badge);
      font-size: var(--text-xs);
      font-weight: 500;
      white-space: nowrap;
    }

    .badge-neutral {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }

    .badge-outline {
      border: 1px solid var(--line-strong);
      color: var(--text-muted);
    }

    .description {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .description p {
      margin: 0;
    }

    .description-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-2) var(--space-4);
    }

    .description h3 {
      font-size: var(--text-2xl);
      line-height: 1.2;
    }

    .source-note {
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .source-note a {
      color: var(--text);
      text-decoration: underline;
      text-decoration-color: rgba(236, 233, 226, 0.35);
      text-underline-offset: 3px;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
    }

    .link {
      padding: 0;
      border: 0;
      background: none;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class JobDetails {
  private readonly status = inject(StatusService);
  protected readonly selectedJob = inject(SelectedJob);
  protected readonly changes = inject(JobChanges);

  /** Opening marks the job seen and loads its description, so every selection opens it. */
  protected readonly job = rxResource({
    params: () => this.selectedJob.id() ?? undefined,
    // The id comes from the summary, so the summary is set whenever this runs.
    stream: () => this.changes.open(this.selectedJob.summary()!),
  });

  /** The opened job, once it is here. */
  protected readonly detail = computed(() => {
    const opened = this.job.hasValue() ? this.job.value() : null;
    return opened?.id === this.selectedJob.id() ? opened : null;
  });

  /** What the header shows: the opened job, until then the list's data of it, with saved changes. */
  protected readonly shown = computed<JobSummary | null>(() => {
    const job = this.detail() ?? this.selectedJob.summary();
    return job && this.changes.apply(job);
  });

  protected readonly steps = STEPS;
  /** The index of the job's step, the steps up to it count as reached. */
  protected readonly currentStep = computed(() =>
    STEPS.findIndex((step) => step.status === this.shown()?.status),
  );

  protected readonly hasNoJobs = computed(() => this.status.status()?.counts.ALL === 0);

  protected readonly mainPosting = computed(() =>
    this.detail()?.postings.find((posting) => posting.isMain),
  );

  protected readonly description = computed(() => this.mainPosting()?.description ?? null);
  protected readonly mainSourceLabel = computed(() => {
    const main = this.mainPosting();
    return main ? SOURCE_LABELS[main.source] : '';
  });

  protected readonly publishedLabel = computed(() => {
    const publishedAt = this.shown()?.publishedAt;
    return publishedAt ? formatPublishedAt(publishedAt, new Date()) : null;
  });

  protected sourceLabel(source: SourceType): string {
    return SOURCE_LABELS[source];
  }

  /** "nicht mehr online seit 3. Okt." for a gone posting, nothing for an online one. */
  protected goneLabel(posting: JobPosting): string | null {
    return posting.goneAt ? `nicht mehr online seit ${formatGoneAt(posting.goneAt)}` : null;
  }
}
