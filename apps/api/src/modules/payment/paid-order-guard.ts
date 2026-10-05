import { config } from '@deetoo/config';
import { one } from '../../db/adapter';
import { paymentRepository } from './payment.repository';
import { AppError } from '../../middleware/error-handler';
import { currentTransaction } from '../../db/transaction';
import { lockCommand } from '../cart/quote-binding';

export async function hasVerifiedCapture(orderId: string): Promise<boolean> {
  if (config.storage.mode === 'postgres') return !!await one('SELECT payment_id FROM payment_capture_evidence WHERE order_id=$1', [orderId]);
  return (await paymentRepository.findPaymentsByOrderId(orderId)).some(p => p.captured_minor === p.amount_minor && p.captured_minor > 0);
}
export async function requirePaidOrder(orderId: string, operational = false): Promise<void> {
  if (currentTransaction()) await lockCommand(`order:${orderId}`);
  if(operational){
    const payments=await paymentRepository.findPaymentsByOrderId(orderId);
    if(!payments.some(p=>p.captured_minor>p.refunded_minor&&p.captured_minor===p.amount_minor))throw new AppError(409,'ORDER_NOT_PAID','Order has no unrefunded captured funds');
  }
  if (!await hasVerifiedCapture(orderId)) throw new AppError(409, 'ORDER_NOT_PAID', 'Verified payment capture is required');
}
