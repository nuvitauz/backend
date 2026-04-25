/**
 * Sayt, API va Telegram kontaktlari uchun yagona format: +998XXXXXXXXX
 */
export function normalizeUzbekPhone(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) return `+${d}`;
  if (d.length === 9) return `+998${d}`;
  return null;
}
