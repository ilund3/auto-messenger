-- Migration to add dynamic columns support
-- Run this in your Supabase SQL Editor to update the contacts table

-- Add a JSONB column to store all dynamic CSV columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Make first_name, company, and use_ai optional (remove NOT NULL constraints)
-- Note: If you already have data, you may need to handle NULL values
ALTER TABLE contacts ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE contacts ALTER COLUMN company DROP NOT NULL;
ALTER TABLE contacts ALTER COLUMN use_ai SET DEFAULT FALSE;

-- Create an index on custom_fields for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields ON contacts USING GIN (custom_fields);


