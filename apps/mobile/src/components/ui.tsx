import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
export const palette = { bg:'#F5F7F7', surface:'#FFFFFF', text:'#172B2A', muted:'#637572', green:'#186C56', border:'#DEE7E4', accent:'#E8F5EF' };
export function Page({children, title, subtitle}:{children:React.ReactNode;title:string;subtitle?:string}) {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text>:null}{children}
  </ScrollView>;
}
export function Panel({children}:{children:React.ReactNode}){return <View style={styles.panel}>{children}</View>}
export function Action({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:.5}]}><Text style={styles.buttonLabel}>{label}</Text></Pressable>}
export function Muted({children}:{children:React.ReactNode}){return <Text style={styles.muted}>{children}</Text>}
export function Loading(){return <View style={{padding:24}}><ActivityIndicator color={palette.green}/></View>}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:palette.bg},content:{padding:22,paddingTop:58,paddingBottom:80,gap:14},title:{fontSize:29,fontWeight:'800',color:palette.text},subtitle:{fontSize:15,lineHeight:22,color:palette.muted,marginBottom:6},panel:{padding:18,backgroundColor:palette.surface,borderRadius:16,borderWidth:1,borderColor:palette.border,gap:10},button:{backgroundColor:palette.green,borderRadius:11,paddingVertical:14,paddingHorizontal:18,alignItems:'center'},buttonLabel:{color:'#FFF',fontWeight:'700'},muted:{color:palette.muted,fontSize:14,lineHeight:20}})
