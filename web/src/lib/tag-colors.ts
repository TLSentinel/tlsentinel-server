// Deterministic color assignment for tag categories.
// The category ID (UUID) is hashed to a stable index into the palette,
// so the same category always gets the same color regardless of name.

const PALETTE = [
  'bg-blue-600/80 text-white',
  'bg-violet-600/80 text-white',
  'bg-emerald-600/80 text-white',
  'bg-orange-600/80 text-white',
  'bg-pink-600/80 text-white',
  'bg-teal-600/80 text-white',
  'bg-amber-600/80 text-white',
  'bg-indigo-600/80 text-white',
  'bg-cyan-600/80 text-white',
  'bg-rose-600/80 text-white',
]

export function categoryColor(categoryId: string): string {
  if (!categoryId) return PALETTE[0]; // Fallback for empty IDs

  const hash = categoryId.split('').reduce((acc, c) => {
    return ((acc << 5) - acc) + c.charCodeAt(0);
  }, 0);

  // Math.abs ensures we don't get a negative index
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
