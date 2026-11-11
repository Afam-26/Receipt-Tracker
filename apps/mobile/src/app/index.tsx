import React, {useEffect, useState} from 'react';
import { useAuth } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Page, Panel, Action, Muted, Loading } from '../components/ui';

export default function Welcome(){
  const {isLoaded,isSignedIn}=useAuth();
  const {startHostedAuth}=useHostedAuth();
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  useEffect(()=>{if(isLoaded&&isSignedIn)router.replace('/(tabs)')},[isLoaded,isSignedIn]);
  const open=async(mode:'sign-in'|'sign-up')=>{setError('');setBusy(true);try{await startHostedAuth({mode})}catch{setError('Unable to open sign-in. Check your Clerk Native API setup.')}finally{setBusy(false)}};
  if(!isLoaded||isSignedIn)return <View style={{flex:1,justifyContent:'center'}}><Loading/></View>;
  return <Page title="Receipt Price Tracker" subtitle="Know what you paid, spot price changes, and keep your grocery and gas receipts together.">
    <Panel><Muted>Welcome. Sign in securely with Clerk to access your private receipt history.</Muted>
      <Action label={busy?'Opening…':'Sign in'} disabled={busy} onPress={()=>void open('sign-in')}/>
      <Action label="Create account" disabled={busy} onPress={()=>void open('sign-up')}/>
      {error?<Muted>{error}</Muted>:null}
    </Panel>
    <Panel><Muted>Premium is planned with monthly and annual plans and a 7-day free trial. No payments are taken in this development build.</Muted></Panel>
  </Page>;
}
