-- Supabase migration for campaign segmentation by upload batches and row ranges

-- Add batch metadata columns to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS upload_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS upload_file_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_row_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_contacts_upload_batch ON contacts(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_contacts_batch_row ON contacts(upload_batch_id, batch_row_number);

-- Add segmentation metadata to campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS contact_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS range_start INTEGER,
  ADD COLUMN IF NOT EXISTS range_end INTEGER;

CREATE INDEX IF NOT EXISTS idx_campaigns_batch ON campaigns(contact_batch_id);


