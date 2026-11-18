import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './shell/sidebar';
import { TopBar } from './shell/top-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TopBar, Sidebar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header app-top-bar></header>
    <div class="columns">
      <aside app-sidebar></aside>
      <router-outlet />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .columns {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: var(--columns-gap);
      flex: 1;
      min-height: 0;
      padding: var(--columns-padding-top) 0 var(--columns-padding-bottom);
    }

    /* Side by side the window doesn't scroll, every column scrolls on its own. */
    @media (min-width: 1220px) {
      :host {
        height: 100vh;
      }

      .columns {
        flex-wrap: nowrap;
      }
    }

    /* The page renders beside the outlet, the empty outlet would take a gap. */
    router-outlet {
      display: none;
    }
  `,
})
export class App {}
