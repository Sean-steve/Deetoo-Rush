import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

import {
  LedgerAccountOwnerType,
  LedgerAccountType,
  MerchantSettlementStatus,
} from '@deetoo/types';
import { ledgerRepository } from '../../apps/api/src/modules/finance/ledger.repository';
import { financialAdjustmentService } from '../../apps/api/src/modules/finance/financial-adjustment.service';
import { disbursementService } from '../../apps/api/src/modules/finance/disbursement.service';
import { disbursementRepository } from '../../apps/api/src/modules/finance/disbursement.repository';
import { settlementService } from '../../apps/api/src/modules/finance/settlement.service';
import { launchReadinessService } from '../../apps/api/src/modules/operations/launch-readiness.service';

test('Phase 3: financial adjustment requester cannot self-approve', async () => {
  ledgerRepository.clearInMemory();
  const target = await ledgerRepository.getOrCreateAccount(
    LedgerAccountType.GENERAL_ADJUSTMENT_CLEARING,
    LedgerAccountOwnerType.SYSTEM,
    null,
    'KES',
  );
  const offset = await ledgerRepository.getOrCreateAccount(
    LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
    LedgerAccountOwnerType.SYSTEM,
    null,
    'KES',
  );

  const maker = 'phase3-maker';
  const request = await financialAdjustmentService.request({
    targetAccountId: target.id,
    offsetAccountId: offset.id,
    direction: 'DEBIT',
    amountMinor: 1000,
    currency: 'KES',
    reasonCode: 'MANUAL_FINANCE_CORRECTION',
    note: 'Phase 3 maker-checker regression',
    requestedBy: maker,
  });
  assert.equal(request.status, 'REQUESTED');

  await assert.rejects(
    () => financialAdjustmentService.approve(request.id, maker),
    (error: any) => error?.code === 'SELF_APPROVAL_NOT_ALLOWED',
  );

  const posted = await financialAdjustmentService.approve(request.id, 'phase3-checker');
  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.approved_by, 'phase3-checker');
  assert.ok(posted.ledger_transaction_id);
});

test('Phase 3: merchant settlement requires PROCESSING before provider confirmation', async () => {
  ledgerRepository.clearInMemory();
  const settlementId = randomUUID();
  await ledgerRepository.saveSettlement({
    id: settlementId,
    settlement_number: 'STL-PHASE3-001',
    merchant_id: 'phase3-merchant',
    currency: 'KES',
    period_start: new Date(Date.now() - 86400000).toISOString(),
    period_end: new Date().toISOString(),
    gross_order_value_minor: 50000,
    commission_amount_minor: 10000,
    promotion_amount_minor: 0,
    refund_amount_minor: 0,
    adjustment_amount_minor: 0,
    net_settlement_amount_minor: 40000,
    status: MerchantSettlementStatus.APPROVED,
    calculated_by: 'maker',
    approved_by: 'checker',
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    lines: [],
  }, []);

  await assert.rejects(
    () => settlementService.confirmPaid(settlementId, 'BANK-REF-1'),
    /Cannot confirm settlement paid from status APPROVED/,
  );

  const processing = await settlementService.markProcessing(settlementId, 'checker');
  assert.equal(processing.status, MerchantSettlementStatus.PROCESSING);

  const paid = await settlementService.confirmPaid(settlementId, 'BANK-REF-1');
  assert.equal(paid.status, MerchantSettlementStatus.PAID);
  assert.equal(paid.payment_reference, 'BANK-REF-1');

  const idempotent = await settlementService.confirmPaid(settlementId, 'BANK-REF-1');
  assert.equal(idempotent.status, MerchantSettlementStatus.PAID);
  await assert.rejects(
    () => settlementService.confirmPaid(settlementId, 'BANK-REF-2'),
    (error: any) => error?.code === 'SETTLEMENT_REFERENCE_CONFLICT',
  );
});

test('Phase 3: payout destinations are encrypted and never need plaintext for listing', async () => {
  process.env.PAYOUT_DESTINATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const raw = '+254700123456';
  const destination = await disbursementService.createDestination({
    ownerType: 'RIDER',
    ownerId: 'phase3-rider',
    method: 'MPESA_B2C',
    provider: 'SAFARICOM',
    beneficiaryReference: raw,
    maskedDestination: '+2547***3456',
    createdBy: 'phase3-finance',
  });
  assert.notEqual(destination.provider_beneficiary_ciphertext, raw);
  assert.equal(JSON.stringify(destination).includes(raw), false);

  const listed = await disbursementRepository.listDestinations('RIDER', 'phase3-rider');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].masked_destination, '+2547***3456');
});

test('Phase 3: launch readiness remains blocked without durable certification evidence', async () => {
  const readiness = await launchReadinessService.getReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.length > 0);
});
