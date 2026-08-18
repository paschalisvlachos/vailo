/** Guest stay date entry as DD/MM/YYYY (display) ↔ YYYY-MM-DD (API). */

const DISPLAY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function formatDayMonthYearInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseDayMonthYearToIso(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(DISPLAY_PATTERN);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isoToDayMonthYear(iso?: string | null): string {
  const day = String(iso || '').trim().slice(0, 10);
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function isCompleteDayMonthYear(value: string): boolean {
  return DISPLAY_PATTERN.test(value.trim());
}
