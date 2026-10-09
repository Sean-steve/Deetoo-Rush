import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, FileText, LifeBuoy, MessageCircle, Paperclip, Plus, Search, Send, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, FileInput, FormField, InlineBanner, Input, Modal, Select, Textarea } from "../../../../packages/ui/src/index";
import { PageHeading, ResourceState, StatusBadge, errorMessage, useResource } from "../../../../packages/ui/src/workflows";
import { useAuth } from "../../../../packages/auth/src/react";

type SupportCase = { id:string; subject:string;status:string;category?:string;created_at?:string;description?:string; };
export function MerchantSupportCenter() {
  const {apiClient} = useAuth();
  const cases = useResource<{cases:SupportCase[]}>("/support/cases",30000);
  const rows = cases.data?.cases || [];
  const [selected,setSelected] = useState<string | null>(null);
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("ALL");
  const [newOpen,setNewOpen] = useState(false);
  const [caseKind,setCaseKind] = useState<"SUPPORT"|"DISPUTE">("SUPPORT");
  const [subject,setSubject] = useState("");
  const [description,setDescription] = useState("");
  const [orderId,setOrderId] = useState("");
  const [newFiles,setNewFiles] = useState<File[]>([]);
  const [replyFiles,setReplyFiles] = useState<File[]>([]);
  const [reply,setReply] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [message,setMessage] = useState<string | null>(null);
  const buckets = [
    {id:"ALL",label:"All",match:(_:SupportCase)=>true},
    {id:"OPEN",label:"Open",match:(row:SupportCase)=>["OPEN","NEW"].includes(row.status)},
    {id:"IN_PROGRESS",label:"In progress",match:(row:SupportCase)=>["IN_PROGRESS","INVESTIGATING","ESCALATED"].includes(row.status)},
    {id:"AWAITING",label:"Awaiting response",match:(row:SupportCase)=>["RESOLUTION_PROPOSED","PARTY_CONFIRMATION"].includes(row.status)},
    {id:"RESOLVED",label:"Resolved",match:(row:SupportCase)=>["RESOLVED","CLOSED"].includes(row.status)},
  ];
  const filtered = useMemo(()=>rows.filter(row => buckets.find(b => b.id === filter)?.match(row) && (!search || [row.subject,row.description || "",row.id].some(v=>v.toLowerCase().includes(search.toLowerCase())))),[rows,filter,search]);
  const activeId = selected && rows.some(row=>row.id===selected) ? selected : filtered[0]?.id;
  const active = rows.find(row=>row.id===activeId);
  const detail = useResource<any>(activeId ? `/support/cases/${encodeURIComponent(activeId)}` : null,15000);
  const uploadEvidence = async (caseId:string,files:File[]) => {
    const mediaIds:string[]=[];
    for(const file of files) {
      const prepared = await apiClient.request<any>("/media/uploads",{method:"POST",body:JSON.stringify({purpose:"SUPPORT_ATTACHMENT",content_type:file.type || "application/octet-stream",reference_type:"SUPPORT_CASE",reference_id:caseId})});
      const media=prepared.data;
      if(!media?.upload_url || !media?.media_id) throw new Error("Evidence upload could not be prepared.");
      const result=await fetch(media.upload_url,{method:"PUT",headers:media.upload_headers || {"content-type":file.type},body:file});
      if(!result.ok)throw new Error(`Evidence upload failed (HTTP ${result.status}).`);
      await apiClient.request(`/media/uploads/${encodeURIComponent(media.media_id)}/complete`,{method:"POST"});
      mediaIds.push(media.media_id);
    }
    return mediaIds;
  };
  async function submitNew(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError(null);setMessage(null);
    try {
      const created = caseKind==="DISPUTE" ? await apiClient.request<any>("/trust/disputes",{
        method:"POST",body:JSON.stringify({subject,description,category:"DISPUTE",allegation_code:"PARTICIPANT_DISPUTE",...(orderId ? {order_id:orderId} : {})})
      }):await apiClient.request<any>("/support/cases",{
        method:"POST",body:JSON.stringify({subject,description,category:"ORDER_ISSUE",...(orderId?{order_id:orderId}:{})})
      });
      const caseId = caseKind==="DISPUTE" ? created.data?.support_case?.id : created.data?.id;
      const trustId = caseKind==="DISPUTE" ? created.data?.trust_case?.id : null;
      if(caseId && newFiles.length){
        const mediaIds=await uploadEvidence(caseId,newFiles);
        await apiClient.request(`/support/cases/${encodeURIComponent(caseId)}/messages`,{method:"POST",body:JSON.stringify({body:"Evidence attached to this case.",media_ids:mediaIds})});
        if(trustId) for(const mediaId of mediaIds) await apiClient.request(`/trust/disputes/${encodeURIComponent(trustId)}/evidence`,{
          method:"POST",body:JSON.stringify({evidence_type:"DOCUMENT",media_object_id:mediaId,summary:"Merchant supplied dispute evidence"})
        });
      }
      if(caseId)setSelected(caseId);
      setSubject("");setDescription("");setOrderId("");setNewFiles([]);setCaseKind("SUPPORT");setNewOpen(false);
      setMessage("Support conversation created.");await cases.refresh();
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function sendReply(event:React.FormEvent) {
    event.preventDefault();
    if(!activeId || !reply.trim())return;
    setBusy(true);setError(null);setMessage(null);
    try {
      const mediaIds=replyFiles.length ? await uploadEvidence(activeId,replyFiles) : [];
      await apiClient.request(`/support/cases/${encodeURIComponent(activeId)}/messages`,{method:"POST",body:JSON.stringify({body:reply.trim(),media_ids:mediaIds})});
      setReply("");setReplyFiles([]);await detail.refresh();await cases.refresh();
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function respondToResolution(decision:"ACCEPTED"|"DISPUTED"){
    if(!activeId)return;
    setBusy(true);setError(null);
    try {
      await apiClient.request(`/support/cases/${encodeURIComponent(activeId)}/resolution-response`,{
        method:"POST",body:JSON.stringify({decision,...(decision==="DISPUTED" ? {comment:reply.trim() || "I still need help with this case."} : {})})
      });
      setReply("");await detail.refresh();await cases.refresh();setMessage(decision==="ACCEPTED"?"Resolution accepted.":"Case returned for further review.");
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function viewEvidence(mediaId:string){
    if(!activeId)return;
    try {
      const result=await apiClient.request<any>(`/support/cases/${encodeURIComponent(activeId)}/attachments/${encodeURIComponent(mediaId)}/read-url`);
      if(result.data?.url)window.open(result.data.url,"_blank","noopener,noreferrer");
    }catch(e){setError(errorMessage(e));}
  }
  const notes:any[]=detail.data?.notes || [];
  const attachments:any[]=detail.data?.attachments || [];
  return (
    <div className="merchant-v2-support">
      <div className="merchant-v2-support-intro">
        <PageHeading eyebrow="Support" title="Support & help center" subtitle="Get help, report issues or ask questions. Our team is here to support your business." />
        <Button onClick={()=>setNewOpen(true)}><Plus size={17}/> Start a conversation</Button>
      </div>
      <div className="merchant-v2-support-stats">
        {buckets.map(bucket=><div key={bucket.id}><small>{bucket.label==="All"?"All cases":bucket.label}</small><strong>{cases.data ? rows.filter(bucket.match).length : "—"}</strong></div>)}
      </div>
      {error && <InlineBanner kind="danger" className="mb-3">{error}</InlineBanner>}
      {message && <InlineBanner kind="success" className="mb-3">{message}</InlineBanner>}
      <div className="merchant-v2-support-conversations">
        <section className="merchant-v2-case-list">
          <div className="merchant-v2-notify-search"><Search size={17}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search cases" placeholder="Search support cases..." /></div>
          <div className="merchant-v2-tabs" aria-label="Filter support cases">
            {buckets.map(bucket=><button type="button" key={bucket.id} aria-pressed={filter===bucket.id} onClick={()=>{setFilter(bucket.id);setSelected(null);}}>{bucket.label} ({rows.filter(bucket.match).length})</button>)}
          </div>
          <ResourceState resource={cases}>
            <div className="merchant-v2-case-scroll">
            {filtered.length?filtered.map(row=><button key={row.id} type="button" className={`merchant-v2-case-row ${activeId===row.id?"is-selected":""}`} onClick={()=>setSelected(row.id)}>
              <span className="merchant-v2-case-icon"><LifeBuoy size={19}/></span>
              <span className="flex-1 min-w-0"><strong>{row.subject}</strong><small>{row.id.slice(0,8)} · {row.created_at?new Date(row.created_at).toLocaleDateString():"Case"}</small><small className="truncate">{row.description || "Open conversation"}</small></span>
              <StatusBadge status={row.status}/>
            </button>):<EmptyState title="No support cases" description="Start a new conversation or clear the filters."/>}
            </div>
          </ResourceState>
        </section>
        <section className="merchant-v2-case-chat">
          {active ? <>
            <header className="merchant-v2-chat-heading">
              <div><small className="text-emerald-700 font-bold">#{active.id.slice(0,8)}</small><h2>{active.subject}</h2><p>{active.created_at?new Date(active.created_at).toLocaleString():""} · <StatusBadge status={detail.data?.case?.status || active.status}/></p></div>
            </header>
            <ResourceState resource={detail}>
              <div className="merchant-v2-messages">
                {notes.length?notes.map(note=><article key={note.id} className={`merchant-v2-message ${note.message_type==="RESOLUTION"?"is-resolution":""}`}>
                  <span><strong>{note.author_name || note.author_role || "Support"}</strong><small>{note.created_at?new Date(note.created_at).toLocaleString():note.message_type==="RESOLUTION"?"Resolution proposed":""}</small></span>
                  <p>{note.body}</p>
                </article>):<p className="merchant-v2-no-messages">This case is open. Messages will appear here.</p>}
                {attachments.length>0&&<div className="merchant-v2-attachments"><strong>Evidence ({attachments.length})</strong>{attachments.map((attachment,i)=><Button key={attachment.id||i} variant="outline" size="sm" onClick={()=>void viewEvidence(attachment.media_object_id)}><FileText size={14}/> View evidence {i+1}</Button>)}</div>}
              </div>
              {["RESOLUTION_PROPOSED","PARTY_CONFIRMATION"].includes(detail.data?.case?.status) && <div className="merchant-v2-resolution">
                <strong>DeeToo Support has proposed a resolution.</strong><p>{detail.data?.case?.resolution_notes || "Review the conversation before confirming whether this resolves the issue."}</p>
                <div className="flex flex-wrap gap-2 mt-3"><Button disabled={busy} onClick={()=>void respondToResolution("ACCEPTED")}><Check size={15}/> I'm satisfied</Button>
                  <Button disabled={busy} variant="outline" onClick={()=>void respondToResolution("DISPUTED")}>I still need help</Button></div>
              </div>}
              <form className="merchant-v2-chat-composer" onSubmit={sendReply}>
                <FormField label="Reply"><Textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Type your message..." rows={3} required/></FormField>
                <div className="flex justify-between flex-wrap gap-2 items-end mt-3">
                  <FileInput multiple files={replyFiles} onFilesChange={setReplyFiles} label="Attach files" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" hint="JPEG, PNG, WebP, MP4, QuickTime or PDF"/>
                  <Button type="submit" disabled={!reply.trim()} isLoading={busy}><Send size={16}/> Send message</Button>
                </div>
              </form>
            </ResourceState>
          </>:<EmptyState title="Select a support case" description="Open a case from the left, or start a new conversation."/>}
        </section>
      </div>
      <Modal title="Start a support conversation" isOpen={newOpen} onClose={()=>!busy&&setNewOpen(false)}>
        <form className="space-y-4" onSubmit={submitNew}>
          <FormField label="Case type" required><Select value={caseKind} onChange={e=>setCaseKind(e.target.value as "SUPPORT"|"DISPUTE")}><option value="SUPPORT">Support request</option><option value="DISPUTE">Formal dispute</option></Select></FormField>
          <FormField label="Subject" required><Input value={subject} onChange={e=>setSubject(e.target.value)} minLength={3} required/></FormField>
          <FormField label="Order ID (optional)"><Input value={orderId} onChange={e=>setOrderId(e.target.value)}/></FormField>
          <FormField label="Tell us what happened" required><Textarea value={description} onChange={e=>setDescription(e.target.value)} minLength={3} required/></FormField>
          <FormField label="Evidence (optional)"><FileInput multiple files={newFiles} label="Choose evidence" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" onFilesChange={setNewFiles} hint="JPEG, PNG, WebP, MP4, QuickTime or PDF"/></FormField>
          <Button type="submit" isLoading={busy}>{caseKind==="DISPUTE"?"Open dispute":"Create support case"}</Button>
        </form>
      </Modal>
    </div>
  );
}
