import React, {useEffect, useRef, useState} from 'react';
import {Image, Platform, Text, View} from 'react-native';
import {useAuth} from '@clerk/expo';
import {File, Paths} from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
import {Action, Muted, Panel, palette} from './ui';
import {useReceiptApi, type ApiEnvelope, type ReceiptMeta} from '../lib/receipts4b';
import {mobileConfig, validateApiBase} from '../lib/config';

// Never expose private receipt storage URLs or tokens in rendered image URLs.
// Download through the owner-checked backend with a short-lived Clerk token.
export function ReceiptImagePreview({receiptId}:{receiptId:string}){
  const api=useReceiptApi();
  const {getToken}=useAuth();
  const tokenRef=useRef(getToken);
  useEffect(()=>{tokenRef.current=getToken;},[getToken]);
  const [imageUri,setImageUri]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const cached=useRef<File|null>(null);
  useEffect(()=>()=>{try{cached.current?.delete();}catch{/* cache cleanup only */}},[]);
  const load=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      if(Platform.OS==='web') throw new Error('Image preview is currently available in the iOS and Android app.');
      const meta=(await api<ApiEnvelope<ReceiptMeta>>(`/api/receipts/${receiptId}`)).data;
      const item=meta.files?.find(f=>/^image\/(jpeg|png|webp)$/i.test(f.mimeType));
      if(!item)throw new Error('No previewable image file is attached to this receipt.');
      const token=await tokenRef.current();
      if(!token)throw new Error('Sign in to preview your private receipt.');
      const path=`/api/receipts/${receiptId}/files/${item.id}/download`;
      const res=await expoFetch(`${validateApiBase(mobileConfig.apiBase)}${path}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!res.ok)throw new Error(`Receipt image unavailable (${res.status}).`);
      const filename=`receipt-preview-${receiptId}-${item.id}.${item.mimeType==='image/png'?'png':item.mimeType==='image/webp'?'webp':'jpg'}`;
      const next=new File(Paths.cache,filename);
      if(next.exists)next.delete();
      await next.write(await res.bytes());
      const old=cached.current;
      cached.current=next;
      setImageUri(next.uri);
      if(old&&old.uri!==next.uri){try{old.delete();}catch{/* cache cleanup only */}}
    }catch(e){setError(e instanceof Error?e.message:'Unable to preview receipt');}
    finally{setBusy(false);}
  };
  return <Panel>
    <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Original receipt</Text>
    <Muted>Open the privately stored image to verify OCR suggestions. It is not publicly accessible.</Muted>
    <Action label={busy?'Loading...':imageUri?'Reload receipt image':'View receipt image'} disabled={busy} onPress={()=>void load()}/>
    {error?<Text style={{color:'#B42318'}}>{error}</Text>:null}
    {imageUri?<Image source={{uri:imageUri}} resizeMode="contain" style={{width:'100%',height:360,backgroundColor:'#F4F4F4',borderRadius:10}}/>:null}
  </Panel>;
}
