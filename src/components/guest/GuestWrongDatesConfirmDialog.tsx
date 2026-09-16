import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  open: boolean;
  busy?: boolean;
  t: (key: GuestLocaleKey) => string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Warns before Wrong dates clears/removes the current check-in. */
export default function GuestWrongDatesConfirmDialog({
  open,
  busy = false,
  t,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wrong-dates-confirm-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="wrong-dates-confirm-title"
          className="font-semibold text-[#051F26] text-[17px] leading-snug"
        >
          {t('checkInWrongDatesConfirmTitle')}
        </h3>
        <p className="mt-2.5 text-[14px] text-gray-600 leading-relaxed">
          {t('checkInWrongDatesConfirmBody')}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-gray-100 px-4 py-3 text-[15px] font-semibold text-[#0B4F5C] disabled:opacity-60"
          >
            {t('checkInWrongDatesConfirmCancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[48px] rounded-xl bg-[#0B4F5C] px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? '…' : t('checkInWrongDatesConfirmContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}
