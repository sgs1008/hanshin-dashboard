begin;

create type public.approval_status as enum (
  'pending',
  'approved',
  'rejected',
  'suspended'
);

create type public.app_role as enum (
  'member',
  'admin'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  department text,
  employee_no text,
  status public.approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member'
);

create table public.approval_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('approved', 'rejected', 'suspended')),
  actor_user_id uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.dashboard_datasets (
  id bigint generated always as identity primary key,
  dataset_key text not null,
  period text not null default 'current',
  payload jsonb not null,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create unique index dashboard_datasets_active_key_version
  on public.dashboard_datasets (dataset_key, version)
  where is_active;

create index profiles_status_requested_at_idx
  on public.profiles (status, requested_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    department,
    employee_no
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'department'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'employee_no'), '')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'member');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and status = 'approved'
  );
$$;

create or replace function public.admin_set_user_status(
  target_user_id uuid,
  new_status public.approval_status,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not exists (
    select 1
    from public.user_roles
    where user_id = actor_id
      and role = 'admin'
  ) then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if target_user_id = actor_id then
    raise exception '자신의 상태는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new_status not in (
    'approved'::public.approval_status,
    'rejected'::public.approval_status,
    'suspended'::public.approval_status
  ) then
    raise exception '허용되지 않은 상태입니다.';
  end if;

  update public.profiles
  set
    status = new_status,
    approved_at = case when new_status = 'approved' then now() else null end,
    approved_by = case when new_status = 'approved' then actor_id else null end,
    updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception '사용자를 찾을 수 없습니다.';
  end if;

  insert into public.approval_audit (
    target_user_id,
    action,
    actor_user_id,
    note
  ) values (
    target_user_id,
    new_status::text,
    actor_id,
    nullif(trim(note), '')
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.approval_audit enable row level security;
alter table public.dashboard_datasets enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.approval_audit from anon, authenticated;
revoke all on table public.dashboard_datasets from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.user_roles to authenticated;
grant select on table public.approval_audit to authenticated;
grant select on table public.dashboard_datasets to authenticated;

create policy "본인 또는 관리자가 프로필 조회"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
);

create policy "본인 역할 조회"
on public.user_roles
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "관리자가 승인 이력 조회"
on public.approval_audit
for select
to authenticated
using ((select public.is_admin()));

create policy "승인 회원이 대시보드 데이터 조회"
on public.dashboard_datasets
for select
to authenticated
using (
  (select public.is_approved())
  or (select public.is_admin())
);

revoke all on function public.is_admin() from public;
revoke all on function public.is_approved() from public;
revoke all on function public.admin_set_user_status(uuid, public.approval_status, text) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.approval_status, text) to authenticated;

commit;

