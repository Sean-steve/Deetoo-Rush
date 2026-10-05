import { Router, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { requireAuth, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import { UserRole } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { disbursementRepository } from './disbursement.repository';
import { disbursementService } from './disbursement.service';

export const disbursementRouter=Router();

function verifyGatewaySecret(req:any){
  const expected=process.env.PAYOUT_WEBHOOK_GATEWAY_SECRET||'';
  const received=String(req.headers['x-deetoo-provider-secret']||'');
  if(!expected||!received) throw new AppError(503,'PAYOUT_WEBHOOK_NOT_CONFIGURED','Payout callback gateway is not configured');
  const a=Buffer.from(expected),b=Buffer.from(received);
  if(a.length!==b.length||!timingSafeEqual(a,b)) throw new AppError(401,'INVALID_PROVIDER_CALLBACK','Invalid payout callback credential');
}

disbursementRouter.get(
  '/',
  requireAuth,
  requireRole(UserRole.ADMIN,UserRole.FINANCE),
  async (req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
    try{
      const attempts=await disbursementService.listAttempts({
        resourceType:req.query.resource_type as any,
        resourceId:req.query.resource_id as string|undefined,
        status:req.query.status as any,
        limit:req.query.limit?Number(req.query.limit):100,
      });
      res.json({attempts});
    }catch(error){next(error);}
  }
);

disbursementRouter.get(
  '/destinations',
  requireAuth,
  requireRole(UserRole.ADMIN,UserRole.FINANCE),
  async (req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
    try{
      const destinations=await disbursementRepository.listDestinations(
        req.query.owner_type as any,
        req.query.owner_id as string|undefined,
      );
      res.json({destinations:destinations.map(({provider_beneficiary_ciphertext,...safe})=>safe)});
    }catch(error){next(error);}
  }
);

disbursementRouter.post(
  '/destinations',
  requireAuth,
  requireRole(UserRole.ADMIN,UserRole.FINANCE),
  async (req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
    try{
      const ownerType=String(req.body?.owner_type||'').toUpperCase();
      const method=String(req.body?.method||'').toUpperCase();
      if(!['MERCHANT','RIDER'].includes(ownerType)) throw new AppError(400,'PAYOUT_OWNER_INVALID','owner_type must be MERCHANT or RIDER');
      if(!['MPESA_B2C','BANK_GATEWAY'].includes(method)) throw new AppError(400,'PAYOUT_METHOD_INVALID','Unsupported payout method');
      const destination=await disbursementService.createDestination({
        ownerType:ownerType as any,
        ownerId:String(req.body?.owner_id||''),
        method:method as any,
        provider:String(req.body?.provider||method),
        beneficiaryReference:String(req.body?.beneficiary_reference||''),
        maskedDestination:String(req.body?.masked_destination||''),
        currency:String(req.body?.currency||'KES').toUpperCase(),
        createdBy:req.user!.id,
      });
      const {provider_beneficiary_ciphertext,...safe}=destination;
      res.status(201).json({destination:safe});
    }catch(error){next(error);}
  }
);

disbursementRouter.post(
  '/callback',
  async (req:any,res:Response,next:NextFunction)=>{
    try{
      verifyGatewaySecret(req);
      const status=String(req.body?.status||'').toUpperCase();
      if(!['SUCCEEDED','FAILED'].includes(status)) throw new AppError(400,'DISBURSEMENT_CALLBACK_INVALID','Callback status must be SUCCEEDED or FAILED');
      const attempt=await disbursementService.applyProviderResult({
        provider:String(req.body?.provider||''),
        providerRequestId:String(req.body?.provider_request_id||''),
        succeeded:status==='SUCCEEDED',
        providerReference:req.body?.provider_reference?String(req.body.provider_reference):undefined,
        failureCode:req.body?.failure_code?String(req.body.failure_code):undefined,
        failureReason:req.body?.failure_reason?String(req.body.failure_reason):undefined,
        rawPayload:req.body,
      });
      res.json({received:true,attempt_id:attempt.id,status:attempt.status});
    }catch(error){next(error);}
  }
);
