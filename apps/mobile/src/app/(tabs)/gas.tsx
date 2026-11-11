import React,{useCallback,useEffect,useState} from 'react';
import {Text} from 'react-native';
import {Page,Panel,Muted,Action,Loading,palette} from '../../components/ui';
import {useAuthedGet} from '../../lib/hooks';
function gradesOf(raw:unknown):Array<Record<string,unknown>>{
 const r=raw as {grades?:unknown;data?:unknown}|null;
 return Array.isArray(r?.grades)?r.grades:Array.isArray(r?.data)?r.data:Array.isArray(raw)?raw:[];
}
export default function Gas(){const get=useAuthedGet();const [grades,setGrades]=useState<Array<Record<string,unknown>>>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{setGrades(gradesOf(await get('/api/gas/grades')))}catch(e){setError(e instanceof Error?e.message:'Unable to load fuel grades')}finally{setBusy(false)}},[get]);useEffect(()=>{void refresh()},[refresh]);
 return <Page title="Gas prices" subtitle="Track each fuel grade separately and always compare before-rewards prices.">
 <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Fuel assumptions</Text><Muted>Fill-up assumptions and monthly or annual impact controls are planned for Phase 4B.</Muted></Panel>
 <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Price increase rankings</Text><Muted>Confirmed purchases only.</Muted></Panel>
 <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>All recorded gas entries</Text>{busy?<Loading/>:error?<Muted>{error}</Muted>:<Muted>Available fuel grades: {grades.map(g=>String(g.canonicalName??g.canonical_name)).join(', ')||'None yet'}</Muted>}</Panel>
 <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>All gas purchases</Text><Muted>Complete purchase list arrives in Phase 4B.</Muted><Action label="Refresh fuel grades" onPress={()=>void refresh()}/></Panel>
 </Page>;
}
