import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { renameLocalGemsCategory } from '../../../lib/categoryRename';
import AreaCategoryNamesPanel from '../../../components/admin/AreaCategoryNamesPanel';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { Grid } from 'lucide-react';

export default function LocalGemsCategories() {
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Grid className="mr-3 text-vailo-teal shrink-0" size={28} />
          Local Gems Categories
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Managing categories for{' '}
          <span className="font-semibold text-vailo-teal">
            {decodedArea}, {decodedCountry}
          </span>
          . The same names appear in Live like a local unless you hide a category with the eye control.
        </p>
      </div>

      <AreaCategoryNamesPanel
        country={decodedCountry}
        areaId={areaId}
        areaName={decodedArea}
        collectionName="localGemsCategories"
        title="Category names"
        onRename={renameLocalGemsCategory}
        showLiveLikeLocalExclude
      />
    </div>
  );
}
