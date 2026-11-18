import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StatusService } from '../status/status-service';
import { JobChanges } from './job-changes';
import { JobSummary } from './job-types';

function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 7,
    title: 'Java-Entwickler',
    company: 'Acme GmbH',
    location: 'Köln',
    sources: ['ARBEITSAGENTUR'],
    publishedAt: null,
    status: 'NOT_APPLIED',
    reaction: 'NONE',
    isNew: false,
    isSeen: false,
    isOnline: true,
    isTemporaryAgencyWork: false,
    ...overrides,
  };
}

describe('JobChanges', () => {
  let changes: JobChanges;
  let http: HttpTestingController;
  const refresh = vi.fn();
  const adjustCount = vi.fn();

  beforeEach(() => {
    refresh.mockReset();
    adjustCount.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StatusService, useValue: { refresh, adjustCount } },
      ],
    });
    changes = TestBed.inject(JobChanges);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sets the reaction, then shows it on the job and refreshes the counts', () => {
    const loaded = job();
    changes.toggleReaction(loaded, 'HEARTED');

    expect(changes.savingId()).toBe(7);
    const request = http.expectOne('/api/jobs/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ reaction: 'HEARTED' });
    request.flush(job({ reaction: 'HEARTED' }));

    expect(changes.savingId()).toBeNull();
    expect(changes.apply(loaded).reaction).toBe('HEARTED');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('takes the reaction back when the job already has it', () => {
    changes.toggleReaction(job({ reaction: 'EXCLUDED' }), 'EXCLUDED');

    expect(http.expectOne('/api/jobs/7').request.body).toEqual({ reaction: 'NONE' });
  });

  it('replaces the other reaction', () => {
    changes.toggleReaction(job({ reaction: 'HEARTED' }), 'EXCLUDED');

    expect(http.expectOne('/api/jobs/7').request.body).toEqual({ reaction: 'EXCLUDED' });
  });

  it('sets the status', () => {
    changes.setStatus(job(), 'APPLIED');

    const request = http.expectOne('/api/jobs/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'APPLIED' });
    request.flush(job({ status: 'APPLIED' }));

    expect(changes.apply(job()).status).toBe('APPLIED');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('sends nothing when the job already has the status', () => {
    changes.setStatus(job({ status: 'APPLIED' }), 'APPLIED');

    http.expectNone('/api/jobs/7');
    expect(changes.savingId()).toBeNull();
  });

  it('keeps the other fields of a job it applies a change to', () => {
    const opened = { ...job(), postings: [] as string[] };
    changes.toggleReaction(opened, 'HEARTED');
    http.expectOne('/api/jobs/7').flush(job({ reaction: 'HEARTED' }));

    expect(changes.apply(opened)).toEqual({ ...opened, reaction: 'HEARTED' });
  });

  it('leaves a job without changes as it is', () => {
    const loaded = job({ id: 3 });

    expect(changes.apply(loaded)).toBe(loaded);
  });

  it('sends nothing while another save is running', () => {
    changes.toggleReaction(job(), 'HEARTED');
    changes.toggleReaction(job({ id: 8 }), 'HEARTED');

    http.expectOne('/api/jobs/7');
    http.expectNone('/api/jobs/8');
  });

  it('remembers the job whose save failed, and clears it on the next try', () => {
    changes.toggleReaction(job(), 'HEARTED');
    http.expectOne('/api/jobs/7').flush(null, { status: 500, statusText: 'Server Error' });

    expect(changes.failedId()).toBe(7);
    expect(changes.savingId()).toBeNull();
    expect(changes.apply(job()).reaction).toBe('NONE');
    expect(refresh).not.toHaveBeenCalled();

    changes.toggleReaction(job(), 'HEARTED');
    expect(changes.failedId()).toBeNull();
    http.expectOne('/api/jobs/7');
  });

  describe('open', () => {
    it('takes an unseen job out of "Ungesehen" at once, then refreshes the counts', () => {
      changes.open(job()).subscribe();

      expect(adjustCount).toHaveBeenCalledExactlyOnceWith('UNSEEN', -1);
      expect(changes.apply(job()).isSeen).toBe(true);
      expect(refresh).not.toHaveBeenCalled();

      const request = http.expectOne('/api/jobs/7/open');
      expect(request.request.method).toBe('POST');
      request.flush({ ...job({ isSeen: true }), descriptionError: null, postings: [] });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('counts a job only once, even if the list still shows it unseen', () => {
      changes.open(job()).subscribe();
      http.expectOne('/api/jobs/7/open').flush(null);
      changes.open(job()).subscribe();
      http.expectOne('/api/jobs/7/open').flush(null);

      expect(adjustCount).toHaveBeenCalledOnce();
    });

    it.each([
      ['a seen job', job({ isSeen: true })],
      ['an offline job', job({ isOnline: false })],
      ['an excluded job', job({ reaction: 'EXCLUDED' })],
    ])('leaves the counts of %s to the backend', (_, opened) => {
      changes.open(opened).subscribe();
      http.expectOne('/api/jobs/7/open').flush(null);

      expect(adjustCount).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('refreshes the counts after a failed open too', () => {
      changes.open(job()).subscribe({ error: () => undefined });
      http.expectOne('/api/jobs/7/open').flush(null, { status: 500, statusText: 'Server Error' });

      expect(refresh).toHaveBeenCalledOnce();
    });
  });
});
