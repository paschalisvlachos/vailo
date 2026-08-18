import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import type { GuestApplianceGuideRequest, GuestApplianceGuideResponse } from './guestApplianceGuide';
import type { GuestAnalyticsEventInput } from './guestAnalytics';
import type { GuestClientDevice } from './guestDeviceInfo';
import type { GuestPortalSession } from './guestAccess';
import type { PreArrivalSubmission } from './syncedBooking';

type SessionPayload = { session: GuestPortalSession };

function call<T>(name: string) {
  return httpsCallable<Record<string, unknown>, T>(cloudFunctions, name);
}

export async function validateGuestPortalSession(
  propertyId: string,
  typeId: string,
  sessionId: string,
  inviteToken?: string | null
): Promise<{
  valid: boolean;
  reason?: 'expired' | 'booking_cancelled' | 'invite_mismatch';
  session?: GuestPortalSession;
}> {
  const res = await call<{
    valid: boolean;
    reason?: 'expired' | 'booking_cancelled' | 'invite_mismatch';
    session?: GuestPortalSession;
  }>('validateGuestPortalSession')({
    propertyId,
    typeId,
    sessionId,
    inviteToken: inviteToken || undefined,
  });
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

export async function prepareGuestInviteCopyCallable(
  propertyId: string,
  typeId: string,
  bookingId: string
): Promise<{
  inviteToken: string;
  invitePassword: string;
  inviteUrl?: string;
}> {
  const res = await call<{
    inviteToken: string;
    invitePassword: string;
    inviteUrl?: string;
  }>('prepareGuestInviteCopy')({
    propertyId,
    typeId,
    bookingId,
  });
  return res.data;
}

export async function markGuestInviteSentCallable(
  propertyId: string,
  typeId: string,
  bookingId: string,
  channel: 'whatsapp' | 'email' = 'whatsapp'
): Promise<{
  inviteToken: string;
  invitePassword?: string | null;
  inviteUrl?: string;
  alreadyInvited?: boolean;
}> {
  const res = await call<{
    inviteToken: string;
    invitePassword?: string | null;
    inviteUrl?: string;
    alreadyInvited?: boolean;
  }>('markGuestInviteSent')({
    propertyId,
    typeId,
    bookingId,
    channel,
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

export async function resolvePreArrivalBookingByDatesCallable(params: {
  propertyId: string;
  typeId: string;
  checkIn: string;
  checkOut: string;
  existingSessionId?: string | null;
  selectedTypeId?: string;
  selectedBookingId?: string;
}): Promise<ResolvePreArrivalBookingByDatesResult> {
  const res = await call<ResolvePreArrivalBookingByDatesResult>(
    'resolvePreArrivalBookingByDates'
  )({
    propertyId: params.propertyId,
    typeId: params.typeId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    existingSessionId: params.existingSessionId || undefined,
    selectedTypeId: params.selectedTypeId || undefined,
    selectedBookingId: params.selectedBookingId || undefined,
  });
  return res.data;
}

export type PreArrivalListingOption = {
  typeId: string;
  typeName: string;
  bookingId: string;
};

export type ResolvePreArrivalBookingByDatesResult =
  | (SessionPayload & {
      bookingId?: string;
      reused?: boolean;
      checkIn?: string;
      checkOut?: string;
    })
  | {
      needsListingChoice: true;
      listingOptions: PreArrivalListingOption[];
      checkIn: string;
      checkOut: string;
    };

export function isPreArrivalListingChoiceResult(
  result: ResolvePreArrivalBookingByDatesResult
): result is {
  needsListingChoice: true;
  listingOptions: PreArrivalListingOption[];
  checkIn: string;
  checkOut: string;
} {
  return 'needsListingChoice' in result && result.needsListingChoice === true;
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

export type AssistantEscalationResult = {
  issueId: string;
  hostEmailSent: boolean;
  deduped?: boolean;
  rateLimited?: boolean;
  previewMode?: boolean;
  hostNotifyStatus?: string;
};

export async function submitPreArrivalCheckInCallable(params: {
  propertyId: string;
  typeId: string;
  sessionId: string;
  guestFirstName: string;
  guestLastName: string;
  guestCountry?: string;
  expectedArrivalTime: string;
  guestCount: number;
  contactPhone: string;
  contactEmail?: string;
  dateOfBirth?: string;
  specialRequests?: string;
  acceptedHouseRules: boolean;
  houseRulesLocale?: string;
  guestLocale?: string;
  transferRequested?: boolean;
  idDocumentBase64?: string;
  idDocumentContentType?: string;
  idDocumentType?: string;
  idDocumentNumber?: string;
  idIssuingCountry?: string;
  idIssueDate?: string;
  idExpiryDate?: string;
}): Promise<{
  previewMode?: boolean;
  preArrivalComplete: boolean;
  preArrivalSubmittedAt: string;
  submission: PreArrivalSubmission;
}> {
  const res = await call<{
    previewMode?: boolean;
    preArrivalComplete: boolean;
    preArrivalSubmittedAt: string;
    submission: PreArrivalSubmission;
  }>('submitPreArrivalCheckIn')({
    propertyId: params.propertyId,
    typeId: params.typeId,
    sessionId: params.sessionId,
    guestFirstName: params.guestFirstName.trim(),
    guestLastName: params.guestLastName.trim(),
    guestCountry: params.guestCountry?.trim() || undefined,
    expectedArrivalTime: params.expectedArrivalTime,
    guestCount: params.guestCount,
    contactPhone: params.contactPhone,
    contactEmail: params.contactEmail || undefined,
    dateOfBirth: params.dateOfBirth || undefined,
    specialRequests: params.specialRequests || undefined,
    acceptedHouseRules: params.acceptedHouseRules,
    houseRulesLocale: params.houseRulesLocale || undefined,
    guestLocale: params.guestLocale || params.houseRulesLocale || undefined,
    transferRequested: params.transferRequested === true,
    idDocumentBase64: params.idDocumentBase64 || undefined,
    idDocumentContentType: params.idDocumentContentType || undefined,
    idDocumentType: params.idDocumentType || undefined,
    idDocumentNumber: params.idDocumentNumber || undefined,
    idIssuingCountry: params.idIssuingCountry || undefined,
    idIssueDate: params.idIssueDate || undefined,
    idExpiryDate: params.idExpiryDate || undefined,
  });
  return res.data;
}

export async function maybeAutoSendGuestInviteCallable(params: {
  propertyId: string;
  typeId: string;
  bookingId: string;
}): Promise<{ sent: boolean; reason?: string; guestEmail?: string }> {
  const res = await call<{ sent: boolean; reason?: string; guestEmail?: string }>(
    'maybeAutoSendGuestInvite'
  )({
    propertyId: params.propertyId,
    typeId: params.typeId,
    bookingId: params.bookingId,
  });
  return res.data;
}

export async function getPreArrivalIdDocumentForAdminCallable(params: {
  propertyId: string;
  typeId: string;
  bookingId: string;
}): Promise<{
  contentBase64: string;
  contentType: string;
  filename: string;
  uploadedAt?: string | null;
  sizeBytes?: number;
}> {
  const res = await call<{
    contentBase64: string;
    contentType: string;
    filename: string;
    uploadedAt?: string | null;
    sizeBytes?: number;
  }>('getPreArrivalIdDocumentForAdmin')({
    propertyId: params.propertyId,
    typeId: params.typeId,
    bookingId: params.bookingId,
  });
  return res.data;
}

export async function removePreArrivalCheckInForAdminCallable(params: {
  propertyId: string;
  typeId: string;
  bookingId: string;
}): Promise<{ removed: boolean; bookingId: string }> {
  const res = await call<{ removed: boolean; bookingId: string }>(
    'removePreArrivalCheckInForAdmin'
  )({
    propertyId: params.propertyId,
    typeId: params.typeId,
    bookingId: params.bookingId,
  });
  return res.data;
}

export async function escalateAssistantQuestionCallable(params: {
  propertyId: string;
  typeId: string;
  sessionId: string;
  guestQuestion: string;
  aiResponse: string;
}): Promise<AssistantEscalationResult> {
  const res = await call<AssistantEscalationResult>('escalateAssistantQuestion')(params);
  return res.data;
}
