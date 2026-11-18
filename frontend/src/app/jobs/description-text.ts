import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseDescription } from './description-format';

@Component({
  selector: 'app-description-text',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #inline let-spans>
      @for (span of spans; track $index) {
        @if (span.href) {
          <a [href]="span.href" target="_blank" rel="noopener noreferrer">{{ span.text }}</a>
        } @else if (span.isBold) {
          <strong>{{ span.text }}</strong>
        } @else {
          <!-- No whitespace around the text, it would show next to bold and links. -->
          <ng-container>{{ span.text }}</ng-container>
        }
      }
    </ng-template>

    @for (block of blocks(); track $index) {
      @switch (block.kind) {
        @case ('heading') {
          <h4 [class]="'level-' + block.level">
            <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.spans }" />
          </h4>
        }
        @case ('subheading') {
          <h4 class="subheading">
            <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.spans }" />
          </h4>
        }
        @case ('list') {
          <ul>
            @for (item of block.items; track $index) {
              <li>
                <ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" />
              </li>
            }
          </ul>
        }
        @case ('paragraph') {
          <p>
            <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.spans }" />
          </p>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
      font-size: 15px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    p,
    ul,
    h4 {
      margin: 0;
    }

    p {
      white-space: pre-line;
    }

    h4 {
      color: var(--text-strong);
      line-height: 1.3;
    }

    /* Only real Markdown headings get a size, a detected subheading may be wrong. */
    h4.subheading {
      margin-top: 10px;
      font-size: inherit;
      font-weight: 600;
    }

    h4.level-1 {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 400;
    }

    h4.level-2 {
      margin-top: 10px;
      font-family: var(--font-display);
      font-size: 19px;
      font-weight: 400;
    }

    h4.level-3,
    h4.level-4,
    h4.level-5,
    h4.level-6 {
      margin-top: 10px;
      font-size: 16px;
      font-weight: 600;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-left: 22px;
      list-style: disc;
    }

    li::marker {
      color: var(--text-dim);
    }

    strong {
      font-weight: 600;
      color: var(--text);
    }

    a {
      text-underline-offset: 3px;
    }
  `,
})
export class DescriptionText {
  readonly text = input.required<string>();

  protected readonly blocks = computed(() => parseDescription(this.text()));
}
