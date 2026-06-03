import { httpsCallableMessage } from './callableError';
import { getGuestApplianceGuideCallable } from './guestPortalCallables';
import type { GuideDeviceEntry } from './houseGuideAssistantContext';

export type GuestApplianceGuideRequest = {
  propertyId: string;
  typeId: string;
  sessionId: string;
  question: string;
  locale: string;
  brand?: string;
  model?: string;
  device?: string;
  room?: string;
  hostNotes?: string;
};

export type GuestApplianceGuideResponse = {
  guideText: string;
  model?: string;
};

export async function fetchGuestApplianceGuide(
  req: GuestApplianceGuideRequest
): Promise<GuestApplianceGuideResponse | null> {
  try {
    const res = await getGuestApplianceGuideCallable(req);
    const guideText = (res.guideText || '').trim();
    if (!guideText) return null;
    return { guideText, model: res.model };
  } catch (err) {
    console.warn('getGuestApplianceGuide failed:', httpsCallableMessage(err, ''));
    return null;
  }
}

export function buildApplianceReferenceUserBlock(
  question: string,
  device: GuideDeviceEntry,
  guideText: string
): string {
  const label = [device.brand, device.model].filter(Boolean).join(' ') || device.device;
  return `${question}

[MODEL OPERATION REFERENCE — ${label}]
The following steps are grounded in the manufacturer's manual for this model (via web search). Use them as the technical basis for your reply. Present them naturally to the guest in their language. Do NOT say you lack the manual or only know "general" steps.

${guideText}`;
}
