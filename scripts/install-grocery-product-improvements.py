#!/usr/bin/env python3
"""Guarded additive patch: Grocery rename + optional category suggestion."""
from pathlib import Path
from datetime import datetime
import sys
root=Path(__file__).resolve().parents[1]
route=root/'services/api/src/grocery/routes.ts'
store=root/'services/api/src/grocery/store.ts'
mobile=root/'apps/mobile/src/app/(tabs)/grocery.tsx'
helper=root/'apps/mobile/src/lib/grocery-category-suggest.ts'
files=[route,store,mobile,helper]
if any(not x.exists() for x in files):sys.exit('ABORT: Required source files missing. No changes made.')
r,s,m,h=(x.read_text() for x in files)
tag='GROCERY_PRODUCT_IMPROVEMENTS_V1'
if all(tag in c for c in [r,s,m]):print('PASS: Patch already installed.');sys.exit(0)
if any(tag in c for c in [r,s,m]):sys.exit('ABORT: Partial patch installation found; no changes made.')
route_anchor="  app.get('/api/grocery/variants', ...guards, wrap(req => grocery.listVariants(userId(req), parseList(req.query))));"
store_iface_anchor='  assignProductCategory(userId: string, productId: string, categoryId: string | null): Promise<{ productId: string; categoryId: string | null }>;'
store_anchor='    async listVariants(userId, f) {'
mobile_hook_anchor='  const [manageNotice, setManageNotice] = useState(\'\');'
mobile_selected_anchor="onPress={() => { setManageProduct(String(p.id)); setManageCategory(String(p.categoryId ?? p.category_id ?? '')); }}"
mobile_render_anchor="              {manageProduct ? <>\n                <Label>Assign category</Label>"
mobile_import_anchor="import { useAuth } from '@clerk/expo';"
for name,content,anchor in [('routes',r,route_anchor),('store',s,store_iface_anchor),('store',s,store_anchor),('mobile',m,mobile_hook_anchor),('mobile',m,mobile_selected_anchor),('mobile',m,mobile_render_anchor),('mobile',m,mobile_import_anchor)]:
 if content.count(anchor)!=1:sys.exit(f'ABORT: Expected a unique {name} marker: {anchor[:65]}')
if m.count('const { getToken } = useAuth();')!=1:sys.exit('ABORT: Mobile getToken setup differs; fix duplicate declarations first.')
# Guards pass the authenticated local user through. Only allow product name property.
endpoint='''  // GROCERY_PRODUCT_IMPROVEMENTS_V1: no direct editing of historical purchases.
  app.patch('/api/grocery/products/:productId/name', ...guards, wrap(req => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'canonicalName')) {
      throw new HttpError(400, 'INVALID_PRODUCT_NAME', 'Only canonicalName may be updated');
    }
    const name = (body as { canonicalName: unknown }).canonicalName;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 191 || /[\\x00-\\x1f\\x7f]/.test(name)) {
      throw new HttpError(400, 'INVALID_PRODUCT_NAME', 'Product name must be 1–191 printable characters');
    }
    return grocery.renameProduct(userId(req), id(req.params.productId, 'productId')!, name.trim());
  }));
'''
r=r.replace(route_anchor,endpoint+route_anchor,1)
s=s.replace(store_iface_anchor,store_iface_anchor+'''\n  // GROCERY_PRODUCT_IMPROVEMENTS_V1
  renameProduct(userId: string, productId: string, name: string): Promise<{ productId: string; canonicalName: string }>;''',1)
method='''    // GROCERY_PRODUCT_IMPROVEMENTS_V1: only rename a product owned by current local user.
    async renameProduct(userId, productId, name) {
      const [result] = await pool.execute<ResultSetHeader>(
        'UPDATE products SET canonical_name = ? WHERE user_id = ? AND id = ?',
        [name, userId, productId]);
      if (result.affectedRows !== 1) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      return { productId, canonicalName: name };
    },
'''
s=s.replace(store_anchor,method+store_anchor,1)
m=m.replace(mobile_import_anchor,mobile_import_anchor+"\nimport { suggestGroceryCategory } from '../../lib/grocery-category-suggest';",1)
m=m.replace(mobile_hook_anchor,mobile_hook_anchor+'''\n  // GROCERY_PRODUCT_IMPROVEMENTS_V1: suggestions require explicit approval before saving.
  const [manageProductName, setManageProductName] = useState('');''',1)
m=m.replace(mobile_selected_anchor,"onPress={() => { setManageProduct(String(p.id)); setManageCategory(String(p.categoryId ?? p.category_id ?? '')); setManageProductName(p.canonicalName ?? p.canonical_name ?? ''); }}",1)
# save rename refresh, maintaining existing name if no user input.
rename_method='''  const saveProductName = async () => {
    const name = manageProductName.trim();
    if (!manageProduct || manageBusy || !name || name.length > 191) return;
    setManageBusy(true); setManageNotice('');
    try {
      await categoryApi(`/api/grocery/products/${encodeURIComponent(manageProduct)}/name`, 'PATCH', { canonicalName: name });
      setManageNotice('Product name saved. Confirmed prices and variant IDs are unchanged.');
      await refresh();
    } catch (err) { setManageNotice(err instanceof Error ? err.message : 'Product rename failed'); }
    finally { setManageBusy(false); }
  };
'''
m=m.replace('  const createCustomCategory = async () => {',rename_method+'  const createCustomCategory = async () => {',1)
add_ui='''              {manageProduct ? <>
                <Label>Product name</Label>
                <TextInput value={manageProductName} onChangeText={setManageProductName} placeholder="Product name" placeholderTextColor={MUTED} maxLength={191} style={{ ...SELECT_STYLE, color: DARK }} />
                <Button label={manageBusy ? 'Saving…' : 'Save product name'} disabled={manageBusy || !manageProductName.trim()} onPress={() => { void saveProductName(); }} />
                {(() => {
                  const suggestion = suggestGroceryCategory(manageProductName, categories);
                  return suggestion && suggestion.categoryId !== manageCategory ? <View style={{ gap: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 10, padding: 12 }}>
                    <Text style={{ color: DARK, fontWeight: '700' }}>Suggested category: {suggestion.categoryName}</Text>
                    <Muted>Name-based suggestion only. Check the product before accepting.</Muted>
                    <Button label="Use suggested category" subdued onPress={() => setManageCategory(suggestion.categoryId)} />
                  </View> : null;
                })()}
                <Label>Assign category</Label>'''
m=m.replace(mobile_render_anchor,add_ui,1)
# stage writes only after all source anchors verified and new helper exists.
stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
back=root/'scripts/backups'/f'grocery-product-improvements-{stamp}'
back.mkdir(parents=True,exist_ok=False)
for path,new in [(route,r),(store,s),(mobile,m)]:
 (back/path.name).write_text(path.read_text())
 path.write_text(new)
print('PASS: Grocery name editing and optional category suggestions installed.')
print('Source backups:',back)
print('No database migration. No historical purchase values changed.')
