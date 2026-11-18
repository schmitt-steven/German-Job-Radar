import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { pairwise } from 'rxjs';
import { StatusService } from '../status/status-service';
import { searchPopup } from './search-popup';

/** A button that navigates, like "Anzeigen" to a job view or "Details" to a run. */
export interface PopupAction {
  label: string;
  route: string[];
  queryParams: Record<string, string> | null;
}

export interface Popup {
  /** Unique per popup, so a replacing popup slides in again. */
  id: number;
  headline: string;
  detail: string | null;
  action: PopupAction | null;
}

/** The one popup slot in the top bar: a newer popup replaces the older one. */
@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly slot = signal<Popup | null>(null);
  readonly current = this.slot.asReadonly();
  private lastId = 0;

  constructor() {
    // Popups fire on a change between two polls, so each status is compared with the one before.
    toObservable(inject(StatusService).status)
      .pipe(pairwise(), takeUntilDestroyed())
      .subscribe(([previous, current]) => {
        const content = searchPopup(previous, current);
        if (content) {
          this.slot.set({ id: ++this.lastId, ...content });
        }
      });
  }

  dismiss(): void {
    this.slot.set(null);
  }
}
