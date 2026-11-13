import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, Share, Text,
  TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Panel, Muted, palette } from '../../components/ui';
import { useAuthedGet } from '../../lib/hooks';

type Category = { id: string | number; name: string };
type Product = { id: string | number; canonicalName?: string; canonical_name?: string; categoryId?: string | number; category_id?: string | number };
type Observation = { id: string; date: string; productId: string; productName: string; variantId: string; variantName: string; packageQuantity: string | null; packageUnit: string | null; price: number };
type Rank = { variantId: string; productId: string; productName: string; variantName: string; packageQuantity?: string | null; packageUnit?: string | null; firstDate: string; lastDate: string; firstPrice: number; lastPrice: number; change: number; percent: number | null; samples: number };
type Dashboard = { observations: Observation[]; rankings: Rank[]; summary: { count: number; min: number | null; max: number | null; average: number | null }; truncated: boolean; note: string };
type Option = { value: string; label: string };
const DARK = palette.text;
const MUTED = palette.muted;
const GREEN = palette.green;
const SMALL = { color: MUTED, fontSize: 13, lineHeight: 19 } as const;
const MONEY = (x: number | null | undefined) => x == null || !Number.isFinite(x) ? '—' : `$${x.toFixed(2)}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const cardTitle = { fontSize: 20, fontWeight: '800' as const, color: DARK };
const fieldLabel = { fontSize: 13, color: MUTED, fontWeight: '700' as const };
const SELECT_STYLE = { borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 13, minHeight: 48, justifyContent: 'center' as const };

function validISO(s: string): boolean {
  if (!ISO.test(s)) return false;
  const dt = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(dt.valueOf()) && dt.toISOString().slice(0, 10) === s;
}
function getItems<T>(response: unknown, key: string): T[] {
  if (!response || typeof response !== 'object') return [];
  const r = response as Record<string, unknown>;
  if (Array.isArray(r.data)) return r.data as T[];
  const data = r.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data[key])) return data[key] as T[];
  if (Array.isArray(r[key])) return r[key] as T[];
  return [];
}
function Label({ children }: { children: React.ReactNode }) { return <Text style={fieldLabel}>{children}</Text>; }
function Button({ label, onPress, subdued = false, disabled = false }: { label: string; onPress: () => void; subdued?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ backgroundColor: subdued ? '#fff' : GREEN, borderRadius: 11, borderWidth: subdued ? 1 : 0, borderColor: palette.border, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, opacity: disabled ? .45 : 1 }}>
    <Text style={{ color: subdued ? GREEN : '#fff', fontSize: 14, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}
function Segment({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: selected ? GREEN : palette.border, backgroundColor: selected ? GREEN : '#fff', marginRight: 7, marginBottom: 5 }}>
    <Text style={{ color: selected ? '#fff' : DARK, fontWeight: '700', fontSize: 13 }}>{title}</Text>
  </Pressable>;
}
function Select({ title, value, options, onChange, emptyLabel }: { title: string; value: string; options: Option[]; onChange: (s: string) => void; emptyLabel: string }) {
  const [open, setOpen] = useState(false);
  const chosen = options.find(o => o.value === value)?.label ?? emptyLabel;
  return <View style={{ gap: 6 }}>
    <Label>{title}</Label>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${chosen}`} onPress={() => setOpen(true)} style={{ ...SELECT_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <Text numberOfLines={1} style={{ color: DARK, flex: 1, fontSize: 15 }}>{chosen}</Text>
      <Text style={{ color: MUTED }}>⌄</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '75%', padding: 18, gap: 10 }}>
          <Text style={{ ...cardTitle, fontSize: 18 }}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(o => <Pressable key={o.value} accessibilityRole="button" onPress={() => { onChange(o.value); setOpen(false); }} style={{ paddingVertical: 13, borderBottomWidth: 1, borderColor: palette.border, flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: o.value === value ? GREEN : DARK, fontWeight: o.value === value ? '800' : '500', flex: 1 }}>{o.label}</Text>
              {o.value === value ? <Text style={{ color: GREEN }}>✓</Text> : null}
            </Pressable>)}
          </ScrollView>
          <Button label="Close" subdued onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </View>;
}
function CalendarField({ title, value, onChange }: { title: string; value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (validISO(value) ? value.slice(0, 7) : new Date().toISOString().slice(0, 7)));
  const [manual, setManual] = useState(value);
  const [error, setError] = useState('');
  const first = new Date(`${month}-01T00:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const prevNext = (delta: number) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  };
  const openPicker = () => { setManual(value); setError(''); setMonth(validISO(value) ? value.slice(0, 7) : new Date().toISOString().slice(0, 7)); setOpen(true); };
  return <View style={{ gap: 6, flex: 1 }}>
    <Label>{title}</Label>
    <Pressable accessibilityRole="button" onPress={openPicker} style={{ ...SELECT_STYLE, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: value ? DARK : MUTED, fontSize: 14 }}>{value || 'Choose date'}</Text><Text style={{ color: GREEN }}>▦</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 17 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 15, padding: 16, gap: 10 }}>
          <Text style={{ ...cardTitle, fontSize: 18 }}>{title}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button label="‹" subdued onPress={() => prevNext(-1)} />
            <Text style={{ color: DARK, fontWeight: '700' }}>{first.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</Text>
            <Button label="›" subdued onPress={() => prevNext(1)} />
          </View>
          <View style={{ flexDirection: 'row' }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', color: MUTED, fontWeight: '700' }}>{d}</Text>)}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: offset + count }, (_, i) => {
              const day = i - offset + 1;
              if (day < 1) return <View key={`pad-${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
              const iso = `${month}-${String(day).padStart(2, '0')}`;
              return <Pressable key={iso} accessibilityRole="button" accessibilityLabel={iso} onPress={() => { onChange(iso); setOpen(false); }} style={{ width: `${100 / 7}%`, height: 42, justifyContent: 'center', backgroundColor: value === iso ? palette.accent : 'transparent', borderRadius: 8 }}><Text style={{ textAlign: 'center', color: value === iso ? GREEN : DARK, fontWeight: value === iso ? '800' : '400' }}>{day}</Text></Pressable>;
            })}
          </View>
          <Label>Or enter YYYY-MM-DD</Label>
          <TextInput value={manual} onChangeText={setManual} placeholder="2026-11-12" placeholderTextColor={MUTED} style={{ ...SELECT_STYLE, color: DARK }} autoCapitalize="none" />
          {error ? <Text style={{ color: '#B44139' }}>{error}</Text> : null}
          <Button label="Apply typed date" onPress={() => { if (!validISO(manual)) { setError('Enter a valid date in YYYY-MM-DD format.'); return; } onChange(manual); setOpen(false); }} />
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button label="Clear date" subdued onPress={() => { onChange(''); setOpen(false); }} /></View><View style={{ flex: 1 }}><Button label="Cancel" subdued onPress={() => setOpen(false)} /></View></View>
        </View>
      </View>
    </Modal>
  </View>;
}
function Metric({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return <View style={{ width: '48%', borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 13, gap: 7, minHeight: 112 }}>
    <Text style={SMALL}>{label}</Text><Text style={{ fontSize: 24, fontWeight: '800', color: DARK }}>{value}</Text>{caption ? <Text style={SMALL}>{caption}</Text> : null}
  </View>;
}
function compareVariant(a: Observation, b: Observation): number { return a.date.localeCompare(b.date) || Number(a.id) - Number(b.id); }
function pack(variant: { variantName: string; packageQuantity?: string | null; packageUnit?: string | null }): string {
  return `${variant.variantName}${variant.packageQuantity && variant.packageUnit ? ` · ${variant.packageQuantity} ${variant.packageUnit}` : ''}`;
}
function csvCell(v: unknown): string {
  const str = String(v ?? '');
  const safe = /^[\s]*[=+@\-\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}
function csv(rows: (string | number | null)[][]): string { return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
async function shareCsv(rows: (string | number | null)[][], title: string, onError: (msg: string) => void) {
  try { await Share.share({ title, message: csv(rows) }); }
  catch (e) { onError(e instanceof Error ? e.message : 'Unable to open share sheet'); }
}
function TrendChart({ values }: { values: Observation[] }) {
  const [width, setWidth] = useState(0);
  const height = 170;
  if (values.length === 0) return <Muted>No confirmed prices for this variant and date range.</Muted>;
  const min = Math.min(...values.map(x => x.price)), max = Math.max(...values.map(x => x.price));
  const lo = min === max ? Math.max(0, min - 1) : min;
  const hi = min === max ? max + 1 : max;
  const left = 12, right = 10, top = 12, bottom = 18;
  const coordinates = values.map((v, i) => ({ x: left + (values.length === 1 ? (width - left - right) / 2 : i * (width - left - right) / (values.length - 1)), y: top + (hi - v.price) * (height - top - bottom) / (hi - lo) }));
  return <View style={{ gap: 7 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={SMALL}>High {MONEY(max)}</Text><Text style={SMALL}>Low {MONEY(min)}</Text></View>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height, borderRadius: 10, backgroundColor: '#F0F8F5', overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
      {width > 50 ? <>
        {[.25, .5, .75].map(p => <View key={p} style={{ position: 'absolute', top: p * height, left: 0, right: 0, height: 1, backgroundColor: '#D7E8E2' }} />)}
        {coordinates.slice(1).map((b, i) => { const a = coordinates[i]; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); return <View key={`line-${i}`} style={{ position: 'absolute', left: a.x + dx / 2 - len / 2, top: a.y + dy / 2 - 1.5, width: len, height: 3, backgroundColor: GREEN, borderRadius: 2, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />; })}
        {coordinates.map((p, i) => <View key={`point-${i}`} style={{ position: 'absolute', left: p.x - 5, top: p.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN, borderWidth: 2, borderColor: '#fff' }} />)}
      </> : null}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={SMALL}>{values[0].date}</Text><Text style={SMALL}>{values[values.length - 1].date}</Text></View>
    <Muted>{values.length} recorded purchase line{values.length === 1 ? '' : 's'}. Each point is a recorded unit price, not a continuous store price.</Muted>
  </View>;
}

export default function Grocery() {
  const insets = useSafeAreaInsets();
  const get = useAuthedGet();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');
  const [variant, setVariant] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minimum, setMinimum] = useState('10');
  const [sort, setSort] = useState('percent');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareError, setShareError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (category) params.set('categoryId', category);
      if (product) params.set('productId', product);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const [c, p, d] = await Promise.all([
        get<unknown>('/api/grocery/categories?limit=100&offset=0'),
        get<unknown>('/api/grocery/products?limit=100&offset=0'),
        get<{ data: Dashboard }>(`/api/grocery/dashboard${params.toString() ? '?' + params : ''}`),
      ]);
      if (!d?.data || !Array.isArray(d.data.observations) || !Array.isArray(d.data.rankings)) throw new Error('Unexpected Grocery dashboard response');
      setCategories(getItems<Category>(c, 'categories'));
      setProducts(getItems<Product>(p, 'products'));
      setDashboard(d.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Grocery dashboard'); }
    finally { setLoading(false); }
  }, [get, category, product, from, to]);
  useEffect(() => { void refresh(); }, [refresh]);
  const productOptions = useMemo<Option[]>(() => [{ value: '', label: 'All products' }, ...products.filter(p => !category || String(p.categoryId ?? p.category_id ?? '') === category).map(p => ({ value: String(p.id), label: p.canonicalName ?? p.canonical_name ?? `Product #${p.id}` }))], [products, category]);
  const observations = dashboard?.observations ?? [];
  const availableVariants = useMemo<Option[]>(() => {
    const m = new Map<string, Option>();
    for (const o of observations.filter(o => o.productId === product)) m.set(o.variantId, { value: o.variantId, label: pack(o) });
    return [...m.values()];
  }, [observations, product]);
  const chosenVariant = variant && availableVariants.some(v => v.value === variant) ? variant : (availableVariants[0]?.value ?? '');
  const trend = useMemo(() => observations.filter(x => x.productId === product && x.variantId === chosenVariant).sort(compareVariant), [observations, product, chosenVariant]);
  const ranked = useMemo(() => [...(dashboard?.rankings ?? [])].filter(r => r.percent != null && r.percent >= Number(minimum)).sort((a, b) => sort === 'change' ? b.change - a.change : (b.percent ?? -Infinity) - (a.percent ?? -Infinity)), [dashboard, minimum, sort]);
  const rankCsv = () => {
    const rows: (string | number | null)[][] = [['Rank', 'Product', 'Variant', 'Package quantity', 'Package unit', 'First date', 'First price', 'Last date', 'Last price', 'Increase USD', 'Increase percent', 'Samples']];
    ranked.forEach((r, i) => rows.push([i + 1, r.productName, r.variantName, r.packageQuantity ?? '', r.packageUnit ?? '', r.firstDate, r.firstPrice.toFixed(4), r.lastDate, r.lastPrice.toFixed(4), r.change.toFixed(4), r.percent?.toFixed(2) ?? '', r.samples]));
    void shareCsv(rows, 'Grocery price increase rankings.csv', setShareError);
  };
  const historyCsv = () => {
    const rows: (string | number | null)[][] = [['Date', 'Product', 'Variant', 'Package quantity', 'Package unit', 'Price per purchased item USD']];
    for (const o of observations) rows.push([o.date, o.productName, o.variantName, o.packageQuantity, o.packageUnit, o.price.toFixed(4)]);
    void shareCsv(rows, 'Grocery purchase history.csv', setShareError);
  };
  const categoryOptions: Option[] = [{ value: '', label: 'All categories' }, ...categories.map(c => ({ value: String(c.id), label: c.name }))];
  const dateError = (from && !validISO(from)) || (to && !validISO(to)) || (from && to && from > to);
  return <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 17, paddingTop: Math.max(insets.top + 17, 64), paddingBottom: Math.max(insets.bottom + 75, 100), gap: 14 }}>
    <View style={{ gap: 9, paddingRight: 55, paddingBottom: 5 }}>
      <Text style={{ color: DARK, fontSize: 26, fontWeight: '800', lineHeight: 31 }}>My Grocery Price History</Text>
      <Text style={{ color: MUTED, fontSize: 15, lineHeight: 23 }}>Compare what you actually paid, by item, date and receipt.</Text>
    </View>
    <Panel>
      <Text style={cardTitle}>Filter purchases</Text>
      <Select title="Product category" value={category} options={categoryOptions} emptyLabel="All categories" onChange={v => { setCategory(v); setProduct(''); setVariant(''); }} />
      <Select title="Specific product" value={product} options={productOptions} emptyLabel="All products" onChange={v => { setProduct(v); setVariant(''); }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <CalendarField title="From date" value={from} onChange={setFrom} />
        <CalendarField title="To date" value={to} onChange={setTo} />
      </View>
      {dateError ? <Text style={{ color: '#B44139', fontSize: 13 }}>Check the date range; the start must not be after the end.</Text> : null}
      <Button label="All dates" subdued onPress={() => { setFrom(''); setTo(''); }} />
      <Text style={SMALL}>{products.length} catalog products loaded (first 100).</Text>
    </Panel>
    {loading ? <Panel><ActivityIndicator color={GREEN} /><Muted>Loading confirmed grocery prices…</Muted></Panel> : error ? <Panel><Text style={{ color: '#B44139' }}>{error}</Text><Button label="Retry dashboard" onPress={() => void refresh()} /></Panel> : <>
      <Panel>
        <Text style={cardTitle}>Grocery price summary</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
          <Metric label="Recorded purchase lines" value={String(dashboard?.summary.count ?? 0)} caption="Matching filters" />
          <Metric label="Lowest item price" value={MONEY(dashboard?.summary.min)} />
          <Metric label="Highest item price" value={MONEY(dashboard?.summary.max)} />
          <Metric label="Average recorded price" value={MONEY(dashboard?.summary.average)} caption="Per purchase line" />
        </View>
        {dashboard?.truncated ? <Text style={{ color: '#A74028' }}>The 5,000-line limit was reached. Narrow the filters; statistics and exports cover only the returned records.</Text> : null}
      </Panel>
      <Panel>
        <Text style={cardTitle}>Price increase ranking</Text>
        <Muted>Compares earliest and latest confirmed prices for the same exact variant and package. Only increases appear.</Muted>
        <Select title="Minimum percentage increase" value={minimum} onChange={setMinimum} emptyLabel="10% or more" options={[{ value: '0', label: 'Any increase' }, { value: '5', label: '5% or more' }, { value: '10', label: '10% or more' }, { value: '20', label: '20% or more' }, { value: '50', label: '50% or more' }]} />
        <Select title="Sort ranking by" value={sort} onChange={setSort} emptyLabel="Largest percentage increase" options={[{ value: 'percent', label: 'Largest percentage increase' }, { value: 'change', label: 'Largest dollar increase' }]} />
        <Text style={SMALL}>{ranked.length} comparable variant{ranked.length === 1 ? '' : 's'} increased by this threshold.</Text>
        {ranked.length ? ranked.slice(0, 40).map((r, i) => <Pressable key={r.variantId} accessibilityRole="button" accessibilityLabel={`View ${r.productName} price history`} onPress={() => { setProduct(r.productId); setVariant(r.variantId); }} style={{ borderBottomColor: palette.border, borderBottomWidth: 1, paddingVertical: 11, gap: 5 }}>
          <Text style={{ color: GREEN, fontWeight: '800' }}>{i + 1}. {r.productName}</Text>
          <Text style={SMALL}>{pack(r)}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 5, flexWrap: 'wrap' }}>
            <Text style={SMALL}>First {MONEY(r.firstPrice)} · {r.firstDate}</Text>
            <Text style={SMALL}>Latest {MONEY(r.lastPrice)} · {r.lastDate}</Text>
          </View>
          <Text style={{ color: '#B44139', fontWeight: '800' }}>+{MONEY(r.change)} · +{r.percent?.toFixed(1)}%</Text>
        </Pressable>) : <Muted>No comparable confirmed price increases meet this threshold.</Muted>}
        {ranked.length > 40 ? <Muted>Showing the top 40; the CSV includes all matching ranked variants.</Muted> : null}
        <Button label="Share ranking CSV data" subdued onPress={rankCsv} />
      </Panel>
      <Panel>
        <Text style={cardTitle}>Price trend</Text>
        <Muted>Select a product and exact package to compare like with like. Every point is a confirmed purchase line.</Muted>
        {!product ? <Muted>Select a specific product above, or tap a ranked product.</Muted> : <>
          <Select title="Exact product variant / package" value={chosenVariant} onChange={setVariant} options={availableVariants} emptyLabel="No confirmed variants" />
          <TrendChart values={trend.length > 80 ? trend.slice(-80) : trend} />
          {trend.length > 80 ? <Muted>Chart shows the 80 most recent confirmed observations; the history export includes all returned lines.</Muted> : null}
          {trend.length ? <View style={{ gap: 4 }}>
            {trend.slice(-15).map(o => <View key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.border }}><Text style={SMALL}>{o.date}</Text><Text style={{ color: DARK, fontWeight: '700' }}>{MONEY(o.price)}</Text></View>)}
            {trend.length > 15 ? <Muted>Showing the last 15 purchase dates beneath the chart.</Muted> : null}
          </View> : null}
        </>}
      </Panel>
      <Panel>
        <Button label="Share purchase history CSV data" onPress={historyCsv} />
        <Button label="Refresh Grocery dashboard" subdued onPress={() => void refresh()} />
        {shareError ? <Text style={{ color: '#B44139' }}>{shareError}</Text> : null}
        <Muted>The native share sheet exports CSV-formatted text; choose a compatible app to save it as a .csv file. Only confirmed data returned by the API is included.</Muted>
      </Panel>
    </>}
  </ScrollView>;
}
