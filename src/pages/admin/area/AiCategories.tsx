import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Sparkles, ArrowLeft, Plus, Trash2, Loader2, Tag } from 'lucide-react';

export default function AiCategories() {
  const { country, area } = useParams<{ country: string, area: string }>();
  const navigate = useNavigate();
  
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Decode the URL parameters
  const decodedCountry = decodeURIComponent(country || '');
  const decodedArea = decodeURIComponent(area || '');
  // Format the area exactly as we saved it in the database (e.g., "Chania" -> "chania")
  const areaId = decodedArea.toLowerCase().replace(/\s+/g, '-');

  // Fetch Categories from Firestore
  useEffect(() => {
    if (!decodedCountry || !areaId) return;

    const colRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'aiCategories');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name 
      }));
      // Sort alphabetically
      fetchedCats.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(fetchedCats);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  // Add a new Category
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !decodedCountry || !areaId) return;

    // Prevent duplicates
    if (categories.some(c => c.name.toLowerCase() === newName.trim().toLowerCase())) {
      alert("This category already exists.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'aiCategories'), {
        name: newName.trim(),
        createdAt: new Date().toISOString()
      });
      setNewName('');
    } catch (error) {
      console.error("Error adding category:", error);
      alert("Failed to add category.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete a Category
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'aiCategories', id));
    } catch (error) {
      alert("Failed to delete category.");
    }
  };

  return (
    <div className="admin-page">
      
      {/* Header with Back Button */}
      <div className="flex items-center mb-8">
        <button 
          onClick={() => navigate('/area')} 
          className="p-2 mr-4 rounded-xl hover:bg-gray-200 text-gray-500 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Sparkles className="mr-3 text-vailo-teal" size={28} />
            AI Categories
          </h2>
          <p className="text-gray-500 mt-1">
            Managing categories for <span className="font-bold text-vailo-teal-hover">{decodedArea}, {decodedCountry}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column: Add Form */}
        <div className="md:col-span-1">
          <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Add New Category</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
              <input 
                type="text" 
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Restaurants"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none"
              />
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting || !newName.trim()} 
              className="w-full flex justify-center items-center px-4 py-2.5 bg-vailo-teal text-white font-medium rounded-xl hover:bg-vailo-teal-hover disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} className="mr-2" />}
              {isSubmitting ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </div>

        {/* Right Column: List of Categories */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Active Categories</h3>
              <span className="bg-vailo-gold/15 text-vailo-teal-hover text-xs font-bold px-2.5 py-0.5 rounded-full">
                {categories.length} Total
              </span>
            </div>
            
            {isLoading ? (
              <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                <Loader2 size={32} className="animate-spin mb-3" />
                <p>Loading categories...</p>
              </div>
            ) : categories.length === 0 ? (
              <div className="p-12 text-center bg-gray-50/50">
                <Tag size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No categories added yet.</p>
                <p className="text-sm text-gray-400 mt-1">Use the form on the left to create your first one.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {categories.map((cat) => (
                  <li key={cat.id} className="p-4 hover:bg-gray-50 flex items-center justify-between transition-colors">
                    <span className="font-medium text-gray-900 flex items-center">
                      <Tag size={16} className="text-vailo-teal/50 mr-3" />
                      {cat.name}
                    </span>
                    <button 
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete category"
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}