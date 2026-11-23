import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { StatusService } from '../status/status-service';
import { Status } from '../status/status-types';
import { Sidebar } from './sidebar';

@Component({ template: '' })
class EmptyPage {}

const STATUS: Status = {
  search: { blockedReason: null, run: null },
  counts: {
    ALL: 47, NEW: 6, UNSEEN: 30, HEARTED: 9, APPLIED: 6, REJECTED: 3,
    EXCLUDED: 17, OFFLINE: 2, SORTED_OUT: 34,
  },
};

describe('Sidebar', () => {
  const current = signal<Status | null>(null);

  beforeEach(() => {
    current.set(STATUS);
    TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([{ path: '**', component: EmptyPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StatusService, useValue: { status: current.asReadonly() } },
      ],
    });
  });

  async function renderAt(url: string): Promise<HTMLElement> {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(Sidebar);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function viewLinks(element: HTMLElement): string[] {
    return [...element.querySelectorAll('nav a')].map((link) =>
      [...link.querySelectorAll('span')].map((span) => span.textContent).join(' ').trim(),
    );
  }

  it('shows the new count on the tile', async () => {
    const element = await renderAt('/');

    expect(element.querySelector('.new-tile')?.textContent).toContain('Neueste Treffer');
    expect(element.querySelector('.new-count')?.textContent).toBe('6');
  });

  it('lists the milestone 1 views with their counts', async () => {
    expect(viewLinks(await renderAt('/'))).toEqual([
      'Alle 47',
      'Ungesehen 30',
      'Gemerkt 9',
      'Beworben 6',
      'Abgelehnt 3',
      'Ausgeschlossen 17',
      'Nicht mehr online 2',
    ]);
  });

  it('shows no counts before the first status', async () => {
    current.set(null);
    const element = await renderAt('/');

    expect(element.querySelector('.new-count')?.textContent).toBe('');
    expect(viewLinks(element)[0]).toBe('Alle');
  });

  it('marks "Alle" current without a view param', async () => {
    const element = await renderAt('/');

    expect(element.querySelector('[aria-current="page"]')?.textContent).toContain('Alle');
  });

  it('marks the view from the URL current', async () => {
    const element = await renderAt('/?view=HEARTED');
    const currentLinks = element.querySelectorAll('[aria-current="page"]');

    expect(currentLinks.length).toBe(1);
    expect(currentLinks[0].textContent).toContain('Gemerkt');
  });

  it('links to each view by its param, "Alle" without one', async () => {
    const element = await renderAt('/');
    const hrefs = [...element.querySelectorAll('.new-tile, nav a')].map((link) =>
      link.getAttribute('href'),
    );

    expect(hrefs).toEqual([
      '/?view=NEW', '/', '/?view=UNSEEN', '/?view=HEARTED', '/?view=APPLIED',
      '/?view=REJECTED', '/?view=EXCLUDED', '/?view=OFFLINE',
    ]);
  });

  it('marks the tile current for the new view', async () => {
    const element = await renderAt('/?view=NEW');

    expect(element.querySelector('.new-tile')?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelectorAll('nav [aria-current]').length).toBe(0);
  });

  it('marks only "Einstellungen" current in the settings', async () => {
    const element = await renderAt('/settings');
    const currentLinks = element.querySelectorAll('[aria-current="page"]');

    expect(currentLinks.length).toBe(1);
    expect(currentLinks[0].textContent?.trim()).toBe('Einstellungen');
  });

  it('marks the view again after leaving the settings', async () => {
    const element = await renderAt('/settings');
    await TestBed.inject(Router).navigateByUrl('/?view=APPLIED');
    await TestBed.inject(Router).navigated;
    TestBed.tick();

    expect(element.querySelector('[aria-current="page"]')?.textContent).toContain('Beworben');
    expect(element.querySelector('.settings')?.hasAttribute('aria-current')).toBe(false);
  });
});
