-- Supabase RLS (Row Level Security) Policies for Auto Messenger
-- Run this in your Supabase SQL Editor to enable DELETE operations

-- First, check if RLS is enabled on the contacts table
-- If RLS is blocking deletes, you need to either:
-- 1. Disable RLS (not recommended for production)
-- 2. Create policies that allow DELETE operations (recommended)

-- Option 1: Disable RLS on contacts table (for development only)
-- ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;

-- Option 2: Create a policy that allows DELETE operations (recommended)
-- This allows authenticated users (via anon key) to delete their own contacts

-- Check if policies exist
DO $$
BEGIN
  -- Allow DELETE for all operations (using anon key)
  -- This is permissive but needed for the app to work
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'contacts' 
    AND policyname = 'Allow delete contacts'
  ) THEN
    CREATE POLICY "Allow delete contacts" ON contacts
      FOR DELETE
      USING (true); -- Allow all deletes when using anon key
  END IF;

  -- Also ensure INSERT and UPDATE are allowed
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'contacts' 
    AND policyname = 'Allow insert contacts'
  ) THEN
    CREATE POLICY "Allow insert contacts" ON contacts
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'contacts' 
    AND policyname = 'Allow update contacts'
  ) THEN
    CREATE POLICY "Allow update contacts" ON contacts
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'contacts' 
    AND policyname = 'Allow select contacts'
  ) THEN
    CREATE POLICY "Allow select contacts" ON contacts
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;


