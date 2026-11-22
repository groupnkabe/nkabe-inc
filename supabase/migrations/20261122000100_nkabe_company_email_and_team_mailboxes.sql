-- Nkabe company email, team mailbox assignments and direct outbound mail
alter table public.admin_users
  add column if not exists company_email text,
  add column if not exists mailbox_status text not null default 'not_configured'
    check (mailbox_status in ('not_configured','pending','provisioned','suspended'));
create unique index if not exists admin_users_company_email_unique
  on public.admin_users (lower(company_email)) where company_email is not null;
create table if not exists public.admin_email_settings (
  id boolean primary key default true check (id = true),
  company_name text not null default 'Nkabe Inc.',
  from_name text not null default 'Nkabe Inc.',
  from_email text not null default 'no-reply@nkabe.us',
  reply_to text,
  logo_url text,
  brand_color text not null default '#061A3A',
  footer_text text not null default 'Nkabe Inc. · nkabe.us',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.admin_email_settings (id) values (true) on conflict (id) do nothing;
create table if not exists public.admin_outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_emails text[] not null, cc_emails text[] not null default '{}', bcc_emails text[] not null default '{}',
  subject text not null check (length(trim(subject)) > 0),
  body text not null check (length(trim(body)) > 0),
  created_by uuid not null references auth.users(id),
  delivery_status text not null default 'draft' check (delivery_status in ('draft','sending','sent','failed')),
  provider_id text, sent_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists admin_outbound_emails_created_at_idx on public.admin_outbound_emails (created_at desc);
create index if not exists admin_outbound_emails_created_by_idx on public.admin_outbound_emails (created_by);
alter table public.admin_email_settings enable row level security;
alter table public.admin_outbound_emails enable row level security;
drop policy if exists "Active team can read email settings" on public.admin_email_settings;
create policy "Active team can read email settings" on public.admin_email_settings for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true));
drop policy if exists "Owner can update email settings" on public.admin_email_settings;
create policy "Owner can update email settings" on public.admin_email_settings for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'))
with check (exists (select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'));
drop policy if exists "Active team can read outbound email" on public.admin_outbound_emails;
create policy "Active team can read outbound email" on public.admin_outbound_emails for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true));
drop policy if exists "Active team can create outbound email drafts" on public.admin_outbound_emails;
create policy "Active team can create outbound email drafts" on public.admin_outbound_emails for insert to authenticated
with check (created_by=(select auth.uid()) and delivery_status='draft' and exists
(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true));
grant select, update on public.admin_email_settings to authenticated;
grant select, insert on public.admin_outbound_emails to authenticated;
grant select on public.admin_users to authenticated;
