#!/usr/bin/env python3
"""Register the already-unzipped Grocery dashboard while preserving Utility routes."""
from pathlib import Path
import re
from datetime import datetime
root = Path(__file__).resolve().parents[1]
a = root / 'services/api/src/app.ts'
s = root / 'services/api/src/server.ts'
d = root / 'services/api/src/grocery/dashboard.ts'
if not d.exists():
    raise SystemExit('ABORT: dashboard.ts missing. Unzip receipt-tracker-grocery-dashboard-v1.zip first.')
app, server = a.read_text(), s.read_text()
if 'registerGroceryDashboardRoutes' in app and 'createGroceryDashboardStore' in server:
    print('PASS: Grocery dashboard already registered; no edits required.')
    raise SystemExit(0)
if 'registerGroceryDashboardRoutes' in app or 'createGroceryDashboardStore' in server:
    raise SystemExit('ABORT: Partial dashboard integration found; inspect manually before proceeding.')

# Use existing authenticated route pattern; do not replace Utility route wiring.
def apply_once(source, needle, replacement, label):
    occurrences = source.count(needle)
    if occurrences != 1:
        raise ValueError(f'{label}: expected 1 occurrence, found {occurrences}')
    return source.replace(needle,replacement,1)

try:
    app = apply_once(app,"import { registerReviewRoutes } from './review/routes.js';", "import { registerReviewRoutes } from './review/routes.js';\nimport { registerGroceryDashboardRoutes, type GroceryDashboardStore } from './grocery/dashboard.js';", 'app import')
    # The current API app has a utilities option; append the dashboard option without replacing others.
    matched = re.search(r'export function createApp\(\{([^}]*)\}: \{',app)
    if not matched: raise ValueError('app createApp signature not found')
    props = matched.group(1)
    if 'review' not in props or 'utilities' not in props: raise ValueError('app signature does not contain expected review + utilities features')
    app = app[:matched.start(1)] + props.rstrip() + ', groceryDashboard ' + app[matched.end(1):]
    app = apply_once(app,'  review?: ReviewStore;', '  review?: ReviewStore;\n  groceryDashboard?: GroceryDashboardStore;', 'app type')
    app = apply_once(app,'  if (auth && review) registerReviewRoutes(app, auth, review);', '  if (auth && review) registerReviewRoutes(app, auth, review);\n  if (auth && groceryDashboard) registerGroceryDashboardRoutes(app, auth, groceryDashboard);', 'app route')
    server = apply_once(server,"import { createReviewStore } from './review/store.js';", "import { createReviewStore } from './review/store.js';\nimport { createGroceryDashboardStore } from './grocery/dashboard.js';", 'server import')
    matches = list(re.finditer(r'^const analytics\s*=\s*createAnalyticsStore\(config\.databaseUrl\);',server,re.M))
    if len(matches)!=1: raise ValueError(f'server analytics constructor expected 1, found {len(matches)}')
    m=matches[0];server=server[:m.end()]+'\nconst groceryDashboard = createGroceryDashboardStore(config.databaseUrl);'+server[m.end():]
    # Add dashboard to the actual createApp call without altering any other options.
    call = re.search(r'const app = createApp\(\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\);',server)
    if not call or 'utilities:' not in call.group(1): raise ValueError('server createApp call expected with utilities')
    server=server[:call.end()-3]+', groceryDashboard '+server[call.end()-3:]
    server=apply_once(server,'analytics.close(),','analytics.close(), groceryDashboard.close(),','server shutdown')
except ValueError as e:
    raise SystemExit(f'ABORT: {e}. No files changed.')

# Leave quick recovery backups beside original files. No .env/database touched.
backup_tag = datetime.now().strftime('%Y%m%d-%H%M%S')
for path in (a,s):
    backup=path.with_name(path.name+'.pre-grocery-dashboard-'+backup_tag+'.bak')
    backup.write_text(path.read_text())
a.write_text(app)
s.write_text(server)
print('PASS: Grocery /api/grocery/dashboard registered and store lifecycle connected.')
print('PASS: Existing Utility, OCR, Grocery, Gas, and Receipt registrations preserved.')
print('NEXT: Typecheck API, run tests, restart npm run api:dev (Metro reload alone is insufficient).')
