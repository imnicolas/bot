export interface BirthdayWindow {
  readonly active: boolean;
  readonly birthday: string;
  readonly removeAfter: string;
}

const dayMilliseconds = 24 * 60 * 60 * 1000;

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMilliseconds);
}

function birthdayInYear(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return new Date(Date.UTC(year, 2, 1));
  }
  return date;
}

export function localDateString(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function birthdayWindow(
  today: string,
  month: number,
  day: number,
): BirthdayWindow {
  const year = Number(today.slice(0, 4));
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  let birthday = birthdayInYear(year, month, day);
  if (dateString(birthday) < today) birthday = birthdayInYear(year + 1, month, day);
  const start = addDays(birthday, -7);
  return {
    active: todayDate >= start && todayDate < birthday,
    birthday: dateString(birthday),
    removeAfter: dateString(birthday),
  };
}