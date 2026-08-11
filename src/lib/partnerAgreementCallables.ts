import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import type { PlatformAgreementKind } from './platformLegal';

function call<T>(name: string) {
  return httpsCallable<Record<string, unknown>, T>(cloudFunctions, name);
}

export type PartnerAgreementInvitePayload = {
  recipientName: string;
  company: string;
  agreementKind: PlatformAgreementKind;
  agreementLabel: string;
  agreementHtml: string;
  locale: string;
  alreadyAccepted: boolean;
  acceptedAt: string | null;
  inviteSentAt: string | null;
};

export async function sendPartnerAgreementInviteCallable(
  ownerId: string,
  locale = 'en'
): Promise<{
  ownerId: string;
  email: string;
  agreementKind: PlatformAgreementKind;
  agreementUrl: string;
  inviteSentAt: string;
  resendSentId: string | null;
}> {
  const res = await call<{
    ownerId: string;
    email: string;
    agreementKind: PlatformAgreementKind;
    agreementUrl: string;
    inviteSentAt: string;
    resendSentId: string | null;
  }>('sendPartnerAgreementInvite')({ ownerId, locale });
  return res.data;
}

export async function getPartnerAgreementInviteCallable(
  token: string,
  locale = 'en'
): Promise<PartnerAgreementInvitePayload> {
  const res = await call<PartnerAgreementInvitePayload>('getPartnerAgreementInvite')({
    token,
    locale,
  });
  return res.data;
}

export async function acceptPartnerAgreementCallable(
  token: string,
  locale = 'en'
): Promise<{ acceptedAt: string; alreadyAccepted: boolean }> {
  const res = await call<{ acceptedAt: string; alreadyAccepted: boolean }>(
    'acceptPartnerAgreement'
  )({ token, locale });
  return res.data;
}
