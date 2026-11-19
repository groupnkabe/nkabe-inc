-- Restrict staff updates to status fields and constrain conversation inserts.
begin;
revoke update on table public.contact_messages from authenticated;
grant update (status) on table public.contact_messages to authenticated;
revoke update on table public.pilot_applications from authenticated;
grant update (status) on table public.pilot_applications to authenticated;
revoke insert on table public.admin_conversation_messages from authenticated;
grant insert (contact_message_id, pilot_application_id, message_type, channel, subject, body, delivery_status, created_by)
  on public.admin_conversation_messages to authenticated;
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
commit;
