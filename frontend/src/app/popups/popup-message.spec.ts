import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Popup, PopupService } from './popup-service';
import { PopupMessage } from './popup-message';

describe('PopupMessage', () => {
  const current = signal<Popup | null>(null);
  const dismiss = vi.fn(() => current.set(null));

  beforeEach(() => {
    dismiss.mockClear();
    TestBed.configureTestingModule({
      imports: [PopupMessage],
      providers: [
        provideRouter([]),
        { provide: PopupService, useValue: { current: current.asReadonly(), dismiss } },
      ],
    });
  });

  async function render(popup: Popup | null): Promise<HTMLElement> {
    current.set(popup);
    const fixture = TestBed.createComponent(PopupMessage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const newJobs: Popup = {
    id: 1,
    headline: '6 neue Jobs gefunden',
    detail: null,
    action: { label: 'Anzeigen', route: ['/'], queryParams: { view: 'NEW' } },
  };

  it('keeps an empty live region without a popup', async () => {
    const element = await render(null);

    expect(element.getAttribute('role')).toBe('status');
    expect(element.textContent!.trim()).toBe('');
  });

  it('shows the headline, the detail and the action', async () => {
    const element = await render({ ...newJobs, detail: '· 34 aussortiert' });

    expect(element.querySelector('.headline')!.textContent).toBe('6 neue Jobs gefunden');
    expect(element.querySelector('.detail')!.textContent!.trim()).toBe('· 34 aussortiert');
    expect(element.querySelector('.action')!.textContent!.trim()).toBe('Anzeigen');
  });

  it('leaves out the button without an action', async () => {
    const element = await render({ ...newJobs, action: null });

    expect(element.querySelector('.action')).toBeNull();
  });

  it('opens the view and dismisses on the action', async () => {
    const element = await render(newJobs);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    element.querySelector<HTMLButtonElement>('.action')!.click();

    expect(dismiss).toHaveBeenCalled();
    expect(navigate.mock.calls[0][0].toString()).toBe('/?view=NEW');
  });

  it('dismisses on ×', async () => {
    const element = await render(newJobs);

    element.querySelector<HTMLButtonElement>('[aria-label="Schließen"]')!.click();

    expect(dismiss).toHaveBeenCalled();
  });
});
