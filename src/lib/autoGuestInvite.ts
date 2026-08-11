import { maybeAutoSendGuestInviteCallable } from './guestPortalCallables';
import { isAutoSendGuestInviteWhenReady } from './preArrivalSettings';

export async function maybeTriggerAutoGuestInvite(options: {
  property: { autoSendGuestInviteWhenReady?: boolean } | null | undefined;
  propertyId: string;
  typeId: string;
  bookingId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isAutoSendGuestInviteWhenReady(options.property)) {
    return { sent: false, reason: 'disabled' };
  }
  const bookingId = options.bookingId?.trim();
  if (!bookingId) {
    return { sent: false, reason: 'missing_booking' };
  }

  const result = await maybeAutoSendGuestInviteCallable({
    propertyId: options.propertyId,
    typeId: options.typeId,
    bookingId,
  });
  return { sent: Boolean(result.sent), reason: result.reason };
}
