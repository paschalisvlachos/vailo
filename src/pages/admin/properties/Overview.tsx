import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { User, Calendar, Pencil, Phone, Mail } from 'lucide-react';
import { AdminCard, AdminBadge } from '../../../components/admin/AdminPageHeader';

export default function Overview() {
  const { property } = useOutletContext<{ property: { ownerId?: string; createdAt?: string; urlSlug?: string } }>();

  const [relationalOwner, setRelationalOwner] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    role?: string;
  } | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);

  useEffect(() => {
    const fetchOwner = async () => {
      if (!property?.ownerId) {
        setLoadingOwner(false);
        return;
      }
      try {
        const ownerDoc = await getDoc(doc(db, 'owners', property.ownerId));
        if (ownerDoc.exists()) {
          setRelationalOwner(ownerDoc.data());
        }
      } catch (error) {
        console.error('Error fetching relational owner:', error);
      } finally {
        setLoadingOwner(false);
      }
    };

    fetchOwner();
  }, [property?.ownerId]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <AdminCard className="p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider flex items-center gap-2">
            <Calendar size={16} className="text-vailo-teal/60" /> General Details
          </h3>
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 rounded-xl transition-colors"
            title="Edit General Details"
          >
            <Pencil size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-xs text-gray-500 mb-1">Registration Date</p>
            <p className="font-medium text-vailo-dark">
              {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Base URL Slug</p>
            <p className="font-medium text-vailo-dark font-mono text-sm">/{property.urlSlug || 'N/A'}</p>
          </div>
        </div>
      </AdminCard>

      <AdminCard className="p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider flex items-center gap-2">
            <User size={16} className="text-vailo-teal/60" /> Assigned Contact
          </h3>
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 rounded-xl transition-colors"
            title="Change Assigned Owner"
          >
            <Pencil size={16} />
          </button>
        </div>

        {loadingOwner ? (
          <p className="text-sm text-gray-500 animate-pulse">Loading contact details…</p>
        ) : relationalOwner ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-vailo-teal/8 flex items-center justify-center text-vailo-teal font-bold text-lg">
                {relationalOwner.fullName?.charAt(0) || '?'}
              </div>
              <div>
                <p className="font-bold text-vailo-dark">{relationalOwner.fullName}</p>
                {relationalOwner.role && (
                  <AdminBadge variant="gold">{relationalOwner.role}</AdminBadge>
                )}
              </div>
            </div>
            {relationalOwner.email && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={15} className="text-vailo-teal/50" /> {relationalOwner.email}
              </p>
            )}
            {relationalOwner.phone && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={15} className="text-vailo-teal/50" /> {relationalOwner.phone}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No owner assigned to this property.</p>
        )}
      </AdminCard>
    </div>
  );
}
