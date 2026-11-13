#!/usr/bin/env python3
"""Guarded patch for Stage 2 utilities. Checks all exact markers before writing."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
paths = {
 'validation':root/'services/api/src/utilities/validation.ts',
 'routes':root/'services/api/src/utilities/routes.ts',
 'mobile':root/'apps/mobile/src/app/(tabs)/utilities.tsx',
}
contents={k:p.read_text() for k,p in paths.items()}
if 'SOURCE_LINK_STAGE3' in contents['routes'] and 'SOURCE_LINK_STAGE3' in contents['mobile']:
 print('Already applied, no files changed.');raise SystemExit(0)
def change(kind,old,new,description):
 s=contents[kind]
 count=s.count(old)
 if count != 1: raise SystemExit(f'STOP: {description}: expected exactly one marker, found {count}. No files changed.')
 contents[kind]=s.replace(old,new,1)
change('validation',
 "  taxesFees:string|null; totalAmount:string|null; notes:string|null;",
 "  taxesFees:string|null; totalAmount:string|null; notes:string|null; sourceReceiptId:string|null;",
 'bill type')
change('validation',
 "'totalAmount','notes']);",
 "'totalAmount','notes','sourceReceiptId']);",
 'validation allowed fields')
change('validation',
 "    totalAmount:decimal(x.totalAmount,'totalAmount',2),notes:str(x.notes,'notes',1000)};",
 "    totalAmount:decimal(x.totalAmount,'totalAmount',2),notes:str(x.notes,'notes',1000),\n    sourceReceiptId:x.sourceReceiptId===undefined||x.sourceReceiptId===null?null:parseId(x.sourceReceiptId)};",
 'validated source receipt id')
change('routes',
 '''    try{
      const [result]=await deps.pool.execute<ResultSetHeader>(`INSERT INTO utility_bills
        (user_id,idempotency_key,category,provider_name,account_label,service_start,service_end,due_date,
          usage_amount,usage_unit,rate_per_unit,base_charge,taxes_fees,total_amount,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[uid,...values(d)]);
      res.status(201).json({ok:true,data:await read(deps.pool,uid,String(result.insertId))});
    }catch(e:any){if(e?.code==='ER_DUP_ENTRY')throw new UtilityError(409,'DUPLICATE_UTILITY_BILL','This bill submission was already recorded');throw e;}''',
 '''    try{
      // SOURCE_LINK_STAGE3: never trust a supplied source ID without verifying both ownership and type.
      // The composite foreign key and unique index also protect against races and duplicate links.
      if(d.sourceReceiptId){
        const [matches]=await deps.pool.execute<RowDataPacket[]>(
          "SELECT id FROM receipts WHERE user_id=? AND id=? AND receipt_type='utility' LIMIT 1",
          [uid,d.sourceReceiptId]);
        if(matches.length!==1)throw new UtilityError(404,'UTILITY_SOURCE_NOT_FOUND','Utility statement not found');
      }
      const [result]=d.sourceReceiptId
        ?await deps.pool.execute<ResultSetHeader>(`INSERT INTO utility_bills
          (user_id,idempotency_key,category,provider_name,account_label,service_start,service_end,due_date,
            usage_amount,usage_unit,rate_per_unit,base_charge,taxes_fees,total_amount,notes,source_receipt_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[uid,...values(d),d.sourceReceiptId])
        :await deps.pool.execute<ResultSetHeader>(`INSERT INTO utility_bills
          (user_id,idempotency_key,category,provider_name,account_label,service_start,service_end,due_date,
            usage_amount,usage_unit,rate_per_unit,base_charge,taxes_fees,total_amount,notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[uid,...values(d)]);
      res.status(201).json({ok:true,data:await read(deps.pool,uid,String(result.insertId))});
    }catch(e:any){if(e?.code==='ER_DUP_ENTRY')throw new UtilityError(409,'DUPLICATE_UTILITY_BILL','This bill or linked statement was already recorded');throw e;}''',
 'create draft branch')
change('routes',
 "    const {expectedRevision:ignored,...fields}=req.body??{};\n    const d=parseBill(fields);",
 "    const {expectedRevision:ignored,...fields}=req.body??{};\n    if(fields.sourceReceiptId!==undefined)throw new UtilityError(400,'SOURCE_LINK_IMMUTABLE','The source statement cannot be changed on a saved bill');\n    const d=parseBill(fields);",
 'immutable link on updates')
change('mobile',
 "import {useLocalSearchParams} from 'expo-router';",
 "import {useLocalSearchParams,useRouter} from 'expo-router';",
 'router import')
change('mobile',
 "type UtilityBill={id:string;idempotencyKey?:string;category:Category;",
 "type UtilityBill={id:string;sourceReceiptId:string|null;idempotencyKey?:string;category:Category;",
 'bill source type')
change('mobile',
 "  const api=useReceiptApi();\n  const {sourceReceiptId}=useLocalSearchParams<{sourceReceiptId?:string}>();",
 "  const api=useReceiptApi();\n  const router=useRouter();\n  const {sourceReceiptId}=useLocalSearchParams<{sourceReceiptId?:string}>();",
 'router hook')
change('mobile',
 "  const [sourceNotice,setSourceNotice]=useState('');",
 "  // SOURCE_LINK_STAGE3: only attach a source after it has been read through the authenticated OCR endpoint.\n  const [verifiedSourceId,setVerifiedSourceId]=useState<string|null>(null);\n  const [sourceNotice,setSourceNotice]=useState('');",
 'source verified state')
change('mobile',
 "    loadedRef.current=rid;\n    let cancelled=false;",
 "    loadedRef.current=rid;\n    setVerifiedSourceId(null);\n    let cancelled=false;",
 'source reset')
change('mobile',
 "      const extraction=result.data.extraction?.data;\n      if(extraction?.receiptType!=='utility'){",
 "      const extraction=result.data.extraction?.data;\n      if(extraction?.receiptType!=='utility'){",
 'OCR guard marker')
change('mobile',
 "      const suggestions=makeUtilityPrefill(extraction.utility);",
 "      setVerifiedSourceId(rid);\n      const suggestions=makeUtilityPrefill(extraction.utility);",
 'verified OCR source')
change('mobile',
 "    ratePerUnit:nullable(form.ratePerUnit),baseCharge:nullable(form.baseCharge),taxesFees:nullable(form.taxesFees),notes:nullable(form.notes),accountLabel:null",
 "    ratePerUnit:nullable(form.ratePerUnit),baseCharge:nullable(form.baseCharge),taxesFees:nullable(form.taxesFees),notes:nullable(form.notes),accountLabel:null,\n    sourceReceiptId:verifiedSourceId",
 'source into create payload')
change('mobile',
 "      setNotice(`Utility bill #${r.data.id} saved as draft. No expense confirmed.`);setForm(blank());setShowForm(false);await refresh();",
 "      setNotice(`Utility bill #${r.data.id} saved as draft${r.data.sourceReceiptId?' with its private statement linked':''}. No expense confirmed.`);setForm(blank());setShowForm(false);setVerifiedSourceId(null);await refresh();",
 'save notice')
change('mobile',
 "        <Action label=\"Save utility bill draft (no confirmation)\" disabled={busy} onPress={()=>void save()}/>",
 "        {verifiedSourceId?<Muted>Private utility statement #{verifiedSourceId} will be linked when this draft is saved. Only one bill may link to that statement.</Muted>:null}\n        <Action label=\"Save utility bill draft (no confirmation)\" disabled={busy} onPress={()=>void save()}/>",
 'source link review disclaimer')
change('mobile',
 "      <Muted>{selected.serviceStart} to {selected.serviceEnd} · {money(selected.totalAmount)}</Muted>",
 "      <Muted>{selected.serviceStart} to {selected.serviceEnd} · {money(selected.totalAmount)}</Muted>\n      {selected.sourceReceiptId?<Action label={`View original private statement #${selected.sourceReceiptId}`} onPress={()=>router.push({pathname:'/receipt/[id]',params:{id:selected.sourceReceiptId!}})}/>:null}",
 'linked statement view')
change('mobile',
 "The original image is not yet linked to saved utility bills.",
 "Saved OCR-assisted bills link to their original private statement when you review the source before saving.",
 'footer update')
for key,p in paths.items(): p.write_text(contents[key])
print('PASS: Applied guarded Utility source linking. No live database changes or auto-confirmation.')
