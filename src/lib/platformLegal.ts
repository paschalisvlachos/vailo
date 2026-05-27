export const PLATFORM_LEGAL_DOC = 'platformSettings/legal';

export type LegalFileDocument = {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  storagePath: string;
  contentType?: string;
  updatedAt?: string;
};

export type LegalCategory = {
  id: string;
  name: string;
  documents: LegalFileDocument[];
};

export type PlatformLegalContent = {
  privacyPolicy: string;
  termsOfUse: string;
  agreement: string;
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
  return {
    id,
    title: title || fileName || 'Untitled document',
    fileUrl,
    fileName: fileName || 'file',
    storagePath,
    contentType: typeof d.contentType === 'string' ? d.contentType : undefined,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
  };
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

export function parsePlatformLegal(data: Record<string, unknown> | undefined): PlatformLegalContent {
  if (!data) return EMPTY_PLATFORM_LEGAL;
  const updatedAt = data.updatedAt;
  const categoriesRaw = Array.isArray(data.categories) ? data.categories : [];
  const parsed = categoriesRaw
    .map(parseCategory)
    .filter((c): c is LegalCategory => c !== null);

  return {
    privacyPolicy: typeof data.privacyPolicy === 'string' ? data.privacyPolicy : '',
    termsOfUse: typeof data.termsOfUse === 'string' ? data.termsOfUse : '',
    agreement: typeof data.agreement === 'string' ? data.agreement : '',
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
      contentType: doc.contentType || '',
      updatedAt: doc.updatedAt || new Date().toISOString(),
    })),
  }));
}
