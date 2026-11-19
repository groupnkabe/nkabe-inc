-- Nkabe private admin workspace and conversation history
-- Apply after 20261119000100_create_website_submissions.sql.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid references public.contact_messages(id) on delete cascade,
  pilot_application_id uuid references public.pilot_applications(id) on delete cascade,
  message_type text not null check (message_type in ('outbound', 'internal_note')),
  channel text not null check (channel in ('email', 'internal')),
  subject text,
  body text not null check (length(trim(body)) > 0),
  delivery_status text not null default 'draft'
    check (delivery_status in ('draft', 'not_configured', 'sent', 'failed', 'not_applicable')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint admin_conversation_one_parent
    check (((contact_message_id is not null)::int + (pilot_application_id is not null)::int) = 1),
  constraint admin_conversation_channel_type
    check (
      (message_type = 'internal_note' and channel = 'internal' and delivery_status = 'not_applicable')
      or
      (message_type = 'outbound' and channel = 'email' and delivery_status in ('draft', 'not_configured', 'sent', 'failed'))
    )
);

create index if not exists admin_conversation_contact_idx
  on public.admin_conversation_messages (contact_message_id, created_at);
create index if not exists admin_conversation_pilot_idx
  on public.admin_conversation_messages (pilot_application_id, created_at);
create index if not exists admin_conversation_created_by_idx
  on public.admin_conversation_messages (created_by);

alter table public.admin_users enable row level security;
alter table public.admin_conversation_messages enable row level security;
alter table public.contact_messages enable row level security;
alter table public.pilot_applications enable row level security;
alter table public.pilot_computer_groups enable row level security;

-- Staff can read only their own authorisation row. This also makes the
-- membership EXISTS checks below safe without recursive RLS policies.
drop policy if exists "Admin users can read own access" on public.admin_users;
create policy "Admin users can read own access"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) and is_active = true);

drop policy if exists "Authorised staff can read contact messages" on public.contact_messages;
create policy "Authorised staff can read contact messages"
  on public.contact_messages for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can update contact messages" on public.contact_messages;
create policy "Authorised staff can update contact messages"
  on public.contact_messages for update to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ))
  with check (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can read pilot applications" on public.pilot_applications;
create policy "Authorised staff can read pilot applications"
  on public.pilot_applications for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can update pilot applications" on public.pilot_applications;
create policy "Authorised staff can update pilot applications"
  on public.pilot_applications for update to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ))
  with check (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can read pilot computer groups" on public.pilot_computer_groups;
create policy "Authorised staff can read pilot computer groups"
  on public.pilot_computer_groups for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can read conversation history" on public.admin_conversation_messages;
create policy "Authorised staff can read conversation history"
  on public.admin_conversation_messages for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));

drop policy if exists "Authorised staff can add conversation entries" on public.admin_conversation_messages;
create policy "Authorised staff can add conversation entries"
  on public.admin_conversation_messages for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid()) and a.is_active = true
    )
  );

-- Explicit grants are required because new public-schema tables are no longer
-- automatically exposed through the Data API. RLS remains the row-level gate.
grant select on public.admin_users to authenticated;
grant select, update on public.contact_messages to authenticated;
grant select, update on public.pilot_applications to authenticated;
grant select on public.pilot_computer_groups to authenticated;
grant select, insert on public.admin_conversation_messages to authenticated;

-- No anon policies or grants. Do not add public access to these records.
