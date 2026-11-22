import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { httpsCallableMessage } from './callableError';

export type PartnerImportServiceHit = {
  url: string;
  title: string;
  summary?: string;
};

export type PartnerImportDraft = {
  name: string;
  description: string;
  phoneNumber: string;
  whatsapp: string;
  email: string;
  website: string;
  photoUrl: string;
  categories: string[];
  sourceUrl?: string;
};

export type PartnerImportDiscoverResult = {
  mode: 'discover';
  indexUrl: string;
  services: PartnerImportServiceHit[];
};

export type PartnerImportExtractResult = {
  mode: 'extract';
  partners: PartnerImportDraft[];
  failures: { url: string; note: string }[];
};

const importPartnersFromWebCallable = httpsCallable(cloudFunctions, 'importPartnersFromWeb', {
  timeout: 180000,
});

export async function discoverPartnerServicesFromPage(input: {
  pageUrl: string;
  areaName: string;
  country?: string;
}): Promise<PartnerImportDiscoverResult> {
  try {
    const result = await importPartnersFromWebCallable({
      mode: 'discover',
      pageUrl: input.pageUrl,
      areaName: input.areaName,
      country: input.country || '',
    });
    return result.data as PartnerImportDiscoverResult;
  } catch (err) {
    throw new Error(httpsCallableMessage(err, 'Could not scan that services page.'));
  }
}

export async function extractPartnersFromPages(input: {
  urls: string[];
  areaName: string;
  country?: string;
  categories: string[];
}): Promise<PartnerImportExtractResult> {
  try {
    const result = await importPartnersFromWebCallable({
      mode: 'extract',
      urls: input.urls,
      areaName: input.areaName,
      country: input.country || '',
      categories: input.categories,
    });
    return result.data as PartnerImportExtractResult;
  } catch (err) {
    throw new Error(httpsCallableMessage(err, 'Could not import partners from those pages.'));
  }
}

/** Chunk URLs for extract calls (server max 6 per request). */
export function chunkUrls<T>(items: T[], size = 6): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
