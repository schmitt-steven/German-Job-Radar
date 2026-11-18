import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Page } from '../page';
import { StatusService } from '../status/status-service';
import { Run, Status } from '../status/status-types';
import { RecentRuns } from './recent-runs';

@Component({
  imports: [RecentRuns],
  template: '<section app-recent-runs></section>',
})
class Host {}

function run(id: number, overrides: Partial<Run> = {}): Run {
  return {
    id,
    startedAt: '2025-03-01T08:30:00Z',
    finishedAt: '2025-03-01T08:31:00Z',
    overallStatus: 'SUCCESS',
    phase: null,
    remainingCount: null,
    newJobCount: 6,
    isInitialSearch: false,
    sourceCount: 1,
    finishedSourceCount: 1,
    failedSourceCount: 0,
    checkedJobCount: 212,
    sourceResults: [],
    ...overrides,
  };
}

function status(latestRun: Run | null): Status {
  return {
    search: { blockedReason: null, run: latestRun },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

function page(runs: Run[]): Page<Run> {
  return {
    content: runs,
    page: { size: 4, number: 0, totalElements: runs.length, totalPages: 1 },
  };
}

describe('RecentRuns', () => {
  const current = signal<Status | null>(null);
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;

  beforeEach(() => {
    current.set(null);
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StatusService, useValue: { status: current.asReadonly() } },
      ],
    });
    fixture = TestBed.createComponent(Host);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map((row) =>
      [...row.querySelectorAll('.time, .outcome, .detail')].map((span) => span.textContent).join(' | '),
    );
  }

  function section(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('section')!;
  }

  it('waits for the first status before loading the history', async () => {
    await settle();
    http.expectNone('/api/runs?size=4');

    current.set(status(run(3)));
    await settle();
    http.expectOne('/api/runs?size=4').flush(page([run(3), run(2)]));
    await settle();

    const row = `01.03.2025, ${rowTime()} | +6 Jobs | 1 Quelle · 212 Jobs geprüft`;
    expect(rows()).toEqual([row, row]);
  });

  it('is hidden before the first run', async () => {
    current.set(status(null));
    await settle();
    http.expectOne('/api/runs?size=4').flush(page([]));
    await settle();

    expect(section().hidden).toBe(true);
  });

  it('shows a new run from the status at once and reloads the history for it', async () => {
    current.set(status(run(3)));
    await settle();
    http.expectOne('/api/runs?size=4').flush(page([run(3), run(2), run(1)]));

    current.set(status(run(4, { overallStatus: 'RUNNING', finishedAt: null, newJobCount: 0, checkedJobCount: 85 })));
    await settle();

    expect(rows()[0]).toContain('läuft… | 1 Quelle · 85 Jobs geprüft');
    expect(rows().length).toBe(4);
    http.expectOne('/api/runs?size=4').flush(page([run(4), run(3), run(2), run(1)]));
  });

  it('describes failed and canceled runs', async () => {
    current.set(status(run(3, { overallStatus: 'FAILED' })));
    await settle();
    http.expectOne('/api/runs?size=4').flush(page([
      run(3, { overallStatus: 'FAILED' }),
      run(2, { overallStatus: 'CANCELED', sourceCount: 2, checkedJobCount: 0 }),
      run(1, { newJobCount: 1 }),
    ]));
    await settle();

    expect(rows()[0]).toContain('fehlgeschlagen');
    expect(rows()[1]).toMatch(/abgebrochen \| 2 Quellen$/);
    expect(rows()[2]).toContain('+1 Job |');
  });
});

/** The fixtures' 08:30 UTC in the test machine's time zone. */
function rowTime(): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(
    new Date('2025-03-01T08:30:00Z'),
  );
}
