import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { Page } from '../page';
import { StatusService } from '../status/status-service';
import { Run, Status } from '../status/status-types';
import { JobChanges } from './job-changes';
import { JobList, QUERY_DEBOUNCE_MS } from './job-list';
import { JobService } from './job-service';
import { JobFilter, JobSummary, JobUpdate } from './job-types';

@Component({ template: '' })
class EmptyPage {}

function job(id: number, title: string): JobSummary {
  return {
    id,
    title,
    company: 'Acme GmbH',
    location: 'Köln',
    sources: ['ARBEITSAGENTUR'],
    publishedAt: '2026-11-01',
    status: 'NOT_APPLIED',
    reaction: 'NONE',
    isNew: false,
    isSeen: false,
    isOnline: true,
    isTemporaryAgencyWork: false,
  };
}

function runStatus(overrides: Partial<Run>): Status {
  return {
    search: {
      blockedReason: null,
      run: {
        id: 1,
        startedAt: '2026-11-14T08:30:00Z',
        finishedAt: null,
        overallStatus: 'RUNNING',
        phase: 'FETCHING',
        remainingCount: null,
        newJobCount: 0,
        isInitialSearch: true,
        sourceCount: 1,
        finishedSourceCount: 0,
        failedSourceCount: 0,
        checkedJobCount: 0,
        sourceResults: [],
        ...overrides,
      },
    },
    counts: {
      ALL: 0, NEW: 0, UNSEEN: 0, APPLIED: 0, REJECTED: 0,
      EXCLUDED: 0, HEARTED: 0, OFFLINE: 0, SORTED_OUT: 0,
    },
  };
}

function page(jobs: JobSummary[], number = 0, totalPages = 1): Page<JobSummary> {
  return {
    content: jobs,
    page: { size: 50, number, totalElements: totalPages * 50, totalPages },
  };
}

describe('JobList', () => {
  let fixture: ComponentFixture<JobList>;
  // Stands in for the backend, each test sets what it answers.
  const getJobs = vi.fn<(filter: JobFilter, page: number) => Observable<Page<JobSummary>>>();
  const updateJob = vi.fn<(id: number, update: JobUpdate) => Observable<JobSummary>>();
  const status = signal<Status | null>(null);

  beforeEach(() => {
    getJobs.mockReset();
    getJobs.mockReturnValue(of(page([])));
    status.set(null);
    TestBed.configureTestingModule({
      imports: [JobList],
      providers: [
        provideRouter([{ path: '**', component: EmptyPage }]),
        { provide: StatusService, useValue: { refresh: vi.fn(), status } },
        {
          provide: JobService,
          useValue: {
            getJobs,
            updateJob,
            getLocationsAndCompanies: () => of({ locations: [], companies: [] }),
          },
        },
      ],
    });
  });

  async function renderAt(url: string): Promise<HTMLElement> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(JobList);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('titles the list after the view in the URL', async () => {
    expect((await renderAt('/')).querySelector('h1')?.textContent).toBe('Alle Jobs');
  });

  it('loads the jobs of the view in the URL', async () => {
    const element = await renderAt('/?view=HEARTED');

    expect(element.querySelector('h1')?.textContent).toBe('Gemerkt');
    expect(getJobs).toHaveBeenCalledWith(expect.objectContaining({ view: 'HEARTED' }), 0);
  });

  it('loads again when the view changes', async () => {
    const element = await renderAt('/');

    await TestBed.inject(Router).navigateByUrl('/?view=APPLIED');
    await fixture.whenStable();

    expect(element.querySelector('h1')?.textContent).toBe('Beworben');
    expect(getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'APPLIED' }), 0);
  });

  it('shows a saved change on its card without reloading the list', async () => {
    const excluded: JobSummary = { ...job(1, 'Java-Entwickler'), reaction: 'EXCLUDED' };
    getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler'), job(2, 'Data Engineer')])));
    updateJob.mockReturnValue(of(excluded));
    const element = await renderAt('/');
    expect(element.querySelector('li')?.classList).not.toContain('dimmed');

    TestBed.inject(JobChanges).toggleReaction(job(1, 'Java-Entwickler'), 'EXCLUDED');
    await fixture.whenStable();

    const [first, second] = element.querySelectorAll('li');
    expect(first.classList).toContain('dimmed');
    expect(second.classList).not.toContain('dimmed');
    expect(getJobs).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous jobs while the next view loads', async () => {
    getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler')])));
    const element = await renderAt('/');

    getJobs.mockReturnValue(new Subject<Page<JobSummary>>());
    await TestBed.inject(Router).navigateByUrl('/?view=APPLIED');
    fixture.detectChanges();

    expect(element.querySelector('li')?.textContent).toContain('Java-Entwickler');
    expect(element.querySelector('ul')?.getAttribute('aria-busy')).toBe('true');
    // CSS keeps it hidden for the first second.
    expect(element.querySelector('.loading')?.getAttribute('aria-label')).toBe(
      'Jobs werden geladen',
    );
  });

  it('shows one row per job', async () => {
    getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler'), job(2, 'Data Engineer')])));
    const rows = [...(await renderAt('/')).querySelectorAll('li')];

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Java-Entwickler');
    expect(rows[1].textContent).toContain('Data Engineer');
  });

  it('shows the offline badge only in views that keep offline jobs', async () => {
    getJobs.mockReturnValue(of(page([{ ...job(1, 'Java-Entwickler'), isOnline: false }])));

    expect((await renderAt('/')).textContent).not.toContain('Nicht mehr online');
    expect((await renderAt('/?view=HEARTED')).textContent).toContain('Nicht mehr online');
  });

  it('says so when no job matches', async () => {
    const element = await renderAt('/');

    expect(element.querySelector('ul')).toBeNull();
    expect(element.textContent).toContain('Nichts passt zu diesen Filtern.');
  });

  it('says when no search found new jobs yet', async () => {
    const element = await renderAt('/?view=NEW');

    expect(element.textContent).toContain('Neue Treffer der nächsten Suche erscheinen hier.');
    expect(element.textContent).not.toContain('Nichts passt zu diesen Filtern.');
  });

  it('blames the filters when no new job matches them', async () => {
    const element = await renderAt('/?view=NEW');
    fixture.componentInstance.location.set('Köln');
    await fixture.whenStable();

    expect(element.textContent).toContain('Nichts passt zu diesen Filtern.');
    expect(element.textContent).not.toContain('Neue Treffer der nächsten Suche erscheinen hier.');
  });

  it('loads with the query only once typing paused', async () => {
    await renderAt('/');
    vi.useFakeTimers();
    try {
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      for (const text of ['ja', 'jav', 'java']) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        TestBed.tick();
        vi.advanceTimersByTime(QUERY_DEBOUNCE_MS - 1);
      }
      expect(getJobs).not.toHaveBeenCalledWith(expect.objectContaining({ query: 'jav' }), 0);

      vi.advanceTimersByTime(1);
      TestBed.tick();
      expect(getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'java' }), 0);
      expect(getJobs).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads at once when the query is cleared', async () => {
    await renderAt('/');
    vi.useFakeTimers();
    try {
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.value = 'java';
      input.dispatchEvent(new Event('input'));
      TestBed.tick();
      vi.advanceTimersByTime(QUERY_DEBOUNCE_MS);
      TestBed.tick();

      input.value = '';
      input.dispatchEvent(new Event('input'));
      TestBed.tick();
      expect(getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ query: null }), 0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads again when the initial search finishes', async () => {
    const element = await renderAt('/');
    status.set(runStatus({ overallStatus: 'RUNNING' }));
    await fixture.whenStable();

    getJobs.mockReturnValue(of(page([job(1, 'Java Entwickler')])));
    status.set(runStatus({ overallStatus: 'SUCCESS', phase: null, newJobCount: 1 }));
    await fixture.whenStable();

    expect(element.querySelectorAll('li')).toHaveLength(1);
  });

  it('stays unchanged when a later search finishes', async () => {
    await renderAt('/');
    status.set(runStatus({ overallStatus: 'RUNNING', isInitialSearch: false }));
    await fixture.whenStable();
    const callCount = getJobs.mock.calls.length;

    status.set(runStatus({ overallStatus: 'SUCCESS', isInitialSearch: false, newJobCount: 3 }));
    await fixture.whenStable();

    expect(getJobs).toHaveBeenCalledTimes(callCount);
  });

  it('says so when loading fails', async () => {
    getJobs.mockReturnValue(throwError(() => new Error('backend down')));
    const element = await renderAt('/');

    expect(element.textContent).toContain('Jobs konnten nicht geladen werden.');
  });

  describe('Mehr laden', () => {
    function moreButton(element: HTMLElement): HTMLButtonElement | undefined {
      return [...element.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Mehr laden'),
      );
    }

    function titles(element: HTMLElement): string[] {
      return [...element.querySelectorAll('li')].map(
        (row) => row.querySelector('.title')?.textContent?.trim() ?? '',
      );
    }

    async function clickMore(element: HTMLElement): Promise<void> {
      moreButton(element)?.click();
      await fixture.whenStable();
    }

    it('is hidden when every job is shown', async () => {
      getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler')])));

      expect(moreButton(await renderAt('/'))).toBeUndefined();
    });

    it('shows how many jobs are loaded of how many', async () => {
      getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler')], 0, 2)));

      expect((await renderAt('/')).textContent).toContain('1 von 100 Jobs');
    });

    it('appends the next page', async () => {
      getJobs.mockReturnValueOnce(of(page([job(1, 'Java-Entwickler')], 0, 2)));
      getJobs.mockReturnValueOnce(of(page([job(2, 'Data Engineer')], 1, 2)));
      const element = await renderAt('/');

      await clickMore(element);

      expect(getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'ALL' }), 1);
      expect(titles(element)).toEqual(['Java-Entwickler', 'Data Engineer']);
      expect(moreButton(element)).toBeUndefined();
    });

    it('drops a job the next page returns again', async () => {
      getJobs.mockReturnValueOnce(of(page([job(1, 'Java-Entwickler')], 0, 3)));
      getJobs.mockReturnValueOnce(
        of(page([job(1, 'Java-Entwickler'), job(2, 'Data Engineer')], 1, 3)),
      );
      const element = await renderAt('/');

      await clickMore(element);

      expect(titles(element)).toEqual(['Java-Entwickler', 'Data Engineer']);
    });

    it('starts at the first page again when the view changes', async () => {
      getJobs.mockReturnValue(of(page([job(1, 'Java-Entwickler')], 0, 2)));
      const element = await renderAt('/');
      getJobs.mockReturnValueOnce(of(page([job(2, 'Data Engineer')], 1, 2)));
      await clickMore(element);

      await TestBed.inject(Router).navigateByUrl('/?view=HEARTED');
      await fixture.whenStable();

      expect(getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'HEARTED' }), 0);
      expect(titles(element)).toEqual(['Java-Entwickler']);
    });

    it('keeps the list when the next page fails, and tries again', async () => {
      getJobs.mockReturnValueOnce(of(page([job(1, 'Java-Entwickler')], 0, 2)));
      getJobs.mockReturnValueOnce(throwError(() => new Error('backend down')));
      getJobs.mockReturnValueOnce(of(page([job(2, 'Data Engineer')], 1, 2)));
      const element = await renderAt('/');

      await clickMore(element);
      expect(titles(element)).toEqual(['Java-Entwickler']);
      expect(element.textContent).toContain('Weitere Jobs konnten nicht geladen werden.');

      await clickMore(element);
      expect(getJobs).toHaveBeenLastCalledWith(expect.anything(), 1);
      expect(titles(element)).toEqual(['Java-Entwickler', 'Data Engineer']);
    });
  });
});
