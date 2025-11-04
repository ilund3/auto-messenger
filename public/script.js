// Global variables
let contacts = [];
let campaigns = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop();
    
    if (currentPage === 'index.html' || currentPage === '') {
        initializeUploadPage();
    } else if (currentPage === 'compose.html') {
        initializeComposePage();
    } else if (currentPage === 'campaigns.html') {
        initializeCampaignsPage();
    }
});

// Upload page functionality
function initializeUploadPage() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const contactsSection = document.getElementById('contactsSection');
    const contactsList = document.getElementById('contactsList');

    // File upload handling
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Load existing contacts
    loadContacts();
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showStatus('Please select a CSV file.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);

    showStatus('Uploading file...', 'info');

    fetch('/upload-csv', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus(`Successfully uploaded ${data.count} contacts!`, 'success');
            loadContacts();
        }
    })
    .catch(error => {
        showStatus(`Error uploading file: ${error.message}`, 'error');
    });
}

function loadContacts() {
    fetch('/contacts')
    .then(response => response.json())
    .then(data => {
        contacts = data;
        displayContacts();
    })
    .catch(error => {
        showStatus(`Error loading contacts: ${error.message}`, 'error');
    });
}

function displayContacts() {
    const contactsSection = document.getElementById('contactsSection');
    const contactsList = document.getElementById('contactsList');

    if (contacts.length === 0) {
        contactsSection.style.display = 'none';
        return;
    }

    contactsSection.style.display = 'block';
    contactsList.innerHTML = '';

    contacts.forEach(contact => {
        const contactCard = document.createElement('div');
        contactCard.className = 'contact-card';
        contactCard.innerHTML = `
            <h4>${contact.first_name}</h4>
            <p><strong>Phone:</strong> ${contact.phone}</p>
            <p><strong>Company:</strong> ${contact.company}</p>
            ${contact.use_ai ? '<span class="use-ai">AI Enabled</span>' : ''}
        `;
        contactsList.appendChild(contactCard);
    });
}

// Compose page functionality
function initializeComposePage() {
    const form = document.getElementById('composeForm');
    form.addEventListener('submit', handleComposeSubmit);
}

function handleComposeSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const followupCount = parseInt(formData.get('followupCount'));
    
    // Collect followup messages
    const followupMessages = [];
    for (let i = 1; i <= followupCount; i++) {
        const followupMessage = document.getElementById(`followupMessage${i}`).value;
        if (followupMessage.trim()) {
            followupMessages.push(followupMessage);
        } else {
            followupMessages.push(formData.get('message')); // Use main message if followup is empty
        }
    }
    
    const campaignData = {
        name: formData.get('campaignName'),
        message: formData.get('message'),
        followup_messages: followupMessages,
        followup_count: followupCount
    };

    fetch('/campaigns', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus('Campaign created successfully!', 'success');
            e.target.reset();
            document.getElementById('previewSection').style.display = 'none';
            document.getElementById('followupMessages').style.display = 'none';
            document.getElementById('followupMessages').innerHTML = '<h3>Followup Messages</h3><p class="field-help">Create custom messages for each followup. Use the same placeholders as the main message.</p>';
        }
    })
    .catch(error => {
        showStatus(`Error creating campaign: ${error.message}`, 'error');
    });
}

function updateFollowupMessages() {
    const followupCount = parseInt(document.getElementById('followupCount').value);
    const followupMessagesDiv = document.getElementById('followupMessages');
    
    if (followupCount > 0) {
        followupMessagesDiv.style.display = 'block';
        
        let html = '<h3>Followup Messages</h3><p class="field-help">Create custom messages for each followup. Use the same placeholders as the main message.</p>';
        
        for (let i = 1; i <= followupCount; i++) {
            html += `
                <div class="followup-message-group">
                    <h4>
                        <span class="followup-number">${i}</span>
                        Followup Message ${i}
                    </h4>
                    <textarea id="followupMessage${i}" name="followupMessage${i}" placeholder="Enter followup message ${i}..."></textarea>
                    <div class="followup-placeholders">
                        <span class="placeholder-tag" onclick="insertFollowupPlaceholder('followupMessage${i}', '{phone}')">{phone}</span>
                        <span class="placeholder-tag" onclick="insertFollowupPlaceholder('followupMessage${i}', '{first_name}')">{first_name}</span>
                        <span class="placeholder-tag" onclick="insertFollowupPlaceholder('followupMessage${i}', '{company}')">{company}</span>
                        <span class="placeholder-tag" onclick="insertFollowupPlaceholder('followupMessage${i}', '{city}')">{city}</span>
                        <span class="placeholder-tag" onclick="insertFollowupPlaceholder('followupMessage${i}', '{use_ai}')">{use_ai}</span>
                    </div>
                </div>
            `;
        }
        
        followupMessagesDiv.innerHTML = html;
    } else {
        followupMessagesDiv.style.display = 'none';
    }
}

function insertPlaceholder(placeholder) {
    const messageTextarea = document.getElementById('message');
    const start = messageTextarea.selectionStart;
    const end = messageTextarea.selectionEnd;
    const text = messageTextarea.value;
    
    messageTextarea.value = text.substring(0, start) + placeholder + text.substring(end);
    messageTextarea.focus();
    messageTextarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
}

function insertFollowupPlaceholder(textareaId, placeholder) {
    const textarea = document.getElementById(textareaId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    textarea.value = text.substring(0, start) + placeholder + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
}

function previewMessage() {
    const message = document.getElementById('message').value;
    const previewSection = document.getElementById('previewSection');
    const previewMessage = document.getElementById('previewMessage');
    
    if (!message.trim()) {
        showStatus('Please enter a message to preview.', 'error');
        return;
    }
    
    // Replace placeholders with sample data
    const sampleMessage = message
      .replace(/{phone}/g, '+1234567890')
      .replace(/{first_name}/g, 'John')
      .replace(/{company}/g, 'Acme Corp')
      .replace(/{city}/g, 'New York')
      .replace(/{use_ai}/g, 'AI Assistant');
    
    previewMessage.textContent = sampleMessage;
    previewSection.style.display = 'block';
}

// Campaigns page functionality
function initializeCampaignsPage() {
    loadCampaigns();
}

function loadCampaigns() {
    const campaignsList = document.getElementById('campaignsList');
    campaignsList.innerHTML = '<div class="loading">Loading campaigns...</div>';

    fetch('/campaigns')
    .then(response => response.json())
    .then(data => {
        campaigns = data;
        displayCampaigns();
    })
    .catch(error => {
        showStatus(`Error loading campaigns: ${error.message}`, 'error');
        campaignsList.innerHTML = '<div class="loading">Error loading campaigns</div>';
    });
}

function displayCampaigns() {
    const campaignsList = document.getElementById('campaignsList');
    
    if (campaigns.length === 0) {
        campaignsList.innerHTML = '<div class="loading">No campaigns found. Create one in the Compose page.</div>';
        return;
    }

    campaignsList.innerHTML = '';

    campaigns.forEach(campaign => {
        const campaignCard = document.createElement('div');
        campaignCard.className = 'campaign-card';
        
        const statusClass = campaign.status === 'draft' ? 'draft' : 
                           campaign.status === 'active' ? 'active' : 'completed';
        
        // Handle null/undefined status
        const displayStatus = campaign.status || 'draft';
        
        // Parse followup messages if they exist
        let followupMessages = [];
        try {
            followupMessages = campaign.followup_messages ? JSON.parse(campaign.followup_messages) : [];
        } catch (e) {
            followupMessages = [];
        }
        
        campaignCard.innerHTML = `
            <div class="campaign-header">
                <h3 class="campaign-title">${campaign.name}</h3>
                <span class="campaign-status ${statusClass}">${displayStatus}</span>
            </div>
            <div class="campaign-details">
                <p><strong>Followups:</strong> ${campaign.followup_count}</p>
                <p><strong>Created:</strong> ${new Date(campaign.created_at).toLocaleDateString()}</p>
                ${followupMessages.length > 0 ? `<p><strong>Custom Followups:</strong> ${followupMessages.length} messages</p>` : ''}
            </div>
            <div class="campaign-message">${campaign.message}</div>
            ${followupMessages.length > 0 ? `
                <div class="followup-preview">
                    <h4>Followup Messages:</h4>
                    ${followupMessages.map((msg, index) => `
                        <div class="followup-preview-item">
                            <strong>Followup ${index + 1}:</strong> ${msg.length > 100 ? msg.substring(0, 100) + '...' : msg}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <div class="campaign-actions">
                ${displayStatus === 'draft' ? 
                    `<button class="btn btn-primary" onclick="sendCampaign(${campaign.id})">Send Campaign</button>` : 
                    `<button class="btn btn-secondary" onclick="viewCampaignMessages(${campaign.id})">View Messages</button>`
                }
                ${displayStatus === 'active' && campaign.followup_count > 0 ? `
                    <div class="followup-actions">
                        <h4>Send Followups:</h4>
                        <div class="followup-buttons" id="followupButtons${campaign.id}">
                            <div class="loading">Loading followup status...</div>
                        </div>
                    </div>
                ` : ''}
                <button class="btn btn-secondary" onclick="refreshCampaigns()">Refresh</button>
            </div>
        `;
        
        // Load followup status for active campaigns
        if (displayStatus === 'active' && campaign.followup_count > 0) {
            loadFollowupStatus(campaign.id);
        }
        
        campaignsList.appendChild(campaignCard);
    });
}

function sendCampaign(campaignId) {
    if (!confirm('Are you sure you want to send this campaign? This will start sending messages immediately.')) {
        return;
    }

    showStatus('Sending campaign...', 'info');

    fetch(`/campaigns/${campaignId}/send`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus(`Campaign sent! ${data.message_count} messages scheduled.`, 'success');
            loadCampaigns();
        }
    })
    .catch(error => {
        showStatus(`Error sending campaign: ${error.message}`, 'error');
    });
}

function viewCampaignMessages(campaignId) {
    fetch(`/campaigns/${campaignId}/messages`)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
            return;
        }

        // Create a simple modal to show messages
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 0.5rem;
            padding: 2rem;
            max-width: 80%;
            max-height: 80%;
            overflow-y: auto;
        `;
        
        let messagesHtml = '<h3>Campaign Messages</h3>';
        data.forEach(msg => {
            const statusClass = msg.status === 'sent' ? 'success' : 
                               msg.status === 'failed' ? 'error' : 'info';
            const messageType = msg.message_type || 'initial';
            const isFollowup = messageType.startsWith('followup_');
            
            messagesHtml += `
                <div style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div>
                            <p><strong>To:</strong> ${msg.phone} (${msg.first_name} - ${msg.company})</p>
                            <p><strong>Type:</strong> ${isFollowup ? messageType.replace('followup_', 'Followup ') : 'Initial Message'}</p>
                            <p><strong>Status:</strong> <span class="status-message ${statusClass}">${msg.status}</span></p>
                            <p><strong>Scheduled:</strong> ${msg.scheduled_time ? new Date(msg.scheduled_time).toLocaleString() : 'Manual'}</p>
                            ${msg.sent_time ? `<p><strong>Sent:</strong> ${new Date(msg.sent_time).toLocaleString()}</p>` : ''}
                        </div>
                        ${!msg.responded ? `
                            <button class="btn btn-secondary" onclick="markContactResponded(${msg.contact_id})" style="font-size: 0.8rem; padding: 0.5rem;">
                                Mark Responded
                            </button>
                        ` : ''}
                    </div>
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 0.25rem;">
                        ${msg.message_text}
                    </div>
                </div>
            `;
        });
        
        modalContent.innerHTML = messagesHtml + `
            <div style="text-align: right; margin-top: 1rem;">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
        `;
        
        modal.className = 'modal';
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    })
    .catch(error => {
        showStatus(`Error loading messages: ${error.message}`, 'error');
    });
}

function refreshCampaigns() {
    loadCampaigns();
}

function loadFollowupStatus(campaignId) {
    fetch(`/campaigns/${campaignId}/followup-status`)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('Error loading followup status:', data.error);
            return;
        }
        
        const buttonsContainer = document.getElementById(`followupButtons${campaignId}`);
        if (!buttonsContainer) return;
        
        let html = '';
        data.forEach(followup => {
            const followupNumber = followup.message_type.replace('followup_', '');
            const stored = followup.stored || 0;
            const sent = followup.sent || 0;
            const failed = followup.failed || 0;
            
            html += `
                <div class="followup-button-group">
                    <button class="btn btn-primary" onclick="sendFollowup(${campaignId}, ${followupNumber})" 
                            ${stored === 0 ? 'disabled' : ''}>
                        Send Followup ${followupNumber}
                    </button>
                    <div class="followup-stats">
                        <span class="stat stored">${stored} stored</span>
                        <span class="stat sent">${sent} sent</span>
                        <span class="stat failed">${failed} failed</span>
                    </div>
                </div>
            `;
        });
        
        buttonsContainer.innerHTML = html;
    })
    .catch(error => {
        console.error('Error loading followup status:', error);
    });
}

function sendFollowup(campaignId, followupNumber) {
    if (!confirm(`Are you sure you want to send followup ${followupNumber}?`)) {
        return;
    }

    showStatus(`Sending followup ${followupNumber}...`, 'info');

    fetch(`/campaigns/${campaignId}/send-followup/${followupNumber}`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus(data.message, 'success');
            loadFollowupStatus(campaignId); // Refresh the status
        }
    })
    .catch(error => {
        showStatus(`Error sending followup: ${error.message}`, 'error');
    });
}

function markContactResponded(contactId) {
    if (!confirm('Mark this contact as responded? They will be removed from future followups.')) {
        return;
    }

    fetch(`/contacts/${contactId}/responded`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus('Contact marked as responded', 'success');
            loadCampaigns(); // Refresh campaigns to update followup counts
        }
    })
    .catch(error => {
        showStatus(`Error marking contact as responded: ${error.message}`, 'error');
    });
}

function clearAllData() {
    if (!confirm('Are you sure you want to clear ALL data? This will delete all contacts, campaigns, and messages. This action cannot be undone.')) {
        return;
    }

    showStatus('Clearing all data...', 'info');

    fetch('/clear-all-data', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            showStatus('All data cleared successfully!', 'success');
            loadCampaigns();
        }
    })
    .catch(error => {
        showStatus(`Error clearing data: ${error.message}`, 'error');
    });
}

// Utility functions
function showStatus(message, type) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
}

// Contact removal functions
function removeContact() {
    const phoneInput = document.getElementById('phoneToRemove');
    const phone = phoneInput.value.trim();
    
    if (!phone) {
        showStatus('Please enter a phone number to remove', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to remove ${phone} from all campaigns? This will stop all future messages to this number.`)) {
        return;
    }
    
    showStatus('Removing contact...', 'info');
    
    fetch('/contacts/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(data.error, 'error');
        } else {
            showStatus(data.message, 'success');
            phoneInput.value = '';
            loadRemovedContacts();
            refreshCampaigns(); // Refresh to update followup counts
        }
    })
    .catch(error => {
        console.error('Error removing contact:', error);
        showStatus('Error removing contact', 'error');
    });
}

function loadRemovedContacts() {
    fetch('/contacts/removed')
    .then(response => response.json())
    .then(contacts => {
        const removedList = document.getElementById('removedList');
        
        if (contacts.length === 0) {
            removedList.innerHTML = '<p class="no-removed">No contacts removed yet</p>';
        } else {
            removedList.innerHTML = contacts.map(contact => `
                <div class="removed-contact-item">
                    <span class="phone">${contact.phone}</span>
                    <span class="removed-time">${new Date(contact.removed_at).toLocaleString()}</span>
                </div>
            `).join('');
        }
    })
    .catch(error => {
        console.error('Error loading removed contacts:', error);
    });
}

// Load removed contacts when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('campaigns')) {
        loadRemovedContacts();
    }
});
