-- Supabase Migration Script
-- Run this in your Supabase SQL Editor to create the tables

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  first_name TEXT NOT NULL,
  company TEXT NOT NULL,
  city TEXT,
  use_ai BOOLEAN DEFAULT FALSE,
  use_ai_text TEXT,
  responded BOOLEAN DEFAULT FALSE,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  followup_messages TEXT,
  followup_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign_messages table
CREATE TABLE IF NOT EXISTS campaign_messages (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ,
  sent_time TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  message_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_responded ON contacts(responded);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_contact_id ON campaign_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(status);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_scheduled_time ON campaign_messages(scheduled_time);


