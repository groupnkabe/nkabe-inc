-- Role-aware access rules for the Nkabe private admin workspace.
-- Applied to the live Supabase project as implement_role_based_access_control.

alter table public.admin_users
  add constraint admin_users_role_check check (role in ('owner','admin','staff'));

drop policy if exists "Admin users can read own access" on public.admin_users;
drop policy if exists "Users can read their own active access" on public.admin_users;
create policy "Users can read their own active access"
on public.admin_users for select to authenticated
using (
  user_id = (select auth.uid())
  and is_active = true
  and role in ('owner','admin','staff')
);

drop policy if exists "Authorised staff can read contact messages" on public.contact_messages;
create policy "Active team can read contact messages"
on public.contact_messages for select to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can update contact messages" on public.contact_messages;
create policy "Active team can update contact status"
on public.contact_messages for update to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
))
with check (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can read pilot applications" on public.pilot_applications;
create policy "Active team can read pilot applications"
on public.pilot_applications for select to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can update pilot applications" on public.pilot_applications;
create policy "Active team can update pilot status"
on public.pilot_applications for update to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
))
with check (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can read pilot computer groups" on public.pilot_computer_groups;
create policy "Active team can read pilot computer groups"
on public.pilot_computer_groups for select to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can read conversation history" on public.admin_conversation_messages;
create policy "Active team can read conversation history"
on public.admin_conversation_messages for select to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
));

drop policy if exists "Authorised staff can add conversation entries" on public.admin_conversation_messages;
drop policy if exists "Authorised staff can add valid conversation entries" on public.admin_conversation_messages;
drop policy if exists "Team can add internal notes and authorised users can draft email" on public.admin_conversation_messages;
create policy "Team can add internal notes and authorised users can draft email"
on public.admin_conversation_messages for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.admin_users a
    where a.user_id=(select auth.uid()) and a.is_active=true and a.role in ('owner','admin','staff')
      and (
        (message_type='internal_note' and channel='internal' and delivery_status='not_applicable')
        or
        (a.role in ('owner','admin') and message_type='outbound' and channel='email' and delivery_status='not_configured')
      )
  )
);
