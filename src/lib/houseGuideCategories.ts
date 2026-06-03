/**
 * Canonical House Guide category + field definitions (admin + guest).
 * Add categories here — they appear in admin House Guide and the guest portal menu sheet.
 */

export type HouseGuideFieldType =
  | 'textarea'
  | 'array_devices'
  | 'array_maps'
  | 'array_emergencies'
  | 'array_faqs';

export type HouseGuideFieldDef = {
  id: string;
  label: string;
  type: HouseGuideFieldType;
  placeholder?: string;
  options?: string[];
};

export type HouseGuideCategoryDef = {
  id: string;
  /** Admin list title (may include numbering). */
  title: string;
  iconName: string;
  description: string;
  fields: HouseGuideFieldDef[];
};

export const HOUSE_GUIDE_WASTE_OPTIONS = [
  'General Garbage Bin',
  'Recycling Bin (Blue)',
  'Glass Recycling (Bell)',
  'Compost',
  'Other',
];

export const HOUSE_GUIDE_USEFUL_MAP_OPTIONS = [
  'Nearest Supermarket',
  'Mini Market / Kiosk',
  'Bakery',
  'Pharmacy',
  'Gas Station',
  'ATM',
  'Butcher',
  'Other',
];

export const HOUSE_GUIDE_EMERGENCY_OPTIONS = [
  'Pharmacy',
  'Hospital/Clinic',
  'Police',
  'Fire Dept',
  'Doctor',
  'Paediatrician',
  'Other',
];

export const HOUSE_GUIDE_CATEGORIES: HouseGuideCategoryDef[] = [
  {
    id: 'arrival',
    title: '1. Arrival & Check-in',
    iconName: 'Key',
    description: 'Check-in times, lockbox codes, parking, and directions.',
    fields: [
      {
        id: 'arrivalInfo',
        label: 'Arrival & Check-in Information',
        type: 'textarea',
        placeholder: 'Check-in is at 15:00. The lockbox is...',
      },
    ],
  },
  {
    id: 'checkout',
    title: '2. Check-out Instructions',
    iconName: 'ArrowRight',
    description: 'Check-out times, key return, and departure duties.',
    fields: [
      {
        id: 'checkoutInfo',
        label: 'Check-out & Departure Information',
        type: 'textarea',
        placeholder: 'Check-out is at 11:00. Please leave keys...',
      },
    ],
  },
  {
    id: 'power',
    title: '3. Electricity & Power',
    iconName: 'Zap',
    description: 'Panels, outages, and emergency lighting.',
    fields: [
      { id: 'electricalPanel', label: 'Electrical Panel', type: 'textarea' },
      { id: 'powerOutage', label: 'Power Outage', type: 'textarea' },
      { id: 'garageManual', label: 'Garage Door During Outage', type: 'textarea' },
      { id: 'emergencyLighting', label: 'Emergency Lighting', type: 'textarea' },
    ],
  },
  {
    id: 'lighting',
    title: '4. Lighting',
    iconName: 'Lightbulb',
    description: 'Indoor and outdoor lighting instructions.',
    fields: [
      { id: 'indoorLights', label: 'Indoor Lights', type: 'textarea' },
      { id: 'outdoorLights', label: 'Outdoor / Garden Lights', type: 'textarea' },
    ],
  },
  {
    id: 'hvac',
    title: '5. A/C & Heating',
    iconName: 'Thermometer',
    description: 'Climate control instructions.',
    fields: [
      { id: 'acInstructions', label: 'Air Conditioning', type: 'textarea' },
      { id: 'heatingInstructions', label: 'Heating', type: 'textarea' },
    ],
  },
  {
    id: 'bathrooms',
    title: '6. Hot Water & Bathrooms',
    iconName: 'Droplets',
    description: 'Boilers, amenities, and usage rules.',
    fields: [
      { id: 'hotWater', label: 'Hot Water', type: 'textarea' },
      { id: 'bathroomAmenities', label: 'Bathroom Amenities', type: 'textarea' },
      { id: 'toiletRules', label: 'Toilet Instructions', type: 'textarea' },
    ],
  },
  {
    id: 'bedrooms',
    title: '7. Bedrooms & Linen',
    iconName: 'BedDouble',
    description: 'Sleeping arrangements and extra linens.',
    fields: [
      { id: 'bedroomDetails', label: 'Bedroom Information', type: 'textarea' },
      { id: 'extraLinen', label: 'Extra Pillows & Blankets', type: 'textarea' },
    ],
  },
  {
    id: 'kitchen',
    title: '8. Kitchen',
    iconName: 'ChefHat',
    description: 'Equipment, supplies, and appliances.',
    fields: [
      { id: 'kitchenEquipment', label: 'Kitchen Equipment', type: 'textarea' },
      { id: 'applianceInstructions', label: 'Appliance Instructions', type: 'textarea' },
      { id: 'applianceModels', label: 'Appliance Models', type: 'textarea' },
      { id: 'includedSupplies', label: 'Included Supplies', type: 'textarea' },
      { id: 'neededSupplies', label: 'Additional Supplies Needed', type: 'textarea' },
    ],
  },
  {
    id: 'bbq',
    title: '9. BBQ & Outdoor Area',
    iconName: 'Flame',
    description: 'BBQ type, fuel, and safety.',
    fields: [
      { id: 'bbqType', label: 'BBQ Type', type: 'textarea' },
      { id: 'bbqInstructions', label: 'BBQ Instructions', type: 'textarea' },
    ],
  },
  {
    id: 'pool',
    title: '10. Pool & Jacuzzi',
    iconName: 'Waves',
    description: 'Pool rules, heating, and jacuzzi controls.',
    fields: [
      { id: 'poolInfo', label: 'Pool Information', type: 'textarea' },
      { id: 'jacuzziInstructions', label: 'Jacuzzi Instructions', type: 'textarea' },
    ],
  },
  {
    id: 'entertainment',
    title: '11. Wi-Fi & Entertainment',
    iconName: 'Wifi',
    description: 'Internet, Smart TVs, and sound systems.',
    fields: [
      { id: 'wifiInfo', label: 'Wi-Fi Information', type: 'textarea' },
      { id: 'tvStreaming', label: 'TV & Streaming Services', type: 'textarea' },
      { id: 'entertainmentModels', label: 'Entertainment Device Models', type: 'textarea' },
    ],
  },
  {
    id: 'laundry',
    title: '12. Laundry',
    iconName: 'WashingMachine',
    description: 'Washing machines, dryers, and irons.',
    fields: [
      { id: 'washingMachine', label: 'Washing Machine', type: 'textarea' },
      { id: 'dryerIron', label: 'Dryer / Iron', type: 'textarea' },
    ],
  },
  {
    id: 'rules',
    title: '13. House Rules',
    iconName: 'ScrollText',
    description: 'General rules and quiet hours.',
    fields: [
      { id: 'houseRules', label: 'House Rules', type: 'textarea' },
      { id: 'quietHours', label: 'Quiet Hours', type: 'textarea' },
    ],
  },
  {
    id: 'waste',
    title: '14. Waste & Recycling',
    iconName: 'Trash2',
    description: 'Disposal rules and bin locations on the map.',
    fields: [
      { id: 'garbageDisposal', label: 'Garbage Disposal', type: 'textarea' },
      { id: 'recycling', label: 'Recycling', type: 'textarea' },
      {
        id: 'wasteLocations',
        label: 'Bin Map Locations',
        type: 'array_maps',
        options: HOUSE_GUIDE_WASTE_OPTIONS,
      },
    ],
  },
  {
    id: 'safety',
    title: '15. Safety & Emergency',
    iconName: 'ShieldAlert',
    description: 'Procedures, contacts, and safe box.',
    fields: [
      { id: 'emergencyInfo', label: 'Emergency Information', type: 'textarea' },
      { id: 'safeBox', label: 'Safe Box Instructions', type: 'textarea' },
      {
        id: 'emergencyContacts',
        label: 'Emergency Numbers & Map Pins',
        type: 'array_emergencies',
        options: HOUSE_GUIDE_EMERGENCY_OPTIONS,
      },
    ],
  },
  {
    id: 'cleaning',
    title: '16. Cleaning & Maintenance',
    iconName: 'Sparkles',
    description: 'Housekeeping and maintenance issues.',
    fields: [
      { id: 'cleaningService', label: 'Cleaning Service', type: 'textarea' },
      { id: 'maintenanceIssues', label: 'Maintenance Issues', type: 'textarea' },
    ],
  },
  {
    id: 'supplies',
    title: '17. Extra Supplies & Useful Items',
    iconName: 'Box',
    description: 'Batteries, mosquito gear, and local shops.',
    fields: [
      { id: 'extraBatteries', label: 'Extra Batteries', type: 'textarea' },
      { id: 'mosquitoEquipment', label: 'Mosquito Equipment', type: 'textarea' },
      { id: 'flashlights', label: 'Flashlights & Candles', type: 'textarea' },
      { id: 'remoteControls', label: 'Remote Controls', type: 'textarea' },
      { id: 'spareKeys', label: 'Spare Keys', type: 'textarea' },
      { id: 'generalItems', label: 'General Useful Items', type: 'textarea' },
      {
        id: 'usefulLocations',
        label: 'Useful Local Map Pins',
        type: 'array_maps',
        options: HOUSE_GUIDE_USEFUL_MAP_OPTIONS,
      },
    ],
  },
  {
    id: 'devices',
    title: '18. Property Devices & Equipment',
    iconName: 'Wrench',
    description: 'Detailed list of electrical and smart devices.',
    fields: [
      { id: 'electricalAppliances', label: 'Electrical Appliances', type: 'textarea' },
      { id: 'smartHomeDevices', label: 'Smart Home Devices', type: 'textarea' },
      { id: 'devicesList', label: 'Appliance Inventory', type: 'array_devices' },
    ],
  },
  {
    id: 'faq',
    title: '19. Frequently Asked Questions',
    iconName: 'MessageCircleQuestion',
    description: 'Common guest questions and answers.',
    fields: [{ id: 'faqsList', label: 'Common Guest Questions', type: 'array_faqs' }],
  },
  {
    id: 'dailyNeeds',
    title: '20. Daily Needs',
    iconName: 'ShoppingBag',
    description: 'Everyday essentials nearby — shops, pharmacy, ATM, and general tips.',
    fields: [
      {
        id: 'dailyNeedsInfo',
        label: 'Daily Needs — General Information',
        type: 'textarea',
        placeholder: 'Where to buy groceries, pharmacy hours, delivery tips…',
      },
      {
        id: 'dailyNeedsPlaces',
        label: 'Places (title & map link)',
        type: 'array_maps',
      },
    ],
  },
];

/** Guest-facing title without admin numbering prefix. */
export function houseGuideGuestCategoryTitle(title: string): string {
  return title.replace(/^\d+\.\s*/, '').trim() || title;
}

export function fieldsForHouseGuideCategoryId(categoryId: string): HouseGuideFieldDef[] {
  return HOUSE_GUIDE_CATEGORIES.find((c) => c.id === categoryId)?.fields ?? [];
}
