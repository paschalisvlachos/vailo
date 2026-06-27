import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import type { GuestApplianceGuideRequest, GuestApplianceGuideResponse } from './guestApplianceGuide';
import type { GuestAnalyticsEventInput } from './guestAnalytics';
import type { GuestClientDevice } from './guestDeviceInfo';
import type { GuestPortalSession } from './guestAccess';

type SessionPayload = { session: GuestPortalSession };

function call<T>(name: string) {
  return httpsCallable<Record<string, unknown>, T>(cloudFunctions, name);
}

export async function validateGuestPortalSession(
  propertyId: string,
  typeId: string,
  sessionId: string
): Promise<{
  valid: boolean;
  reason?: 'expired' | 'booking_cancelled';
  session?: GuestPortalSession;
}> {
  const res = await call<{
    valid: boolean;
    reason?: 'expired' | 'booking_cancelled';
    session?: GuestPortalSession;
  }>('validateGuestPortalSession')({ propertyId, typeId, sessionId });
  return res.data;
}

export async function sendGuestInviteCallable(
  propertyId: string,
  typeId: string,
  bookingId: string,
  reinvite?: boolean
): Promise<{
  inviteToken: string;
  invitePassword: string;
  emailSent?: boolean;
  resendSentId?: string | null;
  inviteUrl?: string;
}> {
  const res = await call<{
    inviteToken: string;
    invitePassword: string;
    emailSent?: boolean;
    resendSentId?: string | null;
    inviteUrl?: string;
  }>('sendGuestInvite')({
    propertyId,
    typeId,
    bookingId,
    reinvite: Boolean(reinvite),
  });
  return res.data;
}

export async function verifyGuestInviteCallable(
  propertyId: string,
  typeId: string,
  inviteToken: string,
  password: string,
  existingSessionId?: string | null
): Promise<SessionPayload> {
  const res = await call<SessionPayload>('verifyGuestInvite')({
    propertyId,
    typeId,
    inviteToken,
    password,
    existingSessionId: existingSessionId || undefined,
  });
  return res.data;
}

export async function activateGuestOnSiteAccessCallable(
  propertyId: string,
  typeId: string,
  existingSessionId?: string | null
): Promise<SessionPayload> {
  const res = await call<SessionPayload>('activateGuestOnSiteAccess')({
    propertyId,
    typeId,
    existingSessionId: existingSessionId || undefined,
  });
  return res.data;
}

export async function grantAdminGuestPortalPreviewCallable(
  propertyId: string,
  typeId: string
): Promise<SessionPayload> {
  const res = await call<SessionPayload>('grantAdminGuestPortalPreview')({
    propertyId,
    typeId,
  });
  return res.data;
}

export async function verifyGuestTesterCodeCallable(
  propertyId: string,
  typeId: string,
  accessCode: string
): Promise<SessionPayload> {
  const res = await call<SessionPayload>('verifyGuestTesterCode')({
    propertyId,
    typeId,
    accessCode,
  });
  return res.data;
}

export async function getGuestApplianceGuideCallable(
  req: GuestApplianceGuideRequest
): Promise<GuestApplianceGuideResponse> {
  const res = await httpsCallable<GuestApplianceGuideRequest, GuestApplianceGuideResponse>(
    cloudFunctions,
    'getGuestApplianceGuide'
  )(req);
  return res.data;
}

export async function logGuestPortalAnalyticsCallable(params: {
  propertyId: string;
  typeId: string;
  sessionId?: string;
  visitorId?: string;
  clientDevice?: GuestClientDevice;
  events: GuestAnalyticsEventInput[];
}): Promise<{ ok: boolean; logged?: number }> {
  const res = await call<{ ok: boolean; logged?: number }>('logGuestPortalAnalytics')(params);
  return res.data;
}
