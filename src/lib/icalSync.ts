import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

export type ICalSyncResult = {
  ok: boolean;
  count: number;
  added: number;
};

export async function syncPropertyTypeICalCallable(
  propertyId: string,
  typeId: string,
  iCalUrl: string
): Promise<ICalSyncResult> {
  const res = await httpsCallable<
    { propertyId: string; typeId: string; iCalUrl: string },
    ICalSyncResult
  >(cloudFunctions, 'syncPropertyTypeICal')({ propertyId, typeId, iCalUrl });
  return res.data;
}

export function formatICalSyncSuccessMessage(result: ICalSyncResult): string {
  const { added, count } = result;
  if (added === 0) {
    return `Calendar synced — no new reservations (${count} total).`;
  }
  return `Calendar synced — ${added} new reservation${added === 1 ? '' : 's'} added (${count} total).`;
}

/** User-facing message from Firebase callable errors. */
export function formatICalSyncError(error: unknown, fallback = 'Calendar sync failed.'): string {
  const err = error as { code?: string; message?: string };
  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
