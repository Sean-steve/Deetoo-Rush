import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { AppError } from '../../middleware/error-handler';

const requiredGates = [
  'PAYMENT_SANDBOX_CERTIFIED',
  'RIDER_DEVICE_CERTIFIED',
  'OBJECT_STORAGE_CERTIFIED',
  'NOTIFICATIONS_CERTIFIED',
  'BACKUP_RESTORE_CERTIFIED',
  'LOAD_TEST_CERTIFIED',
  'SECURITY_REVIEW_CERTIFIED',
  'PRIVACY_RETENTION_CERTIFIED',
  'MONITORING_ALERTS_CERTIFIED',
] as const;

function configured(...names:string[]):boolean {
  return names.every((name)=>Boolean(process.env[name]?.trim()));
}

export class LaunchReadinessService {
  async getReadiness() {
    const automatic = {
      durable_storage: config.storage.mode === 'postgres' && !config.storage.fixtures,
      web_security: configured('JWT_SECRET','ALLOWED_ORIGINS'),
      mfa_encryption: configured('MFA_ENCRYPTION_KEY'),
      payment_provider: configured('MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_WEBHOOK_SECRET') ||
        configured('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'),
      rider_push: configured('FCM_PROJECT_ID','FCM_CLIENT_EMAIL','FCM_PRIVATE_KEY'),
      private_storage: configured('OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_REGION'),
      routing: configured('GOOGLE_ROUTES_API_KEY'),
      payout_encryption: configured('PAYOUT_DESTINATION_ENCRYPTION_KEY'),
      payout_callbacks: configured('PAYOUT_WEBHOOK_GATEWAY_SECRET'),
      rider_payout_provider: configured('MPESA_OAUTH_URL','MPESA_B2C_API_URL','MPESA_INITIATOR_NAME','MPESA_SECURITY_CREDENTIAL','MPESA_SHORTCODE','MPESA_B2C_RESULT_URL','MPESA_B2C_TIMEOUT_URL'),
      merchant_payout_provider: configured('BANK_PAYOUT_API_URL','BANK_PAYOUT_API_TOKEN','BANK_PAYOUT_CALLBACK_URL'),
    };

    let gates:any[]=[];
    if(config.storage.mode==='postgres'){
      const res=await getDbPool().query('SELECT * FROM launch_readiness_gates ORDER BY gate_key');
      gates=res.rows.map((row:any)=>({
        gate_key:row.gate_key,status:row.status,evidence_reference:row.evidence_reference,note:row.note,
        updated_by:row.updated_by,updated_at:new Date(row.updated_at).toISOString(),
      }));
    } else {
      gates=requiredGates.map((gate_key)=>({gate_key,status:'PENDING',evidence_reference:null,note:'Durable launch evidence requires PostgreSQL'}));
    }

    const automaticReady=Object.values(automatic).every(Boolean);
    const gatesReady=requiredGates.every((key)=>gates.find((g)=>g.gate_key===key)?.status==='PASSED');
    return {
      ready: automaticReady && gatesReady,
      automatic,
      gates,
      blockers: [
        ...Object.entries(automatic).filter(([,ok])=>!ok).map(([key])=>`CONFIG:${key}`),
        ...requiredGates.filter((key)=>gates.find((g)=>g.gate_key===key)?.status!=='PASSED').map((key)=>`GATE:${key}`),
      ],
      checked_at:new Date().toISOString(),
    };
  }

  async updateGate(gateKey:string,status:string,actorId:string,evidenceReference?:string,note?:string){
    if(!requiredGates.includes(gateKey as any)) throw new AppError(400,'LAUNCH_GATE_INVALID','Unknown launch readiness gate');
    if(!['PENDING','PASSED','BLOCKED'].includes(status)) throw new AppError(400,'LAUNCH_GATE_STATUS_INVALID','Invalid launch gate status');
    if(status==='PASSED'&&!evidenceReference?.trim()) throw new AppError(400,'LAUNCH_EVIDENCE_REQUIRED','Passing a launch gate requires an evidence reference');
    if(config.storage.mode!=='postgres') throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Launch evidence requires PostgreSQL');
    const res=await getDbPool().query(`UPDATE launch_readiness_gates SET status=$2,evidence_reference=$3,note=$4,
      updated_by=$5,updated_at=NOW() WHERE gate_key=$1 RETURNING *`,
      [gateKey,status,evidenceReference?.trim()||null,note?.trim()||null,actorId]);
    return res.rows[0];
  }
}

export const launchReadinessService=new LaunchReadinessService();
