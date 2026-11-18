import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JobCard } from './job-card';
import { JobSummary } from './job-types';

function job(overrides: Partial<JobSummary> = {}): JobSummary {
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
    isSeen: false,
    isOnline: true,
    isTemporaryAgencyWork: false,
    ...overrides,
  };
}

describe('JobCard', () => {
  let fixture: ComponentFixture<JobCard>;

  async function render(summary: JobSummary, isOfflineBadgeShown = false): Promise<HTMLElement> {
    fixture = TestBed.createComponent(JobCard);
    fixture.componentRef.setInput('job', summary);
    fixture.componentRef.setInput('isOfflineBadgeShown', isOfflineBadgeShown);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Joins the innermost spans with spaces, since Angular drops the whitespace between them. */
  function text(element: HTMLElement): string {
    return [...element.querySelectorAll('span, button')]
      .filter((span) => span.children.length === 0)
      .map((span) => span.textContent?.trim())
      .join(' ');
  }

  it('shows title, company, location and source', async () => {
    expect(text(await render(job()))).toBe('Java-Entwickler Acme GmbH Köln Arbeitsagentur');
  });

  it('counts further sources as "+n"', async () => {
    const element = await render(job({ sources: ['ARBEITSAGENTUR', 'ARBEITSAGENTUR'] }));

    expect(text(element)).toContain('Arbeitsagentur +1');
  });

  it('shows the date without the year for this year', async () => {
    const year = new Date().getFullYear();
    const element = await render(job({ publishedAt: `${year}-03-01` }));

    expect(text(element)).toContain('01.03.');
    expect(text(element)).not.toContain(`01.03.${year}`);
  });

  it('shows the year for older dates', async () => {
    expect(text(await render(job({ publishedAt: '2020-03-01' })))).toContain('01.03.2020');
  });

  it('shows the status only once applied or rejected', async () => {
    expect(text(await render(job()))).not.toContain('Beworben');
    expect(text(await render(job({ status: 'APPLIED' })))).toContain('· Beworben');
    expect(text(await render(job({ status: 'REJECTED' })))).toContain('· Abgelehnt');
  });

  it('marks new jobs', async () => {
    expect(text(await render(job()))).not.toContain('NEU');
    expect(text(await render(job({ isNew: true })))).toContain('NEU');
  });

  it('marks temporary agency work with an explaining tooltip', async () => {
    const element = await render(job({ isTemporaryAgencyWork: true }));
    const badge = [...element.querySelectorAll('span')].find(
      (span) => span.textContent?.trim() === 'Zeitarbeit',
    );

    expect(badge?.title).toMatch(/^Arbeitnehmerüberlassung: .*Zeitarbeitsfirma/);
  });

  it('dims excluded jobs', async () => {
    expect((await render(job())).classList).not.toContain('dimmed');
    expect((await render(job({ reaction: 'EXCLUDED' }))).classList).toContain('dimmed');
  });

  it('dims offline jobs and shows the badge only when asked', async () => {
    const offline = job({ isOnline: false });

    const element = await render(offline);
    expect(element.classList).toContain('dimmed');
    expect(text(element)).not.toContain('Nicht mehr online');

    expect(text(await render(offline, true))).toContain('Nicht mehr online');
    expect(text(await render(job(), true))).not.toContain('Nicht mehr online');
  });
});
