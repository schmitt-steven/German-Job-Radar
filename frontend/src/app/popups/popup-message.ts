import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { PopupService } from './popup-service';

/** The popup at the right end of the top bar. The host stays in the DOM so screen readers announce changes. */
@Component({
  selector: 'app-popup-message',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', 'aria-live': 'polite' },
  template: `
    <!-- A list of zero or one, tracked by id, so a replacing popup is a new element and slides in again. -->
    @for (popup of shown(); track popup.id) {
      <div class="popup">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">
          <span class="headline">{{ popup.headline }}</span>
          @if (popup.detail) {
            <span class="detail"> {{ popup.detail }}</span>
          }
        </span>
        @if (popup.action; as action) {
          <button
            type="button"
            class="action btn-soft"
            [routerLink]="action.route"
            [queryParams]="action.queryParams"
            (click)="dismiss()"
          >
            {{ action.label }}
          </button>
        }
        <button type="button" class="close" aria-label="Schließen" (click)="dismiss()">
          <app-icon name="close" [size]="16" />
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      margin-left: auto;
      min-width: 0;
    }

    .popup {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      min-width: 0;
      animation: rise 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .dot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--fit-high);
    }

    .text {
      font-size: 13px;
      white-space: nowrap;
    }

    .headline {
      font-weight: 500;
      color: var(--text-strong);
    }

    .detail {
      color: var(--text-muted);
    }

    .action {
      height: 30px;
      padding: 0 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
    }

    .close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }

    .close:hover {
      background: rgba(255, 240, 220, 0.06);
    }

    @keyframes rise {
      from {
        transform: translateY(-10px);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .popup {
        animation: none;
      }
    }
  `,
})
export class PopupMessage {
  private readonly popupService = inject(PopupService);

  readonly shown = computed(() => {
    const popup = this.popupService.current();
    return popup ? [popup] : [];
  });

  dismiss(): void {
    this.popupService.dismiss();
  }
}
