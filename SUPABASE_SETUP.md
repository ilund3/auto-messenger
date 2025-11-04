# Supabase Setup Guide

This guide will help you set up Supabase for the Auto Messenger application.

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - Name: `auto-messenger` (or your preferred name)
   - Database Password: (choose a strong password)
   - Region: (choose the closest region)
5. Click "Create new project"
6. Wait for the project to be provisioned (this takes a few minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, click on the "Settings" icon (gear icon) in the sidebar
2. Click on "API" in the settings menu
3. You'll see:
   - **Project URL** - Copy this as your `SUPABASE_URL`
   - **anon/public key** - Copy this as your `SUPABASE_ANON_KEY`

## Step 3: Create the Database Tables

1. In your Supabase dashboard, click on "SQL Editor" in the sidebar
2. Click "New Query"
3. Open the file `supabase-migration.sql` from this project
4. Copy and paste the entire SQL script into the SQL Editor
5. Click "Run" (or press Ctrl/Cmd + Enter)
6. You should see a success message

## Step 4: Set Environment Variables

### For Local Development:

Create a `.env` file in the project root:

```env
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
PORT=3000
```

### For Vercel Deployment:

1. Go to your Vercel project dashboard
2. Click on "Settings" → "Environment Variables"
3. Add the following variables:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key
4. Redeploy your application

## Step 5: Test the Connection

1. Start your local server: `npm start`
2. Try uploading a CSV file or creating a campaign
3. Check your Supabase dashboard → "Table Editor" to see if data is being inserted

## Troubleshooting

- **Missing credentials error**: Make sure your `.env` file exists and contains the correct values
- **Connection errors**: Verify your Supabase project is running and the URL/key are correct
- **Table errors**: Make sure you've run the migration script in the SQL Editor
- **Permission errors**: Check that your `anon` key has the correct RLS (Row Level Security) policies if you've enabled them

## Security Notes

- The `anon` key is safe to use in client-side code, but for production, you may want to set up Row Level Security (RLS) policies
- Never commit your `.env` file to version control
- Consider using Supabase's service role key for admin operations (server-side only)


