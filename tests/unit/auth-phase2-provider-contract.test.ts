import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { assertSmsConfigured, selectedSmsProvider, sendSmsMessage } from '../../apps/api/src/modules/auth/sms-provider';
import { sendIdentityMessage } from '../../apps/api/src/modules/auth/identity-delivery';

/** Contract tests never send to live SMS/email services. */
const names = [
  'DEETOO_SMS_PROVIDER','AFRICASTALKING_API_KEY','AFRICASTALKING_USERNAME','AUTH_SMS_FROM',
  'RESEND_API_KEY','AUTH_EMAIL_FROM','SMS_PARTNER_CONTRACT_VERIFIED','SMS_PARTNER_SEND_URL',
  'SMS_PARTNER_ID','SMS_PARTNER_API_KEY','SMS_PARTNER_SENDER_ID','SMS_PARTNER_WIRE_FORMAT',
  'SMS_PARTNER_FIELD_ID','SMS_PARTNER_FIELD_API_KEY','SMS_PARTNER_FIELD_SENDER',
  'SMS_PARTNER_FIELD_PHONE','SMS_PARTNER_FIELD_MESSAGE','SMS_PARTNER_ACCEPTANCE_FIELD',
  'SMS_PARTNER_ACCEPTANCE_VALUE','SMS_PARTNER_REFERENCE_FIELD',
] as const;

async function withEnv(values: Record<string,string|undefined>, run:()=>Promise<void>) {
  const old = Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const oldFetch = globalThis.fetch;
  try {
    for (const name of names) delete process.env[name];
    for (const [name,value] of Object.entries(values)) if (value !== undefined) process.env[name] = value;
    await run();
  } finally {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name] as string;
    }
    globalThis.fetch = oldFetch;
  }
}

const at = {
  DEETOO_SMS_PROVIDER:'africastalking',
  AFRICASTALKING_API_KEY:'contract-test-no-live-api',
  AFRICASTALKING_USERNAME:'test-partner',
  AUTH_SMS_FROM:'DEETOO',
};
const partner = {
  DEETOO_SMS_PROVIDER:'partner',
  SMS_PARTNER_CONTRACT_VERIFIED:'true',
  SMS_PARTNER_SEND_URL:'https://sms.vendor.example/api/v1/send',
  SMS_PARTNER_ID:'sandbox-id',
  SMS_PARTNER_API_KEY:'sandbox-secret-NEVER-LOG',
  SMS_PARTNER_SENDER_ID:'DEETOO',
  SMS_PARTNER_WIRE_FORMAT:'json',
  SMS_PARTNER_FIELD_ID:'partnerID',
  SMS_PARTNER_FIELD_API_KEY:'apikey',
  SMS_PARTNER_FIELD_SENDER:'shortcode',
  SMS_PARTNER_FIELD_PHONE:'mobile',
  SMS_PARTNER_FIELD_MESSAGE:'message',
  SMS_PARTNER_ACCEPTANCE_FIELD:'data.status',
  SMS_PARTNER_ACCEPTANCE_VALUE:'ACCEPTED',
  SMS_PARTNER_REFERENCE_FIELD:'data.reference',
};

test('Africa Talking positive response must have exact recipient acceptance and message reference',async()=>{
  await withEnv(at,async()=>{
    let sends = 0;
    globalThis.fetch = async(url,options)=>{
      sends++;
      assert.equal(url,'https://api.africastalking.com/version1/messaging');
      assert.equal(options?.method,'POST');
      assert.equal((options?.headers as Record<string,string>).apiKey,at.AFRICASTALKING_API_KEY);
      const body = new URLSearchParams(String(options?.body));
      assert.equal(body.get('to'),'+254700123456');
      assert.equal(body.get('from'),'DEETOO');
      return new Response(JSON.stringify({SMSMessageData:{Recipients:[{statusCode:101,messageId:'at-accepted'}]}}),{status:201});
    };
    const sent=await sendSmsMessage('+254700123456','DeeToo provider contract test');
    assert.deepEqual(sent,{provider:'AFRICASTALKING',reference:'at-accepted'});
    assert.equal(sends,1);
  });
});

test('Africa Talking HTTP success without accepted recipient is a hard failure, never retry/fallback',async()=>{
  await withEnv(at,async()=>{
    let count=0;
    globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({SMSMessageData:{Recipients:[{statusCode:102,messageId:''}]}}),{status:200});};
    await assert.rejects(sendSmsMessage('+254700123456','Test'),{code:'SMS_PROVIDER_UNCONFIRMED'});
    assert.equal(count,1);
  });
});

test('partner mode remains OFF until reviewed wire contract and credentials are configured',async()=>{
  await withEnv({DEETOO_SMS_PROVIDER:'partner',SMS_PARTNER_ID:'some-id'},async()=>{
    let count=0;
    globalThis.fetch=async()=>{count++;return new Response('{}');};
    assert.equal(selectedSmsProvider(),'PARTNER');
    assert.throws(()=>assertSmsConfigured(),{code:'SMS_PROVIDER_CONTRACT_NOT_VERIFIED'});
    await assert.rejects(sendSmsMessage('+254700123456','Test'),{code:'SMS_PROVIDER_CONTRACT_NOT_VERIFIED'});
    assert.equal(count,0);
  });
});

test('partner HTTP contract uses only verified field mappings and validated evidence',async()=>{
  await withEnv(partner,async()=>{
    assert.equal(assertSmsConfigured(),'PARTNER');
    let sends=0;
    globalThis.fetch=async(url,options)=>{
      sends++;
      assert.equal(url,partner.SMS_PARTNER_SEND_URL);
      assert.equal(options?.method,'POST');
      assert.equal(options?.redirect,'error');
      assert.equal((options?.headers as Record<string,string>)['Content-Type'],'application/json');
      const payload=JSON.parse(String(options?.body));
      assert.deepEqual(payload,{
        partnerID:'sandbox-id',apikey:'sandbox-secret-NEVER-LOG',
        shortcode:'DEETOO',mobile:'+254700123456',message:'OTP is 123456',
      });
      return new Response(JSON.stringify({data:{status:'ACCEPTED',reference:'partner-accepted-123'}}),{status:200});
    };
    const sent=await sendSmsMessage('+254700123456','OTP is 123456');
    assert.deepEqual(sent,{provider:'PARTNER',reference:'partner-accepted-123'});
    assert.equal(sends,1);
  });
});

test('partner HTTP 200 without documented exact accepted value or unique reference is NOT success',async()=>{
  await withEnv(partner,async()=>{
    for(const data of [{status:'REJECTED',reference:'x'},{status:'ACCEPTED'},{status:true,reference:'x'}]){
      globalThis.fetch=async()=>new Response(JSON.stringify({data}),{status:200});
      await assert.rejects(sendSmsMessage('+254700123456','Test'),(error:any)=>{
        assert.equal(error.code,'SMS_PROVIDER_UNCONFIRMED');
        assert.equal(String(error.message).includes('sandbox-secret'),false);
        return true;
      });
    }
  });
});

test('partner config refuses dashboards, embedded URL secrets and plaintext HTTP',async()=>{
  for(const url of [
    'https://sms.royaltimesexecutivemotors/partner/17684#api',
    'http://sms.vendor.example/send',
    'https://sms.vendor.example/send?apikey=hidden',
    'https://partner:secret@sms.vendor.example/send',
    'https://localhost/send',
  ]) {
    await withEnv({...partner,SMS_PARTNER_SEND_URL:url},async()=>{
      assert.throws(()=>assertSmsConfigured(),{code:'SMS_PROVIDER_CONTRACT_NOT_VERIFIED'});
    });
  }
});

test('partner form mode supported when provider contract specifies URL encoded POST fields',async()=>{
  await withEnv({...partner,SMS_PARTNER_WIRE_FORMAT:'form'},async()=>{
    globalThis.fetch=async(_url,options)=>{
      assert.equal((options?.headers as Record<string,string>)['Content-Type'],'application/x-www-form-urlencoded');
      const payload = new URLSearchParams(String(options?.body));
      assert.equal(payload.get('apikey'),partner.SMS_PARTNER_API_KEY);
      return new Response(JSON.stringify({data:{status:'ACCEPTED',reference:'form-accepted'}}),{status:200});
    };
    assert.equal((await sendSmsMessage('+254700123456','Test')).reference,'form-accepted');
  });
});

test('Resend security email requires real provider acceptance, no silent mock success',async()=>{
  await withEnv({RESEND_API_KEY:'test-only-key',AUTH_EMAIL_FROM:'security@example.test'},async()=>{
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.resend.com/emails');
      assert.equal(options?.method,'POST');
      assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer test-only-key');
      const payload=JSON.parse(String(options?.body));
      assert.equal(payload.subject,'Verify your DeeToo email address');
      assert.equal(payload.to[0],'owner@example.test');
      return new Response(JSON.stringify({id:'resend-contract-123'}),{status:200});
    };
    await sendIdentityMessage('EMAIL','owner@example.test','Use this test code','otp-test-'+randomUUID(),'Verify your DeeToo email address');
    globalThis.fetch=async()=>new Response('{}',{status:200});
    await assert.rejects(sendIdentityMessage('EMAIL','owner@example.test','Test','test-'+randomUUID()),{code:'IDENTITY_DELIVERY_UNCONFIRMED'});
  });
});

test('SMS OTP message uses exactly the same selected partner provider',async()=>{
  await withEnv(partner,async()=>{
    let calls=0;
    globalThis.fetch=async(_url,options)=>{
      calls++;
      assert.equal(JSON.parse(String(options?.body)).mobile,'+254700123456');
      return new Response(JSON.stringify({data:{status:'ACCEPTED',reference:'otp-sent'}}),{status:200});
    };
    await sendIdentityMessage('SMS','+254700123456','Your DeeToo verification code is 123456','request-1');
    assert.equal(calls,1);
  });
});
