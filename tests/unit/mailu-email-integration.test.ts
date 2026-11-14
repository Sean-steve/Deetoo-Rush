import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertEmailConfigured,mailuSmtpOptions,selectedEmailProvider,sendPlatformEmail } from '../../apps/api/src/modules/auth/email-provider';

const names=['DEETOO_EMAIL_PROVIDER','AUTH_EMAIL_FROM','NOTIFICATION_EMAIL_FROM','MAIL_SMTP_HOST','MAIL_SMTP_PORT','MAIL_SMTP_USER','MAIL_SMTP_PASS','RESEND_API_KEY'];
async function withEnv(vars:Record<string,string|undefined>,fn:()=>Promise<void>|void) {
  const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    for(const name of names) delete process.env[name];
    for(const [name,value] of Object.entries(vars)) if(value!==undefined) process.env[name]=value;
    await fn();
  } finally {
    for(const name of names) {
      if(old[name]===undefined) delete process.env[name];
      else process.env[name]=old[name];
    }
  }
}
const mailu={
  DEETOO_EMAIL_PROVIDER:'mailu',AUTH_EMAIL_FROM:'noreply@deetooapp.com',
  MAIL_SMTP_HOST:'mail.deetooapp.com',MAIL_SMTP_PORT:'465',
  MAIL_SMTP_USER:'noreply@deetooapp.com',MAIL_SMTP_PASS:'test-only-not-real',
};
test('Mailu config requires authenticated verified TLS and forbids port 25',async()=>{
  await withEnv(mailu,()=>{
    assert.equal(selectedEmailProvider(),'MAILU_SMTP');
    const smtp=mailuSmtpOptions();
    assert.equal(smtp.secure,true);
    assert.equal(smtp.tls.rejectUnauthorized,true);
    assert.equal(smtp.tls.servername,'mail.deetooapp.com');
    assert.equal(assertEmailConfigured('identity').from,'noreply@deetooapp.com');
  });
  await withEnv({...mailu,MAIL_SMTP_PORT:'25'},()=>{
    assert.throws(mailuSmtpOptions,/465 or 587/);
  });
  await withEnv({...mailu,MAIL_SMTP_PORT:'587'},()=>{
    assert.equal(mailuSmtpOptions().requireTLS,true);
  });
  await withEnv({...mailu,MAIL_SMTP_PASS:undefined},()=>{
    assert.throws(()=>assertEmailConfigured('identity'),/MAIL_SMTP_PASS/);
  });
});
test('Mailu reports SMTP accepted only for confirmed recipient and message id',async()=>{
  await withEnv(mailu,async()=>{
    const message={kind:'notification' as const,to:'user@example.test',subject:'Order',text:'Ready'};
    const valid={
      async sendMail(actual:{from:string;to:string;subject:string;text:string}){
        assert.equal(actual.from,'noreply@deetooapp.com');
        assert.equal(actual.to,'user@example.test');
        return {accepted:['user@example.test'],messageId:'<id@deetooapp.com>'};
      },
      close(){},
    };
    assert.deepEqual(await sendPlatformEmail(message,valid),{
      provider:'MAILU_SMTP',reference:'<id@deetooapp.com>',
    });
    await assert.rejects(sendPlatformEmail(message,{
      async sendMail(){return {accepted:[],messageId:'<id@deetooapp.com>'}},close(){},
    }),/not confirmed/);
  });
});
test('Existing Resend provider remains default and preserves identity idempotency',async()=>{
  await withEnv({AUTH_EMAIL_FROM:'security@example.test',RESEND_API_KEY:'fake-key'},async()=>{
    assert.equal(selectedEmailProvider(),'RESEND');
    const old=globalThis.fetch;
    try {
      globalThis.fetch=async (_url,options)=>{
        const headers=options?.headers as Record<string,string>;
        assert.equal(headers['Idempotency-Key'],'reset-key-1');
        assert.equal(headers.Authorization,'Bearer fake-key');
        return new Response(JSON.stringify({id:'resend-accepted'}),{status:200});
      };
      assert.deepEqual(await sendPlatformEmail({
        kind:'identity',to:'user@example.test',subject:'Verify',text:'Code',requestId:'reset-key-1',
      }),{provider:'RESEND',reference:'resend-accepted'});
    } finally { globalThis.fetch=old; }
  });
});
