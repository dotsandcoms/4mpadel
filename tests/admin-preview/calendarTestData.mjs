export const calendarEvents = Array.from({length: 105}, (_,i) => ({
  id: 9000+i, event_name: `QA calendar event ${String(i+1).padStart(3,'0')}`, slug: `qa-calendar-${i}`,
  start_date: `2026-09-${String(i%28+1).padStart(2,'0')}`, end_date: `2026-09-${String(Math.min(i%28+3,30)).padStart(2,'0')}`,
  city: i%2 ? 'Pretoria' : 'Cape Town', venue:'QA Padel Club', organiser_name:'QA Organisation', organisation_id:1,
  sapa_status:['Major','Gold','Silver','Bronze'][i%4], is_visible:i%5!==0, featured_event:i%7===0, featured_live:i%13===0,
  is_league:i%9===0, rankedin_id:i%2?1234:null, entry_fee:650, allow_payments:true, finance_managed:true,
  registration_opens_at:'2026-08-01T07:00:00Z', registration_closes_at:'2026-08-30T15:00:00Z',
  description:'<p>Synthetic event for UI verification only.</p>', category_fees:{Open:650},
}));
export const calendarTables = {calendar:calendarEvents,organisations:[{id:1,name:'QA Organisation'}],event_creation_audit:[{id:1,event_id:9000,creator_name:'QA administrator',created_at:'2026-08-01'}],tournament_divisions:[{id:1,event_id:9000,name:"Men's Open",entry_fee:650,sort_order:1,license_required:true,max_teams:20}]};
