/**
 * Seeds platformSettings/legal in Firestore with English legal templates from src/content/legal/.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run seed:legal
 *
 * Optional:
 *   LEGAL_SEED_LOCALE=en   (default: en)
 *   FIREBASE_PROJECT_ID=your-project
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const legalDir = join(__dirname, '..', 'src', 'content', 'legal');
const locale = String(process.env.LEGAL_SEED_LOCALE || 'en').trim().toLowerCase() || 'en';

function readLegal(name) {
  const path = join(legalDir, locale, name);
  return readFileSync(path, 'utf8');
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : {}),
  });
}

const db = getFirestore();

const privacyPolicy = readLegal('privacy-policy.html');
const termsOfUse = readLegal('terms-of-use.html');
const propertyOwnerAgreement = readLegal('owner-agreement.html');
const agencyAgreement = readLegal('agency-agreement.html');
const excursionProviderAgreement = readLegal('excursion-provider-agreement.html');

const agreementsByKind = {
  property_owner: { [locale]: propertyOwnerAgreement },
  agency: { [locale]: agencyAgreement },
  excursion_provider: { [locale]: excursionProviderAgreement },
};

const payload = {
  privacyPolicyByLocale: { [locale]: privacyPolicy },
  termsOfUseByLocale: { [locale]: termsOfUse },
  agreementsByKind,
  updatedAt: FieldValue.serverTimestamp(),
};

if (locale === 'en') {
  payload.privacyPolicy = privacyPolicy;
  payload.termsOfUse = termsOfUse;
  payload.agreement = propertyOwnerAgreement;
  payload.agreementByLocale = { [locale]: propertyOwnerAgreement };
}

await db.collection('platformSettings').doc('legal').set(payload, { merge: true });

console.log(`platformSettings/legal updated for locale "${locale}".`);
console.log(`  Privacy Policy: ${privacyPolicy.length} chars`);
console.log(`  Terms of Use: ${termsOfUse.length} chars`);
console.log(`  Property owner agreement: ${propertyOwnerAgreement.length} chars`);
console.log(`  Agency agreement: ${agencyAgreement.length} chars`);
console.log(`  Excursion provider agreement: ${excursionProviderAgreement.length} chars`);
