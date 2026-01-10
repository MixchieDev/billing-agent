import * as dotenv from 'dotenv';
dotenv.config();

import { sendTestEmail, initEmailServiceFromEnv } from '../src/lib/email-service';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.log('Usage: npx tsx scripts/send-test-email.ts <email>');
    console.log('Example: npx tsx scripts/send-test-email.ts test@example.com');
    process.exit(1);
  }

  console.log('Initializing email service...');
  initEmailServiceFromEnv();

  console.log(`Sending test email to: ${email}`);

  try {
    const result = await sendTestEmail(email);
    if (result.success) {
      console.log('Test email sent successfully!');
      console.log(`Message ID: ${result.messageId}`);
    } else {
      console.error('Failed to send email:', result.error);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
