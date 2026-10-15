create type public.plan_status as enum ('draft','active','paused','completed','archived');
create type public.plan_action_status as enum ('planned','done','skipped','cancelled');
create type public.consent_purpose as enum ('health_source_sync','ai_processing','professional_sharing','partner_marketing');

-- Optional context only. This is user-entered and never silently inferred.
create table public.profile_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  height_cm numeric check (height_cm between 50 and 260),
  sex_at_birth text check (sex_at_birth in ('female','male','intersex','prefer_not_to_say')),
  training_experience text,
  available_training_days smallint[] not null default '{}',
  preferred_session_minutes integer check (preferred_session_minutes between 5 and 360),
  available_equipment text[] not null default '{}',
  dietary_preferences text[] not null default '{}',
  allergies_and_intolerances text[] not null default '{}',
  preferred_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lifestyle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  steps integer check (steps >= 0),
  active_minutes integer check (active_minutes >= 0),
  sunlight_minutes integer check (sunlight_minutes >= 0),
  caffeine_mg numeric check (caffeine_mg >= 0),
  alcohol_units numeric check (alcohol_units >= 0),
  travel_timezone text,
  context_note text,
  source text not null default 'manual',
  provenance public.value_provenance not null default 'USER_PROVIDED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lifestyle_logs_user_time_idx on public.lifestyle_logs(user_id, logged_at desc);

create table public.injury_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body_region text not null,
  status text not null default 'current' check (status in ('current','recovering','resolved')),
  started_at date,
  resolved_at date,
  user_notes text,
  clinician_guidance text,
  activity_restrictions text,
  provenance public.value_provenance not null default 'USER_PROVIDED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index injury_records_user_status_idx on public.injury_records(user_id,status);

create table public.supplement_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  user_reported_dose text,
  user_reported_schedule text,
  started_on date,
  ended_on date,
  active boolean not null default true,
  label_document_id uuid references public.health_documents(id) on delete set null,
  notes text,
  provenance public.value_provenance not null default 'USER_PROVIDED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplement_records_user_active_idx on public.supplement_records(user_id,active);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  parent_plan_id uuid references public.plans(id) on delete set null,
  version integer not null default 1 check (version > 0),
  title text not null,
  intent text not null,
  status public.plan_status not null default 'draft',
  starts_on date,
  target_date date,
  assumptions text[] not null default '{}',
  missing_information text[] not null default '{}',
  source_evidence jsonb not null default '[]'::jsonb,
  user_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,parent_plan_id,version),
  unique(id,user_id)
);
create index plans_user_status_idx on public.plans(user_id,status,updated_at desc);

create table public.plan_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  sequence integer not null check (sequence > 0),
  name text not null,
  focus text not null,
  starts_on date,
  ends_on date,
  review_questions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(plan_id,sequence),
  unique(id,user_id),
  foreign key(plan_id,user_id) references public.plans(id,user_id) on delete cascade
);
create index plan_phases_user_plan_idx on public.plan_phases(user_id,plan_id,sequence);

create table public.plan_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  phase_id uuid,
  domain text not null check (domain in ('body','fuel','train','sleep','recover','health','mind','lifestyle','monitoring','professional_follow_up')),
  title text not null,
  instructions text not null,
  cadence jsonb not null default '{}'::jsonb,
  target jsonb not null default '{}'::jsonb,
  safety_note text,
  evidence_refs jsonb not null default '[]'::jsonb,
  status public.plan_action_status not null default 'planned',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(plan_id,user_id) references public.plans(id,user_id) on delete cascade,
  foreign key(phase_id,user_id) references public.plan_phases(id,user_id) on delete cascade
);
create index plan_actions_user_due_idx on public.plan_actions(user_id,due_at) where status='planned';

-- A derived cache for fast context retrieval; normalized domain tables remain the truth.
create table public.personal_health_model_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_version text not null,
  as_of timestamptz not null default now(),
  window_start timestamptz,
  window_end timestamptz,
  source_watermarks jsonb not null default '{}'::jsonb,
  model_payload jsonb not null,
  stale_after timestamptz,
  created_at timestamptz not null default now()
);
create index health_model_user_asof_idx on public.personal_health_model_snapshots(user_id,as_of desc);

create table public.data_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose public.consent_purpose not null,
  provider text not null default 'app',
  data_categories text[] not null default '{}',
  status text not null check (status in ('granted','revoked')),
  policy_version text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status='granted' and granted_at is not null) or status='revoked')
);
create index data_consents_user_purpose_idx on public.data_consents(user_id,purpose,provider,created_at desc);

alter table public.profile_context enable row level security;
alter table public.lifestyle_logs enable row level security;
alter table public.injury_records enable row level security;
alter table public.supplement_records enable row level security;
alter table public.plans enable row level security;
alter table public.plan_phases enable row level security;
alter table public.plan_actions enable row level security;
alter table public.personal_health_model_snapshots enable row level security;
alter table public.data_consents enable row level security;

create policy "owner or admin reads profile context" on public.profile_context for select using(user_id=auth.uid() or public.has_role(auth.uid(),'ADMIN'));
create policy "owner inserts profile context" on public.profile_context for insert with check(user_id=auth.uid());
create policy "owner updates profile context" on public.profile_context for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "owner deletes profile context" on public.profile_context for delete using(user_id=auth.uid());

do $$ declare t text; begin
  foreach t in array array['lifestyle_logs','injury_records','supplement_records','plans','plan_phases','plan_actions','personal_health_model_snapshots'] loop
    execute format('create policy "owner or admin reads %I" on public.%I for select using(user_id=auth.uid() or public.has_role(auth.uid(),''ADMIN''))',t,t);
    execute format('create policy "owner inserts %I" on public.%I for insert with check(user_id=auth.uid())',t,t);
    execute format('create policy "owner updates %I" on public.%I for update using(user_id=auth.uid()) with check(user_id=auth.uid())',t,t);
    execute format('create policy "owner deletes %I" on public.%I for delete using(user_id=auth.uid())',t,t);
  end loop;
end $$;
create policy "owner reads consent history" on public.data_consents for select using(user_id=auth.uid());
create policy "owner records consent" on public.data_consents for insert with check(user_id=auth.uid());
create policy "owner revokes consent" on public.data_consents for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create trigger set_updated_at before update on public.profile_context for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.lifestyle_logs for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.injury_records for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.supplement_records for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.plan_actions for each row execute function public.set_updated_at();

-- A single confirmation writes the plan, phases and actions in one transaction.
create function public.save_confirmed_plan(
  _goal_id uuid, _title text, _intent text, _starts_on date, _target_date date,
  _assumptions text[], _missing_information text[], _source_evidence jsonb, _phases jsonb
) returns uuid language plpgsql security invoker set search_path=public
as $$
declare
  current_user_id uuid := auth.uid();
  new_plan_id uuid;
  new_phase_id uuid;
  phase_row jsonb;
  action_row jsonb;
  phase_number integer := 0;
  phase_start date := coalesce(_starts_on,current_date);
  phase_duration integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if length(trim(_title)) < 1 or length(_title) > 160 then raise exception 'invalid plan title'; end if;
  if jsonb_typeof(_phases) <> 'array' or jsonb_array_length(_phases) = 0 then raise exception 'at least one phase is required'; end if;
  if _goal_id is not null and not exists(select 1 from public.goals where id=_goal_id and user_id=current_user_id) then raise exception 'goal does not belong to current user'; end if;
  insert into public.plans(user_id,goal_id,title,intent,status,starts_on,target_date,assumptions,missing_information,source_evidence,user_confirmed_at)
  values(current_user_id,_goal_id,_title,_intent,'active',coalesce(_starts_on,current_date),_target_date,coalesce(_assumptions,'{}'),coalesce(_missing_information,'{}'),coalesce(_source_evidence,'[]'::jsonb),now())
  returning id into new_plan_id;
  for phase_row in select value from jsonb_array_elements(_phases) loop
    phase_number := phase_number + 1;
    phase_duration := greatest(1,least(52,coalesce((phase_row->>'duration_weeks')::integer,1)));
    insert into public.plan_phases(user_id,plan_id,sequence,name,focus,starts_on,ends_on)
    values(current_user_id,new_plan_id,phase_number,phase_row->>'name',phase_row->>'focus',phase_start,phase_start + (phase_duration*7) - 1)
    returning id into new_phase_id;
    for action_row in select value from jsonb_array_elements(coalesce(phase_row->'actions','[]'::jsonb)) loop
      insert into public.plan_actions(user_id,plan_id,phase_id,domain,title,instructions,cadence,target,safety_note,evidence_refs)
      values(current_user_id,new_plan_id,new_phase_id,action_row->>'domain',action_row->>'title',action_row->>'instructions',to_jsonb(coalesce(action_row->>'cadence','')),to_jsonb(coalesce(action_row->>'target','')),action_row->>'safety_note',coalesce(action_row->'evidence_refs','[]'::jsonb));
    end loop;
    phase_start := phase_start + (phase_duration*7);
  end loop;
  return new_plan_id;
end $$;
revoke all on function public.save_confirmed_plan(uuid,text,text,date,date,text[],text[],jsonb,jsonb) from public, anon;
grant execute on function public.save_confirmed_plan(uuid,text,text,date,date,text[],text[],jsonb,jsonb) to authenticated;
