# Auto Messenger

A web application for automated messaging campaigns that integrates with macOS Messages app.

## Features

- **CSV Contact Upload**: Upload contacts with phone, first_name, company, and use_ai columns
- **Message Composition**: Create personalized messages with custom field placeholders
- **Followup Scheduling**: Set custom followup timing (supports decimal days for precise timing)
- **macOS Integration**: Sends messages through your Mac's Messages app
- **Campaign Management**: Track and manage your messaging campaigns
- **Row-Based Segmentation**: Select specific row ranges from each CSV upload when creating campaigns
- **Dynamic Placeholders**: Compose screen surfaces placeholder chips for every column header in the selected CSV batch

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and go to `http://localhost:3000`

3. **Upload Contacts**:
   - Go to the "Upload Contacts" page
   - Upload a CSV file with columns: `phone`, `first_name`, `company`, `use_ai`
   - Phone numbers should be in format: +1234567890
   - use_ai column should contain: true/false or 1/0

4. **Compose Message**:
   - Go to the "Compose Message" page
   - Select the uploaded CSV batch you want to target
   - Set the start and end row (inclusive) to segment the contacts for the campaign
   - Enter a campaign name
   - Write your message using placeholders surfaced under the editor (chips reflect your CSV column headers)
   - Set the number of followups and days between followups
   - Use decimal values for precise timing (e.g., 0.0007 for ~1 minute)

5. **Send Campaign**:
   - Go to the "Campaigns" page
   - Click "Send Campaign" to start sending messages
   - View message status and details

## CSV Format

Your CSV file should have these exact column headers:

```csv
phone,first_name,company,use_ai
+1234567890,John,Acme Corp,true
+1987654321,Jane,Tech Inc,false
```

Rows are imported in the same order as they appear in the CSV. The row numbers shown on the Compose page correspond directly to these positions, making it easy to segment your uploads.

## Segmenting Contacts by Row Range

- Each CSV upload is stored as a distinct batch with preserved row order.
- When composing a campaign, select the batch and specify the start/end row numbers to target.
- The preview pane shows the first and last few contacts within the selected range before you create the campaign.
- Campaign details display the targeted batch ID and row range so you can track which contacts will receive the messages.

## Message Placeholders

Use these placeholders in your messages:
- `{phone}` - Contact's phone number
- `{first_name}` - Contact's first name
- `{company}` - Contact's company

## Followup Timing

- Use decimal values for precise timing
- Examples:
  - 1.0 = 1 day
  - 0.5 = 12 hours
  - 0.0007 = ~1 minute
  - 0.0001 = ~8.6 seconds

## Requirements

- macOS (for Messages app integration)
- Node.js
- Messages app must be set up and working

## Security Note

This application sends messages through your Mac's Messages app. Make sure you have permission to send messages to the contacts in your CSV file and comply with all applicable laws and regulations regarding automated messaging.

## Troubleshooting

- Make sure Messages app is running and properly configured
- Check that phone numbers are in the correct format (+1234567890)
- Ensure you have permission to send messages to the contacts
- Check the server console for error messages

## License

MIT
