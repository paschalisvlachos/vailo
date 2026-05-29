import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGuestLocale } from '../../context/GuestLocaleContext';

type Props = {
  text?: string;
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
 * Host content is auto-translated to the guest's active locale.
 */
export default function ExpandableDescription({
  text,
  lines = 3,
  className = '',
  bodyClassName = 'text-base text-gray-600 leading-relaxed',
  toggleClassName = 'mt-1.5 text-sm font-semibold uppercase tracking-[0.08em] text-[#0B4F5C] hover:text-[#C5A059] transition-colors min-h-[44px]',
  onExpand,
}: Props) {
  const { t, translateText } = useGuestLocale();
  const ref = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [displayText, setDisplayText] = useState(text || '');

  useEffect(() => {
    const raw = String(text || '').trim();
    if (!raw) {
      setDisplayText('');
      return;
    }
    let cancelled = false;
    setDisplayText(raw);
    void translateText(raw).then((translated) => {
      if (!cancelled) setDisplayText(translated);
    });
    return () => {
      cancelled = true;
    };
  }, [text, translateText]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || !displayText) {
      setIsClamped(false);
      return;
    }
    setIsClamped(el.scrollHeight - el.clientHeight > 1);
  }, [displayText, lines]);

  if (!text) return null;

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
