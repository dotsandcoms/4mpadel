\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_admin_organisation_attachments_test' or to_regclass('storage.objects') is not null then
    raise exception 'Use the empty disposable fourm_admin_organisation_attachments_test database';
  end if;
end $$;
begin;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
alter role service_role bypassrls;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(bucket_id text not null, name text not null, primary key(bucket_id,name));
insert into storage.buckets values('event-covers','event-covers',true,null,array['image/jpeg']);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create policy permissive_legacy_fixture on storage.objects for all to anon, authenticated using (true) with check (true);
\ir ../supabase/migrations/20261120055927_scoped_organisation_event_attachments.sql

do $$ begin
  if (select allowed_mime_types from storage.buckets where id='event-covers') is distinct from array['image/jpeg'] then
    raise exception 'Legacy cover bucket was changed';
  end if;
  if not exists(select 1 from storage.buckets where id='organisation-event-attachments' and public and file_size_limit=10485760
    and allowed_mime_types @> array['application/pdf','image/png'] and not ('text/html'=any(allowed_mime_types))) then
    raise exception 'Scoped attachment limits are missing';
  end if;
end $$;

set local role service_role;
insert into storage.objects values ('organisation-event-attachments','own-file'), ('organisation-event-attachments','another-host-file');
set local role authenticated;
insert into storage.objects values ('event-covers','existing-cover');
do $$ begin
  begin
    insert into storage.objects values ('organisation-event-attachments','attempted-direct-upload'); raise exception 'Authenticated direct upload was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update storage.objects set bucket_id='organisation-event-attachments' where name='existing-cover'; raise exception 'Moving a file into the bucket was allowed';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from storage.objects where bucket_id='organisation-event-attachments') then raise exception 'Restricted bucket can be listed'; end if;
  update storage.objects set name='overwritten' where bucket_id='organisation-event-attachments';
  if found then raise exception 'Direct update was allowed'; end if;
  delete from storage.objects where bucket_id='organisation-event-attachments';
  if found then raise exception 'Direct delete was allowed'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    insert into storage.objects values ('organisation-event-attachments','attempted-anonymous-upload'); raise exception 'Anonymous direct upload was allowed';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from storage.objects where bucket_id='organisation-event-attachments') then raise exception 'Restricted bucket can be listed anonymously'; end if;
end $$;
set local role service_role;
do $$ begin
  if (select count(*) from storage.objects where bucket_id='organisation-event-attachments') <> 2 then raise exception 'A client changed an attachment'; end if;
end $$;
rollback;
