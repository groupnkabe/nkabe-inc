-- Central internal communications for Nkabe Inc.
-- Email transport remains Resend; this schema provides employee-to-employee
-- conversations and project channels without changing the nkabe.us MX records.

create table if not exists public.admin_communication_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  description text not null default '',
  channel_type text not null default 'project' check (channel_type in ('general','project')),
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_communication_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.admin_communication_channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  parent_message_id uuid references public.admin_communication_messages(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_communication_message_destination_check
    check ((channel_id is not null and recipient_id is null) or (channel_id is null and recipient_id is not null)),
  constraint admin_communication_no_self_dm check (recipient_id is null or recipient_id <> sender_id)
);

create index if not exists admin_communication_messages_channel_created_idx
  on public.admin_communication_messages(channel_id, created_at desc)
  where channel_id is not null;
create index if not exists admin_communication_messages_dm_created_idx
  on public.admin_communication_messages(sender_id, recipient_id, created_at desc)
  where recipient_id is not null;
create index if not exists admin_communication_messages_recipient_unread_idx
  on public.admin_communication_messages(recipient_id, created_at desc)
  where recipient_id is not null and read_at is null;

alter table public.admin_communication_channels enable row level security;
alter table public.admin_communication_messages enable row level security;

-- The service-role-backed Edge Function performs actor checks and all access.
-- Browser clients cannot query these tables directly.
revoke all on public.admin_communication_channels from anon, authenticated;
revoke all on public.admin_communication_messages from anon, authenticated;
grant all on public.admin_communication_channels to service_role;
grant all on public.admin_communication_messages to service_role;

insert into public.admin_communication_channels (name, slug, description, channel_type, created_by)
select 'General', 'general', 'Company-wide updates and everyday team discussion.', 'general',
       (select user_id from public.admin_users where role = 'owner' and is_active = true order by created_at asc limit 1)
where not exists (select 1 from public.admin_communication_channels where slug = 'general');
