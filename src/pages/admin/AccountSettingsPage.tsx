import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { KeyRound, Settings as SettingsIcon } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminPath } from '../../lib/adminRoutes';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
} from '../../components/admin/AdminPageHeader';
import Overview from './properties/Overview';
import type { PropertyRecord } from './properties/PropertyLayout';

export default function AccountSettingsPage() {
  const { profile, isPlatformAdmin } = useAdminSession();
  const [searchParams] = useSearchParams();
  const agencyIdParam = searchParams.get('agency')?.trim() || '';
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Platform admin editing a specific agency from Agencies → Edit.
    if (isPlatformAdmin && agencyIdParam) {
      const unsub = onSnapshot(
        doc(db, 'properties', agencyIdParam),
        (snap) => {
          if (!snap.exists()) {
            setProperty(null);
            setLoading(false);
            return;
          }
          setProperty({ id: snap.id, ...snap.data() } as PropertyRecord);
          setLoading(false);
        },
        () => {
          setProperty(null);
          setLoading(false);
        }
      );
      return () => unsub();
    }

    if (!profile?.id) {
      setProperty(null);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'properties'), where('ownerId', '==', profile.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setProperty(null);
          setLoading(false);
          return;
        }
        const sorted = [...snap.docs].sort((a, b) => {
          const aAt = String(a.data().createdAt || '');
          const bAt = String(b.data().createdAt || '');
          return aAt.localeCompare(bAt);
        });
        const primary = sorted[0]!;
        setProperty({ id: primary.id, ...primary.data() } as PropertyRecord);
        setLoading(false);
      },
      () => {
        setProperty(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [profile?.id, isPlatformAdmin, agencyIdParam]);

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading settings…</div>;
  }

  if (!profile?.id && !(isPlatformAdmin && agencyIdParam)) {
    return (
      <div className="admin-page py-16 text-center text-gray-500 text-sm">
        Your login is not linked to a Vailo profile.
      </div>
    );
  }

  const editingSpecificAgency = Boolean(isPlatformAdmin && agencyIdParam);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Settings"
        description={
          editingSpecificAgency
            ? `Agency settings for ${property?.propertyName || 'this portfolio'} — identity, people, languages, and guest experience.`
            : 'Your agency overview — identity, people, languages, and guest experience.'
        }
        icon={<SettingsIcon size={26} />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {editingSpecificAgency ? (
              <AdminButtonLink to={adminPath('/agencies')} variant="secondary">
                Back to Agencies
              </AdminButtonLink>
            ) : null}
            <Link
              to={adminPath('/account/password')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-vailo-dark hover:border-vailo-teal/40 hover:text-vailo-teal"
            >
              <KeyRound size={16} />
              Change password
            </Link>
          </div>
        }
      />

      {!property ? (
        <AdminCard className="p-6 sm:p-8 text-center">
          <p className="text-base font-semibold text-vailo-dark">
            {editingSpecificAgency ? 'Agency not found' : 'No agency portfolio yet'}
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
            {editingSpecificAgency
              ? 'This agency portfolio could not be loaded. Go back to Agencies and try again.'
              : 'Add your first property listing to create your agency portfolio. Settings and overview will appear here afterward.'}
          </p>
          <div className="mt-5 flex justify-center">
            {editingSpecificAgency ? (
              <AdminButtonLink to={adminPath('/agencies')} variant="accent">
                Back to Agencies
              </AdminButtonLink>
            ) : (
              <AdminButtonLink to={adminPath('/add-property')} variant="accent">
                Add listing
              </AdminButtonLink>
            )}
          </div>
        </AdminCard>
      ) : (
        <Overview property={property} propertyId={property.id} settingsMode />
      )}
    </div>
  );
}
