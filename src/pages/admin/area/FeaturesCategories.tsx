import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { renameFeaturesCategory } from '../../../lib/categoryRename';
import AreaCategoryNamesPanel from '../../../components/admin/AreaCategoryNamesPanel';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { Layers } from 'lucide-react';

export default function FeaturesCategories() {
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Layers className="mr-3 text-vailo-teal shrink-0" size={28} />
          Features Categories
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Managing categories for{' '}
          <span className="font-semibold text-vailo-teal">
            {decodedArea}, {decodedCountry}
          </span>
        </p>
      </div>

      <AreaCategoryNamesPanel
        country={decodedCountry}
        areaId={areaId}
        areaName={decodedArea}
        collectionName="featuresCategories"
        title="Feature category names"
        onRename={renameFeaturesCategory}
      />
    </div>
  );
}
