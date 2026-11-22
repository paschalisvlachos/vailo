/** Nearby essentials proposed during Add Property step 2. */

export type EssentialSectionId =
  | 'localGems'
  | 'safety'
  | 'useful'
  | 'transport'
  | 'emergencyPhones';

export type EssentialPlaceProposal = {
  slotId: string;
  label: string;
  section: Exclude<EssentialSectionId, 'localGems' | 'emergencyPhones'>;
  name: string;
  address: string;
  phoneNumber: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  googleMapsUrl: string;
  photoUrl: string | null;
  rating: number | null;
  distanceMeters: number | null;
  primaryType: string;
  userRatingCount?: number | null;
};

export type EssentialSlotDef = {
  id: string;
  label: string;
  section: Exclude<EssentialSectionId, 'localGems' | 'emergencyPhones'>;
  /** Places API (New) includedTypes for nearby search. */
  includedTypes: string[];
  /**
   * Extra Text Search queries (merged with nearby).
   * Use for hubs Google mis-tags (airports, ferry ports, pharmacies).
   */
  textQueries?: string[];
  /**
   * Name must match at least one of these (case-insensitive).
   * If none match, the slot returns empty — never a wrong specialty.
   */
  requireNameIncludes?: string[];
  /** Drop places whose name matches any of these. */
  excludeNameIncludes?: string[];
  /** Minimum Google review count (major hubs / central shops). */
  minUserRatings?: number;
  /** Search radius in meters (API max 50km). */
  radiusMeters: number;
  /** How many places to keep (closest → farthest after sort). */
  maxResults: number;
  rankPreference?: 'DISTANCE' | 'POPULARITY';
};

export type AreaLocalGemOption = {
  id: string;
  name: string;
  description: string;
  category: string;
  categories: string[];
  address: string;
  photoUrl: string;
  googleMapsUrl: string;
  googlePlaceId?: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters?: number | null;
};

export type ManualLocalGemDraft = {
  localId: string;
  name: string;
  category: string;
  address: string;
  googleMapsUrl: string;
  photoUrl: string;
};

/** Always present the N closest area gems per category. */
export const LOCAL_GEMS_CLOSEST_COUNT = 10;

/** Safety & Emergency */
export const SAFETY_ESSENTIAL_SLOTS: EssentialSlotDef[] = [
  {
    id: 'pharmacy',
    label: 'Pharmacies',
    section: 'safety',
    includedTypes: ['pharmacy'],
    textQueries: ['pharmacy', 'φαρμακείο'],
    radiusMeters: 25000,
    maxResults: 10,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'hospital',
    label: 'Hospitals',
    section: 'safety',
    includedTypes: ['hospital'],
    textQueries: ['hospital', 'νοσοκομείο', 'health centre κέντρο υγείας'],
    requireNameIncludes: [
      'hospital',
      'νοσοκομ',
      'clinic',
      'κλινικ',
      'health centre',
      'health center',
      'κέντρο υγείας',
      'κεντρο υγειας',
    ],
    excludeNameIncludes: ['veterinary', 'κτηνιατρ'],
    minUserRatings: 15,
    radiusMeters: 50000,
    maxResults: 6,
    rankPreference: 'POPULARITY',
  },
  {
    id: 'clinic',
    label: 'Medical clinics',
    section: 'safety',
    includedTypes: ['medical_clinic'],
    textQueries: ['medical clinic', 'ιατρείο', 'πολυϊατρείο'],
    radiusMeters: 25000,
    maxResults: 8,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'police',
    label: 'Police',
    section: 'safety',
    includedTypes: ['police'],
    textQueries: ['police station', 'αστυνομία', 'αστυνομικό τμήμα'],
    requireNameIncludes: ['police', 'αστυνομ'],
    radiusMeters: 50000,
    maxResults: 5,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'fire',
    label: 'Fire departments',
    section: 'safety',
    includedTypes: ['fire_station'],
    textQueries: ['fire station', 'πυροσβεστική'],
    requireNameIncludes: ['fire', 'πυροσβεστ'],
    radiusMeters: 50000,
    maxResults: 4,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'doctor',
    label: 'Doctors',
    section: 'safety',
    includedTypes: ['doctor'],
    textQueries: ['doctor', 'ιατρός', 'pathologist παθολόγος'],
    excludeNameIncludes: ['veterinary', 'κτηνιατρ', 'dentist', 'οδοντ'],
    radiusMeters: 25000,
    maxResults: 10,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'dentist',
    label: 'Dentists',
    section: 'safety',
    includedTypes: ['dentist'],
    textQueries: ['dentist', 'οδοντίατρος'],
    requireNameIncludes: ['dent', 'οδοντ'],
    radiusMeters: 25000,
    maxResults: 6,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'paediatrician',
    label: 'Paediatricians',
    section: 'safety',
    includedTypes: ['doctor'],
    textQueries: ['paediatrician', 'pediatrician', 'παιδίατρος'],
    requireNameIncludes: ['paediatric', 'pediatric', 'παιδίατρ', 'παιδιατρ'],
    excludeNameIncludes: ['orthop', 'ορθοπ'],
    radiusMeters: 40000,
    maxResults: 6,
    rankPreference: 'DISTANCE',
  },
];

/** Useful information */
export const USEFUL_ESSENTIAL_SLOTS: EssentialSlotDef[] = [
  {
    id: 'supermarket',
    label: 'Supermarkets',
    section: 'useful',
    includedTypes: ['supermarket'],
    textQueries: [
      'supermarket',
      'σούπερ μάρκετ',
      'AB Vassilopoulos',
      'Sklavenitis',
      'Lidl',
      'Χαλκιαδάκης',
    ],
    excludeNameIncludes: ['mini market', 'minimarket', 'kiosk', 'περίπτερο'],
    minUserRatings: 20,
    radiusMeters: 50000,
    maxResults: 10,
    rankPreference: 'POPULARITY',
  },
  {
    id: 'minimarket',
    label: 'Mini markets',
    section: 'useful',
    includedTypes: ['convenience_store'],
    textQueries: ['mini market', 'convenience store', 'μίνι μάρκετ'],
    radiusMeters: 15000,
    maxResults: 8,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'bakery',
    label: 'Bakeries',
    section: 'useful',
    includedTypes: ['bakery'],
    textQueries: ['bakery', 'φούρνος', 'αρτοποιείο'],
    radiusMeters: 15000,
    maxResults: 8,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'gas',
    label: 'Gas stations',
    section: 'useful',
    includedTypes: ['gas_station'],
    textQueries: ['gas station', 'βενζινάδικο', 'shell', 'aegean oil', 'bp'],
    radiusMeters: 25000,
    maxResults: 8,
    rankPreference: 'DISTANCE',
  },
  {
    id: 'atm',
    label: 'ATMs',
    section: 'useful',
    includedTypes: ['atm'],
    textQueries: ['ATM', 'ατμ'],
    radiusMeters: 15000,
    maxResults: 8,
    rankPreference: 'DISTANCE',
  },
];

/** Transportation — only major international airports and main ferry ports (e.g. CHQ, Souda). */
export const TRANSPORT_ESSENTIAL_SLOTS: EssentialSlotDef[] = [
  {
    id: 'airport',
    label: 'Airports',
    section: 'transport',
    includedTypes: ['airport'],
    textQueries: [
      'Chania International Airport',
      'Heraklion International Airport',
      'CHQ international airport',
      'international airport',
      'Διεθνές Αερολιμένας Χανίων',
      'αεροδρόμιο Χανίων',
    ],
    requireNameIncludes: ['airport', 'αεροδρ', 'αερολιμ'],
    excludeNameIncludes: [
      'helipad',
      'heliport',
      'ελικοδρ',
      'navy',
      'ναύσταθ',
      'military',
      'στρατιωτ',
      'airfield',
      'airstrip',
    ],
    /** Real passenger airports have hundreds+ reviews; drops helipads / tiny strips. */
    minUserRatings: 200,
    radiusMeters: 50000,
    maxResults: 3,
    rankPreference: 'POPULARITY',
  },
  {
    id: 'port',
    label: 'Ports',
    section: 'transport',
    includedTypes: ['ferry_terminal'],
    textQueries: [
      'Souda Port',
      'Port of Souda',
      'λιμάνι Σούδας',
      'Souda ferry terminal',
      'Heraklion Port',
      'main ferry port',
    ],
    requireNameIncludes: ['souda', 'σούδα', 'ferry', 'λιμάν', 'λιμαν', 'port', 'harbour', 'harbor'],
    excludeNameIncludes: ['marina', 'μαρίνα', 'yacht', 'πλαζ', 'beach', 'fishing'],
    minUserRatings: 80,
    radiusMeters: 50000,
    maxResults: 3,
    rankPreference: 'POPULARITY',
  },
];

export const ALL_ESSENTIAL_SLOTS: EssentialSlotDef[] = [
  ...SAFETY_ESSENTIAL_SLOTS,
  ...USEFUL_ESSENTIAL_SLOTS,
  ...TRANSPORT_ESSENTIAL_SLOTS,
];

export function emptyEssentialsBySlot(): Record<string, EssentialPlaceProposal[]> {
  const out: Record<string, EssentialPlaceProposal[]> = {};
  for (const slot of ALL_ESSENTIAL_SLOTS) out[slot.id] = [];
  return out;
}

/** Normalize session drafts that still store a single place per slot. */
export function normalizeEssentialsBySlot(
  raw: unknown
): Record<string, EssentialPlaceProposal[]> {
  const out = emptyEssentialsBySlot();
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = value.filter(Boolean) as EssentialPlaceProposal[];
    } else if (value && typeof value === 'object' && (value as { name?: string }).name) {
      out[key] = [value as EssentialPlaceProposal];
    }
  }
  return out;
}

export function countEssentialsFound(
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>,
  slots: EssentialSlotDef[]
): number {
  return slots.reduce((sum, slot) => sum + (essentialsBySlot[slot.id]?.length || 0), 0);
}

export function essentialSelectionKey(place: Pick<EssentialPlaceProposal, 'slotId' | 'googlePlaceId' | 'name'>): string {
  const id = String(place.googlePlaceId || '').trim();
  if (id) return `${place.slotId}::${id}`;
  return `${place.slotId}::${String(place.name || '').trim().toLowerCase()}`;
}
