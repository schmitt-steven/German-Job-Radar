import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { JobService } from './job-service';
import { JobFilter, LocationAndCompanyValues } from './job-types';

function filter(overrides: Partial<JobFilter> = {}): JobFilter {
  return {
    view: 'ALL',
    query: null,
    company: null,
    location: null,
    source: [],
    sort: 'DATE',
    ...overrides,
  };
}

describe('JobService', () => {
  let service: JobService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(JobService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the view and the page, and leaves out empty filters', () => {
    service.getJobs(filter({ view: 'HEARTED', query: '', company: null }), 2).subscribe();

    const request = http.expectOne((req) => req.url === '/api/jobs');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'size', 'view']);
    expect(request.request.params.get('view')).toBe('HEARTED');
    expect(request.request.params.get('page')).toBe('2');
  });

  it('sends the filters that are set', () => {
    service
      .getJobs(filter({ query: 'java', company: 'Acme GmbH', location: 'Köln' }), 0)
      .subscribe();

    const params = http.expectOne((req) => req.url === '/api/jobs').request.params;
    expect(params.get('query')).toBe('java');
    expect(params.get('company')).toBe('Acme GmbH');
    expect(params.get('location')).toBe('Köln');
  });

  it('returns the page the backend sends', () => {
    let totalElements: number | undefined;
    service.getJobs(filter(), 0).subscribe((page) => (totalElements = page.page.totalElements));

    http
      .expectOne((req) => req.url === '/api/jobs')
      .flush({
        content: [],
        page: { size: 50, number: 0, totalElements: 0, totalPages: 0 },
      });
    expect(totalElements).toBe(0);
  });

  it('loads the location and company values of a view', () => {
    let values: LocationAndCompanyValues | undefined;
    service.getLocationsAndCompanies('HEARTED').subscribe((v) => (values = v));

    const request = http.expectOne((req) => req.url === '/api/jobs/location-and-company-values');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('view')).toBe('HEARTED');
    request.flush({ locations: ['Köln'], companies: ['Acme GmbH'] });

    expect(values).toEqual({ locations: ['Köln'], companies: ['Acme GmbH'] });
  });

  it('opens a job with a POST to its open endpoint', () => {
    service.openJob(7).subscribe();

    const request = http.expectOne('/api/jobs/7/open');
    expect(request.request.method).toBe('POST');
    request.flush({});
  });

  it('sends only the fields to change when updating a job', () => {
    service.updateJob(7, { reaction: 'HEARTED' }).subscribe();

    const request = http.expectOne('/api/jobs/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ reaction: 'HEARTED' });
    request.flush({});
  });
});
