import { createPool, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { HttpError } from '../http/errors.js';
import type { parseCategory, parseProduct, parseVariant, parsePurchase, parseList } from './validation.js';

type Category = ReturnType<typeof parseCategory>;
type Product = ReturnType<typeof parseProduct>;
type Variant = ReturnType<typeof parseVariant>;
type Purchase = ReturnType<typeof parsePurchase>;
type Filters = ReturnType<typeof parseList>;
type Row = RowDataPacket & Record<string, unknown>;

export interface GroceryStore {
  listCategories(userId: string, filters: Filters): Promise<unknown[]>;
  createCategory(userId: string, value: Category): Promise<{ id: string }>;
  listProducts(userId: string, filters: Filters): Promise<unknown[]>;
  createProduct(userId: string, value: Product): Promise<{ id: string }>;
  // GROCERY_CATEGORY_MANAGER_V1
  assignProductCategory(userId: string, productId: string, categoryId: string | null): Promise<{ productId: string; categoryId: string | null }>;
  // GROCERY_PRODUCT_IMPROVEMENTS_V1
  renameProduct(userId: string, productId: string, name: string): Promise<{ productId: string; canonicalName: string }>;
  listVariants(userId: string, filters: Filters): Promise<unknown[]>;
  createVariant(userId: string, value: Variant): Promise<{ id: string }>;
  listPurchases(userId: string, filters: Filters): Promise<unknown[]>;
  createPurchase(userId: string, value: Purchase): Promise<{ id: string }>;
  getPurchase(userId: string, purchaseId: string): Promise<unknown | null>;
  history(userId: string, variantId: string, filters: Filters): Promise<unknown[] | null>;
  close(): Promise<void>;
}

function asId(value: number | bigint): string { return String(value); }
function internalDependency(name: string): HttpError { return new HttpError(404, 'REFERENCE_NOT_FOUND', `${name} not found`); }
function sqlEscapeLike(term: string): string { return term.replace(/[!%_]/g, ch => `!${ch}`); }

export function createGroceryStore(databaseUrl: string): GroceryStore {
  const pool = createPool({ uri: databaseUrl, connectionLimit: 6, waitForConnections: true, decimalNumbers: false, timezone: 'Z' });
  async function owned(cx: PoolConnection, table: 'categories' | 'products' | 'product_variants' | 'merchants' | 'receipts', userId: string, entityId: string | null): Promise<boolean> {
    if (!entityId) return true;
    const [rows] = await cx.execute<Row[]>(`SELECT id FROM ${table} WHERE user_id = ? AND id = ? LIMIT 1`, [userId, entityId]);
    return rows.length === 1;
  }
  return {
    async listCategories(userId, f) {
      const [rows] = await pool.execute<Row[]>(
        'SELECT id,name,parent_id AS parentId FROM categories WHERE user_id = ? ORDER BY name,id LIMIT ? OFFSET ?',
        [userId, f.limit, f.offset]);
      return rows;
    },
    async createCategory(userId, v) {
      const cx = await pool.getConnection();
      try {
        if (!(await owned(cx, 'categories', userId, v.parentId))) throw internalDependency('Parent category');
        const [r] = await cx.execute<ResultSetHeader>(
          'INSERT INTO categories(user_id,name,parent_id) VALUES (?,?,?)', [userId, v.name, v.parentId]);
        return { id: asId(r.insertId) };
      } finally { cx.release(); }
    },
    async listProducts(userId, f) {
      const predicates = ['p.user_id = ?'];
      const args: Array<string | number> = [userId];
      if (f.categoryId) { predicates.push('p.category_id = ?'); args.push(f.categoryId); }
      if (f.search) { predicates.push("(p.canonical_name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')"); const term = `%${sqlEscapeLike(f.search)}%`; args.push(term, term); }
      const [rows] = await pool.execute<Row[]>(
        `SELECT p.id,p.canonical_name AS canonicalName,p.brand,p.category_id AS categoryId FROM products p WHERE ${predicates.join(' AND ')} ORDER BY p.canonical_name,p.id LIMIT ? OFFSET ?`,
        [...args, f.limit, f.offset]);
      return rows;
    },
    async createProduct(userId, v) {
      const cx = await pool.getConnection();
      try {
        if (!(await owned(cx, 'categories', userId, v.categoryId))) throw internalDependency('Category');
        const [r] = await cx.execute<ResultSetHeader>(
          'INSERT INTO products(user_id,canonical_name,brand,category_id) VALUES (?,?,?,?)',
          [userId, v.canonicalName, v.brand, v.categoryId]);
        return { id: asId(r.insertId) };
      } finally { cx.release(); }
    },
    // GROCERY_CATEGORY_MANAGER_V1: verify both IDs under the same Clerk-owned local user.
    async assignProductCategory(userId, productId, categoryId) {
      const cx = await pool.getConnection();
      try {
        await cx.beginTransaction();
        const [products] = await cx.execute<Row[]>(
          'SELECT id FROM products WHERE user_id = ? AND id = ? FOR UPDATE', [userId, productId]);
        if (!products.length) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
        if (categoryId !== null) {
          const [categories] = await cx.execute<Row[]>(
            'SELECT id FROM categories WHERE user_id = ? AND id = ? LIMIT 1', [userId, categoryId]);
          if (!categories.length) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
        }
        await cx.execute('UPDATE products SET category_id = ? WHERE user_id = ? AND id = ?',
          [categoryId, userId, productId]);
        await cx.commit();
        return { productId, categoryId };
      } catch (error) { await cx.rollback(); throw error; }
      finally { cx.release(); }
    },
    // GROCERY_PRODUCT_IMPROVEMENTS_V1: only rename a product owned by current local user.
    async renameProduct(userId, productId, name) {
      const [result] = await pool.execute<ResultSetHeader>(
        'UPDATE products SET canonical_name = ? WHERE user_id = ? AND id = ?',
        [name, userId, productId]);
      if (result.affectedRows !== 1) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      return { productId, canonicalName: name };
    },
    async listVariants(userId, f) {
      const predicates = ['v.user_id = ?']; const args: Array<string | number> = [userId];
      if (f.productId) { predicates.push('v.product_id = ?'); args.push(f.productId); }
      if (f.categoryId) { predicates.push('p.category_id = ?'); args.push(f.categoryId); }
      if (f.search) { predicates.push("(v.variant_name LIKE ? ESCAPE '!' OR p.canonical_name LIKE ? ESCAPE '!')"); const term = `%${sqlEscapeLike(f.search)}%`; args.push(term, term); }
      const [rows] = await pool.execute<Row[]>(
        `SELECT v.id,v.product_id AS productId,v.variant_name AS variantName,v.package_quantity AS packageQuantity,v.package_unit AS packageUnit,v.unit_count AS unitCount,v.product_code AS productCode,v.comparison_group AS comparisonGroup FROM product_variants v JOIN products p ON p.id=v.product_id AND p.user_id=v.user_id WHERE ${predicates.join(' AND ')} ORDER BY v.variant_name,v.id LIMIT ? OFFSET ?`,
        [...args, f.limit, f.offset]);
      return rows;
    },
    async createVariant(userId, v) {
      const cx = await pool.getConnection();
      try {
        if (!(await owned(cx, 'products', userId, v.productId))) throw internalDependency('Product');
        const [r] = await cx.execute<ResultSetHeader>(
          'INSERT INTO product_variants(user_id,product_id,variant_name,package_quantity,package_unit,unit_count,product_code,comparison_group) VALUES (?,?,?,?,?,?,?,?)',
          [userId, v.productId, v.variantName, v.packageQuantity, v.packageUnit, v.unitCount, v.productCode, v.comparisonGroup]);
        return { id: asId(r.insertId) };
      } finally { cx.release(); }
    },
    async listPurchases(userId, f) {
      const conditions = ['t.user_id = ?', "EXISTS (SELECT 1 FROM grocery_line_items gi WHERE gi.user_id=t.user_id AND gi.transaction_id=t.id)"];
      const args: Array<string | number> = [userId];
      if (f.merchantId) { conditions.push('t.merchant_id = ?'); args.push(f.merchantId); }
      if (f.from) { conditions.push('t.purchased_on >= ?'); args.push(f.from); }
      if (f.to) { conditions.push('t.purchased_on <= ?'); args.push(f.to); }
      if (f.variantId || f.productId || f.categoryId || f.search) {
        const sub = ['i.user_id=t.user_id', 'i.transaction_id=t.id'];
        if (f.variantId) { sub.push('i.variant_id=?'); args.push(f.variantId); }
        if (f.productId) { sub.push('p.id=?'); args.push(f.productId); }
        if (f.categoryId) { sub.push('p.category_id=?'); args.push(f.categoryId); }
        if (f.search) { sub.push("(i.raw_description LIKE ? ESCAPE '!' OR p.canonical_name LIKE ? ESCAPE '!')"); const term = `%${sqlEscapeLike(f.search)}%`; args.push(term, term); }
        conditions.push(`EXISTS (SELECT 1 FROM grocery_line_items i LEFT JOIN product_variants v ON v.id=i.variant_id AND v.user_id=i.user_id LEFT JOIN products p ON p.id=v.product_id AND p.user_id=i.user_id WHERE ${sub.join(' AND ')})`);
      }
      const [rows] = await pool.execute<Row[]>(
        `SELECT t.id,t.purchased_on AS purchasedOn,t.merchant_id AS merchantId,t.receipt_id AS receiptId,t.grand_total AS grandTotal,t.status,t.source_transaction_id AS sourceTransactionId FROM purchase_transactions t WHERE ${conditions.join(' AND ')} ORDER BY t.purchased_on DESC,t.id DESC LIMIT ? OFFSET ?`,
        [...args, f.limit, f.offset]);
      return rows;
    },
    async createPurchase(userId, v) {
      const cx = await pool.getConnection();
      try {
        await cx.beginTransaction();
        if (!(await owned(cx, 'merchants', userId, v.merchantId))) throw internalDependency('Merchant');
        if (!(await owned(cx, 'receipts', userId, v.receiptId))) throw internalDependency('Receipt');
        const variantIds = [...new Set(v.items.map(i => i.variantId).filter((id): id is string => id !== null))];
        for (const variantId of variantIds) {
          if (!(await owned(cx, 'product_variants', userId, variantId))) throw internalDependency('Variant');
        }
        const [r] = await cx.execute<ResultSetHeader>(
          `INSERT INTO purchase_transactions(user_id,receipt_id,merchant_id,purchased_on,source_transaction_id,subtotal,tax_total,discount_total,grand_total,status,source_kind) VALUES (?,?,?,?,?,?,?,?,?,?,'manual')`,
          [userId, v.receiptId, v.merchantId, v.purchasedOn, v.sourceTransactionId, v.subtotal, v.taxTotal, v.discountTotal, v.grandTotal, v.status]);
        const transactionId = asId(r.insertId);
        for (const item of v.items) {
          await cx.execute(
            'INSERT INTO grocery_line_items(user_id,transaction_id,variant_id,receipt_line_number,raw_description,quantity_purchased,measurement_unit,measured_amount,listed_unit_price,gross_line_total,net_line_total,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [userId, transactionId, item.variantId, item.receiptLineNumber, item.rawDescription, item.quantityPurchased, item.measurementUnit, item.measuredAmount, item.listedUnitPrice, item.grossLineTotal, item.netLineTotal, v.status === 'confirmed' ? 'confirmed' : 'needs_review']);
        }
        await cx.commit();
        return { id: transactionId };
      } catch (error) {
        await cx.rollback();
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
          throw new HttpError(409, 'DUPLICATE_TRANSACTION', 'This transaction key was already saved');
        }
        throw error;
      } finally { cx.release(); }
    },
    async getPurchase(userId, purchaseId) {
      const [rows] = await pool.execute<Row[]>(
        `SELECT t.id,t.purchased_on AS purchasedOn,t.merchant_id AS merchantId,t.receipt_id AS receiptId,t.subtotal,t.tax_total AS taxTotal,t.discount_total AS discountTotal,t.grand_total AS grandTotal,t.status,t.source_transaction_id AS sourceTransactionId FROM purchase_transactions t WHERE t.user_id=? AND t.id=? AND EXISTS (SELECT 1 FROM grocery_line_items i WHERE i.user_id=t.user_id AND i.transaction_id=t.id) LIMIT 1`,
        [userId, purchaseId]);
      if (!rows.length) return null;
      const [items] = await pool.execute<Row[]>(
        'SELECT id,variant_id AS variantId,receipt_line_number AS receiptLineNumber,raw_description AS rawDescription,quantity_purchased AS quantityPurchased,measurement_unit AS measurementUnit,measured_amount AS measuredAmount,listed_unit_price AS listedUnitPrice,gross_line_total AS grossLineTotal,net_line_total AS netLineTotal,review_status AS reviewStatus FROM grocery_line_items WHERE user_id=? AND transaction_id=? ORDER BY receipt_line_number,id',
        [userId, purchaseId]);
      return { ...rows[0], items };
    },
    async history(userId, variantId, f) {
      const cx = await pool.getConnection();
      try {
        if (!(await owned(cx, 'product_variants', userId, variantId))) return null;
        const conditions = ['i.user_id=?', 'i.variant_id=?', "i.review_status='confirmed'", "t.status='confirmed'", 't.purchased_on IS NOT NULL'];
        const args: Array<string | number> = [userId, variantId];
        if (f.from) { conditions.push('t.purchased_on>=?'); args.push(f.from); }
        if (f.to) { conditions.push('t.purchased_on<=?'); args.push(f.to); }
        if (f.merchantId) { conditions.push('t.merchant_id=?'); args.push(f.merchantId); }
        const [rows] = await cx.execute<Row[]>(
          `SELECT i.id AS lineItemId,t.id AS transactionId,t.purchased_on AS purchasedOn,t.merchant_id AS merchantId,i.raw_description AS rawDescription,i.quantity_purchased AS quantityPurchased,i.net_line_total AS netLineTotal,CASE WHEN i.quantity_purchased>0 AND i.net_line_total IS NOT NULL THEN ROUND(i.net_line_total/i.quantity_purchased,4) ELSE NULL END AS pricePerPurchasedUnit FROM grocery_line_items i JOIN purchase_transactions t ON t.id=i.transaction_id AND t.user_id=i.user_id WHERE ${conditions.join(' AND ')} ORDER BY t.purchased_on ASC,t.id ASC,i.id ASC LIMIT ? OFFSET ?`,
          [...args, f.limit, f.offset]);
        return rows;
      } finally { cx.release(); }
    },
    async close() { await pool.end(); },
  };
}
