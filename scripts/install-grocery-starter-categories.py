#!/usr/bin/env python3
"""Safely add user-triggered starter-category provisioning and mobile control."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
routes=root/'services/api/src/grocery/routes.ts'
mobile=root/'apps/mobile/src/app/(tabs)/grocery.tsx'
if not routes.exists() or not mobile.exists(): sys.exit('ABORT: expected project files missing')
r=routes.read_text(); m=mobile.read_text()
route_marker="  app.get('/api/grocery/categories', ...guards, wrap(req => grocery.listCategories(userId(req), parseList(req.query))));"
mobile_marker="  const get = useAuthedGet();"
ui_marker="      <Text style={SMALL}>{products.length} catalog products loaded (first 100).</Text>"
if route_marker not in r or mobile_marker not in m or ui_marker not in m or "import { useAuth } from '@clerk/expo';" in m and 'STARTER_CATEGORIES_SETUP' not in m:
    sys.exit('ABORT: current source does not match expected Grocery V2; no changes made')
if 'STARTER_CATEGORIES_SETUP' in r or 'STARTER_CATEGORIES_SETUP' in m:
    print('PASS: Starter-category integration already installed.');sys.exit(0)
catnames = ['Apples','Avocados','Bacon','Bakery','Bananas','Beer','Blueberries','Bread','Carrots','Celery','Cereal','Cheese','Chicken','Citrus','Coffee','Cups','Dairy','Eggs','Frozen foods','Garlic','Ginger','Grapes','Household','Juice','Kiwi','Lemons','Mandarins','Mangoes','Meat','Milk','Nuts','Oil','Onions','Pantry','Peanut butter','Peppers','Personal care','Pineapple','Pizza','Raspberries','Sauces','Seafood','Snacks','Spices','Spinach','Strawberries','Tomatoes','Vegetables','Vitamins','Watermelon','Wine','Yogurt']
# Keep starter names from the user's HTML; do not import its fictional purchases.
from json import dumps
arr=', '.join(dumps(x) for x in catnames)
r=r.replace(route_marker, "  // STARTER_CATEGORIES_SETUP: explicit, authenticated and owner-scoped; never seeds purchases.\n"+
"  app.post('/api/grocery/categories/starter', ...guards, wrap(async req => {\n"+
"    const ownerId = userId(req);\n"+
"    const existing = await grocery.listCategories(ownerId, parseList({ limit: 100, offset: 0 })) as Array<{ name: string }>;\n"+
"    const seen = new Set(existing.map(c => c.name.trim().toLocaleLowerCase('en-US')));\n"+
"    const starter = ["+arr+"];\n"+
"    let created = 0;\n"+
"    for (const name of starter) {\n"+
"      const key = name.toLocaleLowerCase('en-US');\n"+
"      if (seen.has(key)) continue;\n"+
"      await grocery.createCategory(ownerId, parseCategory({ name }));\n"+
"      seen.add(key); created++;\n"+
"    }\n"+
"    return { created, totalStarter: starter.length };\n"+
"  }));\n"+route_marker,1)
m=m.replace("import React, { useCallback, useEffect, useMemo, useState } from 'react';", "import React, { useCallback, useEffect, useMemo, useState } from 'react';\nimport { useAuth } from '@clerk/expo';\nimport { mobileConfig, validateApiBase } from '../../lib/config';",1)
m=m.replace(mobile_marker, mobile_marker+"\n  const { getToken } = useAuth();\n  const [starterBusy, setStarterBusy] = useState(false);\n  const [starterNotice, setStarterNotice] = useState('');\n  // STARTER_CATEGORIES_SETUP: categories are created only when user presses the setup button.\n  const setupCategories = async () => {\n    if (starterBusy) return;\n    setStarterBusy(true); setStarterNotice('');\n    try {\n      const token = await getToken();\n      if (!token) throw new Error('Please sign in again.');\n      const res = await fetch(`${validateApiBase(mobileConfig.apiBase)}/api/grocery/categories/starter`, {\n        method: 'POST',\n        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },\n      });\n      const body: { data?: { created?: number }; error?: { message?: string } } = await res.json();\n      if (!res.ok) throw new Error(body.error?.message ?? 'Could not set up categories');\n      setStarterNotice(`${body.data?.created ?? 0} new categories added. Products must be assigned to a category before they appear under it.`);\n      await refresh();\n    } catch (e) { setStarterNotice(e instanceof Error ? e.message : 'Setup failed'); }\n    finally { setStarterBusy(false); }\n  };",1)
m=m.replace(ui_marker, "      {categories.length === 0 ? <View style={{ gap: 7 }}>\n        <Muted>No grocery categories have been created for this account yet. You can add the 52 categories from your original tracker without importing its sample purchases.</Muted>\n        <Button label={starterBusy ? 'Adding categories…' : 'Add 52 starter grocery categories'} onPress={() => { void setupCategories(); }} disabled={starterBusy} />\n      </View> : null}\n      {starterNotice ? <Text style={SMALL}>{starterNotice}</Text> : null}\n"+ui_marker,1)
# Verify code changed only expected files, then atomically write.
for path, value in [(routes,r),(mobile,m)]:
    backup=path.with_suffix(path.suffix+'.before-starter-categories.bak')
    if not backup.exists(): backup.write_text(path.read_text())
    path.write_text(value)
print('PASS: Added 52 starter categories behind an authenticated, explicit setup action. No database migration or sample purchase import.')
