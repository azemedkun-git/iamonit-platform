create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create trigger set_tenants_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

alter table public.tenants enable row level security;
