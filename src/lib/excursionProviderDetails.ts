/** Shared provider content for excursions — about text, useful info, fleet. Admin-only for now. */

export type ExcursionProviderFleetSpec = {
  label: string;
  value: string;
};

export type ExcursionProviderFleetEntry = {
  name: string;
  model?: string;
  yearBuilt?: string;
  description?: string;
  photoUrls?: string[];
  specifications?: ExcursionProviderFleetSpec[];
};

export type ExcursionProviderFleetSpecFormRow = ExcursionProviderFleetSpec & {
  localId: string;
};

export type ExcursionProviderFleetFormRow = {
  localId: string;
  name: string;
  model: string;
  yearBuilt: string;
  description: string;
  photoUrls: string[];
  specifications: ExcursionProviderFleetSpecFormRow[];
};

export type ExcursionProviderDetailsFormData = {
  about: string;
  usefulInfo: string;
  fleet: ExcursionProviderFleetFormRow[];
};

export const EMPTY_EXCURSION_PROVIDER_DETAILS_FORM: ExcursionProviderDetailsFormData = {
  about: '',
  usefulInfo: '',
  fleet: [],
};

let fleetRowCounter = 0;
let specRowCounter = 0;

export function createFleetSpecRow(
  partial?: Partial<Omit<ExcursionProviderFleetSpecFormRow, 'localId'>>
): ExcursionProviderFleetSpecFormRow {
  specRowCounter += 1;
  return {
    localId: `spec-${specRowCounter}-${Date.now()}`,
    label: partial?.label ?? '',
    value: partial?.value ?? '',
  };
}

export function createFleetRow(
  partial?: Partial<Omit<ExcursionProviderFleetFormRow, 'localId'>>
): ExcursionProviderFleetFormRow {
  fleetRowCounter += 1;
  return {
    localId: `fleet-${fleetRowCounter}-${Date.now()}`,
    name: partial?.name ?? '',
    model: partial?.model ?? '',
    yearBuilt: partial?.yearBuilt ?? '',
    description: partial?.description ?? '',
    photoUrls: partial?.photoUrls ?? [],
    specifications: partial?.specifications ?? [],
  };
}

function parseFleetSpec(value: unknown): ExcursionProviderFleetSpec | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const label = String(row.label || '').trim();
  const specValue = String(row.value || '').trim();
  if (!label && !specValue) return null;
  return { label, value: specValue };
}

function parseFleetEntry(value: unknown): ExcursionProviderFleetEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const name = String(row.name || '').trim();
  if (!name) return null;

  const specifications = Array.isArray(row.specifications)
    ? row.specifications
        .map(parseFleetSpec)
        .filter((spec): spec is ExcursionProviderFleetSpec => spec != null)
    : undefined;

  const photoUrls = Array.isArray(row.photoUrls)
    ? row.photoUrls.map(String).map((url) => url.trim()).filter(Boolean)
    : undefined;

  return {
    name,
    model: String(row.model || '').trim() || undefined,
    yearBuilt: String(row.yearBuilt || '').trim() || undefined,
    description: String(row.description || '').trim() || undefined,
    photoUrls: photoUrls && photoUrls.length > 0 ? photoUrls : undefined,
    specifications: specifications && specifications.length > 0 ? specifications : undefined,
  };
}

export function fleetFormFromDoc(data: Record<string, unknown>): ExcursionProviderFleetFormRow[] {
  if (!Array.isArray(data.excursionFleet)) return [];

  return data.excursionFleet
    .map((entry) => {
      const parsed = parseFleetEntry(entry);
      if (!parsed) return null;
      return createFleetRow({
        name: parsed.name,
        model: parsed.model ?? '',
        yearBuilt: parsed.yearBuilt ?? '',
        description: parsed.description ?? '',
        photoUrls: parsed.photoUrls ?? [],
        specifications: (parsed.specifications ?? []).map((spec) => createFleetSpecRow(spec)),
      });
    })
    .filter((row): row is ExcursionProviderFleetFormRow => row != null);
}

export function excursionProviderDetailsFormFromDoc(
  data: Record<string, unknown>
): ExcursionProviderDetailsFormData {
  return {
    about: String(data.excursionAbout || ''),
    usefulInfo: String(data.excursionUsefulInfo || ''),
    fleet: fleetFormFromDoc(data),
  };
}

export function fleetPayloadFromForm(
  rows: ExcursionProviderFleetFormRow[]
): ExcursionProviderFleetEntry[] {
  return rows
    .map((row) => {
      const name = row.name.trim();
      if (!name) return null;

      const specifications = row.specifications
        .map((spec) => {
          const label = spec.label.trim();
          const value = spec.value.trim();
          if (!label && !value) return null;
          return { label, value };
        })
        .filter((spec): spec is ExcursionProviderFleetSpec => spec != null);

      const entry: ExcursionProviderFleetEntry = { name };
      const model = row.model.trim();
      const yearBuilt = row.yearBuilt.trim();
      const description = row.description.trim();

      if (model) entry.model = model;
      if (yearBuilt) entry.yearBuilt = yearBuilt;
      if (description) entry.description = description;
      if (row.photoUrls.length > 0) entry.photoUrls = row.photoUrls;
      if (specifications.length > 0) entry.specifications = specifications;

      return entry;
    })
    .filter((entry): entry is ExcursionProviderFleetEntry => entry != null);
}

export function excursionProviderDetailsPayloadFromForm(
  form: ExcursionProviderDetailsFormData
): Record<string, unknown> {
  const about = form.about.trim();
  const usefulInfo = form.usefulInfo.trim();
  const fleet = fleetPayloadFromForm(form.fleet);

  return {
    excursionAbout: about || null,
    excursionUsefulInfo: usefulInfo || null,
    excursionFleet: fleet.length > 0 ? fleet : null,
  };
}

export function excursionFleetFromDoc(data: Record<string, unknown>): ExcursionProviderFleetEntry[] {
  if (!Array.isArray(data.excursionFleet)) return [];

  return data.excursionFleet
    .map(parseFleetEntry)
    .filter((entry): entry is ExcursionProviderFleetEntry => entry != null);
}

export type GuestProviderDetails = {
  about?: string;
  usefulInfo?: string;
  fleet?: ExcursionProviderFleetEntry[];
};

export function guestProviderDetailsFromDoc(data: Record<string, unknown>): GuestProviderDetails {
  const about = String(data.excursionAbout || '').trim();
  const usefulInfo = String(data.excursionUsefulInfo || '').trim();
  const fleet = excursionFleetFromDoc(data);

  return {
    about: about || undefined,
    usefulInfo: usefulInfo || undefined,
    fleet: fleet.length > 0 ? fleet : undefined,
  };
}

export function adminProviderDetailsPath(providerId: string): string {
  return `/excursions/providers/${providerId}/details`;
}

export function portalProviderDetailsPath(providerId: string): string {
  return `/excursion-portal/${providerId}/details`;
}
