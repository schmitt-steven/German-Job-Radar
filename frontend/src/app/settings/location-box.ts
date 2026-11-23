import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { Observable, Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { ProfileService } from './profile-service';
import { PlaceSuggestion, ProfilePlace } from './profile-types';

/** The backend rejects shorter queries. */
export const MIN_QUERY_LENGTH = 3;
export const QUERY_DEBOUNCE_MS = 150;

type QueryResult = PlaceSuggestion[] | 'FAILED' | null;
/** The half of the box the user typed in last. */
type Field = 'PLZ' | 'NAME';

let nextId = 0;

/** "50667 Köln", how a picked place shows in the box. */
export function placeText(place: ProfilePlace): string {
  return `${place.plz} ${place.name}`;
}

/** "Köln" for a bare place, "50667 Köln" for a pair. */
export function suggestionLabel(suggestion: PlaceSuggestion): string {
  return suggestion.isPlaceOnly ? suggestion.name : placeText(suggestion);
}

/**
 * Picks the profile's place from `/api/places`, with a PLZ and an Ort half like the mock.
 * Typing in either half suggests places, a pick fills both. Only a pick is a value,
 * typed text that isn't one is null and fails validation.
 */
@Component({
  selector: 'app-location-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LocationBox), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => LocationBox), multi: true },
  ],
  template: `
    <div class="anchor">
      <div
        class="combo"
        [class.is-invalid]="isMarkedInvalid()"
        [class.is-disabled]="isDisabled()"
        (focusout)="onFocusOut($event)"
      >
        <input
          [id]="inputId()"
          class="plz"
          type="text"
          role="combobox"
          inputmode="numeric"
          maxlength="5"
          autocomplete="off"
          placeholder="PLZ"
          aria-label="Wohnort, Postleitzahl"
          aria-autocomplete="list"
          [attr.aria-required]="isRequired()"
          [attr.aria-expanded]="isOpen() && activeField() === 'PLZ'"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeField() === 'PLZ' ? activeOptionId() : null"
          [attr.aria-describedby]="message() ? messageId : null"
          [attr.aria-invalid]="isMarkedInvalid()"
          [value]="plzText()"
          [disabled]="isDisabled()"
          (input)="onPlzInput($any($event.target))"
          (keydown)="onKeydown($event)"
        />
        <input
          [id]="nameInputId()"
          class="name"
          type="text"
          role="combobox"
          autocomplete="off"
          placeholder="Ort, z. B. Köln"
          aria-label="Wohnort, Ort"
          aria-autocomplete="list"
          [attr.aria-required]="isRequired()"
          [attr.aria-expanded]="isOpen() && activeField() === 'NAME'"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeField() === 'NAME' ? activeOptionId() : null"
          [attr.aria-describedby]="message() ? messageId : null"
          [attr.aria-invalid]="isMarkedInvalid()"
          [value]="nameText()"
          [disabled]="isDisabled()"
          (input)="onNameInput($any($event.target).value)"
          (keydown)="onKeydown($event)"
        />
      </div>
      <ul [id]="listId" class="list" role="listbox" aria-label="Vorschläge" [hidden]="!isOpen()">
        @for (suggestion of suggestions(); track $index) {
          <li
            [id]="optionId($index)"
            role="option"
            [attr.aria-selected]="$index === activeIndex()"
            [class.is-active]="$index === activeIndex()"
            (mousedown)="$event.preventDefault()"
            (click)="pick(suggestion)"
          >
            <span>{{ label(suggestion) }}</span>
            @if (suggestion.district) {
              <span class="district">{{ suggestion.district }}</span>
            }
          </li>
        }
      </ul>
    </div>
    <span
      [id]="messageId"
      class="message"
      [class.is-invalid]="isMarkedInvalid()"
      aria-live="polite"
      >{{ message() }}</span
    >
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .anchor {
      position: relative;
    }

    /* PLZ and Ort joined in one frame, split by a line, as .combo in the mock. */
    .combo {
      display: flex;
      align-items: stretch;
      min-width: 0;
      height: 40px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      background-color: var(--bg-input);
      overflow: hidden;
      transition:
        border-color 0.15s,
        background-color 0.15s,
        box-shadow 0.2s;
    }

    .combo:hover:not(.is-disabled) {
      border-color: rgba(255, 255, 255, 0.14);
    }

    /* Replaces the inputs' outline as the focus ring. */
    .combo:focus-within {
      border-color: rgba(255, 236, 210, 0.28);
      background-color: var(--bg-dialog);
      box-shadow:
        0 0 0 3px rgba(255, 236, 210, 0.06),
        0 8px 20px -10px rgba(10, 6, 2, 0.7);
    }

    .combo.is-invalid {
      border-color: rgba(229, 115, 111, 0.6);
    }

    .combo.is-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    input {
      height: 100%;
      min-width: 0;
      margin: 0;
      padding: 0 var(--space-3);
      border: none;
      border-radius: 0;
      background-color: transparent;
      color: var(--text);
      font: inherit;
      font-size: var(--text-base);
      outline: none;
    }

    input::placeholder {
      color: var(--text-dimmer);
    }

    input:disabled {
      cursor: not-allowed;
    }

    .plz {
      flex: 0 0 84px;
      width: 84px;
    }

    .name {
      flex: 1 1 90px;
      width: auto;
      border-left: 1px solid var(--line);
    }

    .list {
      position: absolute;
      z-index: 4;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      max-height: 360px;
      overflow-y: auto;
      margin: 0;
      padding: var(--space-1);
      list-style: none;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      background: var(--bg-dialog);
      box-shadow: var(--shadow-panel);
    }

    .list[hidden] {
      display: none;
    }

    [role='option'] {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: 36px;
      padding: var(--space-2) var(--space-2);
      border-radius: var(--radius-control);
      color: var(--text);
      cursor: pointer;
    }

    [role='option']:hover,
    [role='option'].is-active {
      background: rgba(255, 240, 220, 0.07);
    }

    .district {
      font-size: var(--text-sm);
      color: var(--text-dim);
      white-space: nowrap;
    }

    .message {
      font-size: var(--text-sm);
      line-height: 1.5;
      color: var(--text-dim);
    }

    .message:empty {
      display: none;
    }

    .message.is-invalid {
      color: var(--red-text);
    }
  `,
})
export class LocationBox implements ControlValueAccessor, Validator {
  private readonly profileService = inject(ProfileService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly queries = new Subject<string>();
  private readonly id = nextId++;

  /** The id of the PLZ half, which the field's label points at. */
  readonly inputId = input.required<string>();
  readonly nameInputId = computed(() => `${this.inputId()}-name`);
  readonly isRequired = input(false);

  readonly listId = `location-box-list-${this.id}`;
  readonly messageId = `location-box-message-${this.id}`;

  readonly plzText = signal('');
  readonly nameText = signal('');
  readonly activeField = signal<Field>('NAME');
  readonly isDisabled = signal(false);
  private readonly picked = signal<ProfilePlace | null>(null);
  /** The bare place behind the pick, for the line that names its PLZ. */
  private readonly pickedBarePlace = signal<PlaceSuggestion | null>(null);
  private readonly result = signal<QueryResult>(null);
  readonly activeIndex = signal(-1);
  private readonly isListDismissed = signal(false);
  private readonly hasLeftField = signal(false);

  readonly suggestions = computed(() => {
    const result = this.result();
    return Array.isArray(result) ? result : [];
  });
  readonly isOpen = computed(() => this.suggestions().length > 0 && !this.isListDismissed());
  readonly activeOptionId = computed(() =>
    this.isOpen() && this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null,
  );
  /** Text in either half that is not a picked place. */
  private readonly isUnpicked = computed(
    () => (this.plzText().trim() !== '' || this.nameText().trim() !== '') && this.picked() === null,
  );
  private readonly isNotFound = computed(() => {
    const result = this.result();
    return this.isUnpicked() && Array.isArray(result) && result.length === 0;
  });
  readonly isMarkedInvalid = computed(
    () => this.isNotFound() || (this.isUnpicked() && this.hasLeftField()),
  );
  readonly message = computed(() => {
    const bare = this.pickedBarePlace();
    if (bare) {
      return `PLZ ${bare.plz} für ${bare.name} gewählt. Für eine andere PLZ einfach eintippen.`;
    }
    const isPlz = this.activeField() === 'PLZ';
    if (this.isNotFound()) {
      return isPlz ? 'PLZ nicht gefunden' : 'Ort nicht gefunden';
    }
    if (this.result() === 'FAILED' && this.isUnpicked()) {
      return 'Vorschläge konnten nicht geladen werden.';
    }
    if (this.isUnpicked() && this.hasLeftField()) {
      const typed = isPlz ? this.plzText() : this.nameText();
      if (typed.trim().length < MIN_QUERY_LENGTH) {
        return isPlz
          ? `Mindestens ${MIN_QUERY_LENGTH} Ziffern eingeben und einen Vorschlag wählen.`
          : `Mindestens ${MIN_QUERY_LENGTH} Zeichen eingeben und einen Vorschlag wählen.`;
      }
      return 'Bitte einen Vorschlag aus der Liste wählen.';
    }
    return '';
  });

  private onChange: (place: ProfilePlace | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.queries
      .pipe(
        debounceTime(QUERY_DEBOUNCE_MS),
        switchMap((query) => this.search(query)),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((result) => {
        // A pick while the request was on its way wins.
        if (this.picked() !== null) {
          return;
        }
        this.result.set(result);
        this.activeIndex.set(-1);
        this.isListDismissed.set(false);
      });
  }

  label(suggestion: PlaceSuggestion): string {
    return suggestionLabel(suggestion);
  }

  optionId(index: number): string {
    return `location-box-option-${this.id}-${index}`;
  }

  /** Keeps digits only, a PLZ has nothing else. */
  onPlzInput(field: HTMLInputElement): void {
    const digits = field.value.replace(/\D/g, '').slice(0, 5);
    if (field.value !== digits) {
      field.value = digits;
    }
    this.plzText.set(digits);
    this.onTyped('PLZ', digits);
  }

  onNameInput(value: string): void {
    this.nameText.set(value);
    this.onTyped('NAME', value);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (count === 0) {
          return;
        }
        event.preventDefault();
        if (!this.isOpen()) {
          this.isListDismissed.set(false);
          this.activeIndex.set(event.key === 'ArrowDown' ? 0 : count - 1);
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex.update((index) => (index + step + count) % count);
        return;
      }
      case 'Enter': {
        const active = this.suggestions()[this.activeIndex()];
        if (this.isOpen() && active) {
          event.preventDefault();
          this.pick(active);
        }
        return;
      }
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.isListDismissed.set(true);
        }
        return;
    }
  }

  /** Moving between the two halves is not leaving the field. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) {
      return;
    }
    this.isListDismissed.set(true);
    this.hasLeftField.set(true);
    this.onTouched();
  }

  pick(suggestion: PlaceSuggestion): void {
    const place = { plz: suggestion.plz, name: suggestion.name };
    this.picked.set(place);
    this.pickedBarePlace.set(suggestion.isPlaceOnly ? suggestion : null);
    this.plzText.set(place.plz);
    this.nameText.set(place.name);
    this.result.set(null);
    this.activeIndex.set(-1);
    this.onChange(place);
  }

  writeValue(place: ProfilePlace | null): void {
    this.picked.set(place);
    this.pickedBarePlace.set(null);
    this.plzText.set(place?.plz ?? '');
    this.nameText.set(place?.name ?? '');
    this.result.set(null);
    this.hasLeftField.set(false);
  }

  registerOnChange(onChange: (place: ProfilePlace | null) => void): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    return this.isUnpicked() ? { placeNotPicked: true } : null;
  }

  /** The half typed in drops the pick and asks with its own text. */
  private onTyped(field: Field, value: string): void {
    this.activeField.set(field);
    this.hasLeftField.set(false);
    if (this.picked() !== null) {
      this.picked.set(null);
      this.pickedBarePlace.set(null);
    }
    if (value.trim().length < MIN_QUERY_LENGTH) {
      this.result.set(null);
    }
    this.onChange(null);
    this.queries.next(value);
  }

  private search(query: string): Observable<QueryResult> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return of(null);
    }
    return this.profileService.getPlaces(trimmed).pipe(
      map((places): QueryResult => places),
      catchError(() => of<QueryResult>('FAILED')),
    );
  }
}
