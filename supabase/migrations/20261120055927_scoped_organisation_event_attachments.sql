-- Event pages consume these links directly. Uploads go through the application
-- handler, which validates the file bytes and chooses the exact host/event path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organisation-event-attachments', 'organisation-event-attachments', true, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- A permissive policy for another workflow must not grant listing or writes
-- here. Public URLs are resolved by the storage delivery endpoint.
create policy "Organisation attachments are not listed" on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id <> 'organisation-event-attachments');
create policy "Organisation attachments use the upload handler" on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'organisation-event-attachments');
create policy "Organisation attachments cannot be overwritten by clients" on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'organisation-event-attachments')
  with check (bucket_id <> 'organisation-event-attachments');
create policy "Organisation attachments remain available to referencing events" on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'organisation-event-attachments');
