import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import {
  colorForGemCategory,
  gemMapDivIconHtml,
  parseGemCoord,
  type AreaGemMapPoint,
} from '../../lib/areaLocalGemsMap';
import {
  categoryPrimaryName,
  gemCategoryPrimaries,
  resolveCategoryLabel,
} from '../../lib/categoryLocale';

type CategoryOption = {
  value: string;
  label: string;
};

type GemLike = {
  id: string;
  name?: string;
  latitude?: unknown;
  longitude?: unknown;
  category?: unknown;
  categories?: unknown;
};

type Props = {
  gems: GemLike[];
  categoryCatalogDocs: Record<string, unknown>[];
  primaryLocale: string;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: CategoryOption[];
  onDeleteGem: (id: string, name: string) => void;
};

function labelForPrimary(
  primary: string,
  categoryCatalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string {
  const key = primary.trim().toLowerCase();
  const doc = categoryCatalogDocs.find(
    (d) => categoryPrimaryName(d, primaryLocale).trim().toLowerCase() === key
  );
  if (!doc) return primary;
  return resolveCategoryLabel(doc, primaryLocale, primaryLocale) || primary;
}

function buildMapPoints(
  gems: GemLike[],
  categoryCatalogDocs: Record<string, unknown>[],
  primaryLocale: string,
  categoryFilter: string
): AreaGemMapPoint[] {
  const filterKey = categoryFilter === 'all' ? '' : categoryFilter.trim().toLowerCase();
  const points: AreaGemMapPoint[] = [];

  for (const gem of gems) {
    const lat = parseGemCoord(gem.latitude);
    const lng = parseGemCoord(gem.longitude);
    if (lat == null || lng == null) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const primaries = gemCategoryPrimaries(gem, categoryCatalogDocs, primaryLocale);
    if (filterKey) {
      const matches = primaries.some((p) => p.toLowerCase() === filterKey);
      if (!matches) continue;
    }

    const categoryPrimary =
      (filterKey
        ? primaries.find((p) => p.toLowerCase() === filterKey)
        : primaries[0]) ||
      String(gem.category || '').trim() ||
      'Uncategorized';

    points.push({
      id: gem.id,
      name: String(gem.name || 'Untitled').trim() || 'Untitled',
      lat,
      lng,
      categoryPrimary,
      categoryLabel: labelForPrimary(categoryPrimary, categoryCatalogDocs, primaryLocale),
      color: colorForGemCategory(categoryPrimary),
    });
  }
  return points;
}

export default function AreaLocalGemsMap({
  gems,
  categoryCatalogDocs,
  primaryLocale,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  onDeleteGem,
}: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onDeleteGemRef = useRef(onDeleteGem);
  onDeleteGemRef.current = onDeleteGem;

  const mappedCount = useMemo(() => {
    let n = 0;
    for (const gem of gems) {
      const lat = parseGemCoord(gem.latitude);
      const lng = parseGemCoord(gem.longitude);
      if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        n += 1;
      }
    }
    return n;
  }, [gems]);

  const visiblePoints = useMemo(
    () => buildMapPoints(gems, categoryCatalogDocs, primaryLocale, categoryFilter),
    [gems, categoryCatalogDocs, primaryLocale, categoryFilter]
  );

  const legendItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const gem of gems) {
      const lat = parseGemCoord(gem.latitude);
      const lng = parseGemCoord(gem.longitude);
      if (lat == null || lng == null) continue;
      for (const primary of gemCategoryPrimaries(gem, categoryCatalogDocs, primaryLocale)) {
        const key = primary.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const items = categoryOptions
      .map((opt) => {
        const count = counts.get(opt.value.toLowerCase()) || 0;
        if (count === 0) return null;
        return {
          value: opt.value,
          label: opt.label,
          color: colorForGemCategory(opt.value),
          count,
        };
      })
      .filter(Boolean) as { value: string; label: string; color: string; count: number }[];

    return items;
  }, [gems, categoryCatalogDocs, primaryLocale, categoryOptions]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;

    const map = L.map(mapElRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const point of visiblePoints) {
      const icon = L.divIcon({
        className: 'area-gems-map-pin',
        html: gemMapDivIconHtml(point.color),
        iconSize: [18, 18],
        iconAnchor: [9, 18],
        popupAnchor: [0, -16],
      });
      const marker = L.marker([point.lat, point.lng], { icon });
      marker.bindPopup(
        `<div style="min-width:160px">
          <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#051F26">${escapeHtml(point.name)}</p>
          <p style="margin:0 0 10px;font-size:11px;color:#64748B">
            <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${point.color};margin-right:6px;vertical-align:middle"></span>
            ${escapeHtml(point.categoryLabel)}
          </p>
          <button
            type="button"
            data-area-gem-delete
            style="display:inline-flex;align-items:center;justify-content:center;width:100%;padding:6px 10px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;cursor:pointer"
          >
            Delete
          </button>
        </div>`
      );
      marker.on('popupopen', () => {
        const popupEl = marker.getPopup()?.getElement();
        const btn = popupEl?.querySelector('[data-area-gem-delete]') as HTMLButtonElement | null;
        if (!btn || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', (event) => {
          L.DomEvent.stop(event);
          onDeleteGemRef.current(point.id, point.name);
        });
      });
      layer.addLayer(marker);
    }

    requestAnimationFrame(() => {
      map.invalidateSize();
      if (visiblePoints.length === 0) return;
      if (visiblePoints.length === 1) {
        map.setView([visiblePoints[0].lat, visiblePoints[0].lng], 14);
        return;
      }
      const bounds = L.latLngBounds(visiblePoints.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
    });
  }, [visiblePoints]);

  if (mappedCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center">
        <MapPin className="mx-auto mb-2 text-gray-300" size={28} />
        <p className="text-sm font-semibold text-gray-600">No mapped gems yet</p>
        <p className="mt-1 text-xs text-gray-400">
          Add latitude and longitude on a gem to see it on this map.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Local gems map</h3>
          <p className="text-xs text-gray-500">
            {visiblePoints.length} of {mappedCount} places with coordinates
            {categoryFilter !== 'all' ? ' · filtered by category' : ''}
          </p>
        </div>
        {categoryFilter !== 'all' && (
          <button
            type="button"
            onClick={() => onCategoryFilterChange('all')}
            className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Show all categories
          </button>
        )}
      </div>

      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => onCategoryFilterChange('all')}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
              categoryFilter === 'all'
                ? 'border-gray-800 bg-gray-800 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {legendItems.map((item) => {
            const selected = categoryFilter.toLowerCase() === item.value.toLowerCase();
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onCategoryFilterChange(selected ? 'all' : item.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  selected
                    ? 'border-gray-800 bg-gray-800 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
                title={`Filter to ${item.label}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                {item.label}
                <span className={selected ? 'text-white/70' : 'text-gray-400'}>({item.count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={mapElRef} className="h-[22rem] w-full bg-gray-100 sm:h-[28rem]" />

      {visiblePoints.length === 0 && (
        <p className="border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-500 sm:px-5">
          No gems with coordinates in this category.
        </p>
      )}
    </section>
  );
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
