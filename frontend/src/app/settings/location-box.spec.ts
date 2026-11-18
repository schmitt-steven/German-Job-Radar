import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, of, throwError } from 'rxjs';
import { LocationBox, QUERY_DEBOUNCE_MS } from './location-box';
import { ProfileService } from './profile-service';
import { PlaceSuggestion, ProfilePlace } from './profile-types';

const KOELN_PLACE: PlaceSuggestion = {
  plz: '50667',
  name: 'Köln',
  district: null,
  isPlaceOnly: true,
};
const KOELN_PAIR: PlaceSuggestion = {
  plz: '50667',
  name: 'Köln',
  district: null,
  isPlaceOnly: false,
};
const AACH: PlaceSuggestion = {
  plz: '78267',
  name: 'Aach',
  district: 'Landkreis Konstanz',
  isPlaceOnly: true,
};

@Component({
  imports: [ReactiveFormsModule, LocationBox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-location-box inputId="place" [formControl]="place" />`,
})
class Host {
  readonly place = new FormControl<ProfilePlace | null>(null);
}

describe('LocationBox', () => {
  let getPlaces: ReturnType<typeof vi.fn<(query: string) => Observable<PlaceSuggestion[]>>>;

  beforeEach(() => {
    getPlaces = vi.fn(() => of([KOELN_PLACE, KOELN_PAIR, AACH]));
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: ProfileService, useValue: { getPlaces: (q: string) => getPlaces(q) } },
      ],
    });
  });

  async function render(initial: ProfilePlace | null = null) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.place.setValue(initial);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const plz = element.querySelector<HTMLInputElement>('#place')!;
    const input = element.querySelector<HTMLInputElement>('#place-name')!;
    const control = fixture.componentInstance.place;

    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, QUERY_DEBOUNCE_MS + 30));
      await fixture.whenStable();
    };
    const typeInto = async (field: HTMLInputElement, text: string) => {
      field.value = text;
      field.dispatchEvent(new Event('input'));
      await settle();
    };
    const type = (text: string) => typeInto(input, text);
    const typePlz = (text: string) => typeInto(plz, text);
    const key = async (name: string, field = input) => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
      await fixture.whenStable();
    };
    /** Focus leaves `field` for `next`, null for outside the box. */
    const blur = async (field = input, next: HTMLElement | null = null) => {
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next }));
      await fixture.whenStable();
    };
    const options = () =>
      [...element.querySelectorAll<HTMLElement>('[role="option"]')].filter(
        () => !element.querySelector<HTMLElement>('[role="listbox"]')!.hidden,
      );
    const message = () => element.querySelector('.message')?.textContent?.trim() ?? '';

    return { fixture, element, plz, input, control, type, typePlz, key, blur, options, message };
  }

  it('shows a saved place split into PLZ and Ort', async () => {
    const box = await render({ plz: '50667', name: 'Köln' });

    expect(box.plz.value).toBe('50667');
    expect(box.input.value).toBe('Köln');
    expect(box.control.valid).toBe(true);
    expect(box.message()).toBe('');
  });

  it('asks nothing below 3 characters', async () => {
    const box = await render();
    await box.type('Kö');

    expect(getPlaces).not.toHaveBeenCalled();
    expect(box.options().length).toBe(0);
    expect(box.input.getAttribute('aria-expanded')).toBe('false');
  });

  it('asks once the typing pauses, with the trimmed text', async () => {
    const box = await render();
    box.input.value = 'Köl';
    box.input.dispatchEvent(new Event('input'));
    await box.type(' Köln ');

    expect(getPlaces).toHaveBeenCalledTimes(1);
    expect(getPlaces).toHaveBeenCalledWith('Köln');
  });

  it('lists bare places by name, pairs with PLZ, and repeated names with their Landkreis', async () => {
    const box = await render();
    await box.type('Kö');
    await box.type('Köln');

    expect(box.input.getAttribute('aria-expanded')).toBe('true');
    const spans = box
      .options()
      .map((option) =>
        [...option.querySelectorAll('span')].map((span) => span.textContent?.trim()),
      );

    expect(spans).toEqual([['Köln'], ['50667 Köln'], ['Aach', 'Landkreis Konstanz']]);
  });

  it('picks a bare place, fills both halves and names the PLZ', async () => {
    const box = await render();
    await box.type('Köln');
    box.options()[0].click();
    await box.fixture.whenStable();

    expect(box.plz.value).toBe('50667');
    expect(box.input.value).toBe('Köln');
    expect(box.control.value).toEqual({ plz: '50667', name: 'Köln' });
    expect(box.control.valid).toBe(true);
    expect(box.message()).toBe(
      'PLZ 50667 für Köln gewählt. Für eine andere PLZ einfach eintippen.',
    );
    expect(box.options().length).toBe(0);
  });

  it('picks a pair without the PLZ line', async () => {
    const box = await render();
    await box.type('Köln');
    box.options()[1].click();
    await box.fixture.whenStable();

    expect(box.plz.value).toBe('50667');
    expect(box.input.value).toBe('Köln');
    expect(box.control.value).toEqual({ plz: '50667', name: 'Köln' });
    expect(box.message()).toBe('');
  });

  it('picks with the arrow keys and Enter', async () => {
    const box = await render();
    await box.type('Köln');
    await box.key('ArrowDown');
    await box.key('ArrowDown');

    expect(box.input.getAttribute('aria-activedescendant')).toBe(box.options()[1].id);
    expect(box.options()[1].getAttribute('aria-selected')).toBe('true');

    await box.key('Enter');

    expect(box.control.value).toEqual({ plz: '50667', name: 'Köln' });
  });

  it('wraps around with ArrowUp from the top', async () => {
    const box = await render();
    await box.type('Köln');
    await box.key('ArrowDown');
    await box.key('ArrowUp');

    expect(box.input.getAttribute('aria-activedescendant')).toBe(box.options()[2].id);
  });

  it('closes the list on Escape and keeps the text', async () => {
    const box = await render();
    await box.type('Köln');
    await box.key('Escape');

    expect(box.input.getAttribute('aria-expanded')).toBe('false');
    expect(box.input.value).toBe('Köln');
  });

  it('is invalid with null while the text is not a pick', async () => {
    const box = await render({ plz: '50667', name: 'Köln' });
    await box.type('Köln');

    expect(box.control.value).toBeNull();
    expect(box.control.hasError('placeNotPicked')).toBe(true);
  });

  it('says "Ort nicht gefunden" when nothing matches', async () => {
    getPlaces.mockReturnValue(of([]));
    const box = await render();
    await box.type('Zzqxkv');

    expect(box.message()).toBe('Ort nicht gefunden');
    expect(box.input.getAttribute('aria-invalid')).toBe('true');
    expect(box.control.invalid).toBe(true);
  });

  it('asks for a pick after leaving the field with typed text', async () => {
    const box = await render();
    await box.type('Köln');

    expect(box.input.getAttribute('aria-invalid')).toBe('false');

    await box.blur();

    expect(box.message()).toBe('Bitte einen Vorschlag aus der Liste wählen.');
    expect(box.input.getAttribute('aria-invalid')).toBe('true');
    expect(box.control.touched).toBe(true);
  });

  it('accepts an empty box as no place', async () => {
    const box = await render({ plz: '50667', name: 'Köln' });
    await box.typePlz('');
    await box.type('');
    await box.blur();

    expect(box.control.value).toBeNull();
    expect(box.control.valid).toBe(true);
    expect(box.message()).toBe('');
  });

  it('drops the PLZ line once the user types again', async () => {
    const box = await render();
    await box.type('Köln');
    box.options()[0].click();
    await box.fixture.whenStable();
    await box.typePlz('50668');

    expect(box.message()).toBe('');
    expect(getPlaces).toHaveBeenLastCalledWith('50668');
  });

  it('says when the suggestions fail to load', async () => {
    getPlaces.mockReturnValue(throwError(() => new Error('offline')));
    const box = await render();
    await box.type('Köln');

    expect(box.message()).toBe('Vorschläge konnten nicht geladen werden.');
    expect(box.options().length).toBe(0);
  });

  it('follows the control being disabled', async () => {
    const box = await render();
    box.control.disable();
    await box.fixture.whenStable();

    expect(box.plz.disabled).toBe(true);
    expect(box.input.disabled).toBe(true);
  });

  it('is invalid while only one half is left of a pick', async () => {
    const box = await render({ plz: '50667', name: 'Köln' });
    await box.typePlz('');

    expect(box.input.value).toBe('Köln');
    expect(box.control.value).toBeNull();
    expect(box.control.hasError('placeNotPicked')).toBe(true);
  });

  it('suggests from a PLZ prefix typed in the PLZ half', async () => {
    getPlaces.mockReturnValue(of([KOELN_PAIR]));
    const box = await render();
    await box.typePlz('506');

    expect(getPlaces).toHaveBeenCalledWith('506');
    expect(box.plz.getAttribute('aria-expanded')).toBe('true');
    expect(box.input.getAttribute('aria-expanded')).toBe('false');

    await box.key('ArrowDown', box.plz);

    expect(box.plz.getAttribute('aria-activedescendant')).toBe(box.options()[0].id);
    expect(box.input.hasAttribute('aria-activedescendant')).toBe(false);

    await box.key('Enter', box.plz);

    expect(box.control.value).toEqual({ plz: '50667', name: 'Köln' });
    expect(box.input.value).toBe('Köln');
  });

  it('keeps only up to 5 digits in the PLZ half', async () => {
    const box = await render();
    await box.typePlz('5a06-67 89');

    expect(box.plz.value).toBe('50667');
    expect(getPlaces).toHaveBeenCalledWith('50667');
  });

  it('says "PLZ nicht gefunden" when no PLZ matches', async () => {
    getPlaces.mockReturnValue(of([]));
    const box = await render();
    await box.typePlz('00000');

    expect(box.message()).toBe('PLZ nicht gefunden');
    expect(box.plz.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not count moving between the halves as leaving the field', async () => {
    const box = await render();
    await box.typePlz('506');
    await box.blur(box.plz, box.input);

    expect(box.message()).toBe('');
    expect(box.control.touched).toBe(false);
  });

  it('names both halves for screen readers', async () => {
    const box = await render();

    expect(box.plz.getAttribute('aria-label')).toBe('Wohnort, Postleitzahl');
    expect(box.input.getAttribute('aria-label')).toBe('Wohnort, Ort');
  });
});
