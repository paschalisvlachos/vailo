import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  Building, BookOpen, Key, ScrollText, Wrench, Coffee, ShieldAlert, Loader2, Save 
} from 'lucide-react';

export default function HouseGuide() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialFormState = {
    checkIn: '',
    rules: '',
    technical: '',
    daily: '',
    emergency: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);

  // 1. Fetch Property Types for the dropdown
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
      
      if (typesData.length > 0 && !selectedTypeId) {
        setSelectedTypeId(typesData[0].id);
      }
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  // 2. Fetch the House Guide specifically for the Selected Type
  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setFormData(initialFormState);
      return;
    }
    
    // We store the guide as a single document named "data" inside a "houseGuide" subcollection
    const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setFormData(docSnap.data() as typeof initialFormState);
      } else {
        setFormData(initialFormState); // Reset if none exists
      }
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const submitGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    
    try {
      const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
      
      // Using setDoc with merge: true safely creates or updates the document
      await setDoc(docRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      alert("House Guide saved successfully!");
    } catch (error) {
      console.error("Error saving House Guide:", error);
      alert("Failed to save House Guide.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- EDGE CASE: No Property Types Exist ---
  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Types Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          House guides are specific to each unit. Please create a unit first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      
      {/* Property Type Selector */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h4 className="text-sm font-bold text-blue-900 flex items-center">
            <BookOpen size={16} className="mr-2" /> Digital House Guide
          </h4>
          <p className="text-xs text-blue-700 mt-1">Select a unit to manage its specific instructions and rules.</p>
        </div>
        <select 
          value={selectedTypeId} 
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="px-4 py-2 bg-white border border-blue-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[200px]"
        >
          {propertyTypes.map(type => (
            <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
          ))}
        </select>
      </div>

      <form onSubmit={submitGuide} className="space-y-6">
        
        {/* Check-in Instructions */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
              <Key size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Check-in & Access</h3>
              <p className="text-xs text-gray-500">Lockbox codes, exact directions, parking spots, and Wi-Fi access.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              name="checkIn" 
              value={formData.checkIn} 
              onChange={handleChange} 
              rows={5} 
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-y text-sm text-gray-700" 
              placeholder="Example: The lockbox is located to the right of the front door. The code is 1234..."
            />
          </div>
        </div>

        {/* House Rules */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mr-3">
              <ScrollText size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">House Rules</h3>
              <p className="text-xs text-gray-500">Quiet hours, smoking policies, pet rules, and general etiquette.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              name="rules" 
              value={formData.rules} 
              onChange={handleChange} 
              rows={5} 
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-y text-sm text-gray-700" 
              placeholder="Example: Quiet hours are from 10 PM to 8 AM. No parties allowed..."
            />
          </div>
        </div>

        {/* Technical Instructions */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg mr-3">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Technical Instructions</h3>
              <p className="text-xs text-gray-500">How to use the AC, TV, washing machine, hot water, and kitchen appliances.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              name="technical" 
              value={formData.technical} 
              onChange={handleChange} 
              rows={5} 
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-y text-sm text-gray-700" 
              placeholder="Example: To turn on the hot water, flip the switch located outside the bathroom for 15 minutes..."
            />
          </div>
        </div>

        {/* Daily Needs */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg mr-3">
              <Coffee size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Daily Needs & Amenities</h3>
              <p className="text-xs text-gray-500">Trash disposal locations, extra linens, cleaning supplies, and local markets.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              name="daily" 
              value={formData.daily} 
              onChange={handleChange} 
              rows={5} 
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-y text-sm text-gray-700" 
              placeholder="Example: Please dispose of trash in the green bins located at the end of the street..."
            />
          </div>
        </div>

        {/* Emergency Protocols */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-red-50 flex items-center">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg mr-3">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-red-900">Emergency Protocols</h3>
              <p className="text-xs text-red-700">Medical contacts, fire extinguisher locations, and what to do in an emergency.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              name="emergency" 
              value={formData.emergency} 
              onChange={handleChange} 
              rows={4} 
              className="w-full px-4 py-3 border border-red-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none resize-y text-sm text-gray-700 bg-red-50/30" 
              placeholder="Example: In case of medical emergency, call 112. The nearest pharmacy is..."
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="flex items-center px-8 py-3.5 text-sm font-bold text-white bg-gray-900 hover:bg-black rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="mr-2 animate-spin" />
            ) : (
              <Save size={18} className="mr-2" />
            )}
            {isSubmitting ? 'Saving Guide...' : 'Save House Guide'}
          </button>
        </div>

      </form>
    </div>
  );
}