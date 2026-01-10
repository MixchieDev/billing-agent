import { google } from 'googleapis';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSheetsConnection() {
  console.log('Testing Google Sheets connection...\n');

  const credentialsPath = '/Users/yahshua/Downloads/billing-agent-483909-eeee6543edbd.json';
  const newContractSheetId = '1tlKYHilBDhqOJ0tThvcJ1PjRXJYqlgAFLC69G5yZFJ8';

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient as any });

    // Get sheet metadata
    console.log('=== NEW CONTRACT SHEET ===\n');

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: newContractSheetId,
      fields: 'properties.title,sheets.properties',
    });

    console.log(`Title: ${meta.data.properties?.title}`);
    console.log('Sheets/Tabs:');
    meta.data.sheets?.forEach((sheet: any, i: number) => {
      console.log(`  ${i + 1}. "${sheet.properties?.title}" (${sheet.properties?.gridProperties?.rowCount} rows)`);
    });

    // Read headers from first sheet
    const firstSheetName = meta.data.sheets?.[0]?.properties?.title;
    if (firstSheetName) {
      console.log(`\nReading headers from "${firstSheetName}"...\n`);

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: newContractSheetId,
        range: `'${firstSheetName}'!1:3`,
      });

      const rows = response.data.values || [];
      if (rows.length > 0) {
        // Find the header row (first non-empty row with multiple values)
        let headerRowIndex = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].filter((c: string) => c).length > 5) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rows[headerRowIndex] || [];
        const sampleRow = rows[headerRowIndex + 1] || [];

        console.log('COLUMN MAPPING:');
        console.log('================\n');

        headers.forEach((header: string, index: number) => {
          const colLetter = index < 26
            ? String.fromCharCode(65 + index)
            : String.fromCharCode(65 + Math.floor(index / 26) - 1) + String.fromCharCode(65 + (index % 26));
          const sampleValue = sampleRow[index] || '(empty)';
          console.log(`  ${colLetter.padEnd(3)} │ "${header}" → Sample: "${sampleValue}"`);
        });

        console.log(`\nTotal columns: ${headers.length}`);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.message.includes('403') || error.message.includes('not found')) {
      console.log('\n→ Make sure to share the sheet with: billing-agent@billing-agent-483909.iam.gserviceaccount.com');
    }
  }
}

testSheetsConnection();
