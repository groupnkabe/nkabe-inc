-- Nkabe Inc. website submissions
-- Private by default: browser clients receive no table read/write policies.
-- The Edge Function writes with the server-side service role key.

create extension if not exists pgcrypto;

create table if not exists public.pilot_applications (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'needs_information', 'technically_assessed', 'suitable', 'not_suitable', 'pilot_discussion', 'closed')),
  contact_name text not null,
  contact_email text not null,
  phone_or_whatsapp text,
  contact_role text,
  organisation_name text not null,
  organisation_type text not null,
  organisation_website text,
  town_city text not null,
  region_state text not null,
  country text not null default 'Ghana',
  capabilities text[] not null default '{}',
  use_case text not null,
  existing_inventory_link text,
  local_network text,
  internet_connectivity text,
  networking_equipment text,
  computer_room_or_lab text,
  electricity_reliability text,
  backup_power text,
  it_support_arrangement text,
  additional_information text,
  contact_permission boolean not null default false,
  internal_notes text
);

create table if not exists public.pilot_computer_groups (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.pilot_applications(id) on delete cascade,
  group_number integer not null check (group_number > 0),
  computer_type text not null,
  quantity integer not null check (quantity > 0 and quantity <= 10000),
  manufacturer_model text not null,
  processor text,
  ram text,
  storage text,
  operating_system text,
  approximate_age text,
  condition text not null,
  created_at timestamptz not null default now(),
  unique (application_id, group_number)
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'reviewing', 'replied', 'closed')),
  name text not null,
  email text not null,
  organisation text,
  message text not null,
  internal_notes text
);

create index if not exists pilot_applications_submitted_at_idx
  on public.pilot_applications (submitted_at desc);
create index if not exists pilot_applications_status_idx
  on public.pilot_applications (status);
create index if not exists pilot_computer_groups_application_id_idx
  on public.pilot_computer_groups (application_id);
create index if not exists contact_messages_submitted_at_idx
  on public.contact_messages (submitted_at desc);

alter table public.pilot_applications enable row level security;
alter table public.pilot_computer_groups enable row level security;
alter table public.contact_messages enable row level security;

-- Intentionally no anon/authenticated policies. Submissions are written only
-- by the trusted Edge Function using its server-side service role credential.
-- Inspect records in the Supabase dashboard (Table Editor) as project owner.
