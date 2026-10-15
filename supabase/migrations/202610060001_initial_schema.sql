create extension if not exists pgcrypto;

create type public.app_role as enum ('USER','ADMIN');
create type public.value_provenance as enum ('MEASURED','ESTIMATED','USER_PROVIDED','AI_INFERRED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  units text not null default 'metric' check (units in ('metric','imperial')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'USER', created_at timestamptz not null default now(), unique(user_id,role)
);
create index user_roles_user_idx on public.user_roles(user_id);

create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(), meal_type text not null check(meal_type in ('breakfast','lunch','dinner','snack','other')),
  notes text, calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  provenance public.value_provenance not null default 'USER_PROVIDED', confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.nutrition_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  nutrition_log_id uuid not null references public.nutrition_logs(id) on delete cascade, food_name text not null,
  food_name_local text, quantity numeric, quantity_unit text, calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  provenance public.value_provenance not null default 'USER_PROVIDED', source text, created_at timestamptz not null default now()
);
create index nutrition_logs_user_time_idx on public.nutrition_logs(user_id,logged_at desc);
create index nutrition_items_log_idx on public.nutrition_items(nutrition_log_id);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null, started_at timestamptz not null default now(), duration_minutes numeric,
  distance_km numeric, pace text, avg_heart_rate integer, elevation_m numeric, notes text,
  provenance public.value_provenance not null default 'USER_PROVIDED', confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.training_exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete cascade, exercise_name text not null,
  ordinal integer not null default 0, notes text, created_at timestamptz not null default now()
);
create table public.training_sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.training_exercises(id) on delete cascade,
  set_number integer not null, reps integer, load_kg numeric, duration_seconds integer, distance_m numeric, created_at timestamptz not null default now()
);
create index training_user_time_idx on public.training_sessions(user_id,started_at desc);

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null, duration_minutes integer, quality integer check(quality between 1 and 5), source text not null default 'manual',
  provenance public.value_provenance not null default 'USER_PROVIDED', notes text, confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,sleep_date,source)
);
create table public.recovery_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(), fatigue integer check(fatigue between 1 and 10), soreness integer check(soreness between 1 and 10),
  stress integer check(stress between 1 and 10), recovery_score integer check(recovery_score between 0 and 100), rest_day boolean,
  source text not null default 'manual', notes text, provenance public.value_provenance not null default 'USER_PROVIDED',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(), weight_kg numeric, waist_cm numeric, chest_cm numeric, arm_cm numeric,
  thigh_cm numeric, calf_cm numeric, hip_cm numeric, body_fat_percent numeric, body_fat_provenance public.value_provenance,
  notes text, provenance public.value_provenance not null default 'MEASURED', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index body_measurements_user_date_idx on public.body_measurements(user_id,measured_at desc);
create table public.body_photos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, captured_at timestamptz not null default now(), notes text, created_at timestamptz not null default now()
);

create table public.health_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, file_name text not null, mime_type text not null, document_type text not null default 'other',
  document_date date, laboratory text, notes text, extraction_status text not null default 'pending' check(extraction_status in ('pending','review','confirmed','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.health_lab_results (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.health_documents(id) on delete cascade, test_name text not null,
  value numeric, value_text text, unit text, reference_low numeric, reference_high numeric, reference_range_text text,
  result_date date, laboratory text, out_of_range boolean, provenance public.value_provenance not null default 'USER_PROVIDED',
  confirmed_at timestamptz, created_at timestamptz not null default now()
);
create index lab_results_user_date_idx on public.health_lab_results(user_id,result_date desc);
create table public.mood_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(), mood integer check(mood between 1 and 5), stress integer check(stress between 1 and 10),
  note text, provenance public.value_provenance not null default 'USER_PROVIDED', created_at timestamptz not null default now()
);
create table public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null, title text not null, target numeric, unit text, starts_on date, ends_on date, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid, input_kind text not null default 'text', status text not null default 'completed', model text,
  created_at timestamptz not null default now()
);
create table public.ai_extraction_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  interaction_id uuid references public.ai_interactions(id) on delete set null, domain text not null, event_type text not null,
  proposed_data jsonb not null, confidence numeric check(confidence between 0 and 1), status text not null default 'pending' check(status in ('pending','confirmed','edited','rejected')),
  resolved_data jsonb, resolved_at timestamptz, created_at timestamptz not null default now()
);
create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, weight_reflection text, sleep_reflection text, training_reflection text, nutrition_reflection text,
  recovery_reflection text, stress_reflection text, mood_reflection text, achievements text, challenges text, priorities text,
  ai_report text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,week_start)
);
create table public.insights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  category text not null, title text not null, body text not null, evidence jsonb not null default '{}'::jsonb,
  period_start date, period_end date, status text not null default 'active', generated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.system_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  event_type text not null, severity text not null default 'info', summary text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public
as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name','')); insert into public.user_roles(user_id,role) values(new.id,'USER'); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
do $$ declare t text; begin foreach t in array array['profiles','nutrition_logs','training_sessions','sleep_logs','recovery_logs','body_measurements','health_documents','goals','weekly_checkins'] loop execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t); end loop; end $$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
create policy "profiles self or admin read" on public.profiles for select using(id=auth.uid() or public.has_role(auth.uid(),'ADMIN'));
create policy "profiles self update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "roles self or admin read" on public.user_roles for select using(user_id=auth.uid() or public.has_role(auth.uid(),'ADMIN'));
-- Role assignments are never writable by clients. Provision admins with a trusted migration/console.

do $$ declare t text; begin foreach t in array array['nutrition_logs','nutrition_items','training_sessions','training_exercises','training_sets','sleep_logs','recovery_logs','body_measurements','body_photos','health_documents','health_lab_results','mood_logs','goals','ai_interactions','ai_extraction_events','weekly_checkins','insights','notifications'] loop
execute format('alter table public.%I enable row level security',t);
execute format('create policy "owner or admin read" on public.%I for select using(user_id=auth.uid() or public.has_role(auth.uid(),''ADMIN''))',t);
execute format('create policy "owner insert" on public.%I for insert with check(user_id=auth.uid())',t);
execute format('create policy "owner update" on public.%I for update using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
execute format('create policy "owner delete" on public.%I for delete using(user_id=auth.uid())',t);
end loop; end $$;
alter table public.system_events enable row level security;
create policy "admin reads system events" on public.system_events for select using(public.has_role(auth.uid(),'ADMIN'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('health-documents','health-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']),
 ('body-photos','body-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "user owns private storage objects" on storage.objects for select using(bucket_id in ('health-documents','body-photos') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "user uploads private storage objects" on storage.objects for insert with check(bucket_id in ('health-documents','body-photos') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "user deletes private storage objects" on storage.objects for delete using(bucket_id in ('health-documents','body-photos') and (storage.foldername(name))[1]=auth.uid()::text);
