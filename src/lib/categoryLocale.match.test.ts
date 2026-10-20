import { describe, expect, it } from 'vitest';
import {
  normalizeCategoryMatchKey,
  normalizeCategorySelectionList,
  resolveCategoryTagToPrimary,
} from './categoryLocale';

const heraklionCatalog = [
  { name: 'Diving', nameByLocale: { en: 'Diving' } },
  { name: 'Hiking & Trails', nameByLocale: { en: 'Hiking & Trails' } },
  { name: 'Boat Tours', nameByLocale: { en: 'Boat Tours' } },
  { name: 'Dining', nameByLocale: { en: 'Dining' } },
  { name: 'Fresh Fish', nameByLocale: { en: 'Fresh Fish' } },
  { name: 'Water Sports', nameByLocale: { en: 'Water Sports' } },
  { name: 'Horse Riding', nameByLocale: { en: 'Horse Riding' } },
  { name: 'Beach', nameByLocale: { en: 'Beach' } },
  { name: 'Culture', nameByLocale: { en: 'Culture' } },
  { name: 'Beach bar', nameByLocale: { en: 'Beach bar' } },
  { name: 'Winery', nameByLocale: { en: 'Winery' } },
  { name: 'Cafe', nameByLocale: { en: 'Cafe' } },
  { name: 'Street Food', nameByLocale: { en: 'Street Food' } },
  { name: 'Nightlife', nameByLocale: { en: 'Nightlife' } },
  { name: 'Breakfast / Brunch', nameByLocale: { en: 'Breakfast / Brunch' } },
  { name: 'Jeep Safari', nameByLocale: { en: 'Jeep Safari' } },
  { name: 'Traditional', nameByLocale: { en: 'Traditional' } },
];

describe('category import tag matching', () => {
  it('normalizes spaces and punctuation', () => {
    expect(normalizeCategoryMatchKey('Street Food')).toBe('streetfood');
    expect(normalizeCategoryMatchKey('Breakfast / Brunch')).toBe('breakfastbrunch');
  });

  it('maps common JSON tags to Heraklion catalog names', () => {
    const cases: Array<[string, string]> = [
      ['coffee', 'Cafe'],
      ['Coffee', 'Cafe'],
      ['breakfast', 'Breakfast / Brunch'],
      ['vinery', 'Winery'],
      ['streetfood', 'Street Food'],
      ['Street Food', 'Street Food'],
      ['beachbar', 'Beach bar'],
      ['freshfish', 'Fresh Fish'],
      ['horseriding', 'Horse Riding'],
      ['jeepsafari', 'Jeep Safari'],
      ['watersport', 'Water Sports'],
      ['boattrip', 'Boat Tours'],
      ['dining', 'Dining'],
      ['nightlife', 'Nightlife'],
      ['traditional', 'Traditional'],
      ['culture', 'Culture'],
      ['beach', 'Beach'],
    ];

    for (const [tag, expected] of cases) {
      expect(resolveCategoryTagToPrimary(tag, heraklionCatalog, 'en')).toBe(expected);
    }
  });

  it('normalizes a mixed selection list and drops unknown tags when catalog exists', () => {
    expect(
      normalizeCategorySelectionList(
        ['coffee', 'vinery', 'dessert', 'Breakfast'],
        heraklionCatalog,
        'en'
      )
    ).toEqual(['Cafe', 'Winery', 'Breakfast / Brunch']);
  });
});
