-- Private write access and public delivery for Nkabe email logo assets
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nkabe-email-branding','nkabe-email-branding',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'];
drop policy if exists "Owner can upload Nkabe email branding" on storage.objects;
create policy "Owner can upload Nkabe email branding" on storage.objects for insert to authenticated
with check (bucket_id='nkabe-email-branding' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'));
drop policy if exists "Owner can update Nkabe email branding" on storage.objects;
create policy "Owner can update Nkabe email branding" on storage.objects for update to authenticated
using (bucket_id='nkabe-email-branding' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'))
with check (bucket_id='nkabe-email-branding' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'));
drop policy if exists "Owner can delete Nkabe email branding" on storage.objects;
create policy "Owner can delete Nkabe email branding" on storage.objects for delete to authenticated
using (bucket_id='nkabe-email-branding' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true and a.role='owner'));
