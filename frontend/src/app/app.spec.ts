import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { JobService } from './jobs/job-service';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        // An unanswered request would keep the list loading, and whenStable() would wait forever.
        {
          provide: JobService,
          useValue: {
            getJobs: () =>
              of({ content: [], page: { size: 50, number: 0, totalElements: 0, totalPages: 0 } }),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the top bar, the sidebar and the jobs columns', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('header')?.textContent).toContain('Job Radar');
    expect(element.querySelector('aside')).not.toBeNull();
    expect(element.querySelector('main')).not.toBeNull();
    expect(element.querySelector('section[aria-label="Details"]')).not.toBeNull();
  });
});
