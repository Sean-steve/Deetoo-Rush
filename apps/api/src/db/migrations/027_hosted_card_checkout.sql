-- Provider-hosted card collection; no PAN or client secret is stored by Deetoo.
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
ALTER TABLE payments ADD CONSTRAINT payments_checkout_url_https CHECK
  (checkout_url IS NULL OR checkout_url LIKE 'https://checkout.stripe.com/%');
