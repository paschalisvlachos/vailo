/**
 * Delete a property listing (and optional empty parent property).
 * Add Property creates property + listing together — deleting the last listing
 * must also remove the portfolio property shell.
 */

import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from './firebase';

async function deleteListingHouseGuide(propertyId: string, listingId: string): Promise<void> {
  try {
    await deleteDoc(
      doc(db, 'properties', propertyId, 'propertyTypes', listingId, 'houseGuide', 'data')
    );
  } catch {
    // House Guide doc may not exist.
  }
}

export async function deletePropertyListing(opts: {
  propertyId: string;
  listingId: string;
  /** Default true: if no listings remain, delete the parent `properties/{id}` too. */
  deleteEmptyProperty?: boolean;
}): Promise<{ deletedProperty: boolean }> {
  const { propertyId, listingId, deleteEmptyProperty = true } = opts;

  await deleteListingHouseGuide(propertyId, listingId);
  await deleteDoc(doc(db, 'properties', propertyId, 'propertyTypes', listingId));

  if (!deleteEmptyProperty) {
    return { deletedProperty: false };
  }

  const remaining = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
  if (!remaining.empty) {
    return { deletedProperty: false };
  }

  await deleteDoc(doc(db, 'properties', propertyId));
  return { deletedProperty: true };
}

/** Delete a portfolio property and all of its listings (cascading). */
export async function deletePropertyWithListings(propertyId: string): Promise<void> {
  const listings = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
  for (const listing of listings.docs) {
    await deleteListingHouseGuide(propertyId, listing.id);
    await deleteDoc(listing.ref);
  }
  await deleteDoc(doc(db, 'properties', propertyId));
}
