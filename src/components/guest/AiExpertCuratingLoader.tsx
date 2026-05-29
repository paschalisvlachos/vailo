import { Check, Circle, Loader2, Sparkles } from 'lucide-react';
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
  activeStepIndex,
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
      <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm overflow-hidden">
        <div className="h-1 bg-white/8 overflow-hidden">
          <div className="ai-expert-shimmer-bar h-full w-2/5 bg-gradient-to-r from-transparent via-vailo-gold/80 to-transparent" />
        </div>

        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0 h-14 w-14">
              <div className="absolute inset-0 rounded-2xl bg-vailo-gold/25 animate-ping opacity-30" />
              <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/25 flex items-center justify-center shadow-inner">
                <Sparkles className="text-vailo-gold animate-pulse" size={22} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-base leading-snug">{headline}</p>
              {hint ? (
                <p className="text-white/50 text-sm mt-1 leading-relaxed">{hint}</p>
              ) : null}

              <ul className="mt-4 space-y-2.5" aria-live="polite">
                {(steps ?? []).map((step, i) => {
                  const done = i < (activeStepIndex ?? 0);
                  const active = i === (activeStepIndex ?? 0);
                  return (
                    <li
                      key={step.key}
                      className={`flex items-center gap-2.5 text-sm transition-colors duration-500 ${
                        done ? 'text-white/70' : active ? 'text-white' : 'text-white/35'
                      }`}
                    >
                      {done ? (
                        <Check size={15} className="text-vailo-gold shrink-0" strokeWidth={2.5} />
                      ) : active ? (
                        <Loader2 size={15} className="animate-spin text-vailo-gold shrink-0" />
                      ) : (
                        <Circle size={15} className="text-white/25 shrink-0" strokeWidth={1.5} />
                      )}
                      <span className={active ? 'font-medium' : undefined}>{step.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
