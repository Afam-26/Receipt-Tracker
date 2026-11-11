import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { Loading, palette } from '../../components/ui';

export default function TabLayout(){
  const {isLoaded,isSignedIn}=useAuth();
  if(!isLoaded)return <Loading/>;
  if(!isSignedIn)return <Redirect href="/"/>;
  return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:palette.green,tabBarStyle:{height:76,paddingBottom:15,paddingTop:6}}}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="grocery" options={{title:'Grocery'}}/>
    <Tabs.Screen name="gas" options={{title:'Gas'}}/>
    <Tabs.Screen name="receipts" options={{title:'Receipts'}}/>
    <Tabs.Screen name="account" options={{title:'Account'}}/>
  </Tabs>;
}
