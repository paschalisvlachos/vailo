import {
  emptyEssentialsBySlot,
  normalizeEssentialsBySlot,
  type AreaLocalGemOption,
  type EssentialPlaceProposal,
  type ManualLocalGemDraft,
} from './addPropertyEssentials';
import type { HouseGuideEssentialsSeed } from './mapEssentialsToHouseGuide';
import {
  EMPTY_WIZARD_LISTING,
  type WizardListingDraft,
} from './wizardListingOnboarding';

const STORAGE_KEY = 'vailo_add_property_draft_v1';

export type AddPropertySetupStep = 'listing' | 'around' | 'houseGuide';

function normalizeSetupStep(step: unknown): AddPropertySetupStep {
  if (step === 'around' || step === 'houseGuide') return step;
  return 'listing';
}

export type AddPropertyAreaContext = {
  country: string;
  areaId: string;
  areaName: string;
};

export type AddPropertyDraft = {
  listingDraft: WizardListingDraft;
  photoPreview: string | null;
  setupStep: AddPropertySetupStep;
  areaContext: AddPropertyAreaContext | null;
  /** Selected area local gem document ids. */
  selectedLocalGemIds: string[];
  /** Manual gems added during setup (not yet in area DB until property create). */
  manualLocalGems: ManualLocalGemDraft[];
  /** Cached area gem cards for step 2 UI restore. */
  areaLocalGems: AreaLocalGemOption[];
  /** Essential places keyed by slot id (each list closest → farthest). */
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>;
  /** Selected essential place keys: `${slotId}::${googlePlaceId}`. */
  selectedEssentialKeys: string[];
  /**
   * Deterministic House Guide pin seed from Nearby essentials
   * (Safety / Daily Needs useful locations / Transportation).
   */
  houseGuideSeed: HouseGuideEssentialsSeed | null;
  updatedAt: string;
};

export function emptyAddPropertyDraft(): AddPropertyDraft {
  return {
    listingDraft: { ...EMPTY_WIZARD_LISTING, referenceUrls: [''] },
    photoPreview: null,
    setupStep: 'listing',
    areaContext: null,
    selectedLocalGemIds: [],
    manualLocalGems: [],
    areaLocalGems: [],
    essentialsBySlot: emptyEssentialsBySlot(),
    selectedEssentialKeys: [],
    houseGuideSeed: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeHouseGuideSeed(raw: unknown): HouseGuideEssentialsSeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<HouseGuideEssentialsSeed>;
  return {
    emergencyContacts: Array.isArray(row.emergencyContacts) ? row.emergencyContacts : [],
    usefulLocations: Array.isArray(row.usefulLocations) ? row.usefulLocations : [],
    transportationPlaces: Array.isArray(row.transportationPlaces)
      ? row.transportationPlaces
      : [],
  };
}

export function readAddPropertyDraft(): AddPropertyDraft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAddPropertyDraft();
    const parsed = JSON.parse(raw) as Partial<AddPropertyDraft>;
    const base = emptyAddPropertyDraft();
    return {
      ...base,
      ...parsed,
      listingDraft: {
        ...EMPTY_WIZARD_LISTING,
        ...(parsed.listingDraft || {}),
        referenceUrls: parsed.listingDraft?.referenceUrls?.length
          ? parsed.listingDraft.referenceUrls
          : [''],
      },
      setupStep: normalizeSetupStep(parsed.setupStep),
      areaContext: parsed.areaContext || null,
      selectedLocalGemIds: Array.isArray(parsed.selectedLocalGemIds)
        ? parsed.selectedLocalGemIds
        : [],
      manualLocalGems: Array.isArray(parsed.manualLocalGems) ? parsed.manualLocalGems : [],
      areaLocalGems: Array.isArray(parsed.areaLocalGems) ? parsed.areaLocalGems : [],
      essentialsBySlot: normalizeEssentialsBySlot(parsed.essentialsBySlot),
      selectedEssentialKeys: Array.isArray(parsed.selectedEssentialKeys)
        ? parsed.selectedEssentialKeys
        : [],
      houseGuideSeed: normalizeHouseGuideSeed(parsed.houseGuideSeed),
    };
  } catch {
    return emptyAddPropertyDraft();
  }
}

export function writeAddPropertyDraft(draft: AddPropertyDraft): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

export function clearAddPropertyDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
