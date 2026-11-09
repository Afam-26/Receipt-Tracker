-- Receipt Price Tracker / Phase 2A initial MySQL 8 schema.
-- Apply ONLY to a new empty database. Backup and test restores before production.
-- UTF8MB4 is required for receipt names and Unicode descriptions.

CREATE TABLE users (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 auth_provider_subject VARCHAR(191) NOT NULL,
 email VARCHAR(320) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_users_subject (auth_provider_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_settings (
 user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 gallons_per_fillup DECIMAL(12,4) NOT NULL DEFAULT 13.0000,
 fillups_per_week DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
 currency_code CHAR(3) NOT NULL DEFAULT 'USD',
 timezone VARCHAR(64) NOT NULL DEFAULT 'America/Chicago',
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT ck_settings_gallons CHECK (gallons_per_fillup > 0),
 CONSTRAINT ck_settings_fills CHECK (fillups_per_week >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE merchants (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(255) NOT NULL,
 normalized_name VARCHAR(255) NOT NULL,
 merchant_type ENUM('grocery','fuel','mixed','other') NOT NULL DEFAULT 'other',
 location_label VARCHAR(255) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_merchants_owner_id (user_id,id),
 KEY ix_merchants_lookup (user_id, normalized_name),
 CONSTRAINT fk_merchants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_type ENUM('grocery','gas','mixed','unknown') NOT NULL DEFAULT 'unknown',
 processing_status ENUM('uploaded','processing','needs_review','confirmed','failed') NOT NULL DEFAULT 'uploaded',
 primary_file_hash CHAR(64) NULL,
 duplicate_of_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_receipts_owner_id (user_id,id),
 KEY ix_receipts_owner_status (user_id,processing_status,created_at),
 KEY ix_receipts_owner_hash (user_id,primary_file_hash),
 CONSTRAINT fk_receipts_user
  FOREIGN KEY (user_id)
  REFERENCES users(id) ON DELETE CASCADE,

 CONSTRAINT fk_receipts_duplicate
    FOREIGN KEY (user_id, duplicate_of_id)
    REFERENCES receipts(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt_files (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_id BIGINT UNSIGNED NOT NULL,
 storage_key VARCHAR(512) NOT NULL,
 original_filename VARCHAR(255) NOT NULL,
 mime_type VARCHAR(80) NOT NULL,
 file_hash CHAR(64) NOT NULL,
 byte_size BIGINT UNSIGNED NOT NULL,
 uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_receipt_files_storage (storage_key),
 UNIQUE KEY uq_receipt_files_owner_receipt_hash (user_id,receipt_id,file_hash),
 KEY ix_receipt_files_owner_hash (user_id,file_hash),
 CONSTRAINT fk_receipt_files_receipt FOREIGN KEY (user_id,receipt_id) REFERENCES receipts(user_id,id),
 CONSTRAINT ck_receipt_files_size CHECK (byte_size > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt_extractions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_id BIGINT UNSIGNED NOT NULL,
 provider VARCHAR(80) NOT NULL,
 provider_version VARCHAR(80) NULL,
 raw_result JSON NULL,
 confidence_data JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_extractions_receipt (user_id,receipt_id,created_at),
 CONSTRAINT fk_extractions_receipt FOREIGN KEY (user_id,receipt_id) REFERENCES receipts(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE purchase_transactions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_id BIGINT UNSIGNED NULL,
 merchant_id BIGINT UNSIGNED NULL,
 purchased_on DATE NULL,
 purchased_at DATETIME(3) NULL,
 receipt_number VARCHAR(128) NULL,
 source_transaction_id VARCHAR(191) NULL,
 duplicate_fingerprint CHAR(64) NULL,
 subtotal DECIMAL(12,2) NULL,
 tax_total DECIMAL(12,2) NULL,
 discount_total DECIMAL(12,2) NULL,
 grand_total DECIMAL(12,2) NULL,
 currency_code CHAR(3) NOT NULL DEFAULT 'USD',
 status ENUM('draft','needs_review','confirmed','voided','refunded') NOT NULL DEFAULT 'draft',
 source_kind ENUM('receipt','manual','legacy_import') NOT NULL DEFAULT 'manual',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_transactions_owner_id (user_id,id),
 UNIQUE KEY uq_transactions_source_id (user_id,source_transaction_id),
 KEY ix_transactions_receipt (user_id,receipt_id),
 KEY ix_transactions_merchant_date (user_id,merchant_id,purchased_on),
 KEY ix_transactions_fingerprint (user_id,duplicate_fingerprint),
 KEY ix_transactions_date (user_id,purchased_on,status),
 CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id),
 CONSTRAINT fk_transactions_receipt FOREIGN KEY (user_id,receipt_id) REFERENCES receipts(user_id,id),
 CONSTRAINT fk_transactions_merchant FOREIGN KEY (user_id,merchant_id) REFERENCES merchants(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(191) NOT NULL,
 parent_id BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_categories_owner_id (user_id,id),
 KEY ix_categories_name (user_id,name),
 CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id),
 CONSTRAINT fk_categories_parent FOREIGN KEY (user_id,parent_id) REFERENCES categories(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 canonical_name VARCHAR(255) NOT NULL,
 brand VARCHAR(191) NULL,
 category_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_products_owner_id (user_id,id),
 KEY ix_products_name (user_id,canonical_name),
 CONSTRAINT fk_products_user FOREIGN KEY (user_id) REFERENCES users(id),
 CONSTRAINT fk_products_category FOREIGN KEY (user_id,category_id) REFERENCES categories(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_variants (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 variant_name VARCHAR(255) NOT NULL,
 package_quantity DECIMAL(12,4) NULL,
 package_unit VARCHAR(32) NULL,
 unit_count DECIMAL(12,4) NULL,
 product_code VARCHAR(128) NULL,
 comparison_group VARCHAR(128) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_variants_owner_id (user_id,id),
 KEY ix_variants_product (user_id,product_id),
 KEY ix_variants_comparison (user_id,comparison_group),
 CONSTRAINT fk_variants_product FOREIGN KEY (user_id,product_id) REFERENCES products(user_id,id),
 CONSTRAINT ck_variants_package CHECK (package_quantity IS NULL OR package_quantity > 0),
 CONSTRAINT ck_variants_count CHECK (unit_count IS NULL OR unit_count > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_aliases (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 merchant_id BIGINT UNSIGNED NULL,
 variant_id BIGINT UNSIGNED NOT NULL,
 receipt_description VARCHAR(512) NOT NULL,
 normalized_description VARCHAR(512) NOT NULL,
 match_status ENUM('suggested','verified','rejected') NOT NULL DEFAULT 'suggested',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_aliases_lookup (user_id,normalized_description(191),match_status),
 CONSTRAINT fk_aliases_variant FOREIGN KEY (user_id,variant_id) REFERENCES product_variants(user_id,id),
 CONSTRAINT fk_aliases_merchant FOREIGN KEY (user_id,merchant_id) REFERENCES merchants(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE grocery_line_items (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 transaction_id BIGINT UNSIGNED NOT NULL,
 variant_id BIGINT UNSIGNED NULL,
 receipt_line_number INT UNSIGNED NULL,
 raw_description VARCHAR(512) NOT NULL,
 quantity_purchased DECIMAL(12,4) NULL,
 measurement_unit VARCHAR(32) NULL,
 measured_amount DECIMAL(12,4) NULL,
 listed_unit_price DECIMAL(12,4) NULL,
 gross_line_total DECIMAL(12,2) NULL,
 net_line_total DECIMAL(12,2) NULL,
 review_status ENUM('needs_review','confirmed') NOT NULL DEFAULT 'needs_review',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_grocery_owner_id (user_id,id),
 KEY ix_grocery_transaction (user_id,transaction_id,receipt_line_number),
 KEY ix_grocery_variant (user_id,variant_id),
 CONSTRAINT fk_grocery_transaction FOREIGN KEY (user_id,transaction_id) REFERENCES purchase_transactions(user_id,id),
 CONSTRAINT fk_grocery_variant FOREIGN KEY (user_id,variant_id) REFERENCES product_variants(user_id,id),
 CONSTRAINT ck_grocery_qty CHECK (quantity_purchased IS NULL OR quantity_purchased > 0),
 CONSTRAINT ck_grocery_measure CHECK (measured_amount IS NULL OR measured_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE line_item_adjustments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 line_item_id BIGINT UNSIGNED NOT NULL,
 adjustment_type ENUM('coupon','promotion','discount','refund','return','other') NOT NULL,
 amount DECIMAL(12,2) NOT NULL,
 description VARCHAR(512) NULL,
 source_reference VARCHAR(191) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_adjustments_line (user_id,line_item_id),
 CONSTRAINT fk_adjustments_line FOREIGN KEY (user_id,line_item_id) REFERENCES grocery_line_items(user_id,id),
 CONSTRAINT ck_adjustment_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE fuel_grades (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 canonical_name VARCHAR(80) NOT NULL,
 grade_group ENUM('regular','plus','super','diesel','other') NOT NULL,
 octane_rating SMALLINT UNSIGNED NULL,
 fuel_type VARCHAR(50) NOT NULL DEFAULT 'gasoline',
 UNIQUE KEY uq_fuel_grade_identity (canonical_name,octane_rating,fuel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE gas_purchases (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 transaction_id BIGINT UNSIGNED NOT NULL,
 fuel_grade_id BIGINT UNSIGNED NULL,
 raw_fuel_grade VARCHAR(128) NULL,
 regular_price_per_gallon DECIMAL(10,4) NULL,
 reward_discount_per_gallon DECIMAL(10,4) NULL,
 paid_price_per_gallon DECIMAL(10,4) NULL,
 gallons DECIMAL(12,4) NULL,
 total_paid DECIMAL(12,2) NULL,
 price_source ENUM('printed','derived','confirmed','unknown') NOT NULL DEFAULT 'unknown',
 review_status ENUM('needs_review','confirmed') NOT NULL DEFAULT 'needs_review',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_gas_owner_id (user_id,id),
 KEY ix_gas_transaction (user_id,transaction_id),
 KEY ix_gas_grade (user_id,fuel_grade_id),
 CONSTRAINT fk_gas_transaction FOREIGN KEY (user_id,transaction_id) REFERENCES purchase_transactions(user_id,id),
 CONSTRAINT fk_gas_grade FOREIGN KEY (fuel_grade_id) REFERENCES fuel_grades(id),
 CONSTRAINT ck_gas_regular CHECK (regular_price_per_gallon IS NULL OR regular_price_per_gallon >= 0),
 CONSTRAINT ck_gas_discount CHECK (reward_discount_per_gallon IS NULL OR reward_discount_per_gallon >= 0),
 CONSTRAINT ck_gas_paid CHECK (paid_price_per_gallon IS NULL OR paid_price_per_gallon >= 0),
 CONSTRAINT ck_gas_gallons CHECK (gallons IS NULL OR gallons > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt_review_issues (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_id BIGINT UNSIGNED NOT NULL,
 field_path VARCHAR(255) NOT NULL,
 issue_type VARCHAR(80) NOT NULL,
 proposed_value JSON NULL,
 status ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
 resolved_at DATETIME(3) NULL,
 KEY ix_review_receipt (user_id,receipt_id,status),
 CONSTRAINT fk_review_receipt FOREIGN KEY (user_id,receipt_id) REFERENCES receipts(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 entity_type VARCHAR(80) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL,
 action VARCHAR(80) NOT NULL,
 before_data JSON NULL,
 after_data JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_audit_entity (user_id,entity_type,entity_id,created_at),
 CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt_processing_jobs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 receipt_id BIGINT UNSIGNED NOT NULL,
 job_type ENUM('ocr','normalize','match','reprocess') NOT NULL,
 status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
 attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
 available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 locked_at DATETIME(3) NULL,
 last_error TEXT NULL,
 completed_at DATETIME(3) NULL,
 KEY ix_jobs_ready (status,available_at),
 KEY ix_jobs_receipt (user_id,receipt_id),
 CONSTRAINT fk_jobs_receipt FOREIGN KEY (user_id,receipt_id) REFERENCES receipts(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
