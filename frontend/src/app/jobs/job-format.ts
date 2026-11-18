import { SourceType } from '../status/status-types';

export const SOURCE_LABELS: Record<SourceType, string> = {
  ARBEITSAGENTUR: 'Arbeitsagentur',
};

const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const goneFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

/** "01.11." this year, "01.11.2025" before. */
export function formatPublishedAt(publishedAt: string, now: Date): string {
  // Without a time, "2026-11-01" would be read as UTC midnight instead of local midnight.
  const date = new Date(`${publishedAt}T00:00`);
  const format = date.getFullYear() === now.getFullYear() ? dayFormat : dateFormat;
  return format.format(date);
}

/** "3. Okt." for the "nicht mehr online seit" note. */
export function formatGoneAt(goneAt: string): string {
  return goneFormat.format(new Date(goneAt));
}
