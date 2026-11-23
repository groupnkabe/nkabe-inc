create table if not exists public.admin_email_inboxes (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend' check (provider = 'resend'),
  email_address text not null unique,
  inbox_id text not null unique,
  receiving_address text,
  webhook_id text,
  webhook_secret text,
  setup_status text not null default 'created' check (setup_status in ('created','forwarding_pending','active','error')),
  created_by uuid references auth.users(id) on delete set null,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_email_inbox_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  inbox_id text not null,
  thread_id text,
  email_id text,
  event_created_at timestamptz,
  received_at timestamptz not null default now()
);
create index if not exists admin_email_inbox_events_thread_idx
  on public.admin_email_inbox_events(inbox_id, thread_id, received_at desc);
alter table public.admin_email_inboxes enable row level security;
alter table public.admin_email_inbox_events enable row level security;
revoke all on public.admin_email_inboxes from anon, authenticated;
revoke all on public.admin_email_inbox_events from anon, authenticated;
grant all on public.admin_email_inboxes to service_role;
grant all on public.admin_email_inbox_events to service_role;