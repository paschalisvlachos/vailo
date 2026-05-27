export type TesterDurationPreset = '1_week' | '1_month' | '3_months' | 'permanent';

export type PropertyTester = {
  id: string;
  propertyId: string;
  typeId: string;
  name: string;
  email: string;
  duration: TesterDurationPreset;
  accessCode: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
};

export const TESTER_DURATION_OPTIONS: { value: TesterDurationPreset; label: string }[] = [
  { value: '1_week', label: '1 week' },
  { value: '1_month', label: '1 month' },
  { value: '3_months', label: '3 months' },
  { value: 'permanent', label: 'Permanent' },
];

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTesterAccessCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export function testerValidUntilFromPreset(
  preset: TesterDurationPreset,
  validFrom: Date = new Date()
): string | null {
  if (preset === 'permanent') return null;
  const d = new Date(validFrom);
  d.setHours(23, 59, 59, 999);
  if (preset === '1_week') d.setDate(d.getDate() + 7);
  else if (preset === '1_month') d.setMonth(d.getMonth() + 1);
  else if (preset === '3_months') d.setMonth(d.getMonth() + 3);
  return d.toISOString();
}

export function isTesterAccessValid(
  tester: Pick<PropertyTester, 'validFrom' | 'validUntil'>,
  now = Date.now()
): boolean {
  const from = new Date(tester.validFrom).getTime();
  if (now < from) return false;
  if (!tester.validUntil) return true;
  return now <= new Date(tester.validUntil).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function durationPresetLabel(preset: TesterDurationPreset): string {
  return TESTER_DURATION_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

/** e.g. "1 week (6 days left)" or "Permanent" */
export function formatVisitorDurationStatus(
  duration: TesterDurationPreset,
  validFrom: string,
  validUntil: string | null,
  now = Date.now()
): string {
  const label = durationPresetLabel(duration);

  if (!validUntil) {
    return label;
  }

  const fromMs = new Date(validFrom).getTime();
  const untilMs = new Date(validUntil).getTime();

  if (Number.isNaN(fromMs) || Number.isNaN(untilMs)) {
    return label;
  }

  if (now < fromMs) {
    const daysUntil = Math.max(1, Math.ceil((fromMs - now) / DAY_MS));
    return `${label} (starts in ${daysUntil} day${daysUntil === 1 ? '' : 's'})`;
  }

  if (now > untilMs) {
    return `${label} (expired)`;
  }

  const daysLeft = Math.max(0, Math.ceil((untilMs - now) / DAY_MS));
  return `${label} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`;
}

/** Reset access window from now using a duration preset. */
export function visitorAccessWindowFromPreset(
  preset: TesterDurationPreset,
  from: Date = new Date()
): { validFrom: string; validUntil: string | null; duration: TesterDurationPreset } {
  const validFrom = from.toISOString();
  return {
    validFrom,
    validUntil: testerValidUntilFromPreset(preset, from),
    duration: preset,
  };
}
