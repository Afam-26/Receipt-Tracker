import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {makeUtilityPrefill, type UtilityOcrSuggestions} from '../../lib/utility-prefill';
import {Page,Panel,Muted,Action,Loading,palette} from '../../components/ui';
import {useReceiptApi,type ApiEnvelope} from '../../lib/receipts4b';

type Category='electricity'|'water'|'natural_gas'|'internet'|'phone'|'trash'|'other';
type UtilityBill={id:string;sourceReceiptId:string|null;idempotencyKey?:string;category:Category;providerName:string;serviceStart:string;serviceEnd:string;dueDate:string|null;totalAmount:string|null;usageAmount:string|null;usageUnit:string|null;ratePerUnit:string|null;baseCharge:string|null;taxesFees:string|null;notes:string|null;status:'draft'|'confirmed';revision:number};
type Ranking={category:Category;providerName:string;earlierDate:string;laterDate:string;earlierAmount:string;laterAmount:string;increaseAmount:string;increasePercent:number;note:string};
type Summary={category:Category;billCount:number;totalAmount:string;averageAmount:string;lowestAmount:string;highestAmount:string};
type Form={idempotencyKey:string;category:Category;providerName:string;serviceStart:string;serviceEnd:string;dueDate:string;totalAmount:string;usageAmount:string;usageUnit:string;ratePerUnit:string;baseCharge:string;taxesFees:string;notes:string};
const choices:{id:Category;label:string;unit:string}[]=[
  {id:'electricity',label:'Electricity',unit:'kWh'},{id:'water',label:'Water / Sewer',unit:'gal or CCF'},
  {id:'natural_gas',label:'Natural Gas',unit:'therms'},{id:'internet',label:'Internet',unit:'monthly'},
  {id:'phone',label:'Phone',unit:'monthly'},{id:'trash',label:'Trash / Recycling',unit:'monthly'},
  {id:'other',label:'Other',unit:'varies'}
];
const label=(id:Category)=>choices.find(x=>x.id===id)?.label??id;
const money=(n:unknown)=>{const v=Number(n);return Number.isFinite(v)?`$${v.toFixed(2)}`:'—';};
const blank=():Form=>({idempotencyKey:Crypto.randomUUID(),category:'electricity',providerName:'',serviceStart:'',serviceEnd:'',dueDate:'',totalAmount:'',usageAmount:'',usageUnit:'kWh',ratePerUnit:'',baseCharge:'',taxesFees:'',notes:''});
const nullable=(x:string)=>x.trim()||null;
const color='#173c35';
function Field({label,value,onChangeText,placeholder,numeric=false}:{label:string;value:string;onChangeText:(x:string)=>void;placeholder?:string;numeric?:boolean}){
  return <View style={{gap:5}}><Text style={{fontSize:13,fontWeight:'700',color:palette.text}}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#869795"
      keyboardType={numeric?'decimal-pad':'default'} autoCapitalize="none" style={{borderWidth:1,borderColor:palette.border,borderRadius:9,padding:12,backgroundColor:'#fff',color:palette.text,fontSize:15}}/></View>;
}
function Selector({active,onSelect}:{active:Category|'all';onSelect:(x:Category|'all')=>void}){
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:3}}>
    {([{id:'all',label:'All'} as const,...choices]).map(x=><Pressable key={x.id} onPress={()=>onSelect(x.id)} style={{paddingHorizontal:12,paddingVertical:10,borderRadius:9,borderWidth:1,borderColor:active===x.id?palette.green:palette.border,backgroundColor:active===x.id?palette.green:'#fff'}}>
      <Text style={{color:active===x.id?'#fff':palette.text,fontWeight:'600'}}>{x.label}</Text></Pressable>)}
  </ScrollView>;
}
export default function Utilities(){
  const api=useReceiptApi();
  const router=useRouter();
  const {sourceReceiptId}=useLocalSearchParams<{sourceReceiptId?:string}>();
  const loadedRef=useRef<string>('');
  // SOURCE_LINK_STAGE3: only attach a source after it has been read through the authenticated OCR endpoint.
  const [verifiedSourceId,setVerifiedSourceId]=useState<string|null>(null);
  const [sourceNotice,setSourceNotice]=useState('');
  const [category,setCategory]=useState<Category|'all'>('all');
  const [bills,setBills]=useState<UtilityBill[]>([]),[rankings,setRankings]=useState<Ranking[]>([]),[summary,setSummary]=useState<Summary[]>([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [showForm,setShowForm]=useState(false),[form,setForm]=useState<Form>(()=>blank());
  const [selected,setSelected]=useState<UtilityBill|null>(null),[acknowledged,setAcknowledged]=useState(false);
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  // Fetch private OCR results by numeric receipt ID with the existing Clerk-authenticated API.
  // Never save, link, or confirm anything automatically. Preserve user edits after first load.
  useEffect(()=>{
    const rid=typeof sourceReceiptId==='string' && /^[1-9]\d{0,18}$/.test(sourceReceiptId)?sourceReceiptId:'';
    if(!rid || loadedRef.current===rid)return;
    loadedRef.current=rid;
    setVerifiedSourceId(null);
    let cancelled=false;
    setSourceNotice(`Loading OCR suggestions for receipt #${rid}…`);
    void api<ApiEnvelope<{extraction:{data:{receiptType:string;utility?:UtilityOcrSuggestions|null}}|null}>>(`/api/receipts/${rid}/ocr`).then(result=>{
      if(cancelled)return;
      const extraction=result.data.extraction?.data;
      if(extraction?.receiptType!=='utility'){
        setSourceNotice('No completed utility OCR extraction for this receipt. You can still enter bill details manually.');return;
      }
      setVerifiedSourceId(rid);
      const suggestions=makeUtilityPrefill(extraction.utility);
      if(Object.keys(suggestions).length===0){
        setSourceNotice(`Receipt #${rid}: OCR found no usable bill fields. Enter information manually using the original image.`);
        setShowForm(true);return;
      }
      setForm(old=>({...old,...suggestions}));setShowForm(true);
      setSourceNotice(`Receipt #${rid}: OCR suggestions filled the form. Verify every value against the original statement before saving. Nothing has been saved or confirmed.`);
    }).catch(e=>{if(!cancelled)setSourceNotice(e instanceof Error?e.message:'OCR suggestions unavailable.');});
    return()=>{cancelled=true;};
  },[api,sourceReceiptId]);
  const change=(key:keyof Form,value:string)=>setForm(old=>({...old,[key]:value}));
  const query=useMemo(()=>{const p=new URLSearchParams({limit:'100'});if(category!=='all')p.set('category',category);if(from)p.set('from',from);if(to)p.set('to',to);return p.toString();},[category,from,to]);
  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const [list,totals,ranks]=await Promise.all([
        api<ApiEnvelope<{items:UtilityBill[]}>>(`/api/utilities/bills?${query}`),
        api<ApiEnvelope<{groups:Summary[]}>>(`/api/utilities/summary?${query}`),
        api<ApiEnvelope<{items:Ranking[]}>>(`/api/utilities/rankings?${query}`)]);
      setBills(list.data.items);setSummary(totals.data.groups);setRankings(ranks.data.items);
    }catch(e){setError(e instanceof Error?e.message:'Cannot retrieve utility history. Verify that the utility API migration and router are installed.');}
    finally{setBusy(false);}
  },[api,query]);
  useEffect(()=>{void refresh();},[refresh]);
  const formPayload=()=>({
    idempotencyKey:form.idempotencyKey,category:form.category,providerName:form.providerName,
    serviceStart:form.serviceStart,serviceEnd:form.serviceEnd,dueDate:nullable(form.dueDate),
    totalAmount:nullable(form.totalAmount),usageAmount:nullable(form.usageAmount),
    usageUnit:nullable(form.usageAmount)?nullable(form.usageUnit):null,
    ratePerUnit:nullable(form.ratePerUnit),baseCharge:nullable(form.baseCharge),taxesFees:nullable(form.taxesFees),notes:nullable(form.notes),accountLabel:null,
    sourceReceiptId:verifiedSourceId
  });
  const save=async()=>{
    if(!form.providerName.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(form.serviceStart)||!/^\d{4}-\d{2}-\d{2}$/.test(form.serviceEnd)){
      setError('Enter a provider and both billing-period dates (YYYY-MM-DD).');return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      const r=await api<ApiEnvelope<UtilityBill>>('/api/utilities/bills','POST',formPayload());
      setNotice(`Utility bill #${r.data.id} saved as draft${r.data.sourceReceiptId?' with its private statement linked':''}. No expense confirmed.`);setForm(blank());setShowForm(false);setVerifiedSourceId(null);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save bill');}finally{setBusy(false);}
  };
  const confirm=async()=>{
    if(!selected||selected.status!=='draft'||!acknowledged)return;
    setBusy(true);setError('');setNotice('');
    try{
      await api(`/api/utilities/bills/${selected.id}/confirm`,'POST',{expectedRevision:Number(selected.revision),acknowledged:true});
      setNotice(`Utility bill #${selected.id} confirmed once.`);setSelected(null);setAcknowledged(false);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Confirmation failed');}finally{setBusy(false);}
  };
  const stats=useMemo(()=>{
    const count=summary.reduce((s,r)=>s+Number(r.billCount),0);
    const total=summary.reduce((s,r)=>s+Number(r.totalAmount),0);
    return {count,total,average:count?total/count:null};
  },[summary]);
  const trend=useMemo(()=>bills.filter(b=>b.status==='confirmed'&&b.totalAmount!==null).slice(0,10).reverse(),[bills]);
  const maxTrend=Math.max(1,...trend.map(b=>Number(b.totalAmount)));
  return <Page title="Utility Price History" subtitle="Compare household bills, monthly usage, service rates and increases. Utility records stay separate from grocery and fuel history.">
    <Panel>
      <Text style={{fontWeight:'700',fontSize:18,color:palette.text}}>Filter bills</Text>
      <Selector active={category} onSelect={setCategory}/>
      <Field label="From date (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="2026-01-01"/>
      <Field label="To date (YYYY-MM-DD)" value={to} onChangeText={setTo} placeholder="2026-12-31"/>
      <Action label="Clear date filters" onPress={()=>{setFrom('');setTo('');}}/>
    </Panel>
    {sourceNotice?<Panel><Text style={{color:palette.text}}>{sourceNotice}</Text><Muted>OCR values are unverified and may be wrong. Check the original document before saving a draft.</Muted></Panel>:null}
    {error?<Panel><Text style={{color:'#9e342e'}}>{error}</Text></Panel>:null}
    {notice?<Panel><Text style={{color:palette.green}}>{notice}</Text></Panel>:null}
    {busy?<Loading/>:null}
    <Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Confirmed bill summary</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
        {[{label:'Bills',value:String(stats.count)},{label:'Total paid',value:money(stats.total)},{label:'Average bill',value:stats.average===null?'—':money(stats.average)}].map(s=><View key={s.label} style={{minWidth:'45%',flexGrow:1,padding:12,borderWidth:1,borderColor:palette.border,borderRadius:10}}><Muted>{s.label}</Muted><Text style={{fontSize:23,fontWeight:'800',color:color}}>{s.value}</Text></View>)}
      </View>
      {summary.map(s=><Text key={s.category} style={{color:palette.text}}>{label(s.category)} · {Number(s.billCount)} bills · {money(s.totalAmount)} total · {money(s.averageAmount)} average</Text>)}
    </Panel>
    <Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Bill history</Text>
      <Muted>Confirmed bills only. Each bar represents one billed period, not a forecast.</Muted>
      {trend.length?trend.map(b=><View key={b.id} style={{gap:4}}><Text style={{fontSize:12,color:palette.text}}>{label(b.category)} · {b.providerName} · {b.serviceEnd} · {money(b.totalAmount)}</Text><View style={{height:13,borderRadius:5,backgroundColor:'#e9f1ee'}}><View style={{height:13,width:`${Math.max(2,Number(b.totalAmount)/maxTrend*100)}%`,backgroundColor:'#18745e',borderRadius:5}}/></View></View>):<Muted>No confirmed utility bills for these filters.</Muted>}
    </Panel>
    <Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Bill increase ranking</Text>
      <Muted>Compares consecutive bills from the same provider and category. Total changes can be caused by usage, fees or rates; they are not automatically classified as rate increases.</Muted>
      {rankings.length?rankings.slice(0,12).map((r,i)=><View key={`${r.category}-${r.providerName}-${r.laterDate}-${i}`} style={{borderBottomWidth:1,borderBottomColor:palette.border,paddingBottom:9,gap:3}}>
        <Text style={{fontWeight:'700',color:palette.text}}>{i+1}. {r.providerName} · {label(r.category)}</Text>
        <Text style={{color:'#a23b25',fontWeight:'700'}}>+{money(r.increaseAmount)} ({r.increasePercent}%)</Text>
        <Muted>{r.earlierDate}: {money(r.earlierAmount)} → {r.laterDate}: {money(r.laterAmount)}</Muted>
      </View>):<Muted>No positive bill increases among comparable confirmed records.</Muted>}
    </Panel>
    <Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Your utility bills</Text>
      <Action label={showForm?'Hide new bill form':'+ Add utility bill'} onPress={()=>setShowForm(s=>!s)}/>
      {showForm?<View style={{gap:11,paddingTop:9}}>
        <Selector active={form.category} onSelect={c=>{if(c!=='all'){change('category',c);const unit=choices.find(x=>x.id===c)?.unit??'';change('usageUnit',unit==='monthly'?'':unit==='varies'?'':unit);}}}/>
        <Field label="Provider name" value={form.providerName} onChangeText={v=>change('providerName',v)} placeholder="Utility provider"/>
        <Field label="Billing period start" value={form.serviceStart} onChangeText={v=>change('serviceStart',v)} placeholder="2026-10-01"/>
        <Field label="Billing period end" value={form.serviceEnd} onChangeText={v=>change('serviceEnd',v)} placeholder="2026-10-31"/>
        <Field label="Due date (optional)" value={form.dueDate} onChangeText={v=>change('dueDate',v)} placeholder="2026-11-15"/>
        <Field label="Total bill ($)" value={form.totalAmount} numeric onChangeText={v=>change('totalAmount',v)} placeholder="120.50"/>
        <Field label="Usage (optional)" value={form.usageAmount} numeric onChangeText={v=>change('usageAmount',v)} placeholder="450"/>
        <Field label="Usage unit (if usage entered)" value={form.usageUnit} onChangeText={v=>change('usageUnit',v)} placeholder="kWh / therms / CCF"/>
        <Field label="Rate per unit (optional)" value={form.ratePerUnit} numeric onChangeText={v=>change('ratePerUnit',v)} placeholder="0.125000"/>
        <Field label="Base charge ($, optional)" value={form.baseCharge} numeric onChangeText={v=>change('baseCharge',v)}/>
        <Field label="Taxes & fees ($, optional)" value={form.taxesFees} numeric onChangeText={v=>change('taxesFees',v)}/>
        <Field label="Notes (optional)" value={form.notes} onChangeText={v=>change('notes',v)}/>
        <Muted>Saving creates a draft only. The scanned statement is not automatically linked to the bill in this stage.</Muted>
        {verifiedSourceId?<Muted>Private utility statement #{verifiedSourceId} will be linked when this draft is saved. Only one bill may link to that statement.</Muted>:null}
        <Action label="Save utility bill draft (no confirmation)" disabled={busy} onPress={()=>void save()}/>
      </View>:null}
      {bills.map(b=><Pressable key={b.id} accessibilityRole="button" onPress={()=>{setSelected(b);setAcknowledged(false)}} style={{borderWidth:1,borderColor:palette.border,borderRadius:10,padding:12,gap:4}}>
        <Text style={{fontWeight:'700',color:palette.text}}>{label(b.category)} · {b.providerName}</Text>
        <Muted>{b.serviceStart} – {b.serviceEnd} · {money(b.totalAmount)} · {b.status}</Muted>
        <Text style={{color:palette.green}}>View {b.status==='draft'?'and confirm':'confirmed bill'} →</Text>
      </Pressable>)}
      <Action label="Refresh utility history" disabled={busy} onPress={()=>void refresh()}/>
    </Panel>
    {selected?<Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Bill #{selected.id}</Text>
      <Muted>{selected.providerName} · {label(selected.category)} · {selected.status}</Muted>
      <Muted>{selected.serviceStart} to {selected.serviceEnd} · {money(selected.totalAmount)}</Muted>
      {selected.sourceReceiptId?<Action label={`View original private statement #${selected.sourceReceiptId}`} onPress={()=>router.push({pathname:'/receipt/[id]',params:{id:selected.sourceReceiptId!}})}/>:null}
      {selected.status==='draft'?<>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:acknowledged}} onPress={()=>setAcknowledged(v=>!v)} style={{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:10}}>
          <Text style={{color:palette.green,fontSize:22}}>{acknowledged?'☑':'☐'}</Text>
          <Text style={{color:palette.text,flex:1}}>I checked this bill against the original statement and approve it for my history.</Text>
        </Pressable>
        <Action label="Confirm utility bill once" disabled={busy||!acknowledged||selected.totalAmount===null} onPress={()=>void confirm()}/>
      </>:<Muted>This bill is confirmed and cannot be confirmed a second time.</Muted>}
      <Action label="Close bill details" onPress={()=>setSelected(null)}/>
    </Panel>:null}
    <Panel><Muted>OCR suggestions can prefill a new bill draft after you review a private utility statement. No bill is saved or confirmed automatically. Saved OCR-assisted bills link to their original private statement when you review the source before saving. CSV export remains available through the authenticated API.</Muted></Panel>
  </Page>;
}
