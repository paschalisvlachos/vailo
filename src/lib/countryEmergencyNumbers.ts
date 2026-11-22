/** National emergency numbers shown during Add Property setup. */

export type CountryEmergencyNumber = {
  id: string;
  label: string;
  number: string;
  note?: string;
};

const EU_COMMON: CountryEmergencyNumber[] = [
  { id: 'eu-112', label: 'European emergency (112)', number: '112', note: 'Police, fire & ambulance' },
];

const BY_COUNTRY: Record<string, CountryEmergencyNumber[]> = {
  greece: [
    ...EU_COMMON,
    { id: 'gr-police', label: 'Police', number: '100' },
    { id: 'gr-fire', label: 'Fire department', number: '199' },
    { id: 'gr-ambulance', label: 'Ambulance', number: '166' },
    { id: 'gr-coast', label: 'Coast guard', number: '108' },
    { id: 'gr-tourist-police', label: 'Tourist police', number: '171' },
    { id: 'gr-poison', label: 'Poison centre', number: '210 779 3777' },
  ],
  'ελλάδα': [
    ...EU_COMMON,
    { id: 'gr-police', label: 'Police', number: '100' },
    { id: 'gr-fire', label: 'Fire department', number: '199' },
    { id: 'gr-ambulance', label: 'Ambulance', number: '166' },
    { id: 'gr-coast', label: 'Coast guard', number: '108' },
    { id: 'gr-tourist-police', label: 'Tourist police', number: '171' },
    { id: 'gr-poison', label: 'Poison centre', number: '210 779 3777' },
  ],
  cyprus: [
    ...EU_COMMON,
    { id: 'cy-police', label: 'Police', number: '112' },
    { id: 'cy-fire', label: 'Fire department', number: '112' },
    { id: 'cy-ambulance', label: 'Ambulance', number: '112' },
    { id: 'cy-forest', label: 'Forest fire', number: '1407' },
  ],
  italy: [
    ...EU_COMMON,
    { id: 'it-police', label: 'Police (Carabinieri)', number: '112' },
    { id: 'it-fire', label: 'Fire department', number: '115' },
    { id: 'it-ambulance', label: 'Ambulance', number: '118' },
  ],
  spain: [
    ...EU_COMMON,
    { id: 'es-police', label: 'National police', number: '091' },
    { id: 'es-local-police', label: 'Local police', number: '092' },
    { id: 'es-fire', label: 'Fire department', number: '080' },
    { id: 'es-ambulance', label: 'Ambulance', number: '061' },
  ],
  portugal: [
    ...EU_COMMON,
    { id: 'pt-emergency', label: 'National emergency', number: '112' },
    { id: 'pt-forest', label: 'Forest fire', number: '117' },
  ],
  france: [
    ...EU_COMMON,
    { id: 'fr-police', label: 'Police', number: '17' },
    { id: 'fr-fire', label: 'Fire department', number: '18' },
    { id: 'fr-ambulance', label: 'Ambulance (SAMU)', number: '15' },
  ],
  'united kingdom': [
    { id: 'uk-999', label: 'Emergency services', number: '999', note: 'Police, fire & ambulance' },
    { id: 'uk-112', label: 'European emergency (112)', number: '112' },
    { id: 'uk-101', label: 'Police non-emergency', number: '101' },
    { id: 'uk-111', label: 'NHS non-emergency', number: '111' },
  ],
  uk: [
    { id: 'uk-999', label: 'Emergency services', number: '999', note: 'Police, fire & ambulance' },
    { id: 'uk-112', label: 'European emergency (112)', number: '112' },
    { id: 'uk-101', label: 'Police non-emergency', number: '101' },
    { id: 'uk-111', label: 'NHS non-emergency', number: '111' },
  ],
  germany: [
    ...EU_COMMON,
    { id: 'de-police', label: 'Police', number: '110' },
    { id: 'de-fire', label: 'Fire / ambulance', number: '112' },
  ],
  netherlands: [...EU_COMMON],
  belgium: [...EU_COMMON],
  croatia: [...EU_COMMON],
  malta: [...EU_COMMON],
};

function normalizeCountryKey(country: string) {
  return country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Resolve emergency numbers for a listing country (falls back to EU 112). */
export function getCountryEmergencyNumbers(country: string): CountryEmergencyNumber[] {
  const key = normalizeCountryKey(country);
  if (!key) return [...EU_COMMON];
  if (BY_COUNTRY[key]) return BY_COUNTRY[key];
  // Partial match (e.g. "Greece / Hellas")
  for (const [name, numbers] of Object.entries(BY_COUNTRY)) {
    if (key.includes(name) || name.includes(key)) return numbers;
  }
  return [...EU_COMMON];
}
