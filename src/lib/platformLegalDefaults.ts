import privacyPolicyEn from '../content/legal/en/privacy-policy.html?raw';
import termsOfUseEn from '../content/legal/en/terms-of-use.html?raw';
import propertyOwnerAgreementEn from '../content/legal/en/owner-agreement.html?raw';
import agencyAgreementEn from '../content/legal/en/agency-agreement.html?raw';
import excursionProviderAgreementEn from '../content/legal/en/excursion-provider-agreement.html?raw';
import type { PlatformAgreementKind } from './platformLegal';

export type PlatformLegalTemplateLocale = 'en';

export type PlatformLegalTemplateDoc =
  | 'privacyPolicy'
  | 'termsOfUse'
  | 'propertyOwnerAgreement'
  | 'agencyAgreement'
  | 'excursionProviderAgreement';

export const PLATFORM_LEGAL_TEMPLATES: Record<
  PlatformLegalTemplateLocale,
  Record<PlatformLegalTemplateDoc, string>
> = {
  en: {
    privacyPolicy: privacyPolicyEn,
    termsOfUse: termsOfUseEn,
    propertyOwnerAgreement: propertyOwnerAgreementEn,
    agencyAgreement: agencyAgreementEn,
    excursionProviderAgreement: excursionProviderAgreementEn,
  },
};

const AGREEMENT_TEMPLATE_BY_KIND: Record<PlatformAgreementKind, PlatformLegalTemplateDoc> = {
  property_owner: 'propertyOwnerAgreement',
  agency: 'agencyAgreement',
  excursion_provider: 'excursionProviderAgreement',
};

export function getPlatformLegalTemplate(
  locale: string,
  doc: PlatformLegalTemplateDoc
): string {
  const code = locale.trim().toLowerCase() || 'en';
  const pack = PLATFORM_LEGAL_TEMPLATES[code as PlatformLegalTemplateLocale];
  if (pack) return pack[doc];
  return PLATFORM_LEGAL_TEMPLATES.en[doc];
}

export function getPlatformAgreementTemplate(
  locale: string,
  kind: PlatformAgreementKind
): string {
  return getPlatformLegalTemplate(locale, AGREEMENT_TEMPLATE_BY_KIND[kind]);
}
