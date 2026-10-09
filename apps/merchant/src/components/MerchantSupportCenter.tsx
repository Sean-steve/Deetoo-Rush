import React from "react";
import { LifeBuoy, MessageCircle, ShieldCheck, Clock3 } from "lucide-react";
import { AccountSupport } from "../../../../packages/ui/src/AccountSupport";
import { MetricCard, PageHeading, useResource } from "../../../../packages/ui/src/workflows";

export function MerchantSupportCenter() {
  const cases = useResource<{ cases: Array<{id:string;status:string}> }>("/support/cases", 30000);
  const rows = cases.data?.cases || [];
  const count = (statuses:string[]) => rows.filter(row => statuses.includes(row.status)).length;
  return (
    <div className="merchant-v2-support">
      <div className="merchant-v2-support-intro">
        <PageHeading eyebrow="Support" title="Support & help center"
          subtitle="Get help, report issues or ask questions. Keep all case discussions in one place." />
        <div className="merchant-v2-support-helper"><MessageCircle size={20}/>
          <div><strong>Conversation-based support</strong><p>Replies and evidence remain linked to each case until the issue is resolved.</p></div>
        </div>
      </div>
      <div className="merchant-v2-support-stats">
        <div><small>All cases</small><strong>{cases.data ? rows.length : "—"}</strong></div>
        <div><small>Open</small><strong>{cases.data ? count(["OPEN","NEW"]) : "—"}</strong></div>
        <div><small>In progress</small><strong>{cases.data ? count(["IN_PROGRESS","INVESTIGATING","ESCALATED"]) : "—"}</strong></div>
        <div><small>Resolution pending</small><strong>{cases.data ? count(["RESOLUTION_PROPOSED","PARTY_CONFIRMATION"]) : "—"}</strong></div>
      </div>
      <div className="merchant-v2-support-grid">
        <AccountSupport mode="participant"/>
      </div>
    </div>
  );
}
