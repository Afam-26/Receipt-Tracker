import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestGroceryCategory } from '../apps/mobile/src/lib/grocery-category-suggest.js';
const categories = [{ id: '1', name: 'Eggs' }, { id: '2', name: 'Milk' }, { id: '3', name: 'Bread' }];
test('matches whole-word names to owned categories', () => {
  assert.deepEqual(suggestGroceryCategory('Grade A Large Eggs 12 ct', categories), { categoryId: '1', categoryName: 'Eggs' });
  assert.deepEqual(suggestGroceryCategory('Organic Whole Milk', categories), { categoryId: '2', categoryName: 'Milk' });
});
test('does not infer from substrings, missing categories, or ambiguous names', () => {
  assert.equal(suggestGroceryCategory('Breaded shrimp', categories), null);
  assert.equal(suggestGroceryCategory('Milk and Eggs', categories), null);
  assert.equal(suggestGroceryCategory('Cheddar Cheese', categories), null);
});
