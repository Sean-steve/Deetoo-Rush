/**
 * DEETOO - Sprint 13 Unit & Integration Tests
 * Operations, Support, Notifications, Failure Recovery, Fraud Controls & Production Resilience
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  SupportCaseStatus,
  SupportCasePriority,
  OrderStatus,
  DeliveryStatus,
  PaymentStatus,
} from '@deetoo/types';
import { operationsRepository } from '../../apps/api/src/modules/operations/operations.repository';
import { operationalIncidentService } from '../../apps/api/src/modules/operations/incident.service';
import { operationsSlaService } from '../../apps/api/src/modules/operations/sla.service';
import { supportService } from '../../apps/api/src/modules/operations/support.service';
import { notificationService } from '../../apps/api/src/modules/operations/notification.service';
import { asyncJobService } from '../../apps/api/src/modules/operations/async-job.service';
import { fraudRiskService } from '../../apps/api/src/modules/operations/risk.service';
import { operationalRecoveryService } from '../../apps/api/src/modules/operations/recovery.service';
import { unifiedOrderViewService } from '../../apps/api/src/modules/operations/unified-order-view.service';
import { orderRepository } from '../../apps/api/src/modules/order/order.repository';
import { deliveryRepository } from '../../apps/api/src/modules/order/delivery.repository';
import { paymentRepository } from '../../apps/api/src/modules/payment/payment.repository';

describe('Sprint 13: Operations, Support, Failure Recovery & Fraud Controls', () => {
  beforeEach(() => {
    operationsRepository.clearInMemory();
    orderRepository.clearInMemory();
    deliveryRepository.clearInMemory();
    paymentRepository.clearInMemory();
  });

  // ==========================================================================
  // 1. Operational Incident Lifecycle & Deduplication
  // ==========================================================================
  describe('Operational Incident Lifecycle', () => {
    test('raises an incident, logs initial timeline entry and prevents duplicate active incidents', async () => {
      const orderId = 'ord_ops_test_001';
      const actor = { id: 'admin_1', name: 'Ops Chief' };

      const incident = await operationalIncidentService.raiseIncident({
        type: 'ORDER_STUCK_PLACED',
        severity: 'MEDIUM',
        reasonCode: 'MERCHANT_UNRESPONSIVE',
        summary: 'Order stuck in placed state past SLA',
        orderId,
        actorId: actor.id,
        actorName: actor.name,
      });

      assert.ok(incident.id);
      assert.equal(incident.status, 'OPEN');
      assert.equal(incident.order_id, orderId);
      assert.equal(incident.severity, 'MEDIUM');

      // Check timeline
      const retrieved = await operationsRepository.getIncidentById(incident.id);
      assert.ok(retrieved);
      assert.ok(retrieved.timeline.length >= 1);
      assert.equal(retrieved.timeline[0].action, 'CREATED');

      // Deduplication test: Raising again with same type and order should return existing incident
      const duplicate = await operationalIncidentService.raiseIncident({
        type: 'ORDER_STUCK_PLACED',
        severity: 'HIGH', // escalated
        reasonCode: 'MERCHANT_UNRESPONSIVE',
        summary: 'Order still stuck',
        orderId,
      });

      assert.equal(duplicate.id, incident.id);
      assert.equal(duplicate.severity, 'HIGH', 'Severity should escalate when re-raised with higher level');
    });

    test('full state transitions: ACKNOWLEDGE -> INVESTIGATE -> ASSIGN -> RESOLVE -> REOPEN', async () => {
      const actor = { id: 'agent_42', name: 'Sarah Ops' };
      const incident = await operationalIncidentService.raiseIncident({
        type: 'PAYMENT_CALLBACK_MISSING',
        severity: 'HIGH',
        reasonCode: 'PAYMENT_PENDING_TIMEOUT',
        summary: 'Missing M-PESA webhook callback',
        paymentId: 'pay_test_88',
        actorId: actor.id,
        actorName: actor.name,
      });

      // 1. Acknowledge
      const acked = await operationalIncidentService.acknowledgeIncident(incident.id, actor.id, actor.name);
      assert.equal(acked.status, 'ACKNOWLEDGED');

      // 2. Investigate
      const investigating = await operationalIncidentService.investigateIncident(
        incident.id,
        actor.id,
        actor.name,
        'Checking provider logs'
      );
      assert.equal(investigating.status, 'INVESTIGATING');

      // 3. Assign
      const assigned = await operationalIncidentService.assignIncident(
        incident.id,
        actor.id,
        actor.name,
        'agent_99',
        'Mark Finance'
      );
      assert.equal(assigned.assigned_to_user_id, 'agent_99');
      assert.equal(assigned.assigned_to_name, 'Mark Finance');

      // 4. Resolve
      const resolved = await operationalIncidentService.resolveIncident(
        incident.id,
        'agent_99',
        'Mark Finance',
        'Callback arrived and processed manually'
      );
      assert.equal(resolved.status, 'RESOLVED');
      assert.ok(resolved.resolved_at);

      // 5. Reopen
      const reopened = await operationalIncidentService.reopenIncident(
        incident.id,
        actor.id,
        actor.name,
        'Ledger mismatch detected upon audit'
      );
      assert.equal(reopened.status, 'OPEN');
      assert.equal(reopened.resolved_at, null);
    });

    test('dismissing an incident as false alarm', async () => {
      const incident = await operationalIncidentService.raiseIncident({
        type: 'RIDER_GPS_STALE',
        severity: 'LOW',
        reasonCode: 'RIDER_APP_BACKGROUNDED',
        summary: 'Temporary signal loss in tunnel',
      });

      const dismissed = await operationalIncidentService.dismissIncident(
        incident.id,
        'ops_admin',
        'Alice',
        'Courier emerged from tunnel; signal restored'
      );

      assert.equal(dismissed.status, 'DISMISSED');
      assert.ok(dismissed.resolved_at);
    });
  });

  // ==========================================================================
  // 2. Operations SLA Engine & Automated Scanners
  // ==========================================================================
  describe('Operations SLA Engine & Scanners', () => {
    test('evaluates merchant acceptance SLA states (ON_TRACK vs WARNING vs BREACHED)', () => {
      const now = Date.now();

      // Recent order: 2 mins ago (threshold is 5 mins) -> ON_TRACK
      const freshOrder = {
        id: 'ord_fresh',
        status: OrderStatus.PLACED,
        created_at: new Date(now - 2 * 60 * 1000).toISOString(),
        timeline: [],
      } as any;
      const evalFresh = operationsSlaService.evaluateOrder(freshOrder);
      assert.equal(evalFresh.merchantAcceptance.status, 'ON_TRACK');

      // Stale order: 4 mins ago (warning threshold is 3.5 mins) -> WARNING
      const warningOrder = {
        id: 'ord_warn',
        status: OrderStatus.PLACED,
        created_at: new Date(now - 4 * 60 * 1000).toISOString(),
        timeline: [],
      } as any;
      const evalWarn = operationsSlaService.evaluateOrder(warningOrder);
      assert.equal(evalWarn.merchantAcceptance.status, 'WARNING');

      // Breached order: 7 mins ago (breach threshold is 5 mins) -> BREACHED
      const breachedOrder = {
        id: 'ord_breached',
        status: OrderStatus.PLACED,
        created_at: new Date(now - 7 * 60 * 1000).toISOString(),
        timeline: [],
      } as any;
      const evalBreached = operationsSlaService.evaluateOrder(breachedOrder);
      assert.equal(evalBreached.merchantAcceptance.status, 'BREACHED');
      assert.ok(evalBreached.merchantAcceptance.breachSeconds! > 0);
    });

    test('automated scanner detects stuck orders and creates incidents', async () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await orderRepository.createOrder({
        id: 'ord_stuck_scanner',
        order_number: 'ORD-9901',
        customer_id: 'cust_scan_1',
        branch_id: 'br_scan_1',
        status: OrderStatus.PLACED,
        pricing: { subtotal_minor: 150000, delivery_fee_minor: 15000, total_minor: 165000 },
        created_at: tenMinsAgo,
        updated_at: tenMinsAgo,
      } as any);

      const createdIncidents = await operationalIncidentService.scanStuckOrders();
      assert.equal(createdIncidents.length, 1);
      assert.equal(createdIncidents[0].type, 'ORDER_STUCK_PLACED');
      assert.equal(createdIncidents[0].order_id, 'ord_stuck_scanner');
    });

    test('automated scanner detects unassigned deliveries past dispatch SLA', async () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await deliveryRepository.create({
        id: 'del_stuck_scanner',
        order_id: 'ord_ref_del',
        status: DeliveryStatus.UNASSIGNED,
        pickup_address: { formatted: 'Nairobi' },
        dropoff_address: { formatted: 'Westlands' },
        created_at: tenMinsAgo,
        updated_at: tenMinsAgo,
      } as any);

      const createdIncidents = await operationalIncidentService.scanStuckDeliveries();
      assert.equal(createdIncidents.length, 1);
      assert.equal(createdIncidents[0].type, 'DELIVERY_DISPATCH_UNASSIGNED_TIMEOUT');
      assert.equal(createdIncidents[0].delivery_id, 'del_stuck_scanner');
    });
  });

  // ==========================================================================
  // 3. Support Case Workflows & Note Isolation
  // ==========================================================================
  describe('Support Case Management & Privacy Isolation', () => {
    test('creates support case and verifies customer vs internal note visibility', async () => {
      const customer = { id: 'cust_alice', name: 'Alice Customer', roles: ['customer'], isStaff: false };
      const staffAgent = { id: 'ops_agent_bob', name: 'Bob Support', roles: ['support'], isStaff: true };

      // 1. Customer creates a support case
      const supportCase = await supportService.createCase({
        customer_id: customer.id,
        category: 'ORDER_LATE',
        priority: 'MEDIUM',
        subject: 'Order is delayed',
        description: 'Where is my order? It has been over an hour.',
        creator: { id: customer.id, name: customer.name, role: 'customer' },
      });

      assert.ok(supportCase.case_number.startsWith('SUP-'));
      assert.equal(supportCase.status, 'OPEN');

      // 2. Staff views case and adds INTERNAL note
      const internalNote = await supportService.addNote(
        supportCase.id,
        staffAgent,
        'INTERNAL',
        'Rider had a flat tire, called branch for status.'
      );
      assert.equal(internalNote.visibility, 'INTERNAL');

      // 3. Staff adds CUSTOMER_VISIBLE reply note
      const publicNote = await supportService.addNote(
        supportCase.id,
        staffAgent,
        'CUSTOMER_VISIBLE',
        'Hello Alice, your courier experienced a minor delay and is now en route!'
      );
      assert.equal(publicNote.visibility, 'CUSTOMER_VISIBLE');

      // 4. Verify Customer CANNOT see internal note
      const customerView = await supportService.getCaseById(supportCase.id, customer);
      assert.equal(customerView.notes.length, 2, 'Customer should see initial description + public note only');
      const hasInternal = customerView.notes.some((n) => n.visibility === 'INTERNAL');
      assert.equal(hasInternal, false, 'Internal notes must NEVER leak to customers');

      // 5. Verify Staff CAN see internal note
      const staffView = await supportService.getCaseById(supportCase.id, staffAgent);
      assert.equal(staffView.notes.length, 3, 'Staff sees initial + internal + public note');

      // 6. Non-staff user attempting to create INTERNAL note is forced to CUSTOMER_VISIBLE
      const customerAttemptedInternalNote = await supportService.addNote(
        supportCase.id,
        customer,
        'INTERNAL',
        'Sneaky customer note'
      );
      assert.equal(customerAttemptedInternalNote.visibility, 'CUSTOMER_VISIBLE');
    });

    test('support case resolution requires participant confirmation before closure', async () => {
      const staffAgent = { id: 'ops_bob', name: 'Bob Support', roles: ['support'], isStaff: true };
      const customer = {
        id: 'cust_sam',
        name: 'Sam',
        roles: ['customer'],
        isStaff: false,
        merchant_ids: [],
      };

      const supportCase = await supportService.createCase({
        customer_id: customer.id,
        category: 'MISSING_ITEM',
        subject: 'Missing fries',
        description: 'My meal was delivered without fries',
        creator: { id: customer.id, name: customer.name, role: 'customer' },
      });

      // Assign case
      await supportService.assignCase(supportCase.id, 'agent_emma', 'Emma Support', staffAgent);
      const assigned = await operationsRepository.getSupportCaseById(supportCase.id);
      assert.equal(assigned?.assigned_agent_id, 'agent_emma');
      assert.equal(assigned?.status, 'ASSIGNED');

      // Support proposes a resolution; it is not closed yet.
      const proposed = await supportService.resolveCase(
        supportCase.id,
        'REFUND_ISSUED',
        'Partial refund of KES 250 issued for missing item.',
        staffAgent
      );
      assert.equal(proposed.status, 'PARTY_CONFIRMATION');
      assert.equal(proposed.resolution_code, 'REFUND_ISSUED');
      assert.equal(proposed.resolved_at, null);

      // Operational status endpoint cannot bypass the confirmation workflow.
      await assert.rejects(
        () => supportService.updateStatus(supportCase.id, 'CLOSED' as any, staffAgent),
        /resolution-confirmation workflow/i,
      );

      // The linked customer accepts; only then is the case closed.
      const closed = await supportService.respondToResolution(
        supportCase.id,
        customer,
        'ACCEPTED',
        'The refund resolves my issue.',
      );
      assert.equal(closed.status, 'CLOSED');
      assert.ok(closed.resolved_at);
      assert.ok((closed as any).closed_at);
    });
  });

  // ==========================================================================
  // 4. Multi-Channel Notification Service & Idempotency
  // ==========================================================================
  describe('Notification Service & Idempotency', () => {
    test('enforces idempotency key to prevent duplicate notification dispatches', async () => {
      const params = {
        recipientType: 'CUSTOMER' as const,
        recipientId: 'cust_notif_1',
        channel: 'SMS' as const,
        templateCode: 'CUSTOMER_ORDER_ACCEPTED',
        payload: { orderNumber: 'ORD-100', merchantName: 'Burger Kitchen', prepMinutes: 20 },
        referenceId: 'ord_100',
      };

      const firstSend = await notificationService.sendNotification(params);
      assert.equal(firstSend.status, 'SENT');
      assert.ok(firstSend.provider_reference);

      // Attempt duplicate send with identical idempotency parameters
      const duplicateSend = await notificationService.sendNotification(params);
      assert.equal(duplicateSend.id, firstSend.id, 'Duplicate send must return existing record');

      const { notifications } = await operationsRepository.findNotifications({ recipient_id: 'cust_notif_1' });
      assert.equal(notifications.length, 1, 'Only 1 record should exist in repository');
    });

    test('marks in-app notification as read', async () => {
      const notif = await notificationService.sendNotification({
        recipientType: 'CUSTOMER',
        recipientId: 'cust_reader',
        channel: 'IN_APP',
        templateCode: 'CUSTOMER_ORDER_DELIVERED',
        payload: { orderNumber: 'ORD-777' },
      });

      assert.equal(notif.read_at, undefined);

      const read = await notificationService.markAsRead(notif.id, 'cust_reader');
      assert.ok(read.read_at);
    });
  });

  // ==========================================================================
  // 5. Dead-Letter Queue & Distributed Locks
  // ==========================================================================
  describe('Dead-Letter Queue & Distributed Locks', () => {
    test('routes unrecoverable jobs to dead-letter queue and allows manual retry', async () => {
      const deadJob = await asyncJobService.recordDeadLetter({
        jobType: 'NOTIFICATION_DELIVERY',
        jobId: 'notif_failed_999',
        payload: { channel: 'SMS', phone: '+254712345678' },
        lastError: 'Provider connection timeout after 3 attempts',
      });

      assert.equal(deadJob.status, 'DEAD_LETTER');

      const { jobs } = await operationsRepository.findDeadLetterJobs({ status: 'DEAD_LETTER' });
      assert.ok(jobs.some((j) => j.id === deadJob.id));

      // Retry job
      const retryResult = await asyncJobService.retryJob(deadJob.id, { id: 'admin_1', name: 'Ops Chief' });
      assert.equal(retryResult.success, true);

      const updatedJob = await operationsRepository.getDeadLetterJobById(deadJob.id);
      assert.equal(updatedJob?.status, 'RETRIED');
    });

    test('distributed lock prevents concurrent execution across instances', async () => {
      const lockKey = 'cron:incident_scanner_sweep';

      // 1. First acquisition succeeds
      const acquired1 = await asyncJobService.acquireLock(lockKey, 5000);
      assert.equal(acquired1, true);

      // 2. Second acquisition before TTL fails
      const acquired2 = await asyncJobService.acquireLock(lockKey, 5000);
      assert.equal(acquired2, false);

      // 3. Release lock
      await asyncJobService.releaseLock(lockKey);

      // 4. Now acquisition succeeds again
      const acquired3 = await asyncJobService.acquireLock(lockKey, 5000);
      assert.equal(acquired3, true);
      await asyncJobService.releaseLock(lockKey);
    });
  });

  // ==========================================================================
  // 6. Rule-Based Fraud & Risk Controls
  // ==========================================================================
  describe('Fraud & Risk Signal Controls', () => {
    test('records risk signals and computes composite risk level', async () => {
      const customerId = 'cust_risk_suspect_1';

      // Add multiple signals
      await fraudRiskService.recordRiskSignal({
        signalType: 'MULTIPLE_FAILED_PAYMENTS',
        severity: 'MEDIUM',
        customerId,
        scoreWeight: 20,
      });

      await fraudRiskService.recordRiskSignal({
        signalType: 'EXCESSIVE_REFUNDS',
        severity: 'HIGH',
        customerId,
        scoreWeight: 25,
      });

      const riskScore = await fraudRiskService.calculateRiskScore('CUSTOMER', customerId);
      assert.equal(riskScore.totalScore, 45);
      assert.equal(riskScore.riskLevel, 'HIGH');
      assert.equal(riskScore.signalCount, 2);

      // Review one signal
      const signalToReview = riskScore.signals[0];
      await fraudRiskService.reviewSignal(
        signalToReview.id,
        'DISMISSED',
        { id: 'admin_risk', name: 'Risk Officer' },
        'Verified legitimate customer with card expiration issue'
      );

      // Recalculate: dismissed signal should no longer count in score
      const reevaluated = await fraudRiskService.calculateRiskScore('CUSTOMER', customerId);
      assert.equal(reevaluated.totalScore, 25);
      assert.equal(reevaluated.riskLevel, 'MEDIUM');
    });
  });

  // ==========================================================================
  // 7. Operational Kill Switches
  // ==========================================================================
  describe('Operational Kill Switches', () => {
    test('controls emergency kill switches and blocks automated dispatch', async () => {
      // 1. Initial state: auto_dispatch_paused is disabled (false)
      assert.equal(await operationsRepository.isKillSwitchActive('auto_dispatch_paused'), false);

      // 2. Enable kill switch
      await operationsRepository.setKillSwitch(
        'auto_dispatch_paused',
        true,
        'Ops Admin',
        'Severe thunderstorm in Nairobi causing massive courier shortage'
      );
      assert.equal(await operationsRepository.isKillSwitchActive('auto_dispatch_paused'), true);

      // 3. Attempting recovery dispatch while kill switch is active should reject
      await assert.rejects(
        async () => {
          await operationalRecoveryService.retryDispatch('del_dummy_1', { id: 'admin_1', name: 'Ops Chief' });
        },
        /paused by operational kill switch/
      );

      // 4. Disable kill switch
      await operationsRepository.setKillSwitch('auto_dispatch_paused', false, 'Ops Admin', 'Storm cleared');
      assert.equal(await operationsRepository.isKillSwitchActive('auto_dispatch_paused'), false);
    });
  });

  // ==========================================================================
  // 8. Unified Order Operational View & Global Search
  // ==========================================================================
  describe('Unified Order Operational View & Global Search', () => {
    test('correlates complete order lifecycle and returns aggregated operational view', async () => {
      const orderId = 'ord_unified_test';
      const orderNumber = 'ORD-7001';

      await orderRepository.createOrder({
        id: orderId,
        order_number: orderNumber,
        customer_id: 'cust_u1',
        customer_name: 'Grace Hopper',
        branch_id: 'br_u1',
        status: OrderStatus.PREPARING,
        pricing: { subtotal_minor: 120000, delivery_fee_minor: 15000, total_minor: 135000 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      // Create linked support case and incident
      await supportService.createCase({
        order_id: orderId,
        category: 'ORDER_ISSUE',
        subject: 'Allergy inquiry',
        description: 'Please ensure gluten free',
        creator: { id: 'cust_u1', name: 'Grace Hopper', role: 'customer' },
      });

      await operationalIncidentService.raiseIncident({
        type: 'MERCHANT_PREPARATION_DELAY',
        severity: 'MEDIUM',
        reasonCode: 'MERCHANT_CAPACITY_EXCEEDED',
        summary: 'Kitchen delay reported',
        orderId,
      });

      const unifiedView = await unifiedOrderViewService.getUnifiedOrderView(orderNumber);
      assert.ok(unifiedView);
      assert.equal(unifiedView.order.id, orderId);
      assert.equal(unifiedView.customer.name, 'Grace Hopper');
      assert.equal(unifiedView.supportCases.length, 1);
      assert.equal(unifiedView.incidents.length, 1);
      assert.ok(unifiedView.financialSummary.gmvMinor === 135000);
    });

    test('global operations search matches across orders, cases and incidents', async () => {
      await orderRepository.createOrder({
        id: 'ord_search_hopper',
        order_number: 'ORD-7002',
        customer_id: 'cust_u2',
        customer_name: 'Grace Hopper',
        branch_id: 'br_u2',
        status: OrderStatus.PREPARING,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const results = await unifiedOrderViewService.globalOperationsSearch('Hopper');
      assert.ok(results.orders.length >= 1 || results.supportCases.length >= 1);
    });
  });
});
