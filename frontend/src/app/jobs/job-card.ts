import { Component, ChangeDetectionStrategy, input, computed, output } from '@angular/core';
import { JobStatus, JobSummary } from './job-types';
import { Icon } from '../icons/icon';
import { SOURCE_LABELS, formatPublishedAt } from './job-format';

const STATUS_LABELS: Record<JobStatus, string | null> = {
  NOT_APPLIED: null,
  APPLIED: 'Beworben',
  REJECTED: 'Abgelehnt',
};

@Component({
  selector: 'li[app-job-card]',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dimmed]': '!job().isOnline || job().reaction === "EXCLUDED"',
    '[class.selected]': 'isSelected()',
    '(click)': 'selected.emit()',
  },
  template: `
    <span class="title-row">
      <button class="title" type="button" [attr.aria-current]="isSelected() ? 'true' : null">
        {{ job().title }}
      </button>
      @if (job().isTemporaryAgencyWork) {
        <span
          class="badge badge-neutral"
          title="Arbeitnehmerüberlassung: Du wirst bei der Zeitarbeitsfirma angestellt und an einen Kunden verliehen."
          >Zeitarbeit</span
        >
      }
      @if (isOfflineBadgeShown() && !job().isOnline) {
        <span class="badge-outline">Nicht mehr online</span>
      }
      @if (job().isNew) {
        <span class="badge badge-new">NEU</span>
      }
    </span>
    <span class="meta">
      <span class="item"><app-icon name="building" [size]="16" /><span>{{ job().company }}</span></span>
      <span class="item"><app-icon name="location" [size]="16" /><span>{{ job().location }}</span></span>
      <span class="item"><app-icon name="link" [size]="16" /><span>{{ sourceLabel() }}</span></span>
      @if (dateLabel(); as date) {
        <span class="item"><app-icon name="calendar" [size]="16" /><span>{{ date }}</span></span>
      }
      @if (statusLabel(); as status) {
        <span class="separator" aria-hidden="true">·</span>
        <span>{{ status }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
      padding: var(--space-3) var(--space-4);
      border: 1px solid transparent;
      border-radius: var(--radius-card);
      background-color: var(--bg-card);
      box-shadow: var(--shadow-card);
      transition:
        background-color 0.18s,
        transform 0.18s,
        box-shadow 0.18s;
    }

    :host(:hover) {
      background-color: var(--bg-card-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-card-hover);
    }

    :host(.selected),
    :host(.selected:hover) {
      background-color: var(--bg-details);
      background-image: linear-gradient(
        90deg,
        rgba(163, 217, 184, 0.13) 0%,
        rgba(163, 217, 184, 0.05) 35%,
        rgba(163, 217, 184, 0) 75%
      );
      background-origin: border-box;
      background-repeat: no-repeat;
      transform: none;
      box-shadow: none;
    }

    :host(.dimmed) {
      opacity: 0.7;
    }

    :host(.dimmed.selected) {
      opacity: 1;
    }

    /*
     * With the columns side by side the selected card reaches over the gap into the details,
     * and two inverse corners join it to the panel, see --tab-reach.
     */
    @media (min-width: 1220px) {
      :host(.selected),
      :host(.selected:hover) {
        position: relative;
        z-index: 1;
        /* One pixel more than the gap, so no seam shows where card and panel meet. */
        margin-right: calc(-1 * var(--tab-reach) - 1px);
        padding-right: calc(var(--tab-reach) + 1px + var(--space-2));
        border-radius: var(--radius-card) 0 0 var(--radius-card);
      }

      :host(.selected)::before,
      :host(.selected)::after {
        content: '';
        position: absolute;
        right: 0;
        width: 14px;
        height: 15px;
        background: var(--bg-details);
        mask: no-repeat 0 0 / 100% 100%;
        pointer-events: none;
      }

      /* Each corner overlaps the card by 1px, so no hairline shows between them when zoomed. */
      :host(.selected)::before {
        bottom: calc(100% - 1px);
        mask-image: var(--mask-corner-above);
      }

      :host(.selected)::after {
        top: calc(100% - 1px);
        mask-image: var(--mask-corner-below);
      }
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .title {
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      text-align: left;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-md);
      font-weight: 500;
      line-height: 1.25;
      color: var(--text-strong);
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1-5) var(--space-3);
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .item {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }

    .item app-icon {
      color: var(--text-muted);
    }

    .separator {
      color: var(--text-dimmer);
    }

    .badge {
      flex: none;
      display: inline-flex;
      align-items: center;
      height: 17px;
      padding: 1px 5px 0 6px;
      border-radius: var(--radius-badge);
      font-size: var(--text-2xs);
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }

    .badge-new {
      background: var(--text);
      color: var(--bg-page);
    }

    /* Lowercase text needs a larger size and no tracking to stay legible at this height. */
    .badge-neutral {
      padding: 0 var(--space-1-5);
      background: rgba(255, 255, 255, 0.1);
      font-size: var(--text-xs);
      font-weight: 500;
      letter-spacing: normal;
      color: var(--text-secondary);
    }

    .badge-outline {
      flex: none;
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 var(--space-1-5);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-badge);
      font-size: var(--text-xs);
      font-weight: 500;
      line-height: 1;
      color: var(--text-muted);
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      :host(:hover) {
        transition: none;
        transform: none;
      }
    }
  `,
})
export class JobCard {
  readonly job = input.required<JobSummary>();
  readonly isOfflineBadgeShown = input(false);
  readonly isSelected = input(false);
  readonly selected = output<void>();

  readonly statusLabel = computed(() => STATUS_LABELS[this.job().status]);
  readonly sourceLabel = computed(() => {
    const sources = this.job().sources;
    return sources.length > 1
      ? `${SOURCE_LABELS[sources[0]]} +${sources.length - 1}`
      : SOURCE_LABELS[sources[0]];
  });

  readonly dateLabel = computed(() => {
    const publishedAt = this.job().publishedAt;
    return publishedAt ? formatPublishedAt(publishedAt, new Date()) : null;
  });
}
