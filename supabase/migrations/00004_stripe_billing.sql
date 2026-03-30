-- Add Stripe billing columns to organizations
alter table organizations
  add column stripe_customer_id text unique default null,
  add column stripe_subscription_id text unique default null,
  add column stripe_price_id text default null,
  add column billing_period_start timestamptz default null,
  add column billing_period_end timestamptz default null,
  add column checks_used_this_period integer default 0;

create index idx_orgs_stripe_customer on organizations (stripe_customer_id);

comment on column organizations.stripe_customer_id is 'Stripe customer ID (cus_...)';
comment on column organizations.stripe_subscription_id is 'Stripe subscription ID (sub_...)';
comment on column organizations.checks_used_this_period is 'Number of validation checks used in current billing period';
