export function getDisplayName(tipo: string, kg: number) {
  const tipoNormalizado = String(tipo ?? '').trim().toUpperCase();

  if (tipoNormalizado === 'BARRA') return 'BARRA';
  return `${tipoNormalizado} ${kg} KG`;
}