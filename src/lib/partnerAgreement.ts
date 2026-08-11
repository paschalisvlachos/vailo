import {
  PLATFORM_AGREEMENT_KINDS,
  type PlatformAgreementKind,
} from './platformLegal';
import type { OwnerRole } from './adminAccess';
import { normalizeOwnerRole } from './adminAccess';

export type PartnerAgreementRecord = {
  partnerAgreementKind?: PlatformAgreementKind;
  partnerAgreementInviteSentAt?: string;
  partnerAgreementAcceptedAt?: string;
};

export function ownerRoleToAgreementKind(
  role: OwnerRole | string | undefined
): PlatformAgreementKind | null {
  switch (normalizeOwnerRole(role)) {
    case 'owner':
      return 'property_owner';
    case 'agent':
      return 'agency';
    case 'excursion_provider':
      return 'excursion_provider';
    default:
      return null;
  }
}

export function agreementKindLabel(kind: PlatformAgreementKind | undefined): string {
  if (!kind) return 'Agreement';
  return PLATFORM_AGREEMENT_KINDS.find((k) => k.id === kind)?.label || 'Agreement';
}

export function formatPartnerAgreementDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function partnerAgreementStatusLabel(record: PartnerAgreementRecord): string {
  if (record.partnerAgreementAcceptedAt) return 'Accepted';
  if (record.partnerAgreementInviteSentAt) return 'Invite sent';
  return 'Not sent';
}
