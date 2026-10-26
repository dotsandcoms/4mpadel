-- Read-only diagnostics. Run after both mobile migrations and the scheduler are installed.
SELECT count(*) AS registered_expo_devices FROM public.player_push_tokens WHERE token_kind='expo';
SELECT status,count(*) FROM public.push_deliveries GROUP BY status ORDER BY status;
SELECT o.created_at,o.type,d.status,d.attempts,d.available_at,d.error
FROM public.push_deliveries d JOIN public.push_outbox o ON o.id=d.outbox_id
ORDER BY o.created_at DESC LIMIT 30;
SELECT jobname,schedule,active FROM cron.job WHERE jobname='player-push-delivery';
SELECT r.start_time,r.end_time,r.status,r.return_message
FROM cron.job_run_details r JOIN cron.job j ON j.jobid=r.jobid
WHERE j.jobname='player-push-delivery' ORDER BY r.start_time DESC LIMIT 10;
-- A successful cron run means HTTP was queued, not that delivery succeeded.
SELECT id,status_code,timed_out,error_msg,created FROM net._http_response ORDER BY created DESC LIMIT 10;
