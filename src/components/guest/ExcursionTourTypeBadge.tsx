import {
  excursionAudienceTag,
  excursionAudienceTagLabel,
  type Excursion,
  type ExcursionAudienceTag,
} from '../../lib/excursion';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  excursion: Pick<Excursion, 'pricingModel'>;
  t?: (key: GuestLocaleKey) => string;
  className?: string;
  variant?: 'light' | 'hero';
};

function labelForTag(
  tag: ExcursionAudienceTag,
  t?: (key: GuestLocaleKey) => string
): string {
  if (t) {
    return tag === 'private' ? t('excursionAudiencePrivate') : t('excursionAudiencePublic');
  }
  return excursionAudienceTagLabel(tag);
}

export default function ExcursionTourTypeBadge({
  excursion,
  t,
  className = '',
  variant = 'light',
}: Props) {
  const tag = excursionAudienceTag(excursion);
  const label = labelForTag(tag, t);

  const styles =
    variant === 'hero'
      ? tag === 'public'
        ? 'bg-white/15 backdrop-blur-md border border-white/20 text-white'
        : 'bg-white/10 backdrop-blur-md border border-white/15 text-white/90'
      : tag === 'public'
        ? 'bg-sky-50 text-sky-800 border border-sky-100'
        : 'bg-violet-50 text-violet-800 border border-violet-100';

  return (
    <span className={`guest-badge rounded-md font-semibold ${styles} ${className}`.trim()}>
      {label}
    </span>
  );
}
