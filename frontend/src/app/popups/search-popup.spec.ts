import { Run, RunStatus, Status } from '../status/status-types';
import { searchPopup } from './search-popup';

function run(id: number, overallStatus: RunStatus, overrides: Partial<Run> = {}): Run {
  return {
    id,
    startedAt: '2025-03-01T08:30:00Z',
    finishedAt: overallStatus === 'RUNNING' ? null : '2025-03-01T08:31:00Z',
    overallStatus,
    phase: overallStatus === 'RUNNING' ? 'FETCHING' : null,
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

function status(latestRun: Run | null): Status {
  return {
    search: { blockedReason: null, run: latestRun },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

describe('searchPopup', () => {
  const running = status(run(5, 'RUNNING'));

  it('shows nothing on the first poll', () => {
    expect(searchPopup(null, status(run(5, 'SUCCESS', { newJobCount: 6 })))).toBeNull();
  });

  it('shows nothing while the run is running', () => {
    expect(searchPopup(running, running)).toBeNull();
  });

  it('shows nothing again for a run that was already finished', () => {
    const finished = status(run(5, 'SUCCESS', { newJobCount: 6 }));

    expect(searchPopup(finished, finished)).toBeNull();
  });

  it('shows new jobs with a button to the new view', () => {
    expect(searchPopup(running, status(run(5, 'SUCCESS', { newJobCount: 6 })))).toEqual({
      headline: '6 neue Jobs gefunden',
      detail: null,
      action: { label: 'Anzeigen', route: ['/'], queryParams: { view: 'NEW' } },
    });
  });

  it('uses the singular for one new job', () => {
    const popup = searchPopup(running, status(run(5, 'PARTIAL', { newJobCount: 1 })));

    expect(popup?.headline).toBe('1 neuer Job gefunden');
  });

  it('says "Keine neuen Jobs" without a button', () => {
    expect(searchPopup(running, status(run(5, 'SUCCESS')))).toEqual({
      headline: 'Keine neuen Jobs',
      detail: null,
      action: null,
    });
  });

  it('shows a run that no poll saw running', () => {
    const before = status(run(4, 'SUCCESS'));

    expect(searchPopup(before, status(run(5, 'FAILED')))?.headline).toBe('Suche fehlgeschlagen');
  });

  it('shows the initial search with a button to all jobs', () => {
    const initial = run(1, 'SUCCESS', { newJobCount: 47, isInitialSearch: true });

    expect(searchPopup(status(null), status(initial))).toEqual({
      headline: '47 Jobs gefunden',
      detail: null,
      action: { label: 'Anzeigen', route: ['/'], queryParams: null },
    });
  });

  it('says "Keine Jobs gefunden" for an initial search without jobs', () => {
    const initial = run(1, 'SUCCESS', { isInitialSearch: true });

    expect(searchPopup(status(null), status(initial))?.headline).toBe('Keine Jobs gefunden');
  });

  it('shows nothing for a canceled run', () => {
    expect(searchPopup(running, status(run(5, 'CANCELED')))).toBeNull();
  });
});
