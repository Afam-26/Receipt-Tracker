ALTER TABLE receipts MODIFY COLUMN receipt_type ENUM('grocery','gas','mixed','unknown','utility') NOT NULL DEFAULT 'unknown';
