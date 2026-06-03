/**
 * Extract appliance/device inventory from house guide data for the 24/7 assistant.
 */

export type GuideDeviceEntry = {
  room: string;
  device: string;
  brand: string;
  model: string;
};

/** Free-text guide fields that often mention brands, models, or appliance types. */
const MODEL_CONTEXT_FIELD_IDS = [
  'applianceModels',
  'entertainmentModels',
  'smartHomeDevices',
  'electricalAppliances',
  'kitchenEquipment',
  'applianceInstructions',
  'washingMachine',
  'dryerIron',
  'acInstructions',
  'heatingInstructions',
  'tvStreaming',
  'bbqType',
  'bbqInstructions',
] as const;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function extractDeviceInventoryFromGuide(
  guide: Record<string, unknown> | null | undefined
): GuideDeviceEntry[] {
  if (!guide) return [];
  const list = guide.devicesList;
  if (!Array.isArray(list)) return [];

  const out: GuideDeviceEntry[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const entry: GuideDeviceEntry = {
      room: str(r.room),
      device: str(r.device),
      brand: str(r.brand),
      model: str(r.model),
    };
    if (entry.device || entry.brand || entry.model) out.push(entry);
  }
  return out;
}

export function formatDeviceInventoryForPrompt(entries: GuideDeviceEntry[]): string {
  if (entries.length === 0) return '';
  return entries
    .map((e) => {
      const parts = [e.room, e.device, e.brand, e.model].filter(Boolean);
      return `- ${parts.join(' · ')}`;
    })
    .join('\n');
}

export function formatModelContextNotesFromGuide(
  guide: Record<string, unknown> | null | undefined
): string {
  if (!guide) return '';
  const blocks: string[] = [];
  for (const fieldId of MODEL_CONTEXT_FIELD_IDS) {
    const text = str(guide[fieldId]);
    if (text) blocks.push(`[${fieldId}]\n${text.slice(0, 1200)}`);
  }
  return blocks.join('\n\n');
}

export function guideHasIdentifiableModels(
  guide: Record<string, unknown> | null | undefined
): boolean {
  const inventory = extractDeviceInventoryFromGuide(guide);
  if (inventory.some((e) => e.brand || e.model)) return true;
  const notes = formatModelContextNotesFromGuide(guide);
  return notes.length > 0;
}

const APPLIANCE_TOPIC_PATTERNS: { topic: RegExp; deviceHint: RegExp }[] = [
  { topic: /washing|washer|laundry/i, deviceHint: /wash|laundry/i },
  { topic: /dryer|tumble/i, deviceHint: /dryer|tumble/i },
  { topic: /dishwash/i, deviceHint: /dish/i },
  { topic: /oven|microwave|hob|stove|induction/i, deviceHint: /oven|microwave|hob|stove/i },
  { topic: /fridge|refrigerat|freezer/i, deviceHint: /fridge|refrigerat|freezer/i },
  { topic: /air cond|a\/c|\bac\b|heating|boiler/i, deviceHint: /air|heat|boiler|ac/i },
  { topic: /tv|television|streaming/i, deviceHint: /tv|television|screen/i },
  { topic: /bbq|barbecue|grill/i, deviceHint: /bbq|barbecue|grill/i },
  { topic: /coffee/i, deviceHint: /coffee/i },
];

const OPERATION_QUESTION =
  /how|use|work|start|operat|instruc|program|button|setting|cycle|turn on|switch on/i;

/** Guest is asking how to operate an appliance (not just where it is). */
export function isApplianceOperationQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const topicHit = APPLIANCE_TOPIC_PATTERNS.some((p) => p.topic.test(t));
  const genericAppliance = /appliance|machine|device/i.test(t);
  return (topicHit || genericAppliance) && OPERATION_QUESTION.test(t);
}

function scoreDeviceMatch(question: string, entry: GuideDeviceEntry): number {
  const q = question.toLowerCase();
  let score = 0;
  const device = entry.device.toLowerCase();
  const brand = entry.brand.toLowerCase();
  const model = entry.model.toLowerCase();

  if (brand && q.includes(brand)) score += 4;
  if (model) {
    const modelToken = model.split(/\s+/)[0];
    if (model.length >= 4 && q.includes(model.toLowerCase())) score += 5;
    else if (modelToken.length >= 4 && q.includes(modelToken)) score += 3;
  }
  if (device && q.includes(device)) score += 3;

  for (const { topic, deviceHint } of APPLIANCE_TOPIC_PATTERNS) {
    if (topic.test(q) && deviceHint.test(device)) score += 5;
  }

  return score;
}

/** Best matching device from inventory for the guest's question. */
export function matchDeviceForGuestQuestion(
  question: string,
  guide: Record<string, unknown> | null | undefined
): GuideDeviceEntry | null {
  const inventory = extractDeviceInventoryFromGuide(guide);
  if (inventory.length === 0) return null;

  let best: GuideDeviceEntry | null = null;
  let bestScore = 0;
  for (const entry of inventory) {
    const score = scoreDeviceMatch(question, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (bestScore >= 3) return best;

  if (isApplianceOperationQuestion(question)) {
    for (const { topic, deviceHint } of APPLIANCE_TOPIC_PATTERNS) {
      if (!topic.test(question)) continue;
      const hit = inventory.find((e) => deviceHint.test(e.device) && (e.brand || e.model));
      if (hit) return hit;
    }
  }

  return null;
}

/** Host free-text notes for a matched device (e.g. washingMachine field). */
export function hostNotesForDevice(
  guide: Record<string, unknown> | null | undefined,
  entry: GuideDeviceEntry
): string {
  if (!guide) return '';
  const parts: string[] = [];
  const device = entry.device.toLowerCase();

  const pick = (fieldId: string) => {
    const text = str(guide[fieldId]);
    if (text) parts.push(text);
  };

  if (/wash|laundry/i.test(device)) pick('washingMachine');
  if (/dryer|tumble/i.test(device)) pick('dryerIron');
  if (/air|ac|heat/i.test(device)) {
    pick('acInstructions');
    pick('heatingInstructions');
  }
  if (/tv|television/i.test(device)) {
    pick('tvStreaming');
    pick('entertainmentModels');
  }
  if (/oven|microwave|kitchen/i.test(device)) {
    pick('kitchenEquipment');
    pick('applianceInstructions');
  }

  if (entry.room) parts.unshift(`Location: ${entry.room}`);
  return parts.join('\n').slice(0, 2000);
}
