-- ============================================================
-- gastos-tracker · schema inicial
-- Este SQL vive DENTRO del proyecto Supabase de LifeOfSam
-- (xbctgokkysfwhbhchvvq) pero en su propio schema "gastos",
-- totalmente separado de las tablas que usa la app iOS.
-- Correr completo en el SQL Editor de ese proyecto.
-- ============================================================

create schema if not exists gastos;

-- Tarjetas -----------------------------------------------------
create table gastos.tarjetas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

-- Categorías -----------------------------------------------------
create table gastos.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  color text not null default '#767A72',
  keywords text[] not null default '{}',
  tipo text not null default 'gasto' check (tipo in ('gasto','ingreso')),
  created_at timestamptz not null default now()
);

-- Movimientos -------------------------------------------
create table gastos.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  monto numeric(12,2) not null,
  tarjeta_id uuid references gastos.tarjetas(id) on delete set null,
  categoria_id uuid references gastos.categorias(id) on delete set null,
  cuota_actual int,  -- ej. 9  → null = pago neto (no es MSI)
  cuota_total int,   -- ej. 12 → null = pago neto (no es MSI)
  created_at timestamptz not null default now()
);

create index idx_movimientos_user_fecha on gastos.movimientos(user_id, fecha desc);

-- RLS: cada quien solo ve y toca lo suyo --------------------------
alter table gastos.tarjetas enable row level security;
alter table gastos.categorias enable row level security;
alter table gastos.movimientos enable row level security;

create policy "tarjetas: propias" on gastos.tarjetas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categorias: propias" on gastos.categorias
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "movimientos: propios" on gastos.movimientos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Permisos: por defecto un schema nuevo no es accesible por los
-- roles de la API, hay que otorgarlo explícitamente ------------
grant usage on schema gastos to authenticated, anon;
grant all on all tables in schema gastos to authenticated;
alter default privileges in schema gastos grant all on tables to authenticated;

-- ============================================================
-- IMPORTANTE — paso extra en el dashboard (no es SQL):
-- Settings → API → Data API Settings → Exposed schemas
-- Agrega "gastos" a la lista (por default solo "public" está
-- expuesto vía la API). Sin esto, index.html no va a poder
-- leer/escribir aunque el SQL de arriba haya corrido bien.
--
-- Las tarjetas y categorías por defecto se crean desde la app
-- la primera vez que inicias sesión, no aquí.
-- ============================================================
