import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  Leaf, Building, Zap, Recycle, Droplet, Sun, CheckCircle2, Loader2, 
  Thermometer, Lightbulb, Ban, Car, Bike, Sprout, CloudRain, Waves, 
  Store, Users, HeartHandshake, Bus, FileText
} from 'lucide-react';

// Max 6 points for Energy Class
const ENERGY_SCORES: Record<string, number> = {
  'A': 6, 'B': 6, 'C': 3, 'D': 0, 'E': 0, 'Not specified': 0
};

export default function GreenScore() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const MAX_SCORE = 100; 

  const initialFormState = {
    // Energy
    energyClass: 'Not specified',
    hasSolarPanels: false,
    hasLedLighting: false,
    hasSmartThermostat: false,
    // Water
    hasWaterFixtures: false,
    hasRainwater: false,
    hasPoolCover: false,
    // Waste
    hasRecycling: false,
    hasComposting: false,
    hasNoPlastic: false,
    // Local & Community
    hasLocalSourcing: false,
    hasLocalStaff: false,
    hasLocalCharity: false,
    // Transport
    hasEvCharging: false,
    hasBikes: false,
    hasPublicTransport: false,
    // Notes
    notes: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);

  // 1. Fetch Property Types
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
      if (typesData.length > 0 && !selectedTypeId) setSelectedTypeId(typesData[0].id);
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  // 2. Fetch Green Score for selected Type
  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setFormData(initialFormState);
      return;
    }
    const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'greenScore', 'data');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setFormData(docSnap.data() as typeof initialFormState);
      else setFormData(initialFormState);
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  // 3. Real-time Score Calculation (Exactly matching your matrix)
  useEffect(() => {
    let score = 0;
    
    // Energy (Max 30)
    score += ENERGY_SCORES[formData.energyClass] || 0;
    if (formData.hasSolarPanels) score += 12;
    if (formData.hasLedLighting) score += 6;
    if (formData.hasSmartThermostat) score += 6;
    
    // Water (Max 20)
    if (formData.hasWaterFixtures) score += 8;
    if (formData.hasRainwater) score += 7;
    if (formData.hasPoolCover) score += 5;
    
    // Waste (Max 20)
    if (formData.hasRecycling) score += 7;
    if (formData.hasComposting) score += 7;
    if (formData.hasNoPlastic) score += 6;

    // Local & Community (Max 15)
    if (formData.hasLocalSourcing) score += 6;
    if (formData.hasLocalStaff) score += 5;
    if (formData.hasLocalCharity) score += 4;

    // Transport (Max 15)
    if (formData.hasEvCharging) score += 6;
    if (formData.hasBikes) score += 5;
    if (formData.hasPublicTransport) score += 4;
    
    setCurrentScore(score);
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const submitGreenScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    
    try {
      const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'greenScore', 'data');
      await setDoc(docRef, {
        ...formData,
        totalScore: currentScore,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      alert("Green Score saved successfully!");
    } catch (error) {
      alert("Failed to save Green Score.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Types Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          Green Scores are calculated per specific unit. Please create a unit first.
        </p>
      </div>
    );
  }

  // Helper for Toggle Switch UI
  const CustomToggle = ({ label, name, checked, points, icon: Icon, colorClass = "text-emerald-600", bgClass = "bg-emerald-50", ringClass = "peer-focus:ring-emerald-300", checkedClass = "peer-checked:bg-emerald-500" }: any) => (
    <label className="flex items-center justify-between cursor-pointer group bg-white hover:bg-gray-50 p-4 rounded-xl border border-gray-200 transition-colors shadow-sm">
      <div className="flex items-center">
        <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${bgClass} ${colorClass} mr-4`}>
          <Icon size={20} />
        </div>
        <div>
          <span className="block text-sm font-bold text-gray-900">{label}</span>
          <span className={`block text-xs font-bold mt-0.5 ${colorClass}`}>+{points}</span>
        </div>
      </div>
      <div className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" name={name} checked={checked} onChange={handleChange} className="sr-only peer" />
        <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 ${ringClass} rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${checkedClass} shadow-inner`}></div>
      </div>
    </label>
  );

  return (
    <div className="max-w-5xl mx-auto pb-8">
      
      {/* Selector Header */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-emerald-900 flex items-center">
            <Leaf size={16} className="mr-2" /> Unit Eco-Settings
          </h4>
          <p className="text-xs text-emerald-700 mt-1">Select a property type to manage its sustainability profile.</p>
        </div>
        <select 
          value={selectedTypeId} 
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="px-4 py-2 bg-white border border-emerald-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm min-w-[200px]"
        >
          {propertyTypes.map(type => (
            <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: The Interactive Form */}
        <div className="lg:col-span-2">
          <form onSubmit={submitGreenScore} className="space-y-6">
            
            {/* Energy Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <Zap size={20} className="mr-2 text-yellow-500" /> Energy
              </h3>
              
              <div className="mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <label className="block text-sm font-bold text-gray-900 mb-2">Energy Class</label>
                <select 
                  name="energyClass" 
                  value={formData.energyClass} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-gray-50 font-medium"
                >
                  <option value="Not specified">Not specified (0)</option>
                  <option value="A">Class A (+6)</option>
                  <option value="B">Class B (+6)</option>
                  <option value="C">Class C (+3)</option>
                  <option value="D">Class D (0)</option>
                  <option value="E">Class E (0)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomToggle label="Solar Panels" name="hasSolarPanels" checked={formData.hasSolarPanels} points={12} icon={Sun} colorClass="text-yellow-600" bgClass="bg-yellow-50" ringClass="peer-focus:ring-yellow-300" checkedClass="peer-checked:bg-yellow-500" />
                <CustomToggle label="LED Lighting" name="hasLedLighting" checked={formData.hasLedLighting} points={6} icon={Lightbulb} colorClass="text-yellow-600" bgClass="bg-yellow-50" ringClass="peer-focus:ring-yellow-300" checkedClass="peer-checked:bg-yellow-500" />
                <CustomToggle label="Smart Thermostat" name="hasSmartThermostat" checked={formData.hasSmartThermostat} points={6} icon={Thermometer} colorClass="text-yellow-600" bgClass="bg-yellow-50" ringClass="peer-focus:ring-yellow-300" checkedClass="peer-checked:bg-yellow-500" />
              </div>
            </div>

            {/* Water Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <Droplet size={20} className="mr-2 text-blue-500" /> Water
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomToggle label="Water-Saving Fixtures" name="hasWaterFixtures" checked={formData.hasWaterFixtures} points={8} icon={Droplet} colorClass="text-blue-600" bgClass="bg-blue-50" ringClass="peer-focus:ring-blue-300" checkedClass="peer-checked:bg-blue-500" />
                <CustomToggle label="Rainwater Collection" name="hasRainwater" checked={formData.hasRainwater} points={7} icon={CloudRain} colorClass="text-blue-600" bgClass="bg-blue-50" ringClass="peer-focus:ring-blue-300" checkedClass="peer-checked:bg-blue-500" />
                <CustomToggle label="Pool Cover" name="hasPoolCover" checked={formData.hasPoolCover} points={5} icon={Waves} colorClass="text-blue-600" bgClass="bg-blue-50" ringClass="peer-focus:ring-blue-300" checkedClass="peer-checked:bg-blue-500" />
              </div>
            </div>

            {/* Waste Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <Recycle size={20} className="mr-2 text-emerald-500" /> Waste
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomToggle label="Recycling Bins" name="hasRecycling" checked={formData.hasRecycling} points={7} icon={Recycle} />
                <CustomToggle label="Composting" name="hasComposting" checked={formData.hasComposting} points={7} icon={Sprout} />
                <CustomToggle label="No Single-Use Plastic" name="hasNoPlastic" checked={formData.hasNoPlastic} points={6} icon={Ban} />
              </div>
            </div>

            {/* Local & Community Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <Store size={20} className="mr-2 text-orange-500" /> Local & Community
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomToggle label="Local Sourcing" name="hasLocalSourcing" checked={formData.hasLocalSourcing} points={6} icon={Store} colorClass="text-orange-600" bgClass="bg-orange-50" ringClass="peer-focus:ring-orange-300" checkedClass="peer-checked:bg-orange-500" />
                <CustomToggle label="Local Staff" name="hasLocalStaff" checked={formData.hasLocalStaff} points={5} icon={Users} colorClass="text-orange-600" bgClass="bg-orange-50" ringClass="peer-focus:ring-orange-300" checkedClass="peer-checked:bg-orange-500" />
                <CustomToggle label="Local Charities" name="hasLocalCharity" checked={formData.hasLocalCharity} points={4} icon={HeartHandshake} colorClass="text-orange-600" bgClass="bg-orange-50" ringClass="peer-focus:ring-orange-300" checkedClass="peer-checked:bg-orange-500" />
              </div>
            </div>

            {/* Transport Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <Bus size={20} className="mr-2 text-purple-500" /> Transport
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomToggle label="EV Charging Station" name="hasEvCharging" checked={formData.hasEvCharging} points={6} icon={Car} colorClass="text-purple-600" bgClass="bg-purple-50" ringClass="peer-focus:ring-purple-300" checkedClass="peer-checked:bg-purple-500" />
                <CustomToggle label="Bikes Available" name="hasBikes" checked={formData.hasBikes} points={5} icon={Bike} colorClass="text-purple-600" bgClass="bg-purple-50" ringClass="peer-focus:ring-purple-300" checkedClass="peer-checked:bg-purple-500" />
                <CustomToggle label="Public Transport Info" name="hasPublicTransport" checked={formData.hasPublicTransport} points={4} icon={Bus} colorClass="text-purple-600" bgClass="bg-purple-50" ringClass="peer-focus:ring-purple-300" checkedClass="peer-checked:bg-purple-500" />
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <FileText size={20} className="mr-2 text-gray-500" /> Notes
              </h3>
              <textarea 
                name="notes" 
                value={formData.notes} 
                onChange={handleChange} 
                rows={3} 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none bg-white" 
                placeholder="Add any internal notes regarding the eco-friendly status of this unit..."
              ></textarea>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isSubmitting} className="flex items-center px-8 py-3.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
                {isSubmitting && <Loader2 size={16} className="mr-2 animate-spin" />}
                {isSubmitting ? 'Saving Score...' : 'Save Green Score'}
              </button>
            </div>

          </form>
        </div>

        {/* Right Side: Sticky Score Visualization */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl shadow-md p-6 sticky top-6">
            <h3 className="text-center text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">Total Impact Score</h3>
            
            <div className="relative flex justify-center items-center mb-6">
              <svg className="w-40 h-40 transform -rotate-90">
                <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="14" fill="transparent" className="text-gray-100" />
                <circle 
                  cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="14" fill="transparent" 
                  strokeDasharray="452.39" 
                  strokeDashoffset={452.39 - (452.39 * (currentScore / MAX_SCORE))} 
                  className={`transition-all duration-1000 ease-out ${
                    currentScore >= 80 ? 'text-emerald-500' : currentScore >= 50 ? 'text-yellow-400' : 'text-orange-400'
                  }`} 
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-gray-900">{currentScore}</span>
                <span className="text-sm text-gray-500 font-bold mt-1">/ {MAX_SCORE}</span>
              </div>
            </div>

            <div className="text-center mb-6">
              {currentScore >= 80 ? (
                <div className="inline-flex items-center px-4 py-1.5 bg-emerald-100 text-emerald-800 text-sm font-bold rounded-full">
                  <CheckCircle2 size={18} className="mr-1.5" /> Eco Leader
                </div>
              ) : currentScore >= 50 ? (
                <div className="inline-flex items-center px-4 py-1.5 bg-yellow-100 text-yellow-800 text-sm font-bold rounded-full">
                  <Leaf size={18} className="mr-1.5" /> Making an Effort
                </div>
              ) : (
                <div className="inline-flex items-center px-4 py-1.5 bg-orange-100 text-orange-800 text-sm font-bold rounded-full">
                  <Sprout size={18} className="mr-1.5" /> Getting Started
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
              <h4 className="text-sm font-bold text-gray-900 mb-2">Why this matters</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Properties with a score of 80+ attract environmentally conscious travelers and qualify for special sustainability badges on booking channels like Airbnb and Booking.com.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}