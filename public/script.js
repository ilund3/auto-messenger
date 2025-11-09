// Global variables
let contacts = [];
let campaigns = [];
let contactBatchSummaries = [];
let selectedContactBatch = null;
let currentPlaceholderOptions = [];

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

    // Load existing contacts and batches
    loadContacts();
    loadBatches();
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
            loadBatches();
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

let batches = [];

function loadBatches() {
    fetch('/contacts/batches')
        .then(response => response.json())
        .then(data => {
            batches = data;
            displayBatches();
        })
        .catch(error => {
            console.error('Error loading batches:', error);
            showStatus(`Error loading batches: ${error.message}`, 'error');
        });
}

function displayBatches() {
    const batchesSection = document.getElementById('batchesSection');
    const batchesList = document.getElementById('batchesList');

    if (!batchesSection || !batchesList) {
        return;
    }

    // Filter out batches without batch_id (legacy batches)
    const deletableBatches = batches.filter(batch => batch.batch_id);

    if (deletableBatches.length === 0) {
        batchesSection.style.display = 'none';
        return;
    }

    batchesSection.style.display = 'block';
    batchesList.innerHTML = '';

    deletableBatches.forEach(batch => {
        const batchCard = document.createElement('div');
        batchCard.className = 'batch-card';
        batchCard.style.cssText = `
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const batchInfo = document.createElement('div');
        batchInfo.innerHTML = `
            <h4 style="margin: 0 0 0.5rem 0;">${batch.file_name || 'Upload'}</h4>
            <p style="margin: 0; color: #64748b;">
                <strong>${batch.total_contacts}</strong> contact${batch.total_contacts === 1 ? '' : 's'} 
                ${batch.has_row_numbers ? `• Rows ${batch.min_row}-${batch.max_row}` : ''}
                ${batch.created_at ? `• Uploaded ${new Date(batch.created_at).toLocaleDateString()}` : ''}
            </p>
        `;
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger';
        deleteButton.textContent = 'Delete Batch';
        deleteButton.style.cssText = 'margin-left: 1rem;';
        deleteButton.onclick = () => deleteBatch(batch.batch_id, batch.file_name || 'Upload', batch.total_contacts);
        
        batchCard.appendChild(batchInfo);
        batchCard.appendChild(deleteButton);
        batchesList.appendChild(batchCard);
    });
}

function deleteBatch(batchId, batchName, contactCount) {
    if (!confirm(`Are you sure you want to delete batch "${batchName}"?\n\nThis will permanently delete ${contactCount} contact(s) from this batch.\n\nThis action cannot be undone.`)) {
        return;
    }

    showStatus('Deleting batch...', 'info');

    fetch(`/contacts/batches/${encodeURIComponent(batchId)}`, {
        method: 'DELETE'
    })
    .then(async response => {
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || `Server responded with status ${response.status}`);
        }
        return responseData;
    })
    .then(data => {
        showStatus(data.message || `Batch deleted successfully. ${data.deleted_count || contactCount} contact(s) removed.`, 'success');
        loadBatches();
        loadContacts(); // Reload contacts to reflect the deletion
    })
    .catch(error => {
        showStatus(`Error deleting batch: ${error.message}`, 'error');
    });
}

// Compose page functionality
function initializeComposePage() {
    const form = document.getElementById('composeForm');
    form.addEventListener('submit', handleComposeSubmit);

    const batchSelect = document.getElementById('contactBatchSelect');
    if (batchSelect) {
        batchSelect.addEventListener('change', handleBatchSelectionChange);
    }

    const rangeStartInput = document.getElementById('rangeStart');
    const rangeEndInput = document.getElementById('rangeEnd');
    if (rangeStartInput) {
        rangeStartInput.addEventListener('change', handleRangeInputChange);
        rangeStartInput.addEventListener('blur', handleRangeInputChange);
    }
    if (rangeEndInput) {
        rangeEndInput.addEventListener('change', handleRangeInputChange);
        rangeEndInput.addEventListener('blur', handleRangeInputChange);
    }

    loadContactBatches();
}

function handleRangeInputChange() {
    if (!selectedContactBatch) {
        return;
    }

    const rangeStartInput = document.getElementById('rangeStart');
    const rangeEndInput = document.getElementById('rangeEnd');
    if (!rangeStartInput || !rangeEndInput) {
        return;
    }

    const minRow = selectedContactBatch.min_row || 1;
    const maxRow = selectedContactBatch.max_row || selectedContactBatch.total_contacts || minRow;

    let start = parseInt(rangeStartInput.value, 10);
    let end = parseInt(rangeEndInput.value, 10);

    if (!Number.isInteger(start)) {
        start = minRow;
    }
    if (!Number.isInteger(end)) {
        end = maxRow;
    }

    start = Math.min(Math.max(start, minRow), maxRow);
    end = Math.min(Math.max(end, minRow), maxRow);

    if (start > end) {
        end = start;
    }

    rangeStartInput.value = start;
    rangeEndInput.value = end;

    loadRangePreview(start, end);
}

function loadContactBatches() {
    const batchSelect = document.getElementById('contactBatchSelect');
    const batchHelpText = document.getElementById('batchHelpText');

    if (!batchSelect) {
        return;
    }

    batchSelect.innerHTML = '<option value="" disabled selected>Loading batches...</option>';
    fetch('/contacts/batches')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data)) {
                throw new Error('Unexpected response while loading contact batches');
            }
            contactBatchSummaries = data;
            populateBatchSelect();
        })
        .catch(error => {
            console.error('Error loading contact batches:', error);
            showStatus(`Error loading contact batches: ${error.message}`, 'error');
            if (batchHelpText) {
                batchHelpText.textContent = 'Unable to load batches. Please refresh and try again.';
            }
            batchSelect.innerHTML = '<option value="" disabled selected>Error loading batches</option>';
        });
}

function populateBatchSelect() {
    const batchSelect = document.getElementById('contactBatchSelect');
    const batchHelpText = document.getElementById('batchHelpText');
    const rangePicker = document.getElementById('rangePicker');

    if (!batchSelect) {
        return;
    }

    batchSelect.innerHTML = '';
    selectedContactBatch = null;

    const selectableBatches = contactBatchSummaries.filter(batch => batch.batch_id);
    const legacyBatches = contactBatchSummaries.filter(batch => !batch.batch_id);

    if (selectableBatches.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.disabled = true;
        option.selected = true;
        option.textContent = 'No uploaded batches available yet';
        batchSelect.appendChild(option);
        if (batchHelpText) {
            batchHelpText.textContent = 'Upload a CSV to create a batch that can be segmented by row range.';
        }
        if (rangePicker) {
            rangePicker.style.display = 'none';
        }
        return;
    }

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    placeholderOption.textContent = 'Select an upload batch...';
    batchSelect.appendChild(placeholderOption);

    selectableBatches.forEach(batch => {
        const option = document.createElement('option');
        option.value = batch.batch_id;
        option.textContent = batch.label || `Upload (${batch.total_contacts} contacts)`;
        option.dataset.minRow = batch.min_row;
        option.dataset.maxRow = batch.max_row;
        batchSelect.appendChild(option);
    });

    if (legacyBatches.length > 0) {
        const legacyOption = document.createElement('option');
        legacyOption.value = 'default';
        legacyOption.disabled = true;
        const legacyCount = legacyBatches.reduce((sum, batch) => sum + (batch.total_contacts || 0), 0);
        legacyOption.textContent = `All Contacts (${legacyCount} contact${legacyCount === 1 ? '' : 's'}) — segmentation unavailable`;
        batchSelect.appendChild(legacyOption);
    }
}

function handleBatchSelectionChange() {
    const batchSelect = document.getElementById('contactBatchSelect');
    const rangePicker = document.getElementById('rangePicker');
    const batchHelpText = document.getElementById('batchHelpText');
    const previewSection = document.getElementById('rangePreview');

    if (!batchSelect) {
        return;
    }

    const selectedValue = batchSelect.value;
    if (!selectedValue) {
        selectedContactBatch = null;
        if (rangePicker) {
            rangePicker.style.display = 'none';
        }
        if (previewSection) {
            previewSection.style.display = 'none';
        }
        setPlaceholderOptions([]);
        return;
    }

    selectedContactBatch = contactBatchSummaries.find(batch => batch.batch_id === selectedValue) || null;

    if (!selectedContactBatch) {
        showStatus('Selected batch could not be found. Please reload the page.', 'error');
        if (rangePicker) {
            rangePicker.style.display = 'none';
        }
        if (previewSection) {
            previewSection.style.display = 'none';
        }
        return;
    }

    if (rangePicker) {
        rangePicker.style.display = 'block';
    }
    if (batchHelpText) {
        batchHelpText.textContent = `Batch: ${selectedContactBatch.file_name || 'Upload'} — ${selectedContactBatch.total_contacts} contact${selectedContactBatch.total_contacts === 1 ? '' : 's'} available.`;
    }

    updateRangeInputsForBatch(selectedContactBatch);
    loadBatchPlaceholders(selectedContactBatch.batch_id);
}

function updateRangeInputsForBatch(batch) {
    const rangeStartInput = document.getElementById('rangeStart');
    const rangeEndInput = document.getElementById('rangeEnd');
    const previewSection = document.getElementById('rangePreview');

    if (!rangeStartInput || !rangeEndInput || !batch) {
        return;
    }

    const minRow = batch.min_row || 1;
    const maxRow = batch.max_row || batch.total_contacts || minRow;

    rangeStartInput.min = minRow;
    rangeStartInput.max = maxRow;
    rangeEndInput.min = minRow;
    rangeEndInput.max = maxRow;

    rangeStartInput.value = minRow;
    rangeEndInput.value = maxRow;

    if (previewSection) {
        previewSection.style.display = 'none';
    }

    loadRangePreview(minRow, maxRow);
}

function loadRangePreview(start, end) {
    const previewSection = document.getElementById('rangePreview');
    const previewContent = document.getElementById('rangePreviewContent');

    if (!selectedContactBatch || !selectedContactBatch.batch_id) {
        if (previewSection) {
            previewSection.style.display = 'none';
        }
        return;
    }

    const activeBatchId = selectedContactBatch.batch_id;

    if (previewSection) {
        previewSection.style.display = 'block';
    }
    if (previewContent) {
        previewContent.innerHTML = '<p>Loading preview...</p>';
    }

    fetch(`/contacts/batches/${encodeURIComponent(selectedContactBatch.batch_id)}/preview?start=${start}&end=${end}`)
        .then(response => response.json())
        .then(data => {
            if (!selectedContactBatch || selectedContactBatch.batch_id !== activeBatchId) {
                return;
            }
            if (data.error) {
                showStatus(`Error loading preview: ${data.error}`, 'error');
                if (previewSection) {
                    previewSection.style.display = 'none';
                }
                return;
            }
            renderRangePreview(data);
        })
        .catch(error => {
            showStatus(`Error loading preview: ${error.message}`, 'error');
            if (previewSection) {
                previewSection.style.display = 'none';
            }
        });
}

function renderRangePreview(preview) {
    const previewSection = document.getElementById('rangePreview');
    const previewContent = document.getElementById('rangePreviewContent');

    if (!previewSection || !previewContent) {
        return;
    }

    if (!preview || (!preview.first_samples?.length && !preview.last_samples?.length)) {
        previewContent.innerHTML = '<p>No contacts found in this range.</p>';
        previewSection.style.display = 'block';
        return;
    }

    const formatContact = (contact) => {
        if (!contact) return '';
        const rowDisplay = contact.batch_row_number ? `Row ${contact.batch_row_number}` : 'Row ?';
        const nameDisplay = contact.first_name || '(no name)';
        const companyDisplay = contact.company ? ` — ${contact.company}` : '';
        return `<li><span class="preview-row">${rowDisplay}</span> <strong>${nameDisplay}</strong> <span class="preview-phone">${contact.phone || ''}</span>${companyDisplay}</li>`;
    };

    const total = preview.total_in_range || 0;
    let html = `<p>Total contacts in range: <strong>${total}</strong></p>`;
    html += '<div class="preview-columns">';
    html += '<div class="preview-column"><h4>First Rows</h4>';
    if (preview.first_samples && preview.first_samples.length > 0) {
        html += '<ul>' + preview.first_samples.map(formatContact).join('') + '</ul>';
    } else {
        html += '<p class="muted">None</p>';
    }
    html += '</div>';

    html += '<div class="preview-column"><h4>Last Rows</h4>';
    if (preview.last_samples && preview.last_samples.length > 0) {
        html += '<ul>' + preview.last_samples.map(formatContact).join('') + '</ul>';
    } else {
        html += '<p class="muted">None</p>';
    }
    html += '</div>';
    html += '</div>';

    previewContent.innerHTML = html;
    previewSection.style.display = 'block';
}

function loadBatchPlaceholders(batchId) {
    if (!batchId) {
        setPlaceholderOptions([]);
        return;
    }

    fetch(`/contacts/batches/${encodeURIComponent(batchId)}/placeholders`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data || !Array.isArray(data.placeholders)) {
                throw new Error('Unexpected placeholder response');
            }
            setPlaceholderOptions(data.placeholders);
        })
        .catch(error => {
            console.error('Error loading placeholders:', error);
            showStatus(`Error loading placeholders: ${error.message}`, 'error');
            setPlaceholderOptions([]);
        });
}

function setPlaceholderOptions(options) {
    if (!Array.isArray(options) || options.length === 0) {
        currentPlaceholderOptions = [];
    } else {
        currentPlaceholderOptions = options;
    }

    renderMainPlaceholderTags();
    refreshFollowupPlaceholderContainers();
}

function renderMainPlaceholderTags() {
    const container = document.getElementById('placeholderTagsMain');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!currentPlaceholderOptions.length) {
        const emptyTag = document.createElement('span');
        emptyTag.className = 'placeholder-tag placeholder-tag-empty';
        emptyTag.textContent = selectedContactBatch
            ? 'No placeholders available'
            : 'Select an upload batch to load placeholders';
        container.appendChild(emptyTag);
        return;
    }

    currentPlaceholderOptions.forEach(option => {
        const tag = document.createElement('span');
        tag.className = 'placeholder-tag';
        tag.textContent = `{${option.key}}`;
        if (option.sample_value) {
            tag.title = `Example: ${option.sample_value}`;
        }
        tag.addEventListener('click', () => insertPlaceholderInto('message', `{${option.key}}`));
        container.appendChild(tag);
    });
}

function insertPlaceholderInto(textareaId, placeholder) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const text = textarea.value;

    textarea.value = text.substring(0, start) + placeholder + text.substring(end);
    textarea.focus();
    const cursorPosition = start + placeholder.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
}

function handleComposeSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const followupCount = parseInt(formData.get('followupCount'));

    if (!selectedContactBatch || !selectedContactBatch.batch_id) {
        showStatus('Please select an upload batch with row numbers to target.', 'error');
        return;
    }

    const rangeStartInput = document.getElementById('rangeStart');
    const rangeEndInput = document.getElementById('rangeEnd');
    const startRow = parseInt(rangeStartInput.value, 10);
    const endRow = parseInt(rangeEndInput.value, 10);
    const minRow = selectedContactBatch.min_row || 1;
    const maxRow = selectedContactBatch.max_row || selectedContactBatch.total_contacts || minRow;

    if (!Number.isInteger(startRow) || !Number.isInteger(endRow)) {
        showStatus('Please provide a valid start and end row.', 'error');
        return;
    }

    if (startRow < minRow || endRow > maxRow || startRow > endRow) {
        showStatus(`Row range must be between ${minRow} and ${maxRow}, and start cannot exceed end.`, 'error');
        return;
    }
    
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
        followup_count: followupCount,
        contact_batch_id: selectedContactBatch.batch_id,
        range_start: startRow,
        range_end: endRow
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
            const targeted = data.target_count !== undefined ? ` Targeted contacts: ${data.target_count}.` : '';
            showStatus(`Campaign created successfully!${targeted}`, 'success');
            e.target.reset();
            document.getElementById('previewSection').style.display = 'none';
            document.getElementById('followupMessages').style.display = 'none';
            document.getElementById('followupMessages').innerHTML = '<h3>Followup Messages</h3><p class="field-help">Create custom messages for each followup. Use the same placeholders as the main message.</p>';
            loadContactBatches();
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
                    <div class="followup-placeholders" id="followupPlaceholders${i}" data-target="followupMessage${i}"></div>
                </div>
            `;
        }
        
        followupMessagesDiv.innerHTML = html;
        refreshFollowupPlaceholderContainers();
    } else {
        followupMessagesDiv.style.display = 'none';
    }
}

function refreshFollowupPlaceholderContainers() {
    const containers = document.querySelectorAll('.followup-placeholders');
    containers.forEach(container => {
        const targetId = container.dataset.target;
        renderPlaceholderTagsForContainer(container, targetId);
    });
}

function renderPlaceholderTagsForContainer(container, targetId) {
    if (!container) return;

    container.innerHTML = '';

    if (!currentPlaceholderOptions.length) {
        const emptyTag = document.createElement('span');
        emptyTag.className = 'placeholder-tag placeholder-tag-empty';
        emptyTag.textContent = selectedContactBatch
            ? 'No placeholders available'
            : 'Select an upload batch to load placeholders';
        container.appendChild(emptyTag);
        return;
    }

    currentPlaceholderOptions.forEach(option => {
        const tag = document.createElement('span');
        tag.className = 'placeholder-tag';
        tag.textContent = `{${option.key}}`;
        if (option.sample_value) {
            tag.title = `Example: ${option.sample_value}`;
        }
        tag.addEventListener('click', () => insertPlaceholderInto(targetId, `{${option.key}}`));
        container.appendChild(tag);
    });
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
      .replace(/{company}/g, 'Acme Corp');
    
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
                ${displayStatus === 'draft' || (displayStatus === 'active' && campaign.followup_count > 0) ? 
                    `<button class="btn btn-secondary" onclick="editCampaign(${campaign.id})">Edit Campaign</button>` : 
                    ''
                }
                ${displayStatus === 'active' && campaign.followup_count > 0 ? `
                    <div class="followup-actions">
                        <h4>Send Followups:</h4>
                        <div class="followup-buttons" id="followupButtons${campaign.id}">
                            <div class="loading">Loading followup status...</div>
                        </div>
                    </div>
                ` : ''}
                <button class="btn btn-danger" onclick="deleteCampaign(${campaign.id})">Delete Campaign</button>
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
    // Show a prompt for delay between messages
    const delayInput = prompt('Enter delay between messages in seconds:\n(Leave empty or 0 for no delay, sends all messages immediately)', '0');
    
    if (delayInput === null) {
        // User cancelled
        return;
    }
    
    const delaySeconds = parseInt(delayInput) || 0;
    
    if (delaySeconds < 0) {
        showStatus('Delay must be 0 or greater', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to send this campaign?\n\nDelay between messages: ${delaySeconds} second(s)\n\nThis will start sending messages with the specified delay.`)) {
        return;
    }

    showStatus(`Sending campaign with ${delaySeconds} second delay between messages...`, 'info');

    fetch(`/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            delay_seconds: delaySeconds
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            const rangeSummary = (data.range_start !== null && data.range_start !== undefined && data.range_end !== null && data.range_end !== undefined)
                ? ` Target rows: ${data.range_start}-${data.range_end}.`
                : '';
            const message = data.initial_count 
                ? `Campaign sent! ${data.initial_count} message(s) scheduled with ${delaySeconds} second(s) delay between each.${rangeSummary}`
                : `Campaign sent! ${data.message_count || 0} messages scheduled.${rangeSummary}`;
            showStatus(message, 'success');
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

function deleteCampaign(campaignId) {
    // Find the campaign name for the confirmation message
    const campaign = campaigns.find(c => c.id === campaignId);
    const campaignName = campaign ? campaign.name : 'this campaign';
    
    if (!confirm(`Are you sure you want to delete "${campaignName}"?\n\nThis will permanently delete the campaign and all associated messages. This action cannot be undone.`)) {
        return;
    }

    showStatus('Deleting campaign...', 'info');

    fetch(`/campaigns/${campaignId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server responded with status ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        showStatus('Campaign deleted successfully', 'success');
        loadCampaigns();
    })
    .catch(error => {
        showStatus(`Error deleting campaign: ${error.message}`, 'error');
    });
}

function editCampaign(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) {
        showStatus('Campaign not found', 'error');
        return;
    }

    const isDraft = campaign.status === 'draft';
    const isActive = campaign.status === 'active';

    if (!isDraft && !isActive) {
        showStatus('Only draft and active campaigns can be edited', 'error');
        return;
    }

    // Parse followup messages
    let followupMessages = [];
    try {
        followupMessages = campaign.followup_messages ? JSON.parse(campaign.followup_messages) : [];
    } catch (e) {
        followupMessages = [];
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'edit-campaign-modal';
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
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
        width: 800px;
    `;
    
    const readOnlyStyle = isActive ? 'background: #f5f5f5; cursor: not-allowed;' : '';
    const readOnlyAttr = isActive ? 'readonly' : '';
    
    modalContent.innerHTML = `
        <h2 style="margin-top: 0;">${isActive ? 'Edit Followup Messages' : 'Edit Campaign'}</h2>
        ${isActive ? '<p style="color: #666; margin-bottom: 1rem;">You can only edit followup messages for active campaigns. The main message has already been sent.</p>' : ''}
        <form id="editCampaignForm">
            <div class="form-group" style="margin-bottom: 1rem;">
                <label for="editCampaignName">Campaign Name:</label>
                <input type="text" id="editCampaignName" ${isActive ? 'readonly' : 'required'} style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem; ${readOnlyStyle}">
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
                <label for="editCampaignMessage">Message:</label>
                <textarea id="editCampaignMessage" rows="6" ${isActive ? 'readonly' : 'required'} style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem; ${readOnlyStyle}"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
                <label for="editFollowupCount">Number of Followups:</label>
                <input type="number" id="editFollowupCount" min="0" max="10" onchange="updateEditFollowups(${campaignId})" style="width: 100px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem;">
            </div>
            <div id="editFollowupMessages" style="margin-bottom: 1rem;">
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
                <button type="button" class="btn btn-primary" id="saveCampaignBtn">Save Changes</button>
            </div>
        </form>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Set values safely
    document.getElementById('editCampaignName').value = campaign.name;
    document.getElementById('editCampaignMessage').value = campaign.message;
    document.getElementById('editFollowupCount').value = campaign.followup_count || 0;
    
    // Populate followup messages
    updateEditFollowups(campaignId);
    for (let i = 1; i <= campaign.followup_count; i++) {
        const followupMsg = followupMessages[i - 1] || '';
        const textarea = document.getElementById(`editFollowup${i}`);
        if (textarea) {
            textarea.value = followupMsg;
        }
    }
    
    // Store campaign ID for form submission
    modalContent.dataset.campaignId = campaignId;
    
    // Attach click handler to save button immediately
    const saveButton = document.getElementById('saveCampaignBtn');
    if (saveButton) {
        saveButton.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Save button clicked, saving campaign:', campaignId);
            saveCampaignEdit(campaignId);
            return false;
        };
        console.log('Save button handler attached');
    } else {
        console.error('Save button not found after modal creation');
        // Try again after a short delay
        setTimeout(() => {
            const retryButton = document.getElementById('saveCampaignBtn');
            if (retryButton) {
                retryButton.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Save button clicked (retry), saving campaign:', campaignId);
                    saveCampaignEdit(campaignId);
                    return false;
                };
            }
        }, 50);
    }
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditModal();
        }
    });
}

function updateEditFollowups(campaignId) {
    const followupCount = parseInt(document.getElementById('editFollowupCount').value) || 0;
    const followupContainer = document.getElementById('editFollowupMessages');
    
    // Get existing followup messages
    const existingFollowups = [];
    for (let i = 1; i <= 10; i++) {
        const textarea = document.getElementById(`editFollowup${i}`);
        if (textarea) {
            existingFollowups[i - 1] = textarea.value;
        }
    }
    
    followupContainer.innerHTML = '';
    
    for (let i = 1; i <= followupCount; i++) {
        const followupMsg = existingFollowups[i - 1] || '';
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.marginBottom = '1rem';
        
        const label = document.createElement('label');
        label.setAttribute('for', `editFollowup${i}`);
        label.textContent = `Followup Message ${i}:`;
        
        const textarea = document.createElement('textarea');
        textarea.id = `editFollowup${i}`;
        textarea.rows = 4;
        textarea.style.cssText = 'width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem;';
        textarea.value = followupMsg;
        
        div.appendChild(label);
        div.appendChild(textarea);
        followupContainer.appendChild(div);
    }
}

function saveCampaignEdit(campaignId) {
    console.log('saveCampaignEdit called with campaignId:', campaignId);
    
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) {
        showStatus('Campaign not found', 'error');
        return;
    }
    
    const isDraft = campaign.status === 'draft';
    const isActive = campaign.status === 'active';
    
    const nameInput = document.getElementById('editCampaignName');
    const messageInput = document.getElementById('editCampaignMessage');
    const followupCountInput = document.getElementById('editFollowupCount');
    
    if (!followupCountInput) {
        console.error('Followup count input not found');
        showStatus('Error: Form inputs not found. Please try again.', 'error');
        return;
    }
    
    const followupCount = parseInt(followupCountInput.value) || 0;
    
    // For draft campaigns, validate name and message
    if (isDraft) {
        if (!nameInput || !messageInput) {
            console.error('Form inputs not found:', { nameInput, messageInput });
            showStatus('Error: Form inputs not found. Please try again.', 'error');
            return;
        }
        
        const name = nameInput.value.trim();
        const message = messageInput.value.trim();
        
        if (!name || !message) {
            showStatus('Campaign name and message are required', 'error');
            return;
        }
    }
    
    // Collect followup messages
    const followupMessages = [];
    const mainMessage = isDraft ? messageInput.value.trim() : campaign.message;
    
    for (let i = 1; i <= followupCount; i++) {
        const followupTextarea = document.getElementById(`editFollowup${i}`);
        if (followupTextarea) {
            const followupMsg = followupTextarea.value.trim();
            if (followupMsg) {
                followupMessages.push(followupMsg);
            } else if (isDraft) {
                followupMessages.push(mainMessage); // Use main message if followup is empty
            } else {
                // For active campaigns, keep existing followup message if empty
                const existingFollowups = campaign.followup_messages ? JSON.parse(campaign.followup_messages) : [];
                followupMessages.push(existingFollowups[i - 1] || mainMessage);
            }
        }
    }
    
    showStatus('Saving campaign...', 'info');
    
    // Build request body based on campaign status
    const requestBody = {
        followup_messages: followupMessages,
        followup_count: followupCount
    };
    
    if (isDraft) {
        requestBody.name = nameInput.value.trim();
        requestBody.message = messageInput.value.trim();
    } else {
        // For active campaigns, still send name and message (they'll be ignored by backend)
        requestBody.name = campaign.name;
        requestBody.message = campaign.message;
    }
    
    console.log('Sending request body:', JSON.stringify(requestBody, null, 2));
    console.log('Followup messages array:', followupMessages);
    console.log('Followup count:', followupCount);
    
    fetch(`/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
    .then(async response => {
        const responseData = await response.json();
        if (!response.ok) {
            console.error('Server error response:', responseData);
            throw new Error(responseData.error || `Server responded with status ${response.status}`);
        }
        return responseData;
    })
    .then(data => {
        showStatus('Campaign updated successfully', 'success');
        closeEditModal();
        loadCampaigns();
    })
    .catch(error => {
        showStatus(`Error updating campaign: ${error.message}`, 'error');
    });
}

function closeEditModal() {
    const modal = document.querySelector('.edit-campaign-modal');
    if (modal) {
        modal.remove();
    }
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
    // Show a prompt for delay between messages
    const delayInput = prompt(`Enter delay between followup ${followupNumber} messages in seconds:\n(Leave empty or 0 for no delay, sends all messages immediately)`, '0');
    
    if (delayInput === null) {
        // User cancelled
        return;
    }
    
    const delaySeconds = parseInt(delayInput) || 0;
    
    if (delaySeconds < 0) {
        showStatus('Delay must be 0 or greater', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to send followup ${followupNumber}?\n\nDelay between messages: ${delaySeconds} second(s)\n\nThis will start sending messages with the specified delay.`)) {
        return;
    }

    showStatus(`Sending followup ${followupNumber} with ${delaySeconds} second delay between messages...`, 'info');

    fetch(`/campaigns/${campaignId}/send-followup/${followupNumber}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            delay_seconds: delaySeconds
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
        } else {
            const message = data.total 
                ? `Followup ${followupNumber} started! ${data.total} message(s) will be sent with ${delaySeconds} second(s) delay between each.`
                : data.message || `Followup ${followupNumber} started!`;
            showStatus(message, 'success');
            // Refresh the followup status
            setTimeout(() => {
                loadFollowupStatus(campaignId);
            }, 1000);
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
