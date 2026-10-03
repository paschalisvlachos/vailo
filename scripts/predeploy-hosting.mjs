/**
 * Firebase hosting predeploy hook.
 * Skipped when CI (or a local staging deploy) already built `dist/`.
 */
import { execSync } from 'node:child_process';

if (process.env.CI === 'true' || process.env.SKIP_FIREBASE_PREDEPLOY === '1') {
  console.log('predeploy-hosting: skipping build (already built dist/)');
  process.exit(0);
}

execSync('npm run build', { stdio: 'inherit' });
