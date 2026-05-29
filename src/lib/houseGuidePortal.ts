import { getGuideTextValue } from './houseGuideLocales';

/**
 * Maps the 19 admin House Guide categories to the "featured keys" that can be
 * surfaced as preview chips on the guest portal. Each featured key bundles the
 * source admin fields whose content feeds the AI summary generator.
 *
 * Arrival & Check-out are intentionally merged into a single featured key so
 * the guest sees one consolidated card with both times.
 */

export const PORTAL_FEATURED_CAP = 4;

export type FeaturedKey =
  | 'arrival-departure'
  | 'power'
  | 'lighting'
  | 'hvac'
  | 'bathrooms'
  | 'bedrooms'
  | 'kitchen'
  | 'bbq'
  | 'pool'
  | 'wifi-entertainment'
  | 'laundry'
  | 'house-rules'
  | 'waste'
  | 'safety'
  | 'cleaning'
  | 'supplies'
  | 'devices'
  | 'faq';

export type FeaturedConfig = {
  id: FeaturedKey;
  title: string;
  /** Short helper text under the card title in admin. */
  description: string;
  /** Lucide icon name (rendered by the consumer to keep this file framework-free). */
  iconName:
    | 'Key'
    | 'Zap'
    | 'Lightbulb'
    | 'Thermometer'
    | 'Droplets'
    | 'BedDouble'
    | 'ChefHat'
    | 'Flame'
    | 'Waves'
    | 'Wifi'
    | 'WashingMachine'
    | 'ScrollText'
    | 'Trash2'
    | 'ShieldAlert'
    | 'Sparkles'
    | 'Box'
    | 'Wrench'
    | 'MessageCircleQuestion';
  /** Admin CategoryDef.id values that feed this featured key. */
  sourceCategoryIds: string[];
};

export const FEATURED_CONFIGS: FeaturedConfig[] = [
  {
    id: 'arrival-departure',
    title: 'Arrival & Check-out',
    description: 'Check-in time, lockbox, parking, check-out instructions.',
    iconName: 'Key',
    sourceCategoryIds: ['arrival', 'checkout'],
  },
  {
    id: 'wifi-entertainment',
    title: 'Wi-Fi & Entertainment',
    description: 'Internet credentials and TV / streaming details.',
    iconName: 'Wifi',
    sourceCategoryIds: ['entertainment'],
  },
  {
    id: 'house-rules',
    title: 'House Rules',
    description: 'House rules and quiet hours.',
    iconName: 'ScrollText',
    sourceCategoryIds: ['rules'],
  },
  {
    id: 'safety',
    title: 'Safety & Emergency',
    description: 'Emergency info, contacts, safe-box guidance.',
    iconName: 'ShieldAlert',
    sourceCategoryIds: ['safety'],
  },
  {
    id: 'hvac',
    title: 'A/C & Heating',
    description: 'How to operate the climate controls.',
    iconName: 'Thermometer',
    sourceCategoryIds: ['hvac'],
  },
  {
    id: 'pool',
    title: 'Pool & Jacuzzi',
    description: 'Pool hours, rules, and jacuzzi instructions.',
    iconName: 'Waves',
    sourceCategoryIds: ['pool'],
  },
  {
    id: 'kitchen',
    title: 'Kitchen',
    description: 'Appliances, supplies, key instructions.',
    iconName: 'ChefHat',
    sourceCategoryIds: ['kitchen'],
  },
  {
    id: 'bathrooms',
    title: 'Hot Water & Bathrooms',
    description: 'Boiler tips, amenities, toilet do-this-do-that.',
    iconName: 'Droplets',
    sourceCategoryIds: ['bathrooms'],
  },
  {
    id: 'bedrooms',
    title: 'Bedrooms & Linen',
    description: 'Sleeping arrangements and extra linens.',
    iconName: 'BedDouble',
    sourceCategoryIds: ['bedrooms'],
  },
  {
    id: 'bbq',
    title: 'BBQ & Outdoor',
    description: 'How to use the BBQ safely.',
    iconName: 'Flame',
    sourceCategoryIds: ['bbq'],
  },
  {
    id: 'laundry',
    title: 'Laundry',
    description: 'Washer, dryer, and iron instructions.',
    iconName: 'WashingMachine',
    sourceCategoryIds: ['laundry'],
  },
  {
    id: 'lighting',
    title: 'Lighting',
    description: 'Indoor and outdoor lighting tips.',
    iconName: 'Lightbulb',
    sourceCategoryIds: ['lighting'],
  },
  {
    id: 'power',
    title: 'Electricity & Power',
    description: 'Panels, outage steps, emergency lights.',
    iconName: 'Zap',
    sourceCategoryIds: ['power'],
  },
  {
    id: 'waste',
    title: 'Waste & Recycling',
    description: 'When and where to take the bins.',
    iconName: 'Trash2',
    sourceCategoryIds: ['waste'],
  },
  {
    id: 'cleaning',
    title: 'Cleaning & Maintenance',
    description: 'Housekeeping and maintenance contacts.',
    iconName: 'Sparkles',
    sourceCategoryIds: ['cleaning'],
  },
  {
    id: 'supplies',
    title: 'Extra Supplies',
    description: 'Batteries, mosquito gear, useful map pins.',
    iconName: 'Box',
    sourceCategoryIds: ['supplies'],
  },
  {
    id: 'devices',
    title: 'Property Devices',
    description: 'Appliance inventory and smart devices.',
    iconName: 'Wrench',
    sourceCategoryIds: ['devices'],
  },
  {
    id: 'faq',
    title: 'FAQ',
    description: 'Common guest questions and answers.',
    iconName: 'MessageCircleQuestion',
    sourceCategoryIds: ['faq'],
  },
];

const FEATURED_CONFIG_BY_ID: Record<FeaturedKey, FeaturedConfig> =
  FEATURED_CONFIGS.reduce((acc, cfg) => {
    acc[cfg.id] = cfg;
    return acc;
  }, {} as Record<FeaturedKey, FeaturedConfig>);

export function getFeaturedConfig(id: string): FeaturedConfig | null {
  return (FEATURED_CONFIG_BY_ID as Record<string, FeaturedConfig | undefined>)[id] || null;
}

/**
 * Reverse lookup: which featured key (if any) is anchored on a given admin
 * CategoryDef.id? Used by the admin UI to show / hide the inline toggle.
 *
 * Convention: the first sourceCategoryId of a featured config is its "primary"
 * (where the toggle lives). Other source categories are paired and only show a
 * read-only note.
 */
export function featuredKeyForPrimaryCategory(categoryId: string): FeaturedKey | null {
  for (const cfg of FEATURED_CONFIGS) {
    if (cfg.sourceCategoryIds[0] === categoryId) return cfg.id;
  }
  return null;
}

export function pairedFeaturedKeyForCategory(categoryId: string): FeaturedKey | null {
  for (const cfg of FEATURED_CONFIGS) {
    if (cfg.sourceCategoryIds.length > 1 && cfg.sourceCategoryIds.slice(1).includes(categoryId)) {
      return cfg.id;
    }
  }
  return null;
}

/** Stable string used as input to the AI summary + hashed for staleness detection. */
export function buildSourceTextForFeaturedKey(
  key: FeaturedKey,
  guideData: Record<string, unknown>,
  fieldsForCategoryId: (categoryId: string) => Array<{ id: string; label: string; type: string }>,
  locale?: string,
  primaryLocale?: string
): string {
  const cfg = getFeaturedConfig(key);
  if (!cfg) return '';
  const parts: string[] = [];
  const useLocale = locale && primaryLocale;

  for (const categoryId of cfg.sourceCategoryIds) {
    const fields = fieldsForCategoryId(categoryId);
    for (const field of fields) {
      const value =
        useLocale && field.type === 'textarea'
          ? getGuideTextValue(guideData, field.id, locale, primaryLocale)
          : guideData[field.id];
      if (typeof value === 'string' && value.trim()) {
        parts.push(`${field.label}: ${value.trim()}`);
      } else if (Array.isArray(value) && value.length > 0) {
        const serialized = value
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return '';
            return Object.entries(entry as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && (v as string).trim())
              .map(([k, v]) => `${k}=${(v as string).trim()}`)
              .join(' | ');
          })
          .filter(Boolean)
          .join('\n');
        if (serialized) parts.push(`${field.label}:\n${serialized}`);
      }
    }
  }

  return parts.join('\n\n').trim();
}

/** Browser-safe SHA-256 → short hex. Fallback when SubtleCrypto is unavailable. */
export async function shortContentHash(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const data = new TextEncoder().encode(input);
      const buffer = await crypto.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(buffer));
      return bytes.slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through
    }
  }
  // Best-effort fallback for environments without SubtleCrypto.
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type FeaturedPreviewRecord = {
  previewLine?: string;
  digest?: string;
  /** Per-locale guest portal chip line (BCP-47 short codes). */
  previewLineByLocale?: Record<string, string>;
  /** Per-locale guest portal digest (BCP-47 short codes). */
  digestByLocale?: Record<string, string>;
  /** Per-locale source hash for staleness detection. */
  contentHashByLocale?: Record<string, string>;
  /** @deprecated Primary-locale hash; use contentHashByLocale[primary]. */
  contentHash?: string;
  generatedAt?: string;
  customPreviewLine?: string;
};

export type FeaturedPreviewsMap = Partial<Record<FeaturedKey, FeaturedPreviewRecord>>;
