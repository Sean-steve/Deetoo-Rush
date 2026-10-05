import { LocalPaymentProvider } from './local.provider';
import { config } from '@deetoo/config';
import { StripePaymentProvider } from './stripe.provider';
import { DarajaPaymentProvider } from './daraja.provider';
/**
 * DEETOO - Payment Provider Registry
 * Resolves appropriate provider adapter by ID or payment method
 */

import { IPaymentProvider } from './payment-provider.interface';
import { mpesaPaymentProvider } from './mpesa.provider';
import { cardPaymentProvider } from './card.provider';
import { AppError } from '../../../middleware/error-handler';

export class PaymentProviderRegistry {
  private providers = new Map<string, IPaymentProvider>();

  constructor() {
    const simulated=config.storage.mode==='memory'&&config.storage.fixtures;
    this.register(config.localWorkflow ? new LocalPaymentProvider('MPESA') : simulated?mpesaPaymentProvider:new DarajaPaymentProvider());
    this.register(config.localWorkflow ? new LocalPaymentProvider('CARD') : simulated?cardPaymentProvider:new StripePaymentProvider());
  }

  public register(provider: IPaymentProvider): void {
    if(provider.simulated && !(config.storage.mode==='memory'&&config.storage.fixtures) && !(config.localWorkflow && provider instanceof LocalPaymentProvider)) throw new AppError(503,'SIMULATED_PROVIDER_FORBIDDEN','Simulated providers require explicit fixture storage');
    this.providers.set(provider.providerId.toUpperCase(), provider);
  }

  public getProvider(providerOrMethod: string): IPaymentProvider {
    const key = (providerOrMethod || '').toUpperCase();
    const provider = this.providers.get(key);
    if (!provider) {
      throw new AppError(400, 'UNSUPPORTED_PAYMENT_PROVIDER', `No payment provider registered for: ${providerOrMethod}`);
    }
    return provider;
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
