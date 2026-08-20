/**
 * Creates or resets a Firebase Auth login and links authUid on the owners doc.
 *
 * Production:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   LOGIN_EMAIL=villapetra.maza@gmail.com \
 *   LOGIN_PASSWORD='YourPassword123!' \
 *   npm run provision:login
 *
 * Staging (same script, different project):
 *   GOOGLE_APPLICATION_CREDENTIALS=./vailo-staging-key.json \
 *   GCLOUD_PROJECT=vailo-staging \
 *   LOGIN_EMAIL=you@example.com \
 *   LOGIN_PASSWORD='YourPassword123!' \
 *   npm run provision:login
 */
import 'dotenv/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const email = String(process.env.LOGIN_EMAIL || process.env.STAGING_LOGIN_EMAIL || '')
  .trim()
  .toLowerCase();
const password = String(process.env.LOGIN_PASSWORD || process.env.STAGING_LOGIN_PASSWORD || '').trim();
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  'vailoapp-497113';

if (!email || !password) {
  console.error('Set LOGIN_EMAIL and LOGIN_PASSWORD (min 6 characters).');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();
const auth = getAuth();

async function findOwnerByEmail(targetEmail) {
  const normalized = targetEmail.trim().toLowerCase();
  for (const candidate of [normalized, targetEmail.trim()]) {
    const snap = await db.collection('owners').where('email', '==', candidate).limit(5).get();
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

async function upsertAuthUser({ userEmail, userPassword, displayName, disabled }) {
  try {
    const existing = await auth.getUserByEmail(userEmail);
    await auth.updateUser(existing.uid, {
      password: userPassword,
      displayName: displayName || existing.displayName,
      disabled,
      emailVerified: true,
    });
    return existing.uid;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({
      email: userEmail,
      password: userPassword,
      displayName: displayName || undefined,
      emailVerified: true,
      disabled,
    });
    return created.uid;
  }
}

async function main() {
  console.log(`Provisioning login on ${projectId} for ${email}…`);

  const ownerDoc = await findOwnerByEmail(email);
  const ownerStatus = String(ownerDoc?.data()?.status || 'active').trim().toLowerCase();
  const disabled = ownerStatus === 'deactive';

  const uid = await upsertAuthUser({
    userEmail: email,
    userPassword: password,
    displayName: ownerDoc?.data()?.fullName,
    disabled,
  });

  if (ownerDoc) {
    await ownerDoc.ref.set(
      {
        authUid: uid,
        email,
        authProvisionedAt: new Date().toISOString(),
        password,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(
      `Linked Auth user to owner ${ownerDoc.id} (role: ${ownerDoc.data()?.role || 'unknown'}, status: ${ownerStatus}).`
    );
  } else {
    console.warn('No owners doc found for this email — Firebase Auth user was created/updated only.');
    console.warn('Create the user in Owners CRM or fix the email spelling.');
  }

  console.log('');
  console.log('Done. Sign in at https://vailo.app/admin');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: (value from LOGIN_PASSWORD)`);
  if (disabled) {
    console.warn('  Note: owner status is deactive — set to active in CRM or login will be blocked.');
  }
}

main().catch((error) => {
  console.error('Provision failed:', error?.message || error);
  process.exitCode = 1;
});
