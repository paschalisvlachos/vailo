import { useEffect, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Layers } from 'lucide-react';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import {
  renameFeaturesCategory,
  repairPartnerCategorySpellings,
} from '../../../lib/categoryRename';
import AreaCategoryNamesPanel from '../../../components/admin/AreaCategoryNamesPanel';
import CopyAreaCategoriesCard from '../../../components/admin/CopyAreaCategoriesCard';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import { categoryPrimaryName } from '../../../lib/categoryLocale';
import { db } from '../../../lib/firebase';

export default function FeaturesCategories() {
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();
  const localeSettings = useAreaContentLocaleSettings(decodedCountry, areaId);
  const spellingRepairDone = useRef(false);

  useEffect(() => {
    spellingRepairDone.current = false;
    const unsub = onSnapshot(
      collection(db, 'countries', decodedCountry, 'areas', areaId, 'featuresCategories'),
      (snapshot) => {
        if (spellingRepairDone.current) return;
        const cats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const needsRepair = cats.some((c) =>
          /\bYatch\b/i.test(categoryPrimaryName(c, localeSettings.primaryLocale))
        );
        if (!needsRepair) {
          spellingRepairDone.current = true;
          return;
        }
        spellingRepairDone.current = true;
        void repairPartnerCategorySpellings(decodedCountry, areaId, cats).catch((err) => {
          console.warn('Partner category spelling repair failed:', err);
          spellingRepairDone.current = false;
        });
      }
    );
    return () => unsub();
  }, [decodedCountry, areaId, localeSettings.primaryLocale]);

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Layers className="mr-3 text-vailo-teal shrink-0" size={28} />
          Partner Categories
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Managing partner categories for{' '}
          <span className="font-semibold text-vailo-teal">
            {decodedArea}, {decodedCountry}
          </span>
        </p>
      </div>

      <CopyAreaCategoriesCard
        targetCountry={decodedCountry}
        targetAreaId={areaId}
        targetAreaName={decodedArea}
        collectionName="featuresCategories"
        primaryLocale={localeSettings.primaryLocale}
        title="Copy partner categories from another area"
        description="Imports partner category names and translations. Categories that already exist here (same English name) are skipped."
      />

      <AreaCategoryNamesPanel
        country={decodedCountry}
        areaId={areaId}
        areaName={decodedArea}
        collectionName="featuresCategories"
        title="Partner category names"
        onRename={renameFeaturesCategory}
      />
    </div>
  );
}
