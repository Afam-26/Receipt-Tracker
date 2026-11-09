// Drizzle table models. The versioned SQL migrations are the DDL source of truth.
import { mysqlTable, bigint, varchar, char, mysqlEnum, datetime, date, decimal, int, smallint, text, json, index, uniqueIndex, primaryKey } from 'drizzle-orm/mysql-core';

const id = () => bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();
const owner = () => bigint('user_id', { mode: 'number', unsigned: true }).notNull();
const time = (name: string) => datetime(name, { fsp: 3 });
const money = (name: string) => decimal(name, { precision: 12, scale: 2 });
const number4 = (name: string) => decimal(name, { precision: 12, scale: 4 });
const price4 = (name: string) => decimal(name, { precision: 10, scale: 4 });
const created = () => time('created_at').notNull().defaultNow();

export const users = mysqlTable('users', {
 id: id(), authProviderSubject: varchar('auth_provider_subject',{ length:191 }).notNull(),
 email: varchar('email',{length:320}), createdAt:created(), updatedAt:time('updated_at').notNull().defaultNow(),
}, t => [uniqueIndex('uq_users_subject').on(t.authProviderSubject)]);

export const userSettings = mysqlTable('user_settings', {
 userId: owner().primaryKey(), gallonsPerFillup:number4('gallons_per_fillup').notNull().default('13.0000'),
 fillupsPerWeek:decimal('fillups_per_week',{precision:8,scale:4}).notNull().default('1.0000'),
 currencyCode:char('currency_code',{length:3}).notNull().default('USD'),
 timezone:varchar('timezone',{length:64}).notNull().default('America/Chicago'),
 updatedAt:time('updated_at').notNull().defaultNow(),
});

export const merchants = mysqlTable('merchants', {
 id:id(), userId:owner(), name:varchar('name',{length:255}).notNull(), normalizedName:varchar('normalized_name',{length:255}).notNull(),
 merchantType:mysqlEnum('merchant_type',['grocery','fuel','mixed','other']).notNull().default('other'),
 locationLabel:varchar('location_label',{length:255}), createdAt:created(),
},t=>[uniqueIndex('uq_merchants_owner_id').on(t.userId,t.id), index('ix_merchants_lookup').on(t.userId,t.normalizedName)]);

export const receipts = mysqlTable('receipts', {
 id:id(), userId:owner(), receiptType:mysqlEnum('receipt_type',['grocery','gas','mixed','unknown']).notNull().default('unknown'),
 processingStatus:mysqlEnum('processing_status',['uploaded','processing','needs_review','confirmed','failed']).notNull().default('uploaded'),
 primaryFileHash:char('primary_file_hash',{length:64}),duplicateOfId:bigint('duplicate_of_id',{mode:'number',unsigned:true}),
 createdAt:created(),updatedAt:time('updated_at').notNull().defaultNow(),
},t=>[uniqueIndex('uq_receipts_owner_id').on(t.userId,t.id),index('ix_receipts_owner_status').on(t.userId,t.processingStatus,t.createdAt),index('ix_receipts_owner_hash').on(t.userId,t.primaryFileHash)]);

export const receiptFiles = mysqlTable('receipt_files', {
 id:id(),userId:owner(),receiptId:bigint('receipt_id',{mode:'number',unsigned:true}).notNull(),
 storageKey:varchar('storage_key',{length:512}).notNull(),originalFilename:varchar('original_filename',{length:255}).notNull(),
 mimeType:varchar('mime_type',{length:80}).notNull(),fileHash:char('file_hash',{length:64}).notNull(),
 byteSize:bigint('byte_size',{mode:'number',unsigned:true}).notNull(),uploadedAt:time('uploaded_at').notNull().defaultNow(),
},t=>[uniqueIndex('uq_receipt_files_storage').on(t.storageKey),uniqueIndex('uq_receipt_files_owner_receipt_hash').on(t.userId,t.receiptId,t.fileHash),index('ix_receipt_files_owner_hash').on(t.userId,t.fileHash)]);

export const receiptExtractions = mysqlTable('receipt_extractions', {
 id:id(),userId:owner(),receiptId:bigint('receipt_id',{mode:'number',unsigned:true}).notNull(),
 provider:varchar('provider',{length:80}).notNull(),providerVersion:varchar('provider_version',{length:80}),
 rawResult:json('raw_result'),confidenceData:json('confidence_data'),createdAt:created(),
},t=>[index('ix_extractions_receipt').on(t.userId,t.receiptId,t.createdAt)]);

export const purchaseTransactions = mysqlTable('purchase_transactions', {
 id:id(),userId:owner(),receiptId:bigint('receipt_id',{mode:'number',unsigned:true}),merchantId:bigint('merchant_id',{mode:'number',unsigned:true}),
 purchasedOn:date('purchased_on',{mode:'string'}),purchasedAt:time('purchased_at'),
 receiptNumber:varchar('receipt_number',{length:128}),sourceTransactionId:varchar('source_transaction_id',{length:191}),
 duplicateFingerprint:char('duplicate_fingerprint',{length:64}),subtotal:money('subtotal'),taxTotal:money('tax_total'),
 discountTotal:money('discount_total'),grandTotal:money('grand_total'),currencyCode:char('currency_code',{length:3}).notNull().default('USD'),
 status:mysqlEnum('status',['draft','needs_review','confirmed','voided','refunded']).notNull().default('draft'),
 sourceKind:mysqlEnum('source_kind',['receipt','manual','legacy_import']).notNull().default('manual'),
 createdAt:created(),updatedAt:time('updated_at').notNull().defaultNow(),
},t=>[uniqueIndex('uq_transactions_owner_id').on(t.userId,t.id),uniqueIndex('uq_transactions_source_id').on(t.userId,t.sourceTransactionId),index('ix_transactions_receipt').on(t.userId,t.receiptId),index('ix_transactions_merchant_date').on(t.userId,t.merchantId,t.purchasedOn),index('ix_transactions_fingerprint').on(t.userId,t.duplicateFingerprint),index('ix_transactions_date').on(t.userId,t.purchasedOn,t.status)]);

export const categories = mysqlTable('categories',{
 id:id(),userId:owner(),name:varchar('name',{length:191}).notNull(),parentId:bigint('parent_id',{mode:'number',unsigned:true}),
},t=>[uniqueIndex('uq_categories_owner_id').on(t.userId,t.id),index('ix_categories_name').on(t.userId,t.name)]);

export const products = mysqlTable('products',{
 id:id(),userId:owner(),canonicalName:varchar('canonical_name',{length:255}).notNull(),brand:varchar('brand',{length:191}),
 categoryId:bigint('category_id',{mode:'number',unsigned:true}),createdAt:created(),
},t=>[uniqueIndex('uq_products_owner_id').on(t.userId,t.id),index('ix_products_name').on(t.userId,t.canonicalName)]);

export const productVariants = mysqlTable('product_variants',{
 id:id(),userId:owner(),productId:bigint('product_id',{mode:'number',unsigned:true}).notNull(),
 variantName:varchar('variant_name',{length:255}).notNull(),packageQuantity:number4('package_quantity'),
 packageUnit:varchar('package_unit',{length:32}),unitCount:number4('unit_count'),productCode:varchar('product_code',{length:128}),
 comparisonGroup:varchar('comparison_group',{length:128}),createdAt:created(),
},t=>[uniqueIndex('uq_variants_owner_id').on(t.userId,t.id),index('ix_variants_product').on(t.userId,t.productId),index('ix_variants_comparison').on(t.userId,t.comparisonGroup)]);

export const productAliases = mysqlTable('product_aliases',{
 id:id(),userId:owner(),merchantId:bigint('merchant_id',{mode:'number',unsigned:true}),variantId:bigint('variant_id',{mode:'number',unsigned:true}).notNull(),
 receiptDescription:varchar('receipt_description',{length:512}).notNull(),normalizedDescription:varchar('normalized_description',{length:512}).notNull(),
 matchStatus:mysqlEnum('match_status',['suggested','verified','rejected']).notNull().default('suggested'),createdAt:created(),
}); // Prefix index is created by SQL migration (Drizzle does not represent it here).

export const groceryLineItems = mysqlTable('grocery_line_items',{
 id:id(),userId:owner(),transactionId:bigint('transaction_id',{mode:'number',unsigned:true}).notNull(),variantId:bigint('variant_id',{mode:'number',unsigned:true}),
 receiptLineNumber:int('receipt_line_number',{unsigned:true}),rawDescription:varchar('raw_description',{length:512}).notNull(),
 quantityPurchased:number4('quantity_purchased'),measurementUnit:varchar('measurement_unit',{length:32}),
 measuredAmount:number4('measured_amount'),listedUnitPrice:price4('listed_unit_price'),
 grossLineTotal:money('gross_line_total'),netLineTotal:money('net_line_total'),
 reviewStatus:mysqlEnum('review_status',['needs_review','confirmed']).notNull().default('needs_review'),createdAt:created(),
},t=>[uniqueIndex('uq_grocery_owner_id').on(t.userId,t.id),index('ix_grocery_transaction').on(t.userId,t.transactionId,t.receiptLineNumber),index('ix_grocery_variant').on(t.userId,t.variantId)]);

export const lineItemAdjustments = mysqlTable('line_item_adjustments',{
 id:id(),userId:owner(),lineItemId:bigint('line_item_id',{mode:'number',unsigned:true}).notNull(),
 adjustmentType:mysqlEnum('adjustment_type',['coupon','promotion','discount','refund','return','other']).notNull(),
 amount:money('amount').notNull(),description:varchar('description',{length:512}),sourceReference:varchar('source_reference',{length:191}),createdAt:created(),
},t=>[index('ix_adjustments_line').on(t.userId,t.lineItemId)]);

export const fuelGrades = mysqlTable('fuel_grades',{
 id:id(),canonicalName:varchar('canonical_name',{length:80}).notNull(),
 gradeGroup:mysqlEnum('grade_group',['regular','plus','super','diesel','other']).notNull(),
 octaneRating:smallint('octane_rating',{unsigned:true}),fuelType:varchar('fuel_type',{length:50}).notNull().default('gasoline'),
},t=>[uniqueIndex('uq_fuel_grade_identity').on(t.canonicalName,t.octaneRating,t.fuelType)]);

export const gasPurchases = mysqlTable('gas_purchases',{
 id:id(),userId:owner(),transactionId:bigint('transaction_id',{mode:'number',unsigned:true}).notNull(),
 fuelGradeId:bigint('fuel_grade_id',{mode:'number',unsigned:true}),rawFuelGrade:varchar('raw_fuel_grade',{length:128}),
 regularPricePerGallon:price4('regular_price_per_gallon'),rewardDiscountPerGallon:price4('reward_discount_per_gallon'),
 paidPricePerGallon:price4('paid_price_per_gallon'),gallons:number4('gallons'),totalPaid:money('total_paid'),
 priceSource:mysqlEnum('price_source',['printed','derived','confirmed','unknown']).notNull().default('unknown'),
 reviewStatus:mysqlEnum('review_status',['needs_review','confirmed']).notNull().default('needs_review'),createdAt:created(),
},t=>[uniqueIndex('uq_gas_owner_id').on(t.userId,t.id),index('ix_gas_transaction').on(t.userId,t.transactionId),index('ix_gas_grade').on(t.userId,t.fuelGradeId)]);

export const receiptReviewIssues = mysqlTable('receipt_review_issues',{
 id:id(),userId:owner(),receiptId:bigint('receipt_id',{mode:'number',unsigned:true}).notNull(),
 fieldPath:varchar('field_path',{length:255}).notNull(),issueType:varchar('issue_type',{length:80}).notNull(),proposedValue:json('proposed_value'),
 status:mysqlEnum('status',['open','resolved','dismissed']).notNull().default('open'),resolvedAt:time('resolved_at'),
},t=>[index('ix_review_receipt').on(t.userId,t.receiptId,t.status)]);

export const auditLogs = mysqlTable('audit_logs',{
 id:id(),userId:owner(),entityType:varchar('entity_type',{length:80}).notNull(),entityId:bigint('entity_id',{mode:'number',unsigned:true}).notNull(),
 action:varchar('action',{length:80}).notNull(),beforeData:json('before_data'),afterData:json('after_data'),createdAt:created(),
},t=>[index('ix_audit_entity').on(t.userId,t.entityType,t.entityId,t.createdAt)]);

export const receiptProcessingJobs = mysqlTable('receipt_processing_jobs',{
 id:id(),userId:owner(),receiptId:bigint('receipt_id',{mode:'number',unsigned:true}).notNull(),
 jobType:mysqlEnum('job_type',['ocr','normalize','match','reprocess']).notNull(),
 status:mysqlEnum('status',['queued','running','completed','failed']).notNull().default('queued'),
 attemptCount:int('attempt_count',{unsigned:true}).notNull().default(0),availableAt:time('available_at').notNull().defaultNow(),
 lockedAt:time('locked_at'),lastError:text('last_error'),completedAt:time('completed_at'),
},t=>[index('ix_jobs_ready').on(t.status,t.availableAt),index('ix_jobs_receipt').on(t.userId,t.receiptId)]);
