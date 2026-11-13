import React, {useCallback, useEffect, useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {useRouter} from 'expo-router';
import {Page, Panel, Muted, Action, Loading, palette} from '../../components/ui';
import {useReceiptApi, useUploadReceipt, type ApiEnvelope, type ReceiptMeta} from '../../lib/receipts4b';

export default function Receipts(){
  const api=useReceiptApi(), upload=useUploadReceipt(), router=useRouter();
  const [receipts,setReceipts]=useState<ReceiptMeta[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [kind,setKind]=useState<'grocery'|'gas'|'unknown'|'utility'>('unknown');
  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try {const result=await api<ApiEnvelope<ReceiptMeta[]>>('/api/receipts?limit=50&offset=0');setReceipts(result.data??[]);}
    catch(e){setError(e instanceof Error?e.message:'Unable to load receipts');}
    finally{setBusy(false);}
  },[api]);
  useEffect(()=>{void refresh();},[refresh]);
  const capture=async (camera:boolean)=>{
    if(busy)return;
    try{
      if(camera && Platform.OS === 'web') throw new Error('Use the photo library on web; camera capture is available on iOS and Android.');
      const permission=camera?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted)throw new Error('Photo permission denied. Allow access in Settings and try again.');
      const result=camera
        ?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85,allowsEditing:false,exif:false})
        :await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.85,allowsEditing:false,exif:false});
      if(result.canceled||!result.assets?.length)return;
      setBusy(true);setError('');
      const {receiptId}=await upload(result.assets[0],kind);
      // OCR is queued from the detail screen; navigate to the newly uploaded receipt.
      router.push({pathname:'/receipt/[id]',params:{id:receiptId}});
    }catch(e){setError(e instanceof Error?e.message:'Could not capture receipt');}
    finally{setBusy(false);}
  };
  const open=(id:string)=>router.push({pathname:'/receipt/[id]',params:{id}});
  return <Page title="Receipts" subtitle="Capture grocery, gas and utility bills in one place. Review all extracted values before confirmation.">
    <Panel>
      <Text style={{fontWeight:'700',fontSize:17,color:palette.text}}>New receipt</Text>
      <Muted>Choose what you are adding</Muted>
      <View style={{flexDirection:'row',gap:9,flexWrap:'wrap'}}>
        {([
          {id:'grocery',label:'Grocery',symbol:'🛒'},
          {id:'gas',label:'Gas',symbol:'⛽'},
          {id:'utility',label:'Utility',symbol:'🏠'},
          {id:'unknown',label:'Detect later',symbol:'📄'},
        ] as const).map(option=><Pressable key={option.id} accessibilityRole="radio" accessibilityState={{selected:kind===option.id}}
          onPress={()=>{setKind(option.id);setError('');}} style={{minWidth:'45%',flexGrow:1,padding:14,borderRadius:13,borderWidth:1.5,borderColor:kind===option.id?palette.green:palette.border,backgroundColor:kind===option.id?palette.green:'#fff',gap:5}}>
          <Text style={{fontSize:23}}>{option.symbol}</Text>
          <Text style={{fontWeight:'700',fontSize:16,color:kind===option.id?'#fff':palette.text}}>{option.label}</Text>
          <Text style={{fontSize:12,color:kind===option.id?'#d9f1e8':palette.text}}>{option.id==='grocery'?'Items and prices':option.id==='gas'?'Fuel and rewards':option.id==='utility'?'Household bills':'Classify after OCR'}</Text>
        </Pressable>)}
      </View>
      {<>
        <Action label="Take receipt photo" disabled={busy} onPress={()=>void capture(true)}/>
        <Action label="Choose from photo library" disabled={busy} onPress={()=>void capture(false)}/>
        <Muted>JPEG/PNG/WebP up to 10 MB. Uploaded images are private. OCR suggestions require your review.</Muted>
      </>}
    </Panel>
    <Panel>
      <Text style={{fontWeight:'700',fontSize:17,color:palette.text}}>Your recent receipts</Text>
      {busy?<Loading/>:<Muted>{error||`${receipts.length} receipt(s) loaded`}</Muted>}
      {receipts.map(r=><Pressable key={r.id} accessibilityRole="button" onPress={()=>open(r.id)}
        style={{borderWidth:1,borderColor:palette.border,borderRadius:11,padding:13,gap:4}}>
        <Text style={{fontWeight:'700',color:palette.text}}>Receipt #{r.id} · {r.receiptType}</Text>
        <Muted>{r.processingStatus} · {r.files?.[0]?.originalFilename??'Uploaded receipt'}</Muted>
        <Text style={{color:palette.green}}>Open / review →</Text>
      </Pressable>)}
      <Action label="Refresh receipts" disabled={busy} onPress={()=>void refresh()}/>
    </Panel>
    {error? <Muted>{error}</Muted>:null}
  </Page>;
}
