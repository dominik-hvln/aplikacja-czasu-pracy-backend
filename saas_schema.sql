-- 1. Plans Table
create table public.plans (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  name text not null,
  limits jsonb default '{}'::jsonb,
  price_monthly numeric(10, 2),
  price_yearly numeric(10, 2),
  stripe_product_id text,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. Modules Dictionary
create table public.modules (
  code text primary key,
  name text not null,
  description text
);

-- 3. Plan Modules (Defaults for a plan)
create table public.plan_modules (
  plan_id uuid references public.plans(id) on delete cascade,
  module_code text references public.modules(code) on delete cascade,
  primary key (plan_id, module_code)
);

-- 4. Subscriptions
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) not null,
  plan_id uuid references public.plans(id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Company Modules (Active modules for a company - overrides)
create table public.company_modules (
  company_id uuid references public.companies(id) on delete cascade,
  module_code text references public.modules(code) on delete cascade,
  primary key (company_id, module_code)
);

-- 6. Add Stripe Customer ID to Companies
alter table public.companies add column if not exists stripe_customer_id text;
alter table public.subscriptions add column if not exists stripe_subscription_id text;

-- Insert default modules
insert into public.modules (code, name, description) values
('time_tracking', 'Rejestracja Czasu', 'Podstawowa funkcjonalność rejestracji czasu pracy'),
('reports', 'Raporty', 'Zaawansowane raporty i analizy'),
('geolocation', 'Geolokalizacja', 'Weryfikacja lokalizacji GPS'),
('tasks', 'Zadania', 'Zarządzanie zadaniami pracowników');

-- Insert default plans (Example)
insert into public.plans (code, name, limits, price_monthly, price_yearly, is_active) values
('basic', 'Basic', '{"max_users": 5}', 0, 0, true),
('pro', 'Pro', '{"max_users": 50}', 99, 990, true),
('enterprise', 'Enterprise', '{"max_users": 9999}', 299, 2990, true);

-- Assign modules to plans (Example)
-- Basic gets only time_tracking
insert into public.plan_modules (plan_id, module_code)
select id, 'time_tracking' from public.plans where code = 'basic';

-- Pro gets time_tracking + reports
insert into public.plan_modules (plan_id, module_code)
select id, 'time_tracking' from public.plans where code = 'pro';
insert into public.plan_modules (plan_id, module_code)
select id, 'reports' from public.plans where code = 'pro';
