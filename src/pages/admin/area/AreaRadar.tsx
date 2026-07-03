import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteField, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import { adminPath } from '../../../lib/adminRoutes';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import {
  AdminBadge,
  AdminButton,
  AdminCard,
} from '../../../components/admin/AdminPageHeader';
import {
  Radar,
  Loader2,
  Save,
  Trash2,
  Play,
  MapPin,
  AlertCircle,
  ExternalLink,
  PenTool,
  Check,
  X,
} from 'lucide-react';
import {
  geoJsonFromRing,
  polygonCentroid,
  ringFromGeoJson,
  ringFromGooglePath,
  resolveSearchRegionRing,
  ringToFirestore,
  type GeoJsonPolygon,
  type LatLng,
} from '../../../lib/areaRadarGeo';
import { buildAreaRadarPreview } from '../../../lib/areaRadarPreview';
import {
  geocodeAreaCenter,
  getGoogleMapsApiKey,
  loadGoogleMapsApi,
} from '../../../lib/googleMapsAreaRadar';
import {
  buildKnownGemNamesByCategory,
  runAreaRadarDiscovery,
  type AreaRadarRunProgress,
  type AreaRadarRunResult,
} from '../../../lib/runAreaRadarDiscovery';
import {
  categoryEligibleForLiveLikeLocal,
  collectCategoryKnowledgeByPrimary,
} from '../../../lib/liveLikeLocalCategories';
import { isTopLevelCategory } from '../../../lib/categoryHierarchy';
import { categoryPrimaryName } from '../../../lib/categoryLocale';

type PlaceDiscoveryConfig = {
  /** @deprecated GeoJSON nested arrays are invalid in Firestore — use searchRegionRing */
  searchRegion?: GeoJsonPolygon | null;
  searchRegionRing?: Array<{ lat: number; lng: number }> | null;
  lastRunAt?: string;
  lastRunStats?: AreaRadarRunResult;
};

export default function AreaRadar() {
  const toast = useToast();
  const { country, areaId, areaName } = useAreaRouteParams();
  const localeSettings = useAreaContentLocaleSettings(country, areaId);
  const primaryLocale = localeSettings.primaryLocale;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const activePolygonRef = useRef<google.maps.Polygon | null>(null);
  const previewLineRef = useRef<google.maps.Polyline | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  /** Latest saved ring from Firestore — avoids stale closures during async map init. */
  const savedRingRef = useRef<LatLng[]>([]);
  const areaNameRef = useRef(areaName);
  areaNameRef.current = areaName;

  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchRegion, setSearchRegion] = useState<GeoJsonPolygon | null>(null);
  const [draftRing, setDraftRing] = useState<LatLng[]>([]);
  const [isSavingRegion, setIsSavingRegion] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<AreaRadarRunProgress | null>(null);
  const [lastRunStats, setLastRunStats] = useState<AreaRadarRunResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const [categoryDocs, setCategoryDocs] = useState<Array<{ id: string; data: Record<string, unknown> }>>(
    []
  );
  const [gems, setGems] = useState<Array<Record<string, unknown>>>([]);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<Array<Record<string, unknown>>>([]);

  const areaRef = useMemo(
    () => (country && areaId ? doc(db, 'countries', country, 'areas', areaId) : null),
    [country, areaId]
  );

  useEffect(() => {
    if (!country || !areaId) return;
    const unsubCats = onSnapshot(
      collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories'),
      (snap) => {
        setCategoryDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })));
      }
    );
    const unsubGems = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'localGems'), (snap) => {
      setGems(snap.docs.map((d) => d.data() as Record<string, unknown>));
    });
    const unsubDisc = onSnapshot(
      collection(db, 'countries', country, 'areas', areaId, 'discoveredPlaces'),
      (snap) => {
        setDiscoveredPlaces(snap.docs.map((d) => d.data() as Record<string, unknown>));
      }
    );
    return () => {
      unsubCats();
      unsubGems();
      unsubDisc();
    };
  }, [country, areaId]);

  useEffect(() => {
    if (!areaRef) return;
    return onSnapshot(areaRef, (snap) => {
      const cfg = (snap.data()?.placeDiscoveryConfig || {}) as PlaceDiscoveryConfig;
      const ring = resolveSearchRegionRing(cfg.searchRegionRing, cfg.searchRegion);
      if (ring.length >= 3) {
        savedRingRef.current = ring;
        setSearchRegion(geoJsonFromRing(ring));
        setDraftRing(ring);
      } else {
        savedRingRef.current = [];
      }
      if (cfg.lastRunStats) setLastRunStats(cfg.lastRunStats);
      if (cfg.lastRunAt) setLastRunAt(cfg.lastRunAt);
    });
  }, [areaRef]);

  const radarParentCategories = useMemo(() => {
    return categoryDocs
      .filter(({ data }) => categoryEligibleForLiveLikeLocal(data, primaryLocale))
      .filter(({ data }) => isTopLevelCategory(data))
      .map(({ data }) => categoryPrimaryName(data, primaryLocale))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [categoryDocs, primaryLocale]);

  const categoryKnowledgeByPrimary = useMemo(
    () => collectCategoryKnowledgeByPrimary(categoryDocs, primaryLocale),
    [categoryDocs, primaryLocale]
  );

  const preview = useMemo(
    () =>
      buildAreaRadarPreview({
        searchRegion: geoJsonFromRing(draftRing) || searchRegion,
        categoryCount: radarParentCategories.length,
        localGemsCount: gems.length,
        discoveredPlacesCount: discoveredPlaces.length,
      }),
    [draftRing, searchRegion, radarParentCategories.length, gems.length, discoveredPlaces.length]
  );

  const clearPreviewLine = useCallback(() => {
    previewLineRef.current?.setMap(null);
    previewLineRef.current = null;
  }, []);

  const updatePreviewLine = useCallback(
    (vertices: LatLng[]) => {
      const map = mapRef.current;
      if (!map || vertices.length === 0) {
        clearPreviewLine();
        return;
      }
      clearPreviewLine();
      previewLineRef.current = new google.maps.Polyline({
        path: vertices,
        strokeColor: '#0d9488',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        map,
      });
    },
    [clearPreviewLine]
  );

  const stopDrawingMode = useCallback(() => {
    mapClickListenerRef.current?.remove();
    mapClickListenerRef.current = null;
    mapRef.current?.setOptions({ draggableCursor: undefined });
    setIsDrawing(false);
  }, []);

  const renderPolygonOnMap = useCallback(
    (ring: LatLng[]) => {
      const map = mapRef.current;
      if (!map || ring.length < 3) return;

      clearPreviewLine();
      stopDrawingMode();

      if (activePolygonRef.current) {
        activePolygonRef.current.setMap(null);
        activePolygonRef.current = null;
      }

      const polygon = new google.maps.Polygon({
        paths: ring,
        strokeColor: '#0d9488',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#14b8a6',
        fillOpacity: 0.2,
        editable: true,
        draggable: false,
        map,
      });

      activePolygonRef.current = polygon;

      const syncFromPath = () => {
        const path = polygon.getPath();
        setDraftRing(ringFromGooglePath(path));
      };

      google.maps.event.addListener(polygon.getPath(), 'set_at', syncFromPath);
      google.maps.event.addListener(polygon.getPath(), 'insert_at', syncFromPath);
      google.maps.event.addListener(polygon.getPath(), 'remove_at', syncFromPath);

      const bounds = new google.maps.LatLngBounds();
      ring.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
    },
    [clearPreviewLine, stopDrawingMode]
  );

  const startDrawing = () => {
    if (!mapRef.current) return;
    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
      activePolygonRef.current = null;
    }
    clearPreviewLine();
    setDraftRing([]);
    setIsDrawing(true);
  };

  const finishDrawing = () => {
    if (draftRing.length < 3) {
      toast.warning('Click at least three points on the map, then finish.');
      return;
    }
    renderPolygonOnMap(draftRing);
  };

  const cancelDrawing = () => {
    stopDrawingMode();
    clearPreviewLine();
    setDraftRing([]);
  };

  const restoreSavedPolygon = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const ring =
      savedRingRef.current.length >= 3
        ? savedRingRef.current
        : ringFromGeoJson(searchRegion);
    if (ring.length < 3) return;
    const existing = activePolygonRef.current;
    if (existing?.getMap() === map) return;
    renderPolygonOnMap(ring);
    setDraftRing(ring);
  }, [searchRegion, renderPolygonOnMap]);

  useEffect(() => {
    if (!mapContainerRef.current || !country || !areaId) return;
    let cancelled = false;

    activePolygonRef.current?.setMap(null);
    activePolygonRef.current = null;
    mapRef.current = null;
    setMapLoading(true);
    setMapError(null);

    (async () => {
      try {
        if (!getGoogleMapsApiKey()) {
          throw new Error(
            'Missing VITE_GOOGLE_MAPS_API_KEY in .env. Add your browser Maps key and restart the dev server.'
          );
        }

        await loadGoogleMapsApi();
        if (cancelled || !mapContainerRef.current) return;

        const savedRing = savedRingRef.current;
        let center: LatLng = { lat: 35.3387, lng: 25.1442 };
        const centroid = savedRing.length >= 3 ? polygonCentroid(savedRing) : null;
        if (centroid) center = centroid;
        else if (savedRing[0]) center = savedRing[0];
        else {
          const geocoded = await geocodeAreaCenter(areaNameRef.current, country);
          if (geocoded) center = geocoded;
        }

        if (cancelled || !mapContainerRef.current) return;

        const map = new google.maps.Map(mapContainerRef.current, {
          center,
          zoom: 11,
          mapTypeId: 'hybrid',
          streetViewControl: false,
          fullscreenControl: true,
          mapTypeControl: true,
        });
        mapRef.current = map;

        if (savedRing.length >= 3) {
          renderPolygonOnMap(savedRing);
          setDraftRing(savedRing);
        }

        if (!cancelled) setMapLoading(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : 'Failed to load Google Maps.');
          setMapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [country, areaId, renderPolygonOnMap]);

  useEffect(() => {
    if (mapLoading) return;
    restoreSavedPolygon();
  }, [mapLoading, searchRegion, restoreSavedPolygon]);

  useEffect(() => {
    if (!isDrawing || !mapRef.current || mapLoading) return;
    const map = mapRef.current;
    map.setOptions({ draggableCursor: 'crosshair' });

    mapClickListenerRef.current = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const latLng = event.latLng;
      if (!latLng) return;
      const point = { lat: latLng.lat(), lng: latLng.lng() };
      setDraftRing((prev) => {
        const next = [...prev, point];
        updatePreviewLine(next);
        return next;
      });
    });

    return () => {
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
      map.setOptions({ draggableCursor: undefined });
    };
  }, [isDrawing, mapLoading, updatePreviewLine]);

  useEffect(() => {
    return () => {
      stopDrawingMode();
      clearPreviewLine();
      activePolygonRef.current?.setMap(null);
      activePolygonRef.current = null;
      mapRef.current = null;
    };
  }, [stopDrawingMode, clearPreviewLine]);

  const saveRegion = async () => {
    if (!areaRef) return;
    const geo = geoJsonFromRing(draftRing);
    if (!geo) {
      toast.warning('Draw a polygon with at least three points first.');
      return;
    }
    setIsSavingRegion(true);
    try {
      const ringPayload = ringToFirestore(draftRing);
      const snap = await getDoc(areaRef);
      if (snap.exists()) {
        await updateDoc(areaRef, {
          'placeDiscoveryConfig.searchRegionRing': ringPayload,
          'placeDiscoveryConfig.updatedAt': new Date().toISOString(),
          'placeDiscoveryConfig.searchRegion': deleteField(),
        });
      } else {
        await setDoc(
          areaRef,
          {
            name: areaName,
            placeDiscoveryConfig: {
              searchRegionRing: ringPayload,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      }
      setSearchRegion(geo);
      toast.success('Search region saved.');
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Failed to save search region.';
      toast.error(msg.startsWith('Failed') ? msg : `Failed to save search region: ${msg}`);
    } finally {
      setIsSavingRegion(false);
    }
  };

  const clearRegion = () => {
    stopDrawingMode();
    clearPreviewLine();
    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
      activePolygonRef.current = null;
    }
    setDraftRing([]);
    setSearchRegion(null);
  };

  const handleRunRadar = async () => {
    const geo = geoJsonFromRing(draftRing);
    if (!geo || !preview.valid) {
      toast.warning(preview.validationMessage);
      return;
    }
    if (
      !window.confirm(
        `Run Area Radar?\n\nEstimated Google Text Search calls: ~${preview.estimatedGoogleTextSearchCalls}\nEstimated cost: ~$${preview.estimatedCostUsd.toFixed(2)}\n\nThis will add new places to Discovered Places for your review.`
      )
    ) {
      return;
    }

    setIsRunning(true);
    setRunProgress({ phase: 'ai', message: 'Starting…' });
    try {
      const knownGemNamesByCategory = buildKnownGemNamesByCategory(
        gems as Array<{ name?: string; category?: string; categories?: string[] }>,
        categoryDocs,
        radarParentCategories,
        primaryLocale
      );

      const stats = await runAreaRadarDiscovery({
        searchRegion: geo,
        categories: radarParentCategories,
        categoryKnowledgeByPrimary,
        areaCtx: { country, areaId, areaName },
        knownGems: gems as Array<{ name?: string; alternateTitles?: string[]; googlePlaceId?: string }>,
        knownDiscovered: discoveredPlaces as Array<{
          name?: string;
          alternateTitles?: string[];
          googlePlaceId?: string;
        }>,
        knownGemNamesByCategory,
        primaryLocale,
        onProgress: setRunProgress,
      });

      const runAt = new Date().toISOString();
      if (areaRef) {
        await updateDoc(areaRef, {
          'placeDiscoveryConfig.searchRegionRing': ringToFirestore(draftRing),
          'placeDiscoveryConfig.lastRunAt': runAt,
          'placeDiscoveryConfig.lastRunStats': stats,
          'placeDiscoveryConfig.updatedAt': runAt,
          'placeDiscoveryConfig.searchRegion': deleteField(),
        });
      }
      setLastRunStats(stats);
      setLastRunAt(runAt);

      toast.success(
        `Radar complete: ${stats.created} new · ${stats.skippedDuplicate} duplicates · ${stats.candidatesFound} AI suggestions · ${stats.failedVerification} failed verification`
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Area radar run failed.');
    } finally {
      setIsRunning(false);
      setRunProgress(null);
    }
  };

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Radar className="text-vailo-teal shrink-0" size={28} />
          Area Radar
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Draw a search region on the map for{' '}
          <span className="font-semibold text-vailo-teal">
            {areaName}, {country}
          </span>
          . Review the preview, then run radar to scout new places into{' '}
          <Link
            to={adminPath(`/area/${encodeURIComponent(country)}/${encodeURIComponent(areaId)}/discovered-places`)}
            className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
          >
            Discovered Places
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <AdminCard className="overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              {isDrawing
                ? `Drawing… ${draftRing.length} point${draftRing.length === 1 ? '' : 's'} placed. Click the map to add corners, then finish.`
                : 'Click Draw polygon, place corners on the map, then Finish. Drag vertices to adjust.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {!isDrawing ? (
                <AdminButton
                  type="button"
                  variant="secondary"
                  onClick={startDrawing}
                  disabled={isRunning || mapLoading || Boolean(mapError)}
                >
                  <PenTool size={16} /> Draw polygon
                </AdminButton>
              ) : (
                <>
                  <AdminButton type="button" variant="secondary" onClick={cancelDrawing}>
                    <X size={16} /> Cancel
                  </AdminButton>
                  <AdminButton type="button" onClick={finishDrawing} disabled={draftRing.length < 3}>
                    <Check size={16} /> Finish ({draftRing.length})
                  </AdminButton>
                </>
              )}
              <AdminButton
                type="button"
                variant="secondary"
                onClick={clearRegion}
                disabled={isRunning || (draftRing.length === 0 && !searchRegion)}
              >
                <Trash2 size={16} /> Clear
              </AdminButton>
              <AdminButton
                type="button"
                variant="secondary"
                onClick={saveRegion}
                disabled={isRunning || isSavingRegion || draftRing.length < 3 || isDrawing}
              >
                {isSavingRegion ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save region
              </AdminButton>
            </div>
          </div>

          <div className="relative min-h-[420px] lg:min-h-[520px]">
            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                <Loader2 className="animate-spin text-vailo-teal mr-2" size={22} />
                <span className="text-sm text-gray-500">Loading map…</span>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10 p-6">
                <div className="max-w-md text-center">
                  <AlertCircle className="mx-auto text-red-500 mb-2" size={28} />
                  <p className="text-sm text-red-800">{mapError}</p>
                </div>
              </div>
            )}
            <div ref={mapContainerRef} className="w-full h-[420px] lg:h-[520px]" />
          </div>
        </AdminCard>

        <div className="space-y-4">
          <AdminCard className="p-5">
            <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-vailo-teal/60" />
              Preview before run
            </h3>

            {!preview.valid ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {preview.validationMessage}
              </p>
            ) : (
              <>
              {preview.areaWarning && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                  {preview.areaWarning}
                </p>
              )}
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Vertices</dt>
                  <dd className="font-medium text-vailo-dark">{preview.vertexCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Approx. area</dt>
                  <dd className="font-medium text-vailo-dark">{preview.areaKm2} km²</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Bounding box</dt>
                  <dd className="font-medium text-vailo-dark text-right">
                    {preview.bboxWidthKm} × {preview.bboxHeightKm} km
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Grid anchors</dt>
                  <dd className="font-medium text-vailo-dark">{preview.anchorCount}</dd>
                </div>
                {preview.gridPassCount > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Grid scout passes</dt>
                    <dd className="font-medium text-vailo-dark text-right">
                      {preview.gridPassCount}
                      {preview.anchorCount > preview.gridPassCount
                        ? ` of ${preview.anchorCount} (~${preview.gridCoveragePct}%)`
                        : ''}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Categories</dt>
                  <dd className="font-medium text-vailo-dark">{preview.categoryCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Up to (AI cap)</dt>
                  <dd className="font-medium text-vailo-dark text-right">
                    {preview.maxCandidates}
                    <span className="block text-[11px] font-normal text-gray-400">
                      Actual runs are usually much lower
                    </span>
                  </dd>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between gap-3">
                  <dt className="text-gray-500">Existing local gems</dt>
                  <dd className="font-medium text-vailo-dark">{preview.localGemsCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Existing discovered</dt>
                  <dd className="font-medium text-vailo-dark">{preview.discoveredPlacesCount}</dd>
                </div>
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Est. Gemini calls</dt>
                    <dd className="font-medium text-vailo-dark">{preview.estimatedGeminiCalls}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Est. Google verify calls</dt>
                    <dd className="font-medium text-vailo-dark">{preview.estimatedGoogleTextSearchCalls}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Est. cost (approx.)</dt>
                    <dd className="font-bold text-vailo-dark">${preview.estimatedCostUsd.toFixed(2)}</dd>
                  </div>
                </div>
              </dl>
              </>
            )}

            {radarParentCategories.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Categories included</p>
                <div className="flex flex-wrap gap-1.5">
                  {radarParentCategories.map((cat) => (
                    <AdminBadge key={cat} variant="teal">
                      {cat}
                    </AdminBadge>
                  ))}
                </div>
              </div>
            )}

            <AdminButton
              type="button"
              className="w-full mt-5"
              onClick={handleRunRadar}
              disabled={!preview.valid || isRunning || mapLoading || Boolean(mapError)}
            >
              {isRunning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {isRunning ? 'Running radar…' : 'Run radar'}
            </AdminButton>

            {runProgress && (
              <p className="text-xs text-gray-500 mt-3 animate-pulse">{runProgress.message}</p>
            )}
          </AdminCard>

          {lastRunStats && (
            <AdminCard className="p-5">
              <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider mb-3">Last run</h3>
              {lastRunAt && (
                <p className="text-xs text-gray-400 mb-3">{new Date(lastRunAt).toLocaleString()}</p>
              )}
              <ul className="text-sm space-y-1.5 text-gray-700">
                <li>
                  <span className="font-semibold text-emerald-700">{lastRunStats.created}</span> new in discovered
                  places
                </li>
                <li>{lastRunStats.skippedDuplicate} skipped (already in catalog)</li>
                <li>{lastRunStats.skippedOutside} outside polygon</li>
                <li>{lastRunStats.skippedFiltered} filtered by category rules</li>
                <li>{lastRunStats.failedVerification} failed Google verification</li>
                <li>{lastRunStats.candidatesFound} AI suggestions verified</li>
                {'geminiPasses' in lastRunStats && lastRunStats.geminiPasses ? (
                  <li>{lastRunStats.geminiPasses} Gemini scout passes</li>
                ) : null}
              </ul>
              <Link
                to={adminPath(`/area/${encodeURIComponent(country)}/${encodeURIComponent(areaId)}/discovered-places`)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-vailo-teal mt-4 hover:underline"
              >
                Review discovered places <ExternalLink size={14} />
              </Link>
            </AdminCard>
          )}
        </div>
      </div>
    </div>
  );
}
