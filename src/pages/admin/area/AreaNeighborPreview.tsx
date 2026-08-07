import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, MapPin, RefreshCw } from 'lucide-react';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminLabel,
  AdminSection,
} from '../../../components/admin/AdminPageHeader';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import {
  loadAreaNeighborPreview,
  loadListingsForArea,
  NEIGHBOR_PREVIEW_RADIUS_OPTIONS,
  type NeighborPreviewDedupe,
  type NeighborPreviewExcursion,
  type NeighborPreviewItem,
  type NeighborPreviewListing,
  type NeighborPreviewResult,
} from '../../../lib/areaNeighborPreview';

function scopeBadge(scope: string, sourceAreaLabel?: string) {
  if (scope === 'neighbor') {
    return (
      <AdminBadge variant="gold">{sourceAreaLabel || 'Nearby region'}</AdminBadge>
    );
  }
  if (scope === 'property') {
    return <AdminBadge variant="teal">Property</AdminBadge>;
  }
  return <AdminBadge variant="neutral">Home area</AdminBadge>;
}

function ItemTable({
  title,
  home,
  neighbor,
  emptyLabel,
}: {
  title: string;
  home: NeighborPreviewItem[];
  neighbor: NeighborPreviewItem[];
  emptyLabel: string;
}) {
  const rows = [...home, ...neighbor];
  if (rows.length === 0) {
    return (
      <AdminCard className="p-4">
        <h4 className="admin-section-title text-base mb-2">{title}</h4>
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <h4 className="admin-section-title text-base">{title}</h4>
        <span className="text-xs text-gray-500">
          {home.length} home · {neighbor.length} nearby
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Source</th>
              <th className="px-4 py-2 font-semibold">Distance</th>
              <th className="px-4 py-2 font-semibold">Categories</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.scope}-${row.id}-${row.name}`} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                <td className="px-4 py-2.5">{scopeBadge(row.scope, row.sourceAreaLabel)}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {row.distanceKm != null ? (
                    <>
                      {row.distanceKm.toFixed(1)} km
                      {!row.withinRadius && (
                        <span className="ml-1 text-amber-700">(extended)</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {row.categories.length > 0 ? row.categories.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

function DedupeTable({ title, rows }: { title: string; rows: NeighborPreviewDedupe[] }) {
  if (rows.length === 0) return null;
  return (
    <AdminCard className="p-0 overflow-hidden border-amber-100">
      <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60">
        <h4 className="admin-section-title text-base text-amber-900">{title}</h4>
        <p className="text-xs text-amber-800 mt-1">
          These items were removed because an earlier pool already had the same place.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Dropped</th>
              <th className="px-4 py-2 font-semibold">Kept instead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="border-t border-gray-100">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900">{row.name}</div>
                  <div className="mt-1">{scopeBadge(row.scope, row.sourceAreaLabel)}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900">{row.duplicateOfName}</div>
                  <div className="mt-1">
                    {scopeBadge(row.duplicateOfScope, row.duplicateOfSourceAreaLabel)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

function ExcursionTable({
  home,
  neighbor,
}: {
  home: NeighborPreviewExcursion[];
  neighbor: NeighborPreviewExcursion[];
}) {
  const rows = [...home, ...neighbor];
  if (rows.length === 0) {
    return (
      <AdminCard className="p-4">
        <h4 className="admin-section-title text-base mb-2">Excursions</h4>
        <p className="text-sm text-gray-500">No published excursions in range.</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <h4 className="admin-section-title text-base">Excursions</h4>
        <span className="text-xs text-gray-500">
          {home.length} home · {neighbor.length} nearby
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Title</th>
              <th className="px-4 py-2 font-semibold">Provider</th>
              <th className="px-4 py-2 font-semibold">Source</th>
              <th className="px-4 py-2 font-semibold">Meeting distance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.scope}-${row.id}`} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">{row.title}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.providerName}</td>
                <td className="px-4 py-2.5">{scopeBadge(row.scope, row.sourceAreaLabel)}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {row.distanceKm != null ? `${row.distanceKm.toFixed(1)} km` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

export default function AreaNeighborPreview() {
  const { country, areaId, areaName } = useAreaRouteParams();
  const [listings, setListings] = useState<NeighborPreviewListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListingKey, setSelectedListingKey] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(NEIGHBOR_PREVIEW_RADIUS_OPTIONS[1]);
  const [preview, setPreview] = useState<NeighborPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedListing = useMemo(
    () => listings.find((l) => `${l.propertyId}::${l.typeId}` === selectedListingKey) ?? null,
    [listings, selectedListingKey]
  );

  useEffect(() => {
    if (!country || !areaName) return;
    setListingsLoading(true);
    loadListingsForArea(country, areaName)
      .then(setListings)
      .catch((err) => {
        console.error(err);
        setError('Failed to load property listings for this area.');
      })
      .finally(() => setListingsLoading(false));
  }, [country, areaName]);

  useEffect(() => {
    if (!selectedListing) return;
    if (selectedListing.latitude != null) setManualLat(String(selectedListing.latitude));
    if (selectedListing.longitude != null) setManualLng(String(selectedListing.longitude));
  }, [selectedListing]);

  const propertyCoords = useMemo(() => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [manualLat, manualLng]);

  const runPreview = useCallback(async () => {
    if (!country || !areaId || !areaName) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadAreaNeighborPreview({
        country,
        areaId,
        areaName,
        propertyCoords,
        maxRadiusKm: radiusKm,
        propertyId: selectedListing?.propertyId,
        typeId: selectedListing?.typeId,
      });
      setPreview(result);
    } catch (err) {
      console.error(err);
      setError('Failed to build overlap preview.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [
    country,
    areaId,
    areaName,
    propertyCoords,
    radiusKm,
    selectedListing?.propertyId,
    selectedListing?.typeId,
  ]);

  useEffect(() => {
    if (!country || !areaId) return;
    void runPreview();
  }, [country, areaId, runPreview]);

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <AreaHubBackLink />

      <div className="mb-6">
        <div className="flex items-center gap-2 text-vailo-teal mb-2">
          <Link2 size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Regional overlap</span>
        </div>
        <h2 className="text-2xl font-bold font-luxury text-vailo-dark">Overlap preview</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-3xl">
          Simulate what a guest would see from a property pin in <strong>{areaName}</strong>, including
          nearby-region content, dedupes, browse-only category mismatches, and excursions.
        </p>
      </div>

      <AdminSection title="Preview anchor">
        <AdminCard className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <AdminLabel htmlFor="listing">Property listing</AdminLabel>
              <select
                id="listing"
                value={selectedListingKey}
                onChange={(e) => setSelectedListingKey(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm admin-input"
                disabled={listingsLoading}
              >
                <option value="">
                  {listingsLoading ? 'Loading listings…' : 'Choose a listing (optional)'}
                </option>
                {listings.map((listing) => (
                  <option
                    key={`${listing.propertyId}::${listing.typeId}`}
                    value={`${listing.propertyId}::${listing.typeId}`}
                  >
                    {listing.propertyName} · {listing.typeName}
                    {listing.latitude == null ? ' (no coords)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <AdminLabel htmlFor="manualLat">Latitude</AdminLabel>
              <AdminInput
                id="manualLat"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="35.5138"
              />
            </div>
            <div>
              <AdminLabel htmlFor="manualLng">Longitude</AdminLabel>
              <AdminInput
                id="manualLng"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="24.0180"
              />
            </div>
          </div>

          <div>
            <AdminLabel>Live like a local radius</AdminLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {NEIGHBOR_PREVIEW_RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setRadiusKm(km)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    radiusKm === km
                      ? 'bg-vailo-teal text-white border-vailo-teal'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-vailo-teal/40'
                  }`}
                >
                  {km} km
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Extended buffer applies the same way as the guest portal (effective cap{' '}
              {preview ? `${preview.effectiveRadiusKm.toFixed(1)} km` : '…'} at {radiusKm} km).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <AdminButton type="button" onClick={() => void runPreview()} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh preview
            </AdminButton>
            {!propertyCoords && (
              <span className="text-sm text-amber-700 flex items-center gap-1.5">
                <MapPin size={14} />
                Enter coordinates to include nearby regions.
              </span>
            )}
          </div>
        </AdminCard>
      </AdminSection>

      {error && (
        <AdminCard className="p-4 mb-6 border-red-200 bg-red-50 text-red-800 text-sm">{error}</AdminCard>
      )}

      {loading && !preview ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Building preview…
        </div>
      ) : preview ? (
        <div className="space-y-6">
          <AdminCard className="p-5">
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Overlap status</h3>
                {preview.overlapEnabled ? (
                  <p className="text-sm text-emerald-700">
                    Nearby-region bleed is active for this pin.
                  </p>
                ) : (
                  <p className="text-sm text-amber-700">{preview.overlapDisabledReason}</p>
                )}
              </div>
              <div className="text-sm text-gray-600">
                <div>
                  Neighbors:{' '}
                  {preview.neighborAreas.length > 0
                    ? preview.neighborAreas.map((n) => n.areaName).join(', ')
                    : 'None configured'}
                </div>
                <div className="mt-1">
                  Raw neighbor inventory: {preview.rawNeighborCounts.gems} gems ·{' '}
                  {preview.rawNeighborCounts.features} features ·{' '}
                  {preview.rawNeighborCounts.discoveredPlaces} discovered ·{' '}
                  {preview.rawNeighborCounts.trails} trails
                </div>
              </div>
            </div>
          </AdminCard>

          <ItemTable
            title="Local gems"
            home={preview.gems.home}
            neighbor={preview.gems.neighbor}
            emptyLabel="No gems in range for this radius."
          />
          <DedupeTable title="Gem dedupes" rows={preview.gems.deduped} />

          <ItemTable
            title="Features"
            home={preview.features.home}
            neighbor={preview.features.neighbor}
            emptyLabel="No features in range for this radius."
          />
          <DedupeTable title="Feature dedupes" rows={preview.features.deduped} />

          <ItemTable
            title="Discovered places"
            home={preview.discoveredPlaces.home}
            neighbor={preview.discoveredPlaces.neighbor}
            emptyLabel="No discovered places in range for this radius."
          />
          <DedupeTable title="Discovered place dedupes" rows={preview.discoveredPlaces.deduped} />

          <ItemTable
            title="Local trails"
            home={preview.trails.home}
            neighbor={preview.trails.neighbor}
            emptyLabel="No eligible trails in range for this radius."
          />
          <DedupeTable title="Trail dedupes" rows={preview.trails.deduped} />

          <ExcursionTable home={preview.excursions.home} neighbor={preview.excursions.neighbor} />

          <AdminCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h4 className="admin-section-title text-base">Browse-only category mismatches</h4>
              <p className="text-xs text-gray-500 mt-1">
                Nearby gems whose categories are not in {areaName}&apos;s wizard — they appear only in
                browse, not the Live like a local wizard.
              </p>
            </div>
            {preview.categoryMismatches.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500">No browse-only neighbor gems in range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Gem</th>
                      <th className="px-4 py-2 font-semibold">Nearby label</th>
                      <th className="px-4 py-2 font-semibold">Neighbor categories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.categoryMismatches.map((row) => (
                      <tr key={`${row.id}-${row.name}`} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-2.5">{row.sourceAreaLabel || 'Nearby'}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {row.categories.join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </div>
      ) : (
        <AdminEmptyState
          icon={<MapPin size={28} />}
          title="No preview yet"
          description="Choose a listing or enter coordinates, then refresh."
        />
      )}
    </div>
  );
}
