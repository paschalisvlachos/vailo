import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, Calendar, Pencil, Phone, Mail } from 'lucide-react';

export default function Overview() {
  const { property } = useOutletContext<{ property: any }>();
  
  // State to hold the specific relational owner document
  const [relationalOwner, setRelationalOwner] = useState<any>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);

  // Fetch the assigned owner when the component loads
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
        console.error("Error fetching relational owner:", error);
      } finally {
        setLoadingOwner(false);
      }
    };

    fetchOwner();
  }, [property?.ownerId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* General Details Panel */}
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center">
              <Calendar size={16} className="mr-2 text-gray-400" /> General Details
            </h3>
            <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit General Details">
              <Pencil size={16} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Registration Date</p>
              <p className="font-medium text-gray-900">{new Date(property.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Base URL Slug</p>
              <p className="font-medium text-gray-900">/{property.urlSlug || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Relational Owner Information Panel */}
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center">
              <User size={16} className="mr-2 text-gray-400" /> Assigned Contact
            </h3>
            <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Change Assigned Owner">
              <Pencil size={16} />
            </button>
          </div>
          
          <div className="space-y-4">
            {loadingOwner ? (
              <p className="text-sm text-gray-500 animate-pulse">Loading contact details...</p>
            ) : relationalOwner ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                    {relationalOwner.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{relationalOwner.fullName}</p>
                    <p className="text-xs text-gray-500 capitalize">{relationalOwner.role} {relationalOwner.company && `• ${relationalOwner.company}`}</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200/60">
                  <p className="text-sm text-gray-700 flex items-center mb-2">
                    <Mail size={14} className="mr-2 text-gray-400" />
                    <a href={`mailto:${relationalOwner.email}`} className="hover:text-blue-600 hover:underline">{relationalOwner.email}</a>
                  </p>
                  <p className="text-sm text-gray-700 flex items-center">
                    <Phone size={14} className="mr-2 text-gray-400" />
                    {relationalOwner.phone || 'No phone provided'}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic text-center py-4 bg-white border border-dashed border-gray-200 rounded-lg">
                No active owner/agent assigned to this property.
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}