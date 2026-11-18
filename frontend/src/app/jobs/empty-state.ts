import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { IconName } from '../icons/icon-paths';

/** Centered message for a list or panel with nothing to show. Fills the free height of a flex column. */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-icon [name]="icon()" [size]="24" />
    <p class="headline">{{ headline() }}</p>
    <p class="text">{{ text() }}</p>
  `,
  styles: `
    :host {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }

    app-icon {
      margin-bottom: 6px;
      color: var(--text-dim);
    }

    p {
      margin: 0;
      text-wrap: balance;
    }

    .headline {
      font-family: var(--font-display);
      font-size: 20px;
      line-height: 1.2;
      color: var(--text);
    }

    .text {
      max-width: 34ch;
      color: var(--text-muted);
    }
  `,
})
export class EmptyState {
  readonly icon = input.required<IconName>();
  readonly headline = input.required<string>();
  readonly text = input.required<string>();
}
