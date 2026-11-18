import { Run, Status } from './status-types';

/**
 * The latest run if it finished since the previous poll. Also a run that no poll saw running,
 * like a search that fails at once. Null on the first poll, which has nothing to compare with.
 */
export function finishedRun(previousStatus: Status | null, currentStatus: Status | null): Run | null {
  const run = currentStatus?.search.run;
  if (!previousStatus || !run || run.overallStatus === 'RUNNING') {
    return null;
  }
  const previousRun = previousStatus.search.run;
  const isSameRun = previousRun?.id === run.id;
  return !isSameRun || previousRun.overallStatus === 'RUNNING' ? run : null;
}
