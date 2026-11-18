import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * What the save bar shows. `OPEN` waits for a field to be finished,
 * `INVALID` and `FAILED` are both "Nicht gespeichert".
 */
export type SaveState = 'ALL_SAVED' | 'SAVING' | 'OPEN' | 'INVALID' | 'FAILED';

const TITLES: Record<SaveState, string> = {
  ALL_SAVED: 'Alles gespeichert',
  SAVING: 'Speichere…',
  OPEN: 'Änderung offen',
  INVALID: 'Nicht gespeichert',
  FAILED: 'Nicht gespeichert',
};

/** The sticky bar at the bottom of a settings panel that says whether the autosave went through. */
@Component({
  selector: 'app-save-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()' },
  template: `
    <div class="status" role="status">
      <span class="dot" aria-hidden="true"></span>
      <span class="text">
        <span class="title">{{ title() }}</span>
        @if (reason()) {
          <span class="reason">{{ reason() }}</span>
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      position: sticky;
      bottom: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      /* Spans the panel's side padding. */
      margin: 32px -28px 0;
      padding: 12px 28px 16px;
      background: var(--bg-details);
    }

    /* Fades the content that scrolls under the bar. */
    :host::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 100%;
      height: 20px;
      background: linear-gradient(var(--bg-details-clear), var(--bg-details));
      pointer-events: none;
    }

    .status {
      flex: 1 1 260px;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .dot {
      flex: none;
      width: 7px;
      height: 7px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--fit-low);
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-muted);
    }

    .reason {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text-muted);
    }

    :host([data-state='SAVING']) .dot {
      background: var(--fit-high);
      animation: pulse 1.6s ease-in-out infinite;
    }

    :host([data-state='SAVING']) .title {
      color: var(--text);
    }

    :host([data-state='OPEN']) .dot {
      background: var(--text);
    }

    :host([data-state='OPEN']) .title {
      color: var(--text-strong);
    }

    :host([data-state='INVALID']) .dot,
    :host([data-state='FAILED']) .dot {
      background: var(--red);
    }

    :host([data-state='INVALID']) .title,
    :host([data-state='FAILED']) .title {
      color: var(--red-text);
    }

    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host([data-state='SAVING']) .dot {
        animation: none;
      }
    }
  `,
})
export class SaveBar {
  readonly state = input.required<SaveState>();
  /** The line below the title, why a change is open or was not saved. */
  readonly reason = input<string | null>(null);

  readonly title = computed(() => TITLES[this.state()]);
}
