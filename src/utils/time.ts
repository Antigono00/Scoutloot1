import { DateTime } from 'luxon';

export function utcDate(): string {
  return DateTime.utc().toISODate()!;
}

export function utcNow(): DateTime {
  return DateTime.utc();
}

export function isInQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
  userTimezone: string
): boolean {
  if (!quietStart || !quietEnd) return false;

  const now = DateTime.now().setZone(userTimezone);
  const [startHour, startMin] = quietStart.split(':').map(Number);
  const [endHour, endMin] = quietEnd.split(':').map(Number);

  const currentMinutes = now.hour * 60 + now.minute;
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

export function msUntilQuietHoursEnd(
  quietEnd: string,
  userTimezone: string
): number {
  const now = DateTime.now().setZone(userTimezone);
  const [endHour, endMin] = quietEnd.split(':').map(Number);
  
  let endTime = now.set({ hour: endHour, minute: endMin, second: 0, millisecond: 0 });
  
  if (endTime <= now) {
    endTime = endTime.plus({ days: 1 });
  }
  
  return endTime.diff(now).milliseconds;
}
