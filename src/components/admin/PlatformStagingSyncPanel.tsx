import { useState } from 'react';
import { Database, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { httpsCallableMessage } from '../../lib/callableError';
import { isStagingEnv } from '../../lib/firebase';
import {
  STAGING_ADMIN_URL,
  STAGING_SYNC_ACTIONS_URL,
  triggerStagingDatabaseSyncCallable,
} from '../../lib/stagingSync';
import { AdminAlert, AdminButton, AdminCard } from './AdminPageHeader';

export default function PlatformStagingSyncPanel() {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (
      !window.confirm(
        'Copy the live production database to staging? This replaces all staging Firestore data and auth users. It may take several minutes.'
      )
    ) {
      return;
    }

    setSyncing(true);
    try {
      const result = await triggerStagingDatabaseSyncCallable();
      toast.success('Staging sync started. Track progress on GitHub Actions.');
      window.open(result.actionsUrl || STAGING_SYNC_ACTIONS_URL, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error(err);
      toast.error(
        httpsCallableMessage(
          err,
          'Could not start staging sync. Deploy Cloud Functions and set GITHUB_STAGING_SYNC_TOKEN.'
        )
      );
    } finally {
      setSyncing(false);
    }
  };

  if (isStagingEnv) {
    return (
      <AdminCard className="p-4 sm:p-6 max-w-3xl">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-vailo-teal/10 p-3 text-vailo-teal">
            <Database size={22} />
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-vailo-dark">Staging database</h2>
              <p className="mt-1 text-sm text-gray-600">
                You are on the staging environment. To refresh staging from production, sign in to
                production admin and use Settings → Staging.
              </p>
            </div>
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => window.open('https://vailo.app/admin/settings', '_blank', 'noopener')}
            >
              <ExternalLink size={16} className="mr-2" />
              Open production Settings
            </AdminButton>
          </div>
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-4 sm:p-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-vailo-teal/10 p-3 text-vailo-teal">
          <Database size={22} />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-vailo-dark">Staging environment</h2>
            <p className="mt-1 text-sm text-gray-600">
              Copy the live production Firestore database and Firebase Auth users to{' '}
              <strong>vailo-staging</strong>. Use this when you want staging to match production for
              testing. Deploys to staging stay fast — this sync runs separately on demand.
            </p>
          </div>

          <AdminAlert variant="info">
            Staging URL:{' '}
            <a
              href={STAGING_ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-vailo-teal hover:underline"
            >
              {STAGING_ADMIN_URL}
            </a>
          </AdminAlert>

          <div className="flex flex-wrap gap-3">
            <AdminButton type="button" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Starting sync…
                </>
              ) : (
                <>
                  <RefreshCw size={16} className="mr-2" />
                  Sync production → staging
                </>
              )}
            </AdminButton>
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => window.open(STAGING_SYNC_ACTIONS_URL, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size={16} className="mr-2" />
              View sync history
            </AdminButton>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
