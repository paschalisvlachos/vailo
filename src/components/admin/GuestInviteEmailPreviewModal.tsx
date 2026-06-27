import { useMemo, useState } from 'react';
import { Eye, X } from 'lucide-react';
import {
  buildGuestInviteEmailHtml,
  buildGuestInviteEmailPayloadFromBooking,
  buildGuestInviteEmailSubject,
  type GuestInviteEmailBookingContext,
} from '../../lib/guestInviteEmailTemplate';

type UnitType = {
  urlSlug?: string;
  typeSlug?: string;
  propertyTypeName?: string;
};

type Props = {
  booking: GuestInviteEmailBookingContext;
  typeId: string;
  unitName: string;
  propertyName: string;
  propertySlug?: string;
  unitType?: UnitType;
  defaultReinvite?: boolean;
  accessPassword?: string;
  inviteToken?: string;
  detailsComplete?: boolean;
  onClose: () => void;
};

export default function GuestInviteEmailPreviewModal({
  booking,
  typeId,
  unitName,
  propertyName,
  propertySlug,
  unitType,
  defaultReinvite = false,
  accessPassword,
  inviteToken,
  detailsComplete = true,
  onClose,
}: Props) {
  const [reinvite, setReinvite] = useState(defaultReinvite);

  const payload = useMemo(
    () =>
      buildGuestInviteEmailPayloadFromBooking({
        booking,
        propertyName,
        unitName,
        propertySlug,
        unitType,
        typeId,
        origin: window.location.origin,
        reinvite,
        accessPassword,
        inviteToken,
        logoUrl: `${window.location.origin}/vailoLogo.png`,
      }),
    [
      booking,
      propertyName,
      unitName,
      propertySlug,
      unitType,
      typeId,
      reinvite,
      accessPassword,
      inviteToken,
    ]
  );

  const subject = useMemo(() => buildGuestInviteEmailSubject(payload), [payload]);
  const html = useMemo(() => buildGuestInviteEmailHtml(payload), [payload]);
  const passwordIsPlaceholder = !accessPassword?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-invite-preview-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
          <div className="min-w-0">
            <h3 id="guest-invite-preview-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Eye size={20} className="text-vailo-teal shrink-0" />
              Email preview
            </h3>
            <p className="text-sm text-gray-500 mt-1 truncate">
              To {payload.guestEmail || '—'} · {payload.guestName}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Subject: <span className="font-medium text-gray-600">{subject}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 bg-gray-50/80">
          {!detailsComplete && (
            <p className="w-full text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-1">
              Guest details are incomplete — add name, email, and language for an accurate preview and
              before sending.
            </p>
          )}
          <button
            type="button"
            onClick={() => setReinvite(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              !reinvite
                ? 'bg-vailo-teal text-white border-vailo-teal'
                : 'bg-white text-gray-600 border-gray-200 hover:border-vailo-teal/30'
            }`}
          >
            First invitation
          </button>
          <button
            type="button"
            onClick={() => setReinvite(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              reinvite
                ? 'bg-vailo-teal text-white border-vailo-teal'
                : 'bg-white text-gray-600 border-gray-200 hover:border-vailo-teal/30'
            }`}
          >
            Re-invitation
          </button>
          {passwordIsPlaceholder && (
            <p className="text-xs text-amber-700 ml-auto">
              Password shows as placeholder until you send — link uses saved token when available.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-[#EAF2F2]">
          <iframe
            title={`Guest invite email preview for ${payload.guestName}`}
            srcDoc={html}
            className="w-full h-full min-h-[520px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
