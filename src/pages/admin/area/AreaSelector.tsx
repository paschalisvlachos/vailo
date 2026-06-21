import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import {
  Globe,
  MapPin,
  Grid,
  Layers,
  Map as MapIcon,
  Briefcase,
  Image as ImageIcon,
  ArrowRight,
  Plus,
  Loader2,
  Radar,
  Footprints,
} from 'lucide-react';
import AreaLanguagesCard from '../../../components/admin/AreaLanguagesCard';
import { loadCountryNames } from '../../../lib/countryNames';
import AdminPageHeader, {
  AdminCard,
  AdminButton,
  AdminLabel,
  AdminSelect,
  AdminInput,
  AdminSection,
} from '../../../components/admin/AdminPageHeader';

type AreaOption = { id: string; name: string };

const MODULES = [
  { id: 'local-gems-categories', title: 'Local Gems Categories', icon: Grid, desc: 'Category structure for local recommendations' },
  { id: 'local-gems', title: 'Local Gems', icon: MapIcon, desc: 'Add restaurants, beaches, and experiences' },
  { id: 'discovered-places', title: 'Discovered Places', icon: Radar, desc: 'Review AI-imported venues from guest plans' },
  { id: 'local-trails', title: 'Local Trails', icon: Footprints, desc: 'Sync hiking trails from AllTrails for this area' },
  { id: 'features-categories', title: 'Features Categories', icon: Layers, desc: 'Category structure for local features' },
  { id: 'features', title: 'Master Features', icon: Briefcase, desc: 'Car rentals, chefs, transfers, and more' },
  { id: 'features-photos', title: 'Features Photos', icon: ImageIcon, desc: 'Default stock photos for features' },
];

export default function AreaSelector() {
  const navigate = useNavigate();
  const toast = useToast();

  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState(localStorage.getItem('vailo_admin_country') || '');
  const [dbAreas, setDbAreas] = useState<AreaOption[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch((err) => {
        console.error('Failed to load countries:', err);
        setIsLoadingCountries(false);
      })
      .finally(() => setIsLoadingCountries(false));
  }, []);

  useEffect(() => {
    if (!selectedCountry) {
      setDbAreas([]);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'countries', selectedCountry, 'areas'), (snapshot) => {
      const areasData = snapshot.docs
        .map((d) => ({
          id: d.id,
          name: String(d.data().name || d.id).trim() || d.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setDbAreas(areasData);
    });

    return () => unsubscribe();
  }, [selectedCountry]);

  useEffect(() => {
    if (dbAreas.length === 0) {
      setSelectedAreaId('');
      return;
    }
    const stored = localStorage.getItem('vailo_admin_area') || '';
    const match =
      dbAreas.find((a) => a.id === stored) ||
      dbAreas.find((a) => a.name === stored) ||
      dbAreas.find((a) => a.id === stored.toLowerCase().replace(/\s+/g, '-'));
    setSelectedAreaId(match?.id || '');
  }, [dbAreas]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedCountry(val);
    localStorage.setItem('vailo_admin_country', val);
    setSelectedAreaId('');
    localStorage.removeItem('vailo_admin_area');
  };

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedAreaId(val);
    localStorage.setItem('vailo_admin_area', val);
  };

  const handleAddArea = async () => {
    if (!newAreaName.trim() || !selectedCountry) return;

    const isDuplicate = dbAreas.some(
      (area) => area.name.toLowerCase() === newAreaName.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast.warning('This area already exists in the database.');
      return;
    }

    setIsAddingArea(true);
    try {
      const areaId = newAreaName.trim().toLowerCase().replace(/\s+/g, '-');
      const finalName = newAreaName.trim();

      await setDoc(doc(db, 'countries', selectedCountry, 'areas', areaId), {
        name: finalName,
        createdAt: new Date().toISOString(),
      });

      setNewAreaName('');
      setSelectedAreaId(areaId);
      localStorage.setItem('vailo_admin_area', areaId);
    } catch (error) {
      console.error('Error adding area:', error);
      toast.error('Failed to add area to database.');
    } finally {
      setIsAddingArea(false);
    }
  };

  const selectedArea = dbAreas.find((a) => a.id === selectedAreaId);
  const isReady = selectedCountry.trim() !== '' && !!selectedArea;

  const handleCategoryClick = (categoryPath: string) => {
    if (!isReady || !selectedArea) return;
    navigate(
      adminPath(
        `/area/${encodeURIComponent(selectedCountry)}/${encodeURIComponent(selectedArea.id)}/${categoryPath}`
      )
    );
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Area Functionality"
        description="Configure databases, AI rules, and services by location"
        icon={<Globe size={26} />}
      />

      <AdminSection title="Select target location" icon={<MapPin size={18} className="text-vailo-teal/60" />} className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <div>
            <AdminLabel>1. Select country</AdminLabel>
            <AdminSelect value={selectedCountry} onChange={handleCountryChange} disabled={isLoadingCountries}>
              <option value="" disabled>
                {isLoadingCountries ? 'Loading countries…' : 'Choose a country'}
              </option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </AdminSelect>
          </div>

          <div className={`transition-opacity duration-300 ${selectedCountry ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <AdminLabel>2. Select area / municipality</AdminLabel>
            <AdminSelect value={selectedAreaId} onChange={handleAreaChange} className="mb-3">
              <option value="" disabled>
                {dbAreas.length === 0 ? 'No areas found — add one below' : 'Choose an existing area'}
              </option>
              {dbAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </AdminSelect>

            <div className="flex gap-2">
              <AdminInput
                type="text"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Or type a new area name…"
                onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                className="flex-1"
              />
              <AdminButton onClick={handleAddArea} disabled={isAddingArea || !newAreaName.trim()} className="shrink-0">
                {isAddingArea ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add
              </AdminButton>
            </div>
          </div>
        </div>
      </AdminSection>

      {isReady && (
        <div className="mb-8">
          <AreaLanguagesCard
            country={selectedCountry}
            areaId={selectedArea.id}
            areaName={selectedArea.name}
          />
        </div>
      )}

      <div>
        <h3 className={`text-lg font-bold font-luxury mb-5 ${isReady ? 'text-vailo-dark' : 'text-gray-400'}`}>
          Configuration modules
        </h3>

        {!isReady && (
          <AdminCard className="p-10 text-center mb-6 border-dashed border-gray-200 bg-vailo-surface-elevated">
            <Globe className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-gray-500 font-medium">Select a country and area above to unlock modules.</p>
          </AdminCard>
        )}

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 transition-all duration-300 ${
            isReady ? 'opacity-100' : 'opacity-35 grayscale'
          }`}
        >
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              disabled={!isReady}
              onClick={() => handleCategoryClick(mod.id)}
              className="admin-module-card group disabled:cursor-not-allowed disabled:hover:border-gray-100"
            >
              <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
                <mod.icon size={20} />
              </div>
              <h4 className="text-base font-bold text-vailo-dark font-luxury mb-1.5">{mod.title}</h4>
              <p className="text-sm text-gray-500 mb-5 flex-1 leading-relaxed">{mod.desc}</p>
              <span className="inline-flex items-center text-sm font-semibold text-vailo-teal group-hover:text-vailo-gold transition-colors">
                Configure <ArrowRight size={15} className="ml-1.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
