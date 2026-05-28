import { useEffect, useState } from 'react';
import { useGuestLocale } from '../../context/GuestLocaleContext';

type Props = {
  text: string;
  className?: string;
  as?: 'span' | 'p' | 'div';
};

export default function GuestTranslatedText({ text, className, as: Tag = 'span' }: Props) {
  const { locale, translateText, t } = useGuestLocale();
  const [display, setDisplay] = useState(text);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = String(text || '').trim();
    if (!raw) {
      setDisplay('');
      setBusy(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setDisplay(raw);

    void translateText(raw).then((translated) => {
      if (!cancelled) {
        setDisplay(translated);
        setBusy(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [text, locale, translateText]);

  return (
    <Tag className={className}>
      {busy && display === text ? (
        <span className="text-gray-400 italic text-[0.92em]">{t('translating')}</span>
      ) : (
        display
      )}
    </Tag>
  );
}
