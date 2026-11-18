import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { JobView } from '../status/status-types';
import { JobService } from './job-service';
import { JobToolbar } from './job-toolbar';
import { LocationAndCompanyValues } from './job-types';

describe('JobToolbar', () => {
  let fixture: ComponentFixture<JobToolbar>;
  // Stands in for the backend, each test sets what it answers.
  const getLocationsAndCompanies = vi.fn<(view: JobView) => Observable<LocationAndCompanyValues>>();

  beforeEach(() => {
    getLocationsAndCompanies.mockReset();
    getLocationsAndCompanies.mockReturnValue(
      of({ locations: ['Bonn', 'Köln'], companies: ['Acme GmbH'] }),
    );
    TestBed.configureTestingModule({
      imports: [JobToolbar],
      providers: [{ provide: JobService, useValue: { getLocationsAndCompanies } }],
    });
  });

  async function render(view: JobView = 'ALL'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(JobToolbar);
    fixture.componentRef.setInput('view', view);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function select(element: HTMLElement, label: string): HTMLSelectElement {
    return element.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  }

  function optionTexts(select: HTMLSelectElement): string[] {
    return [...select.options].map((option) => option.textContent?.trim() ?? '');
  }

  function choose(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  it('sets the query while typing, and null when cleared', async () => {
    const input = (await render()).querySelector('input') as HTMLInputElement;

    input.value = 'java';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.query()).toBe('java');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.query()).toBeNull();
  });

  it('offers the locations and companies of the view', async () => {
    const element = await render('HEARTED');

    expect(getLocationsAndCompanies).toHaveBeenCalledWith('HEARTED');
    expect(optionTexts(select(element, 'Ort'))).toEqual(['Alle Orte', 'Bonn', 'Köln']);
    expect(optionTexts(select(element, 'Firma'))).toEqual(['Alle Firmen', 'Acme GmbH']);
  });

  it('loads the options again when the view changes', async () => {
    await render('ALL');

    fixture.componentRef.setInput('view', 'APPLIED');
    await fixture.whenStable();

    expect(getLocationsAndCompanies).toHaveBeenLastCalledWith('APPLIED');
  });

  it('sets location and company when picked, and null for "Alle"', async () => {
    const element = await render();

    choose(select(element, 'Ort'), 'Köln');
    choose(select(element, 'Firma'), 'Acme GmbH');
    expect(fixture.componentInstance.location()).toBe('Köln');
    expect(fixture.componentInstance.company()).toBe('Acme GmbH');

    choose(select(element, 'Ort'), '');
    expect(fixture.componentInstance.location()).toBeNull();
  });

  it('keeps a picked value the view has no job for, selected', async () => {
    fixture = TestBed.createComponent(JobToolbar);
    fixture.componentRef.setInput('view', 'HEARTED');
    fixture.componentInstance.company.set('Webschmiede KG');
    await fixture.whenStable();
    const companies = select(fixture.nativeElement, 'Firma');

    expect(optionTexts(companies)).toEqual(['Alle Firmen', 'Webschmiede KG', 'Acme GmbH']);
    expect(companies.value).toBe('Webschmiede KG');
  });

  it('still offers "Alle" and the search when the options fail to load', async () => {
    getLocationsAndCompanies.mockReturnValue(throwError(() => new Error('backend down')));
    const element = await render();

    expect(element.querySelector('input')).not.toBeNull();
    expect(optionTexts(select(element, 'Ort'))).toEqual(['Alle Orte']);
    expect(optionTexts(select(element, 'Firma'))).toEqual(['Alle Firmen']);
  });
});
