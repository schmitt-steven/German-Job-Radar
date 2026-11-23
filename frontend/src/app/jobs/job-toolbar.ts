import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icon } from '../icons/icon';
import { JobService } from './job-service';
import { JobView } from '../status/status-types';

/** The options, plus the picked value if the view has no job for it. */
function withSelectedValue(options: string[], picked: string | null): string[] {
  if (picked === null || options.includes(picked)) {
    return options;
  }
  return [picked, ...options];
}

@Component({
  selector: 'app-job-toolbar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search">
      <app-icon name="search" />
      <input
        #search
        class="field"
        type="search"
        placeholder="Titel, Firma, Skill"
        aria-label="Jobs durchsuchen"
        [value]="query() ?? ''"
        (input)="query.set(search.value || null)"
      />
    </div>

    <div class="filters">
      <select
        #locationSelect
        class="field"
        aria-label="Ort"
        (change)="location.set(locationSelect.value || null)"
      >
        <option value="">Alle Orte</option>
        @for (option of options().locations; track option) {
          <option [value]="option" [selected]="option === location()">{{ option }}</option>
        }
      </select>

      <select
        #companySelect
        class="field"
        aria-label="Firma"
        (change)="company.set(companySelect.value || null)"
      >
        <option value="">Alle Firmen</option>
        @for (option of options().companies; track option) {
          <option [value]="option" [selected]="option === company()">{{ option }}</option>
        }
      </select>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .search {
      position: relative;
    }

    app-icon {
      position: absolute;
      left: 12px;
      top: 12px;
      color: var(--text-dim);
      transition: color 0.15s;
    }

    .search:focus-within app-icon {
      color: var(--text-secondary);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .field {
      border: 1px solid var(--line);
      font: inherit;
      outline: none;
      transition:
        border-color 0.15s,
        background-color 0.15s,
        box-shadow 0.2s;
    }

    .field:hover {
      border-color: rgba(255, 255, 255, 0.14);
    }

    /* Replaces the outline as the focus ring. */
    .field:focus {
      border-color: rgba(255, 236, 210, 0.28);
      background-color: var(--bg-input-focus);
      box-shadow:
        0 0 0 3px rgba(255, 236, 210, 0.06),
        0 8px 20px -10px rgba(10, 6, 2, 0.7);
    }

    input {
      width: 100%;
      height: 40px;
      padding: 0 var(--space-3) 0 var(--space-10);
      border-radius: var(--radius-button);
      background-color: var(--bg-input);
      color: var(--text);
      font-size: var(--text-base);
    }

    input::placeholder {
      color: var(--text-dimmer);
    }

    /* The arrow is two triangles, the native one can't be colored. */
    select {
      --arrow: var(--text-dim);
      width: 180px;
      max-width: 100%;
      height: 32px;
      text-overflow: ellipsis;
      padding: 0 var(--space-8) 0 var(--space-3);
      border-radius: var(--radius-control);
      background-color: var(--bg-select);
      background-image:
        linear-gradient(45deg, transparent 50%, var(--arrow) 50%),
        linear-gradient(135deg, var(--arrow) 50%, transparent 50%);
      background-position:
        calc(100% - 15px) 52%,
        calc(100% - 11px) 52%;
      background-size: 4px 4px;
      background-repeat: no-repeat;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      appearance: none;
      cursor: pointer;
    }

    select:focus {
      --arrow: var(--text-secondary);
    }

    option {
      background-color: var(--bg-input-focus);
      color: var(--text-secondary);
    }

    /* Same breakpoint as --top-bar-height in tokens.css. */
    @media (min-width: 1220px) {
      :host {
        position: sticky;
        /* Sticks at the list's top edge, not below its top padding. */
        top: calc(-1 * var(--column-padding));
        z-index: 3;
        margin: calc(-1 * var(--space-4)) calc(-1 * var(--tab-reach)) 0 calc(-1 * var(--column-padding));
        padding: var(--space-4) var(--tab-reach) var(--space-3) var(--column-padding);
        background: var(--bg-page);
      }

      /* Fades the cards out as they scroll under the toolbar. */
      :host::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 100%;
        height: 16px;
        background: linear-gradient(var(--bg-page), rgba(18, 17, 15, 0));
        pointer-events: none;
      }
    }
  `,
})
export class JobToolbar {
  private readonly jobService = inject(JobService);

  readonly view = input.required<JobView>();
  readonly query = model<string | null>(null);
  readonly company = model<string | null>(null);
  readonly location = model<string | null>(null);

  /** Empty while loading or when loading failed, so the dropdowns still show "Alle …". */
  readonly options = computed(() => {
    const values = this.values.hasValue() ? this.values.value() : { locations: [], companies: [] };
    return {
      locations: withSelectedValue(values.locations, this.location()),
      companies: withSelectedValue(values.companies, this.company()),
    };
  });

  /** The dropdown options, reloaded when the view changes. */
  readonly values = rxResource({
    params: () => this.view(),
    stream: ({ params }) => this.jobService.getLocationsAndCompanies(params),
  });
}
