import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions, db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { httpsCallableMessage } from '../../../lib/callableError';
import {
  allTrailsPhotoUrl,
  describeAllTrailsStartUrl,
  extractAllTrailsShareHash,
  parseEmbedSrcFromIframe,
  resolveAllTrailsEmbedSrc,
} from '../../../lib/allTrailsTrail';
import AdminTrailRoutePreview from '../../../components/admin/AdminTrailRoutePreview';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminLabel,
  AdminSection,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';
import {
  Footprints,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  X,
  Star,
  MapPin,
} from 'lucide-react';

type LocalTrail = {
  id: string;
  allTrailsId?: string | null;
  name?: string;
  description?: string;
  difficulty?: string;
  lengthKm?: number | null;
  lengthMiles?: number | null;
  elevationGainM?: number | null;
  elevationGainFt?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  routeType?: string;
  areaLabel?: string;
  latitude?: number | null;
  longitude?: number | null;
  photoUrl?: string;
  allTrailsUrl?: string;
  allTrailsSlug?: string;
  allTrailsEmbedSrc?: string;
  allTrailsWidgetUrl?: string;
  parking?: string;
  dogsAllowed?: boolean | null;
  kidFriendly?: boolean | null;
  source?: string;
  manuallyEditedFields?: string[];
  lastSyncedAt?: unknown;
};

type SyncConfig = {
  startUrl: string;
  maxItems: number;
  embedShareHash?: string;
  regionSummary?: string;
  lastSyncedAt?: unknown;
  lastSyncStats?: {
    created?: number;
    updated?: number;
    skipped?: number;
    total?: number;
    totalAvailable?: number | null;
  };
};

const EDITABLE_FIELDS = [
  'name',
  'description',
  'difficulty',
  'lengthKm',
  'lengthMiles',
  'elevationGainFt',
  'rating',
  'reviewCount',
  'routeType',
  'areaLabel',
  'latitude',
  'longitude',
  'photoUrl',
  'allTrailsUrl',
  'allTrailsEmbedSrc',
  'parking',
] as const;

const emptyForm = {
  name: '',
  description: '',
  difficulty: '',
  lengthKm: '',
  lengthMiles: '',
  elevationGainFt: '',
  rating: '',
  reviewCount: '',
  routeType: '',
  areaLabel: '',
  latitude: '',
  longitude: '',
  photoUrl: '',
  allTrailsUrl: '',
  allTrailsEmbedSrc: '',
  parking: '',
};

function difficultyBadgeClass(difficulty?: string) {
  const d = (difficulty || '').toLowerCase();
  if (d.includes('easy')) return 'bg-emerald-100 text-emerald-800';
  if (d.includes('moderate')) return 'bg-amber-100 text-amber-900';
  if (d.includes('hard') || d.includes('difficult')) return 'bg-orange-100 text-orange-900';
  return 'bg-gray-100 text-gray-700';
}

function formatLength(trail: LocalTrail) {
  if (trail.lengthKm != null) return `${trail.lengthKm.toFixed(1)} km`;
  if (trail.lengthMiles != null) return `${trail.lengthMiles.toFixed(1)} mi`;
  return '—';
}

export default function AreaLocalTrails() {
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  const [trails, setTrails] = useState<LocalTrail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    startUrl: '',
    maxItems: 200,
    embedShareHash: '',
  });
  const [embedPasteBuffer, setEmbedPasteBuffer] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSavingTrail, setIsSavingTrail] = useState(false);

  const startUrlScopeHint = useMemo(
    () => describeAllTrailsStartUrl(syncConfig.startUrl),
    [syncConfig.startUrl]
  );

  const importAllMax = syncConfig.lastSyncStats?.totalAvailable;

  const areaRef = useMemo(
    () => (decodedCountry && areaId ? doc(db, 'countries', decodedCountry, 'areas', areaId) : null),
    [decodedCountry, areaId]
  );

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const trailsRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails');
    return onSnapshot(
      trailsRef,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrail[];
        rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setTrails(rows);
        setIsLoading(false);
      },
      (err) => {
        console.error('Failed to load trails:', err);
        setIsLoading(false);
        toast.error('Could not load trails from Firestore.');
      }
    );
  }, [decodedCountry, areaId]);

  useEffect(() => {
    if (!areaRef) return;
    return onSnapshot(areaRef, (snap) => {
      const cfg = snap.data()?.allTrailsSync as SyncConfig | undefined;
      if (cfg) {
        setSyncConfig({
          startUrl: cfg.startUrl || '',
          maxItems: cfg.maxItems || 200,
          embedShareHash: cfg.embedShareHash || '',
          regionSummary: cfg.regionSummary,
          lastSyncedAt: cfg.lastSyncedAt,
          lastSyncStats: cfg.lastSyncStats,
        });
      }
    });
  }, [areaRef]);

  const saveSyncConfig = async () => {
    if (!areaRef) return;
    const startUrl = syncConfig.startUrl.trim();
    if (!startUrl.includes('alltrails.com')) {
      toast.warning('Paste a valid AllTrails URL (must contain alltrails.com).');
      return;
    }
    setIsSavingConfig(true);
    try {
      await setDoc(
        areaRef,
        {
          allTrailsSync: {
            startUrl,
            maxItems: Math.min(Math.max(syncConfig.maxItems || 200, 1), 2000),
            embedShareHash: syncConfig.embedShareHash?.trim() || null,
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );
      toast.success('Sync settings saved.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save sync settings.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const runSync = async (maxOverride?: number) => {
    if (!decodedCountry || !areaId) return;
    const maxItems = maxOverride ?? syncConfig.maxItems;
    setIsSyncing(true);
    try {
      const syncAllTrailsForArea = httpsCallable<
        {
          country: string;
          areaId: string;
          startUrl?: string;
          maxItems?: number;
          embedShareHash?: string;
        },
        {
          ok: boolean;
          fetched: number;
          created: number;
          updated: number;
          skipped: number;
          totalAvailable?: number | null;
          regionSummary?: string | null;
        }
      >(cloudFunctions, 'syncAllTrailsForArea');

      const result = await syncAllTrailsForArea({
        country: decodedCountry,
        areaId,
        startUrl: syncConfig.startUrl.trim(),
        maxItems,
        embedShareHash: syncConfig.embedShareHash?.trim(),
      });

      const { fetched, created, updated, skipped, totalAvailable, regionSummary } = result.data;
      let message =
        `Sync complete: ${fetched} fetched · ${created} new · ${updated} updated` +
        (skipped ? ` · ${skipped} skipped` : '');
      if (totalAvailable != null && totalAvailable > fetched) {
        message += `. ${totalAvailable} trails match this URL — use Import all to get the rest.`;
      }
      toast.success(message);
      if (regionSummary) {
        setSyncConfig((c) => ({ ...c, regionSummary }));
      }
      if (maxOverride != null) {
        setSyncConfig((c) => ({ ...c, maxItems: maxOverride }));
      }
    } catch (err) {
      console.error(err);
      toast.error(httpsCallableMessage(err, 'AllTrails sync failed.'));
    } finally {
      setIsSyncing(false);
    }
  };

  const importAllInRegion = async () => {
    if (!importAllMax || importAllMax < 1) {
      toast.warning('Run a sync first to learn how many trails match your URL.');
      return;
    }
    const cap = Math.min(importAllMax, 2000);
    await runSync(cap);
  };

  const openEdit = (trail: LocalTrail) => {
    setEditingId(trail.id);
    setFormData({
      name: trail.name || '',
      description: trail.description || '',
      difficulty: trail.difficulty || '',
      lengthKm: trail.lengthKm != null ? String(trail.lengthKm) : '',
      lengthMiles: trail.lengthMiles != null ? String(trail.lengthMiles) : '',
      elevationGainFt: trail.elevationGainFt != null ? String(trail.elevationGainFt) : '',
      rating: trail.rating != null ? String(trail.rating) : '',
      reviewCount: trail.reviewCount != null ? String(trail.reviewCount) : '',
      routeType: trail.routeType || '',
      areaLabel: trail.areaLabel || '',
      latitude: trail.latitude != null ? String(trail.latitude) : '',
      longitude: trail.longitude != null ? String(trail.longitude) : '',
      photoUrl: trail.photoUrl || '',
      allTrailsUrl: trail.allTrailsUrl || '',
      allTrailsEmbedSrc: trail.allTrailsEmbedSrc || trail.allTrailsWidgetUrl || '',
      parking: trail.parking || '',
    });
  };

  const saveTrail = async () => {
    if (!decodedCountry || !areaId || !editingId) return;
    if (!formData.name.trim()) {
      toast.warning('Trail name is required.');
      return;
    }

    setIsSavingTrail(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        difficulty: formData.difficulty.trim(),
        lengthKm: formData.lengthKm ? parseFloat(formData.lengthKm) : null,
        lengthMiles: formData.lengthMiles ? parseFloat(formData.lengthMiles) : null,
        elevationGainFt: formData.elevationGainFt ? parseFloat(formData.elevationGainFt) : null,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        reviewCount: formData.reviewCount ? parseInt(formData.reviewCount, 10) : null,
        routeType: formData.routeType.trim(),
        areaLabel: formData.areaLabel.trim(),
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        photoUrl: formData.photoUrl.trim(),
        allTrailsUrl: formData.allTrailsUrl.trim(),
        allTrailsEmbedSrc: formData.allTrailsEmbedSrc.trim(),
        parking: formData.parking.trim(),
        manuallyEditedFields: [...EDITABLE_FIELDS],
        updatedAt: new Date(),
      };

      await updateDoc(
        doc(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails', editingId),
        payload
      );
      toast.success('Trail saved.');
      setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save trail.');
    } finally {
      setIsSavingTrail(false);
    }
  };

  const deleteTrail = async (trail: LocalTrail) => {
    if (!decodedCountry || !areaId) return;
    if (!window.confirm(`Delete "${trail.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(
        doc(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails', trail.id)
      );
      toast.success('Trail deleted.');
      if (editingId === trail.id) setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete trail.');
    }
  };

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Footprints className="mr-3 text-vailo-teal shrink-0" size={28} />
          Local Trails
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Hiking trails for{' '}
          <span className="font-semibold text-vailo-teal">
            {decodedArea}, {decodedCountry}
          </span>
          . Admin library only — not shown to guests yet.
        </p>
      </div>

      <AdminSection
        title="AllTrails sync"
        icon={<RefreshCw size={18} className="text-vailo-teal/60" />}
        className="mb-8"
      >
        <AdminCard className="p-5 sm:p-6 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Open AllTrails, search or filter trails for this area, copy the explore or region URL,
            paste it below, then synchronize. Re-sync merges updates into existing trails by
            AllTrails ID — manually edited fields are preserved.
          </p>
          <div>
            <AdminLabel>AllTrails Start URL</AdminLabel>
            <AdminInput
              type="url"
              value={syncConfig.startUrl}
              onChange={(e) => setSyncConfig((c) => ({ ...c, startUrl: e.target.value }))}
              placeholder="https://www.alltrails.com/explore/…"
            />
            {startUrlScopeHint ? (
              <p className="text-xs text-vailo-teal/80 mt-2 leading-relaxed">{startUrlScopeHint}</p>
            ) : null}
          </div>
          <div className="max-w-xs">
            <AdminLabel>Max trails per sync</AdminLabel>
            <AdminInput
              type="number"
              min={1}
              max={2000}
              value={syncConfig.maxItems}
              onChange={(e) =>
                setSyncConfig((c) => ({
                  ...c,
                  maxItems: Math.min(2000, Math.max(1, parseInt(e.target.value, 10) || 200)),
                }))
              }
            />
            <p className="text-xs text-gray-400 mt-1">
              Not a 100-trail limit — 100 is only the internal page size. Set this to how many trails
              you want imported (e.g. 539). After the first sync, use Import all to match the region
              count automatically.
            </p>
          </div>
          <details className="rounded-xl border border-gray-100 bg-vailo-surface-elevated/50 px-4 py-3">
            <summary className="text-sm font-semibold text-gray-700 cursor-pointer">
              Route map embed — advanced (usually not needed)
            </summary>
            <p className="text-xs text-gray-500 mt-3 mb-2 leading-relaxed">
              Sync already saves an embed URL per trail (the full hiking path loads from AllTrails
              when the iframe runs — we do not download GPX). Only use this if the map stays blank:
              paste Share → Embed once to add the extra <code className="text-[11px]">sh=</code>{' '}
              token AllTrails adds for external sites.
            </p>
            <AdminLabel>Embed token (sh=…)</AdminLabel>
            <AdminInput
              value={syncConfig.embedShareHash || ''}
              onChange={(e) =>
                setSyncConfig((c) => ({ ...c, embedShareHash: e.target.value.trim() }))
              }
              placeholder="ejxgu1"
            />
            <AdminTextarea
              rows={2}
              className="mt-2"
              value={embedPasteBuffer}
              onChange={(e) => setEmbedPasteBuffer(e.target.value)}
              onBlur={() => {
                const pasted = embedPasteBuffer.trim();
                if (!pasted) return;
                const hash = extractAllTrailsShareHash(pasted);
                if (hash) {
                  setSyncConfig((c) => ({ ...c, embedShareHash: hash }));
                  toast.success(`Embed token saved (${hash}). Save settings, then re-sync.`);
                }
                setEmbedPasteBuffer('');
              }}
              placeholder="Or paste the full <iframe …> code from AllTrails Share → Embed"
            />
          </details>
          <div className="flex flex-wrap gap-3 pt-2">
            <AdminButton onClick={saveSyncConfig} disabled={isSavingConfig}>
              {isSavingConfig ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save settings
            </AdminButton>
            <AdminButton
              variant="gold"
              onClick={() => runSync()}
              disabled={isSyncing || !syncConfig.startUrl.trim()}
            >
              {isSyncing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Synchronize from AllTrails
            </AdminButton>
            {importAllMax != null && importAllMax > 0 && (
              <AdminButton
                variant="ghost"
                onClick={importAllInRegion}
                disabled={isSyncing || !syncConfig.startUrl.trim()}
              >
                Import all ({Math.min(importAllMax, 2000)})
              </AdminButton>
            )}
          </div>
          {(syncConfig.regionSummary || syncConfig.lastSyncStats) && (
            <div className="text-xs text-gray-500 space-y-1">
              {syncConfig.regionSummary ? <p>Region: {syncConfig.regionSummary}</p> : null}
              {syncConfig.lastSyncStats ? (
                <p>
                  Last sync: {syncConfig.lastSyncStats.created ?? 0} new,{' '}
                  {syncConfig.lastSyncStats.updated ?? 0} updated
                  {(syncConfig.lastSyncStats.skipped ?? 0) > 0 &&
                    `, ${syncConfig.lastSyncStats.skipped} skipped`}
                  {syncConfig.lastSyncStats.totalAvailable != null &&
                    ` · ${syncConfig.lastSyncStats.totalAvailable} match your URL`}
                </p>
              ) : null}
            </div>
          )}
        </AdminCard>
      </AdminSection>

      {isLoading ? (
        <div className="py-20 text-center text-gray-400">
          <Loader2 size={40} className="animate-spin mx-auto mb-4" />
        </div>
      ) : trails.length === 0 ? (
        <AdminEmptyState
          icon={<Footprints size={36} className="text-gray-300" />}
          title="No trails yet"
          description={`Save an AllTrails URL and run Synchronize to import trails for ${decodedArea}.`}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {trails.length} trail{trails.length === 1 ? '' : 's'} in library
          </p>
        <AdminCard className="overflow-hidden">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Trail</th>
                  <th className="hidden md:table-cell">Difficulty</th>
                  <th className="hidden sm:table-cell">Length</th>
                  <th className="hidden lg:table-cell">Rating</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trails.map((trail) => {
                  const thumbUrl = allTrailsPhotoUrl(trail.allTrailsId, trail.photoUrl);
                  const embedSrc =
                    editingId === trail.id && formData.allTrailsEmbedSrc.trim()
                      ? formData.allTrailsEmbedSrc.trim()
                      : resolveAllTrailsEmbedSrc({
                          embedSrc: trail.allTrailsEmbedSrc,
                          widgetUrl: trail.allTrailsWidgetUrl,
                          slug: trail.allTrailsSlug,
                          allTrailsUrl: trail.allTrailsUrl,
                          shareHash: syncConfig.embedShareHash,
                        });
                  return (
                  <Fragment key={trail.id}>
                    <tr>
                      <td>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-vailo-surface-elevated overflow-hidden shrink-0 border border-gray-100">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-gray-300">
                                <MapPin size={16} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-vailo-dark truncate">{trail.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {trail.areaLabel || trail.routeType || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        {trail.difficulty ? (
                          <span
                            className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${difficultyBadgeClass(trail.difficulty)}`}
                          >
                            {trail.difficulty}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap">{formatLength(trail)}</td>
                      <td className="hidden lg:table-cell">
                        {trail.rating != null ? (
                          <span className="inline-flex items-center text-sm font-semibold text-gray-700">
                            <Star size={14} className="text-yellow-500 fill-yellow-500 mr-1" />
                            {trail.rating}
                            {trail.reviewCount != null && (
                              <span className="text-gray-400 font-normal ml-1">
                                ({trail.reviewCount.toLocaleString()})
                              </span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {trail.allTrailsUrl && (
                            <a
                              href={trail.allTrailsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on AllTrails"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5"
                            >
                              <ExternalLink size={16} />
                            </a>
                          )}
                          <button
                            type="button"
                            title="Edit"
                            onClick={() =>
                              editingId === trail.id ? setEditingId(null) : openEdit(trail)
                            }
                            className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => deleteTrail(trail)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === trail.id && (
                      <tr key={`${trail.id}-edit`}>
                        <td colSpan={5} className="bg-vailo-surface-elevated/80 !py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <AdminLabel>Name</AdminLabel>
                              <AdminInput
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              />
                            </div>
                            <div>
                              <AdminLabel>Difficulty</AdminLabel>
                              <AdminInput
                                value={formData.difficulty}
                                onChange={(e) =>
                                  setFormData({ ...formData, difficulty: e.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <AdminLabel>Description</AdminLabel>
                              <AdminTextarea
                                rows={3}
                                value={formData.description}
                                onChange={(e) =>
                                  setFormData({ ...formData, description: e.target.value })
                                }
                              />
                            </div>
                            <AdminTrailRoutePreview
                              name={trail.name}
                              embedSrc={embedSrc}
                              allTrailsUrl={trail.allTrailsUrl}
                            />
                            <div className="sm:col-span-2 lg:col-span-3">
                              <AdminLabel>Embed iframe src (optional)</AdminLabel>
                              <AdminInput
                                value={formData.allTrailsEmbedSrc}
                                onChange={(e) =>
                                  setFormData({ ...formData, allTrailsEmbedSrc: e.target.value })
                                }
                                onBlur={(e) => {
                                  const pasted = e.target.value.trim();
                                  if (!pasted.includes('<iframe')) return;
                                  const src = parseEmbedSrcFromIframe(pasted);
                                  if (src) setFormData((f) => ({ ...f, allTrailsEmbedSrc: src }));
                                }}
                                placeholder="https://www.alltrails.com/widget/trail/…?u=m&sh=…"
                              />
                            </div>
                            <div>
                              <AdminLabel>Length (km)</AdminLabel>
                              <AdminInput
                                value={formData.lengthKm}
                                onChange={(e) =>
                                  setFormData({ ...formData, lengthKm: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <AdminLabel>Elevation gain (ft)</AdminLabel>
                              <AdminInput
                                value={formData.elevationGainFt}
                                onChange={(e) =>
                                  setFormData({ ...formData, elevationGainFt: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <AdminLabel>Route type</AdminLabel>
                              <AdminInput
                                value={formData.routeType}
                                onChange={(e) =>
                                  setFormData({ ...formData, routeType: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <AdminLabel>Rating</AdminLabel>
                              <AdminInput
                                value={formData.rating}
                                onChange={(e) =>
                                  setFormData({ ...formData, rating: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <AdminLabel>Latitude</AdminLabel>
                              <AdminInput
                                value={formData.latitude}
                                onChange={(e) =>
                                  setFormData({ ...formData, latitude: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <AdminLabel>Longitude</AdminLabel>
                              <AdminInput
                                value={formData.longitude}
                                onChange={(e) =>
                                  setFormData({ ...formData, longitude: e.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <AdminLabel>Photo URL</AdminLabel>
                              <AdminInput
                                value={formData.photoUrl}
                                onChange={(e) =>
                                  setFormData({ ...formData, photoUrl: e.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <AdminLabel>AllTrails URL</AdminLabel>
                              <AdminInput
                                value={formData.allTrailsUrl}
                                onChange={(e) =>
                                  setFormData({ ...formData, allTrailsUrl: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <AdminButton onClick={saveTrail} disabled={isSavingTrail}>
                              {isSavingTrail ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Save size={16} />
                              )}
                              Save changes
                            </AdminButton>
                            <AdminButton variant="ghost" onClick={() => setEditingId(null)}>
                              <X size={16} />
                              Cancel
                            </AdminButton>
                            {trail.manuallyEditedFields?.length ? (
                              <AdminBadge variant="gold">Manual edits protected on re-sync</AdminBadge>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminCard>
        </>
      )}
    </div>
  );
}
