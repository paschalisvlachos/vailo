import { getGuideTextValue } from './houseGuideLocales';
import type { PreArrivalSubmission } from './syncedBooking';
import type { PreArrivalTransferOffer } from './preArrivalSettings';

export const PRE_ARRIVAL_SPECIAL_REQUESTS_MAX = 2000;
export const PRE_ARRIVAL_GUEST_COUNT_MAX = 30;
export const PRE_ARRIVAL_ID_MAX_BYTES = 5 * 1024 * 1024;
export const PRE_ARRIVAL_ID_MAX_MB = 5;
export const PRE_ARRIVAL_ID_FORMAT_LABEL = 'JPEG, PNG, WebP, or PDF';
export const PRE_ARRIVAL_ID_GDPR_RETENTION_DAYS = 7;

/** Guest-facing ID upload guidance (size, format, retention). */
export const PRE_ARRIVAL_ID_UPLOAD_GUIDANCE = {
  formats: PRE_ARRIVAL_ID_FORMAT_LABEL,
  maxSizeLabel: `${PRE_ARRIVAL_ID_MAX_MB} MB`,
  gdprSummary: `Your ID is encrypted and used only for legal check-in requirements. Identity details and ID images are automatically deleted ${PRE_ARRIVAL_ID_GDPR_RETENTION_DAYS} days after checkout, in line with GDPR data-minimisation.`,
} as const;

export const PRE_ARRIVAL_ID_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type PreArrivalFormInput = {
  expectedArrivalTime: string;
  guestCount: number;
  contactPhone: string;
  contactEmail: string;
  dateOfBirth: string;
  specialRequests: string;
  acceptedHouseRules: boolean;
  transferRequested: boolean;
};

function isValidOptionalEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidOptionalDateOfBirth(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() <= today.getTime();
}

export function getPreArrivalHouseRulesText(
  guide: Record<string, unknown> | null | undefined,
  locale: string,
  primaryLocale: string
): string {
  if (!guide) return '';
  const houseRules = getGuideTextValue(guide, 'houseRules', locale, primaryLocale).trim();
  const quietHours = getGuideTextValue(guide, 'quietHours', locale, primaryLocale).trim();
  const parts = [houseRules, quietHours ? `Quiet hours: ${quietHours}` : ''].filter(Boolean);
  return parts.join('\n\n');
}

export function validatePreArrivalForm(input: PreArrivalFormInput): string | null {
  const time = input.expectedArrivalTime.trim();
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return 'Please choose your expected arrival time.';
  }

  const guestCount = Number(input.guestCount);
  if (!Number.isFinite(guestCount) || guestCount < 1) {
    return 'Please enter how many guests will arrive.';
  }
  if (guestCount > PRE_ARRIVAL_GUEST_COUNT_MAX) {
    return `Guest count cannot exceed ${PRE_ARRIVAL_GUEST_COUNT_MAX}.`;
  }

  const phone = input.contactPhone.trim();
  if (phone.length < 6) {
    return 'Please enter a phone number we can reach you on.';
  }

  const requests = input.specialRequests.trim();
  if (requests.length > PRE_ARRIVAL_SPECIAL_REQUESTS_MAX) {
    return `Special requests must be under ${PRE_ARRIVAL_SPECIAL_REQUESTS_MAX} characters.`;
  }

  if (!input.acceptedHouseRules) {
    return 'Please confirm that you accept the house rules.';
  }

  if (!isValidOptionalEmail(input.contactEmail)) {
    return 'Please enter a valid email address, or leave the field empty.';
  }

  if (!isValidOptionalDateOfBirth(input.dateOfBirth)) {
    return 'Please enter a valid date of birth, or leave the field empty.';
  }

  return null;
}

export function validatePreArrivalIdFile(file: File | null | undefined): string | null {
  if (!file) return null;
  if (!PRE_ARRIVAL_ID_ALLOWED_TYPES.includes(file.type as (typeof PRE_ARRIVAL_ID_ALLOWED_TYPES)[number])) {
    return 'Please upload a JPEG, PNG, WebP photo, or PDF.';
  }
  if (file.size > PRE_ARRIVAL_ID_MAX_BYTES) {
    return 'ID document must be 5 MB or smaller.';
  }
  return null;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file.'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function applyTransferToSubmission(
  submission: PreArrivalSubmission,
  input: PreArrivalFormInput,
  offer: PreArrivalTransferOffer | null | undefined
): PreArrivalSubmission {
  if (!input.transferRequested || !offer?.enabled) {
    return submission;
  }
  return {
    ...submission,
    transferRequested: true,
    transferOffer: {
      label: offer.label,
      priceEur: offer.priceEur,
      paymentNote: offer.paymentNote,
    },
  };
}

export function buildPreArrivalSubmissionPayload(
  input: PreArrivalFormInput,
  houseRulesLocale?: string
): PreArrivalSubmission {
  const now = new Date().toISOString();
  const requests = input.specialRequests.trim();
  const email = input.contactEmail.trim();
  const dob = input.dateOfBirth.trim();
  return {
    submittedAt: now,
    expectedArrivalTime: input.expectedArrivalTime.trim(),
    guestCount: Math.round(Number(input.guestCount)),
    contactPhone: input.contactPhone.trim(),
    contactEmail: email || undefined,
    dateOfBirth: dob || undefined,
    specialRequests: requests || undefined,
    acceptedHouseRulesAt: now,
    houseRulesLocale: houseRulesLocale?.trim() || undefined,
    ...(input.transferRequested
      ? { transferRequested: true }
      : {}),
  };
}

export function formatPreArrivalDateDisplay(isoDate?: string): string {
  const trimmed = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('-').map(Number);
  if (parts.length < 3) return trimmed;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function formatPreArrivalTimeDisplay(time?: string): string {
  const trimmed = String(time || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (!match) return trimmed;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours)) return trimmed;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

export function preArrivalFormDefaults(options: {
  guestPhone?: string;
  guestWhatsapp?: string;
  guestEmail?: string;
  submission?: PreArrivalSubmission | null;
}): PreArrivalFormInput {
  const existing = options.submission;
  const phone =
    existing?.contactPhone?.trim() ||
    options.guestPhone?.trim() ||
    options.guestWhatsapp?.trim() ||
    '';
  const email = existing?.contactEmail?.trim() || options.guestEmail?.trim() || '';

  return {
    expectedArrivalTime: existing?.expectedArrivalTime || '',
    guestCount: existing?.guestCount && existing.guestCount > 0 ? existing.guestCount : 2,
    contactPhone: phone,
    contactEmail: email,
    dateOfBirth: existing?.dateOfBirth || '',
    specialRequests: existing?.specialRequests || '',
    acceptedHouseRules: Boolean(existing?.acceptedHouseRulesAt),
    transferRequested: existing?.transferRequested === true,
  };
}
