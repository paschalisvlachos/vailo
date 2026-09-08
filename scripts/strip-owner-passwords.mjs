/**
 * Deletes plaintext `password` fields from all `owners` docs.
 * Login uses Firebase Auth only — owners.password is unused and unsafe.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./vailo-staging-key.json \
 *   GCLOUD_PROJECT=vailo-staging \
 *   node scripts/strip-owner-passwords.mjs
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   GCLOUD_PROJECT=vailoapp-497113 \
 *   node scripts/strip-owner-passwords.mjs
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  '';

if (!projectId) {
  console.error('Set GCLOUD_PROJECT to vailo-staging or vailoapp-497113.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();

async function main() {
  console.log(`Stripping owners.password in ${projectId}…`);
  const snap = await db.collection('owners').get();
  let updated = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    if (!Object.prototype.hasOwnProperty.call(docSnap.data() || {}, 'password')) {
      skipped += 1;
      continue;
    }
    await docSnap.ref.update({
      password: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });
    updated += 1;
  }

  console.log(`owners: ${snap.size}, removed: ${updated}, already clean: ${skipped}`);
  console.log('Firebase Auth passwords were not changed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
