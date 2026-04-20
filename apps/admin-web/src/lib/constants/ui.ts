import { PROGRESS_THRESHOLDS } from './deliveries';

export const UI = {
  dateLocale: 'es-MX',
  currency: 'MXN',
  currencyLocale: 'es-MX',
} as const;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat(UI.currencyLocale, {
    style: 'currency',
    currency: UI.currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return new Intl.DateTimeFormat(UI.dateLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export type TrafficLight = 'red' | 'yellow' | 'green';

export function progressToTrafficLight(progressPercent: number): TrafficLight {
  const p = Number.isFinite(progressPercent) ? progressPercent : 0;
  if (p <= PROGRESS_THRESHOLDS.RED_MAX) return 'red';
  if (p <= PROGRESS_THRESHOLDS.YELLOW_MAX) return 'yellow';
  return 'green';
}
