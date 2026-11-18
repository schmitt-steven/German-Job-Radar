import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusService } from '../status/status-service';
import { JobView, Status } from '../status/status-types';
import { JobDetails } from './job-details';
import { JobDetail, JobPosting, JobSummary } from './job-types';
import { SelectedJob } from './selected-job';

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 101,
    source: 'ARBEITSAGENTUR',
    url: 'https://example.test/job/101',
    title: 'Java-Entwickler',
    company: 'Acme GmbH',
    location: 'Köln',
    description: 'Du programmierst Java.',
    publishedAt: null,
    isTemporaryAgencyWork: false,
    lastSeenAt: '2026-11-01T08:30:00Z',
    goneAt: null,
    isMain: true,
    ...overrides,
  };
}

function detail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 1,
    title: 'Java-Entwickler',
    company: 'Acme GmbH',
    location: 'Köln',
    sources: ['ARBEITSAGENTUR'],
    publishedAt: null,
    status: 'NOT_APPLIED',
    reaction: 'NONE',
    isNew: false,
    isSeen: true,
    isOnline: true,
    isTemporaryAgencyWork: false,
    descriptionError: null,
    postings: [posting()],
    ...overrides,
  };
}

describe('JobDetails', () => {
  let fixture: ComponentFixture<JobDetails>;
  let http: HttpTestingController;
  let element: HTMLElement;
  const status = signal<Status | null>(null);
  const refresh = vi.fn();
  const adjustCount = vi.fn();

  function statusWithJobCount(total: number): Status {
    return {
      search: { blockedReason: null, run: null },
      counts: { ALL: total } as Record<JobView, number>,
    };
  }

  beforeEach(async () => {
    status.set(statusWithJobCount(5));
    refresh.mockReset();
    adjustCount.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StatusService, useValue: { status: status.asReadonly(), refresh, adjustCount } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(JobDetails);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  /** What the list knows of the job. */
  function summary(overrides: Partial<JobSummary> = {}): JobSummary {
    const { descriptionError, postings, ...rest } = detail();
    void descriptionError;
    void postings;
    return { ...rest, ...overrides };
  }

  /** Selects the job from the list and returns its open request, still unanswered. */
  function select(job: JobSummary = summary()): TestRequest {
    TestBed.inject(SelectedJob).select(job);
    // whenStable() would wait for the open request, which is only answered later.
    TestBed.tick();
    return http.expectOne(`/api/jobs/${job.id}/open`);
  }

  /** Selects the job and answers its open request. */
  async function open(response: JobDetail | null): Promise<void> {
    const request = select(summary(response ? { ...response } : {}));
    if (response) {
      request.flush(response);
    } else {
      request.flush(null, { status: 500, statusText: 'Server Error' });
    }
    await fixture.whenStable();
  }

  it('asks for a selection while no job is selected', () => {
    expect(element.textContent).toContain('Wähle einen Job aus der Liste.');
  });

  it('says to start a search before the first one', async () => {
    status.set(statusWithJobCount(0));
    await fixture.whenStable();

    expect(element.textContent).toContain('Starte oben eine Suche.');
  });

  it('shows title, company, location and the description with its source', async () => {
    await open(detail());

    expect(element.querySelector('h2')?.textContent).toBe('Java-Entwickler');
    expect(element.textContent).toContain('Acme GmbH');
    expect(element.textContent).toContain('Köln');
    expect(element.textContent).toContain('Text von Arbeitsagentur');
    expect(element.textContent).toContain('Du programmierst Java.');
  });

  it('links every posting under "Gefunden auf"', async () => {
    await open(detail());

    const link = element.querySelector<HTMLAnchorElement>('.sources a');
    expect(link?.textContent).toBe('Arbeitsagentur');
    expect(link?.href).toBe('https://example.test/job/101');
  });

  it('says since when a posting is gone and badges a job that is offline', async () => {
    await open(
      detail({ isOnline: false, postings: [posting({ goneAt: '2026-10-03T08:30:00Z' })] }),
    );

    expect(element.textContent).toContain('nicht mehr online seit 3. Okt.');
    expect(element.querySelector('.badge-outline')?.textContent).toBe('Nicht mehr online');
  });

  it('says nothing about an online posting', async () => {
    await open(detail());

    expect(element.textContent).not.toContain('nicht mehr online');
    expect(element.querySelector('.badge-outline')).toBeNull();
  });

  it('marks temporary agency work', async () => {
    await open(detail({ isTemporaryAgencyWork: true }));

    expect(element.querySelector('.badge-neutral')?.textContent).toBe('Zeitarbeit');
  });

  it('offers a retry when the description could not be loaded', async () => {
    await open(
      detail({ descriptionError: 'HTTP 429', postings: [posting({ description: null })] }),
    );

    expect(element.textContent).toContain('Beschreibung konnte nicht geladen werden');
    expect(element.querySelector('.description button')?.textContent).toBe('Erneut versuchen');
  });

  it("shows the list's data and a loading note while the job opens", async () => {
    const request = select(summary({ title: 'Data Engineer', isTemporaryAgencyWork: true }));
    TestBed.tick();

    expect(element.querySelector('h2')?.textContent).toBe('Data Engineer');
    expect(element.querySelector('.badge-neutral')?.textContent).toBe('Zeitarbeit');
    expect(element.querySelector('.sources')?.textContent).toContain('Arbeitsagentur');
    expect(element.querySelector('.sources a')).toBeNull();
    expect(element.querySelector('.description .spinner')).not.toBeNull();
    expect(element.querySelector('.description')?.textContent).toContain(
      'Beschreibung wird geladen…',
    );

    request.flush(detail({ title: 'Data Engineer' }));
    await fixture.whenStable();

    expect(element.querySelector('.description .spinner')).toBeNull();
    expect(element.querySelector('.sources a')).not.toBeNull();
    expect(element.textContent).toContain('Du programmierst Java.');
  });

  it('keeps the header and offers a retry when the job could not be opened', async () => {
    await open(null);

    expect(element.querySelector('h2')?.textContent).toBe('Java-Entwickler');
    expect(element.querySelector('.description [role="alert"]')?.textContent).toContain(
      'Beschreibung konnte nicht geladen werden',
    );
    expect(element.querySelector('.description .spinner')).toBeNull();
  });

  it('opens the job again on retry', async () => {
    await open(null);

    element.querySelector<HTMLButtonElement>('.description .link')?.click();
    TestBed.tick();
    http.expectOne('/api/jobs/1/open').flush(detail());
    await fixture.whenStable();

    expect(element.textContent).toContain('Du programmierst Java.');
  });

  describe('reactions', () => {
    function button(name: 'heart' | 'exclude'): HTMLButtonElement {
      return element.querySelector<HTMLButtonElement>(`.reactions .${name}`)!;
    }

    it('offers to heart and to exclude a job without a reaction', async () => {
      await open(detail());

      expect(button('heart').textContent).toContain('Merken');
      expect(button('heart').getAttribute('aria-pressed')).toBe('false');
      expect(button('exclude').textContent).toContain('Ausschließen');
      expect(button('exclude').getAttribute('aria-pressed')).toBe('false');
    });

    it('shows a heart the job has', async () => {
      await open(detail({ reaction: 'HEARTED' }));

      expect(button('heart').textContent).toContain('Gemerkt');
      expect(button('heart').getAttribute('aria-pressed')).toBe('true');
    });

    it('shows an exclusion the job has', async () => {
      await open(detail({ reaction: 'EXCLUDED' }));

      expect(button('exclude').textContent).toContain('Ausgeschlossen');
      expect(button('exclude').getAttribute('aria-pressed')).toBe('true');
    });

    it('saves the heart and shows it once saved', async () => {
      await open(detail());

      button('heart').click();
      TestBed.tick();
      expect(button('heart').disabled).toBe(true);
      const request = http.expectOne('/api/jobs/1');
      expect(request.request.body).toEqual({ reaction: 'HEARTED' });
      request.flush(summary({ reaction: 'HEARTED' }));
      await fixture.whenStable();

      expect(button('heart').textContent).toContain('Gemerkt');
      expect(button('heart').disabled).toBe(false);
      expect(refresh).toHaveBeenCalled();
    });

    it('takes the heart back with a second click', async () => {
      await open(detail({ reaction: 'HEARTED' }));

      button('heart').click();
      TestBed.tick();
      const request = http.expectOne('/api/jobs/1');
      expect(request.request.body).toEqual({ reaction: 'NONE' });
      request.flush(summary());
      await fixture.whenStable();

      expect(button('heart').textContent).toContain('Merken');
    });

    it('says so when saving failed, and keeps the old state', async () => {
      await open(detail());

      button('exclude').click();
      TestBed.tick();
      http.expectOne('/api/jobs/1').flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      expect(element.querySelector('.error')?.textContent).toContain('Speichern fehlgeschlagen');
      expect(button('exclude').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('status', () => {
    function steps(): HTMLButtonElement[] {
      return [...element.querySelectorAll<HTMLButtonElement>('.status .step')];
    }

    function pressed(): string[] {
      return steps()
        .filter((step) => step.getAttribute('aria-pressed') === 'true')
        .map((step) => step.textContent?.trim() ?? '');
    }

    it('shows the three steps with the current one pressed', async () => {
      await open(detail());

      expect(steps().map((step) => step.textContent?.trim())).toEqual([
        'Nicht beworben',
        'Beworben',
        'Abgelehnt',
      ]);
      expect(pressed()).toEqual(['Nicht beworben']);
    });

    it('marks the steps up to the current one as reached', async () => {
      await open(detail({ status: 'APPLIED' }));

      expect(pressed()).toEqual(['Beworben']);
      expect(steps().map((step) => step.classList.contains('reached'))).toEqual([
        true,
        true,
        false,
      ]);
      expect(
        [...element.querySelectorAll('.status .connector')].map((c) =>
          c.classList.contains('reached'),
        ),
      ).toEqual([true, false]);
    });

    it('saves the step that is clicked and shows it once saved', async () => {
      await open(detail());

      steps()[2].click();
      TestBed.tick();
      const request = http.expectOne('/api/jobs/1');
      expect(request.request.body).toEqual({ status: 'REJECTED' });
      request.flush(summary({ status: 'REJECTED' }));
      await fixture.whenStable();

      expect(pressed()).toEqual(['Abgelehnt']);
      expect(refresh).toHaveBeenCalled();
    });

    it('sends nothing when the current step is clicked', async () => {
      await open(detail({ status: 'APPLIED' }));

      steps()[1].click();
      TestBed.tick();

      http.expectNone('/api/jobs/1');
    });

    it('can go back to not applied', async () => {
      await open(detail({ status: 'REJECTED' }));

      steps()[0].click();
      TestBed.tick();

      expect(http.expectOne('/api/jobs/1').request.body).toEqual({ status: 'NOT_APPLIED' });
    });
  });
});
