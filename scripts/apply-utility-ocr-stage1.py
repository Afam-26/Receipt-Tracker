#!/usr/bin/env python3
"""Patch only known matching code spans. Validate all edits before writing anything."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
if not (root/'services/api/src/receipts/validation.ts').exists():
    root = Path.cwd()
if not (root/'services/api/src/receipts/validation.ts').exists():
    raise SystemExit('Run from receipt-price-tracker repository root after unzipping the patch.')
# The migration and extractor are written together only after all compatibility checks.
if (root/'packages/database/migrations/0003_utility_receipt_type.sql').exists() and 'requestedType?:' in (root/'services/api/src/ocr/extract.ts').read_text():
    print('Already applied: utility OCR stage 1 is present. No changes made.')
    sys.exit(0)
changes = {}
def replace(path, old, new, count=1):
    file=root/path
    src=changes.get(file, file.read_text())
    if new in src and old not in src: return
    if src.count(old)!=count: raise SystemExit(f'STOP: Expected {count} match(es) in {path}, found {src.count(old)}. No files changed.')
    changes[file]=src.replace(old,new,count)

replace('services/api/src/receipts/validation.ts',
"export type ReceiptType = 'grocery' | 'gas' | 'mixed' | 'unknown';",
"export type ReceiptType = 'grocery' | 'gas' | 'utility' | 'mixed' | 'unknown';")
replace('services/api/src/receipts/validation.ts',
"['grocery','gas','mixed','unknown'].includes(value)",
"['grocery','gas','utility','mixed','unknown'].includes(value)")

path='services/api/src/ocr/extract.ts'
replace(path, "export type Candidate =", "import { parseUtilityText, type UtilitySuggestions } from './utility-extract.js';\nexport type Candidate =")
replace(path, "receiptType: 'grocery' | 'gas' | 'mixed' | 'unknown';", "receiptType: 'grocery' | 'gas' | 'utility' | 'mixed' | 'unknown';\n  utility?: UtilitySuggestions | null;")
replace(path, 'export function parseReceiptText(input:string):ParsedReceipt {',
'''export function parseReceiptText(input:string, requestedType?:'grocery'|'gas'|'utility'|'mixed'|'unknown'):ParsedReceipt {
  if(requestedType==='utility')return {receiptType:'utility',utility:parseUtilityText(input),merchant:null,purchasedOn:null,grandTotal:null,groceryLines:[],gas:{grade:null,gallons:null,beforeRewardsPricePerGallon:null,rewardsDiscountPerGallon:null,paidPricePerGallon:null},reviewWarnings:['Utility statement OCR is unverified. Review it in Utilities before creating a bill.']};''')

path='services/api/src/ocr/store.ts'
replace(path, "export interface OcrJob {id:string;userId:string;receiptId:string;key:string;mimeType:string}",
"export interface OcrJob {id:string;userId:string;receiptId:string;key:string;mimeType:string;receiptType:'grocery'|'gas'|'utility'|'mixed'|'unknown'}")
replace(path, "SELECT j.id,j.user_id AS userId,j.receipt_id AS receiptId FROM receipt_processing_jobs j WHERE", "SELECT j.id,j.user_id AS userId,j.receipt_id AS receiptId,r.receipt_type AS receiptType FROM receipt_processing_jobs j INNER JOIN receipts r ON r.id=j.receipt_id AND r.user_id=j.user_id WHERE")
replace(path, "mimeType:files[0]?String(files[0].mimeType):''};", "mimeType:files[0]?String(files[0].mimeType):'',receiptType:String(row.receiptType) as OcrJob['receiptType']};")
replace(path, "['groceryLines',result.groceryLines]", "['groceryLines',result.groceryLines],['utility',result.utility??null]")

replace('services/api/src/ocr/worker.ts', 'parseReceiptText(text),text', 'parseReceiptText(text,job.receiptType),text')

path='apps/mobile/src/lib/receipts4b.ts'
replace(path, "export type ReceiptType = 'grocery' | 'gas';", "export type ReceiptType = 'grocery' | 'gas'; // Purchase confirmation remains limited to grocery/gas.")
replace(path, "export type OcrExtract = {", '''export type UtilityCandidate = {value:string;evidence:string;confidence:string}|null;
export type UtilityExtract = {category:UtilityCandidate;providerName:UtilityCandidate;serviceStart:UtilityCandidate;serviceEnd:UtilityCandidate;dueDate:UtilityCandidate;totalAmount:UtilityCandidate;usageAmount:UtilityCandidate;usageUnit:UtilityCandidate;ratePerUnit:UtilityCandidate;reviewWarnings:string[]};
export type OcrExtract = {utility?:UtilityExtract|null;''')
replace(path, "receiptType: 'grocery'|'gas'|'unknown'", "receiptType: 'grocery'|'gas'|'utility'|'unknown'")

path='apps/mobile/src/app/(tabs)/receipts.tsx'
replace(path, "    if(kind === 'utility'){\n      setError('Utility bill uploads are not enabled yet. They need their own bill records and review API; this app will not misclassify utility charges as groceries or gasoline.');\n      return;\n    }\n", "")
# Permit utility capture actions without replacing existing UI cards/other unrelated changes.
replace(path, "{kind==='utility'?<View style={{borderWidth:1,borderColor:palette.border,borderRadius:12,padding:14,gap:10,backgroundColor:'#f4faf7'}}>\n        <Text style={{fontWeight:'700',color:palette.text,fontSize:16}}>Utilities — coming next</Text>\n        <Muted>Electricity, water/sewer, home natural gas, internet, phone, and trash bills will have their own provider, billing period, usage, and charges. Grocery/gas OCR and confirmation are not suitable for utility bills.</Muted>\n        <Muted>Utility capture will become available after the separate bill storage and review APIs are implemented. Nothing is uploaded when Utility is selected.</Muted>\n        <Action label=\"Open Utilities dashboard\" onPress={()=>router.push('/(tabs)/utilities')}/>\n      </View>:<>\n", "{<>\n")
replace(path, "      </>}\n    </Panel>", "      </>}\n    </Panel>") if False else None
replace(path, "Capture grocery, gas and—soon—utility bills in one place.", "Capture grocery, gas and utility bills in one place.")

path='apps/mobile/src/app/receipt/[id].tsx'
# Use explicit OCR result type to avoid loading grocery/gas purchase-review for utility documents.
replace(path, "if(status.processingStatus==='needs_review'||status.processingStatus==='confirmed'){", "if((status.processingStatus==='needs_review'||status.processingStatus==='confirmed') && status.extraction?.data?.receiptType!=='utility'){")
replace(path, "    {draft&&review?.status==='needs_review'?<>", '''    {ocr?.extraction?.data?.receiptType==='utility'?<Panel>
      <Text style={{fontSize:18,fontWeight:'700',color:palette.text}}>Utility statement — OCR suggestions</Text>
      <Muted>These values are unverified. Check the original statement, then add a bill in Utilities. No expense or purchase is created by OCR.</Muted>
      {([['Category','category'],['Provider','providerName'],['Billing start','serviceStart'],['Billing end','serviceEnd'],['Due date','dueDate'],['Total due','totalAmount'],['Usage','usageAmount'],['Usage unit','usageUnit'],['Rate per unit','ratePerUnit']] as const).map(([label,key])=><View key={key} style={{gap:3,paddingVertical:5}}><Text style={{fontWeight:'600',color:palette.text}}>{label}: {ocr?.extraction?.data?.utility?.[key]?.value??'Not detected'}</Text></View>)}
      {ocr.extraction.data.utility?.reviewWarnings.map((w,i)=><Muted key={i}>{w}</Muted>)}
      <Action label="Open Utilities to enter and verify bill" onPress={()=>router.push('/(tabs)/utilities')}/>
    </Panel>:null}
    {draft&&review?.status==='needs_review'?<>''')

# Write migration as a distinct version, never edit the already-applied 0002 SQL.
migration=root/'packages/database/migrations/0003_utility_receipt_type.sql'
if migration.exists() and migration.read_text().strip()!= "ALTER TABLE receipts MODIFY COLUMN receipt_type ENUM('grocery','gas','mixed','unknown','utility') NOT NULL DEFAULT 'unknown';":
    raise SystemExit('STOP: 0003 migration already exists with different content. No files changed.')
for file,src in changes.items():
    if not src.strip():raise SystemExit(f'STOP: Empty result for {file}')
# Create source file if not already installed by ZIP
src=root/'services/api/src/ocr/utility-extract.ts'
if not src.exists():
    bundled=Path(__file__).resolve().parents[1]/'services/api/src/ocr/utility-extract.ts'
    if not bundled.exists(): raise SystemExit('STOP: Missing utility extraction module. No files changed.')
    changes[src]=bundled.read_text()
changes[migration]="ALTER TABLE receipts MODIFY COLUMN receipt_type ENUM('grocery','gas','mixed','unknown','utility') NOT NULL DEFAULT 'unknown';\n"
for file,src in changes.items():
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(src)
print('PASS: Applied additive utility OCR/capture patch. Files changed:',len(changes))
print('NEXT: Run API/mobile typechecks and tests, back up Railway, then apply 0003 migration only after successful checks.')
