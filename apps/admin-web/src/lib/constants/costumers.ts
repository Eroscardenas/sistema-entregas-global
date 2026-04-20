export const EQUIPMENT_CAPACITY = ['20', '40', '50', '60', '100', '150', 'N/A'] as const;
export type EquipmentCapacity = (typeof EQUIPMENT_CAPACITY)[number];

export const EQUIPMENT_CAPACITY_LABEL: Record<EquipmentCapacity, string> = {
  '20': '20',
  '40': '40',
  '50': '50',
  '60': '60',
  '100': '100',
  '150': '150',
  'N/A': 'N/A',
};

export const CUSTOMER_RULES = {
  NAME_MIN: 30,
  NAME_MAX: 80,
  PHONE_MIN: 8,
  PHONE_MAX: 20,
  MAPS_URL_MAX: 500,
} as const;
