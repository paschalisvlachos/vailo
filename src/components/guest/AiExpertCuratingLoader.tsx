import { Loader2, Sparkles } from 'lucide-react';
import type { GuestLocaleUiKey } from '../../lib/guestLocaleUi';

type Props = {
  headline: string;
  hint?: string;
  steps?: { key: GuestLocaleUiKey; label: string }[];
  activeStepIndex?: number;
  compact?: boolean;
};

export default function AiExpertCuratingLoader({
  headline,
  hint,
  steps,
  activeStepIndex = 0,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div className="w-full max-w-full mt-4 animate-in fade-in duration-300">
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm px-4 py-3.5">
          <Loader2 size={18} className="animate-spin text-vailo-gold shrink-0" />
          <p className="text-sm font-medium text-white/90 leading-snug min-w-0">{headline}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full mt-4 mb-2 animate-in fade-in duration-300">
      <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
        <div className="h-1 bg-white/8 overflow-hidden rounded-t-2xl">
          <div className="ai-expert-shimmer-bar h-full w-2/5 bg-gradient-to-r from-transparent via-vailo-gold/80 to-transparent" />
        </div>

        <div className="p-5 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 h-11 w-11">
              <div className="absolute inset-0 rounded-xl bg-vailo-gold/25 animate-ping opacity-30" />
              <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/25 flex items-center justify-center shadow-inner">
                <Sparkles className="text-vailo-gold animate-pulse" size={20} />
              </div>
            </div>
            <p className="text-white font-semibold text-base leading-snug">{headline}</p>
          </div>

          {hint ? (
            <p className="text-white/50 text-sm leading-relaxed">{hint}</p>
          ) : null}

          {(steps ?? []).length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
              aria-live="polite"
            >
              {steps?.map((step, i) => {
                const done = i < activeStepIndex;
                const active = i === activeStepIndex;
                return (
                  <span
                    key={step.key}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 transition-all duration-500 ${
                      active
                        ? 'bg-vailo-gold/12 border border-vailo-gold/25 text-white shadow-[0_0_12px_rgba(197,160,89,0.12)]'
                        : done
                          ? 'text-white/65'
                          : 'text-white/40'
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-full transition-all duration-500 ${
                        active
                          ? 'h-1.5 w-1.5 bg-vailo-gold shadow-[0_0_5px_rgba(197,160,89,0.55)]'
                          : done
                            ? 'h-1 w-1 bg-vailo-gold/75'
                            : 'h-1 w-1 border border-white/35'
                      }`}
                      aria-hidden
                    />
                    <span className={active ? 'font-medium' : undefined}>{step.label}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
