-- Enable RLS (Row Level Security)
alter table players enable row level security;
alter table events enable row level security;

-- Create Policy for Public Read Access (Anon)
create policy "Public can view players"
on players for select
to anon
using (true);

create policy "Public can view events"
on events for select
to anon
using (true);

-- Allow Authenticated Users (Admin) to Insert/Update/Delete
create policy "Admins can manage players"
on players for all
to authenticated
using (true)
with check (true);

create policy "Admins can manage events"
on events for all
to authenticated
using (true)
with check (true);
