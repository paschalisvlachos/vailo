/**
 * Clones production Firestore (and Firebase Auth) into vailo-staging.
 * Used by the staging GitHub Actions workflow after each deploy.
 *
 * Requires two service account keys:
 *   GOOGLE_APPLICATION_CREDENTIALS_PRODUCTION  — read access to vailoapp-497113
 *   GOOGLE_APPLICATION_CREDENTIALS_STAGING     — write access to vailo-staging
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS_PRODUCTION=./prod.json \
 *   GOOGLE_APPLICATION_CREDENTIALS_STAGING=./staging.json \
 *   npm run clone:staging
 *
 * Note: Area Functionality often lives under `countries/{country}/areas/{areaId}`
 * where the country parent document was never created. A normal collection walk
 * skips those trees — this script also wipes/copies them via collectionGroup('areas').
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const PRODUCTION_PROJECT_ID = 'vailoapp-497113';
const STAGING_PROJECT_ID = 'vailo-staging';
const PAGE_SIZE = 300;
const BATCH_SIZE = 400;

const prodCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS_PRODUCTION;
const stagingCredPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS_STAGING || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!prodCredPath || !stagingCredPath) {
  console.error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS_PRODUCTION and GOOGLE_APPLICATION_CREDENTIALS_STAGING.'
  );
  process.exit(1);
}

function loadCert(path) {
  return cert(JSON.parse(readFileSync(path, 'utf8')));
}

function initApps() {
  const prodApp = initializeApp(
    { credential: loadCert(prodCredPath), projectId: PRODUCTION_PROJECT_ID },
    'production'
  );
  const stagingApp = initializeApp(
    { credential: loadCert(stagingCredPath), projectId: STAGING_PROJECT_ID },
    'staging'
  );

  return {
    prodDb: getFirestore(prodApp),
    stagingDb: getFirestore(stagingApp),
  };
}

async function listRootCollections(db) {
  return db.listCollections();
}

/** `countries/{country}/areas/{areaId}` → { country, areaId } or null. */
function parseCountryAreaPath(path) {
  const segments = path.split('/');
  if (segments.length !== 4 || segments[0] !== 'countries' || segments[2] !== 'areas') {
    return null;
  }
  return { country: segments[1], areaId: segments[3] };
}

async function deleteDocumentTree(docRef) {
  const subcollections = await docRef.listCollections();
  for (const subcol of subcollections) {
    await deleteCollection(subcol);
  }
  await docRef.delete();
}

async function deleteCollection(collectionRef) {
  while (true) {
    const snap = await collectionRef.limit(PAGE_SIZE).get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      await deleteDocumentTree(docSnap.ref);
    }
  }
}

/**
 * Firestore can store subcollections under a path whose parent document does not
 * exist. Root-collection wipes miss those trees — delete them via collectionGroup.
 */
async function wipeOrphanCountryAreas(stagingDb) {
  console.log('  deleting orphan countries/*/areas (missing country parents)...');
  const snap = await stagingDb.collectionGroup('areas').get();
  let deleted = 0;

  for (const docSnap of snap.docs) {
    const parsed = parseCountryAreaPath(docSnap.ref.path);
    if (!parsed) continue;

    await deleteDocumentTree(docSnap.ref);
    deleted += 1;
    console.log(`    deleted /countries/${parsed.country}/areas/${parsed.areaId}`);
  }

  console.log(`  deleted ${deleted} orphan area tree(s)`);
}

async function wipeStagingDatabase(stagingDb) {
  console.log('Wiping staging Firestore...');
  const collections = await listRootCollections(stagingDb);
  for (const col of collections) {
    console.log(`  deleting /${col.id}`);
    await deleteCollection(col);
  }
  // Orphan area trees survive a root walk when the country parent doc is missing.
  await wipeOrphanCountryAreas(stagingDb);
}

async function copyCollectionTree(prodColRef, stagingColRef, stagingDb) {
  let lastDoc = null;

  while (true) {
    let query = prodColRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc.id);

    const snap = await query.get();
    if (snap.empty) break;

    let batch = stagingDb.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      batch.set(stagingColRef.doc(docSnap.id), docSnap.data());
      ops += 1;

      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = stagingDb.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();

    for (const docSnap of snap.docs) {
      const subcollections = await docSnap.ref.listCollections();
      for (const subcol of subcollections) {
        await copyCollectionTree(
          subcol,
          stagingColRef.doc(docSnap.id).collection(subcol.id),
          stagingDb
        );
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
}

async function ensureCountryParentDoc(prodDb, stagingDb, country) {
  const prodCountryRef = prodDb.collection('countries').doc(country);
  const stagingCountryRef = stagingDb.collection('countries').doc(country);
  const prodCountrySnap = await prodCountryRef.get();

  if (prodCountrySnap.exists) {
    await stagingCountryRef.set(prodCountrySnap.data(), { merge: true });
    return;
  }

  // Materialize a stub so future root walks (and admin UI) see the country.
  await stagingCountryRef.set(
    {
      name: country,
      createdAt: new Date().toISOString(),
      clonedAsStub: true,
    },
    { merge: true }
  );
}

/**
 * Copy every `countries/{country}/areas/{areaId}` tree, including areas whose
 * country parent document does not exist in production.
 */
async function copyCountryAreaTrees(prodDb, stagingDb) {
  console.log('  copying countries/*/areas (including missing country parents)...');
  const snap = await prodDb.collectionGroup('areas').get();
  let copied = 0;

  for (const docSnap of snap.docs) {
    const parsed = parseCountryAreaPath(docSnap.ref.path);
    if (!parsed) continue;

    const { country, areaId } = parsed;
    await ensureCountryParentDoc(prodDb, stagingDb, country);

    const stagingAreaRef = stagingDb.collection('countries').doc(country).collection('areas').doc(areaId);
    await stagingAreaRef.set(docSnap.data());

    const subcollections = await docSnap.ref.listCollections();
    for (const subcol of subcollections) {
      await copyCollectionTree(subcol, stagingAreaRef.collection(subcol.id), stagingDb);
    }

    copied += 1;
    console.log(`    /countries/${country}/areas/${areaId}`);
  }

  console.log(`  copied ${copied} area tree(s)`);
}

async function cloneFirestore(prodDb, stagingDb) {
  console.log(`Cloning Firestore ${PRODUCTION_PROJECT_ID} → ${STAGING_PROJECT_ID}...`);

  await wipeStagingDatabase(stagingDb);

  const prodCollections = await listRootCollections(prodDb);
  for (const col of prodCollections) {
    console.log(`  copying /${col.id}`);
    await copyCollectionTree(col, stagingDb.collection(col.id), stagingDb);
  }

  // Area Functionality under phantom country parents is invisible to the walk above.
  await copyCountryAreaTrees(prodDb, stagingDb);

  console.log('Firestore clone complete.');
}

function cloneAuthUsers() {
  if (process.env.CLONE_SKIP_AUTH === '1') {
    console.log('Skipping Firebase Auth clone (CLONE_SKIP_AUTH=1).');
    return;
  }

  const exportPath = '/tmp/vailo-auth-export.json';

  console.log(`Cloning Firebase Auth ${PRODUCTION_PROJECT_ID} → ${STAGING_PROJECT_ID}...`);

  execSync(
    `firebase auth:export ${exportPath} --format=json --project ${PRODUCTION_PROJECT_ID} --non-interactive`,
    {
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: prodCredPath },
      stdio: 'inherit',
    }
  );

  execSync(
    `firebase auth:import ${exportPath} --project ${STAGING_PROJECT_ID} --non-interactive`,
    {
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: stagingCredPath },
      stdio: 'inherit',
    }
  );

  console.log('Firebase Auth clone complete.');
}

async function main() {
  console.log('Starting production → staging database clone...');
  console.log(`  Production: ${PRODUCTION_PROJECT_ID}`);
  console.log(`  Staging:    ${STAGING_PROJECT_ID}`);
  console.log('');

  const { prodDb, stagingDb } = initApps();

  await cloneFirestore(prodDb, stagingDb);
  cloneAuthUsers();

  console.log('');
  console.log('Staging now mirrors production data.');
  console.log('Use the same admin emails/passwords as production to sign in.');
  console.log('');
  console.log('Note: Firebase Storage files are not copied — listing photos may still');
  console.log('point at production bucket URLs until re-uploaded on staging.');
}

main()
  .catch((error) => {
    console.error('Clone failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
  });
