import React, {useCallback,useEffect,useRef,useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {Page,Panel,Muted,Action,Loading,palette} from '../../components/ui';
import {ReceiptImagePreview} from '../../components/ReceiptImagePreview';
import {initialDraft,useReceiptApi,validateDraftLocally,type ApiEnvelope,type OcrStatus,type ReviewDraft,type ReviewState,type GroceryLine,type GasReview} from '../../lib/receipts4b';

const inputStyle={borderWidth:1,borderColor:palette.border,borderRadius:9,paddingHorizontal:12,paddingVertical:10,color:palette.text,backgroundColor:'#fff',fontSize:15} as const;
function Field({title,value,onChange,placeholder}:{title:string;value:string|null|undefined;onChange:(value:string)=>void;placeholder?:string}){
  return <View style={{gap:5}}><Text style={{fontWeight:'600',color:palette.text}}>{title}</Text>
    <TextInput style={inputStyle} value={value??''} placeholder={placeholder??''} placeholderTextColor="#899793" onChangeText={onChange} autoCapitalize="none" />
  </View>;
}
const nil=(value:string):string|null=>value.trim()?value.trim():null;
const defaultGas=():GasReview=>({fuelGradeId:null,rawFuelGrade:null,regularPricePerGallon:null,rewardDiscountPerGallon:null,paidPricePerGallon:null,gallons:null,totalPaid:null,priceSource:'unknown'});
export default function ReceiptDetail(){
  const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),api=useReceiptApi();
  const receiptId=typeof id==='string'&&/^[1-9]\d*$/.test(id)?id:'';
  const [ocr,setOcr]=useState<OcrStatus|null>(null),[review,setReview]=useState<ReviewState|null>(null);
  const [draft,setDraft]=useState<ReviewDraft|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[ack,setAck]=useState(false),[grades,setGrades]=useState<{id:string;name:string}[]>([]);
  const [search,setSearch]=useState(''),[matches,setMatches]=useState<{id:string;variantName:string;productId:string}[]>([]);
  const [searchBusy,setSearchBusy]=useState(false),[creating,setCreating]=useState(false);
  const [newProduct,setNewProduct]=useState(''),[newBrand,setNewBrand]=useState(''),[newVariant,setNewVariant]=useState('');
  const [matchingLine,setMatchingLine]=useState<number|null>(null),[saveNotice,setSaveNotice]=useState('');
  const alive=useRef(true),dirty=useRef(false);
  const load=useCallback(async()=>{
    if(!receiptId)return;
    try {
      const status=(await api<ApiEnvelope<OcrStatus>>(`/api/receipts/${receiptId}/ocr`)).data;
      if(!alive.current)return;
      setOcr(status);
      if((status.processingStatus==='needs_review'||status.processingStatus==='confirmed') && status.extraction?.data?.receiptType!=='utility'){
        const current=(await api<ApiEnvelope<ReviewState>>(`/api/receipts/${receiptId}/review`)).data;
        if(!alive.current)return;
        setReview(current);
        if(!dirty.current) setDraft(current.draft??(current.extraction?initialDraft(current.extraction):null));
      }
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not load receipt');}
  },[api,receiptId]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[load]);
  useEffect(()=>{
    if(!ocr||!['queued','running','processing'].includes(ocr.jobStatus??ocr.processingStatus))return;
    const handle=setInterval(()=>{void load();},3000);
    return()=>clearInterval(handle);
  },[ocr?.processingStatus,ocr?.jobStatus,load]);
  useEffect(()=>{
    void api<ApiEnvelope<Array<{id:string;name?:string;gradeName?:string}>>>('/api/gas/grades').then(r=>{
      const v=Array.isArray(r.data)?r.data:[];
      setGrades(v.map(x=>({id:String(x.id),name:String(x.name??x.gradeName??x.id)})));
    }).catch(()=>{});
  },[api]);
  const modify=(change:(d:ReviewDraft)=>ReviewDraft)=>{dirty.current=true;setSaveNotice('Unsaved changes');setAck(false);setDraft(prev=>prev?change(prev):prev);};
  const edit=(field:'purchasedOn'|'merchantId'|'grandTotal',v:string)=>modify(d=>({...d,[field]:nil(v)}));
  const updateLine=(position:number,field:keyof GroceryLine,value:string)=>modify(d=>({ ...d,
    items:d.items.map((row,i)=>i===position?{...row,[field]:field==='rawDescription'?value:nil(value)}:row),
  }));
  const updateGas=(field:keyof GasReview,value:string)=>modify(d=>({...d,gas:{...(d.gas??defaultGas()),[field]:field==='priceSource'?value:nil(value)} as GasReview}));
  const switchType=(next:'grocery'|'gas')=>modify(d=>({...d,receiptType:next,items:next==='grocery'?d.items:[],gas:next==='gas'?(d.gas??defaultGas()):null}));
  const findVariants=async()=>{
    setSearchBusy(true);setError('');
    try{
      const query=search.trim();
      const path=`/api/grocery/variants?limit=50&offset=0${query?`&search=${encodeURIComponent(query).replace(/[!'()*]/g, c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`:''}`;
      const result=await api<ApiEnvelope<Array<{id:string;variantName:string;productId:string}>>>(path);
      setMatches(result.data??[]);
    }catch(e){setError(e instanceof Error?e.message:'Product search failed');}
    finally{setSearchBusy(false);}
  };
  const createAndSelect=async()=>{
    if(matchingLine===null||creating)return;
    const name=newProduct.trim(),variantName=newVariant.trim()||name;
    if(!name||!variantName){setError('Enter a product name before creating it.');return;}
    setCreating(true);setError('');
    try{
      const product=(await api<ApiEnvelope<{id:string}>>('/api/grocery/products','POST',{canonicalName:name,brand:newBrand.trim()||null,categoryId:null})).data;
      const variant=(await api<ApiEnvelope<{id:string}>>('/api/grocery/variants','POST',
        {productId:product.id,variantName,packageQuantity:null,packageUnit:null,unitCount:null,productCode:null,comparisonGroup:null})).data;
      updateLine(matchingLine,'variantId',String(variant.id));
      setSaveNotice(`Created ${variantName} and linked it to item ${matchingLine+1}. Save the draft to persist this link.`);
      setMatchingLine(null);setMatches([]);setNewProduct('');setNewVariant('');setNewBrand('');
    }catch(e){setError(e instanceof Error?e.message:'Could not create product. Check your catalog before retrying; the product may have been created.');}
    finally{setCreating(false);}
  };
  const enqueue=async()=>{
    if(!receiptId||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      await api(`/api/receipts/${receiptId}/ocr`,'POST',{});
      setMessage('OCR queued. Keep the OCR worker running on your Mac.');await load();
    }catch(e){setError(e instanceof Error?e.message:'OCR could not start');}
    finally{setBusy(false);}
  };
  const save=async():Promise<ReviewState|null>=>{
    if(!draft||!review||!receiptId)return null;
    if(review.status!=='needs_review')throw new Error('Receipt is no longer reviewable');
    const result=(await api<ApiEnvelope<ReviewState>>(`/api/receipts/${receiptId}/review`,'PUT',
      {expectedRevision:review.revision,draft})).data;
    setReview(result);setDraft(result.draft);dirty.current=false;setAck(false);setSaveNotice('Saved to Railway. No purchase confirmed.');
    return result;
  };
  const saveOnly=async()=>{if(busy)return;setBusy(true);setError('');setSaveNotice('Saving...');try{await save();setMessage('Review draft saved. No purchase confirmed.');}catch(e){const msg=e instanceof Error?e.message:'Save failed';setError(msg);setSaveNotice(`Save failed: ${msg}`);}finally{setBusy(false);}};
  const confirm=async()=>{
    if(busy||!draft||!review||!receiptId||!ack)return;
    const issue=validateDraftLocally(draft);
    if(issue){setError(issue);return;}
    setBusy(true);setError('');setMessage('');
    try{
      // Save current values using optimistic revision safety before confirming.
      const latest=await save();
      if(!latest?.revision)throw new Error('Save review first');
      await api(`/api/receipts/${receiptId}/review/confirm`,'POST', {expectedRevision:latest.revision,acknowledged:true});
      setAck(false);dirty.current=false;
      setMessage('Purchase confirmed once. It now appears in your price history.');
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:'Confirmation failed. Reload review before trying again.');
      if(e instanceof Error && /stale|modified|409/i.test(e.message))await load();
    }finally{setBusy(false);}
  };
  const pending=ocr?.processingStatus==='processing'||ocr?.jobStatus==='running'||ocr?.jobStatus==='queued';
  return <Page title={`Receipt #${receiptId}`} subtitle="Review every value before saving a confirmed purchase.">
    <Panel><Action label="← Back to receipts" onPress={()=>router.back()}/>
      <Muted>OCR: {ocr?.processingStatus??'Loading'} {ocr?.jobStatus?`(${ocr.jobStatus})`:''}</Muted>
      {busy||pending?<Loading/>:null}
      {ocr?.processingStatus==='uploaded'||ocr?.processingStatus==='failed'?<Action label="Start / retry OCR" disabled={busy} onPress={()=>void enqueue()}/>:null}
      {ocr?.processingStatus==='failed'?<Muted>OCR failed. Check the API worker logs before retrying.</Muted>:null}
      {message?<Text style={{color:palette.green}}>{message}</Text>:null}
      {error?<Text style={{color:'#B42318'}}>{error}</Text>:null}
    </Panel>
    {receiptId?<ReceiptImagePreview receiptId={receiptId}/>:null}
    {review?.extraction?.data?.reviewWarnings?.length?<Panel>
      <Text style={{fontWeight:'700',color:palette.text}}>OCR warnings</Text>
      {review.extraction.data.reviewWarnings.map((w,i)=><Muted key={i}>{w}</Muted>)}
    </Panel>:null}
    {ocr?.extraction?.data?.receiptType==='utility'?<Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Utility statement — OCR suggestions</Text>
      <Muted>These values are unverified. Check the original statement, then add a bill in Utilities. No expense or purchase is created by OCR.</Muted>
      {([['Category','category'],['Provider','providerName'],['Billing start','serviceStart'],['Billing end','serviceEnd'],['Due date','dueDate'],['Total due','totalAmount'],['Usage','usageAmount'],['Usage unit','usageUnit'],['Rate per unit','ratePerUnit']] as const).map(([label,key])=><View key={key} style={{gap:3,paddingVertical:5}}><Text style={{fontWeight:'600',color:palette.text}}>{label}: {ocr?.extraction?.data?.utility?.[key]?.value??'Not detected'}</Text></View>)}
      {ocr.extraction.data.utility?.reviewWarnings.map((w,i)=><Muted key={i}>{w}</Muted>)}
      <Action label="Review OCR in Utilities (prefill draft)" onPress={()=>router.push({pathname:'/(tabs)/utilities',params:{sourceReceiptId:receiptId}})}/>
    </Panel>:null}
    {draft&&review?.status==='needs_review'?<>
      <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Receipt details</Text>
        <Muted>OCR suggestions are unverified. Check the receipt image before saving.</Muted>
        <View style={{flexDirection:'row',gap:9}}>
          {(['grocery','gas'] as const).map(kind=><Pressable key={kind} onPress={()=>switchType(kind)} style={{padding:12,borderRadius:8,backgroundColor:draft.receiptType===kind?palette.green:palette.accent}}>
            <Text style={{color:draft.receiptType===kind?'#fff':palette.text}}>{kind==='gas'?'Gas':'Grocery'}</Text>
          </Pressable>)}
        </View>
        <Field title="Date (YYYY-MM-DD)" value={draft.purchasedOn} onChange={v=>edit('purchasedOn',v)}/>
        <Field title="Grand total" value={draft.grandTotal} onChange={v=>edit('grandTotal',v)} placeholder="0.00"/>
        <Field title="Merchant ID (optional, must belong to you)" value={draft.merchantId} onChange={v=>edit('merchantId',v)} placeholder="Leave blank if unknown"/>
        {review.extraction?.data.merchant?.value?<Muted>OCR merchant suggestion: {review.extraction.data.merchant.value}</Muted>:null}
      </Panel>
      {draft.receiptType==='grocery'?<Panel>
        <Text style={{fontWeight:'700',color:palette.text,fontSize:18}}>Grocery line items</Text>
        <Muted>Select an existing product variant or create a new one. Confirm only after checking the receipt.</Muted>
        {draft.items.map((line,i)=><View key={i} style={{gap:8,borderBottomWidth:1,borderColor:palette.border,paddingBottom:15}}>
          <Text style={{fontWeight:'700',color:palette.text}}>Item {i+1}</Text>
          <Field title="Description" value={line.rawDescription} onChange={v=>updateLine(i,'rawDescription',v)}/>
          <Text style={{color:palette.muted}}>Linked variant: {line.variantId ? `#${line.variantId}` : 'Not linked'}</Text>
          <Action label={line.variantId?'Change product':'Find or create product'} disabled={busy} onPress={()=>{setMatchingLine(i);setSearch(line.rawDescription);setMatches([]);setError('');setNewProduct(line.rawDescription);}}/>
          <Field title="Quantity" value={line.quantityPurchased} onChange={v=>updateLine(i,'quantityPurchased',v)} placeholder="1"/>
          <Field title="Net line total" value={line.netLineTotal} onChange={v=>updateLine(i,'netLineTotal',v)} placeholder="0.00"/>
          <Field title="Listed unit price (optional)" value={line.listedUnitPrice} onChange={v=>updateLine(i,'listedUnitPrice',v)}/>
          <Field title="Measurement unit (optional)" value={line.measurementUnit} onChange={v=>updateLine(i,'measurementUnit',v)}/>
          <Field title="Measured amount (optional)" value={line.measuredAmount} onChange={v=>updateLine(i,'measuredAmount',v)}/>
          <Field title="Gross total (optional)" value={line.grossLineTotal} onChange={v=>updateLine(i,'grossLineTotal',v)}/>
          <Action label="Remove item" onPress={()=>modify(d=>({...d,items:d.items.filter((_,j)=>j!==i)}))}/>
        </View>)}
        {matchingLine!==null?<View style={{borderWidth:1,borderColor:palette.border,borderRadius:12,padding:12,gap:9}}>
          <Text style={{fontWeight:'700',color:palette.text}}>Select product for item {matchingLine+1}</Text>
          <Field title="Search your product variants" value={search} onChange={setSearch} placeholder="Eggs, milk, brand..."/>
          <Action label={searchBusy?'Searching...':'Search products'} disabled={searchBusy||creating} onPress={()=>void findVariants()}/>
          {matches.map(item=><Pressable key={item.id} accessibilityRole="button" onPress={()=>{updateLine(matchingLine,'variantId',String(item.id));setMatchingLine(null);setMatches([]);}} style={{padding:12,borderWidth:1,borderRadius:8,borderColor:palette.border}}>
            <Text style={{color:palette.text,fontWeight:'600'}}>{item.variantName}</Text>
            <Muted>Choose this product</Muted>
          </Pressable>)}
          <Text style={{fontWeight:'700',color:palette.text}}>Create a product if none matches</Text>
          <Field title="Product name" value={newProduct} onChange={setNewProduct} placeholder="Eggs"/>
          <Field title="Brand (optional)" value={newBrand} onChange={setNewBrand}/>
          <Field title="Variant / size name (optional)" value={newVariant} onChange={setNewVariant} placeholder="12-count carton"/>
          <Action label={creating?'Creating...':'Create product and link item'} disabled={creating||busy} onPress={()=>void createAndSelect()}/>
          <Action label="Close product selector" onPress={()=>setMatchingLine(null)}/>
          <Muted>A new product is saved to your personal catalog immediately; the receipt remains unconfirmed.</Muted>
        </View>:null}
        <Action label="Add grocery item" onPress={()=>modify(d=>({...d,items:[...d.items,{rawDescription:'',variantId:null,quantityPurchased:null,measurementUnit:null,measuredAmount:null,listedUnitPrice:null,grossLineTotal:null,netLineTotal:null}]}))}/>
      </Panel>:<Panel>
        <Text style={{fontWeight:'700',color:palette.text,fontSize:18}}>Gas details</Text>
        <Muted>Verify before-rewards price from the pump or receipt. Never infer it from the discounted price.</Muted>
        {grades.length?<Muted>Available grades: {grades.map(g=>`${g.name} (ID ${g.id})`).join(', ')}</Muted>:null}
        <Field title="Fuel grade ID" value={draft.gas?.fuelGradeId} onChange={v=>updateGas('fuelGradeId',v)}/>
        <Field title="Raw grade (optional)" value={draft.gas?.rawFuelGrade} onChange={v=>updateGas('rawFuelGrade',v)}/>
        <Field title="Before-rewards price per gallon" value={draft.gas?.regularPricePerGallon} onChange={v=>updateGas('regularPricePerGallon',v)}/>
        <Field title="Rewards discount per gallon (optional)" value={draft.gas?.rewardDiscountPerGallon} onChange={v=>updateGas('rewardDiscountPerGallon',v)}/>
        <Field title="Paid price per gallon" value={draft.gas?.paidPricePerGallon} onChange={v=>updateGas('paidPricePerGallon',v)}/>
        <Field title="Gallons" value={draft.gas?.gallons} onChange={v=>updateGas('gallons',v)}/>
        <Field title="Total paid" value={draft.gas?.totalPaid} onChange={v=>updateGas('totalPaid',v)}/>
        <Text style={{color:palette.text,fontWeight:'700'}}>Before-rewards price verification source</Text>
        {(['unknown','printed','confirmed'] as const).map(value=><Pressable key={value} accessibilityRole="radio" onPress={()=>updateGas('priceSource',value)}
          style={{padding:10,borderRadius:8,backgroundColor:draft.gas?.priceSource===value?palette.accent:'#fff'}}>
          <Text style={{color:palette.text}}>{draft.gas?.priceSource===value?'◉':'○'} {value==='printed'?'Printed on receipt':value==='confirmed'?'Manually verified':'Not verified'}</Text>
        </Pressable>)}
      </Panel>}
      <Panel>
        <Action label={busy?'Working...':'Save review draft (no purchase)'} disabled={busy} onPress={()=>void saveOnly()}/>
        {saveNotice?<Text accessibilityRole="alert" style={{color:saveNotice.startsWith('Save failed')?'#B42318':palette.green,fontWeight:'600'}}>{saveNotice}</Text>:null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:ack}} onPress={()=>setAck(v=>!v)} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10}}>
          <Text style={{fontSize:23,color:palette.green}}>{ack?'☑':'☐'}</Text>
          <Text style={{color:palette.text,flex:1}}>I have checked the date, totals, line items and prices against my receipt. Confirm this purchase.</Text>
        </Pressable>
        <Action label="Confirm purchase once" disabled={busy||!ack||matchingLine!==null} onPress={()=>void confirm()}/>
        <Muted>Confirmation creates a real purchase record. Duplicate confirmation is blocked by the API.</Muted>
      </Panel>
    </>:null}
    {review?.status==='confirmed'?<Panel><Text style={{color:palette.green,fontWeight:'700'}}>Confirmed purchase — read only</Text><Muted>Receipt confirmation cannot be repeated.</Muted></Panel>:null}
    <Panel><Action label="Refresh status and review" disabled={busy} onPress={()=>{dirty.current=false;void load();}}/></Panel>
  </Page>;
}
