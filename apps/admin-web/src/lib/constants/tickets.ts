export const FOLIO_RULES = {
  // tu SQL genera G####I#### automáticamente
  PREFIX_G: 'G',
  PREFIX_I: 'I',
  G_DIGITS: 4,
  I_DIGITS: 4,
} as const;

export const TICKET_RULES = {
  DEFAULT_COPIES: 3,
  MIN_COPIES: 2,
  MAX_COPIES: 10, // razonable
  MAX_LINE_WIDTH_58MM: 32, // aproximado ESC/POS 58mm
} as const;
