import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StatusService } from '../status/status-service';
import { Run, SearchBlockedReason, Status } from '../status/status-types';
import { TopBar } from './top-bar';

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 7,
    startedAt: '2026-11-06T08:30:00Z',
    finishedAt: '2026-11-06T08:31:00Z',
    overallStatus: 'SUCCESS',
    phase: null,
    remainingCount: null,
    newJobCount: 0,
    isInitialSearch: false,
    sourceCount: 1,
    finishedSourceCount: 1,
    failedSourceCount: 0,
    checkedJobCount: 0,
    sourceResults: [],
    ...overrides,
  };
}

function status(latestRun: Run | null, blockedReason: SearchBlockedReason | null = null): Status {
  return {
    search: { blockedReason, run: latestRun },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

describe('TopBar', () => {
  let fixture: ComponentFixture<TopBar>;
  let http: HttpTestingController;
  const current = signal<Status | null>(null);
  const refresh = vi.fn();

  beforeEach(() => {
    current.set(null);
    refresh.mockReset();
    TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: StatusService,
          useValue: {
            status: current.asReadonly(),
            isRunning: computed(() => current()?.search.run?.overallStatus === 'RUNNING'),
            refresh,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TopBar);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(next: Status | null): Promise<HTMLElement> {
    current.set(next);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function searchButton(element: HTMLElement): HTMLButtonElement {
    return element.querySelector('button.search-button') as HTMLButtonElement;
  }

  it('disables "Suchen" until the first status arrives', async () => {
    const element = await render(null);

    expect(searchButton(element).textContent).toContain('Suchen');
    expect(searchButton(element).disabled).toBe(true);
  });

  it('disables "Suchen" with a hint while the profile is incomplete', async () => {
    const element = await render(status(null, 'NO_LOCATION'));

    expect(searchButton(element).disabled).toBe(true);
    expect(element.querySelector('#search-blocked-hint')?.textContent).toBe('Erst Profil ausfüllen');
    expect(searchButton(element).getAttribute('aria-describedby')).toBe('search-blocked-hint');
  });

  it('links the profile hint to the settings', async () => {
    const element = await render(status(null, 'NO_SEARCH_TERMS'));
    const hint = element.querySelector('#search-blocked-hint');

    expect(hint?.tagName).toBe('A');
    expect(hint?.getAttribute('href')).toBe('/settings');
  });

  it('says "Keine Quelle aktiv" without enabled sources', async () => {
    const element = await render(status(null, 'NO_SOURCES'));

    expect(element.querySelector('#search-blocked-hint')?.textContent).toBe('Keine Quelle aktiv');
    expect(element.querySelector('#search-blocked-hint')?.tagName).toBe('SPAN');
  });

  it('starts a run and stays disabled until the new run shows up', async () => {
    const element = await render(status(run()));

    searchButton(element).click();
    http.expectOne({ method: 'POST', url: '/api/runs' }).flush(run({ id: 8, overallStatus: 'RUNNING' }));
    await fixture.whenStable();

    expect(refresh).toHaveBeenCalled();
    expect(searchButton(element).disabled).toBe(true);

    await render(status(run({ id: 8, overallStatus: 'RUNNING', phase: 'FETCHING' })));
    expect(searchButton(element).textContent).toContain('Abbrechen');
    expect(searchButton(element).disabled).toBe(false);
  });

  it('enables "Suchen" again when starting fails', async () => {
    const element = await render(status(run()));

    searchButton(element).click();
    http
      .expectOne('/api/runs')
      .flush({ code: 'RUN_RUNNING' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(searchButton(element).disabled).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('cancels the running run and shows "Wird abgebrochen…"', async () => {
    const element = await render(status(run({ overallStatus: 'RUNNING', phase: 'ANALYZING' })));

    searchButton(element).click();
    await fixture.whenStable();

    expect(searchButton(element).textContent).toContain('Wird abgebrochen…');
    expect(searchButton(element).disabled).toBe(true);
    http.expectOne({ method: 'POST', url: '/api/runs/7/cancel' }).flush(null, { status: 202, statusText: 'Accepted' });
    expect(refresh).toHaveBeenCalled();

    await render(status(run({ overallStatus: 'CANCELED' })));
    expect(searchButton(element).textContent).toContain('Suchen');
    expect(searchButton(element).disabled).toBe(false);
  });

  it('shows the scan bar only while a run is running', async () => {
    let element = await render(status(run()));
    expect(element.querySelector('.scan')).toBeNull();

    element = await render(status(run({ overallStatus: 'RUNNING', phase: 'FETCHING' })));
    expect(element.querySelector('.scan')).not.toBeNull();
  });
});
