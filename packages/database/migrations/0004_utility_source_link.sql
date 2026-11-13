-- Guard links between one utility bill and one user-owned utility statement.
-- This only adds constraints and does not modify existing bill amounts or statuses.
ALTER TABLE utility_bills
  ADD UNIQUE KEY uq_utility_owner_source (user_id, source_receipt_id),
  ADD CONSTRAINT fk_utility_source_receipt
  FOREIGN KEY (user_id, source_receipt_id)
  REFERENCES receipts (user_id, id);
