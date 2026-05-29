import { useMemo } from 'react';
import { resolveLocalizedString } from '../../lib/propertyContentLocales';

type Props = {
  text?: string;
  doc?: Record<string, unknown> | null;
  field?: string;
  locale: string;
  primaryLocale: string;
  reviewedLocales?: string[] | null;
  className?: string;
  as?: 'span' | 'p' | 'div';
};

/**
 * Renders host-authored copy from stored per-locale fields (no runtime machine translation).
 */
export default function GuestLocalizedText({
  text,
  doc,
  field = 'name',
  locale,
  primaryLocale,
  reviewedLocales,
  className,
  as: Tag = 'span',
}: Props) {
  const display = useMemo(() => {
    if (doc) {
      return resolveLocalizedString(doc, field, locale, primaryLocale, reviewedLocales);
    }
    return (text || '').trim();
  }, [doc, field, locale, primaryLocale, reviewedLocales, text]);

  if (!display) return null;
  return <Tag className={className}>{display}</Tag>;
}
