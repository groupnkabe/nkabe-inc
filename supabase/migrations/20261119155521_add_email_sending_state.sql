-- Add an explicit in-flight state to prevent duplicate sends of an email draft.
alter table public.admin_conversation_messages
  drop constraint if exists admin_conversation_channel_type;

alter table public.admin_conversation_messages
  add constraint admin_conversation_channel_type check (
    (message_type = 'internal_note' and channel = 'internal' and delivery_status = 'not_applicable')
    or
    (message_type = 'outbound' and channel = 'email'
      and delivery_status in ('draft','not_configured','sending','sent','failed'))
  );

alter table public.admin_conversation_messages
  drop constraint if exists admin_conversation_messages_delivery_status_check;

alter table public.admin_conversation_messages
  add constraint admin_conversation_messages_delivery_status_check
  check (delivery_status in ('draft','not_configured','sending','sent','failed','not_applicable'));
