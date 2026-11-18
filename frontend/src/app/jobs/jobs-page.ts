import { ChangeDetectionStrategy, Component } from '@angular/core';
import { JobList } from './job-list';
import { JobDetails } from './job-details';

@Component({
  selector: 'app-jobs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JobList, JobDetails],
  template: `
    <main app-job-list class="list no-scrollbar"></main>
    <section
      app-job-details
      class="details pinned-column no-scrollbar"
      aria-label="Details"
    ></section>
  `,
  styles: `
    /* The list and the details are columns of the shell's row. */
    :host {
      display: contents;
    }

    .list {
      flex: 999 1 540px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 22px 22px 32px;
    }

    @media (min-width: 1220px) {
      .list {
        overflow-y: auto;
        overscroll-behavior: none;
        /* Reaches under the details by the gap plus 1px, so the selected card isn't clipped where it joins the panel. */
        margin-right: calc(-1 * var(--columns-gap) - 1px);
        padding-right: calc(22px + var(--columns-gap) + 1px);
      }
    }

    .details {
      flex: 999 1 420px;
      padding: 26px 28px 40px;
      border-radius: var(--radius-panel) 0 0 var(--radius-panel);
      background: var(--bg-details);
    }
  `,
})
export class JobsPage {}
