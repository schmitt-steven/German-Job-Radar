import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StatusService } from './status-service';
import { Status } from './status-types';

function status(overallStatus: 'RUNNING' | 'SUCCESS' | null): Status {
  return {
    search: {
      blockedReason: null,
      run: overallStatus === null ? null : ({ id: 1, overallStatus } as Status['search']['run']),
    },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

describe('StatusService', () => {
  let service: StatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('polls every 30 s while idle', () => {
    http.expectOne('/api/status').flush(status(null));
    expect(service.isRunning()).toBe(false);

    vi.advanceTimersByTime(29_000);
    http.expectNone('/api/status');
    vi.advanceTimersByTime(1_000);
    http.expectOne('/api/status').flush(status('SUCCESS'));
  });

  it('polls every 2 s while a run is running', () => {
    http.expectOne('/api/status').flush(status('RUNNING'));
    expect(service.isRunning()).toBe(true);

    vi.advanceTimersByTime(2_000);
    http.expectOne('/api/status').flush(status('RUNNING'));
  });

  it('keeps the last status and retries after 2 s when the backend is unreachable', () => {
    http.expectOne('/api/status').flush(status('SUCCESS'));
    vi.advanceTimersByTime(30_000);
    http.expectOne('/api/status').error(new ProgressEvent('error'));

    expect(service.status()?.search.run?.overallStatus).toBe('SUCCESS');
    vi.advanceTimersByTime(2_000);
    http.expectOne('/api/status').flush(status('SUCCESS'));
  });

  it('polls right away on refresh()', () => {
    http.expectOne('/api/status').flush(status(null));

    service.refresh();
    http.expectOne('/api/status').flush(status('RUNNING'));
    expect(service.isRunning()).toBe(true);
  });

  it('changes a count at once with adjustCount(), never below zero', () => {
    const counted = status(null);
    counted.counts.UNSEEN = 1;
    http.expectOne('/api/status').flush(counted);

    service.adjustCount('UNSEEN', -1);
    expect(service.status()?.counts.UNSEEN).toBe(0);
    service.adjustCount('UNSEEN', -1);
    expect(service.status()?.counts.UNSEEN).toBe(0);
  });
});
