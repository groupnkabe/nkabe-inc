create table if not exists public.admin_inbound_email_settings (
  id uuid primary key default gen_random_uuid(),
  email_address text not null unique,
  receiving_address text not null,
  webhook_id text unique,
  webhook_secret text,
  setup_status text not null default 'webhook_pending' check (setup_status in ('webhook_pending','forwarding_pending','active','error')),
  created_by uuid references auth.users(id) on delete set null,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_inbound_email_threads (
  id uuid primary key default gen_random_uuid(),
  email_address text not null,
  subject text not null default '(No subject)',
  participants text[] not null default '{}',
  preview text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists admin_inbound_email_threads_mailbox_recent_idx
  on public.admin_inbound_email_threads(email_address, last_message_at desc);

create table if not exists public.admin_inbound_email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.admin_inbound_email_threads(id) on delete cascade,
  email_address text not null,
  provider_email_id text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null default '(No subject)',
  text_body text not null default '',
  html_body text not null default '',
  message_id text,
  in_reply_to text,
  reference_ids text[] not null default '{}',
  headers jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_inbound_email_messages_thread_time_idx
  on public.admin_inbound_email_messages(thread_id, created_at);
create index if not exists admin_inbound_email_messages_message_id_idx
  on public.admin_inbound_email_messages(message_id) where message_id is not null;

create table if not exists public.admin_inbound_email_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  email_id text not null,
  event_created_at timestamptz,
  received_at timestamptz not null default now()
);

alter table public.admin_inbound_email_settings enable row level security;
alter table public.admin_inbound_email_threads enable row level security;
alter table public.admin_inbound_email_messages enable row level security;
alter table public.admin_inbound_email_events enable row level security;
revoke all on public.admin_inbound_email_settings from anon, authenticated;
revoke all on public.admin_inbound_email_threads from anon, authenticated;
revoke all on public.admin_inbound_email_messages from anon, authenticated;
revoke all on public.admin_inbound_email_events from anon, authenticated;
grant all on public.admin_inbound_email_settings to service_role;
grant all on public.admin_inbound_email_threads to service_role;
grant all on public.admin_inbound_email_messages to service_role;
grant all on public.admin_inbound_email_events to service_role;
