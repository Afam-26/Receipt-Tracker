import React,{useCallback,useEffect,useState} from 'react';
import {Text} from 'react-native';
import {Page,Panel,Muted,Action,Loading,palette} from '../../components/ui';
import {useAuthedGet} from '../../lib/hooks';
export default function Receipts(){const get=useAuthedGet();const [count,setCount]=useState<number|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{const r=await get<{receipts?:unknown;data?:unknown}>('/api/receipts?limit=20&offset=0');setCount(Array.isArray(r.receipts)?r.receipts.length:Array.isArray(r.data)?r.data.length:0)}catch(e){setError(e instanceof Error?e.message:'Unable to load receipts')}finally{setBusy(false)}},[get]);useEffect(()=>{void refresh()},[refresh]);
 return <Page title="Receipts" subtitle="Securely stored in your private Railway bucket."><Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Your recent receipts</Text>{busy?<Loading/>:<Muted>{error||`${count??0} receipt(s) in the current page`}</Muted>}<Action label="Refresh receipts" onPress={()=>void refresh()}/></Panel><Panel><Muted>Camera upload, OCR progress, review, and confirmation UI will be added in Phase 4B. Uploaded values are never auto-confirmed.</Muted></Panel></Page>
}
