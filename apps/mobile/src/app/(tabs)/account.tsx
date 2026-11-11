import React,{useEffect,useState} from 'react';
import {useAuth,useUser} from '@clerk/expo';
import {Page,Panel,Action,Muted,Loading} from '../../components/ui';
import {identifyRevenueCatUser,clearRevenueCatUiOnSignOut} from '../../lib/revenuecat';
export default function Account(){const {user}=useUser();const {signOut}=useAuth();const [status,setStatus]=useState('Checking subscription SDK…');const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;setReady(false);setStatus('Checking subscription SDK…');if(!user?.id){setStatus('Sign in required');return}
 void identifyRevenueCatUser(user.id).then(result=>{if(active){setStatus(result.ready?(result.active?'Premium entitlement active in RevenueCat (UI preview only)':'No active Premium entitlement'):(result.message??'Not configured'));setReady(true)}}).catch(()=>{if(active){setStatus('RevenueCat unavailable. Retry later.');setReady(true)}});return()=>{active=false}},[user?.id]);
 return <Page title="Account" subtitle="Clerk identity and subscription settings.">
 <Panel><Muted>{user?.primaryEmailAddress?.emailAddress??'Signed in securely'}</Muted></Panel>
 <Panel><Muted>Subscription: Monthly or Annual Premium</Muted><Muted>7-day free trial is planned; configure trial eligibility in Apple/Google before launch.</Muted>{!ready?<Loading/>:<Muted>{status}</Muted>}<Muted>No purchases are enabled in Phase 4A. The backend does not yet use this SDK state to authorize premium operations.</Muted></Panel>
 <Panel><Action label="Sign out" onPress={()=>{clearRevenueCatUiOnSignOut();void signOut()}}/></Panel>
 </Page>;
}
