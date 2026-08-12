import type { PreArrivalSubmission, SyncedBooking } from './syncedBooking';
import {
  formatPreArrivalDateDisplay,
  formatPreArrivalIdDetailsSummary,
  formatPreArrivalTimeDisplay,
  PRE_ARRIVAL_ID_GDPR_RETENTION_DAYS,
} from './preArrivalSubmission';
import { formatPreArrivalTransferPrice } from './preArrivalSettings';
import { formatBookingDateRange } from './syncedBooking';
import { formatGuestStayLabel } from './guestInviteEmailTemplate';

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string): string {
  if (!value.trim()) return '';
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function buildPreArrivalDeclarationHtml(options: {
  propertyName: string;
  unitName: string;
  booking: Pick<
    SyncedBooking,
    'guestName' | 'summary' | 'start' | 'end' | 'guestEmail' | 'guestPhone'
  >;
  submission: PreArrivalSubmission;
  generatedAt?: string;
  idImageDataUrl?: string | null;
}): string {
  const { propertyName, unitName, booking, submission } = options;
  const guestName = booking.guestName?.trim() || booking.summary?.trim() || 'Guest';
  const stayLabel = formatGuestStayLabel(propertyName, unitName);
  const stayRange = formatBookingDateRange(booking.start, booking.end);
  const generatedAt =
    options.generatedAt ||
    new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const submittedAt = submission.submittedAt
    ? new Date(submission.submittedAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  const rows = [
    row('Property', stayLabel),
    row('Guest', guestName),
    row('Stay', stayRange),
    row('Submitted', submittedAt),
    row('Expected arrival', formatPreArrivalTimeDisplay(submission.expectedArrivalTime)),
    row('Guests', String(submission.guestCount)),
    row('Phone', submission.contactPhone),
    row('Email', submission.contactEmail || booking.guestEmail || ''),
    row('Date of birth', formatPreArrivalDateDisplay(submission.dateOfBirth)),
    row('Special requests', submission.specialRequests || ''),
    row(
      'Transfer requested',
      submission.transferRequested && submission.transferOffer
        ? `${submission.transferOffer.label} (${formatPreArrivalTransferPrice(submission.transferOffer.priceEur)})`
        : ''
    ),
    row(
      'House rules accepted',
      submission.acceptedHouseRulesAt
        ? new Date(submission.acceptedHouseRulesAt).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : ''
    ),
    row(
      'ID details',
      submission.idDetails ? formatPreArrivalIdDetailsSummary(submission.idDetails) : ''
    ),
  ]
    .filter(Boolean)
    .join('');

  const idSection = options.idImageDataUrl
    ? `<section class="section">
        <h2>Identity document</h2>
        <p class="muted">Copy attached below for declaration folder.</p>
        <img src="${options.idImageDataUrl}" alt="Guest identity document" class="id-image" />
      </section>`
    : submission.idDocument
      ? `<section class="section">
        <h2>Identity document</h2>
        <p class="muted">An encrypted ID document is on file. Download it separately from the admin pre-arrival view.</p>
      </section>`
      : submission.idDetails
        ? `<section class="section">
        <h2>Identity details</h2>
        <p class="muted">ID details were submitted manually for legal check-in.</p>
      </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pre-arrival declaration — ${escapeHtml(guestName)}</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #051F26; margin: 0; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .subtitle { color: #64748B; font-size: 13px; margin-bottom: 24px; }
    .section { margin-top: 24px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #0B4F5C; margin: 0 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
    th { width: 38%; color: #64748B; font-weight: 600; }
    .muted { color: #64748B; font-size: 12px; line-height: 1.5; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; }
    .id-image { max-width: 100%; max-height: 420px; border: 1px solid #E2E8F0; border-radius: 8px; margin-top: 8px; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>Pre-arrival guest declaration</h1>
  <p class="subtitle">Generated ${escapeHtml(generatedAt)} · Vailo</p>

  <section class="section">
    <h2>Check-in details</h2>
    <table>${rows}</table>
  </section>

  ${idSection}

  <div class="footer">
    Identity data and ID images are retained only as required for legal check-in and are automatically deleted
    ${PRE_ARRIVAL_ID_GDPR_RETENTION_DAYS} days after checkout (GDPR data minimisation).
  </div>
</body>
</html>`;
}

export function openPreArrivalDeclarationPrint(html: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Pop-up blocked. Allow pop-ups to export the declaration PDF.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

export function downloadBase64File(
  contentBase64: string,
  filename: string,
  contentType: string
): void {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function base64ToDataUrl(contentBase64: string, contentType: string): string {
  return `data:${contentType};base64,${contentBase64}`;
}
