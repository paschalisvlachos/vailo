import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { PropertyOutletContext } from './PropertyLayout';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { 
  Building, BookOpen, Key, ScrollText, Zap, Lightbulb, Thermometer, 
  Droplets, BedDouble, ChefHat, Flame, Waves, Wifi, WashingMachine, 
  Trash2, ShieldAlert, Sparkles, Box, Wrench, MessageCircleQuestion,
  Loader2, Save, Plus, MapPin, CheckCircle2, Circle, ArrowRight, X, Edit3,
  Star, Link2
} from 'lucide-react';
import {
  PORTAL_FEATURED_CAP,
  buildSourceTextForFeaturedKey,
  featuredKeyForPrimaryCategory,
  getFeaturedConfig,
  pairedFeaturedKeyForCategory,
  shortContentHash,
  type FeaturedKey,
  type FeaturedPreviewRecord,
  type FeaturedPreviewsMap,
} from '../../../lib/houseGuidePortal';
import { generateFeaturedPreview } from '../../../lib/houseGuidePreviewAi';
import { useToast } from '../../../context/ToastContext';

// --- TYPE DEFINITIONS ---
type Device = { room: string; device: string; brand: string; model: string };
type MapLocation = { title: string; mapsLink: string };
type Emergency = { category: string; title: string; phone: string; mapsLink: string };
type FAQ = { question: string; answer: string };
type ArrayItem = Device | MapLocation | Emergency | FAQ;

type FormData = Record<string, string | ArrayItem[] | undefined>;

type PropertyType = {
  id: string;
  propertyTypeName?: string;
};

type FieldDef = {
  id: string;
  label: string;
  type: 'textarea' | 'array_devices' | 'array_maps' | 'array_emergencies' | 'array_faqs';
  placeholder?: string;
  options?: string[]; // For dropdowns in arrays
};

type CategoryDef = {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  fields: FieldDef[];
};

// --- CONSTANTS & OPTIONS ---
const ROOM_OPTIONS = ["Kitchen", "Living Room", "Dining Room", "Master Bedroom", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Bathroom", "Master Bathroom", "Balcony", "Pool Area", "Laundry Room", "Garage", "Other"];
const WASTE_OPTIONS = ["General Garbage Bin", "Recycling Bin (Blue)", "Glass Recycling (Bell)", "Compost", "Other"];
const USEFUL_MAP_OPTIONS = ["Nearest Supermarket", "Mini Market / Kiosk", "Bakery", "Pharmacy", "Gas Station", "ATM", "Butcher", "Other"];
const EMERGENCY_OPTIONS = ["Pharmacy", "Hospital/Clinic", "Police", "Fire Dept", "Doctor", "Paediatrician", "Other"];

// --- MASTER CATEGORY CONFIGURATION ---
const CATEGORIES: CategoryDef[] = [
  { id: 'arrival', title: '1. Arrival & Check-in', icon: Key, description: 'Check-in times, lockbox codes, parking, and directions.', fields: [{ id: 'arrivalInfo', label: 'Arrival & Check-in Information', type: 'textarea', placeholder: 'Check-in is at 15:00. The lockbox is...' }] },
  { id: 'checkout', title: '2. Check-out Instructions', icon: ArrowRight, description: 'Check-out times, key return, and departure duties.', fields: [{ id: 'checkoutInfo', label: 'Check-out & Departure Information', type: 'textarea', placeholder: 'Check-out is at 11:00. Please leave keys...' }] },
  { id: 'power', title: '3. Electricity & Power', icon: Zap, description: 'Panels, outages, and emergency lighting.', fields: [ { id: 'electricalPanel', label: 'Electrical Panel', type: 'textarea' }, { id: 'powerOutage', label: 'Power Outage', type: 'textarea' }, { id: 'garageManual', label: 'Garage Door During Outage', type: 'textarea' }, { id: 'emergencyLighting', label: 'Emergency Lighting', type: 'textarea' } ] },
  { id: 'lighting', title: '4. Lighting', icon: Lightbulb, description: 'Indoor and outdoor lighting instructions.', fields: [ { id: 'indoorLights', label: 'Indoor Lights', type: 'textarea' }, { id: 'outdoorLights', label: 'Outdoor / Garden Lights', type: 'textarea' } ] },
  { id: 'hvac', title: '5. A/C & Heating', icon: Thermometer, description: 'Climate control instructions.', fields: [ { id: 'acInstructions', label: 'Air Conditioning', type: 'textarea' }, { id: 'heatingInstructions', label: 'Heating', type: 'textarea' } ] },
  { id: 'bathrooms', title: '6. Hot Water & Bathrooms', icon: Droplets, description: 'Boilers, amenities, and usage rules.', fields: [ { id: 'hotWater', label: 'Hot Water', type: 'textarea' }, { id: 'bathroomAmenities', label: 'Bathroom Amenities', type: 'textarea' }, { id: 'toiletRules', label: 'Toilet Instructions', type: 'textarea' } ] },
  { id: 'bedrooms', title: '7. Bedrooms & Linen', icon: BedDouble, description: 'Sleeping arrangements and extra linens.', fields: [ { id: 'bedroomDetails', label: 'Bedroom Information', type: 'textarea' }, { id: 'extraLinen', label: 'Extra Pillows & Blankets', type: 'textarea' } ] },
  { id: 'kitchen', title: '8. Kitchen', icon: ChefHat, description: 'Equipment, supplies, and appliances.', fields: [ { id: 'kitchenEquipment', label: 'Kitchen Equipment', type: 'textarea' }, { id: 'applianceInstructions', label: 'Appliance Instructions', type: 'textarea' }, { id: 'applianceModels', label: 'Appliance Models', type: 'textarea' }, { id: 'includedSupplies', label: 'Included Supplies', type: 'textarea' }, { id: 'neededSupplies', label: 'Additional Supplies Needed', type: 'textarea' } ] },
  { id: 'bbq', title: '9. BBQ & Outdoor Area', icon: Flame, description: 'BBQ type, fuel, and safety.', fields: [ { id: 'bbqType', label: 'BBQ Type', type: 'textarea' }, { id: 'bbqInstructions', label: 'BBQ Instructions', type: 'textarea' } ] },
  { id: 'pool', title: '10. Pool & Jacuzzi', icon: Waves, description: 'Pool rules, heating, and jacuzzi controls.', fields: [ { id: 'poolInfo', label: 'Pool Information', type: 'textarea' }, { id: 'jacuzziInstructions', label: 'Jacuzzi Instructions', type: 'textarea' } ] },
  { id: 'entertainment', title: '11. Wi-Fi & Entertainment', icon: Wifi, description: 'Internet, Smart TVs, and sound systems.', fields: [ { id: 'wifiInfo', label: 'Wi-Fi Information', type: 'textarea' }, { id: 'tvStreaming', label: 'TV & Streaming Services', type: 'textarea' }, { id: 'entertainmentModels', label: 'Entertainment Device Models', type: 'textarea' } ] },
  { id: 'laundry', title: '12. Laundry', icon: WashingMachine, description: 'Washing machines, dryers, and irons.', fields: [ { id: 'washingMachine', label: 'Washing Machine', type: 'textarea' }, { id: 'dryerIron', label: 'Dryer / Iron', type: 'textarea' } ] },
  { id: 'rules', title: '13. House Rules', icon: ScrollText, description: 'General rules and quiet hours.', fields: [ { id: 'houseRules', label: 'House Rules', type: 'textarea' }, { id: 'quietHours', label: 'Quiet Hours', type: 'textarea' } ] },
  { id: 'waste', title: '14. Waste & Recycling', icon: Trash2, description: 'Disposal rules and bin locations on the map.', fields: [ { id: 'garbageDisposal', label: 'Garbage Disposal', type: 'textarea' }, { id: 'recycling', label: 'Recycling', type: 'textarea' }, { id: 'wasteLocations', label: 'Bin Map Locations', type: 'array_maps', options: WASTE_OPTIONS } ] },
  { id: 'safety', title: '15. Safety & Emergency', icon: ShieldAlert, description: 'Procedures, contacts, and safe box.', fields: [ { id: 'emergencyInfo', label: 'Emergency Information', type: 'textarea' }, { id: 'safeBox', label: 'Safe Box Instructions', type: 'textarea' }, { id: 'emergencyContacts', label: 'Emergency Numbers & Map Pins', type: 'array_emergencies', options: EMERGENCY_OPTIONS } ] },
  { id: 'cleaning', title: '16. Cleaning & Maintenance', icon: Sparkles, description: 'Housekeeping and maintenance issues.', fields: [ { id: 'cleaningService', label: 'Cleaning Service', type: 'textarea' }, { id: 'maintenanceIssues', label: 'Maintenance Issues', type: 'textarea' } ] },
  { id: 'supplies', title: '17. Extra Supplies & Useful Items', icon: Box, description: 'Batteries, mosquito gear, and local shops.', fields: [ { id: 'extraBatteries', label: 'Extra Batteries', type: 'textarea' }, { id: 'mosquitoEquipment', label: 'Mosquito Equipment', type: 'textarea' }, { id: 'flashlights', label: 'Flashlights & Candles', type: 'textarea' }, { id: 'remoteControls', label: 'Remote Controls', type: 'textarea' }, { id: 'spareKeys', label: 'Spare Keys', type: 'textarea' }, { id: 'generalItems', label: 'General Useful Items', type: 'textarea' }, { id: 'usefulLocations', label: 'Useful Local Map Pins', type: 'array_maps', options: USEFUL_MAP_OPTIONS } ] },
  { id: 'devices', title: '18. Property Devices & Equipment', icon: Wrench, description: 'Detailed list of electrical and smart devices.', fields: [ { id: 'electricalAppliances', label: 'Electrical Appliances', type: 'textarea' }, { id: 'smartHomeDevices', label: 'Smart Home Devices', type: 'textarea' }, { id: 'devicesList', label: 'Appliance Inventory', type: 'array_devices' } ] },
  { id: 'faq', title: '19. Frequently Asked Questions', icon: MessageCircleQuestion, description: 'Common guest questions and answers.', fields: [ { id: 'faqsList', label: 'Common Guest Questions', type: 'array_faqs' } ] }
];

export default function HouseGuide() {
  const { propertyId, propertyAccess, lockedListingId } =
    useOutletContext<PropertyOutletContext>();
  const toast = useToast();
  const isListingOnly = propertyAccess.level === 'listing_only';
  
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  // --- STATE MANAGEMENT ---
  const [formData, setFormData] = useState<FormData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [featuredOnPortal, setFeaturedOnPortal] = useState<FeaturedKey[]>([]);
  const [featuredPreviews, setFeaturedPreviews] = useState<FeaturedPreviewsMap>({});

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  // Quick Edit Modal State (Dashboard)
  const [quickEditCategory, setQuickEditCategory] = useState<CategoryDef | null>(null);

  const allowedPropertyTypes = useMemo(() => {
    if (!isListingOnly) return propertyTypes;
    return propertyTypes.filter((t) => propertyAccess.typeIds.includes(t.id));
  }, [propertyTypes, isListingOnly, propertyAccess]);

  // 1. Fetch Property Types
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PropertyType));
      setPropertyTypes(typesData);
    });
    return () => unsubscribe();
  }, [propertyId]);

  useEffect(() => {
    if (lockedListingId) {
      setSelectedTypeId(lockedListingId);
      return;
    }
    if (allowedPropertyTypes.length > 0) {
      setSelectedTypeId((prev) =>
        prev && allowedPropertyTypes.some((t) => t.id === prev)
          ? prev
          : allowedPropertyTypes[0].id
      );
    }
  }, [lockedListingId, allowedPropertyTypes]);

  // 2. Fetch Data
  useEffect(() => {
    if (!propertyId || !selectedTypeId) return;
    const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const raw = (docSnap.data() as Record<string, unknown>) || {};
        const { featuredOnPortal: featuredRaw, previews: previewsRaw, ...rest } = raw as {
          featuredOnPortal?: unknown;
          previews?: unknown;
        } & Record<string, unknown>;

        const guideRecord = rest as Record<string, unknown>;
        setFormData(rest as FormData);
        setFeaturedOnPortal(
          Array.isArray(featuredRaw)
            ? (featuredRaw as unknown[])
                .filter((k): k is string => typeof k === 'string')
                .filter((k): k is FeaturedKey => !!getFeaturedConfig(k))
                .filter((k) =>
                  buildSourceTextForFeaturedKey(k, guideRecord, (categoryId) => {
                    const cat = CATEGORIES.find((c) => c.id === categoryId);
                    return cat ? cat.fields : [];
                  }).trim().length > 0
                )
                .slice(0, PORTAL_FEATURED_CAP)
            : []
        );
        setFeaturedPreviews(
          previewsRaw && typeof previewsRaw === 'object'
            ? (previewsRaw as FeaturedPreviewsMap)
            : {}
        );
      } else {
        setFormData({});
        setFeaturedOnPortal([]);
        setFeaturedPreviews({});
      }
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  // --- LOGIC HELPERS ---
  const fieldHasContent = useCallback((field: FieldDef) => {
    const val = formData[field.id];
    if (field.type.startsWith('array_')) return Array.isArray(val) && val.length > 0;
    return typeof val === 'string' && val.trim().length > 0;
  }, [formData]);

  const checkIsComplete = useCallback(
    (category: CategoryDef) => category.fields.every(fieldHasContent),
    [fieldHasContent]
  );

  const getCategoryCompletion = useCallback(
    (category: CategoryDef): 'complete' | 'partial' | 'empty' => {
      const filledCount = category.fields.filter(fieldHasContent).length;
      if (filledCount === 0) return 'empty';
      if (filledCount === category.fields.length) return 'complete';
      return 'partial';
    },
    [fieldHasContent]
  );

  const getWizardSteps = useMemo(() => {
    if (!showIncompleteOnly) return CATEGORIES;
    return CATEGORIES.filter((cat) => !checkIsComplete(cat));
  }, [showIncompleteOnly, checkIsComplete]);

  const progressPercentage = Math.round((CATEGORIES.filter(checkIsComplete).length / CATEGORIES.length) * 100);

  // --- FEATURED PORTAL HELPERS ---
  const fieldsForCategoryId = useCallback(
    (categoryId: string) => {
      const cat = CATEGORIES.find((c) => c.id === categoryId);
      return cat ? cat.fields : [];
    },
    []
  );

  const hasFeaturedContent = useCallback(
    (key: FeaturedKey) =>
      buildSourceTextForFeaturedKey(
        key,
        formData as Record<string, unknown>,
        fieldsForCategoryId
      ).trim().length > 0,
    [formData, fieldsForCategoryId]
  );

  // Drop featured keys locally when their source content is cleared (star stays hidden).
  useEffect(() => {
    if (!selectedTypeId) return;
    setFeaturedOnPortal((prev) => {
      const next = prev.filter((k) => hasFeaturedContent(k));
      return next.length === prev.length ? prev : next;
    });
  }, [formData, hasFeaturedContent, selectedTypeId]);

  const isFeaturedToggled = useCallback(
    (key: FeaturedKey) => featuredOnPortal.includes(key),
    [featuredOnPortal]
  );

  const featuredCount = featuredOnPortal.length;
  const featuredCapReached = featuredCount >= PORTAL_FEATURED_CAP;

  const computeNextFeatured = useCallback(
    (key: FeaturedKey, prev: FeaturedKey[]): FeaturedKey[] | null => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (!hasFeaturedContent(key)) {
        toast.warning('Add content to this section before featuring it on the guest portal.');
        return null;
      }
      if (prev.length >= PORTAL_FEATURED_CAP) {
        toast.warning(
          `Up to ${PORTAL_FEATURED_CAP} sections can be featured. Deselect one first.`
        );
        return null;
      }
      return [...prev, key];
    },
    [toast, hasFeaturedContent]
  );

  const updateCustomPreview = useCallback(
    (key: FeaturedKey, value: string) => {
      setFeaturedPreviews((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          customPreviewLine: value,
        },
      }));
    },
    []
  );

  // --- SAVE ACTIONS ---
  const regeneratePreviewsIfStale = useCallback(
    async (
      data: FormData,
      featured: FeaturedKey[],
      previews: FeaturedPreviewsMap
    ): Promise<FeaturedPreviewsMap> => {
      const next: FeaturedPreviewsMap = { ...previews };
      const guideRecord = data as Record<string, unknown>;

      for (const key of featured) {
        const cfg = getFeaturedConfig(key);
        if (!cfg) continue;

        const sourceText = buildSourceTextForFeaturedKey(key, guideRecord, fieldsForCategoryId);
        const hash = await shortContentHash(sourceText);

        const cached = next[key];
        const hasFreshCache =
          cached && cached.contentHash === hash && (cached.previewLine || cached.digest);

        if (sourceText.trim() && !hasFreshCache) {
          try {
            const result = await generateFeaturedPreview(cfg.title, sourceText);
            next[key] = {
              ...(cached || {}),
              previewLine: result.previewLine,
              digest: result.digest,
              contentHash: hash,
              generatedAt: new Date().toISOString(),
            };
          } catch (err) {
            console.error('generateFeaturedPreview failed for', key, err);
            // Keep any previously cached preview; just leave hash unchanged
          }
        } else if (!sourceText.trim()) {
          next[key] = {
            ...(cached || {}),
            previewLine: '',
            digest: '',
            contentHash: hash,
            generatedAt: cached?.generatedAt,
          };
        }
      }

      return next;
    },
    [fieldsForCategoryId]
  );

  const saveToFirebase = async (featuredOverride?: FeaturedKey[]) => {
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    try {
      const featured = (featuredOverride ?? featuredOnPortal)
        .filter((k) => hasFeaturedContent(k))
        .slice(0, PORTAL_FEATURED_CAP);
      const updatedPreviews = await regeneratePreviewsIfStale(formData, featured, featuredPreviews);
      setFeaturedPreviews(updatedPreviews);
      setFeaturedOnPortal(featured);

      const docRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'houseGuide', 'data');
      await setDoc(
        docRef,
        {
          ...formData,
          featuredOnPortal: featured,
          previews: updatedPreviews,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error saving:", error);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeaturedToggleAndSave = async (key: FeaturedKey) => {
    if (isSubmitting) return;
    const next = computeNextFeatured(key, featuredOnPortal);
    if (!next) return;
    setFeaturedOnPortal(next);
    await saveToFirebase(next);
  };

  const handleWizardSaveAndNext = async () => {
    await saveToFirebase();
    if (wizardStepIndex < getWizardSteps.length - 1) {
      setWizardStepIndex(prev => prev + 1);
    } else {
      setIsWizardOpen(false);
    }
  };

  const handleWizardSkip = () => {
    if (wizardStepIndex < getWizardSteps.length - 1) {
      setWizardStepIndex(prev => prev + 1);
    } else {
      setIsWizardOpen(false);
    }
  };

  // --- FORM FIELD RENDERING ---
  const renderField = (field: FieldDef) => {
    const value = formData[field.id];

    if (field.type === 'textarea') {
      const textValue = typeof value === 'string' ? value : '';
      return (
        <div key={field.id} className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">{field.label}</label>
          <textarea 
            value={textValue} 
            onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
            placeholder={field.placeholder || ''}
            rows={4} 
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0B4F5C] outline-none text-sm text-gray-800 transition-shadow bg-gray-50/50 focus:bg-white" 
          />
        </div>
      );
    }

    // Dynamic Array Rendering
    const items: ArrayItem[] = Array.isArray(value) ? value : [];
    const handleAdd = (emptyObj: ArrayItem) => setFormData({ ...formData, [field.id]: [...items, emptyObj] });
    const handleUpdate = (index: number, key: string, val: string) => {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [key]: val };
      setFormData({ ...formData, [field.id]: newItems });
    };
    const handleRemove = (index: number) => {
      const newItems = [...items];
      newItems.splice(index, 1);
      setFormData({ ...formData, [field.id]: newItems });
    };

    return (
      <div key={field.id} className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-3">{field.label}</label>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row gap-3 relative group">
              <button onClick={() => handleRemove(idx)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-200"><X size={14}/></button>
              
              {field.type === 'array_maps' && (
                <>
                  <div className="flex-1">
                    <select value={(item as MapLocation).title} onChange={e => handleUpdate(idx, 'title', e.target.value)} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]">
                      <option value="" disabled>Select Type...</option>
                      {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex-[2]">
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-2.5 text-gray-400" />
                      <input type="url" placeholder="Google Maps URL" value={(item as MapLocation).mapsLink} onChange={e => handleUpdate(idx, 'mapsLink', e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                    </div>
                  </div>
                </>
              )}

              {field.type === 'array_emergencies' && (
                <>
                  <select value={(item as Emergency).category} onChange={e => handleUpdate(idx, 'category', e.target.value)} className="w-full sm:w-32 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]">
                    <option value="" disabled>Category</option>
                    {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="text" placeholder="Name / Title" value={(item as Emergency).title} onChange={e => handleUpdate(idx, 'title', e.target.value)} className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                  <input type="tel" placeholder="Phone Number" value={(item as Emergency).phone} onChange={e => handleUpdate(idx, 'phone', e.target.value)} className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                  <input type="url" placeholder="Maps URL (Optional)" value={(item as Emergency).mapsLink} onChange={e => handleUpdate(idx, 'mapsLink', e.target.value)} className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                </>
              )}

              {field.type === 'array_devices' && (
                <>
                  <select value={(item as Device).room} onChange={e => handleUpdate(idx, 'room', e.target.value)} className="w-full sm:w-36 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]">
                    <option value="" disabled>Room</option>
                    {ROOM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="text" placeholder="Device (e.g. Oven)" value={(item as Device).device} onChange={e => handleUpdate(idx, 'device', e.target.value)} className="flex-[1.5] text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                  <input type="text" placeholder="Brand" value={(item as Device).brand} onChange={e => handleUpdate(idx, 'brand', e.target.value)} className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                  <input type="text" placeholder="Model Number" value={(item as Device).model} onChange={e => handleUpdate(idx, 'model', e.target.value)} className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]" />
                </>
              )}

              {field.type === 'array_faqs' && (
                <div className="flex flex-col w-full gap-2">
                  <input type="text" placeholder="Question?" value={(item as FAQ).question} onChange={e => handleUpdate(idx, 'question', e.target.value)} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C] font-medium" />
                  <textarea placeholder="Answer..." value={(item as FAQ).answer} onChange={e => handleUpdate(idx, 'answer', e.target.value)} rows={2} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C] resize-y" />
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => {
            if (field.type === 'array_maps') handleAdd({ title: '', mapsLink: '' });
            if (field.type === 'array_emergencies') handleAdd({ category: '', title: '', phone: '', mapsLink: '' });
            if (field.type === 'array_devices') handleAdd({ room: '', device: '', brand: '', model: '' });
            if (field.type === 'array_faqs') handleAdd({ question: '', answer: '' });
          }} className="flex items-center text-sm font-bold text-vailo-teal hover:text-vailo-gold bg-white px-4 py-2 rounded-lg border border-dashed border-vailo-teal/30 hover:border-[#C5A059] transition-colors shadow-sm">
            <Plus size={16} className="mr-1.5" /> Add New Entry
          </button>
        </div>
      </div>
    );
  };

  // --- RENDERERS ---
  if (allowedPropertyTypes.length === 0) return <div className="p-8 text-center bg-white rounded-2xl shadow-sm border border-gray-100"><Building className="mx-auto text-gray-300 mb-4" size={40}/><h3 className="text-xl font-bold">No Property Listings</h3></div>;

  return (
    <div className="admin-page">
      {/* Header & Controls */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-vailo-teal" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center mb-2">
            <BookOpen className="mr-3 text-vailo-gold" size={28}/> Master House Guide
          </h1>
          <p className="text-gray-500 text-sm max-w-lg leading-relaxed">Provide detailed, structured information about your property. The AI Concierge uses this data to instantly answer guest questions.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          {isListingOnly && allowedPropertyTypes.length === 1 ? (
            <p className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 min-w-[200px]">
              {allowedPropertyTypes[0].propertyTypeName || 'Your listing'}
            </p>
          ) : (
            <select value={selectedTypeId} onChange={e => setSelectedTypeId(e.target.value)} className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#0B4F5C] min-w-[200px] shadow-inner">
              {allowedPropertyTypes.map(t => <option key={t.id} value={t.id}>{t.propertyTypeName}</option>)}
            </select>
          )}
          <button onClick={() => { setWizardStepIndex(0); setIsWizardOpen(true); }} className="px-6 py-3 bg-vailo-teal hover:bg-[#C5A059] text-white rounded-xl text-sm font-bold shadow-md transition-colors flex items-center w-full sm:w-auto justify-center">
            <Sparkles size={18} className="mr-2" /> Run Setup Wizard
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 px-2">
        <div className="flex justify-between items-end mb-2">
          <span className="text-sm font-bold text-gray-700">Guide Completion</span>
          <span className="text-sm font-bold text-vailo-teal">{progressPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
          <div className="bg-vailo-teal h-3 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercentage}%` }}></div>
        </div>
      </div>

      {/* Featured-on-portal counter */}
      <div className="mb-6 px-2 flex items-start gap-3">
        <Star size={16} className="text-vailo-gold shrink-0 mt-0.5" strokeWidth={2.4} />
        <p className="text-sm text-gray-700 leading-snug">
          <span className="font-bold">Featured on guest portal · {featuredCount} of {PORTAL_FEATURED_CAP}</span>
          <span className="text-gray-500"> — pick the sections you want as preview cards on the guest portal. On save, AI writes a short summary <em>only for the card preview</em>. Your full content stays untouched and is what the 24/7 Assistant uses.</span>
        </p>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {CATEGORIES.map(cat => {
          const completion = getCategoryCompletion(cat);
          const Icon = cat.icon;
          const primaryFeaturedKey = featuredKeyForPrimaryCategory(cat.id);
          const pairedFeaturedKey = pairedFeaturedKeyForCategory(cat.id);
          const featured = !!(primaryFeaturedKey && isFeaturedToggled(primaryFeaturedKey));
          const featuredViaPair = !!(pairedFeaturedKey && isFeaturedToggled(pairedFeaturedKey));
          const canFeature =
            !!primaryFeaturedKey && hasFeaturedContent(primaryFeaturedKey);
          const toggleDisabled =
            !canFeature || (!featured && featuredCapReached);

          return (
            <div key={cat.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div
                  className={`p-3 rounded-xl transition-colors ${
                    completion === 'complete'
                      ? 'bg-emerald-50 text-emerald-600'
                      : completion === 'partial'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-gray-50 text-gray-500 group-hover:bg-vailo-teal/10 group-hover:text-vailo-teal'
                  }`}
                >
                  <Icon size={22} />
                </div>
                <div className="flex items-center gap-2">
                  {canFeature && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (toggleDisabled) {
                          toast.warning(
                            `Up to ${PORTAL_FEATURED_CAP} sections can be featured. Deselect one first.`
                          );
                          return;
                        }
                        void handleFeaturedToggleAndSave(primaryFeaturedKey!);
                      }}
                      aria-pressed={featured}
                      disabled={isSubmitting || (toggleDisabled && !featured)}
                      title={
                        featured
                          ? 'Featured on guest portal — click to remove'
                          : toggleDisabled
                            ? `Max ${PORTAL_FEATURED_CAP} featured. Deselect one to swap.`
                            : 'Feature on guest portal'
                      }
                      className={`h-8 w-8 rounded-lg flex items-center justify-center border transition-colors ${
                        featured
                          ? 'bg-vailo-gold text-vailo-dark border-vailo-gold/70 shadow-sm'
                          : toggleDisabled
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white text-gray-400 border-gray-200 hover:text-vailo-gold hover:border-vailo-gold/40'
                      }`}
                    >
                      <Star
                        size={16}
                        strokeWidth={2}
                        fill={featured ? 'currentColor' : 'none'}
                      />
                    </button>
                  )}
                  {completion === 'complete' ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : completion === 'partial' ? (
                    <CheckCircle2 size={20} className="text-amber-500" />
                  ) : (
                    <Circle size={20} className="text-gray-300" />
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickEditCategory(cat)}
                className="text-left flex-1 flex flex-col"
              >
                <h3 className="text-base font-bold text-gray-900 mb-1">{cat.title}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 flex-1">{cat.description}</p>
              </button>
              {featuredViaPair && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-vailo-gold-muted bg-vailo-gold/10 px-2.5 py-1 rounded-full border border-vailo-gold/20 self-start">
                  <Link2 size={11} /> Featured with Arrival
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center text-[10px] font-bold uppercase tracking-wider text-vailo-gold opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit3 size={12} className="mr-1"/> Edit Category
              </div>
            </div>
          );
        })}
      </div>

      {/* --- QUICK EDIT MODAL (DASHBOARD) --- */}
      {quickEditCategory && (() => {
        const QuickEditIcon = quickEditCategory.icon;
        const primaryFeaturedKey = featuredKeyForPrimaryCategory(quickEditCategory.id);
        const pairedFeaturedKey = pairedFeaturedKeyForCategory(quickEditCategory.id);
        const featuredKey = primaryFeaturedKey || null;
        const isFeatured = !!(featuredKey && isFeaturedToggled(featuredKey));
        const isFeaturedViaPair = !!(pairedFeaturedKey && isFeaturedToggled(pairedFeaturedKey));
        const toggleDisabled = !featuredKey || (!isFeatured && featuredCapReached);
        const featuredCfg = featuredKey ? getFeaturedConfig(featuredKey) : null;
        const previewRecord: FeaturedPreviewRecord = (featuredKey && featuredPreviews[featuredKey]) || {};
        return (
        <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-vailo-teal/10 text-vailo-teal rounded-lg"><QuickEditIcon size={20}/></div>
                <h2 className="text-xl font-bold text-gray-900">{quickEditCategory.title}</h2>
              </div>
              <button onClick={() => setQuickEditCategory(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/50 space-y-6">
              {/* Feature-on-portal block */}
              {featuredKey && featuredCfg && hasFeaturedContent(featuredKey) && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (toggleDisabled && !isFeatured) {
                          toast.warning(
                            `Up to ${PORTAL_FEATURED_CAP} sections can be featured. Deselect one first.`
                          );
                          return;
                        }
                        void handleFeaturedToggleAndSave(featuredKey);
                      }}
                      disabled={isSubmitting || (toggleDisabled && !isFeatured)}
                      className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border transition-colors ${
                        isFeatured
                          ? 'bg-vailo-gold text-vailo-dark border-vailo-gold/70 shadow-sm'
                          : toggleDisabled
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white text-gray-500 border-gray-200 hover:text-vailo-gold hover:border-vailo-gold/40'
                      }`}
                      aria-pressed={isFeatured}
                    >
                      <Star size={18} strokeWidth={2} fill={isFeatured ? 'currentColor' : 'none'} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">Feature on guest portal</p>
                      <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                        Adds this section as a preview card on the guest portal. AI writes a short summary
                        for the chip and accordion only — your full text stays untouched and is used by the
                        24/7 Assistant. {isFeatured ? '' : `${featuredCount} of ${PORTAL_FEATURED_CAP} featured.`}
                      </p>
                    </div>
                  </div>

                  {isFeatured && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">
                          Custom preview line (optional)
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          value={previewRecord.customPreviewLine || ''}
                          onChange={(e) => updateCustomPreview(featuredKey, e.target.value)}
                          placeholder={previewRecord.previewLine || 'AI will summarise this section when you save.'}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/30 focus:border-vailo-teal/40 transition-shadow"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                          Leave blank to use the AI-generated preview. Max 120 characters.
                        </p>
                      </div>

                      {(previewRecord.previewLine || previewRecord.digest) && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 leading-relaxed">
                          <p className="font-bold text-gray-600 mb-1">
                            AI preview <span className="font-normal text-gray-400">· shown on guest portal card only</span>
                          </p>
                          {previewRecord.previewLine && (
                            <p className="mb-1.5">
                              <span className="font-semibold text-gray-700">Chip:</span> {previewRecord.previewLine}
                            </p>
                          )}
                          {previewRecord.digest && (
                            <p className="whitespace-pre-wrap">
                              <span className="font-semibold text-gray-700">Digest:</span>{' '}
                              {previewRecord.digest}
                            </p>
                          )}
                          {previewRecord.generatedAt && (
                            <p className="text-[10px] text-gray-400 mt-2">
                              Last regenerated {new Date(previewRecord.generatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {isFeaturedViaPair && (
                <div className="bg-vailo-gold/10 border border-vailo-gold/20 rounded-2xl p-4 flex items-start gap-3">
                  <Link2 size={18} className="text-vailo-gold mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-700 leading-relaxed">
                    This category is featured on the guest portal together with{' '}
                    <span className="font-semibold">Arrival & Check-in</span>. Manage the toggle from the
                    Arrival card.
                  </p>
                </div>
              )}

              {quickEditCategory.fields.map(renderField)}
            </div>
            <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3 rounded-b-3xl">
              <button onClick={() => setQuickEditCategory(null)} className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Close</button>
              <button onClick={async () => { await saveToFirebase(); setQuickEditCategory(null); }} disabled={isSubmitting} className="px-6 py-2.5 bg-vailo-teal hover:bg-black text-white text-sm font-bold rounded-xl transition-colors flex items-center shadow-md">
                {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2"/> : <Save size={16} className="mr-2"/>} Save Changes
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* --- SETUP WIZARD FULLSCREEN --- */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col animate-in slide-in-from-bottom-4 duration-300">
          
          {/* Wizard Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-8 sm:py-4 flex justify-between items-center shrink-0 shadow-sm z-10 relative">
            <div className="flex items-center">
              <button onClick={() => setIsWizardOpen(false)} className="mr-4 p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Setup Wizard</h2>
                <p className="text-xs text-gray-500 hidden sm:block">Complete the guide step-by-step.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={showIncompleteOnly} onChange={(e) => { setShowIncompleteOnly(e.target.checked); setWizardStepIndex(0); }}/>
                  <div className={`block w-10 h-6 rounded-full transition-colors ${showIncompleteOnly ? 'bg-[#C5A059]' : 'bg-gray-300'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showIncompleteOnly ? 'transform translate-x-4' : ''}`}></div>
                </div>
                <span className="ml-3 text-xs font-bold text-gray-700 hidden sm:block">Only show uncompleted</span>
              </label>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Wizard Sidebar (Desktop) */}
            <div className="hidden lg:flex w-72 bg-white border-r border-gray-200 flex-col overflow-y-auto custom-scrollbar">
              {getWizardSteps.map((cat, idx) => (
                <button key={cat.id} onClick={() => setWizardStepIndex(idx)} className={`text-left px-6 py-4 flex items-center border-l-4 transition-colors ${wizardStepIndex === idx ? 'border-vailo-teal bg-vailo-teal/5' : 'border-transparent hover:bg-gray-50'}`}>
                  {checkIsComplete(cat) ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mr-3"/> : <Circle size={16} className="text-gray-300 shrink-0 mr-3"/>}
                  <span className={`text-sm ${wizardStepIndex === idx ? 'font-bold text-vailo-teal' : 'font-medium text-gray-600'} truncate`}>{cat.title}</span>
                </button>
              ))}
            </div>

            {/* Wizard Content Area */}
            <div className="flex-1 flex flex-col bg-gray-50/50 overflow-hidden relative">
              {getWizardSteps.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm"><CheckCircle2 size={40}/></div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">All Caught Up!</h2>
                  <p className="text-gray-500 mb-8 max-w-md">You have completely filled out the House Guide. The AI Concierge now has maximum context.</p>
                  <button onClick={() => setIsWizardOpen(false)} className="px-8 py-3 bg-vailo-teal text-white font-bold rounded-xl shadow-md hover:bg-black transition-colors">Return to Dashboard</button>
                </div>
              ) : (
                <>
                  {/* Progress Header (Mobile) */}
                  <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 shrink-0 flex justify-between items-center shadow-sm">
                    <span className="text-xs font-bold text-gray-500">Step {wizardStepIndex + 1} of {getWizardSteps.length}</span>
                    <span className="text-sm font-bold text-vailo-teal truncate max-w-[200px]">{getWizardSteps[wizardStepIndex].title}</span>
                  </div>

                  {/* Form Container */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar pb-32">
                    <div className="w-full">
                      <div className="mb-8">
                        <div className="inline-flex items-center justify-center p-3 bg-vailo-teal/10 text-vailo-teal rounded-2xl mb-4">
                          {(() => { const Icon = getWizardSteps[wizardStepIndex].icon; return <Icon size={28}/> })()}
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{getWizardSteps[wizardStepIndex].title}</h1>
                        <p className="text-gray-600">{getWizardSteps[wizardStepIndex].description}</p>
                      </div>

                      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100">
                        {getWizardSteps[wizardStepIndex].fields.map(renderField)}
                      </div>
                    </div>
                  </div>

                  {/* Wizard Footer / Actions */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 sm:p-6 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-20">
                    <div className="w-full flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                      <button onClick={handleWizardSkip} className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                        Skip for now
                      </button>
                      <button onClick={handleWizardSaveAndNext} disabled={isSubmitting} className="w-full sm:w-auto px-8 py-3 bg-vailo-teal hover:bg-black text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center shadow-md">
                        {isSubmitting ? <Loader2 size={18} className="animate-spin mr-2"/> : <Save size={18} className="mr-2"/>}
                        Save & Continue <ArrowRight size={18} className="ml-2"/>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}