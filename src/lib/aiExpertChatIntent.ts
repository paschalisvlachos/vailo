export type CategoryMatchOption = { primary: string; label: string };

/** Match guest free-text against Live like a local category labels / primaries. */
export function inferCategoryPrimariesFromText(
  text: string,
  categories: CategoryMatchOption[],
  max = 3
): string[] {
  const norm = text.toLowerCase();
  const matches: string[] = [];

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

    if (hit) matches.push(cat.primary);
  }

  return [...new Set(matches)].slice(0, max);
}

const PLAN_REQUEST_RE =
  /\b(recommend|suggest|where|best|good|great|find|show me|looking for|ideas?|places?|spots?|eat|drink|visit|go|near|around|local|brunch|breakfast|lunch|dinner|taverna|beach|hike|trail)\b/i;

/** True when the guest message is asking for place picks, not general Q&A. */
export function looksLikePlanRequest(text: string, inferredCategories: string[]): boolean {
  if (inferredCategories.length > 0) return true;
  return PLAN_REQUEST_RE.test(text.trim());
}

/** Accept wrapped chat JSON or a direct picks/timeline plan object. */
export function extractChatPlanPayload(parsed: Record<string, unknown> | null | undefined): {
  replyText?: string;
  plan: Record<string, unknown> | null;
} {
  if (!parsed || typeof parsed !== 'object') return { plan: null };

  const type = parsed.type;
  if (type === 'picks' || type === 'timeline') {
    const replyText = typeof parsed.replyText === 'string' ? parsed.replyText : undefined;
    return { replyText, plan: parsed };
  }

  const nested = parsed.plan;
  const hasPlanFlag = parsed.hasPlan === true;
  const nestedPlan =
    nested && typeof nested === 'object' && (nested as { type?: string }).type
      ? (nested as Record<string, unknown>)
      : null;

  if (hasPlanFlag && nestedPlan) {
    return {
      replyText: typeof parsed.replyText === 'string' ? parsed.replyText : undefined,
      plan: nestedPlan,
    };
  }

  if (nestedPlan && (nestedPlan.type === 'picks' || nestedPlan.type === 'timeline')) {
    return {
      replyText: typeof parsed.replyText === 'string' ? parsed.replyText : undefined,
      plan: nestedPlan,
    };
  }

  return {
    replyText: typeof parsed.replyText === 'string' ? parsed.replyText : undefined,
    plan: null,
  };
}
