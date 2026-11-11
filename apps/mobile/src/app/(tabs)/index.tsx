import React,{useCallback,useEffect,useState} from 'react';
import {Text} from 'react-native';
import {Page,Panel,Muted,Action,Loading,palette} from '../../components/ui';
import {useAuthedGet} from '../../lib/hooks';

type Me={ok:boolean;user:{id:string;email:string|null}};
export default function Home(){
 const get=useAuthedGet(); const [me,setMe]=useState<Me|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{setMe(await get<Me>('/api/me'))}catch(e){setError(e instanceof Error?e.message:'Unable to reach the API')}finally{setLoading(false)}},[get]);
 useEffect(()=>{void refresh()},[refresh]);
 return <Page title="Your price dashboard" subtitle="Your receipts and savings, in one place.">
  <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Account connection</Text>
  {loading?<Loading/>:me?<Muted>Signed in as {me.user.email??'Clerk user'} · Local account #{me.user.id}</Muted>:<Muted>{error}</Muted>}
  <Action label="Refresh connection" onPress={()=>void refresh()}/></Panel>
  <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Grocery price trends</Text><Muted>Confirmed purchase history will appear here once you've reviewed receipts.</Muted></Panel>
  <Panel><Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Gas price impact</Text><Muted>Compare fuel prices before rewards, keeping Regular, Plus and Super separate.</Muted></Panel>
 </Page>
}
