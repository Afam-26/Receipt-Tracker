import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { Loading, palette } from '../../components/ui';

const icons = {
  index: ['home-outline','home'],
  grocery: ['basket-outline','basket'],
  gas: ['car-outline','car'],
  utilities: ['flash-outline','flash'],
  receipts: ['receipt-outline','receipt'],
  account: ['person-circle-outline','person-circle'],
} as const;

type TabKey = keyof typeof icons;
function screen(name:TabKey,title:string){
  return <Tabs.Screen key={name} name={name} options={{
    title,
    tabBarIcon:({focused,color,size}) => <Ionicons
      name={icons[name][focused?1:0]}
      size={Math.min(size,23)} color={typeof color === "string" ? color : "#64748b"}/>,
  }}/>;
}
export default function TabLayout(){
  const {isLoaded,isSignedIn}=useAuth();
  if(!isLoaded)return <Loading/>;
  if(!isSignedIn)return <Redirect href="/"/>;
  return <Tabs screenOptions={{
    headerShown:false,tabBarActiveTintColor:palette.green,
    tabBarStyle:{height:79,paddingBottom:13,paddingTop:6},
    tabBarLabelStyle:{fontSize:10},
  }}>
    {screen('index','Home')}
    {screen('grocery','Grocery')}
    {screen('gas','Gas')}
    {screen('utilities','Utilities')}
    {screen('receipts','Receipts')}
    {screen('account','Account')}
  </Tabs>;
}
