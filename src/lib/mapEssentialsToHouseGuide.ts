/**
 * Map Add Property Nearby essentials (+ country emergency phones)
 * into House Guide pin fields for seed / create handoff.
 */

import {
  essentialSelectionKey,
  type EssentialPlaceProposal,
} from './addPropertyEssentials';
import {
  getCountryEmergencyNumbers,
  type CountryEmergencyNumber,
} from './countryEmergencyNumbers';
import {
  HOUSE_GUIDE_EMERGENCY_OPTIONS,
  HOUSE_GUIDE_TRANSPORTATION_OPTIONS,
  HOUSE_GUIDE_USEFUL_MAP_OPTIONS,
} from './houseGuideCategories';
import type { GuideEmergencyPin, GuidePlacePin } from './houseGuidePlacePins';

export type HouseGuideEssentialsSeed = {
  emergencyContacts: GuideEmergencyPin[];
  usefulLocations: GuidePlacePin[];
  transportationPlaces: GuidePlacePin[];
};

const SAFETY_SLOT_TO_CATEGORY: Record<string, string> = {
  pharmacy: 'Pharmacy',
  hospital: 'Hospital/Clinic',
  clinic: 'Hospital/Clinic',
  police: 'Police',
  fire: 'Fire Dept',
  doctor: 'Doctor',
  dentist: 'Other',
  paediatrician: 'Paediatrician',
};

const USEFUL_SLOT_TO_TITLE: Record<string, string> = {
  supermarket: 'Nearest Supermarket',
  minimarket: 'Mini Market / Kiosk',
  bakery: 'Bakery',
  gas: 'Gas Station',
  atm: 'ATM',
};

const TRANSPORT_SLOT_TO_TITLE: Record<string, string> = {
  airport: 'Airport',
  port: 'Ferry Port',
};

function pickSelectedPlaces(
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>,
  selectedKeys: string[]
): EssentialPlaceProposal[] {
  const keySet = new Set(selectedKeys.map((k) => String(k || '').trim()).filter(Boolean));
  if (!keySet.size) return [];
  const out: EssentialPlaceProposal[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(essentialsBySlot || {})) {
    for (const place of list || []) {
      const key = essentialSelectionKey(place);
      if (!keySet.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(place);
    }
  }
  return out;
}

function placeToPin(place: EssentialPlaceProposal, titleOverride?: string): GuidePlacePin {
  const pin: GuidePlacePin = {
    title: (titleOverride || place.name || place.label || '').trim(),
    mapsLink: String(place.googleMapsUrl || '').trim(),
  };
  const phone = String(place.phoneNumber || '').trim();
  const address = String(place.address || '').trim();
  const photoUrl = String(place.photoUrl || '').trim();
  const googlePlaceId = String(place.googlePlaceId || '').trim();
  if (phone) pin.phone = phone;
  if (address) pin.address = address;
  if (photoUrl) pin.photoUrl = photoUrl;
  if (googlePlaceId) pin.googlePlaceId = googlePlaceId;
  if (place.rating != null) pin.rating = place.rating;
  if (place.latitude != null) pin.latitude = place.latitude;
  if (place.longitude != null) pin.longitude = place.longitude;
  if (place.slotId) pin.slotId = place.slotId;
  return pin;
}

function matchEmergencyOption(label: string): string {
  const lower = label.toLowerCase();
  for (const opt of HOUSE_GUIDE_EMERGENCY_OPTIONS) {
    if (lower.includes(opt.toLowerCase().split('/')[0]!.trim())) return opt;
  }
  if (lower.includes('police') || lower.includes('αστυνομ')) return 'Police';
  if (lower.includes('fire') || lower.includes('πυροσβεστ')) return 'Fire Dept';
  if (lower.includes('ambulance') || lower.includes('hospital') || lower.includes('clinic')) {
    return 'Hospital/Clinic';
  }
  if (lower.includes('pharm') || lower.includes('φαρμακ')) return 'Pharmacy';
  if (lower.includes('doctor') || lower.includes('ιατρ')) return 'Doctor';
  if (lower.includes('paediat') || lower.includes('παιδι')) return 'Paediatrician';
  return 'Other';
}

function usefulTitleForPlace(place: EssentialPlaceProposal): string {
  const placeName = String(place.name || '').trim();
  if (placeName) return placeName;
  const mapped = USEFUL_SLOT_TO_TITLE[place.slotId];
  if (mapped && HOUSE_GUIDE_USEFUL_MAP_OPTIONS.includes(mapped)) return mapped;
  return place.label || 'Other';
}

function transportTitleForPlace(place: EssentialPlaceProposal): string {
  const placeName = String(place.name || '').trim();
  if (placeName) return placeName;
  const mapped = TRANSPORT_SLOT_TO_TITLE[place.slotId];
  if (mapped && HOUSE_GUIDE_TRANSPORTATION_OPTIONS.includes(mapped)) return mapped;
  if (place.slotId === 'airport') return 'Airport';
  if (place.slotId === 'port') return 'Ferry Port';
  return place.label || 'Other';
}

function emergencyPhonesToContacts(
  phones: CountryEmergencyNumber[]
): GuideEmergencyPin[] {
  return phones
    .map((row) => {
      const phone = String(row.number || '').trim();
      if (!phone) return null;
      const pin: GuideEmergencyPin = {
        category: matchEmergencyOption(row.label),
        title: String(row.label || '').trim() || 'Emergency',
        mapsLink: '',
        phone,
      };
      if (row.note) pin.address = row.note;
      return pin;
    })
    .filter((p): p is GuideEmergencyPin => Boolean(p));
}

export function mapEssentialsToHouseGuide(input: {
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>;
  selectedEssentialKeys: string[];
  country?: string;
  /** When true, include national emergency numbers even if no safety pins selected. */
  includeCountryEmergencyPhones?: boolean;
}): HouseGuideEssentialsSeed {
  const selected = pickSelectedPlaces(input.essentialsBySlot, input.selectedEssentialKeys);

  const emergencyContacts: GuideEmergencyPin[] = [];
  const usefulLocations: GuidePlacePin[] = [];
  const transportationPlaces: GuidePlacePin[] = [];

  for (const place of selected) {
    if (place.section === 'safety') {
      const category =
        SAFETY_SLOT_TO_CATEGORY[place.slotId] ||
        matchEmergencyOption(place.label || place.name);
      emergencyContacts.push({
        ...placeToPin(place),
        category,
      });
    } else if (place.section === 'useful') {
      usefulLocations.push(placeToPin(place, usefulTitleForPlace(place)));
    } else if (place.section === 'transport') {
      transportationPlaces.push(placeToPin(place, transportTitleForPlace(place)));
    }
  }

  if (input.includeCountryEmergencyPhones !== false) {
    const phones = getCountryEmergencyNumbers(String(input.country || ''));
    const existingPhones = new Set(
      emergencyContacts.map((c) => String(c.phone || '').replace(/\s/g, ''))
    );
    for (const contact of emergencyPhonesToContacts(phones)) {
      const key = String(contact.phone || '').replace(/\s/g, '');
      if (key && existingPhones.has(key)) continue;
      if (key) existingPhones.add(key);
      emergencyContacts.push(contact);
    }
  }

  return {
    emergencyContacts,
    usefulLocations,
    transportationPlaces,
  };
}

/** Flatten seed into House Guide form field keys for merge/save. */
export function houseGuideSeedToFormPatch(
  seed: HouseGuideEssentialsSeed
): Record<string, GuideEmergencyPin[] | GuidePlacePin[]> {
  return {
    emergencyContacts: seed.emergencyContacts,
    usefulLocations: seed.usefulLocations,
    transportationPlaces: seed.transportationPlaces,
  };
}
