/**
 * Add a property listing from the Add Property wizard.
 *
 * Capacity agents/owners already have (or get) one portfolio shell — the agency.
 * Add Property only creates a listing under that shell; it must never name the
 * shell after the listing.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { ensurePersistablePhotoUrl } from './adminPhotoUrl';
import { ensureAreaDocument } from './ensureAreaDocument';
import { formatGuestSlug, slugFromPropertyTypeName } from './guestPortalSlug';
import { DEFAULT_PRIMARY_LOCALE } from './propertyContentLocales';
import {
  ensureUniqueInternalRefCode,
  ensureUniquePropertySlug,
  generateInternalRefCode,
  loadPropertyIdentityIndex,
} from './propertyIdentityUniqueness';
import { serializeGuideFormDataForSave } from './houseGuideLocales';
import {
  houseGuideSeedToFormPatch,
  type HouseGuideEssentialsSeed,
} from './mapEssentialsToHouseGuide';
import { buildListingOnboardingSeedText, type WizardListingDraft } from './wizardListingOnboarding';
import { pasteGemsToListing } from './propertyGemCopy';
import { db } from './firebase';

export type CreatePropertyFromAddDraftInput = {
  listingDraft: WizardListingDraft;
  photoFile: File | null;
  houseGuideSeed: HouseGuideEssentialsSeed | null;
  /** Area / selected local gems to copy onto the new listing. */
  selectedLocalGems?: Record<string, unknown>[];
  /** Agent/owner creating from capacity — assigned as portfolio manager. */
  ownerId?: string;
  /** Agency / portfolio display name for the shell (company or agent name). */
  agencyName?: string;
  /** End-owner self-allocate on the listing. */
  listingOwnerId?: string;
  /** Attach listing under an existing parent property (agency portfolio). */
  existingPropertyId?: string;
};

export type CreatePropertyFromAddDraftResult = {
  propertyId: string;
  listingId: string;
  seedText: string;
  propertySlug: string;
};

type AgencyShell = {
  id: string;
  urlSlug: string;
};

/** If the portfolio shell was wrongly named after a listing (or left empty), rename it to the agency. */
export async function repairAgencyPortfolioNameIfNeeded(opts: {
  propertyId: string;
  currentName: string;
  agencyName: string;
}): Promise<boolean> {
  const name = opts.agencyName.trim();
  const current = opts.currentName.trim();
  if (!name || !current || current === name) return false;

  const listings = await getDocs(
    collection(db, 'properties', opts.propertyId, 'propertyTypes')
  );
  const listingNames = new Set(
    listings.docs
      .map((d) => String(d.data().propertyTypeName || '').trim())
      .filter(Boolean)
  );
  // Rename when shell title equals a listing title, or shell has no listings left.
  if (!listings.empty && !listingNames.has(current)) return false;

  await updateDoc(doc(db, 'properties', opts.propertyId), { propertyName: name });
  return true;
}

async function resolveAgencyPortfolioShell(opts: {
  ownerId: string;
  agencyName: string;
  country: string;
  areaName: string;
}): Promise<AgencyShell> {
  const agencyName =
    opts.agencyName.trim() ||
    'Agency portfolio';

  const snap = await getDocs(
    query(collection(db, 'properties'), where('ownerId', '==', opts.ownerId))
  );

  if (!snap.empty) {
    // Oldest shell wins as the canonical agency portfolio.
    const sorted = [...snap.docs].sort((a, b) => {
      const aAt = String(a.data().createdAt || '');
      const bAt = String(b.data().createdAt || '');
      return aAt.localeCompare(bAt);
    });
    const primary = sorted[0];
    const data = primary.data();
    await repairAgencyPortfolioNameIfNeeded({
      propertyId: primary.id,
      currentName: String(data.propertyName || ''),
      agencyName,
    });
    return {
      id: primary.id,
      urlSlug: formatGuestSlug(String(data.urlSlug || '')) || primary.id,
    };
  }

  const identityIndex = await loadPropertyIdentityIndex();
  const desiredSlug = slugFromPropertyTypeName(agencyName) || agencyName;
  const uniqueSlug = ensureUniquePropertySlug(desiredSlug, identityIndex, null);
  const uniqueRef = ensureUniqueInternalRefCode(generateInternalRefCode(), identityIndex, null);
  const urlSlug = formatGuestSlug(uniqueSlug.value);

  const created = await addDoc(collection(db, 'properties'), {
    propertyName: agencyName,
    urlSlug,
    previousUrlSlugs: [],
    internalRefCode: uniqueRef.value,
    listingKind: 'property',
    country: opts.country.trim(),
    area: opts.areaName,
    city: opts.areaName,
    guestPortalAccessRequired: false,
    preArrivalCheckInEnabled: true,
    calendarSyncEnabled: false,
    reservationSplitEnabled: false,
    ownerId: opts.ownerId,
    createdAt: new Date().toISOString(),
  });

  return { id: created.id, urlSlug };
}

export async function createPropertyFromAddDraft(
  input: CreatePropertyFromAddDraftInput
): Promise<CreatePropertyFromAddDraftResult> {
  const listingDraft = input.listingDraft;

  const listingDisplayName =
    listingDraft.propertyTypeName.trim() ||
    [listingDraft.area, listingDraft.city].map((p) => p.trim()).filter(Boolean).join(' ') ||
    'New listing';

  const latNum = listingDraft.latitude ? Number(listingDraft.latitude) : undefined;
  const lngNum = listingDraft.longitude ? Number(listingDraft.longitude) : undefined;
  const ensuredArea = await ensureAreaDocument({
    country: listingDraft.country,
    areaName: listingDraft.city,
    lat: Number.isFinite(latNum) ? latNum : undefined,
    lng: Number.isFinite(lngNum) ? lngNum : undefined,
  });

  let propertyId: string;
  let propertySlug: string;

  const existingPropertyId = String(input.existingPropertyId || '').trim();
  if (existingPropertyId) {
    const shellSnap = await getDoc(doc(db, 'properties', existingPropertyId));
    if (!shellSnap.exists()) {
      throw new Error('Selected parent property was not found.');
    }
    propertyId = existingPropertyId;
    propertySlug = formatGuestSlug(String(shellSnap.data()?.urlSlug || existingPropertyId));
  } else if (input.ownerId) {
    const shell = await resolveAgencyPortfolioShell({
      ownerId: input.ownerId,
      agencyName: input.agencyName || '',
      country: listingDraft.country,
      areaName: ensuredArea.areaName,
    });
    propertyId = shell.id;
    propertySlug = shell.urlSlug;
  } else {
    // Platform / unassigned create: still need a shell, but name it as agency when provided.
    const identityIndex = await loadPropertyIdentityIndex();
    const shellName = input.agencyName?.trim() || listingDisplayName;
    const desiredSlug =
      listingDraft.urlSlug.trim() ||
      slugFromPropertyTypeName(shellName) ||
      shellName;
    const uniqueSlug = ensureUniquePropertySlug(desiredSlug, identityIndex, null);
    const uniqueRef = ensureUniqueInternalRefCode(generateInternalRefCode(), identityIndex, null);
    propertySlug = formatGuestSlug(uniqueSlug.value);

    const propertyRef = await addDoc(collection(db, 'properties'), {
      propertyName: shellName,
      urlSlug: propertySlug,
      previousUrlSlugs: [],
      internalRefCode: uniqueRef.value,
      listingKind: 'property',
      country: listingDraft.country.trim(),
      area: ensuredArea.areaName,
      city: ensuredArea.areaName,
      guestPortalAccessRequired: false,
      preArrivalCheckInEnabled: true,
      calendarSyncEnabled: false,
      reservationSplitEnabled: false,
      createdAt: new Date().toISOString(),
    });
    propertyId = propertyRef.id;
  }

  let finalPhotoUrl = listingDraft.photoUrl;
  if (input.photoFile) {
    const storage = getStorage();
    const fileRef = ref(
      storage,
      `propertyTypes/${propertyId}/${Date.now()}_${input.photoFile.name}`
    );
    await uploadBytes(fileRef, input.photoFile);
    finalPhotoUrl = await getDownloadURL(fileRef);
  } else if (finalPhotoUrl) {
    finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
      googlePlaceId: listingDraft.googlePlaceId,
      docId: propertyId,
    });
  }

  const listingSlug =
    formatGuestSlug(listingDraft.urlSlug) ||
    slugFromPropertyTypeName(listingDraft.propertyTypeName) ||
    slugFromPropertyTypeName(listingDisplayName) ||
    `listing-${Date.now().toString(36)}`;

  const referenceUrls = (listingDraft.referenceUrls || [])
    .map((u) => u.trim())
    .filter(Boolean);
  const primaryListingUrl = referenceUrls[0] || '';

  const listingRef = await addDoc(
    collection(db, 'properties', propertyId, 'propertyTypes'),
    {
      propertyTypeName: listingDisplayName,
      urlSlug: listingSlug,
      typeSlug: listingSlug,
      previousUrlSlugs: [],
      listingUrl: primaryListingUrl,
      referenceUrls,
      airbnbUrl: '',
      bookingUrl: '',
      googleMapsUrl: listingDraft.googleMapsUrl.trim(),
      iCalUrl: listingDraft.iCalUrl.trim(),
      addressLine: listingDraft.addressLine.trim(),
      country: listingDraft.country.trim(),
      city: ensuredArea.areaName,
      area: listingDraft.area.trim(),
      postCode: listingDraft.postCode.trim(),
      latitude: listingDraft.latitude,
      longitude: listingDraft.longitude,
      googlePlaceId: listingDraft.googlePlaceId,
      googleRating: listingDraft.googleRating,
      photoUrl: finalPhotoUrl,
      wifiName: listingDraft.wifiName.trim(),
      wifiPassword: listingDraft.wifiPassword.trim(),
      whatsapp: listingDraft.whatsapp.trim(),
      phone: String(listingDraft.phone || '').trim(),
      internalRefCode:
        listingDraft.internalRefCode.trim() ||
        `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      ownerId: input.listingOwnerId || '',
      onboardingNotes: listingDraft.onboardingNotes.trim(),
      createdAt: new Date().toISOString(),
    }
  );

  if (input.houseGuideSeed) {
    const patch = houseGuideSeedToFormPatch(input.houseGuideSeed);
    const payload = serializeGuideFormDataForSave(patch, DEFAULT_PRIMARY_LOCALE);
    await setDoc(
      doc(db, 'properties', propertyId, 'propertyTypes', listingRef.id, 'houseGuide', 'data'),
      {
        ...payload,
        updatedAt: new Date().toISOString(),
        seededFromAddProperty: true,
      },
      { merge: true }
    );
  }

  const gemsToPaste = (input.selectedLocalGems || []).filter(
    (gem) => String(gem.name || gem.businessName || '').trim()
  );
  if (gemsToPaste.length > 0) {
    try {
      await pasteGemsToListing({
        gems: gemsToPaste,
        propertyId,
        typeId: listingRef.id,
        propertyName: input.agencyName?.trim() || listingDisplayName,
        listingLabel: listingDisplayName,
        targetType: {
          latitude: listingDraft.latitude,
          longitude: listingDraft.longitude,
          country: listingDraft.country.trim(),
          city: ensuredArea.areaName,
        },
      });
    } catch (gemErr) {
      console.warn('[Vailo] Failed to paste selected local gems onto new listing:', gemErr);
    }
  }

  const seedText = buildListingOnboardingSeedText({
    ...listingDraft,
    city: ensuredArea.areaName,
  });

  return {
    propertyId,
    listingId: listingRef.id,
    seedText,
    propertySlug,
  };
}
