import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { resolveLocalizedString } from '../../lib/propertyContentLocales';

type Props = {
  text?: string;
  doc?: Record<string, unknown> | null;
  field?: string;
  /** Number of lines to show when collapsed. */
  lines?: number;
  className?: string;
  bodyClassName?: string;
  toggleClassName?: string;
  onExpand?: () => void;
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Clamps `text` to `lines` lines and shows a "more" / "less" toggle when truncated.
 * Host content is read from stored per-locale fields (see propertyContentLocales).
 */
export default function ExpandableDescription({
  text,
  doc,
  field = 'description',
  lines = 3,
  className = '',
  bodyClassName = 'text-base text-gray-600 leading-relaxed',
  toggleClassName = 'mt-1.5 text-sm font-semibold uppercase tracking-[0.08em] text-[#0B4F5C] hover:text-[#C5A059] transition-colors min-h-[44px]',
  onExpand,
}: Props) {
  const { t, locale, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();
  const ref = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const displayText = useMemo(() => {
    if (doc) {
      return resolveLocalizedString(doc, field, locale, contentPrimaryLocale, contentReviewedLocales);
    }
    return String(text || '').trim();
  }, [doc, field, locale, contentPrimaryLocale, contentReviewedLocales, text]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || !displayText) {
      setIsClamped(false);
      return;
    }
    setIsClamped(el.scrollHeight - el.clientHeight > 1);
  }, [displayText, lines]);

  if (!displayText) return null;

  return (
    <div className={className}>
      <p
        ref={ref}
        className={`${bodyClassName} whitespace-pre-wrap`}
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {displayText}
      </p>
      {(isClamped || expanded) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => {
              if (!v) onExpand?.();
              return !v;
            });
          }}
          className={toggleClassName}
        >
          {expanded ? t('less') : t('more')}
        </button>
      )}
    </div>
  );
}
