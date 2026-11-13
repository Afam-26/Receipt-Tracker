#!/usr/bin/env python3
# Apply utility OCR-assisted review prefill to a known Stage-1 receipt tracker layout.
# Checks all markers before writing. No database/schema changes. Can rerun safely.
from pathlib import Path
root=Path(__file__).resolve().parents[1]
receipt=root/'apps/mobile/src/app/receipt/[id].tsx'
utilities=root/'apps/mobile/src/app/(tabs)/utilities.tsx'
mapper=root/'apps/mobile/src/lib/utility-prefill.ts'
if not all(p.exists() for p in (receipt,utilities,mapper)):
    raise SystemExit('STOP: Stage 1 or stage 2 source files missing. Run from repo root after extracting ZIP.')
r=receipt.read_text();u=utilities.read_text()
if 'sourceReceiptId:receiptId' in r and 'makeUtilityPrefill' in u:
    print('Already applied, no changes required.');raise SystemExit(0)
def inject(source,old,new,desc):
    n=source.count(old)
    if n!=1:raise SystemExit(f'STOP: {desc} expected once, found {n}. No files modified.')
    return source.replace(old,new,1)
# On receipt detail keep navigation simple, pass only numeric source id to Utilities; no sensitive OCR content in route URL.
old='''<Action label="Open Utilities to enter and verify bill" onPress={()=>router.push('/(tabs)/utilities')}/>'''
new='''<Action label="Review OCR in Utilities (prefill draft)" onPress={()=>router.push({pathname:'/(tabs)/utilities',params:{sourceReceiptId:receiptId}})}/>'''
r=inject(r,old,new,'utility review action')
u=inject(u,"import React, {useCallback,useEffect,useMemo,useState} from 'react';", "import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';",'React import')
u=inject(u,"import * as Crypto from 'expo-crypto';", "import * as Crypto from 'expo-crypto';\nimport {useLocalSearchParams} from 'expo-router';\nimport {makeUtilityPrefill, type UtilityOcrSuggestions} from '../../lib/utility-prefill';",'utility imports')
u=inject(u,'''export default function Utilities(){
  const api=useReceiptApi();''','''export default function Utilities(){
  const api=useReceiptApi();
  const {sourceReceiptId}=useLocalSearchParams<{sourceReceiptId?:string}>();
  const loadedRef=useRef<string>('');
  const [sourceNotice,setSourceNotice]=useState('');''','utility page hook')
anchor='''  const [from,setFrom]=useState(''),[to,setTo]=useState('');'''
insert='''  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  // Fetch private OCR results by numeric receipt ID with the existing Clerk-authenticated API.
  // Never save, link, or confirm anything automatically. Preserve user edits after first load.
  useEffect(()=>{
    const rid=typeof sourceReceiptId==='string' && /^[1-9]\\d{0,18}$/.test(sourceReceiptId)?sourceReceiptId:'';
    if(!rid || loadedRef.current===rid)return;
    loadedRef.current=rid;
    let cancelled=false;
    setSourceNotice(`Loading OCR suggestions for receipt #${rid}…`);
    void api<ApiEnvelope<{extraction:{data:{receiptType:string;utility?:UtilityOcrSuggestions|null}}|null}>>(`/api/receipts/${rid}/ocr`).then(result=>{
      if(cancelled)return;
      const extraction=result.data.extraction?.data;
      if(extraction?.receiptType!=='utility'){
        setSourceNotice('No completed utility OCR extraction for this receipt. You can still enter bill details manually.');return;
      }
      const suggestions=makeUtilityPrefill(extraction.utility);
      if(Object.keys(suggestions).length===0){
        setSourceNotice(`Receipt #${rid}: OCR found no usable bill fields. Enter information manually using the original image.`);
        setShowForm(true);return;
      }
      setForm(old=>({...old,...suggestions}));setShowForm(true);
      setSourceNotice(`Receipt #${rid}: OCR suggestions filled the form. Verify every value against the original statement before saving. Nothing has been saved or confirmed.`);
    }).catch(e=>{if(!cancelled)setSourceNotice(e instanceof Error?e.message:'OCR suggestions unavailable.');});
    return()=>{cancelled=true;};
  },[api,sourceReceiptId]);'''
u=inject(u,anchor,insert,'receipt OCR loading effect')
u=inject(u,'''    {error?<Panel><Text style={{color:'#9e342e'}}>{error}</Text></Panel>:null}''','''    {sourceNotice?<Panel><Text style={{color:palette.text}}>{sourceNotice}</Text><Muted>OCR values are unverified and may be wrong. Check the original document before saving a draft.</Muted></Panel>:null}
    {error?<Panel><Text style={{color:'#9e342e'}}>{error}</Text></Panel>:null}''','OCR notice')
u=inject(u,'<Action label="Save utility bill draft (no confirmation)" disabled={busy} onPress={()=>void save()}/>','''<Muted>Saving creates a draft only. The scanned statement is not automatically linked to the bill in this stage.</Muted>
        <Action label="Save utility bill draft (no confirmation)" disabled={busy} onPress={()=>void save()}/>''','save disclaimer')
u=inject(u,'<Panel><Muted>Utility amounts are entered by you and are never automatically inferred. Private utility statement uploads and utility-specific OCR still need integration with the existing Railway storage/worker. CSV export is available through the authenticated API endpoint once connected to a mobile download control.</Muted></Panel>', '<Panel><Muted>OCR suggestions can prefill a new bill draft after you review a private utility statement. No bill is saved or confirmed automatically. The original image is not yet linked to saved utility bills. CSV export remains available through the authenticated API.</Muted></Panel>','footer description')
receipt.write_text(r);utilities.write_text(u)
print('PASS: Applied utility OCR-to-review prefill. No database changes or automatic confirmations.')
