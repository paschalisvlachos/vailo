import { useState, useEffect } from 'react';
import { Building2, Plus, Pencil, Trash2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Property {
  id: string;
  propertyName: string;
  ownerId: string;
  internalRefCode: string;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Record<string, any>>({}); // Lookup map for fast access
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen to properties
    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Property[];
      setProperties(propertiesData);
      setLoading(false);
    });

    // 2. Listen to owners to build a fast lookup dictionary
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      const ownersMap: Record<string, any> = {};
      snapshot.forEach(doc => {
        ownersMap[doc.id] = doc.data();
      });
      setOwners(ownersMap);
    });

    return () => { unsubProps(); unsubOwners(); };
  }, []);

  const handleDelete = async (id: string, propertyName: string) => {
    if (window.confirm(`Are you sure you want to delete "${propertyName}"?`)) {
      try { await deleteDoc(doc(db, 'properties', id)); } 
      catch (error) { alert("Failed to delete property."); }
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading properties...</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Properties</h2>
          <p className="text-gray-500 mt-1">Manage your rental portfolio</p>
        </div>
        
        <Link to="/add-property" className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={20} className="mr-2" /> Add Property
        </Link>
      </div>

      {properties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4">
            <Building2 size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No properties found</h3>
          <p className="text-gray-500 max-w-sm mb-6">Your property list is empty. Add your first property to start managing.</p>
          <Link to="/add-property" className="flex items-center px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">
            <Plus size={20} className="mr-2" /> Add New Property
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Owner / Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref Code</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {properties.map((property) => {
                const allocatedUser = owners[property.ownerId];
                return (
                  <tr key={property.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/properties/${property.id}`} className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
                        {property.propertyName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {allocatedUser ? (
                        <div className="flex items-center">
                          <User size={14} className="mr-2 text-gray-400" />
                          <span className="font-medium">{allocatedUser.fullName}</span>
                          <span className="ml-2 text-xs text-gray-500 capitalize px-2 py-0.5 bg-gray-100 rounded-md">
                            {allocatedUser.role}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {property.internalRefCode}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-4">
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => handleDelete(property.id, property.propertyName)} className="text-red-600 hover:text-red-900">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}