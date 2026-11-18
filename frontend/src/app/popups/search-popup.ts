import { jobViewParams } from '../jobs/job-view';
import { finishedRun } from '../status/finished-run';
import { JobView, Run, Status } from '../status/status-types';
import type { Popup, PopupAction } from './popup-service';

/** A popup without its id, the service adds that when it shows one. */
export type PopupContent = Omit<Popup, 'id'>;

/** The popup for a search that finished since the previous poll, null if none did. */
export function searchPopup(
  previousStatus: Status | null,
  currentStatus: Status | null,
): PopupContent | null {
  const run = finishedRun(previousStatus, currentStatus);
  return run ? popupFor(run) : null;
}

function popupFor(run: Run): PopupContent | null {
  switch (run.overallStatus) {
    case 'CANCELED':
      // The user canceled it, and the status line already says "abgebrochen".
      return null;
    case 'FAILED':
      // TODO: "Details" to the run details, once they exist.
      return { headline: 'Suche fehlgeschlagen', detail: null, action: null };
    default:
      return run.isInitialSearch ? initialSearchPopup(run) : newJobsPopup(run);
  }
}

/** The first search doesn't mark jobs as new, so it opens all jobs. */
function initialSearchPopup(run: Run): PopupContent {
  if (run.newJobCount === 0) {
    return { headline: 'Keine Jobs gefunden', detail: null, action: null };
  }
  const jobs = run.newJobCount === 1 ? '1 Job' : `${run.newJobCount} Jobs`;
  return { headline: `${jobs} gefunden`, detail: null, action: showView('ALL') };
}

function newJobsPopup(run: Run): PopupContent {
  if (run.newJobCount === 0) {
    return { headline: 'Keine neuen Jobs', detail: null, action: null };
  }
  const jobs = run.newJobCount === 1 ? '1 neuer Job' : `${run.newJobCount} neue Jobs`;
  return { headline: `${jobs} gefunden`, detail: null, action: showView('NEW') };
}

function showView(view: JobView): PopupAction {
  return { label: 'Anzeigen', route: ['/'], queryParams: jobViewParams(view) };
}
