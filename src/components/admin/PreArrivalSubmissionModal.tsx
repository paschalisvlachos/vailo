import { useCallback, useState } from 'react';
import { Download, FileText, Loader2, ShieldCheck, X } from 'lucide-react';
import { getPreArrivalIdDocumentForAdminCallable } from '../../lib/guestPortalCallables';
import { httpsCallableMessage } from '../../lib/callableError';
import { formatGuestStayLabel } from '../../lib/guestInviteEmailTemplate';
import {
  formatPreArrivalDateDisplay,
  formatPreArrivalIdDetailsSummary,
  formatPreArrivalTimeDisplay,
  guestFullNameFromSubmission,
} from '../../lib/preArrivalSubmission';
import { formatPreArrivalTransferPrice } from '../../lib/preArrivalSettings';
import {
  base64ToDataUrl,
  buildPreArrivalDeclarationHtml,
  downloadBase64File,
  openPreArrivalDeclarationPrint,
} from '../../lib/preArrivalDeclaration';
import type { PreArrivalSubmission, SyncedBooking } from '../../lib/syncedBooking';
import { formatBookingDateRange } from '../../lib/syncedBooking';

type Props = {
  booking: Pick<
    SyncedBooking,
    | 'id'
    | 'guestName'
    | 'summary'
    | 'start'
    | 'end'
    | 'guestEmail'
    | 'guestPhone'
    | 'guestCountry'
    | 'preArrivalSubmission'
    | 'preArrivalSubmittedAt'
  >;
  typeId: string;
  propertyId: string;
  propertyName: string;
  unitName: string;
  onClose: () => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-x-4 gap-y-1 py-2.5 border-b border-gray-100 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export default function PreArrivalSubmissionModal({
  booking,
  typeId,
  propertyId,
  propertyName,
  unitName,
  onClose,
}: Props) {
  const submission = booking.preArrivalSubmission as PreArrivalSubmission;
  const guestName =
    guestFullNameFromSubmission(submission) ||
    booking.guestName?.trim() ||
    booking.summary?.trim() ||
    'Guest';
  const hasIdDocument = Boolean(submission.idDocument?.storagePath);
  const hasIdDetails = Boolean(submission.idDetails?.documentNumber);

  const [idLoading, setIdLoading] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [idPreview, setIdPreview] = useState<{
    contentType: string;
    contentBase64: string;
    dataUrl: string;
    filename: string;
  } | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadIdDocument = useCallback(async () => {
    if (!booking.id || !hasIdDocument) return null;
    setIdLoading(true);
    setIdError(null);
    try {
      const result = await getPreArrivalIdDocumentForAdminCallable({
        propertyId,
        typeId,
        bookingId: booking.id,
      });
      const dataUrl = base64ToDataUrl(result.contentBase64, result.contentType);
      const preview = {
        contentType: result.contentType,
        contentBase64: result.contentBase64,
        dataUrl,
        filename: result.filename,
      };
      setIdPreview(preview);
      return preview;
    } catch (err) {
      setIdError(httpsCallableMessage(err, 'Could not load ID document.'));
      return null;
    } finally {
      setIdLoading(false);
    }
  }, [booking.id, hasIdDocument, propertyId, typeId]);

  const handleDownloadId = async () => {
    const preview = idPreview || (await loadIdDocument());
    if (!preview) return;
    downloadBase64File(preview.contentBase64, preview.filename, preview.contentType);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      let idImageDataUrl: string | null = null;
      if (hasIdDocument && submission.idDocument?.contentType?.startsWith('image/')) {
        const preview = idPreview || (await loadIdDocument());
        if (preview?.contentType.startsWith('image/')) {
          idImageDataUrl = preview.dataUrl;
        }
      }

      const html = buildPreArrivalDeclarationHtml({
        propertyName,
        unitName,
        booking,
        submission,
        idImageDataUrl,
      });
      openPreArrivalDeclarationPrint(html, {
        filename: `pre-arrival-declaration-${guestName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'guest'}.html`,
      });
    } catch (err) {
      setIdError(
        err instanceof Error ? err.message : 'Could not open print dialog for declaration PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const submittedAtLabel = submission.submittedAt
    ? new Date(submission.submittedAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : booking.preArrivalSubmittedAt
      ? new Date(booking.preArrivalSubmittedAt).toLocaleString('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  const houseRulesAcceptedLabel = submission.acceptedHouseRulesAt
    ? new Date(submission.acceptedHouseRulesAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pre-arrival-view-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
          <div className="min-w-0">
            <h3
              id="pre-arrival-view-title"
              className="text-lg font-bold text-gray-900 flex items-center gap-2"
            >
              <ShieldCheck size={20} className="text-[#0B4F5C] shrink-0" />
              Pre-arrival check-in
            </h3>
            <p className="text-sm text-gray-500 mt-1 truncate">
              {formatGuestStayLabel(propertyName, unitName)} · {guestName}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Stay {formatBookingDateRange(booking.start, booking.end)} · Submitted {submittedAtLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
            aria-label="Close pre-arrival details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 bg-gray-50/80">
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0B4F5C]/20 bg-white text-xs font-bold text-[#0B4F5C] hover:bg-[#0B4F5C]/5 transition-colors disabled:opacity-50"
          >
            {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Export declaration PDF
          </button>
          <span className="text-[11px] text-gray-500">
            Opens print — choose &quot;Save as PDF&quot; in the dialog.
          </span>
          {hasIdDocument && (
            <>
              {!idPreview && (
                <button
                  type="button"
                  onClick={() => void loadIdDocument()}
                  disabled={idLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {idLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {idLoading ? 'Loading ID…' : 'Load ID document'}
                </button>
              )}
              {idPreview && (
                <button
                  type="button"
                  onClick={() => void handleDownloadId()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download size={14} />
                  Download ID
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <dl>
            <DetailRow
              label="Guest name"
              value={guestFullNameFromSubmission(submission) || guestName}
            />
            <DetailRow label="Country" value={submission.guestCountry || booking.guestCountry || ''} />
            <DetailRow
              label="Expected arrival"
              value={formatPreArrivalTimeDisplay(submission.expectedArrivalTime)}
            />
            <DetailRow label="Guests" value={String(submission.guestCount)} />
            <DetailRow label="Phone" value={submission.contactPhone} />
            <DetailRow
              label="Email"
              value={submission.contactEmail || booking.guestEmail || ''}
            />
            <DetailRow
              label="Date of birth"
              value={formatPreArrivalDateDisplay(submission.dateOfBirth)}
            />
            <DetailRow label="TIN / AFM" value={submission.taxId || ''} />
            <DetailRow label="Special requests" value={submission.specialRequests || ''} />
            {submission.transferRequested && submission.transferOffer && (
              <DetailRow
                label="Transfer requested"
                value={`${submission.transferOffer.label} · ${formatPreArrivalTransferPrice(submission.transferOffer.priceEur)}${submission.transferOffer.paymentNote ? ` · ${submission.transferOffer.paymentNote}` : ''}`}
              />
            )}
            <DetailRow label="House rules accepted" value={houseRulesAcceptedLabel} />
            {hasIdDocument && (
              <DetailRow
                label="ID document"
                value={
                  submission.idDocument?.uploadedAt
                    ? `Uploaded ${new Date(submission.idDocument.uploadedAt).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })} · ${submission.idDocument.contentType || 'file'}`
                    : 'On file (encrypted)'
                }
              />
            )}
            {hasIdDetails && submission.idDetails && (
              <DetailRow
                label="ID details"
                value={formatPreArrivalIdDetailsSummary(submission.idDetails)}
              />
            )}
          </dl>

          {idError && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {idError}
            </p>
          )}

          {idPreview && idPreview.contentType.startsWith('image/') && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                ID preview
              </p>
              <img
                src={idPreview.dataUrl}
                alt="Guest identity document"
                className="max-w-full max-h-72 rounded-lg border border-gray-200"
              />
            </div>
          )}

          {idPreview && idPreview.contentType === 'application/pdf' && (
            <p className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              ID is a PDF — use Download ID to save it for your declaration folder.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
