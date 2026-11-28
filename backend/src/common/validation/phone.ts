/** "98765 43210" / "098765-43210" / "+91 98765 43210" → "+919876543210". */
export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const local = digits.replace(/^0/, '');
  if (/^[6-9]\d{9}$/.test(local)) return `+91${local}`;
  return null;
}
