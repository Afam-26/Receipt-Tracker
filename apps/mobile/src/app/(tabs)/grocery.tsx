import React,{useCallback,useEffect,useState} from 'react';
import {Text} from 'react-native';
import {Page,Panel,Action,Muted,Loading,palette} from '../../components/ui';
import {useAuthedGet} from '../../lib/hooks';
function getProducts(result:unknown):Array<Record<string,unknown>>{
 const r=result as {products?:unknown;data?:unknown}|null;
 if(Array.isArray(r?.products))return r.products;
 if(Array.isArray(r?.data))return r.data;
 return [];
}
export default function Grocery(){
 const get=useAuthedGet();const [items,setItems]=useState<Array<Record<string,unknown>>>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{setItems(getProducts(await get('/api/grocery/products?limit=20&offset=0')))}catch(e){setError(e instanceof Error?e.message:'Unable to retrieve grocery products')}finally{setLoading(false)}},[get]);
 useEffect(()=>{void refresh()},[refresh]);
 return <Page title="Grocery" subtitle="Your personal product catalog and price tracking.">
 <Panel>{loading?<Loading/>:error?<Muted>{error}</Muted>:items.length===0?<Muted>No saved grocery products yet. Receipt scanning and editing screens arrive in Phase 4B.</Muted>:items.map((x,i)=><Text key={String(x.id??i)} style={{color:palette.text,paddingVertical:6}}>{String(x.canonicalName??x.canonical_name??'Unnamed product')}</Text>)}<Action label="Refresh groceries" onPress={()=>void refresh()}/></Panel>
 </Page>
}
