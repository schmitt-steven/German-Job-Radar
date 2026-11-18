import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusService } from '../status/status-service';
import { Run, RunStatus, Status } from '../status/status-types';
import { PopupService } from './popup-service';

function status(id: number, overallStatus: RunStatus, newJobCount = 0): Status {
  return {
    search: {
      blockedReason: null,
      run: { id, overallStatus, newJobCount, isInitialSearch: false } as Run,
    },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

describe('PopupService', () => {
  const current = signal<Status | null>(null);
  let service: PopupService;

  beforeEach(() => {
    current.set(null);
    TestBed.configureTestingModule({
      providers: [{ provide: StatusService, useValue: { status: current.asReadonly() } }],
    });
    service = TestBed.inject(PopupService);
    TestBed.tick();
  });

  /** One poll: the status changes and the effects behind toObservable run. */
  function poll(next: Status): void {
    current.set(next);
    TestBed.tick();
  }

  it('is empty until a search finishes', () => {
    poll(status(5, 'RUNNING'));

    expect(service.current()).toBeNull();
  });

  it('shows the popup once the run finished', () => {
    poll(status(5, 'RUNNING'));
    poll(status(5, 'SUCCESS', 6));

    expect(service.current()?.headline).toBe('6 neue Jobs gefunden');
  });

  it('keeps the popup on later polls until it is dismissed', () => {
    poll(status(5, 'RUNNING'));
    poll(status(5, 'SUCCESS', 6));
    poll(status(5, 'SUCCESS', 6));
    expect(service.current()).not.toBeNull();

    service.dismiss();
    poll(status(5, 'SUCCESS', 6));
    expect(service.current()).toBeNull();
  });

  it('replaces the older popup with a newer one under a new id', () => {
    poll(status(5, 'RUNNING'));
    poll(status(5, 'SUCCESS', 6));
    const first = service.current();
    poll(status(6, 'RUNNING'));
    poll(status(6, 'FAILED'));

    expect(service.current()?.headline).toBe('Suche fehlgeschlagen');
    expect(service.current()?.id).not.toBe(first?.id);
  });
});
