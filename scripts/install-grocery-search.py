#!/usr/bin/env python3
"""Add search to the Grocery dashboard selectors + product/category manager.
Guarded, idempotent mobile-only installer. All backups outside Expo source.
"""
from pathlib import Path
from datetime import datetime
import sys

root = Path(__file__).resolve().parents[1]
file = root / 'apps/mobile/src/app/(tabs)/grocery.tsx'
if not file.is_file():
    sys.exit('ABORT: Grocery screen not found. No files changed.')
source = file.read_text()
tag = 'GROCERY_SEARCH_V1'
if tag in source:
    print('PASS: Grocery search is already installed. No changes made.')
    sys.exit(0)

edits = [
('selector state',
 '  const [open, setOpen] = useState(false);\n  const chosen = options.find(o => o.value === value)?.label ?? emptyLabel;',
 '''  // GROCERY_SEARCH_V1: search only local, already authorized options.
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const chosen = options.find(o => o.value === value)?.label ?? emptyLabel;
  const visibleOptions = options.filter(o => o.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));'''),
('selector open',
 'onPress={() => setOpen(true)} style={{ ...SELECT_STYLE',
 "onPress={() => { setSearch(''); setOpen(true); }} style={{ ...SELECT_STYLE"),
('selector input',
 '          <Text style={{ ...cardTitle, fontSize: 18 }}>{title}</Text>\n          <ScrollView keyboardShouldPersistTaps="handled">\n            {options.map(o =>',
 '''          <Text style={{ ...cardTitle, fontSize: 18 }}>{title}</Text>
          <TextInput
            accessibilityLabel={`Search ${title.toLowerCase()}`}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`Search ${title.toLowerCase()}...`}
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            style={{ ...SELECT_STYLE, color: DARK, fontSize: 15 }}
          />
          <Text style={SMALL}>{visibleOptions.length} matching option{visibleOptions.length === 1 ? '' : 's'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {visibleOptions.length === 0 ? <Muted>No matching options. Try another search.</Muted> : null}
            {visibleOptions.map(o =>'''),
('manager state',
 "  const [manageProductName, setManageProductName] = useState('');",
 "  const [manageProductName, setManageProductName] = useState('');\n  const [manageProductSearch, setManageProductSearch] = useState('');\n  const [manageCategorySearch, setManageCategorySearch] = useState('');"),
('manager open',
 "onPress={() => { setManageNotice(''); setManageOpen(true); }}",
 "onPress={() => { setManageNotice(''); setManageProductSearch(''); setManageCategorySearch(''); setManageOpen(true); }}"),
('manager product search',
 "              <Label>Choose a product</Label>\n              {products.length ? products.map(p =>",
 '''              <Label>Choose a product</Label>
              <TextInput
                accessibilityLabel="Search products to manage"
                value={manageProductSearch}
                onChangeText={setManageProductSearch}
                placeholder="Search products by name..."
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ ...SELECT_STYLE, color: DARK }}
              />
              {products.length && !products.some(p => (p.canonicalName ?? p.canonical_name ?? `Product #${p.id}`).toLocaleLowerCase().includes(manageProductSearch.trim().toLocaleLowerCase())) ? <Muted>No products match your search.</Muted> : null}
              {products.length ? products.filter(p => (p.canonicalName ?? p.canonical_name ?? `Product #${p.id}`).toLocaleLowerCase().includes(manageProductSearch.trim().toLocaleLowerCase())).map(p =>'''),
('manager category search',
 '''                <Label>Assign category</Label>
                <Pressable onPress={() => setManageCategory('')}''',
 '''                <Label>Assign category</Label>
                <TextInput
                  accessibilityLabel="Search categories to assign"
                  value={manageCategorySearch}
                  onChangeText={setManageCategorySearch}
                  placeholder="Search categories by name..."
                  placeholderTextColor={MUTED}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ ...SELECT_STYLE, color: DARK }}
                />
                <Pressable onPress={() => setManageCategory('')}'''),
('manager category list',
 '''                {categories.map(c => <Pressable key={String(c.id)} onPress={() => setManageCategory(String(c.id))}''',
 '''                {categories.length && !categories.some(c => c.name.toLocaleLowerCase().includes(manageCategorySearch.trim().toLocaleLowerCase())) ? <Muted>No categories match your search.</Muted> : null}
                {categories.filter(c => c.name.toLocaleLowerCase().includes(manageCategorySearch.trim().toLocaleLowerCase())).map(c => <Pressable key={String(c.id)} onPress={() => setManageCategory(String(c.id))}'''),
]

updated = source
for title, before, after in edits:
    count = updated.count(before)
    if count != 1:
        sys.exit(f'ABORT: Expected exactly one {title} anchor, found {count}. No files changed.')
    updated = updated.replace(before, after, 1)

backup = root / 'scripts/backups/grocery-search' / ('grocery-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.tsx.bak')
backup.parent.mkdir(parents=True, exist_ok=True)
backup.write_text(source)
file.write_text(updated)
print('PASS: Grocery category and product selection are now searchable.')
print('PASS: Product/category manager lists are searchable.')
print('PASS: No API, database, or purchase data changes.')
print('Backup:', backup)
