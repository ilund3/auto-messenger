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
  if (isVercel) {
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your Vercel project settings:');
    console.error('  Settings → Environment Variables');
  } else {
    console.error('Please create a .env file in the project root with:');
    console.error('  SUPABASE_URL=your_supabase_project_url_here');
    console.error('  SUPABASE_ANON_KEY=your_supabase_anon_key_here');
  }
  console.error('\nSee SUPABASE_SETUP.md for detailed instructions.\n');
  // Don't exit in Vercel - let the function handle the error gracefully
  if (!isVercel) {
    process.exit(1);
  }
}

// Create Supabase client only if credentials exist
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// Configure multer for file uploads
const upload = multer({ dest: uploadsDir });

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Helper function to check Supabase connection
const requireSupabase = (req, res) => {
  if (!supabase) {
    return res.status(500).json({ 
      error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables in Vercel project settings.' 
    });
  }
  return null; // Supabase is available
};

// Upload CSV endpoint
app.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
  const supabaseError = requireSupabase(req, res);
  if (supabaseError) return;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const contacts = [];
  const errors = [];

  try {
    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          // Validate required columns
          if (!row.phone || !row.first_name || !row.company || !row.use_ai) {
            errors.push(`Missing required fields in row: ${JSON.stringify(row)}`);
            return;
          }

          contacts.push({
            phone: row.phone.trim(),
            first_name: row.first_name.trim(),
            company: row.company.trim(),
            city: row.city ? row.city.trim() : '', // Optional city column
            use_ai: row.use_ai.trim() // Store the raw text value instead of converting to boolean
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation errors', details: errors });
    }

    // Prepare contacts for insertion
    const contactsToInsert = contacts.map(contact => {
      const useAiBoolean = contact.use_ai.toLowerCase() === 'true' || contact.use_ai === '1';
      return {
        phone: contact.phone,
        first_name: contact.first_name,
        company: contact.company,
        city: contact.city || '',
        use_ai: useAiBoolean,
        use_ai_text: contact.use_ai
      };
    });

    // Insert contacts into database using Supabase
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactsToInsert);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      message: `Successfully uploaded ${contacts.length} contacts`,
      count: contacts.length 
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
  const supabaseError = requireSupabase(req, res);
  if (supabaseError) return;
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data || []);
});

// Create campaign
app.post('/campaigns', async (req, res) => {
  const { name, message, followup_messages, followup_count } = req.body;
  
  // Convert followup_messages array to JSON string for storage
  const followupMessagesJson = JSON.stringify(followup_messages || []);
  
  const { data, error } = await supabase
    .from('campaigns')
    .insert([
      {
        name,
        message,
        followup_messages: followupMessagesJson,
        followup_count: followup_count || 0
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json({ id: data.id, message: 'Campaign created successfully' });
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

// Send campaign
app.post('/campaigns/:id/send', async (req, res) => {
  const campaignId = parseInt(req.params.id);
  
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
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('responded', false);

    if (contactsError) {
      return res.status(500).json({ error: contactsError.message });
    }

    // Parse followup messages from JSON
    const followupMessages = JSON.parse(campaign.followup_messages || '[]');
    
    // Generate initial messages for each contact
    const messages = [];
    const now = new Date();
    
    contacts.forEach(contact => {
      // Replace placeholders in main message
      let personalizedMessage = campaign.message
        .replace(/{phone}/g, contact.phone)
        .replace(/{first_name}/g, contact.first_name)
        .replace(/{company}/g, contact.company)
        .replace(/{city}/g, contact.city || '')
        .replace(/{use_ai}/g, contact.use_ai_text || contact.use_ai);

      // Schedule initial message only
      messages.push({
        campaign_id: campaignId,
        contact_id: contact.id,
        message_text: personalizedMessage,
        scheduled_time: now.toISOString(),
        status: 'pending',
        message_type: 'initial'
      });

      // Store followup messages for manual sending
      for (let i = 1; i <= campaign.followup_count; i++) {
        // Use custom followup message if available, otherwise use main message
        let followupMessage = personalizedMessage;
        if (followupMessages[i - 1]) {
          followupMessage = followupMessages[i - 1]
            .replace(/{phone}/g, contact.phone)
            .replace(/{first_name}/g, contact.first_name)
            .replace(/{company}/g, contact.company)
            .replace(/{city}/g, contact.city || '')
            .replace(/{use_ai}/g, contact.use_ai_text || contact.use_ai);
        }
        
        messages.push({
          campaign_id: campaignId,
          contact_id: contact.id,
          message_text: followupMessage,
          scheduled_time: null, // No automatic scheduling
          status: 'stored', // Stored for manual sending
          message_type: `followup_${i}`
        });
      }
    });

    // Insert messages into database
    const { error: insertError } = await supabase
      .from('campaign_messages')
      .insert(messages);

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // Update campaign status
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaignId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ 
      message: `Campaign sent with ${contacts.length} initial messages. ${followupMessages.length * contacts.length} followups stored for manual sending.`,
      initial_count: contacts.length,
      followup_count: followupMessages.length * contacts.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Function to send message via macOS Messages
function sendMessage(phone, message) {
  return new Promise((resolve, reject) => {
    // Create a temporary AppleScript file to avoid shell escaping issues
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `message_${Date.now()}.scpt`);
    
    // Create the AppleScript content
    const scriptContent = `tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to participant "${phone}" of targetService
  send "${message.replace(/"/g, '\\"')}" to targetBuddy
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
        console.error(`Error sending message to ${phone}:`, error);
        console.error('Message content:', message);
        reject(error);
      } else {
        console.log(`Message sent to ${phone}`);
        resolve(stdout);
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

    // Send messages
    let sentCount = 0;
    let errorCount = 0;

    for (const msg of activeMessages) {
      try {
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
      } catch (err) {
        console.error(`Failed to send followup message ${msg.id}:`, err);
        // Update status to failed
        await supabase
          .from('campaign_messages')
          .update({ status: 'failed' })
          .eq('id', msg.id);
        errorCount++;
      }
    }

    res.json({ 
      message: `Followup ${followupNumber} sent to ${sentCount} contacts`,
      sent: sentCount,
      errors: errorCount
    });
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
