const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
// Intl's short weekdays end with a dot ("Fr."), the design has none.
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_MS = 86_400_000;

/** "heute, 08:30", "gestern, 08:30", "Fr, 08:30" within a week, then "17.10., 08:30" or "17.10.2025, 08:30". */
export function formatRunTime(time: Date, now: Date): string {
  const clock = timeFormat.format(time);
  // Rounded, since a day across a DST switch has 23 or 25 hours.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (daysAgo === 0) {
    return `heute, ${clock}`;
  }
  if (daysAgo === 1) {
    return `gestern, ${clock}`;
  }
  if (daysAgo > 1 && daysAgo < 7) {
    return `${WEEKDAYS[time.getDay()]}, ${clock}`;
  }
  const day = time.getFullYear() === now.getFullYear() ? dayFormat : dateFormat;
  return `${day.format(time)}, ${clock}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
