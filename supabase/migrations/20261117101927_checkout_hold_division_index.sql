-- Cover the division foreign key for division maintenance and capacity lookups.
create index event_checkout_holds_division on private.event_checkout_holds(division_id);
