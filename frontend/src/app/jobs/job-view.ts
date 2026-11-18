import { Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { JobView } from '../status/status-types';

/** The query parameter on the jobs page that holds the current view. */
export const JOB_VIEW_PARAM = 'view';

const JOB_VIEWS: readonly JobView[] = [
  'ALL',
  'NEW',
  'UNSEEN',
  'APPLIED',
  'REJECTED',
  'EXCLUDED',
  'HEARTED',
  'OFFLINE',
  'SORTED_OUT',
];

/** Falls back to ALL for a missing or unknown value. */
export function toJobView(value: string | null): JobView {
  return JOB_VIEWS.find((view) => view === value) ?? 'ALL';
}

/** Query params for a link to the view, none for ALL to keep the URL clean. */
export function jobViewParams(view: JobView): Record<string, string> | null {
  return view === 'ALL' ? null : { [JOB_VIEW_PARAM]: view };
}

/** The view in the URL, as a signal, call it in a field initializer. */
export function injectJobView(): Signal<JobView> {
  return toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => toJobView(params.get(JOB_VIEW_PARAM))),
    ),
    { initialValue: 'ALL' },
  );
}
