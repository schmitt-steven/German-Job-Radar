import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map, merge } from 'rxjs';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { StatusService } from '../status/status-service';
import { LocationBox } from './location-box';
import { ProfileService } from './profile-service';
import { ProfilePlace, UserProfile } from './profile-types';
import { SaveBar, SaveState } from './save-bar';

export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 100;
/** Typed text waits this long, a picked place is saved at once. */
export const TEXT_SAVE_DEBOUNCE_MS = 300;

type LoadState = 'LOADING' | 'LOADED' | 'FAILED';

function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { wholeNumber: true };
}

/** The Profil section of the settings: search term, place and radius. */
@Component({
  selector: 'app-profile-panel',
  imports: [ReactiveFormsModule, LocationBox, SaveBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="content">
      <header>
        <h2 id="profile-panel-title">Profil</h2>
        <p class="intro">
          Wonach und wo gesucht wird. Pflicht sind Suchbegriff, Wohnort und Umkreis.
        </p>
      </header>

      @if (loadState() === 'FAILED') {
        <div class="load-error" role="alert">
          <span>Das Profil konnte nicht geladen werden.</span>
          <button type="button" class="btn-soft" (click)="load()">Erneut versuchen</button>
        </div>
      }

      <form [formGroup]="form" (submit)="$event.preventDefault()">
        <section class="group">
          <div class="title-row">
            <h3 id="search-term-title">Suchbegriff</h3>
            <span class="pill required">Pflicht</span>
          </div>
          <input
            class="text-input"
            type="text"
            formControlName="searchTerm"
            placeholder="z. B. Software-Entwickler"
            aria-labelledby="search-term-title"
            aria-required="true"
          />
        </section>

        <section class="group">
          <h3>Standort</h3>
          <div class="grid">
            <div class="field">
              <div class="title-row">
                <label class="label" for="location-box">Wohnort</label>
                <span class="pill required">Pflicht</span>
              </div>
              <app-location-box
                inputId="location-box"
                formControlName="place"
                [isRequired]="true"
              />
            </div>
            <div class="field">
              <div class="title-row">
                <label class="label" for="search-radius">Suchradius</label>
                <span class="pill required">Pflicht</span>
              </div>
              <div class="with-unit">
                <input
                  id="search-radius"
                  class="text-input"
                  type="number"
                  inputmode="numeric"
                  [min]="minRadius"
                  [max]="maxRadius"
                  step="1"
                  placeholder="{{ minRadius }} bis {{ maxRadius }} km, ganze Zahl"
                  formControlName="searchRadius"
                  aria-required="true"
                  [attr.aria-describedby]="radiusError() ? 'search-radius-error' : null"
                  [attr.aria-invalid]="isRadiusInvalid()"
                  (input)="isRadiusUnreadable.set($any($event.target).validity.badInput)"
                />
                <span class="unit" aria-hidden="true">km</span>
              </div>
              <span id="search-radius-error" class="hint is-invalid" aria-live="polite">{{
                radiusError()
              }}</span>
            </div>
          </div>
        </section>
      </form>

      <p class="hint osm-notice">
        Enthält Informationen von
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
          >OpenStreetMap</a
        >, die unter der
        <a
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          target="_blank"
          rel="noopener noreferrer"
          >Open Database License (ODbL)</a
        >
        verfügbar sind. © OpenStreetMap-Mitwirkende
      </p>
    </div>

    @if (saveStatus(); as status) {
      <app-save-bar [state]="status.state" [reason]="status.reason" />
    }
  `,
  styles: `
    /* Fills the panel, so the save bar sits at its bottom edge even when the content is short. */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 0 auto;
    }

    .content {
      flex: 1 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-10);
      max-width: 720px;
    }

    header {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    h2 {
      font-size: var(--text-4xl);
      line-height: 1.15;
      letter-spacing: -0.01em;
    }

    h3 {
      font-size: var(--text-2xl);
      line-height: 1.2;
    }

    .intro {
      margin: 0;
      max-width: 560px;
      font-size: var(--text-base);
      line-height: 1.6;
      color: var(--text-muted);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-10);
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-4);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .label {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--text-secondary);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 500;
      white-space: nowrap;
    }

    .pill.required {
      background: rgba(229, 115, 111, 0.14);
      color: var(--red-text);
    }

    .with-unit {
      position: relative;
    }

    .with-unit .text-input {
      padding-right: 44px;
    }

    .unit {
      position: absolute;
      right: 12px;
      top: 0;
      line-height: 40px;
      font-size: var(--text-sm);
      color: var(--text-dim);
      pointer-events: none;
    }

    .hint {
      margin: 0;
      font-size: var(--text-sm);
      line-height: 1.5;
      color: var(--text-dim);
    }

    .hint.is-invalid {
      color: var(--red-text);
    }

    .hint:empty {
      display: none;
    }

    .load-error {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: var(--space-3) var(--space-3);
      border-radius: var(--radius-card);
      background: rgba(229, 115, 111, 0.11);
      color: var(--red-text);
    }

    .load-error button {
      height: 40px;
      padding: 0 var(--space-4);
      border-radius: var(--radius-button);
      font-weight: 500;
    }

    .osm-notice {
      padding-top: var(--space-5);
      border-top: 1px solid var(--line-faint);
    }
  `,
})
export class ProfilePanel {
  private readonly profileService = inject(ProfileService);
  private readonly statusService = inject(StatusService);

  readonly minRadius = MIN_RADIUS_KM;
  readonly maxRadius = MAX_RADIUS_KM;
  readonly loadState = signal<LoadState>('LOADING');

  readonly form = new FormGroup({
    searchTerm: new FormControl('', { nonNullable: true }),
    place: new FormControl<ProfilePlace | null>(null),
    searchRadius: new FormControl<number | null>(null, [
      Validators.min(MIN_RADIUS_KM),
      Validators.max(MAX_RADIUS_KM),
      wholeNumber,
    ]),
  });

  private readonly radiusErrors = toSignal(
    this.form.controls.searchRadius.events.pipe(map(() => this.form.controls.searchRadius.errors)),
    { initialValue: null },
  );
  /** Text the number field can't read, like "12,5": its value is null, which looks valid. */
  readonly isRadiusUnreadable = signal(false);
  readonly isRadiusInvalid = computed(
    () => this.isRadiusUnreadable() || this.radiusErrors() !== null,
  );
  /** Why the radius is red, shown while typing. */
  readonly radiusError = computed(() => {
    const errors = this.radiusErrors();
    if (errors?.['min'] || errors?.['max']) {
      return `Der Umkreis muss zwischen ${MIN_RADIUS_KM} und ${MAX_RADIUS_KM} km liegen.`;
    }
    return this.isRadiusInvalid() ? 'Bitte eine ganze Zahl eingeben, ohne Komma.' : '';
  });

  private readonly isPlaceUnpicked = toSignal(
    this.form.controls.place.events.pipe(
      map(() => this.form.controls.place.hasError('placeNotPicked')),
    ),
    { initialValue: false },
  );

  /** A debounced save is waiting. */
  private readonly isSavePending = signal(false);
  private readonly isSaving = signal(false);
  private readonly saveFailure = signal<string | null>(null);

  /** What the save bar shows, null while the profile isn't loaded. */
  readonly saveStatus = computed((): { state: SaveState; reason: string | null } | null => {
    if (this.loadState() !== 'LOADED') {
      return null;
    }
    if (this.isRadiusInvalid()) {
      return { state: 'INVALID', reason: this.radiusError() };
    }
    if (this.isPlaceUnpicked()) {
      return {
        state: 'OPEN',
        reason: 'Der Wohnort wird gespeichert, sobald du einen Vorschlag aus der Liste wählst.',
      };
    }
    if (this.isSavePending() || this.isSaving()) {
      return { state: 'SAVING', reason: null };
    }
    const failure = this.saveFailure();
    if (failure !== null) {
      return { state: 'FAILED', reason: failure };
    }
    return { state: 'ALL_SAVED', reason: null };
  });

  /** The last profile the backend confirmed, so an unchanged form sends nothing. */
  private lastSaved: UserProfile | null = null;
  private inFlight: UserProfile | null = null;
  /** Only the newest change waits behind the running save. */
  private queued: UserProfile | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const { searchTerm, place, searchRadius } = this.form.controls;
    merge(
      merge(searchTerm.valueChanges, searchRadius.valueChanges).pipe(map(() => true)),
      // A pick saves at once, typing in the box (null) waits like any text.
      place.valueChanges.pipe(map((value) => value === null)),
    )
      .pipe(takeUntilDestroyed())
      .subscribe((isTyped) => this.onChange(isTyped));

    inject(DestroyRef).onDestroy(() => {
      // Leaving the page sends what is still waiting.
      if (this.debounceTimer !== undefined) {
        this.flush();
      }
    });

    this.load();
  }

  load(): void {
    this.loadState.set('LOADING');
    this.form.disable();
    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.form.setValue(toFormValue(profile));
        this.form.enable();
        this.lastSaved = this.toProfile();
        this.loadState.set('LOADED');
      },
      error: () => this.loadState.set('FAILED'),
    });
  }

  private onChange(isTyped: boolean): void {
    if (this.loadState() !== 'LOADED') {
      return;
    }
    clearTimeout(this.debounceTimer);
    if (!isTyped) {
      this.flush();
      return;
    }
    this.isSavePending.set(true);
    this.debounceTimer = setTimeout(() => this.flush(), TEXT_SAVE_DEBOUNCE_MS);
  }

  /** Saves the form now, unless a field is not valid yet. */
  private flush(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.isSavePending.set(false);
    // The controls, not the group: a pick arrives before the group has updated its status.
    const isAnyInvalid = Object.values(this.form.controls).some((control) => control.invalid);
    if (isAnyInvalid || this.isRadiusUnreadable()) {
      return;
    }
    this.send(this.toProfile());
  }

  private send(profile: UserProfile): void {
    if (this.inFlight !== null) {
      this.queued = isSameProfile(profile, this.inFlight) ? null : profile;
      return;
    }
    if (isSameProfile(profile, this.lastSaved) && this.saveFailure() === null) {
      return;
    }
    this.inFlight = profile;
    this.isSaving.set(true);
    this.saveFailure.set(null);
    this.profileService.saveProfile(profile).subscribe({
      next: () => {
        this.lastSaved = profile;
        this.statusService.refresh();
        this.sendQueued();
      },
      error: (error: unknown) => {
        this.saveFailure.set(failureReason(error));
        this.sendQueued();
      },
    });
  }

  private sendQueued(): void {
    this.inFlight = null;
    this.isSaving.set(false);
    const queued = this.queued;
    this.queued = null;
    if (queued !== null) {
      this.send(queued);
    }
  }

  private toProfile(): UserProfile {
    const { searchTerm, place, searchRadius } = this.form.getRawValue();
    const term = searchTerm.trim();
    return {
      searchTerms: term ? [term] : [],
      locationPlz: place?.plz ?? null,
      locationName: place?.name ?? null,
      searchRadius,
    };
  }
}

function toFormValue(profile: UserProfile) {
  const { locationPlz, locationName } = profile;
  return {
    searchTerm: profile.searchTerms[0] ?? '',
    place: locationPlz && locationName ? { plz: locationPlz, name: locationName } : null,
    searchRadius: profile.searchRadius,
  };
}

function isSameProfile(a: UserProfile, b: UserProfile | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The backend's 400 detail is German, it names the field it rejected. */
function failureReason(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 400 && typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    if (error.status === 0) {
      return 'Der Server ist nicht erreichbar. Die nächste Änderung wird erneut gesendet.';
    }
  }
  return 'Das Profil konnte nicht gespeichert werden. Die nächste Änderung wird erneut gesendet.';
}
