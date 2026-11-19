-- Restore trusted server-side access for Edge Functions using the service_role key.
-- Browser roles remain constrained by the existing least-privilege grants and RLS policies.
begin;
grant all privileges on table
  public.admin_users,
  public.admin_conversation_messages,
  public.contact_messages,
  public.pilot_applications,
  public.pilot_computer_groups
to service_role;
grant usage, select, update on all sequences in schema public to service_role;
commit;
