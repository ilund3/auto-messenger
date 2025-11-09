// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const cron = require('node-cron');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Determine base directory - use process.cwd() for Vercel, __dirname for local
const baseDir = isVercel ? process.cwd() : __dirname;
const publicDir = path.join(baseDir, 'public');
const uploadsDir = path.join(baseDir, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ Missing Supabase credentials!');
  console.error('Please create a .env file in the project root with:');
  console.error('  SUPABASE_URL=your_supabase_project_url_here');
  console.error('  SUPABASE_ANON_KEY=your_supabase_anon_key_here');
  console.error('\nSee SUPABASE_SETUP.md for detailed instructions.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files, but skip API routes
const staticMiddleware = express.static(publicDir);
app.use((req, res, next) => {
  // Skip static file serving for API routes (but allow static files like .html, .css, .js)
  const path = req.path;
  const isApiRoute = (
    (path.startsWith('/campaigns') && !path.includes('.')) ||
    (path.startsWith('/contacts') && !path.includes('.')) ||
    path.startsWith('/upload-csv') ||
    path.startsWith('/clear-all-data')
  );
  
  if (isApiRoute) {
    return next();
  }
  staticMiddleware(req, res, next);
});

// Configure multer for file uploads
const upload = multer({ dest: uploadsDir });

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Upload CSV endpoint
app.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const contacts = [];
  const skippedRows = [];

  // Generate a batch identifier so we can segment contacts later
  const uploadBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const uploadFileName = req.file.originalname || 'Manual Upload';

  const phoneColumnCandidates = [
    'phone',
    'phone number',
    'phone_number',
    'phone #',
    'mobile',
    'mobile phone',
    'mobile_phone',
    'mobile phone (global)',
    'mobile phone (us)',
    'mobile phone (direct)',
    'mobile phone (personal)',
    'mobile phone number'
  ];

  const standardFieldAliases = {
    first_name: ['first_name', 'first name', 'firstname'],
    company: ['company', 'company name', 'employer'],
    city: ['city', 'location city', 'town'],
    use_ai: ['use_ai', 'use ai', 'ai', 'enable_ai'],
    use_ai_text: ['use_ai_text', 'use ai text']
  };

  const normalizeValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return value.toString().trim();
  };

  const findValueByAliases = (rowMap, aliases) => {
    for (const alias of aliases) {
      const lowerAlias = alias.toLowerCase();
      if (rowMap.has(lowerAlias)) {
        return { key: rowMap.get(lowerAlias).key, value: rowMap.get(lowerAlias).value };
      }
    }
    return { key: null, value: '' };
  };

  try {
    let rowIndex = 0;

    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          rowIndex += 1;

          const trimmedRow = new Map();
          const originalRow = {};

          Object.entries(row || {}).forEach(([rawKey, rawValue]) => {
            if (!rawKey) return;
            const trimmedKey = rawKey.trim();
            if (!trimmedKey) return;
            const normalizedKey = trimmedKey.toLowerCase();
            const normalizedValue = normalizeValue(rawValue);

            originalRow[trimmedKey] = normalizedValue;
            if (!trimmedRow.has(normalizedKey)) {
              trimmedRow.set(normalizedKey, { key: trimmedKey, value: normalizedValue });
            }
          });

          const allValuesEmpty = Object.values(originalRow).every((val) => !val);
          if (allValuesEmpty) {
            skippedRows.push({ row: rowIndex, reason: 'Row was blank' });
            return;
          }

          let phoneValue = '';
          let phoneKeyUsed = null;
          for (const alias of phoneColumnCandidates) {
            const lowerAlias = alias.toLowerCase();
            if (trimmedRow.has(lowerAlias)) {
              const entry = trimmedRow.get(lowerAlias);
              phoneValue = entry.value;
              phoneKeyUsed = entry.key;
              break;
            }
          }

          if (!phoneValue) {
            skippedRows.push({ row: rowIndex, reason: 'Missing phone number', data: originalRow });
            return;
          }

          const usedKeys = new Set();
          if (phoneKeyUsed) {
            usedKeys.add(phoneKeyUsed);
          }

          const standardFieldOriginalKeys = {};

          const getStandardField = (fieldName) => {
            const aliases = standardFieldAliases[fieldName];
            if (!aliases) return { key: null, value: '' };
            const { key, value } = findValueByAliases(trimmedRow, aliases);
            if (key) {
              usedKeys.add(key);
            }
            return { key, value };
          };

          const firstNameField = getStandardField('first_name');
          const companyField = getStandardField('company');
          const cityField = getStandardField('city');
          const useAiField = getStandardField('use_ai');
          const useAiTextField = getStandardField('use_ai_text');

          if (firstNameField.key && firstNameField.value) {
            standardFieldOriginalKeys[firstNameField.key] = firstNameField.value;
          }
          if (companyField.key && companyField.value) {
            standardFieldOriginalKeys[companyField.key] = companyField.value;
          }
          if (cityField.key && cityField.value) {
            standardFieldOriginalKeys[cityField.key] = cityField.value;
          }
          if (useAiField.key && useAiField.value) {
            standardFieldOriginalKeys[useAiField.key] = useAiField.value;
          }
          if (useAiTextField.key && useAiTextField.value) {
            standardFieldOriginalKeys[useAiTextField.key] = useAiTextField.value;
          }

          const customFields = {};
          Object.entries(originalRow).forEach(([key, value]) => {
            if (!value) {
              return;
            }
            if (usedKeys.has(key)) {
              return;
            }
            customFields[key] = value;
          });

          if (phoneKeyUsed && phoneValue) {
            customFields[phoneKeyUsed] = phoneValue;
          }

          Object.entries(standardFieldOriginalKeys).forEach(([key, value]) => {
            if (!value) return;
            customFields[key] = value;
          });

          contacts.push({
            phone: phoneValue,
            first_name: firstNameField.value || null,
            company: companyField.value || null,
            city: cityField.value || null,
            use_ai_raw: useAiField.value || '',
            use_ai_text: useAiTextField.value || useAiField.value || null,
            custom_fields: customFields,
            upload_batch_id: uploadBatchId,
            upload_file_name: uploadFileName
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (contacts.length === 0) {
      return res.status(400).json({
        error: 'No valid contacts found in CSV',
        skipped: skippedRows.length,
        skipped_details: skippedRows.slice(0, 10)
      });
    }

    // Prepare contacts for insertion
    const contactsToInsert = contacts.map((contact, index) => {
      const useAiNormalized = contact.use_ai_raw.toString().toLowerCase();
      const useAiBoolean = ['true', '1', 'yes', 'y', 'on'].includes(useAiNormalized);

      const customFieldsObject = contact.custom_fields && Object.keys(contact.custom_fields).length > 0
        ? contact.custom_fields
        : null;

      return {
        phone: contact.phone,
        first_name: contact.first_name || null,
        company: contact.company || null,
        city: contact.city || null,
        use_ai: useAiBoolean,
        use_ai_text: contact.use_ai_text || null,
        custom_fields: customFieldsObject,
        upload_batch_id: contact.upload_batch_id,
        upload_file_name: contact.upload_file_name,
        batch_row_number: index + 1
      };
    });

    // Insert contacts into database using Supabase
    const { error } = await supabase
      .from('contacts')
      .insert(contactsToInsert);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      message: `Successfully uploaded ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`,
      count: contacts.length,
      batch_id: uploadBatchId,
      file_name: uploadFileName,
      skipped: skippedRows.length,
      skipped_details: skippedRows.slice(0, 10)
    });
  } catch (err) {
    // Clean up uploaded file if it still exists
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    res.status(500).json({ error: 'Error processing CSV file: ' + err.message });
  }
});

// Get all contacts
app.get('/contacts', async (req, res) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data || []);
});

// Get summaries of contact upload batches
app.get('/contacts/batches', async (req, res) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, upload_batch_id, upload_file_name, batch_row_number, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const batchesMap = new Map();

  data.forEach(contact => {
    const batchKey = contact.upload_batch_id || 'default';
    const batchRecord = batchesMap.get(batchKey) || {
      batch_id: contact.upload_batch_id || null,
      label: contact.upload_file_name || 'All Contacts',
      file_name: contact.upload_file_name || 'All Contacts',
      total_contacts: 0,
      min_row: Number.POSITIVE_INFINITY,
      max_row: Number.NEGATIVE_INFINITY,
      has_row_numbers: Boolean(contact.batch_row_number),
      created_at: contact.created_at,
      _dynamic_row_counter: 0
    };

    // Determine row number (fallback to dynamic counter if missing)
    let rowNumber = contact.batch_row_number;
    if (rowNumber === null || rowNumber === undefined) {
      batchRecord._dynamic_row_counter += 1;
      rowNumber = batchRecord._dynamic_row_counter;
      batchRecord.has_row_numbers = false;
    }

    batchRecord.total_contacts += 1;
    batchRecord.min_row = Math.min(batchRecord.min_row, rowNumber);
    batchRecord.max_row = Math.max(batchRecord.max_row, rowNumber);
    if (!batchRecord.created_at || contact.created_at < batchRecord.created_at) {
      batchRecord.created_at = contact.created_at;
    }

    batchesMap.set(batchKey, batchRecord);
  });

  const batches = Array.from(batchesMap.values()).map(batch => ({
    batch_id: batch.batch_id,
    label: batch.batch_id ? `${batch.file_name || 'Upload'} (${batch.total_contacts} contacts)` : `${batch.file_name} (${batch.total_contacts} contacts)` ,
    file_name: batch.file_name,
    total_contacts: batch.total_contacts,
    min_row: batch.min_row === Number.POSITIVE_INFINITY ? 0 : batch.min_row,
    max_row: batch.max_row === Number.NEGATIVE_INFINITY ? 0 : batch.max_row,
    has_row_numbers: batch.has_row_numbers,
    created_at: batch.created_at
  }));

  // Sort batches by created_at descending so newest uploads appear first
  batches.sort((a, b) => {
    if (!a.created_at && !b.created_at) return 0;
    if (!a.created_at) return 1;
    if (!b.created_at) return -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  res.json(batches);
});

// Delete a batch and all its contacts
app.delete('/contacts/batches/:batchId', async (req, res) => {
  console.log(`DELETE /contacts/batches/${req.params.batchId} - Method: ${req.method}, Path: ${req.path}`);
  const batchId = req.params.batchId;

  if (!batchId || batchId === 'default' || batchId === 'null') {
    console.error('Invalid batch ID:', batchId);
    return res.status(400).json({ error: 'Invalid batch ID. Cannot delete default or null batches.' });
  }

  try {
    // First, check if batch exists and get count
    const { count: contactCount, error: countError } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('upload_batch_id', batchId);

    if (countError) {
      return res.status(500).json({ error: countError.message });
    }

    if (!contactCount || contactCount === 0) {
      return res.status(404).json({ error: 'Batch not found or already deleted' });
    }

    // Check if any campaigns are using this batch
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('contact_batch_id', batchId);

    if (campaignsError) {
      return res.status(500).json({ error: campaignsError.message });
    }

    if (campaigns && campaigns.length > 0) {
      const campaignNames = campaigns.map(c => c.name).join(', ');
      return res.status(400).json({ 
        error: `Cannot delete batch: ${campaigns.length} campaign(s) are using this batch: ${campaignNames}. Please delete or update those campaigns first.` 
      });
    }

    // Delete all contacts in this batch
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('upload_batch_id', batchId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    res.json({ 
      message: `Batch deleted successfully. ${contactCount} contact(s) removed.`,
      deleted_count: contactCount
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Preview contacts for a specific batch and row range
app.get('/contacts/batches/:batchId/preview', async (req, res) => {
  const rawBatchId = req.params.batchId;
  const { start, end } = req.query;

  if (!rawBatchId || rawBatchId === 'all') {
    return res.status(400).json({ error: 'A valid batch ID is required for previews.' });
  }

  const batchId = (rawBatchId === 'null' || rawBatchId === 'default') ? null : rawBatchId;

  const startRow = start ? parseInt(start, 10) : null;
  const endRow = end ? parseInt(end, 10) : null;

  if (!Number.isInteger(startRow) || !Number.isInteger(endRow)) {
    return res.status(400).json({ error: 'Start and end row numbers are required.' });
  }

  if (startRow <= 0 || endRow <= 0 || startRow > endRow) {
    return res.status(400).json({ error: 'Invalid row range specified.' });
  }

  const buildQuery = (ascending = true) => {
    let query = supabase
      .from('contacts')
      .select('id, phone, first_name, company, city, use_ai_text, use_ai, custom_fields, batch_row_number, upload_batch_id')
      .gte('batch_row_number', startRow)
      .lte('batch_row_number', endRow)
      .order('batch_row_number', { ascending });

    if (batchId) {
      query = query.eq('upload_batch_id', batchId);
    } else {
      query = query.is('upload_batch_id', null);
    }

    return query.limit(3);
  };

  const firstQuery = buildQuery(true);
  const lastQuery = buildQuery(false);

  const countQuery = batchId
    ? supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('upload_batch_id', batchId)
        .gte('batch_row_number', startRow)
        .lte('batch_row_number', endRow)
    : supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('upload_batch_id', null)
        .gte('batch_row_number', startRow)
        .lte('batch_row_number', endRow);

  const [{ data: firstSamples, error: firstError }, { data: lastSamples, error: lastError }, { count, error: countError }] = await Promise.all([
    firstQuery,
    lastQuery,
    countQuery
  ]);

  if (firstError || lastError || countError) {
    return res.status(500).json({ error: (firstError || lastError || countError).message });
  }

  const lastSamplesAscending = (lastSamples || []).slice().reverse();

  res.json({
    batch_id: batchId,
    start: startRow,
    end: endRow,
    total_in_range: count || 0,
    first_samples: firstSamples || [],
    last_samples: lastSamplesAscending
  });
});

// Get available placeholders/columns for a batch
app.get('/contacts/batches/:batchId/placeholders', async (req, res) => {
  const rawBatchId = req.params.batchId;

  if (!rawBatchId || rawBatchId === 'default') {
    return res.status(400).json({ error: 'A valid batch ID is required to load placeholders.' });
  }

  const batchId = rawBatchId === 'null' ? null : rawBatchId;

  let query = supabase
    .from('contacts')
    .select('phone, first_name, company, city, use_ai_text, use_ai, custom_fields')
    .order('batch_row_number', { ascending: true })
    .limit(1000);

  if (batchId) {
    query = query.eq('upload_batch_id', batchId);
  } else {
    query = query.is('upload_batch_id', null);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const columnsMap = new Map();
  const normalizedSamples = {};
  (data || []).forEach((row) => {
    if (!row) return;

    if (row.phone) {
      if (!normalizedSamples.phone) normalizedSamples.phone = row.phone;
    }
    if (row.first_name) {
      if (!normalizedSamples.first_name) normalizedSamples.first_name = row.first_name;
    }
    if (row.company) {
      if (!normalizedSamples.company) normalizedSamples.company = row.company;
    }
    if (row.city) {
      if (!normalizedSamples.city) normalizedSamples.city = row.city;
    }
    if (row.use_ai_text) {
      if (!normalizedSamples.use_ai_text) normalizedSamples.use_ai_text = row.use_ai_text;
    } else if (row.use_ai !== undefined && row.use_ai !== null) {
      if (!normalizedSamples.use_ai) normalizedSamples.use_ai = row.use_ai;
    }

    if (row.custom_fields && typeof row.custom_fields === 'object') {
      Object.entries(row.custom_fields).forEach(([key, value]) => {
        if (!key) return;
        const trimmedKey = key.trim();
        if (!trimmedKey) return;

        const normalizedKey = trimmedKey.toLowerCase();
        const sampleValue = value !== undefined && value !== null ? value.toString() : '';
        const existing = columnsMap.get(normalizedKey);

        if (!existing) {
          columnsMap.set(normalizedKey, {
            key: trimmedKey,
            label: trimmedKey,
            sample_value: sampleValue
          });
        } else {
          // Preserve the first encountered key casing, but capture sample data when missing
          if (!existing.sample_value && sampleValue) {
            existing.sample_value = sampleValue;
          }
        }
      });
    }
  });

  const placeholders = Array.from(columnsMap.values()).sort((a, b) =>
    a.key.toLowerCase().localeCompare(b.key.toLowerCase())
  );

  res.json({
    placeholders,
    normalized_samples: normalizedSamples
  });
});

// Create campaign
app.post('/campaigns', async (req, res) => {
  const { 
    name, 
    message, 
    followup_messages, 
    followup_count,
    contact_batch_id,
    range_start,
    range_end
  } = req.body;
  
  if (!name || !message) {
    return res.status(400).json({ error: 'Campaign name and message are required.' });
  }

  // Validate segmentation settings
  let batchId = contact_batch_id;
  if (batchId === '' || batchId === 'null' || batchId === 'default' || batchId === undefined) {
    batchId = null;
  }
  let startRow = range_start !== undefined && range_start !== null ? parseInt(range_start, 10) : null;
  let endRow = range_end !== undefined && range_end !== null ? parseInt(range_end, 10) : null;
  let targetCount = null;

  if (batchId) {
    if (!Number.isInteger(startRow) || !Number.isInteger(endRow)) {
      return res.status(400).json({ error: 'Both start and end rows are required when selecting a batch.' });
    }
    if (startRow <= 0 || endRow <= 0 || startRow > endRow) {
      return res.status(400).json({ error: 'Invalid row range specified.' });
    }

    const { count, error: countError } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('upload_batch_id', batchId)
      .gte('batch_row_number', startRow)
      .lte('batch_row_number', endRow);

    if (countError) {
      return res.status(500).json({ error: countError.message });
    }

    if (!count || count === 0) {
      return res.status(400).json({ error: 'No contacts found for the selected batch and row range.' });
    }

    targetCount = count;
  } else {
    // If no batch specified, ensure no range values were provided
    if (startRow !== null || endRow !== null) {
      return res.status(400).json({ error: 'Row range can only be used when a batch is selected.' });
    }
  }
  
  // Convert followup_messages array to JSON string for storage
  const followupMessagesJson = JSON.stringify(followup_messages || []);
  
  const { data, error } = await supabase
    .from('campaigns')
    .insert([
      {
        name,
        message,
        followup_messages: followupMessagesJson,
        followup_count: followup_count || 0,
        contact_batch_id: batchId,
        range_start: batchId ? startRow : null,
        range_end: batchId ? endRow : null
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json({ 
    id: data.id, 
    message: 'Campaign created successfully',
    target_count: targetCount
  });
});

// Get all campaigns
app.get('/campaigns', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data || []);
});

// Update a campaign (draft campaigns can edit everything, active campaigns can only edit followup messages)
app.put('/campaigns/:id', async (req, res) => {
  console.log(`PUT /campaigns/${req.params.id} - Method: ${req.method}, Path: ${req.path}`);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  const campaignId = parseInt(req.params.id);
  const { name, message, followup_messages, followup_count } = req.body;

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    console.error('Invalid campaign ID:', campaignId);
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  try {
    // Check if campaign exists
    const { data: existingCampaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('status, followup_count')
      .eq('id', campaignId)
      .single();

    if (fetchError) {
      console.error('Error fetching campaign:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }

    if (!existingCampaign) {
      console.error('Campaign not found:', campaignId);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const isDraft = existingCampaign.status === 'draft';
    const isActive = existingCampaign.status === 'active';

    console.log('Campaign status:', existingCampaign.status, 'isDraft:', isDraft, 'isActive:', isActive);

    // For active campaigns, only allow editing followup messages
    if (!isDraft && !isActive) {
      console.error('Campaign cannot be edited:', existingCampaign.status);
      return res.status(400).json({ error: 'Only draft and active campaigns can be edited.' });
    }

    // Validate required fields for draft campaigns
    if (isDraft && (!name || !message)) {
      console.error('Missing required fields for draft campaign:', { name: !!name, message: !!message });
      return res.status(400).json({ error: 'Campaign name and message are required for draft campaigns.' });
    }

    // Validate followup_messages for active campaigns
    if (isActive && (followup_messages === undefined || followup_messages === null)) {
      console.error('Missing followup_messages for active campaign');
      return res.status(400).json({ error: 'Followup messages are required for active campaigns.' });
    }
    
    // Ensure followup_messages is an array
    if (isActive && !Array.isArray(followup_messages)) {
      console.error('followup_messages is not an array:', typeof followup_messages);
      return res.status(400).json({ error: 'Followup messages must be an array.' });
    }

    // Convert followup_messages array to JSON string for storage
    const followupMessagesJson = JSON.stringify(followup_messages || []);

    // Build update object based on campaign status
    const updateData = {};
    
    if (isDraft) {
      // Draft campaigns can edit everything
      updateData.name = name;
      updateData.message = message;
      updateData.followup_messages = followupMessagesJson;
      updateData.followup_count = followup_count !== undefined ? followup_count : 0;
    } else if (isActive) {
      // Active campaigns can only edit followup messages
      updateData.followup_messages = followupMessagesJson;
      // Allow updating followup_count
      if (followup_count !== undefined && followup_count !== null) {
        updateData.followup_count = followup_count;
      } else {
        // Keep existing followup_count if not provided
        updateData.followup_count = existingCampaign.followup_count || 0;
      }
    }

    console.log('Update data:', JSON.stringify(updateData, null, 2));

    // Update the campaign
    const { data, error: updateError } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // If this is an active campaign and followup messages were updated, update stored messages
    if (isActive && followup_messages && Array.isArray(followup_messages)) {
      try {
        // Get all stored followup messages for this campaign
        const { data: storedMessages, error: storedError } = await supabase
          .from('campaign_messages')
          .select(`
            *,
            contacts (
              id,
              phone,
              first_name,
              company,
              city,
              use_ai_text,
              use_ai,
              custom_fields
            )
          `)
          .eq('campaign_id', campaignId)
          .like('message_type', 'followup_%')
          .eq('status', 'stored');

        if (storedError) {
          console.error('Error fetching stored messages:', storedError);
          // Don't fail the update, just log the error
        } else if (storedMessages && storedMessages.length > 0) {
          // Group messages by followup number
          const messagesByFollowup = {};
          storedMessages.forEach(msg => {
            const followupNum = msg.message_type.replace('followup_', '');
            if (!messagesByFollowup[followupNum]) {
              messagesByFollowup[followupNum] = [];
            }
            messagesByFollowup[followupNum].push(msg);
          });

          // Update each stored message with the new personalized text
          for (const [followupNum, messages] of Object.entries(messagesByFollowup)) {
            const followupIndex = parseInt(followupNum) - 1;
            if (followupIndex >= 0 && followupIndex < followup_messages.length) {
              const updatedTemplate = followup_messages[followupIndex];
              
              // Update each stored message with personalized version
              for (const msg of messages) {
                if (msg.contacts) {
                  const personalizedMessage = replacePlaceholders(updatedTemplate, msg.contacts);
                  
                  await supabase
                    .from('campaign_messages')
                    .update({ message_text: personalizedMessage })
                    .eq('id', msg.id);
                }
              }
            }
          }
          
          console.log(`Updated ${storedMessages.length} stored followup messages with new templates`);
        }
      } catch (updateMsgError) {
        console.error('Error updating stored messages:', updateMsgError);
        // Don't fail the campaign update, just log the error
      }
    }

    res.json({ 
      id: data.id, 
      message: 'Campaign updated successfully'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete a campaign
app.delete('/campaigns/:id', async (req, res) => {
  console.log(`DELETE /campaigns/${req.params.id} - Method: ${req.method}`);
  
  const campaignId = parseInt(req.params.id);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  try {
    // First, delete all campaign messages associated with this campaign
    const { error: messagesError } = await supabase
      .from('campaign_messages')
      .delete()
      .eq('campaign_id', campaignId);

    if (messagesError) {
      console.error('Error deleting campaign messages:', messagesError);
      return res.status(500).json({ error: `Error deleting campaign messages: ${messagesError.message}` });
    }

    // Then delete the campaign itself
    const { error: campaignError } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (campaignError) {
      console.error('Error deleting campaign:', campaignError);
      return res.status(500).json({ error: `Error deleting campaign: ${campaignError.message}` });
    }

    console.log(`Successfully deleted campaign ${campaignId}`);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Exception deleting campaign:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper function to replace placeholders in messages with contact data
function replacePlaceholders(message, contact) {
  let result = message;
  
  // Replace standard fields
  if (contact.phone) result = result.replace(/{phone}/g, contact.phone);
  if (contact.first_name) result = result.replace(/{first_name}/g, contact.first_name);
  if (contact.company) result = result.replace(/{company}/g, contact.company);
  if (contact.city) result = result.replace(/{city}/g, contact.city);
  if (contact.use_ai_text) result = result.replace(/{use_ai}/g, contact.use_ai_text);
  else if (contact.use_ai) result = result.replace(/{use_ai}/g, contact.use_ai);
  
  // Replace custom fields from JSONB
  if (contact.custom_fields && typeof contact.custom_fields === 'object') {
    for (const [key, value] of Object.entries(contact.custom_fields)) {
      const placeholder = `{${key}}`;
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedPlaceholder, 'g'), value || '');
    }
  }
  
  return result;
}

// Helper function to sleep/delay execution
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send campaign
app.post('/campaigns/:id/send', async (req, res) => {
  const campaignId = parseInt(req.params.id);
  const { delay_seconds = 0 } = req.body;
  const delayMs = delay_seconds * 1000;
  
  try {
    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      return res.status(500).json({ error: campaignError.message });
    }
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get all contacts that haven't responded
    let contactsQuery = supabase
      .from('contacts')
      .select('*')
      .eq('responded', false);

    if (campaign.contact_batch_id) {
      contactsQuery = contactsQuery.eq('upload_batch_id', campaign.contact_batch_id);
      if (campaign.range_start !== null && campaign.range_start !== undefined) {
        contactsQuery = contactsQuery.gte('batch_row_number', campaign.range_start);
      }
      if (campaign.range_end !== null && campaign.range_end !== undefined) {
        contactsQuery = contactsQuery.lte('batch_row_number', campaign.range_end);
      }
      contactsQuery = contactsQuery.order('batch_row_number', { ascending: true, nullsLast: true });
    } else {
      contactsQuery = contactsQuery.order('created_at', { ascending: true });
    }

    const { data: contacts, error: contactsError } = await contactsQuery;

    if (contactsError) {
      return res.status(500).json({ error: contactsError.message });
    }

    // Parse followup messages from JSON
    const followupMessages = JSON.parse(campaign.followup_messages || '[]');
    
    // Prepare messages for sending and storage
    const messagesToSend = [];
    const messagesToStore = [];
    const now = new Date();
    
    contacts.forEach(contact => {
      // Replace placeholders in main message using the helper function
      let personalizedMessage = replacePlaceholders(campaign.message, contact);

      // Prepare initial message for immediate sending
      messagesToSend.push({
        contact: contact,
        message_text: personalizedMessage,
        message_type: 'initial'
      });

      // Store followup messages for manual sending
      for (let i = 1; i <= campaign.followup_count; i++) {
        // Use custom followup message if available, otherwise use main message
        let followupMessage = personalizedMessage;
        if (followupMessages[i - 1]) {
          followupMessage = replacePlaceholders(followupMessages[i - 1], contact);
        }
        
        messagesToStore.push({
          campaign_id: campaignId,
          contact_id: contact.id,
          message_text: followupMessage,
          scheduled_time: null,
          status: 'stored',
          message_type: `followup_${i}`
        });
      }
    });

    // Store followup messages in database
    if (messagesToStore.length > 0) {
      const { error: insertError } = await supabase
        .from('campaign_messages')
        .insert(messagesToStore);

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }
    }

    // Update campaign status
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaignId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Send immediate response to client
    res.json({ 
      message: `Campaign started! Sending ${messagesToSend.length} initial message(s) with ${delay_seconds} second(s) delay between each.`,
      initial_count: messagesToSend.length,
      followup_count: messagesToStore.length,
      contact_batch_id: campaign.contact_batch_id,
      range_start: campaign.range_start,
      range_end: campaign.range_end
    });

    // Send messages sequentially with delays in the background
    (async () => {
      let sentCount = 0;
      let failedCount = 0;
      
      for (let i = 0; i < messagesToSend.length; i++) {
        const msg = messagesToSend[i];
        
        // Wait before sending (except for first message)
        if (i > 0 && delayMs > 0) {
          console.log(`⏳ Waiting ${delay_seconds} second(s) before sending next message...`);
          await sleep(delayMs);
        }
        
        try {
          console.log(`📤 Sending message ${i + 1}/${messagesToSend.length} to ${msg.contact.phone}...`);
          await sendMessage(msg.contact.phone, msg.message_text);
          
          // Store sent message in database
          await supabase
            .from('campaign_messages')
            .insert({
              campaign_id: campaignId,
              contact_id: msg.contact.id,
              message_text: msg.message_text,
              scheduled_time: now.toISOString(),
              status: 'sent',
              sent_time: new Date().toISOString(),
              message_type: msg.message_type
            });
          
          sentCount++;
          console.log(`✅ Message ${i + 1}/${messagesToSend.length} sent successfully`);
        } catch (error) {
          console.error(`❌ Failed to send message ${i + 1}/${messagesToSend.length} to ${msg.contact.phone}:`, error);
          
          // Store failed message in database
          await supabase
            .from('campaign_messages')
            .insert({
              campaign_id: campaignId,
              contact_id: msg.contact.id,
              message_text: msg.message_text,
              scheduled_time: now.toISOString(),
              status: 'failed',
              message_type: msg.message_type
            });
          
          failedCount++;
        }
      }
      
      console.log(`\n📊 Campaign sending complete: ${sentCount} sent, ${failedCount} failed`);
    })();
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Function to send message via macOS Messages
// Always sends via SMS (no iMessage attempts)
function sendMessage(phone, message) {
  return new Promise((resolve, reject) => {
    console.log(`\n📤 Sending SMS message to ${phone}`);
    
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `message_${Date.now()}.scpt`);
    
    // Escape message for AppleScript (escape backslashes first, then quotes)
    const escapedMessage = message
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/"/g, '\\"');    // Then escape quotes
    const escapedPhone = phone.replace(/"/g, '\\"');
    
    // Always send via SMS service
    const scriptContent = `tell application "Messages"
  try
    set smsService to 1st service whose service type = SMS
    set targetBuddy to participant "${escapedPhone}" of smsService
    send "${escapedMessage}" to targetBuddy
    return "SMS"
  on error errMsg
    error "Failed to send via SMS: " & errMsg
  end try
end tell`;
    
    // Write script to temporary file
    fs.writeFileSync(scriptPath, scriptContent);
    
    // Execute the script
    exec(`osascript "${scriptPath}"`, (error, stdout, stderr) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(scriptPath);
      } catch (cleanupError) {
        console.warn('Could not clean up temporary script file:', cleanupError);
      }
      
      if (error) {
        console.error(`❌ Error sending SMS to ${phone}:`, error);
        console.error('stderr:', stderr);
        console.error('Message content:', message);
        reject(error);
      } else {
        console.log(`✅ SMS sent to ${phone}`);
        resolve('SMS');
      }
    });
  });
}

// Check for scheduled messages every minute (only in non-Vercel environments)
// Note: Cron jobs won't work on Vercel - consider using Vercel Cron Jobs instead
if (!isVercel) {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    
    try {
      // Get pending messages scheduled for now or earlier
      const { data: messages, error: messagesError } = await supabase
        .from('campaign_messages')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_time', now.toISOString());

      if (messagesError) {
        console.error('Error checking scheduled messages:', messagesError);
        return;
      }

      if (!messages || messages.length === 0) return;

      // Load contacts for this batch of messages
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*');

      if (contactsError) {
        console.error('Error loading contacts for message sending:', contactsError);
        return;
      }

      messages.forEach(async (msg) => {
        // Get the contact's phone number for this message
        const contact = contacts.find(c => c.id === msg.contact_id);
        if (contact) {
          // The message_text is already personalized, so send it directly
          sendMessage(contact.phone, msg.message_text)
            .then(async () => {
              // Update message status to sent
              await supabase
                .from('campaign_messages')
                .update({ 
                  status: 'sent',
                  sent_time: now.toISOString()
                })
                .eq('id', msg.id);
            })
            .catch(async (err) => {
              console.error(`Failed to send message ${msg.id}:`, err);
              // Update status to failed
              await supabase
                .from('campaign_messages')
                .update({ status: 'failed' })
                .eq('id', msg.id);
            });
        } else {
          console.error(`Contact not found for message ${msg.id}`);
          await supabase
            .from('campaign_messages')
            .update({ status: 'failed' })
            .eq('id', msg.id);
        }
      });
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });
}

// Get campaign messages
app.get('/campaigns/:id/messages', async (req, res) => {
  const campaignId = parseInt(req.params.id);
  
  const { data, error } = await supabase
    .from('campaign_messages')
    .select(`
      *,
      contacts (
        phone,
        first_name,
        company
      )
    `)
    .eq('campaign_id', campaignId)
    .order('scheduled_time', { ascending: true, nullsFirst: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Flatten the joined data to match the original format
  const formattedData = data.map(msg => ({
    ...msg,
    phone: msg.contacts?.phone,
    first_name: msg.contacts?.first_name,
    company: msg.contacts?.company
  }));

  res.json(formattedData || []);
});

// Send followup messages manually
app.post('/campaigns/:id/send-followup/:followupNumber', async (req, res) => {
  const campaignId = parseInt(req.params.id);
  const followupNumber = req.params.followupNumber;
  const { delay_seconds = 0 } = req.body;
  const delayMs = delay_seconds * 1000;
  
  try {
    // Get stored followup messages for this campaign and followup number
    const { data: messages, error: messagesError } = await supabase
      .from('campaign_messages')
      .select(`
        *,
        contacts (
          phone,
          first_name,
          company,
          city,
          use_ai_text,
          use_ai,
          responded
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('message_type', `followup_${followupNumber}`)
      .eq('status', 'stored');

    if (messagesError) {
      return res.status(500).json({ error: messagesError.message });
    }

    // Filter out contacts that have responded
    const activeMessages = messages.filter(msg => !msg.contacts?.responded);

    if (activeMessages.length === 0) {
      return res.json({ message: 'No followup messages found or all contacts have responded' });
    }

    // Send immediate response to client
    res.json({ 
      message: `Followup ${followupNumber} started! Sending ${activeMessages.length} message(s) with ${delay_seconds} second(s) delay between each.`,
      total: activeMessages.length
    });

    // Send messages sequentially with delays in the background
    (async () => {
      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < activeMessages.length; i++) {
        const msg = activeMessages[i];
        
        // Wait before sending (except for first message)
        if (i > 0 && delayMs > 0) {
          console.log(`⏳ Waiting ${delay_seconds} second(s) before sending next followup message...`);
          await sleep(delayMs);
        }
        
        try {
          console.log(`📤 Sending followup ${followupNumber} message ${i + 1}/${activeMessages.length} to ${msg.contacts.phone}...`);
          await sendMessage(msg.contacts.phone, msg.message_text);
          
          // Update message status to sent
          await supabase
            .from('campaign_messages')
            .update({ 
              status: 'sent',
              sent_time: new Date().toISOString()
            })
            .eq('id', msg.id);
          
          sentCount++;
          console.log(`✅ Followup ${followupNumber} message ${i + 1}/${activeMessages.length} sent successfully`);
        } catch (err) {
          console.error(`❌ Failed to send followup ${followupNumber} message ${i + 1}/${activeMessages.length} to ${msg.contacts.phone}:`, err);
          // Update status to failed
          await supabase
            .from('campaign_messages')
            .update({ status: 'failed' })
            .eq('id', msg.id);
          errorCount++;
        }
      }
      
      console.log(`\n📊 Followup ${followupNumber} sending complete: ${sentCount} sent, ${errorCount} failed`);
    })();
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Mark contact as responded
app.post('/contacts/:id/responded', async (req, res) => {
  const contactId = parseInt(req.params.id);
  
  const { data, error } = await supabase
    .from('contacts')
    .update({ responded: true })
    .eq('id', contactId)
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  
  res.json({ message: 'Contact marked as responded' });
});

// Get followup status for a campaign
app.get('/campaigns/:id/followup-status', async (req, res) => {
  const campaignId = parseInt(req.params.id);
  
  const { data: messages, error } = await supabase
    .from('campaign_messages')
    .select('message_type, status')
    .eq('campaign_id', campaignId)
    .like('message_type', 'followup_%');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Group and aggregate by message_type
  const statusMap = {};
  messages.forEach(msg => {
    if (!statusMap[msg.message_type]) {
      statusMap[msg.message_type] = {
        message_type: msg.message_type,
        total: 0,
        stored: 0,
        sent: 0,
        failed: 0
      };
    }
    statusMap[msg.message_type].total++;
    if (msg.status === 'stored') statusMap[msg.message_type].stored++;
    if (msg.status === 'sent') statusMap[msg.message_type].sent++;
    if (msg.status === 'failed') statusMap[msg.message_type].failed++;
  });

  const result = Object.values(statusMap).sort((a, b) => 
    a.message_type.localeCompare(b.message_type)
  );

  res.json(result);
});

// Clear all data
app.post('/clear-all-data', async (req, res) => {
  try {
    // Delete in order due to foreign key constraints
    const { error: messagesError } = await supabase
      .from('campaign_messages')
      .delete()
      .neq('id', 0); // Delete all

    if (messagesError) {
      return res.status(500).json({ error: messagesError.message });
    }

    const { error: campaignsError } = await supabase
      .from('campaigns')
      .delete()
      .neq('id', 0);

    if (campaignsError) {
      return res.status(500).json({ error: campaignsError.message });
    }

    const { error: contactsError } = await supabase
      .from('contacts')
      .delete()
      .neq('id', 0);

    if (contactsError) {
      return res.status(500).json({ error: contactsError.message });
    }

    res.json({ message: 'All data cleared successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Remove contact from all campaigns
app.post('/contacts/remove', async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Mark contact as removed (set responded to true and add a removed flag)
  // Try both phone formats
  const { data: data1, error: error1 } = await supabase
    .from('contacts')
    .update({ 
      responded: true,
      removed_at: new Date().toISOString()
    })
    .eq('phone', phone)
    .select();

  const { data: data2, error: error2 } = await supabase
    .from('contacts')
    .update({ 
      responded: true,
      removed_at: new Date().toISOString()
    })
    .eq('phone', normalizedPhone)
    .select();

  const data = [...(data1 || []), ...(data2 || [])];
  const error = error1 || error2;

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  
  res.json({ 
    message: `Contact ${phone} has been removed from all campaigns`,
    removed_count: data.length
  });
});

// Get removed contacts
app.get('/contacts/removed', async (req, res) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('phone, removed_at')
    .eq('responded', true)
    .not('removed_at', 'is', null)
    .order('removed_at', { ascending: false })
    .limit(10);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json(data || []);
});

// Only listen if not on Vercel (Vercel will handle the serverless function)
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export app for Vercel
module.exports = app;
