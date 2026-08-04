/**
 * Seeds the vailo-staging Firestore database with mock CRM data and Firebase Auth logins.
 * Safe to re-run: only touches documents tagged with seedTag = "vailo-staging-seed".
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run seed:staging
 */
import 'dotenv/config';
import { applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { faker } from '@faker-js/faker';

const SEED_TAG = 'vailo-staging-seed';
const BATCH_SIZE = 400;

const ADMIN_EMAIL = String(process.env.STAGING_ADMIN_EMAIL || 'admin@staging.vailo.app').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.STAGING_ADMIN_PASSWORD || 'StagingAdmin123!');
const OWNER_EMAIL = String(process.env.STAGING_OWNER_EMAIL || 'owner@staging.vailo.app').trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.STAGING_OWNER_PASSWORD || 'StagingOwner123!');

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();
const auth = getAuth();

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function deleteQueryDocs(query) {
  const snap = await query.get();
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = db.batch();
  let ops = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    ops += 1;
    deleted += 1;

    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return deleted;
}

async function clearPreviousSeedData() {
  console.log('Clearing previous staging seed data...');

  const propertiesSnap = await db.collection('properties').where('seedTag', '==', SEED_TAG).get();
  for (const propertyDoc of propertiesSnap.docs) {
    const typesSnap = await propertyDoc.ref.collection('propertyTypes').get();
    if (!typesSnap.empty) {
      let batch = db.batch();
      let ops = 0;
      for (const typeDoc of typesSnap.docs) {
        batch.delete(typeDoc.ref);
        ops += 1;
        if (ops >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }
    await propertyDoc.ref.delete();
  }

  const ownersDeleted = await deleteQueryDocs(
    db.collection('owners').where('seedTag', '==', SEED_TAG)
  );

  console.log(`Removed ${propertiesSnap.size} properties and ${ownersDeleted} owners.`);
}

async function upsertAuthUser({ email, password, displayName }) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      displayName,
      disabled: false,
    });
    return existing.uid;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return created.uid;
  }
}

async function seedOwners() {
  console.log('Creating staging owners and auth users...');

  const adminUid = await upsertAuthUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    displayName: 'Staging Admin',
  });

  const ownerUid = await upsertAuthUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    displayName: 'Staging Villa Owner',
  });

  const adminRef = db.collection('owners').doc('staging_admin');
  await adminRef.set({
    fullName: 'Staging Admin',
    email: ADMIN_EMAIL,
    role: 'admin',
    status: 'active',
    company: 'Vailo Staging',
    authUid: adminUid,
    authProvisionedAt: new Date().toISOString(),
    seedTag: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
  });

  const ownerRef = db.collection('owners').doc('staging_owner');
  await ownerRef.set({
    fullName: 'Staging Villa Owner',
    email: OWNER_EMAIL,
    role: 'owner',
    status: 'active',
    company: faker.company.name(),
    authUid: ownerUid,
    authProvisionedAt: new Date().toISOString(),
    seedTag: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
  });

  const agentRef = db.collection('owners').doc('staging_agent');
  await agentRef.set({
    fullName: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    role: 'agent',
    status: 'active',
    company: faker.company.name(),
    seedTag: SEED_TAG,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { adminRef, ownerRef, agentRef };
}

async function seedProperties(ownerRef) {
  console.log('Creating staging properties and listings...');

  const propertyNames = [
    'Aegean Sunset Villa',
    'Olive Grove Retreat',
    'Coastal Pearl House',
  ];
  const listingNames = ['Main Villa', 'Garden Suite', 'Pool House'];

  for (let i = 0; i < propertyNames.length; i += 1) {
    const propertyName = propertyNames[i];
    const urlSlug = slugify(propertyName);
    const propertyRef = db.collection('properties').doc(`staging_property_${i}`);

    await propertyRef.set({
      propertyName,
      urlSlug,
      internalRefCode: `STG-${String(i + 1).padStart(3, '0')}`,
      ownerId: ownerRef.id,
      listingKind: 'property',
      country: 'Greece',
      area: 'Paros',
      guestPortalAccessRequired: false,
      seedTag: SEED_TAG,
      createdAt: FieldValue.serverTimestamp(),
    });

    const listingName = listingNames[i];
    const listingSlug = slugify(listingName);

    await propertyRef.collection('propertyTypes').doc(`staging_listing_${i}`).set({
      propertyTypeName: listingName,
      urlSlug: listingSlug,
      ownerId: ownerRef.id,
      country: 'Greece',
      area: 'Paros',
      city: 'Naousa',
      addressLine: faker.location.streetAddress(),
      postCode: faker.location.zipCode(),
      latitude: faker.location.latitude({ min: 37.0, max: 37.2 }).toFixed(6),
      longitude: faker.location.longitude({ min: 25.1, max: 25.3 }).toFixed(6),
      wifiName: `VailoGuest-${i + 1}`,
      wifiPassword: faker.internet.password({ length: 10 }),
      whatsapp: '+306900000000',
      internalRefCode: `STG-L${String(i + 1).padStart(3, '0')}`,
      seedTag: SEED_TAG,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

async function seedDatabase() {
  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || getApp().options.projectId;
  console.log(`Seeding staging database (project: ${projectId || 'unknown'})...`);

  await clearPreviousSeedData();
  const { ownerRef } = await seedOwners();
  await seedProperties(ownerRef);

  console.log('');
  console.log('Staging database seeded successfully.');
  console.log('');
  console.log('Test logins:');
  console.log(`  Platform admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Property owner: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log('');
  console.log('Guest portal examples (after deploy):');
  console.log('  /aegean-sunset-villa/main-villa');
  console.log('  /olive-grove-retreat/garden-suite');
  console.log('  /coastal-pearl-house/pool-house');
}

seedDatabase().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
