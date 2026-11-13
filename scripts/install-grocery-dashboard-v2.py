#!/usr/bin/env python3
"""Guarded mobile-only Grocery dashboard UI upgrade (no DB or API changes)."""
from pathlib import Path
import shutil
from datetime import datetime

root = Path(__file__).resolve().parents[1]
src = root / 'scripts/patches/grocery-dashboard-v2.tsx'
dst = root / 'apps/mobile/src/app/(tabs)/grocery.tsx'
if not src.is_file() or not dst.is_file():
    raise SystemExit('ABORT: Missing patch source or Grocery screen. No changes made.')
old = dst.read_text(encoding='utf-8')
new = src.read_text(encoding='utf-8')
if old == new:
    print('PASS: Grocery dashboard v2 is already installed; no change required.')
    raise SystemExit(0)
if 'My Grocery Price History' not in old or '/api/grocery/dashboard' not in old:
    raise SystemExit('ABORT: Current Grocery screen is not the expected v1 dashboard; no changes made.')
if 'Grocery price summary' not in old or 'Price increase ranking' not in old:
    raise SystemExit('ABORT: Current Grocery screen differs from v1; no changes made.')
if 'useAuthedGet' not in new or '/api/grocery/dashboard' not in new:
    raise SystemExit('ABORT: Patch does not have the expected authenticated dashboard integration.')
backup_dir = root / 'scripts/backups'
backup_dir.mkdir(parents=True, exist_ok=True)
backup = backup_dir / ('grocery.before-v2.'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.tsx')
shutil.copy2(dst, backup)
tmp = dst.with_suffix('.tsx.grocery-v2.tmp')
tmp.write_text(new, encoding='utf-8')
tmp.replace(dst)
print('PASS: Installed Grocery dashboard v2 (mobile UI only).')
print(f'Backup: {backup.relative_to(root)}')
print('NEXT: npm run typecheck --workspace @receipt-tracker/mobile')
