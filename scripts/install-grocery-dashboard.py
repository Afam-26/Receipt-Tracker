from pathlib import Path
root=Path(__file__).resolve().parents[1]
app=root/'services/api/src/app.ts'
server=root/'services/api/src/server.ts'
s=app.read_text(); t=server.read_text()
if 'registerGroceryDashboardRoutes' in s or 'createGroceryDashboardStore' in t:
    print('Dashboard integration already present. No additional server changes made.')
    raise SystemExit(0)
checks=[('app import',"import { registerReviewRoutes } from './review/routes.js';" in s),
('app signature','ocr, review }:' in s),('app option','review?: ReviewStore;' in s),
('app registration','if (auth && review) registerReviewRoutes(app, auth, review);' in s),
('server import',"import { createReviewStore } from './review/store.js';" in t),
('server construct','const analytics = createAnalyticsStore(config.databaseUrl);' in t or 'const analytics=createAnalyticsStore(config.databaseUrl);' in t),
('server app','analytics, receipts, ocr, review });' in t),
('server close','analytics.close(),' in t)]
missing=[name for name,ok in checks if not ok]
if missing:raise SystemExit('ABORT: Project layout differs ('+', '.join(missing)+'). No changes made.')
s=s.replace("import { registerReviewRoutes } from './review/routes.js';", "import { registerReviewRoutes } from './review/routes.js';\nimport {registerGroceryDashboardRoutes,type GroceryDashboardStore} from './grocery/dashboard.js';")
s=s.replace('ocr, review }:', 'ocr, review, groceryDashboard }:')
s=s.replace('review?: ReviewStore;', 'review?: ReviewStore;\n  groceryDashboard?: GroceryDashboardStore;')
s=s.replace('if (auth && review) registerReviewRoutes(app, auth, review);','if (auth && review) registerReviewRoutes(app, auth, review);\n  if (auth && groceryDashboard) registerGroceryDashboardRoutes(app,auth,groceryDashboard);')
t=t.replace("import { createReviewStore } from './review/store.js';", "import { createReviewStore } from './review/store.js';\nimport {createGroceryDashboardStore} from './grocery/dashboard.js';")
needle='const analytics = createAnalyticsStore(config.databaseUrl);' if 'const analytics = createAnalyticsStore(config.databaseUrl);' in t else 'const analytics=createAnalyticsStore(config.databaseUrl);'
t=t.replace(needle,needle+'\nconst groceryDashboard=createGroceryDashboardStore(config.databaseUrl);')
t=t.replace('analytics, receipts, ocr, review });','analytics, receipts, ocr, review, groceryDashboard });')
t=t.replace('analytics.close(),','analytics.close(),groceryDashboard.close(),')
app.write_text(s);server.write_text(t)
print('PASS: Mounted Clerk-protected Grocery dashboard endpoint. No migration or database writes.')
