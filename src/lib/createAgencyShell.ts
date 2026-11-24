/**
 * Create an agency portfolio shell (`properties/{id}`) without a listing.
 * Used by platform admin Agencies management.
 */

import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { formatGuestSlug, slugFromPropertyTypeName } from './guestPortalSlug';
import {
  ensureUniqueInternalRefCode,
  ensureUniquePropertySlug,
  generateInternalRefCode,
  loadPropertyIdentityIndex,
} from './propertyIdentityUniqueness';
import { clearPropertyTypeAreaContextCache } from './listingAreaContext';
import {
  parseMaxListings,
  UNLIMITED_LISTINGS,
} from './ownerListingQuota';

export type CreateAgencyShellInput = {
  agencyName: string;
  /** Optional assigned agent / owner (portfolio manager). */
  ownerId?: string | null;
  country?: string;
  areaName?: string;
  urlSlug?: string;
  internalRefCode?: string;
  /** Listing capacity for the assigned agent/owner (number, -1, or "unlimited"). */
  maxListings?: string | number | null;
  guestPortalAccessRequired?: boolean;
  preArrivalCheckInEnabled?: boolean;
  calendarSyncEnabled?: boolean;
  reservationSplitEnabled?: boolean;
};

export type CreateAgencyShellResult = {
  propertyId: string;
  urlSlug: string;
  propertyName: string;
};

export async function createAgencyShell(
  input: CreateAgencyShellInput
): Promise<CreateAgencyShellResult> {
  const propertyName = String(input.agencyName || '').trim();
  if (!propertyName) {
    throw new Error('Agency name is required.');
  }

  const country = String(input.country || '').trim() || 'Greece';
  const areaName = String(input.areaName || '').trim();
  const ownerId = String(input.ownerId || '').trim() || null;
  const maxListings = parseMaxListings(input.maxListings);

  const identityIndex = await loadPropertyIdentityIndex();
  const desiredSlug =
    String(input.urlSlug || '').trim() ||
    slugFromPropertyTypeName(propertyName) ||
    propertyName;
  const uniqueSlug = ensureUniquePropertySlug(desiredSlug, identityIndex, null);
  const desiredRef =
    String(input.internalRefCode || '').trim() || generateInternalRefCode();
  const uniqueRef = ensureUniqueInternalRefCode(desiredRef, identityIndex, null);
  const urlSlug = formatGuestSlug(uniqueSlug.value);

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    propertyName,
    urlSlug,
    previousUrlSlugs: [],
    internalRefCode: uniqueRef.value,
    listingKind: 'property',
    country,
    guestPortalAccessRequired: input.guestPortalAccessRequired === true,
    preArrivalCheckInEnabled: input.preArrivalCheckInEnabled !== false,
    calendarSyncEnabled: input.calendarSyncEnabled === true,
    reservationSplitEnabled: input.reservationSplitEnabled === true,
    createdAt: now,
    updatedAt: now,
  };
  if (areaName) {
    payload.area = areaName;
    payload.city = areaName;
  }
  if (ownerId) {
    payload.ownerId = ownerId;
  }
  if (maxListings != null) {
    payload.maxListings = maxListings;
  }

  const created = await addDoc(collection(db, 'properties'), payload);

  if (ownerId && maxListings != null) {
    await updateDoc(doc(db, 'owners', ownerId), {
      maxListings: maxListings === UNLIMITED_LISTINGS ? UNLIMITED_LISTINGS : maxListings,
      updatedAt: now,
    });
  }

  if (areaName) {
    clearPropertyTypeAreaContextCache(country, areaName);
  }

  return {
    propertyId: created.id,
    urlSlug,
    propertyName,
  };
}
