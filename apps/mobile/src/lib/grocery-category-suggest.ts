/** Conservative, offline suggestion: no writes and no AI/network calls. */
export function suggestGroceryCategory(
  productName: string,
  categories: ReadonlyArray<{ id: string | number; name: string }>,
): { categoryId: string; categoryName: string } | null {
  const normalized = productName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return null;
  const tokens = new Set(normalized.split(/\s+/));
  const groups: ReadonlyArray<{ words: string[]; categoryNames: string[] }> = [
    { words: ['egg', 'eggs'], categoryNames: ['Eggs'] },
    { words: ['milk'], categoryNames: ['Milk', 'Dairy'] },
    { words: ['yogurt', 'yoghurt', 'cheese', 'butter', 'cream', 'creamer'], categoryNames: ['Dairy'] },
    { words: ['bread', 'bagel', 'bagels'], categoryNames: ['Bread', 'Bakery'] },
    { words: ['banana', 'bananas'], categoryNames: ['Bananas', 'Produce'] },
    { words: ['apple', 'apples'], categoryNames: ['Apples', 'Produce'] },
    { words: ['avocado', 'avocados'], categoryNames: ['Avocados', 'Produce'] },
    { words: ['blueberry', 'blueberries'], categoryNames: ['Blueberries', 'Produce'] },
    { words: ['bacon'], categoryNames: ['Bacon', 'Meat'] },
    { words: ['spinach'], categoryNames: ['Spinach', 'Vegetables', 'Produce'] },
    { words: ['carrot', 'carrots'], categoryNames: ['Carrots', 'Vegetables', 'Produce'] },
  ];
  const matches = groups.filter(g => g.words.some(word => tokens.has(word)));
  // Ambiguous product descriptions must be classified manually.
  if (matches.length !== 1) return null;
  for (const wanted of matches[0].categoryNames) {
    const found = categories.find(cat => cat.name.trim().toLowerCase() === wanted.toLowerCase());
    if (found) return { categoryId: String(found.id), categoryName: found.name };
  }
  return null;
}
