// Deterministic color assignment for tag categories.
// The category ID (UUID) is hashed to a stable index into the palette,
// so the same category always gets the same color regardless of name.

const PALETTE = [
  'border-blue-300 bg-blue-50 text-blue-700',
  'border-violet-300 bg-violet-50 text-violet-700',
  'border-emerald-300 bg-emerald-50 text-emerald-700',
  'border-orange-300 bg-orange-50 text-orange-700',
  'border-pink-300 bg-pink-50 text-pink-700',
  'border-teal-300 bg-teal-50 text-teal-700',
  'border-amber-300 bg-amber-50 text-amber-700',
  'border-indigo-300 bg-indigo-50 text-indigo-700',
  'border-cyan-300 bg-cyan-50 text-cyan-700',
  'border-rose-300 bg-rose-50 text-rose-700',
]

export function categoryColor(categoryId: string): string {
  if (!categoryId) return PALETTE[0]; // Fallback for empty IDs

  const hash = categoryId.split('').reduce((acc, c) => {
    return ((acc << 5) - acc) + c.charCodeAt(0);
  }, 0);

  // Math.abs ensures we don't get a negative index
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
