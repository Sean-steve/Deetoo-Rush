import { assertEmailConfigured,sendPlatformEmail } from '../apps/api/src/modules/auth/email-provider';

// Never send without an explicit controlled test recipient.
const status=assertEmailConfigured('identity');
console.log('Email provider: '+status.provider+'; sender: '+status.from);
const recipient=process.argv.find(arg=>arg.startsWith('--send-to='))?.slice('--send-to='.length);
if (!recipient) {
  console.log('Configuration OK. No message sent. Use --send-to=YOUR_CONTROLLED_EMAIL to send a test.');
} else {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Invalid test recipient');
  const result=await sendPlatformEmail({
    kind:'identity',to:recipient,subject:'Deetoo Mailu M9 integration test',
    text:'Authenticated Deetoo SMTP integration test. No action is required.',
  });
  console.log('Provider accepted email: '+result.provider+'; reference='+result.reference);
  console.log('Acceptance is not delivery. Verify the recipient inbox and SPF/DKIM/DMARC.');
}
