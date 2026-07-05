-- Supabase shēma dashboard lapai.
-- Palaid šo Supabase → SQL Editor (vienreiz). Droši palaist atkārtoti.
--
-- Divas tabulas: uzdevumi (todos) un saites (links). Katra rinda pieder
-- lietotājam (user_id). Row Level Security (RLS) nodrošina, ka katrs redz un
-- maina TIKAI savas rindas. user_id aizpildās automātiski ar auth.uid().

-- ---------- Uzdevumi ----------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

drop policy if exists "todos owner" on public.todos;
create policy "todos owner" on public.todos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Saites ----------
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  url text not null,
  icon text,
  created_at timestamptz not null default now()
);

alter table public.links enable row level security;

drop policy if exists "links owner" on public.links;
create policy "links owner" on public.links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- (Nav obligāti) Reāllaika sinhronizācija ----------
-- Ja gribi, lai izmaiņas parādās uzreiz visās atvērtajās iekārtās, ieslēdz
-- Realtime šīm tabulām. Lapa strādā arī bez tā (dati atsvaidzinās, atgriežoties
-- cilnē). Ja tabula jau ir publikācijā, šī rinda var iemest kļūdu — tad ignorē.
-- alter publication supabase_realtime add table public.todos, public.links;
