export type PreArrivalTransferOffer = {
  enabled: boolean;
  label: string;
  priceEur: number;
  paymentNote?: string;
};

export const PRE_ARRIVAL_TRANSFER_DEFAULT_LABEL = 'Transfer from port / airport';
export const PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE = 'Pay in cash on arrival';
export const PRE_ARRIVAL_TRANSFER_PRICE_MAX = 9999;

export function normalizePreArrivalTransferOffer(
  raw: Partial<PreArrivalTransferOffer> | null | undefined
): PreArrivalTransferOffer {
  const enabled = raw?.enabled === true;
  const label = String(raw?.label || PRE_ARRIVAL_TRANSFER_DEFAULT_LABEL).trim();
  const price = Number(raw?.priceEur);
  const priceEur =
    Number.isFinite(price) && price >= 0 && price <= PRE_ARRIVAL_TRANSFER_PRICE_MAX
      ? Math.round(price * 100) / 100
      : 0;
  const paymentNote = String(
    raw?.paymentNote || PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE
  ).trim();
  return {
    enabled,
    label: label || PRE_ARRIVAL_TRANSFER_DEFAULT_LABEL,
    priceEur,
    paymentNote: paymentNote || PRE_ARRIVAL_TRANSFER_DEFAULT_PAYMENT_NOTE,
  };
}

export function isPreArrivalTransferOfferActive(
  offer: Partial<PreArrivalTransferOffer> | null | undefined
): boolean {
  const normalized = normalizePreArrivalTransferOffer(offer);
  return normalized.enabled && normalized.label.trim().length > 0;
}

export function formatPreArrivalTransferPrice(priceEur: number): string {
  const value = Number(priceEur);
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function isAutoSendGuestInviteWhenReady(
  property: { autoSendGuestInviteWhenReady?: boolean } | null | undefined
): boolean {
  return property?.autoSendGuestInviteWhenReady === true;
}
