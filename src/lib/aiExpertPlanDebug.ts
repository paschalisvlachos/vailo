/**
 * Console diagnostics for Live like a local pick pipeline (paint → enrich → filter).
 * Logging only — no behavior changes.
 */

import { bareGooglePlaceId, isDirectPlaceMapsUrl } from './geocoding';

const PREFIX = '[Vailo picks]';

export type PlanPickRow = {
  category: string;
  title: string;
  source?: string;
  curatedScope?: string;
  photoUrl: boolean;
  googlePlaceId: string | null;
  directMapLink: boolean;
  distanceKm: number | null;
  beyondRadius?: boolean;
  isLegitPick?: boolean;
};

function pickTitle(item: Record<string, unknown>): string {
  return String(item.title || item.name || '').trim();
}

export function summarizePickItem(
  item: Record<string, unknown>,
  category = ''
): PlanPickRow {
  const mapsUrl = typeof item.googleMapsUrl === 'string' ? item.googleMapsUrl : '';
  const pid = bareGooglePlaceId(item.googlePlaceId as string | undefined);
  let distanceKm: number | null = null;
  if (typeof item.distanceKm === 'number' && !isNaN(item.distanceKm)) {
    distanceKm = item.distanceKm;
  } else if (typeof item.estimatedDistance === 'string') {
    const m = item.estimatedDistance.match(/(\d+(?:\.\d+)?)/);
    if (m) distanceKm = parseFloat(m[1]);
  }

  return {
    category,
    title: pickTitle(item),
    source: typeof item.source === 'string' ? item.source : undefined,
    curatedScope:
      typeof item.curatedScope === 'string' ? item.curatedScope : undefined,
    photoUrl: Boolean(typeof item.photoUrl === 'string' && item.photoUrl.trim()),
    googlePlaceId: pid || null,
    directMapLink: isDirectPlaceMapsUrl(mapsUrl),
    distanceKm,
    beyondRadius: item.beyondRadius === true,
    isLegitPick: item.isLegitPick === true,
  };
}

export function flattenPlanPicks(plan: unknown): PlanPickRow[] {
  if (!plan || typeof plan !== 'object') return [];
  const data = plan as Record<string, unknown>;
  const out: PlanPickRow[] = [];

  if (data.type === 'picks' && Array.isArray(data.categories)) {
    for (const cat of data.categories as Record<string, unknown>[]) {
      const categoryName = String(cat.categoryName || '');
      for (const item of (cat.items as Record<string, unknown>[]) || []) {
        out.push(summarizePickItem(item, categoryName));
      }
    }
    return out;
  }

  if (data.type === 'timeline' && Array.isArray(data.plan)) {
    for (const item of data.plan as Record<string, unknown>[]) {
      out.push(summarizePickItem(item, 'timeline'));
    }
  }

  return out;
}

function pickKey(row: PlanPickRow): string {
  return `${row.category}::${row.title.toLowerCase()}`;
}

export function diffPlanPicks(
  before: unknown,
  after: unknown
): {
  appeared: PlanPickRow[];
  hidden: PlanPickRow[];
  kept: PlanPickRow[];
} {
  const beforeRows = flattenPlanPicks(before);
  const afterRows = flattenPlanPicks(after);
  const beforeMap = new Map(beforeRows.map((r) => [pickKey(r), r]));
  const afterMap = new Map(afterRows.map((r) => [pickKey(r), r]));

  const appeared: PlanPickRow[] = [];
  const hidden: PlanPickRow[] = [];
  const kept: PlanPickRow[] = [];

  for (const [key, row] of afterMap) {
    if (beforeMap.has(key)) kept.push(row);
    else appeared.push(row);
  }
  for (const [key, row] of beforeMap) {
    if (!afterMap.has(key)) hidden.push(row);
  }

  return { appeared, hidden, kept };
}

export function logPlanStage(
  stage: string,
  meta: Record<string, unknown>,
  plan: unknown,
  previousPlan?: unknown
): void {
  const rows = flattenPlanPicks(plan);
  console.log(`${PREFIX} ${stage}`, { ...meta, pickCount: rows.length });
  console.log(`${PREFIX} ${stage} — listings`, rows);

  if (previousPlan) {
    const delta = diffPlanPicks(previousPlan, plan);
    if (delta.hidden.length > 0) {
      console.log(`${PREFIX} ${stage} — HIDDEN (removed from UI)`, delta.hidden);
    }
    if (delta.appeared.length > 0) {
      console.log(`${PREFIX} ${stage} — APPEARED (new on UI)`, delta.appeared);
    }
    if (delta.kept.length > 0) {
      console.log(`${PREFIX} ${stage} — KEPT`, delta.kept);
    }
  }
}

export function logPickEvent(
  event: string,
  detail: Record<string, unknown>
): void {
  console.log(`${PREFIX} ${event}`, detail);
}
