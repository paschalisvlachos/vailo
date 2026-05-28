export const PLATFORM_LEGAL_DOC = 'platformSettings/legal';

export type LegalFileDocument = {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  storagePath: string;
  /** BCP-47 short code (e.g. en, el). Legacy docs without locale count as English. */
  locale?: string;
  contentType?: string;
  updatedAt?: string;
};

export type LegalCategory = {
  id: string;
  name: string;
  documents: LegalFileDocument[];
};

export type PlatformLegalContent = {
  /** @deprecated Legacy single-language HTML; treated as English. */
  privacyPolicy: string;
  /** @deprecated Legacy single-language HTML; treated as English. */
  termsOfUse: string;
  /** @deprecated Legacy single-language HTML; treated as English. */
  agreement: string;
  /** Per-locale published HTML (BCP-47 short codes, e.g. en, el). */
  privacyPolicyByLocale?: Record<string, string>;
  termsOfUseByLocale?: Record<string, string>;
  agreementByLocale?: Record<string, string>;
  categories: LegalCategory[];
  updatedAt: Date | null;
};

/** Fixed id and display name for the platform Legal file category (not renameable). */
export const LEGAL_CATEGORY_ID = 'legal';
export const LEGAL_CATEGORY_NAME = 'Legal';

/** Default category seeded for new installs (English). */
export const DEFAULT_LEGAL_CATEGORY: LegalCategory = {
  id: LEGAL_CATEGORY_ID,
  name: LEGAL_CATEGORY_NAME,
  documents: [],
};

export function isLockedLegalCategory(categoryId: string): boolean {
  return categoryId === LEGAL_CATEGORY_ID;
}

export function legalCategoryDisplayName(category: LegalCategory): string {
  return isLockedLegalCategory(category.id) ? LEGAL_CATEGORY_NAME : category.name;
}

export const EMPTY_PLATFORM_LEGAL: PlatformLegalContent = {
  privacyPolicy: '',
  termsOfUse: '',
  agreement: '',
  categories: [DEFAULT_LEGAL_CATEGORY],
  updatedAt: null,
};

export function createLegalId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseDocument(raw: unknown): LegalFileDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = typeof d.id === 'string' ? d.id : '';
  const title = typeof d.title === 'string' ? d.title : '';
  const fileUrl = typeof d.fileUrl === 'string' ? d.fileUrl : '';
  const fileName = typeof d.fileName === 'string' ? d.fileName : '';
  const storagePath = typeof d.storagePath === 'string' ? d.storagePath : '';
  if (!id || !fileUrl) return null;
  const localeRaw = typeof d.locale === 'string' ? d.locale.trim().toLowerCase() : '';
  return {
    id,
    title: title || fileName || 'Untitled document',
    fileUrl,
    fileName: fileName || 'file',
    storagePath,
    locale: localeRaw || undefined,
    contentType: typeof d.contentType === 'string' ? d.contentType : undefined,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
  };
}

export function documentLocale(doc: LegalFileDocument): string {
  return (doc.locale || 'en').trim().toLowerCase() || 'en';
}

export function filterDocumentsForLocale(
  documents: LegalFileDocument[],
  locale: string
): LegalFileDocument[] {
  const code = String(locale || 'en').trim().toLowerCase() || 'en';
  return documents.filter((d) => documentLocale(d) === code);
}

export function resolveLegalCategoryDocuments(
  categories: LegalCategory[],
  categoryId: string,
  locale: string
): LegalFileDocument[] {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return [];
  return filterDocumentsForLocale(cat.documents, locale);
}

function parseCategory(raw: unknown): LegalCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = typeof c.id === 'string' ? c.id : '';
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!id) return null;
  const docsRaw = Array.isArray(c.documents) ? c.documents : [];
  const documents = docsRaw
    .map(parseDocument)
    .filter((d): d is LegalFileDocument => d !== null);
  const resolvedName = isLockedLegalCategory(id)
    ? LEGAL_CATEGORY_NAME
    : (name || '').trim();
  if (!resolvedName) return null;
  return { id, name: resolvedName, documents };
}

function parseLocaleHtmlMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim()) {
      out[key.trim().toLowerCase()] = val;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveLegalHtmlForLocale(
  byLocale: Record<string, string> | undefined,
  legacy: string,
  locale: string
): string {
  const code = String(locale || 'en').trim().toLowerCase() || 'en';
  if (byLocale?.[code]?.trim()) return byLocale[code];
  if (byLocale?.en?.trim()) return byLocale.en;
  const first = byLocale && Object.values(byLocale).find((h) => h?.trim());
  if (first) return first;
  return legacy || '';
}

export function parsePlatformLegal(data: Record<string, unknown> | undefined): PlatformLegalContent {
  if (!data) return EMPTY_PLATFORM_LEGAL;
  const updatedAt = data.updatedAt;
  const categoriesRaw = Array.isArray(data.categories) ? data.categories : [];
  const parsed = categoriesRaw
    .map(parseCategory)
    .filter((c): c is LegalCategory => c !== null);

  const legacyPrivacy = typeof data.privacyPolicy === 'string' ? data.privacyPolicy : '';
  const legacyTerms = typeof data.termsOfUse === 'string' ? data.termsOfUse : '';
  let privacyPolicyByLocale = parseLocaleHtmlMap(data.privacyPolicyByLocale);
  let termsOfUseByLocale = parseLocaleHtmlMap(data.termsOfUseByLocale);

  if (legacyPrivacy.trim() && !privacyPolicyByLocale?.en) {
    privacyPolicyByLocale = { ...(privacyPolicyByLocale || {}), en: legacyPrivacy };
  }
  if (legacyTerms.trim() && !termsOfUseByLocale?.en) {
    termsOfUseByLocale = { ...(termsOfUseByLocale || {}), en: legacyTerms };
  }

  const legacyAgreement = typeof data.agreement === 'string' ? data.agreement : '';
  let agreementByLocale = parseLocaleHtmlMap(data.agreementByLocale);
  if (legacyAgreement.trim() && !agreementByLocale?.en) {
    agreementByLocale = { ...(agreementByLocale || {}), en: legacyAgreement };
  }

  return {
    privacyPolicy: legacyPrivacy,
    termsOfUse: legacyTerms,
    privacyPolicyByLocale,
    termsOfUseByLocale,
    agreement: legacyAgreement,
    agreementByLocale,
    categories: parsed.length > 0 ? parsed : [DEFAULT_LEGAL_CATEGORY],
    updatedAt:
      updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt
        ? (updatedAt as { toDate: () => Date }).toDate()
        : null,
  };
}

export function serializeCategoriesForFirestore(categories: LegalCategory[]): LegalCategory[] {
  return categories.map((cat) => ({
    id: cat.id,
    name: isLockedLegalCategory(cat.id) ? LEGAL_CATEGORY_NAME : cat.name.trim(),
    documents: cat.documents.map((doc) => ({
      id: doc.id,
      title: doc.title.trim() || doc.fileName,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      storagePath: doc.storagePath,
      locale: documentLocale(doc),
      contentType: doc.contentType || '',
      updatedAt: doc.updatedAt || new Date().toISOString(),
    })),
  }));
}
