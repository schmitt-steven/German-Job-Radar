import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusService } from '../status/status-service';
import { Run, Status } from '../status/status-types';
import { StatusLine } from './status-line';

function run(overrides: Partial<Run>): Run {
  return {
    id: 7,
    startedAt: '2025-03-01T08:30:00Z',
    finishedAt: '2025-03-01T08:31:00Z',
    overallStatus: 'SUCCESS',
    phase: null,
    remainingCount: null,
    newJobCount: 0,
    isInitialSearch: false,
    sourceCount: 6,
    finishedSourceCount: 6,
    failedSourceCount: 0,
    checkedJobCount: 0,
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

describe('StatusLine', () => {
  const current = signal<Status | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatusLine],
      providers: [{ provide: StatusService, useValue: { status: current.asReadonly() } }],
    });
  });

  async function render(next: Status | null): Promise<HTMLElement> {
    current.set(next);
    const fixture = TestBed.createComponent(StatusLine);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function textFor(latestRun: Run | null): Promise<string> {
    const element = await render(status(latestRun));
    return [...element.querySelectorAll('span')].map((span) => span.textContent).join(' ').trim();
  }

  it('is empty before the first status', async () => {
    expect((await render(null)).textContent!.trim()).toBe('');
  });

  it('says "Noch keine Suche" before the first run', async () => {
    expect(await textFor(null)).toBe('Noch keine Suche');
  });

  it('counts finished sources while fetching', async () => {
    const latestRun = run({ overallStatus: 'RUNNING', phase: 'FETCHING', finishedSourceCount: 3 });

    expect(await textFor(latestRun)).toBe('Suche läuft… 3/6 Quellen');
  });

  it('counts the remaining descriptions while analyzing', async () => {
    const latestRun = run({ overallStatus: 'RUNNING', phase: 'ANALYZING', remainingCount: 40 });

    expect(await textFor(latestRun)).toBe('Analysiere Jobs… noch 40');
  });

  it('shows the time of the last search and its failed sources', async () => {
    expect(await textFor(run({ overallStatus: 'PARTIAL', failedSourceCount: 1 }))).toMatch(
      /^Letzte Suche: 01\.03\.2025, \d\d:31 · 1 Quelle fehlgeschlagen$/,
    );
  });

  it('reports a failed and a canceled search', async () => {
    expect(await textFor(run({ overallStatus: 'FAILED' }))).toBe('Letzte Suche fehlgeschlagen');
    expect(await textFor(run({ overallStatus: 'CANCELED' }))).toBe('Letzte Suche abgebrochen');
  });

  it('colors the dot by state', async () => {
    const dotOf = async (latestRun: Run) =>
      (await render(status(latestRun))).querySelector('.dot')!.classList;

    expect(await dotOf(run({ overallStatus: 'RUNNING', phase: 'FETCHING' }))).toContain('busy');
    expect(await dotOf(run({ overallStatus: 'FAILED' }))).toContain('error');
    expect(await dotOf(run({ overallStatus: 'SUCCESS' }))).toContain('idle');
  });
});
