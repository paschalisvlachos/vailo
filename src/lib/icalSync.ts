import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

/** Calendar / iCal sync is enabled unless explicitly turned off on the property. */
export function isCalendarSyncEnabled(
  property: { calendarSyncEnabled?: boolean } | null | undefined
): boolean {
  if (property?.calendarSyncEnabled === undefined) return true;
  return property.calendarSyncEnabled !== false;
}

export type ICalSyncResult = {
  ok: boolean;
  count: number;
  added: number;
  /** Stored ranges the channel moved (same calendar event, new dates). */
  updated?: number;
  /** Imported rows the channel no longer lists (cancelled / withdrawn blocks). */
  removed?: number;
  autoInvitesSent?: number;
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
  const { added, count, updated = 0, removed = 0, autoInvitesSent = 0 } = result;
  const changes: string[] = [];
  if (added > 0) changes.push(`${added} new reservation${added === 1 ? '' : 's'}`);
  if (updated > 0) changes.push(`${updated} date change${updated === 1 ? '' : 's'}`);
  if (removed > 0) changes.push(`${removed} no longer on the channel calendar removed`);

  const base =
    changes.length === 0
      ? `Calendar synced — no changes (${count} total).`
      : `Calendar synced — ${changes.join(', ')} (${count} total).`;
  if (autoInvitesSent > 0) {
    return `${base} ${autoInvitesSent} invitation email${autoInvitesSent === 1 ? '' : 's'} sent automatically.`;
  }
  return base;
}

/** User-facing message from Firebase callable errors. */
export function formatICalSyncError(error: unknown, fallback = 'Calendar sync failed.'): string {
  const err = error as { code?: string; message?: string };
  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
