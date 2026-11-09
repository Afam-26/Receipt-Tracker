"""Offline schema consistency checks; no MySQL connection required."""
from pathlib import Path
import re
BASE=Path(__file__).resolve().parents[1]
sql=(BASE/'packages/database/migrations/0001_initial.sql').read_text()
models=(BASE/'packages/database/src/schema.ts').read_text()
created=re.findall(r'^CREATE TABLE ([a-z_]+) \(',sql,re.M)
assert len(created)==18, f'Expected 18 tables, found {len(created)}'
assert len(created)==len(set(created)), 'Duplicate SQL table'
for table in created:
    assert re.search(r"mysqlTable\('"+table+r"'",models),f'Missing Drizzle table model: {table}'
for ref in re.findall(r'REFERENCES ([a-z_]+)\(',sql):
    assert ref in created,f'Unknown foreign-key target: {ref}'
for table in ['grocery_line_items','gas_purchases','purchase_transactions','receipts']:
    assert re.search(r'CREATE TABLE '+table+r' \([\s\S]*?user_id BIGINT UNSIGNED NOT NULL',sql), f'Missing owner in {table}'
assert 'regular_price_per_gallon DECIMAL(10,4)' in sql
assert 'paid_price_per_gallon DECIMAL(10,4)' in sql
assert 'reward_discount_per_gallon DECIMAL(10,4)' in sql
assert 'gallons DECIMAL(12,4)' in sql
print('PASS: 18 models and SQL tables, FK targets, owner columns, fuel precision')
