import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfilePanel } from './profile-panel';

// The other sections and the status line per card join in milestone 2.
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, ProfilePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="overview">
      <h1>Einstellungen</h1>
      <nav aria-label="Einstellungen">
        <a class="card is-selected" routerLink="/settings" aria-current="page">Profil</a>
      </nav>
    </main>
    <section
      class="panel pinned-column no-scrollbar"
      aria-labelledby="profile-panel-title"
    >
      <app-profile-panel />
    </section>
  `,
  styles: `
    /* The overview and the panel are columns of the shell's row. */
    :host {
      display: contents;
    }

    .overview {
      flex: 1 1 320px;
      max-width: 460px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 22px 22px 32px;
    }

    h1 {
      margin: 0;
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 26px;
      line-height: 1.15;
      color: var(--text-strong);
    }

    nav {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 14px;
    }

    .card {
      display: block;
      padding: 14px 18px;
      border: 1px solid transparent;
      border-radius: var(--radius-card);
      background-color: var(--bg-card);
      box-shadow: var(--shadow-card);
      color: var(--text-strong);
      font-size: 16px;
      font-weight: 500;
      line-height: 1.25;
      text-decoration: none;
      transition:
        background-color 0.18s,
        transform 0.18s,
        box-shadow 0.18s;
    }

    .card:hover {
      background-color: var(--bg-card-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-card-hover);
    }

    .card.is-selected,
    .card.is-selected:hover {
      background-color: var(--bg-details);
      background-image: linear-gradient(
        90deg,
        rgba(163, 217, 184, 0.13) 0%,
        rgba(163, 217, 184, 0.05) 35%,
        rgba(163, 217, 184, 0) 75%
      );
      background-origin: border-box;
      background-repeat: no-repeat;
      transform: none;
      box-shadow: none;
    }

    .panel {
      flex: 999 1 480px;
      display: flex;
      flex-direction: column;
      /* No bottom padding, the save bar sits at the bottom edge. */
      padding: 26px 28px 0;
      border-radius: var(--radius-panel) 0 0 var(--radius-panel);
      background: var(--bg-details);
    }

    /* Overview and panel share a row from here, so the selected card merges into the panel. */
    @media (min-width: 1100px) {
      .card.is-selected,
      .card.is-selected:hover {
        position: relative;
        z-index: 1;
        /* The overview's right padding plus the column gap. */
        margin-right: -34px;
        padding-right: 42px;
        border-radius: var(--radius-card) 0 0 var(--radius-card);
      }

      .card.is-selected::before,
      .card.is-selected::after {
        content: '';
        position: absolute;
        right: -1px;
        width: 14px;
        height: 15px;
        background: var(--bg-details);
        mask: no-repeat 0 0 / 100% 100%;
        pointer-events: none;
      }

      /* Each corner overlaps the card by 1px, so no hairline shows between them when zoomed. */
      .card.is-selected::before {
        bottom: calc(100% - 1px);
        mask-image: var(--mask-corner-above);
      }

      .card.is-selected::after {
        top: calc(100% - 1px);
        mask-image: var(--mask-corner-below);
      }
    }
  `,
})
export class SettingsPage {}
