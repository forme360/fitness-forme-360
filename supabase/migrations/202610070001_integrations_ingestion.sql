-- Integration state intentionally contains no provider access tokens or API secrets.
create table public.connected_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect','garmin','strava','adidas_running','oura','whoop','fitbit','manual')),
  status text not null default 'pending' check (status in ('pending','connected','paused','revoked','error')),
  granted_scopes text[] not null default '{}',
  provider_account_id text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);
create index connected_integrations_user_idx on public.connected_integrations(user_id, provider);
alter table public.connected_integrations enable row level security;
create policy "owner reads integration connections" on public.connected_integrations for select using(user_id=auth.uid() or public.has_role(auth.uid(),'ADMIN'));
create policy "owner manages integration connections" on public.connected_integrations for insert with check(user_id=auth.uid());
create policy "owner updates integration connections" on public.connected_integrations for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "owner deletes integration connections" on public.connected_integrations for delete using(user_id=auth.uid());

create table public.ingestion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.connected_integrations(id) on delete cascade,
  provider text not null,
  external_id text not null,
  event_type text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  distance_m numeric,
  dedupe_group_id uuid not null default gen_random_uuid(),
  dedupe_status text not null default 'pending' check (dedupe_status in ('pending','canonical','duplicate_candidate','review_required','rejected')),
  canonical_training_session_id uuid references public.training_sessions(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique(user_id, provider, external_id)
);
create index ingestion_events_user_start_idx on public.ingestion_events(user_id, started_at desc);
create index ingestion_events_dedupe_idx on public.ingestion_events(user_id, dedupe_group_id);
alter table public.ingestion_events enable row level security;
create policy "owner or authorized admin reads imported events" on public.ingestion_events for select using(user_id=auth.uid() or public.has_role(auth.uid(),'ADMIN'));
create policy "owner inserts imported events" on public.ingestion_events for insert with check(user_id=auth.uid());
create policy "owner updates imported events" on public.ingestion_events for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "owner deletes imported events" on public.ingestion_events for delete using(user_id=auth.uid());

create trigger set_updated_at before update on public.connected_integrations for each row execute function public.set_updated_at();

-- Saving a confirmed meal and its food items is atomic; this function uses the
-- caller's JWT and RLS, and never accepts a user_id from the client.
create function public.save_confirmed_meal(
  _meal_type text, _notes text, _calories numeric, _protein_g numeric,
  _carbs_g numeric, _fat_g numeric, _provenance public.value_provenance, _foods jsonb
) returns uuid language plpgsql security invoker set search_path=public
as $$
declare meal_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(_foods) <> 'array' or jsonb_array_length(_foods) = 0 then raise exception 'at least one food item is required'; end if;
  insert into public.nutrition_logs(user_id, meal_type, notes, calories, protein_g, carbs_g, fat_g, provenance, confirmed_at)
  values(current_user_id, _meal_type, _notes, _calories, _protein_g, _carbs_g, _fat_g, _provenance, now()) returning id into meal_id;
  insert into public.nutrition_items(user_id, nutrition_log_id, food_name, quantity, quantity_unit, provenance)
  select current_user_id, meal_id, f.food_name, f.quantity, f.unit, 'USER_PROVIDED'::public.value_provenance
  from jsonb_to_recordset(_foods) as f(food_name text, quantity numeric, unit text);
  return meal_id;
end $$;
revoke all on function public.save_confirmed_meal(text,text,numeric,numeric,numeric,numeric,public.value_provenance,jsonb) from public, anon;
grant execute on function public.save_confirmed_meal(text,text,numeric,numeric,numeric,numeric,public.value_provenance,jsonb) to authenticated;
