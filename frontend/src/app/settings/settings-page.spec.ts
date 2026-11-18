import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists only the Profil section, marked current', async () => {
    const element = await render();
    const cards = element.querySelectorAll('nav[aria-label="Einstellungen"] a');

    expect(element.querySelector('h1')?.textContent).toBe('Einstellungen');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent?.trim()).toBe('Profil');
    expect(cards[0].getAttribute('aria-current')).toBe('page');
  });

  it('names the panel after its heading', async () => {
    const element = await render();
    const panel = element.querySelector('section.panel');
    const heading = element.querySelector(`#${panel?.getAttribute('aria-labelledby')}`);

    expect(heading?.textContent).toBe('Profil');
  });
});
