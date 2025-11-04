# Vercel Deployment Guide

## Setting Environment Variables

The most common cause of the "500: INTERNAL_SERVER_ERROR" on Vercel is missing environment variables. Follow these steps:

### Step 1: Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

   - **Key:** `SUPABASE_URL`
     **Value:** `https://urkxnommcozfvijxigle.supabase.co`
     (or your actual Supabase project URL)

   - **Key:** `SUPABASE_ANON_KEY`
     **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVya3hub21tY296ZnZpanhpZ2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDQ5MTgsImV4cCI6MjA3NzY4MDkxOH0.10D0Acy53teDHDXOjtnIWfzo8a3an574Liq6GSoOYZg`
     (or your actual anon key)

5. Make sure to select **Production**, **Preview**, and **Development** environments (or at least Production)
6. Click **Save**

### Step 2: Redeploy

After adding the environment variables:

1. Go to the **Deployments** tab
2. Click the **⋯** (three dots) menu on your latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new deployment

### Step 3: Verify

Once redeployed, your app should work without the 500 error. If you still see errors:

1. Check the **Functions** tab in Vercel to see detailed error logs
2. Verify the environment variables are set correctly
3. Make sure your Supabase database tables are created (see `SUPABASE_SETUP.md`)

## Troubleshooting

### Error: "Supabase not configured"
- Ensure environment variables are set in Vercel
- Make sure you selected all environments (Production, Preview, Development)
- Redeploy after adding variables

### Error: "Table doesn't exist"
- Run the migration script in Supabase (see `supabase-migration.sql`)
- Check your Supabase dashboard → Table Editor

### Error: "Connection refused"
- Verify your Supabase URL is correct
- Check that your Supabase project is active

## Notes

- Environment variables set in Vercel are automatically available to your serverless functions
- No `.env` file is needed for Vercel deployments
- The `.env` file is only for local development

