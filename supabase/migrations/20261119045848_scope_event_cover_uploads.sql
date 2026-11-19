-- Covers have their own upload scope and can still be served by public URL.
begin;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('event-covers', 'event-covers', true, array['image/jpeg']);

create policy "Event managers can upload cover photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-covers'
  and case
    when name ~ '^events/[1-9][0-9]{0,18}/cover_[a-z0-9_]+[.]jpg$' then
      exists (
        select 1 from public.calendar c
        where c.id = case
          when pg_catalog.pg_input_is_valid(split_part(objects.name, '/', 2), 'bigint')
          then split_part(objects.name, '/', 2)::bigint
        end
        and private.edit_event(c.id)
      )
    when name ~ '^drafts/(calendar|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/cover_[a-z0-9_]+[.]jpg$' then
      (select private.admin_module('calendar'))
      or (
        (select private.permission_actor_active())
        and public.can_manage_calendar_event(nullif(split_part(name, '/', 2), 'calendar')::uuid, null)
      )
    else false
  end
);

commit;
