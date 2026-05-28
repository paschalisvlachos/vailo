import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMemo } from 'react';
import {
  EMPTY_PLATFORM_LEGAL,
  LEGAL_CATEGORY_ID,
  parsePlatformLegal,
  resolveLegalCategoryDocuments,
  resolveLegalHtmlForLocale,
  type LegalFileDocument,
  type PlatformLegalContent,
} from '../lib/platformLegal';

export function usePlatformLegal(locale?: string) {
  const [content, setContent] = useState<PlatformLegalContent>(EMPTY_PLATFORM_LEGAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'platformSettings', 'legal');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setContent(parsePlatformLegal(snapshot.data()));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('platformLegal listener:', err);
        setContent(EMPTY_PLATFORM_LEGAL);
        setError('Could not load legal documents.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const resolved = useMemo(() => {
    const code = String(locale || 'en').trim().toLowerCase() || 'en';
    return {
      privacyPolicy: resolveLegalHtmlForLocale(
        content.privacyPolicyByLocale,
        content.privacyPolicy,
        code
      ),
      termsOfUse: resolveLegalHtmlForLocale(
        content.termsOfUseByLocale,
        content.termsOfUse,
        code
      ),
      agreement: resolveLegalHtmlForLocale(
        content.agreementByLocale,
        content.agreement,
        code
      ),
      legalFiles: resolveLegalCategoryDocuments(
        content.categories,
        LEGAL_CATEGORY_ID,
        code
      ) as LegalFileDocument[],
    };
  }, [content, locale]);

  return { content, loading, error, resolved };
}
