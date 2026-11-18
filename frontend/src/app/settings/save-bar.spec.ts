import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SaveBar, SaveState } from './save-bar';

@Component({
  imports: [SaveBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-save-bar [state]="state()" [reason]="reason()" />`,
})
class Host {
  readonly state = signal<SaveState>('ALL_SAVED');
  readonly reason = signal<string | null>(null);
}

describe('SaveBar', () => {
  async function render(state: SaveState, reason: string | null = null) {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.state.set(state);
    fixture.componentInstance.reason.set(reason);
    await fixture.whenStable();
    const bar = (fixture.nativeElement as HTMLElement).querySelector('app-save-bar')!;
    return {
      bar,
      title: bar.querySelector('.title')?.textContent?.trim(),
      reason: bar.querySelector('.reason')?.textContent?.trim() ?? null,
    };
  }

  it.each<[SaveState, string]>([
    ['ALL_SAVED', 'Alles gespeichert'],
    ['SAVING', 'Speichere…'],
    ['OPEN', 'Änderung offen'],
    ['INVALID', 'Nicht gespeichert'],
    ['FAILED', 'Nicht gespeichert'],
  ])('says %s as "%s"', async (state, title) => {
    const view = await render(state);

    expect(view.title).toBe(title);
    expect(view.bar.getAttribute('data-state')).toBe(state);
  });

  it('announces its state as a status', async () => {
    const { bar } = await render('SAVING');

    expect(bar.querySelector('[role="status"]')?.textContent).toContain('Speichere…');
  });

  it('shows the reason below the title', async () => {
    const view = await render('FAILED', 'Der Radius muss zwischen 1 und 100 km liegen.');

    expect(view.reason).toBe('Der Radius muss zwischen 1 und 100 km liegen.');
  });

  it('leaves the reason out without one', async () => {
    const view = await render('ALL_SAVED');

    expect(view.reason).toBeNull();
  });
});
