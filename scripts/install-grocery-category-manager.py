#!/usr/bin/env python3
"""Guarded Grocery catalog category-management extension for Receipt Tracker Phase 4C."""
from pathlib import Path
from datetime import datetime
import sys
root = Path(__file__).resolve().parents[1]
route = root/'services/api/src/grocery/routes.ts'
store = root/'services/api/src/grocery/store.ts'
mobile = root/'apps/mobile/src/app/(tabs)/grocery.tsx'
files = [route,store,mobile]
if any(not p.is_file() for p in files): sys.exit('ABORT: Missing project source files; no changes made.')
r,s,m=(p.read_text() for p in files)
tag='GROCERY_CATEGORY_MANAGER_V1'
if all(tag in content for content in (r,s,m)):
    print('PASS: Grocery category manager already installed; no changes made.');sys.exit(0)
if any(tag in content for content in (r,s,m)):
    sys.exit('ABORT: Partial installation detected. Inspect files before retrying.')
route_anchor="  app.post('/api/grocery/products', ...guards, wrap(req => grocery.createProduct(userId(req), parseProduct(req.body)), 201));"
store_iface_anchor='  createProduct(userId: string, value: Product): Promise<{ id: string }>;' 
store_impl_anchor='    async listVariants(userId, f) {'
mobile_import_anchor="import { useAuthedGet } from '../../lib/hooks';"
mobile_refresh_anchor='  const refresh = useCallback(async () => {'
mobile_panel_anchor='      <Text style={SMALL}>{products.length} catalog products loaded (first 100).</Text>'
mobile_end_panel='    </Panel>\n    {loading ?'
needed={route: [route_anchor],store:[store_iface_anchor,store_impl_anchor], mobile:[mobile_import_anchor,mobile_refresh_anchor,mobile_panel_anchor,mobile_end_panel]}
for file, markers in needed.items():
    for marker in markers:
        if marker not in (r if file==route else s if file==store else m):
            sys.exit('ABORT: Expected source marker absent in '+str(file.relative_to(root))+': '+marker[:90])
if "import { useAuth } from '@clerk/expo';" not in m and "import { useAuth," in m:
    sys.exit('ABORT: Unexpected Clerk import style; no changes made')
if "mobileConfig" in m and "validateApiBase" not in m: sys.exit('ABORT: Unexpected mobile API configuration import; no changes made')
# Backend: existing Clerk guards + owner-scoped update and category lookup.
r=r.replace(route_anchor, route_anchor+"\n  // "+tag+": update only an owned product using an owned category.\n  app.patch('/api/grocery/products/:productId/category', ...guards, wrap(req => {\n    const body = req.body;\n    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'categoryId')) {\n      throw new HttpError(400, 'INVALID_CATEGORY_ASSIGNMENT', 'Only categoryId may be changed');\n    }\n    return grocery.assignProductCategory(userId(req), id(req.params.productId, 'productId')!, id(body.categoryId, 'categoryId', false));\n  }));",1)
s=s.replace(store_iface_anchor,store_iface_anchor+'\n  // '+tag+'\n  assignProductCategory(userId: string, productId: string, categoryId: string | null): Promise<{ productId: string; categoryId: string | null }>;')
store_method='''    // GROCERY_CATEGORY_MANAGER_V1: verify both IDs under the same Clerk-owned local user.
    async assignProductCategory(userId, productId, categoryId) {
      const cx = await pool.getConnection();
      try {
        await cx.beginTransaction();
        const [products] = await cx.execute<Row[]>(
          'SELECT id FROM products WHERE user_id = ? AND id = ? FOR UPDATE', [userId, productId]);
        if (!products.length) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
        if (categoryId !== null) {
          const [categories] = await cx.execute<Row[]>(
            'SELECT id FROM categories WHERE user_id = ? AND id = ? LIMIT 1', [userId, categoryId]);
          if (!categories.length) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
        }
        await cx.execute('UPDATE products SET category_id = ? WHERE user_id = ? AND id = ?',
          [categoryId, userId, productId]);
        await cx.commit();
        return { productId, categoryId };
      } catch (error) { await cx.rollback(); throw error; }
      finally { cx.release(); }
    },
'''
s=s.replace(store_impl_anchor,store_method+store_impl_anchor,1)
# Mobile manage section uses existing data and selected product; avoids modifying purchases.
if "import { useAuth } from '@clerk/expo';" not in m:
    m=m.replace(mobile_import_anchor,mobile_import_anchor+"\nimport { useAuth } from '@clerk/expo';",1)
if "import { mobileConfig, validateApiBase } from '../../lib/config';" not in m:
    m=m.replace(mobile_import_anchor,mobile_import_anchor+"\nimport { mobileConfig, validateApiBase } from '../../lib/config';",1)
manager_hook='''  // GROCERY_CATEGORY_MANAGER_V1: writes only on explicit customer interaction.
  const { getToken } = useAuth();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageProduct, setManageProduct] = useState('');
  const [manageCategory, setManageCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageNotice, setManageNotice] = useState('');
  const categoryApi = async (path: string, method: 'POST' | 'PATCH', payload: unknown) => {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(`${validateApiBase(mobileConfig.apiBase)}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const json: { data?: unknown; error?: { message?: string } } = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? 'Category change failed');
    return json.data;
  };
  const saveAssignment = async () => {
    if (!manageProduct || manageBusy) return;
    setManageBusy(true); setManageNotice('');
    try {
      await categoryApi(`/api/grocery/products/${encodeURIComponent(manageProduct)}/category`, 'PATCH', { categoryId: manageCategory || null });
      setManageNotice('Product category saved. Grocery filters will use the new category.');
      setCategory(''); setProduct(''); setVariant('');
      await refresh();
    } catch (error) { setManageNotice(error instanceof Error ? error.message : 'Unable to save product category'); }
    finally { setManageBusy(false); }
  };
  const createCustomCategory = async () => {
    const name = newCategory.trim();
    if (!name || manageBusy) return;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setManageNotice('That category already exists. Select it below.'); return;
    }
    setManageBusy(true); setManageNotice('');
    try {
      const value = await categoryApi('/api/grocery/categories', 'POST', { name });
      const created = value as { id?: string | number } | null;
      setNewCategory('');
      if (created?.id != null) setManageCategory(String(created.id));
      setManageNotice('Category created. Select a product and save its assignment.');
      await refresh();
    } catch (error) { setManageNotice(error instanceof Error ? error.message : 'Unable to create category'); }
    finally { setManageBusy(false); }
  };
'''
# functions capture refresh const (declared below), safe because handlers execute after render.
m=m.replace(mobile_refresh_anchor,manager_hook+mobile_refresh_anchor,1)
# modal separate from existing filtering control, all actions explicit.
modal='''      {/* GROCERY_CATEGORY_MANAGER_V1: authenticated catalog management, not purchase editing. */}
      <Button label="Manage product categories" subdued onPress={() => { setManageNotice(''); setManageOpen(true); }} />
      <Modal visible={manageOpen} animationType="slide" transparent onRequestClose={() => setManageOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 14 }}>
          <View style={{ borderRadius: 16, backgroundColor: '#fff', padding: 16, maxHeight: '85%', gap: 11 }}>
            <Text style={cardTitle}>Manage product categories</Text>
            <Muted>Categories belong to your account. Changes organize existing products; they do not edit confirmed purchase prices.</Muted>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 9 }}>
              <Label>Create a custom category</Label>
              <TextInput value={newCategory} onChangeText={setNewCategory} placeholder="e.g. Eggs" placeholderTextColor={MUTED} maxLength={191} style={{ ...SELECT_STYLE, color: DARK }} />
              <Button label={manageBusy ? 'Saving…' : 'Add category'} disabled={manageBusy || !newCategory.trim()} onPress={() => { void createCustomCategory(); }} />
              <Label>Choose a product</Label>
              {products.length ? products.map(p => <Pressable key={String(p.id)} onPress={() => { setManageProduct(String(p.id)); setManageCategory(String(p.categoryId ?? p.category_id ?? '')); }} style={{ borderWidth: 1, borderColor: manageProduct === String(p.id) ? GREEN : palette.border, borderRadius: 9, padding: 10 }}><Text style={{ color: DARK, fontWeight: manageProduct === String(p.id) ? '800' : '500' }}>{p.canonicalName ?? p.canonical_name ?? `Product #${p.id}`}</Text><Text style={SMALL}>{categories.find(c => String(c.id) === String(p.categoryId ?? p.category_id ?? ''))?.name ?? 'Uncategorized'}</Text></Pressable>) : <Muted>No products yet. Add a product through Grocery or receipt review first.</Muted>}
              {manageProduct ? <>
                <Label>Assign category</Label>
                <Pressable onPress={() => setManageCategory('')} style={{ borderWidth: 1, borderColor: manageCategory === '' ? GREEN : palette.border, borderRadius: 9, padding: 10 }}><Text style={{ color: DARK }}>Uncategorized {manageCategory === '' ? '✓' : ''}</Text></Pressable>
                {categories.map(c => <Pressable key={String(c.id)} onPress={() => setManageCategory(String(c.id))} style={{ borderWidth: 1, borderColor: manageCategory === String(c.id) ? GREEN : palette.border, borderRadius: 9, padding: 10 }}><Text style={{ color: DARK }}>{c.name} {manageCategory === String(c.id) ? '✓' : ''}</Text></Pressable>)}
                <Button label={manageBusy ? 'Saving…' : 'Save product category'} disabled={manageBusy} onPress={() => { void saveAssignment(); }} />
              </> : null}
              {manageNotice ? <Text style={{ color: GREEN, fontSize: 13 }}>{manageNotice}</Text> : null}
            </ScrollView>
            <Button label="Close" subdued onPress={() => setManageOpen(false)} />
          </View>
        </View>
      </Modal>
'''
m=m.replace(mobile_panel_anchor,modal+mobile_panel_anchor,1)
# Write only after all required checks; keep backups on Lexar project drive.
stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
backup=root/'scripts/backups'/f'grocery-category-manager-{stamp}'
backup.mkdir(parents=True,exist_ok=False)
for path,content in [(route,r),(store,s),(mobile,m)]:
    original=(route.read_text() if path==route else store.read_text() if path==store else mobile.read_text())
    (backup/path.name).write_text(original)
for path,content in [(route,r),(store,s),(mobile,m)]: path.write_text(content)
print('PASS: Installed authenticated Grocery category manager. No migration or purchase updates.')
print('Backups:',backup)
print('NEXT: Typecheck API and mobile, run tests, restart API, reload Expo.')
