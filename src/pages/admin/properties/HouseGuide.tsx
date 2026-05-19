import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  Building, BookOpen, Key, ScrollText, Wrench, Coffee, ShieldAlert, Loader2, Save, 
  Plus, Trash2, MapPin, Phone, Tag, MonitorSpeaker, Pencil, Check
} from 'lucide-react';

// Type definitions for our dynamic arrays
type Device = { room: string; device: string; brand: string; model: string };
type DailyNeed = { title: string; mapsLink: string };
type Emergency = { category: string; title: string; mapsLink: string; phone: string };

// Professional list of rooms for the dropdown
const ROOM_OPTIONS = [
  "Kitchen", "Living Room", "Dining Room", "Master Bedroom", "Bedroom 1", 
  "Bedroom 2", "Bedroom 3", "Bathroom", "Master Bathroom", "Balcony / Patio", 
  "Pool Area", "Laundry Room", "Attic", "Basement", "Garage", "Entire Property", "Other"
];

export default function HouseGuide() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tracks which rows are currently open in "Edit Mode"
  const [editingModes, setEditingModes] = useState<Record<string, Record<number, boolean>>>({
    devices: {}, dailyNeeds: {}, emergencies: {}
  });

  const initialFormState = {
    checkIn: '',
    rules: '',
    technical: '',
    devices: [] as Device[],
    dailyNeeds: [] as DailyNeed[],
    emergencies: [] as Emergency[]
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

  // 2. Fetch the House Guide
  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setFormData(initialFormState);
      return;
    }
    
    const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({
          checkIn: data.checkIn || '',
          rules: data.rules || '',
          technical: data.technical || '',
          devices: data.devices || [],
          dailyNeeds: data.dailyNeeds || [],
          emergencies: data.emergencies || []
        });
      } else {
        setFormData(initialFormState);
      }
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- DYNAMIC ARRAY & EDIT HELPERS ---
  const setEditMode = (field: 'devices' | 'dailyNeeds' | 'emergencies', index: number, isEditing: boolean) => {
    setEditingModes(prev => ({
      ...prev,
      [field]: { ...prev[field], [index]: isEditing }
    }));
  };

  const addArrayItem = (field: 'devices' | 'dailyNeeds' | 'emergencies', emptyObj: any) => {
    const newIndex = formData[field].length;
    setFormData(prev => ({ ...prev, [field]: [...prev[field], emptyObj] }));
    setEditMode(field, newIndex, true); // Auto-open edit mode for the new item
  };

  const updateArrayItem = (field: 'devices' | 'dailyNeeds' | 'emergencies', index: number, key: string, value: string) => {
    setFormData(prev => {
      const newArray = [...prev[field]] as any[];
      newArray[index] = { ...newArray[index], [key]: value };
      return { ...prev, [field]: newArray };
    });
  };

  const removeArrayItem = (field: 'devices' | 'dailyNeeds' | 'emergencies', index: number) => {
    setFormData(prev => {
      const newArray = [...prev[field]];
      newArray.splice(index, 1);
      return { ...prev, [field]: newArray };
    });
    // Reset edit modes for this field to avoid shifting bugs
    setEditingModes(prev => ({ ...prev, [field]: {} }));
  };
  // ------------------------------------

  const submitGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    
    try {
      const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
      await setDoc(docRef, { ...formData, updatedAt: new Date().toISOString() }, { merge: true });
      alert("House Guide saved successfully!");
    } catch (error) {
      console.error("Error saving House Guide:", error);
      alert("Failed to save House Guide.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Types Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">House guides are specific to each unit. Please create a unit first.</p>
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
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3"><Key size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Arrival Instructions</h3>
              <p className="text-xs text-gray-500">Lockbox codes, exact directions, parking spots, and Wi-Fi access.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea name="checkIn" value={formData.checkIn} onChange={handleChange} rows={5} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-y text-sm text-gray-700" placeholder="Example: The lockbox is located to the right of the front door..." />
          </div>
        </div>

        {/* House Rules */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mr-3"><ScrollText size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Property Rules</h3>
              <p className="text-xs text-gray-500">Quiet hours, smoking policies, pet rules, and general etiquette.</p>
            </div>
          </div>
          <div className="p-6">
            <textarea name="rules" value={formData.rules} onChange={handleChange} rows={5} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-y text-sm text-gray-700" placeholder="Example: Quiet hours are from 10 PM to 8 AM. No parties allowed..." />
          </div>
        </div>

        {/* Technical Instructions & Appliances */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg mr-3"><Wrench size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Facilities & Appliances</h3>
              <p className="text-xs text-gray-500">General facility instructions and specific appliance models.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">General Technical Instructions</label>
              <textarea name="technical" value={formData.technical} onChange={handleChange} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-y text-sm text-gray-700" placeholder="General info (e.g., Hot water switch locations, main breaker...)" />
            </div>

            <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100">
              <label className="block text-sm font-bold text-orange-900 mb-4 flex items-center">
                <MonitorSpeaker size={16} className="mr-2" /> Connected Appliances
              </label>
              <div className="space-y-3">
                {/* HEADERS FOR APPLIANCES */}
                {formData.devices.length > 0 && (
                  <div className="flex flex-row gap-2 px-3 pb-1 text-[10px] font-bold text-orange-800 uppercase tracking-wider border-b border-orange-200/50">
                    <div className="flex-[1.5]">Room</div>
                    <div className="flex-[1.5]">Appliance</div>
                    <div className="flex-1">Brand</div>
                    <div className="flex-1">Model</div>
                    <div className="w-[64px] shrink-0"></div> {/* Spacer for edit/delete buttons */}
                  </div>
                )}
                
                {formData.devices.map((device, idx) => {
                  const isEditing = editingModes.devices[idx];
                  return (
                    <div key={idx} className="flex flex-row gap-2 bg-white p-3 rounded-lg border border-gray-200 shadow-sm items-center w-full overflow-hidden">
                      {isEditing ? (
                        <>
                          {/* NEW: Room Select Dropdown */}
                          <select value={device.room} onChange={(e) => updateArrayItem('devices', idx, 'room', e.target.value)} className="flex-[1.5] px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                            <option value="" disabled>Select Room</option>
                            {ROOM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                          
                          <input type="text" placeholder="Device" value={device.device} onChange={(e) => updateArrayItem('devices', idx, 'device', e.target.value)} className="flex-[1.5] px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-orange-500" />
                          <input type="text" placeholder="Brand" value={device.brand} onChange={(e) => updateArrayItem('devices', idx, 'brand', e.target.value)} className="flex-1 px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-orange-500" />
                          <input type="text" placeholder="Model" value={device.model} onChange={(e) => updateArrayItem('devices', idx, 'model', e.target.value)} className="flex-1 px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-orange-500" />
                          <button type="button" onClick={() => setEditMode('devices', idx, false)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md shrink-0 transition-colors"><Check size={16} /></button>
                        </>
                      ) : (
                        <>
                          <div className="flex-[1.5] text-xs font-bold text-gray-700 truncate">{device.room || '-'}</div>
                          <div className="flex-[1.5] text-xs font-medium text-gray-900 truncate">{device.device || '-'}</div>
                          <div className="flex-1 text-xs text-gray-600 truncate">{device.brand || '-'}</div>
                          <div className="flex-1 text-xs text-gray-600 truncate">{device.model || '-'}</div>
                          <button type="button" onClick={() => setEditMode('devices', idx, true)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md shrink-0 transition-colors"><Pencil size={16} /></button>
                        </>
                      )}
                      <button type="button" onClick={() => removeArrayItem('devices', idx)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md shrink-0 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => addArrayItem('devices', { room: '', device: '', brand: '', model: '' })} className="flex items-center text-sm font-medium text-orange-600 hover:text-orange-700 bg-white px-4 py-2 rounded-lg border border-orange-200 hover:bg-orange-50 transition-colors shadow-sm w-fit mt-2">
                  <Plus size={16} className="mr-1.5" /> Add Appliance
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Daily Needs (Dynamic Array) */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg mr-3"><Coffee size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Daily Needs Map</h3>
              <p className="text-xs text-gray-500">Provide direct Google Maps links for trash bins, supermarkets, etc.</p>
            </div>
          </div>
          <div className="p-6 bg-emerald-50/20">
            <div className="space-y-3">
              {/* HEADERS FOR DAILY NEEDS */}
              {formData.dailyNeeds.length > 0 && (
                <div className="flex flex-row gap-2 px-3 pb-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-200/50">
                  <div className="flex-1">Title</div>
                  <div className="flex-[2]">Google Maps URL</div>
                  <div className="w-[64px] shrink-0"></div> {/* Spacer for edit/delete buttons */}
                </div>
              )}

              {formData.dailyNeeds.map((need, idx) => {
                const isEditing = editingModes.dailyNeeds[idx];
                return (
                  <div key={idx} className="flex flex-row gap-2 bg-white p-3 rounded-xl border border-gray-200 shadow-sm items-center w-full overflow-hidden">
                    {isEditing ? (
                      <>
                        <div className="flex-1 relative min-w-0">
                          <Tag size={14} className="absolute left-2.5 top-2 text-gray-400" />
                          <input type="text" placeholder="Title (e.g. Supermarket)" value={need.title} onChange={(e) => updateArrayItem('dailyNeeds', idx, 'title', e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500" />
                        </div>
                        <div className="flex-[2] relative min-w-0">
                          <MapPin size={14} className="absolute left-2.5 top-2 text-gray-400" />
                          <input type="url" placeholder="Google Maps URL" value={need.mapsLink} onChange={(e) => updateArrayItem('dailyNeeds', idx, 'mapsLink', e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500" />
                        </div>
                        <button type="button" onClick={() => setEditMode('dailyNeeds', idx, false)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md shrink-0 transition-colors"><Check size={16} /></button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 text-sm font-medium text-gray-900 truncate">{need.title || 'No Title'}</div>
                        <div className="flex-[2] text-sm text-blue-600 truncate"><a href={need.mapsLink} target="_blank" rel="noreferrer" className="hover:underline">{need.mapsLink || '-'}</a></div>
                        <button type="button" onClick={() => setEditMode('dailyNeeds', idx, true)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md shrink-0 transition-colors"><Pencil size={16} /></button>
                      </>
                    )}
                    <button type="button" onClick={() => removeArrayItem('dailyNeeds', idx)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md shrink-0 transition-colors"><Trash2 size={16} /></button>
                  </div>
                );
              })}
              <button type="button" onClick={() => addArrayItem('dailyNeeds', { title: '', mapsLink: '' })} className="flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-white px-4 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors shadow-sm w-fit mt-2">
                <Plus size={16} className="mr-1.5" /> Add Location
              </button>
            </div>
          </div>
        </div>

        {/* Emergency Info (Dynamic Array) */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-red-50 flex items-center">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg mr-3"><ShieldAlert size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-red-900">Emergency Contacts</h3>
              <p className="text-xs text-red-700">Pharmacies, hospitals, police, and important numbers.</p>
            </div>
          </div>
          <div className="p-6 bg-red-50/20">
            <div className="space-y-3">
              {/* HEADERS FOR EMERGENCIES */}
              {formData.emergencies.length > 0 && (
                <div className="flex flex-row gap-2 px-3 pb-1 text-[10px] font-bold text-red-800 uppercase tracking-wider border-b border-red-200/50">
                  <div className="w-24 shrink-0">Category</div>
                  <div className="flex-[1.5]">Title</div>
                  <div className="flex-1">Phone</div>
                  <div className="flex-[1.5]">Maps URL</div>
                  <div className="w-[64px] shrink-0"></div> {/* Spacer for edit/delete buttons */}
                </div>
              )}

              {formData.emergencies.map((em, idx) => {
                const isEditing = editingModes.emergencies[idx];
                return (
                  <div key={idx} className="flex flex-row gap-2 bg-white p-3 rounded-lg border border-red-100 shadow-sm items-center w-full overflow-hidden">
                    {isEditing ? (
                      <>
                        <select value={em.category} onChange={(e) => updateArrayItem('emergencies', idx, 'category', e.target.value)} className="w-24 px-2 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-red-500 bg-white shrink-0">
                          <option value="" disabled>Category</option>
                          <option value="Pharmacy">Pharmacy</option>
                          <option value="Hospital/Clinic">Hospital</option>
                          <option value="Police">Police</option>
                          <option value="Fire Dept">Fire Dept</option>
                          <option value="Doctor">Doctor</option>
                          <option value="Paediatrician">Paediatrician</option>
                          <option value="Other">Other</option>
                        </select>
                        <input type="text" placeholder="Title" value={em.title} onChange={(e) => updateArrayItem('emergencies', idx, 'title', e.target.value)} className="flex-[1.5] px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-red-500" />
                        <input type="tel" placeholder="Phone" value={em.phone} onChange={(e) => updateArrayItem('emergencies', idx, 'phone', e.target.value)} className="flex-1 px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-red-500" />
                        <input type="url" placeholder="Maps URL" value={em.mapsLink} onChange={(e) => updateArrayItem('emergencies', idx, 'mapsLink', e.target.value)} className="flex-[1.5] px-2 py-1.5 text-xs min-w-0 border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-red-500" />
                        <button type="button" onClick={() => setEditMode('emergencies', idx, false)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md shrink-0 transition-colors"><Check size={16} /></button>
                      </>
                    ) : (
                      <>
                        <div className="w-24 text-xs font-bold text-red-700 truncate shrink-0">{em.category || '-'}</div>
                        <div className="flex-[1.5] text-xs font-medium text-gray-900 truncate">{em.title || '-'}</div>
                        <div className="flex-1 text-xs text-gray-700 truncate">{em.phone || '-'}</div>
                        <div className="flex-[1.5] text-xs text-blue-600 truncate"><a href={em.mapsLink} target="_blank" rel="noreferrer" className="hover:underline">{em.mapsLink || '-'}</a></div>
                        <button type="button" onClick={() => setEditMode('emergencies', idx, true)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md shrink-0 transition-colors"><Pencil size={16} /></button>
                      </>
                    )}
                    <button type="button" onClick={() => removeArrayItem('emergencies', idx)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md shrink-0 transition-colors"><Trash2 size={16} /></button>
                  </div>
                );
              })}
              <button type="button" onClick={() => addArrayItem('emergencies', { category: '', title: '', mapsLink: '', phone: '' })} className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 bg-white px-4 py-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors shadow-sm w-fit mt-2">
                <Plus size={16} className="mr-1.5" /> Add Emergency Contact
              </button>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-4">
          <button type="submit" disabled={isSubmitting} className="flex items-center px-8 py-3.5 text-sm font-bold text-white bg-gray-900 hover:bg-black rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
            {isSubmitting ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Save size={18} className="mr-2" />}
            {isSubmitting ? 'Saving Guide...' : 'Save House Guide'}
          </button>
        </div>

      </form>
    </div>
  );
}