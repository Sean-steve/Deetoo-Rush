import React, {useState} from 'react';
import {useAuth} from '../../../../packages/auth/src/react';

export function AuthenticatorPanel() {
  const {apiClient} = useAuth();
  const [password,setPassword]=useState('');
  const [code,setCode]=useState('');
  const [secret,setSecret]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function enroll(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await apiClient.request<{uri:string}>('/auth/mfa/enroll',{method:'POST',body:JSON.stringify({password})});
      setSecret(new URL(response.data.uri).searchParams.get('secret')||'');
      setMessage('Choose a time-based (TOTP) account in your authenticator. Add this key, enable automatic time on your phone, then enter the current six-digit code below.');
    } catch(error:any) {setMessage(error?.error?.message||'Unable to start authenticator setup');}
    finally {setPassword('');setBusy(false);}
  }
  async function verify(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      await apiClient.request('/auth/mfa/verify',{method:'POST',body:JSON.stringify({code})});
      setSecret('');setMessage('Verified for five minutes. Retry your intended action.');
    } catch(error:any) {setMessage(error?.error?.message||'Unable to verify authenticator');}
    finally {setCode('');setBusy(false);}
  }
  return <details className="rounded-xl border border-slate-200 bg-white p-4 mb-4" onToggle={event=>{
    if(!event.currentTarget.open){setPassword('');setCode('');setSecret('');setMessage('');}
  }}>
    <summary className="cursor-pointer font-semibold">Authenticator security</summary>
    <p className="text-sm my-3">Use the current six-digit code, not the setup key. Privileged changes require a recent authenticator code. Verification does not repeat an action automatically.</p>
    <form onSubmit={verify} className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">Authenticator code<input aria-label="Authenticator code" className="block border rounded p-2" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)}/></label>
      <button className="border rounded p-2" disabled={busy}>Verify code</button>
    </form>
    <details className="mt-3"><summary className="cursor-pointer text-sm">First-time setup</summary>
      <form onSubmit={enroll} className="flex flex-wrap gap-3 items-end mt-3">
        <label className="text-sm">Account password<input aria-label="Account password for authenticator setup" className="block border rounded p-2" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button className="border rounded p-2" disabled={busy}>Set up authenticator</button>
      </form>
      {secret&&<p className="text-sm mt-3">Manual setup key (keep private): <code className="break-all">{secret}</code></p>}
    </details>
    <p role="status" className="text-sm mt-3">{message}</p>
  </details>;
}
