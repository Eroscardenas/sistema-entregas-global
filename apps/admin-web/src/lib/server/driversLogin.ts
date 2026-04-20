export function normalizePhoneToLoginEmail(phone: string) {
  // deja solo + y dígitos (ej: +52 33-1234 -> +52331234)
  const cleaned = (phone || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  return `${cleaned}@drivers.local`;
}