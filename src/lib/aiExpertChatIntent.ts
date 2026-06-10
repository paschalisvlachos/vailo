export type CategoryMatchOption = { primary: string; label: string };

/** Guest intent phrases mapped to category primary/label keywords. */
const INTENT_CATEGORY_KEYWORDS: Array<{ intent: RegExp; category: RegExp }> = [
  {
    intent: /\b(swim(?:ming)?|snorkel(?:ing)?|beach(?:es)?|sea|coast|cove|bays?)\b/i,
    category: /\b(beach|swim|coast|sea|cove|bay|shore)\b/i,
  },
  {
    intent: /\b(eat(?:ing)?|food|restaurant|taverna|lunch|dinner|breakfast|brunch|dine|meals?|supper|cuisine)\b/i,
    category: /\b(dining|food|restaurant|taverna|eat|meal|kitchen|bakery|breakfast|brunch)\b/i,
  },
  {
    intent: /\b(drink(?:s|ing)?|bar|wine|cocktail|beer|coffee|café|cafe|nightlife)\b/i,
    category: /\b(drink|bar|wine|coffee|café|cafe|night|cocktail)\b/i,
  },
  {
    intent: /\b(hike|hiking|trail|walk(?:ing)?)\b/i,
    category: /\b(hike|trail|walk)\b/i,
  },
  {
    intent: /\b(shop(?:ping)?|market|boutique)\b/i,
    category: /\b(shop|market|boutique|retail)\b/i,
  },
  {
    intent: /\b(culture|museum|history|historic|sightseeing|monument|archaeolog)\b/i,
    category: /\b(culture|museum|history|historic|sight|monument|archaeolog)\b/i,
  },
];

function categoryTextBlob(cat: CategoryMatchOption): string {
  return `${cat.primary} ${cat.label}`.toLowerCase();
}

/** Match guest free-text against Live like a local category labels / primaries. */
export function inferCategoryPrimariesFromText(
  text: string,
  categories: CategoryMatchOption[],
  max = 3
): string[] {
  const norm = text.toLowerCase();
  const matches: string[] = [];

  // Pass 1 — precise matches: the guest named a category (or its label) directly.
  const directMatches = new Set<string>();
  for (const cat of categories) {
    const primaryNorm = cat.primary.trim().toLowerCase();
    const labelParts = cat.label
      .toLowerCase()
      .split(/[/&,+]/)
      .map((s) => s.trim())
      .filter((part) => part.length >= 3);

    const hit =
      (primaryNorm.length >= 3 && norm.includes(primaryNorm)) ||
      labelParts.some((part) => norm.includes(part));

    if (hit) {
      matches.push(cat.primary);
      directMatches.add(cat.primary);
    }
  }

  // Pass 2 — intent expansion for words that are NOT a category name themselves
  // (e.g. "pizza" → Dining). Crucially, an intent only expands when the guest
  // did NOT already name one of that intent's OWN sibling categories: that keeps
  // "nice breakfast" → just Breakfast (the eat intent is consumed by Breakfast),
  // while "pizza and beach" still adds Dining for the pizza intent.
  for (const { intent, category } of INTENT_CATEGORY_KEYWORDS) {
    if (!intent.test(norm)) continue;
    const siblings = categories.filter((cat) => category.test(categoryTextBlob(cat)));
    const namedASibling = siblings.some((cat) => directMatches.has(cat.primary));
    if (namedASibling) continue;
    for (const cat of siblings) {
      matches.push(cat.primary);
    }
  }

  return [...new Set(matches)].slice(0, max);
}

/** True when the guest has not chosen a fixed day schedule (browse-at-own-pace picks). */
export function isFlexibleTimeFrame(timeFrame?: string | null): boolean {
  const t = (timeFrame || '').trim().toLowerCase();
  return !t || t === 'flexible';
}

/** Turn a mis-typed timeline plan into flexible category picks (no fixed schedule). */
export function coerceTimelineToFlexiblePicks(
  plan: Record<string, unknown>,
  categoryNames: string[]
): Record<string, unknown> {
  const stops = Array.isArray(plan.plan) ? plan.plan : [];
  if (stops.length === 0) {
    return { type: 'picks', categories: [] };
  }

  const toPickItem = (stop: Record<string, unknown>) => ({
    title: stop.title ?? '',
    description: stop.description ?? '',
    distanceKm: stop.distanceKm,
    beyondRadius: stop.beyondRadius ?? false,
    estimatedDistance: stop.estimatedDistance ?? '',
    source: stop.source ?? 'ai',
    googlePlaceId: stop.googlePlaceId ?? '',
    photoUrl: stop.photoUrl ?? '',
    googleMapsUrl: stop.googleMapsUrl ?? '',
    latitude: stop.latitude ?? stop.lat,
    longitude: stop.longitude ?? stop.lng,
  });

  const names = categoryNames.filter(Boolean);
  if (names.length <= 1) {
    return {
      type: 'picks',
      categories: [
        {
          categoryName: names[0] || 'Recommendations',
          items: stops.map((s) => toPickItem(s as Record<string, unknown>)),
        },
      ],
    };
  }

  const buckets: Record<string, unknown>[][] = names.map(() => []);
  stops.forEach((stop, idx) => {
    buckets[idx % names.length].push(stop as Record<string, unknown>);
  });

  return {
    type: 'picks',
    categories: names.map((categoryName, idx) => ({
      categoryName,
      items: buckets[idx].map((s) => toPickItem(s)),
    })),
  };
}

const PLAN_REQUEST_RE =
  /\b(recommend|suggest|where|best|good|great|find|show me|looking for|ideas?|places?|spots?|eat|drink|visit|go|near|around|local|brunch|breakfast|lunch|dinner|taverna|beach|hike|trail)\b/i;

/** True when the guest message is asking for place picks, not general Q&A. */
export function looksLikePlanRequest(text: string, inferredCategories: string[]): boolean {
  if (inferredCategories.length > 0) return true;
  return PLAN_REQUEST_RE.test(text.trim());
}

/**
 * The guest is pointing at the recommendations already on screen — they want
 * those refined/filtered/re-ranked, not a fresh open search.
 */
const REFINEMENT_RE =
  /\b(these|those|them|the (?:ones|list|results?|suggestions?|picks?|options?|recommendations?)|the (?:first|second|third|fourth|last|next) one|refine|narrow|filter|cheaper|pricier|closer|nearer|further|farther|instead|same but|more like (?:these|those|that|them)|similar(?: ones)?|other than (?:these|those|them)|(?:from|of) (?:these|those|the list))\b/i;

export function wantsRefinement(text: string): boolean {
  return REFINEMENT_RE.test(text.trim());
}

/**
 * A vague "more / other recommendations" follow-up that names no new topic — it
 * could mean "refine the current set" or "show me something new", so we ask.
 */
const AMBIGUOUS_FOLLOWUP_RE =
  /\b(more|another|some more|others?|other (?:options|ideas|recommendations|suggestions|places|spots)|anything else|what else|something else|more options)\b/i;

export function isAmbiguousFollowup(text: string): boolean {
  return AMBIGUOUS_FOLLOWUP_RE.test(text.trim());
}

/**
 * Pull an explicit search radius (km) out of a free-text request, e.g. "within
 * 50km", "in a distance of 50 km", "up to 30 kilometres", "radius of 25".
 * Returns null when the guest didn't specify one. Bounded to a sane day-trip
 * range so a stray number can't blow up the search.
 */
export function parseRequestedDistanceKm(text: string): number | null {
  const t = text.toLowerCase();
  const withUnit = t.match(/(\d{1,4})(?:\.\d+)?\s*(?:km|kms|kilometers?|kilometres?|χλμ|χιλιόμετρα?)\b/);
  if (withUnit) {
    const n = parseInt(withUnit[1], 10);
    if (n > 0 && n <= 300) return n;
  }
  const withKeyword = t.match(
    /\b(?:within|radius of|distance of|up to|max(?:imum)?(?: of)?|less than|under)\s+(\d{1,4})\b/
  );
  if (withKeyword) {
    const n = parseInt(withKeyword[1], 10);
    if (n > 0 && n <= 300) return n;
  }
  return null;
}

/**
 * Pull an explicit count out of a free-text request, e.g. "10 best", "top 10",
 * "give me 8 beaches". Bounded to 1–10 (our display ceiling). Returns null when
 * unspecified. Distances ("50km") are excluded by the unit check in the caller
 * and by the 1–10 bound.
 */
export function parseRequestedCount(text: string): number | null {
  const t = text.toLowerCase();
  const before = t.match(
    /\b(?:top|best|give me|show me|find me|the|want|list|need)\s+(\d{1,2})\b/
  );
  const after = t.match(
    /\b(\d{1,2})\s+(?:best|top|great|beaches|places|spots|options|picks|results|tavernas?|restaurants?|bars?|cafes?|recommendations?)\b/
  );
  for (const m of [before, after]) {
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 10) return n;
    }
  }
  return null;
}

/**
 * Accept wrapped chat JSON or a direct picks/timeline plan object. The model is
 * not always consistent about the envelope — it may omit `type`, nest the plan
 * under `plan`, or put the categories/stops directly on the root. We infer a
 * missing type from the actual shape (a `categories` array → picks, a `plan`
 * array → timeline) so a perfectly good list of picks is never silently dropped.
 */
export function extractChatPlanPayload(parsed: Record<string, unknown> | null | undefined): {
  replyText?: string;
  plan: Record<string, unknown> | null;
} {
  if (!parsed || typeof parsed !== 'object') return { plan: null };
  const replyText = typeof parsed.replyText === 'string' ? parsed.replyText : undefined;

  const coerce = (obj: unknown): Record<string, unknown> | null => {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    if (o.type === 'picks' || o.type === 'timeline') return o;
    if (Array.isArray(o.categories) && o.categories.length > 0) {
      return { ...o, type: 'picks' };
    }
    if (Array.isArray(o.plan) && (o.plan as unknown[]).length > 0) {
      return { ...o, type: 'timeline' };
    }
    return null;
  };

  // Prefer an explicit nested plan object, then fall back to the root itself.
  const nested = coerce((parsed as Record<string, unknown>).plan);
  if (nested) return { replyText, plan: nested };

  const root = coerce(parsed);
  if (root) return { replyText, plan: root };

  return { replyText, plan: null };
}
