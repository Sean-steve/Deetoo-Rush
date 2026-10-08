import {useMemo,useState} from "react";
import {ArrowRight,LockKeyhole,RefreshCw,ShieldCheck,LogOut} from "lucide-react";
import {AuthProvider,useAuth} from "@deetoo/auth-web";
import {createCustomerGateway} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";
import {CONNECTED_MODE_WARNING} from "./mode";

/**
 * Explicit DEV-only connection gate. Until real data is mapped screen by
 * screen, connected mode never displays fixture-backed shopping/order screens.
 */
function ConnectedFoundationInner(){
  const {user,isLoading,isAuthenticated,login,logout,apiClient,error,refreshProfile}=useAuth();
  const gateway=useMemo(()=>createCustomerGateway(apiClient),[apiClient]);
  const [identifier,setIdentifier]=useState("");
  const [password,setPassword]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [actionError,setActionError]=useState<string|null>(null);
  const profile=useBackendResource(()=>gateway.account.profile(),isAuthenticated,[user?.id]);
  const addresses=useBackendResource(()=>gateway.account.addresses(),isAuthenticated,[user?.id]);
  const sessions=useBackendResource(()=>gateway.auth.sessions(),isAuthenticated,[user?.id]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(submitting)return;
    setSubmitting(true);setActionError(null);
    try {await login(identifier,password);setPassword("");}
    catch(err){setActionError(backendError(err).message);}
    finally{setSubmitting(false);}
  };
  return <div className="dt-foundation-page"><main className="dt-foundation-card">
    <header><span className="dt-foundation-logo"><ShieldCheck size={25}/></span><span>DeeToo Customer vNext · Stage B1</span></header>
    <h1>Backend connection gate</h1>
    <p className="dt-foundation-description">{CONNECTED_MODE_WARNING}</p>
    {isLoading?<p role="status">Checking authenticated session…</p>:isAuthenticated?<>
      <div className="dt-foundation-success"><ShieldCheck size={20}/> Authenticated session found</div>
      <p>Signed in as <strong>{user?.name||user?.email||"Customer"}</strong>. Real data is queried read-only below; the 15 approved screens remain in preview mode until their adapters pass acceptance.</p>
      <dl className="dt-foundation-probes">
        <div><dt>Customer profile</dt><dd>{profile.state.status==="ready"?"Available":profile.state.status==="empty"?"Empty":profile.state.status==="error"?profile.state.message:profile.state.status}</dd></div>
        <div><dt>Saved addresses</dt><dd>{addresses.state.status==="ready"?addresses.state.data.length+" loaded":addresses.state.status==="empty"?"No saved addresses":addresses.state.status==="error"?addresses.state.message:addresses.state.status}</dd></div>
        <div><dt>Sessions</dt><dd>{sessions.state.status==="ready"?sessions.state.data.length+" loaded":sessions.state.status==="empty"?"None":sessions.state.status==="error"?sessions.state.message:sessions.state.status}</dd></div>
      </dl>
      <div className="dt-foundation-actions">
        <button type="button" onClick={()=>{profile.refresh();addresses.refresh();sessions.refresh();}}><RefreshCw size={16}/> Refresh checks</button>
        <button type="button" onClick={()=>void logout()}><LogOut size={16}/> Sign out</button>
      </div>
    </>:<>
      <p>Sign in using an existing DeeToo customer account. Credentials go through the shared HttpOnly-cookie authentication flow. Nothing is stored in localStorage.</p>
      <form onSubmit={submit}>
        <label>Phone or email<input type="text" autoComplete="username" required value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button type="submit" disabled={submitting}>{submitting?"Signing in…":"Verify backend sign-in"} <ArrowRight size={16}/></button>
      </form>
      {(actionError||error)&&<p role="alert" className="dt-foundation-error">{actionError||error}</p>}
    </>}
    <footer><LockKeyhole size={15}/> Isolated developer verification — no payments, support messages, or orders are created.</footer>
  </main></div>;
}
export function ConnectedFoundationGate(){
  return <AuthProvider clientApp="customer"><ConnectedFoundationInner/></AuthProvider>;
}
