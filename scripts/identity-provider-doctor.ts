/**
 * Explicit provider-certification smoke test. No messages are sent without flags.
 * Run only with authorized sandbox contacts and secret env configured.
 */
import {randomUUID} from 'node:crypto';
import {assertSmsConfigured,selectedSmsProvider,sendSmsMessage} from '../apps/api/src/modules/auth/sms-provider';
import {identityDeliveryConfig,sendIdentityMessage} from '../apps/api/src/modules/auth/identity-delivery';

async function main() {
  const args=process.argv.slice(2);
  const smsIndex=args.indexOf('--send-test-sms');
  const emailIndex=args.indexOf('--send-test-email');
  if (args.includes('--help')) {
    process.stdout.write('Usage: pnpm identity:doctor [--send-test-sms +2547XXXXXXX] [--send-test-email verified-test@example.com]\n');
    process.stdout.write('Default: configuration inspection only. Passing a send flag explicitly transmits one real test message.\n');
    return;
  }
  if (args.some(arg=>!['--send-test-sms','--send-test-email'].includes(arg) && arg.startsWith('--')))
    throw new Error('Unsupported test flag. Use --help.');
  const provider=selectedSmsProvider();
  process.stdout.write('SMS provider selected: '+provider+' (configuration only)\n');
  assertSmsConfigured();
  process.stdout.write('SMS provider contract/configuration: accepted for testing; no live message sent by this check.\n');
  identityDeliveryConfig('EMAIL');
  process.stdout.write('Resend recovery email configuration: present; no live email sent by this check.\n');

  if (smsIndex >= 0) {
    const phone=args[smsIndex+1];
    if (!phone||!(/^\+[1-9]\d{7,14}$/).test(phone))
      throw new Error('The test SMS recipient must be a valid E.164 number.');
    await sendSmsMessage(phone, 'DeeToo SMS provider certification test. No action or response is needed.');
    process.stdout.write('SMS provider ACCEPTED one test message. Handset delivery must be independently observed.\n');
  }
  if (emailIndex >= 0) {
    const email=args[emailIndex+1];
    if (!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('The email recipient must be a verified sandbox test address.');
    await sendIdentityMessage('EMAIL',email,'DeeToo email provider certification test. No action or response is needed.',
      randomUUID(),'DeeToo provider certification test');
    process.stdout.write('Resend ACCEPTED one test email. Inbox delivery must be independently observed.\n');
  }
}

main().catch(error=>{
  // Do not reveal secrets, request bodies, vendor URLs or recipient identities.
  const code=error?.code||'PROVIDER_TEST_FAILED';
  process.stderr.write('Identity provider check stopped: '+String(code)+'\n');
  process.exitCode=1;
});
