import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Props = {
  text?: string;
  /** Number of lines to show when collapsed. */
  lines?: number;
  className?: string;
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Clamps `text` to `lines` lines and shows a "more" / "less" toggle when truncated.
 * Detects truncation by comparing scrollHeight to clientHeight; works with line-clamp.
 */
export default function ExpandableDescription({ text, lines = 3, className = '' }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) {
      setIsClamped(false);
      return;
    }
    // Measure with the collapsed style applied.
    setIsClamped(el.scrollHeight - el.clientHeight > 1);
  }, [text, lines]);

  if (!text) return null;

  return (
    <div className={className}>
      <p
        ref={ref}
        className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap"
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
        {text}
      </p>
      {(isClamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B4F5C] hover:text-[#C5A059] transition-colors"
        >
          {expanded ? 'Show less' : 'More'}
        </button>
      )}
    </div>
  );
}
