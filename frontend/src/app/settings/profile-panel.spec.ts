import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { StatusService } from '../status/status-service';
import { QUERY_DEBOUNCE_MS } from './location-box';
import { ProfilePanel, TEXT_SAVE_DEBOUNCE_MS } from './profile-panel';
import { ProfileService } from './profile-service';
import { PlaceSuggestion, UserProfile } from './profile-types';

const PROFILE: UserProfile = {
  searchTerms: ['Software-Entwickler'],
  locationPlz: '50667',
  locationName: 'Köln',
  searchRadius: 30,
};

const EMPTY_PROFILE: UserProfile = {
  searchTerms: [],
  locationPlz: null,
  locationName: null,
  searchRadius: null,
};

const KOELN: PlaceSuggestion = { plz: '50667', name: 'Köln', district: null, isPlaceOnly: true };
const BONN: PlaceSuggestion = { plz: '53111', name: 'Bonn', district: null, isPlaceOnly: true };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ProfilePanel', () => {
  let getProfile: () => Observable<UserProfile>;
  /** Each PUT answers through its own subject, so a test decides when it finishes. */
  let saves: Subject<UserProfile>[];
  let saveProfile: ReturnType<typeof vi.fn<(profile: UserProfile) => Observable<UserProfile>>>;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getProfile = () => of(PROFILE);
    saves = [];
    saveProfile = vi.fn(() => {
      const answer = new Subject<UserProfile>();
      saves.push(answer);
      return answer;
    });
    refresh = vi.fn();
    TestBed.configureTestingModule({
      imports: [ProfilePanel],
      providers: [
        {
          provide: ProfileService,
          useValue: {
            getProfile: () => getProfile(),
            saveProfile: (profile: UserProfile) => saveProfile(profile),
            getPlaces: () => of([KOELN, BONN]),
          },
        },
        { provide: StatusService, useValue: { refresh } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(ProfilePanel);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      searchTerm: element.querySelector<HTMLInputElement>('input[type="text"]')!,
      radius: element.querySelector<HTMLInputElement>('#search-radius')!,
    };
  }

  type View = Awaited<ReturnType<typeof render>>;

  async function typeRadius(view: View, value: string) {
    view.radius.value = value;
    view.radius.dispatchEvent(new Event('input'));
    await view.fixture.whenStable();
  }

  async function typeSearchTerm(view: View, value: string) {
    view.searchTerm.value = value;
    view.searchTerm.dispatchEvent(new Event('input'));
    await view.fixture.whenStable();
  }

  /** Types into the Ort half of the location box and waits for its suggestions. */
  async function typePlace(view: View, value: string, half = '#location-box-name') {
    const box = view.element.querySelector<HTMLInputElement>(half)!;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    await wait(QUERY_DEBOUNCE_MS + 30);
    await view.fixture.whenStable();
  }

  async function pickPlace(view: View, label: string) {
    const option = [...view.element.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => item.textContent?.trim() === label,
    )!;
    option.click();
    await view.fixture.whenStable();
  }

  async function settle(view: View) {
    await wait(TEXT_SAVE_DEBOUNCE_MS + 30);
    await view.fixture.whenStable();
  }

  async function answerSave(view: View, index = saves.length - 1) {
    saves[index].next(saveProfile.mock.calls[index][0]);
    saves[index].complete();
    await view.fixture.whenStable();
  }

  const bar = (view: View) => ({
    title: view.element.querySelector('app-save-bar .title')?.textContent?.trim(),
    reason: view.element.querySelector('app-save-bar .reason')?.textContent?.trim() ?? null,
  });

  it('fills the fields from the profile', async () => {
    const view = await render();

    expect(view.searchTerm.value).toBe('Software-Entwickler');
    expect(view.radius.value).toBe('30');
    expect(view.fixture.componentInstance.form.controls.place.value).toEqual({
      plz: '50667',
      name: 'Köln',
    });
  });

  it('leaves the fields empty for an empty profile', async () => {
    getProfile = () => of(EMPTY_PROFILE);
    const view = await render();

    expect(view.searchTerm.value).toBe('');
    expect(view.radius.value).toBe('');
    expect(view.fixture.componentInstance.form.controls.place.value).toBeNull();
  });

  it('disables the fields until the profile is loaded', async () => {
    const answer = new Subject<UserProfile>();
    getProfile = () => answer;
    const view = await render();

    expect(view.searchTerm.disabled).toBe(true);
    expect(view.radius.disabled).toBe(true);

    answer.next(PROFILE);
    await view.fixture.whenStable();

    expect(view.searchTerm.disabled).toBe(false);
    expect(view.radius.disabled).toBe(false);
  });

  it('marks the search term, place and radius as required', async () => {
    const { searchTerm, radius, element } = await render();

    expect(searchTerm.getAttribute('aria-required')).toBe('true');
    expect(element.querySelector('#location-box')?.getAttribute('aria-required')).toBe('true');
    expect(element.querySelector('#location-box-name')?.getAttribute('aria-required')).toBe('true');
    expect(radius.getAttribute('aria-required')).toBe('true');
    expect(element.querySelectorAll('.pill.required').length).toBe(3);
  });

  it('shows the saved place in the location box', async () => {
    const { element } = await render();

    expect(element.querySelector<HTMLInputElement>('#location-box')?.value).toBe('50667');
    expect(element.querySelector<HTMLInputElement>('#location-box-name')?.value).toBe('Köln');
  });

  const radiusError = (view: Awaited<ReturnType<typeof render>>) =>
    view.element.querySelector('#search-radius-error')?.textContent?.trim() ?? '';

  it.each([
    ['0', 'Der Umkreis muss zwischen 1 und 100 km liegen.'],
    ['101', 'Der Umkreis muss zwischen 1 und 100 km liegen.'],
    ['12.5', 'Bitte eine ganze Zahl eingeben, ohne Komma.'],
  ])('says why a radius of %s is invalid', async (value, reason) => {
    const view = await render();
    await typeRadius(view, value);

    expect(view.radius.getAttribute('aria-invalid')).toBe('true');
    expect(radiusError(view)).toBe(reason);
    expect(view.radius.getAttribute('aria-describedby')).toBe('search-radius-error');
  });

  it('updates the reason when the error changes', async () => {
    const view = await render();
    await typeRadius(view, '12.5');
    await typeRadius(view, '150');

    expect(radiusError(view)).toBe('Der Umkreis muss zwischen 1 und 100 km liegen.');
  });

  it('flags text the number field cannot read, like "12,5"', async () => {
    const view = await render();
    Object.defineProperty(view.radius, 'validity', { value: { badInput: true } });
    await typeRadius(view, '');

    expect(view.radius.getAttribute('aria-invalid')).toBe('true');
    expect(radiusError(view)).toBe('Bitte eine ganze Zahl eingeben, ohne Komma.');
  });

  it.each(['1', '100', ''])('accepts a radius of "%s" without a reason', async (value) => {
    const view = await render();
    await typeRadius(view, '0');
    await typeRadius(view, value);

    expect(view.radius.getAttribute('aria-invalid')).toBe('false');
    expect(radiusError(view)).toBe('');
    expect(view.radius.hasAttribute('aria-describedby')).toBe(false);
  });

  it('offers a retry when the profile fails to load', async () => {
    getProfile = () => throwError(() => new Error('offline'));
    const view = await render();

    expect(view.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Profil konnte nicht geladen werden.',
    );
    expect(view.searchTerm.disabled).toBe(true);

    getProfile = () => of(PROFILE);
    view.element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await view.fixture.whenStable();

    expect(view.element.querySelector('[role="alert"]')).toBeNull();
    expect(view.searchTerm.value).toBe('Software-Entwickler');
  });

  it('shows the OpenStreetMap notice with both links', async () => {
    const { element } = await render();
    const links = [...element.querySelectorAll('.osm-notice a')].map((link) =>
      link.getAttribute('href'),
    );

    expect(element.querySelector('.osm-notice')?.textContent).toContain(
      '© OpenStreetMap-Mitwirkende',
    );
    expect(links).toEqual([
      'https://www.openstreetmap.org/copyright',
      'https://opendatacommons.org/licenses/odbl/1-0/',
    ]);
  });

  it('says "Alles gespeichert" once loaded and saves nothing on load', async () => {
    const view = await render();

    expect(bar(view).title).toBe('Alles gespeichert');
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('shows no save bar until the profile is loaded', async () => {
    getProfile = () => new Subject<UserProfile>();
    const view = await render();

    expect(view.element.querySelector('app-save-bar')).toBeNull();
  });

  it('saves typed text once, 300 ms after the last key', async () => {
    const view = await render();
    await typeSearchTerm(view, 'Java');
    await typeSearchTerm(view, 'Java-Entw');
    await typeSearchTerm(view, 'Java-Entwickler ');

    expect(saveProfile).not.toHaveBeenCalled();
    expect(bar(view).title).toBe('Speichere…');

    await settle(view);

    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, searchTerms: ['Java-Entwickler'] });
  });

  it('saves an empty search term as no terms', async () => {
    const view = await render();
    await typeSearchTerm(view, '  ');
    await settle(view);

    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, searchTerms: [] });
  });

  it('goes from "Speichere…" to "Alles gespeichert" and refreshes the status', async () => {
    const view = await render();
    await typeRadius(view, '50');
    await settle(view);

    expect(bar(view).title).toBe('Speichere…');

    await answerSave(view);

    expect(bar(view).title).toBe('Alles gespeichert');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('saves a picked place at once', async () => {
    const view = await render();
    await typePlace(view, 'Bon');
    await pickPlace(view, 'Bonn');

    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenCalledWith({
      ...PROFILE,
      locationPlz: '53111',
      locationName: 'Bonn',
    });
  });

  it('waits with "Änderung offen" while the place is not picked', async () => {
    const view = await render();
    await typePlace(view, 'Bon');
    await settle(view);

    expect(saveProfile).not.toHaveBeenCalled();
    expect(bar(view)).toEqual({
      title: 'Änderung offen',
      reason: 'Der Wohnort wird gespeichert, sobald du einen Vorschlag aus der Liste wählst.',
    });
  });

  it('saves a cleared place as no place', async () => {
    const view = await render();
    await typePlace(view, '', '#location-box');
    await typePlace(view, '');
    await settle(view);

    expect(saveProfile).toHaveBeenCalledWith({
      ...PROFILE,
      locationPlz: null,
      locationName: null,
    });
  });

  it.each(['0', '101', '12.5'])('saves no radius of %s and says why', async (value) => {
    const view = await render();
    await typeRadius(view, value);
    await settle(view);

    expect(saveProfile).not.toHaveBeenCalled();
    expect(bar(view).title).toBe('Nicht gespeichert');
    expect(bar(view).reason).toBe(
      value === '12.5'
        ? 'Bitte eine ganze Zahl eingeben, ohne Komma.'
        : 'Der Umkreis muss zwischen 1 und 100 km liegen.',
    );
  });

  it('saves no radius the number field cannot read', async () => {
    const view = await render();
    Object.defineProperty(view.radius, 'validity', { value: { badInput: true } });
    await typeRadius(view, '');
    await settle(view);

    expect(saveProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['1', 1],
    ['100', 100],
    ['', null],
  ])('saves a radius of "%s"', async (value, saved) => {
    const view = await render();
    await typeRadius(view, value);
    await settle(view);

    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, searchRadius: saved });
  });

  it('runs one save at a time and sends only the newest change after it', async () => {
    const view = await render();
    await typeRadius(view, '40');
    await settle(view);
    await typeRadius(view, '45');
    await settle(view);
    await typeRadius(view, '50');
    await settle(view);

    expect(saveProfile).toHaveBeenCalledTimes(1);

    await answerSave(view, 0);

    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(saveProfile).toHaveBeenLastCalledWith({ ...PROFILE, searchRadius: 50 });
    expect(bar(view).title).toBe('Speichere…');
  });

  it('sends nothing when the change is undone before the debounce ends', async () => {
    const view = await render();
    await typeRadius(view, '40');
    await typeRadius(view, '30');
    await settle(view);

    expect(saveProfile).not.toHaveBeenCalled();
    expect(bar(view).title).toBe('Alles gespeichert');
  });

  it('shows the server reason when a save is rejected', async () => {
    const view = await render();
    await typePlace(view, 'Bon');
    await pickPlace(view, 'Bonn');
    saves[0].error(
      new HttpErrorResponse({
        status: 400,
        error: { detail: 'Ort und PLZ stimmen nicht überein. Bitte überprüfe deine Eingabe.' },
      }),
    );
    await view.fixture.whenStable();

    expect(bar(view)).toEqual({
      title: 'Nicht gespeichert',
      reason: 'Ort und PLZ stimmen nicht überein. Bitte überprüfe deine Eingabe.',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('says when the server is unreachable and tries again on the next change', async () => {
    const view = await render();
    await typeRadius(view, '40');
    await settle(view);
    saves[0].error(new HttpErrorResponse({ status: 0 }));
    await view.fixture.whenStable();

    expect(bar(view).title).toBe('Nicht gespeichert');
    expect(bar(view).reason).toContain('nicht erreichbar');

    await typeRadius(view, '41');
    await settle(view);

    expect(saveProfile).toHaveBeenCalledTimes(2);
  });

  it('sends a waiting change right away when the page is left', async () => {
    const view = await render();
    await typeSearchTerm(view, 'Java-Entwickler');
    view.fixture.destroy();

    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, searchTerms: ['Java-Entwickler'] });
  });
});
