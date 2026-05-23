import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  Globe, MapPin, Sparkles, Grid, Layers, 
  Map as MapIcon, Briefcase, Image as ImageIcon, ArrowRight, Plus, Loader2, Radar
} from 'lucide-react';

export default function AreaSelector() {
  const navigate = useNavigate();
  
  // 1. Initialize State from LocalStorage (Memory)
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState(localStorage.getItem('vailo_admin_country') || '');
  
  const [dbAreas, setDbAreas] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState(localStorage.getItem('vailo_admin_area') || '');
  
  const [newAreaName, setNewAreaName] = useState('');
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  // 2. Fetch all global countries from free API
  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name')
      .then(res => res.json())
      .then(data => {
        const countryNames = data
          .map((c: any) => c.name.common)
          .sort((a: string, b: string) => a.localeCompare(b));
        setCountries(countryNames);
        setIsLoadingCountries(false);
      })
      .catch(err => {
        console.error("Failed to fetch countries:", err);
        setIsLoadingCountries(false);
      });
  }, []);

  // 3. Fetch existing Areas from Firestore when a Country is selected
  useEffect(() => {
    if (!selectedCountry) {
      setDbAreas([]);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'countries', selectedCountry, 'areas'), (snapshot) => {
      const areasData = snapshot.docs.map(doc => doc.data().name);
      areasData.sort((a, b) => a.localeCompare(b));
      setDbAreas(areasData);
    });

    return () => unsubscribe();
  }, [selectedCountry]);

  // --- Handlers for saving to LocalStorage instantly ---
  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedCountry(val);
    localStorage.setItem('vailo_admin_country', val);
    
    // When changing countries, wipe the old area memory
    setSelectedArea('');
    localStorage.removeItem('vailo_admin_area');
  };

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedArea(val);
    localStorage.setItem('vailo_admin_area', val);
  };

  // 4. Add a new Area to Firestore
  const handleAddArea = async () => {
    if (!newAreaName.trim() || !selectedCountry) return;
    
    const isDuplicate = dbAreas.some(area => area.toLowerCase() === newAreaName.trim().toLowerCase());
    if (isDuplicate) {
      alert("This area already exists in the database.");
      return;
    }

    setIsAddingArea(true);
    try {
      const areaId = newAreaName.trim().toLowerCase().replace(/\s+/g, '-');
      const finalName = newAreaName.trim();

      await setDoc(doc(db, 'countries', selectedCountry, 'areas', areaId), {
        name: finalName,
        createdAt: new Date().toISOString()
      });

      setNewAreaName('');
      setSelectedArea(finalName); 
      localStorage.setItem('vailo_admin_area', finalName); // Remember the new area!
      
    } catch (error) {
      console.error("Error adding area:", error);
      alert("Failed to add area to database.");
    } finally {
      setIsAddingArea(false);
    }
  };

  const isReady = selectedCountry.trim() !== '' && selectedArea.trim() !== '';

  const handleCategoryClick = (categoryPath: string) => {
    if (!isReady) return;
    const encodedCountry = encodeURIComponent(selectedCountry);
    const encodedArea = encodeURIComponent(selectedArea);
    navigate(`/area/${encodedCountry}/${encodedArea}/${categoryPath}`);
  };

  const categories = [
    { id: 'ai-categories', title: 'AI Categories', icon: <Sparkles size={24} className="text-purple-600" />, desc: 'Manage AI prompt rules for this area', color: 'bg-purple-50 border-purple-200' },
    { id: 'local-gems-categories', title: 'Local Gems Categories', icon: <Grid size={24} className="text-blue-600" />, desc: 'Category structure for local recommendations', color: 'bg-blue-50 border-blue-200' },
    { id: 'local-gems', title: 'Local Gems', icon: <MapIcon size={24} className="text-orange-600" />, desc: 'Add restaurants, beaches, etc. for this area', color: 'bg-orange-50 border-orange-200' },
    { id: 'discovered-places', title: 'Discovered Places', icon: <Radar size={24} className="text-amber-600" />, desc: 'Review AI-imported venues from guest plans', color: 'bg-amber-50 border-amber-200' },
    { id: 'features-categories', title: 'Features Categories', icon: <Layers size={24} className="text-emerald-600" />, desc: 'Category structure for local features', color: 'bg-emerald-50 border-emerald-200' },
    { id: 'features', title: 'Master Features', icon: <Briefcase size={24} className="text-indigo-600" />, desc: 'Add car rentals, chefs, transfers, etc.', color: 'bg-indigo-50 border-indigo-200' },
    { id: 'features-photos', title: 'Features Photos', icon: <ImageIcon size={24} className="text-pink-600" />, desc: 'Manage default stock photos for features', color: 'bg-pink-50 border-pink-200' },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Globe className="mr-3 text-blue-600" size={28} />
          Area Functionality
        </h2>
        <p className="text-gray-500 mt-1">Configure global databases, AI rules, and services by specific locations.</p>
      </div>

      {/* Location Database Selector */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center border-b border-gray-100 pb-4">
          <MapPin className="mr-2 text-gray-400" size={20} />
          Select Target Location
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Column 1: Country */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">1. Select Country</label>
            <select 
              value={selectedCountry}
              onChange={handleCountryChange}
              disabled={isLoadingCountries}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none disabled:opacity-50 transition-colors shadow-sm"
            >
              <option value="" disabled>{isLoadingCountries ? 'Loading countries...' : 'Choose a country'}</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>

          {/* Column 2: Area / Municipality */}
          <div className={`transition-opacity duration-300 ${selectedCountry ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}`}>
            <label className="block text-sm font-bold text-gray-700 mb-2">2. Select Area / Municipality</label>
            
            <select 
              value={selectedArea}
              onChange={handleAreaChange}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-colors shadow-sm mb-3"
            >
              <option value="" disabled>
                {dbAreas.length === 0 ? 'No areas found. Please add one below.' : 'Choose an existing area'}
              </option>
              {dbAreas.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>

            {/* The "Add New Area" Quick Form */}
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Or type a new area name..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button 
                onClick={handleAddArea}
                disabled={isAddingArea || !newAreaName.trim()}
                className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isAddingArea ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} className="mr-1" />}
                Add
              </button>
            </div>
            
          </div>
        </div>
      </div>

      {/* Configuration Categories */}
      <div>
        <h3 className={`text-lg font-bold mb-4 transition-opacity duration-300 ${isReady ? 'text-gray-900' : 'text-gray-400'}`}>
          Select Configuration Module
        </h3>
        
        {!isReady && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center mb-6">
            <Globe className="mx-auto text-gray-400 mb-2" size={32} />
            <p className="text-gray-500 font-medium">Please select a Country and an Area above to unlock modules.</p>
          </div>
        )}

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-300 ${isReady ? 'opacity-100 pointer-events-auto' : 'opacity-40 pointer-events-none grayscale'}`}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex flex-col items-start p-6 text-left rounded-xl border hover:shadow-md transition-all ${cat.color} bg-opacity-50 hover:bg-opacity-100`}
            >
              <div className="p-3 bg-white rounded-lg shadow-sm mb-4">
                {cat.icon}
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">{cat.title}</h4>
              <p className="text-sm text-gray-600 mb-4 flex-1">{cat.desc}</p>
              
              <div className="w-full flex justify-end">
                <div className="flex items-center text-sm font-bold text-gray-900">
                  Configure <ArrowRight size={16} className="ml-1" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}