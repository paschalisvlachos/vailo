import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Car, Loader2, Mail, Save } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import {
  isAutoSendGuestInviteWhenReady,
  normalizePreArrivalTransferOffer,
  PRE_ARRIVAL_TRANSFER_DEFAULT_LABEL,
  PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE,
  type PreArrivalTransferOffer,
} from '../../lib/preArrivalSettings';

type PropertyPreArrivalSettings = {
  preArrivalTransferOffer?: Partial<PreArrivalTransferOffer>;
  autoSendGuestInviteWhenReady?: boolean;
};

type Props = {
  propertyId: string;
  property: PropertyPreArrivalSettings;
};

export default function PreArrivalSettingsCard({ propertyId, property }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferLabel, setTransferLabel] = useState(PRE_ARRIVAL_TRANSFER_DEFAULT_LABEL);
  const [transferPrice, setTransferPrice] = useState('25');
  const [transferPaymentNote, setTransferPaymentNote] = useState(
    PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE
  );
  const [autoSendInvite, setAutoSendInvite] = useState(false);

  useEffect(() => {
    const offer = normalizePreArrivalTransferOffer(property.preArrivalTransferOffer);
    setTransferEnabled(offer.enabled);
    setTransferLabel(offer.label);
    setTransferPrice(String(offer.priceEur));
    setTransferPaymentNote(offer.paymentNote || PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE);
    setAutoSendInvite(isAutoSendGuestInviteWhenReady(property));
  }, [property]);

  const handleSave = async () => {
    const priceEur = Number(transferPrice);
    if (transferEnabled && (!Number.isFinite(priceEur) || priceEur < 0)) {
      toast.warning('Enter a valid transfer price.');
      return;
    }

    setSaving(true);
    try {
      const preArrivalTransferOffer = normalizePreArrivalTransferOffer({
        enabled: transferEnabled,
        label: transferLabel,
        priceEur: transferEnabled ? priceEur : 0,
        paymentNote: transferPaymentNote,
      });

      await updateDoc(doc(db, 'properties', propertyId), {
        preArrivalTransferOffer,
        autoSendGuestInviteWhenReady: autoSendInvite,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Pre-arrival settings saved.');
    } catch (error) {
      console.error('Failed to save pre-arrival settings', error);
      toast.error('Could not save pre-arrival settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-8 rounded-xl border border-[#0B4F5C]/15 bg-[#0B4F5C]/[0.03] p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#0B4F5C] uppercase tracking-wider flex items-center gap-2">
            <Car size={16} />
            Pre-arrival settings
          </h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Optional transfer upsell in the guest check-in form, and automatic invitation emails
            when guest details are ready.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B4F5C] text-white text-sm font-bold hover:bg-[#094652] transition-colors disabled:opacity-50 self-start"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save settings
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={transferEnabled}
              onChange={(e) => setTransferEnabled(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-[#0B4F5C] focus:ring-[#0B4F5C]/30"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900 block">Offer transfer during check-in</span>
              Guests can request a host-arranged transfer in the pre-arrival form. Payment is cash
              on arrival — Vailo does not process payment.
            </span>
          </label>

          {transferEnabled && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Offer label
                </label>
                <input
                  type="text"
                  value={transferLabel}
                  onChange={(e) => setTransferLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Price (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={transferPrice}
                  onChange={(e) => setTransferPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Payment note
                </label>
                <input
                  type="text"
                  value={transferPaymentNote}
                  onChange={(e) => setTransferPaymentNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSendInvite}
              onChange={(e) => setAutoSendInvite(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-[#0B4F5C] focus:ring-[#0B4F5C]/30"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Mail size={15} />
                Auto-send invitation when ready
              </span>
              <span className="block text-gray-500 mt-1">
                Sends the guest portal invitation by email when guest details are complete (name,
                language, and email), including after iCal sync if the booking already has an email.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
