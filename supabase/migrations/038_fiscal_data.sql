-- Add fiscal/billing data columns to purchases
-- Captured from Stripe checkout when customer fills billing address + tax ID
alter table purchases
  add column buyer_name        text,
  add column buyer_email       text,
  add column buyer_tax_id      text,       -- CPF, CNPJ, VAT, etc.
  add column buyer_tax_id_type text,       -- 'br_cpf' | 'br_cnpj' | 'eu_vat' etc.
  add column buyer_country     text,       -- ISO 3166-1 alpha-2 (e.g. 'BR', 'US')
  add column buyer_address     jsonb;      -- full address object from Stripe
