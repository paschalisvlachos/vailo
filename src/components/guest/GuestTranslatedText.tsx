import { useGuestLocale } from '../../context/GuestLocaleContext';
import GuestLocalizedText from './GuestLocalizedText';

type Props = {
  text: string;
  doc?: Record<string, unknown> | null;
  field?: string;
  className?: string;
  as?: 'span' | 'p' | 'div';
};

/** @deprecated Prefer GuestLocalizedText with doc + field. */
export default function GuestTranslatedText({ text, doc, field = 'name', className, as }: Props) {
  const { locale, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();
  return (
    <GuestLocalizedText
      text={text}
      doc={doc}
      field={field}
      locale={locale}
      primaryLocale={contentPrimaryLocale}
      reviewedLocales={contentReviewedLocales}
      className={className}
      as={as}
    />
  );
}
