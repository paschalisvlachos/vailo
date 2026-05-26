export const PLATFORM_LEGAL_DOC = 'platformSettings/legal';

export type PlatformLegalContent = {
  privacyPolicy: string;
  termsOfUse: string;
  updatedAt: Date | null;
};

export const EMPTY_PLATFORM_LEGAL: PlatformLegalContent = {
  privacyPolicy: '',
  termsOfUse: '',
  updatedAt: null,
};

export function parsePlatformLegal(data: Record<string, unknown> | undefined): PlatformLegalContent {
  if (!data) return EMPTY_PLATFORM_LEGAL;
  const updatedAt = data.updatedAt;
  return {
    privacyPolicy: typeof data.privacyPolicy === 'string' ? data.privacyPolicy : '',
    termsOfUse: typeof data.termsOfUse === 'string' ? data.termsOfUse : '',
    updatedAt:
      updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt
        ? (updatedAt as { toDate: () => Date }).toDate()
        : null,
  };
}
