-- Hourly dispatch lets each opted-in traveler receive a Wednesday 6 p.m.
-- digest in their own timezone. Both functions perform their own authorization,
-- quiet-hour, deduplication, expiry, and eligibility checks.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'outing-weekly-discovery-hourly';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  select jobid into v_job_id from cron.job where jobname = 'outing-inspiration-cleanup-hourly';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'outing-weekly-discovery-hourly',
  '5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'outing_project_url') || '/functions/v1/weekly-discovery',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-outing-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'outing_discovery_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

select cron.schedule(
  'outing-inspiration-cleanup-hourly',
  '25 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'outing_project_url') || '/functions/v1/inspiration-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-outing-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'outing_discovery_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
