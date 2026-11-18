import { formatRunTime } from './run-time';

describe('formatRunTime', () => {
  // A Friday.
  const now = new Date(2026, 10, 6, 14, 0);

  it('says "heute" for today', () => {
    expect(formatRunTime(new Date(2026, 10, 6, 8, 30), now)).toBe('heute, 08:30');
  });

  it('says "gestern" for yesterday, also across a month', () => {
    expect(formatRunTime(new Date(2026, 10, 5, 23, 5), now)).toBe('gestern, 23:05');
    expect(formatRunTime(new Date(2026, 9, 31, 9, 0), new Date(2026, 10, 1, 9, 0))).toBe(
      'gestern, 09:00',
    );
  });

  it('shows the weekday within the last week', () => {
    expect(formatRunTime(new Date(2026, 10, 4, 8, 30), now)).toBe('Mi, 08:30');
    expect(formatRunTime(new Date(2026, 9, 31, 8, 30), now)).toBe('Sa, 08:30');
  });

  it('shows the day this year and the full date before', () => {
    expect(formatRunTime(new Date(2026, 9, 30, 8, 30), now)).toBe('30.10., 08:30');
    expect(formatRunTime(new Date(2025, 9, 17, 8, 30), now)).toBe('17.10.2025, 08:30');
  });
});
