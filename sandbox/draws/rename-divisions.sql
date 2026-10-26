-- Staging sandbox divisions only.
UPDATE public.tournament_divisions SET name='Mens Open' WHERE id='22222222-2222-4222-8222-222222222222' AND event_id=90000001;
UPDATE public.tournament_divisions SET name='Ladies Open' WHERE id='11111111-1111-4111-8111-111111111111' AND event_id=90000001;
UPDATE public.tournament_divisions SET name='Mixed Open' WHERE id='33333333-3333-4333-8333-333333333333' AND event_id=90000001;
SELECT name FROM public.tournament_divisions WHERE event_id=90000001 ORDER BY sort_order;
