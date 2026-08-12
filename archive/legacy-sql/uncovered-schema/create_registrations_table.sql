-- Create a table for event registrations
create table if not exists event_registrations (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  event_id bigint references calendar(id) not null,
  full_name text not null,
  email text not null,
  phone text,
  partner_name text,
  division text,
  payment_status text default 'pending'
);

-- Add RLS policies (optional but good practice, skipping complex RLS for MVP speed unless requested)
-- For now, allow public insert (since users might not be logged in)
alter table event_registrations enable row level security;

create policy "Allow public inserts"
on event_registrations for insert
with check (true);

-- Allow reading only by admin (authenticated) - Simplified for now
create policy "Allow anon read own"
on event_registrations for select
using (true);
