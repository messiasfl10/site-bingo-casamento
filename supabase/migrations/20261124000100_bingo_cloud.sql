begin;

create schema if not exists app_private;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  game_name text not null check (char_length(game_name) between 1 and 80),
  source_name text not null default 'JSON importado' check (char_length(source_name) <= 120),
  prizes jsonb not null default '{}'::jsonb check (jsonb_typeof(prizes) = 'object'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index games_single_active_game on public.games (is_active) where is_active;

create table public.cards (
  game_id uuid not null references public.games(id) on delete cascade,
  card_number text not null check (char_length(card_number) between 1 and 40),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) = 5),
  purchased_at timestamptz,
  purchased_by uuid references auth.users(id) on delete set null,
  primary key (game_id, card_number)
);

create table public.called_balls (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  ball_number smallint not null check (ball_number between 1 and 75),
  called_at timestamptz not null default now(),
  called_by uuid references auth.users(id) on delete set null,
  unique (game_id, ball_number)
);

create table public.closed_prizes (
  game_id uuid not null references public.games(id) on delete cascade,
  prize_key text not null check (prize_key in ('B', 'I', 'N', 'G', 'O', 'Cartela Cheia')),
  winner_card_number text,
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  primary key (game_id, prize_key),
  foreign key (game_id, winner_card_number) references public.cards(game_id, card_number)
);

create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'seller')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  game_id uuid references public.games(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cards') then
    alter publication supabase_realtime add table public.cards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'called_balls') then
    alter publication supabase_realtime add table public.called_balls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'closed_prizes') then
    alter publication supabase_realtime add table public.closed_prizes;
  end if;
end $$;

create or replace function app_private.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members sm
    where sm.user_id = (select auth.uid()) and sm.role = any (p_roles)
  );
$$;
revoke all on function app_private.has_role(text[]) from public;
grant usage on schema app_private to anon, authenticated;
grant execute on function app_private.has_role(text[]) to anon, authenticated;

alter table public.games enable row level security;
alter table public.cards enable row level security;
alter table public.called_balls enable row level security;
alter table public.closed_prizes enable row level security;
alter table public.staff_members enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to anon, authenticated;
revoke all privileges on table public.games, public.cards, public.called_balls, public.closed_prizes, public.staff_members, public.audit_events from anon, authenticated;
grant select on public.games, public.cards, public.called_balls, public.closed_prizes to anon, authenticated;
grant select on public.staff_members, public.audit_events to authenticated;

create policy games_public_active_read on public.games for select to anon, authenticated using (is_active);
create policy cards_public_active_read on public.cards for select to anon, authenticated using (
  exists (select 1 from public.games g where g.id = cards.game_id and g.is_active)
);
create policy called_balls_public_active_read on public.called_balls for select to anon, authenticated using (
  exists (select 1 from public.games g where g.id = called_balls.game_id and g.is_active)
);
create policy closed_prizes_public_active_read on public.closed_prizes for select to anon, authenticated using (
  exists (select 1 from public.games g where g.id = closed_prizes.game_id and g.is_active)
);
create policy staff_can_read_own_membership on public.staff_members for select to authenticated using (user_id = (select auth.uid()));
create policy admins_can_read_staff on public.staff_members for select to authenticated using (app_private.has_role(array['admin']::text[]));
create policy admins_can_read_audit on public.audit_events for select to authenticated using (app_private.has_role(array['admin']::text[]));

create or replace function app_private.require_role(p_roles text[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not app_private.has_role(p_roles) then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;
  return v_user_id;
end;
$$;
revoke all on function app_private.require_role(text[]) from public;
grant execute on function app_private.require_role(text[]) to authenticated;

create or replace function app_private.log_event(p_game_id uuid, p_actor uuid, p_action text, p_target text default null, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (game_id, actor_id, action, target, details)
  values (p_game_id, p_actor, p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function app_private.log_event(uuid, uuid, text, text, jsonb) from public;
grant execute on function app_private.log_event(uuid, uuid, text, text, jsonb) to authenticated;

create or replace function app_private.active_game_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.games where is_active limit 1;
$$;
revoke all on function app_private.active_game_id() from public;
grant execute on function app_private.active_game_id() to authenticated;

create or replace function app_private.card_pattern_complete(p_game_id uuid, p_card_number text, p_prize_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_column_index integer;
begin
  select c.rows into v_rows from public.cards c
  where c.game_id = p_game_id and c.card_number = p_card_number;
  if v_rows is null then return false; end if;

  if p_prize_key = 'Cartela Cheia' then
    return not exists (
      select 1
      from jsonb_array_elements(v_rows) as r(row_value)
      cross join lateral jsonb_array_elements(r.row_value) as cell(cell_value)
      where jsonb_typeof(cell.cell_value) = 'number'
        and not exists (
          select 1 from public.called_balls b
          where b.game_id = p_game_id and b.ball_number = (cell.cell_value #>> '{}')::integer
        )
    );
  end if;

  v_column_index := array_position(array['B', 'I', 'N', 'G', 'O']::text[], p_prize_key) - 1;
  if v_column_index < 0 then return false; end if;
  return not exists (
    select 1
    from jsonb_array_elements(v_rows) as r(row_value)
    where jsonb_typeof(r.row_value -> v_column_index) = 'number'
      and not exists (
        select 1 from public.called_balls b
        where b.game_id = p_game_id and b.ball_number = ((r.row_value -> v_column_index) #>> '{}')::integer
      )
  );
end;
$$;
revoke all on function app_private.card_pattern_complete(uuid, text, text) from public;
grant execute on function app_private.card_pattern_complete(uuid, text, text) to authenticated;

create or replace function public.purchase_card(p_card_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_role(array['admin', 'seller']::text[]);
  v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  update public.cards set purchased_at = now(), purchased_by = v_actor
  where game_id = v_game and card_number = p_card_number and purchased_at is null;
  if not found then
    if exists (select 1 from public.cards where game_id = v_game and card_number = p_card_number) then
      raise exception 'A cartela % já foi registrada como comprada.', p_card_number using errcode = '23505';
    end if;
    raise exception 'A cartela % não existe neste jogo.', p_card_number using errcode = 'P0002';
  end if;
  perform app_private.log_event(v_game, v_actor, 'card_purchased', p_card_number);
end;
$$;

create or replace function public.undo_card_purchase(p_card_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  update public.cards set purchased_at = null, purchased_by = null
  where game_id = v_game and card_number = p_card_number and purchased_at is not null;
  if not found then raise exception 'A cartela não está registrada como comprada.'; end if;
  perform app_private.log_event(v_game, v_actor, 'card_purchase_undone', p_card_number);
end;
$$;

create or replace function public.delete_available_card(p_card_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.cards where game_id = v_game and card_number = p_card_number and purchased_at is null;
  if not found then raise exception 'A cartela não existe ou já foi comprada.'; end if;
  perform app_private.log_event(v_game, v_actor, 'card_deleted', p_card_number);
end;
$$;

create or replace function public.call_ball(p_ball_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if p_ball_number not between 1 and 75 then raise exception 'A bola precisa estar entre 1 e 75.'; end if;
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  insert into public.called_balls (game_id, ball_number, called_by) values (v_game, p_ball_number, v_actor) on conflict (game_id, ball_number) do nothing;
  if found then perform app_private.log_event(v_game, v_actor, 'ball_called', p_ball_number::text); end if;
end;
$$;

create or replace function public.uncall_ball(p_ball_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.called_balls where game_id = v_game and ball_number = p_ball_number;
  if found then perform app_private.log_event(v_game, v_actor, 'ball_undone', p_ball_number::text); end if;
end;
$$;

create or replace function public.undo_last_ball()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id(); v_number integer;
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.called_balls where id = (
    select id from public.called_balls where game_id = v_game order by id desc limit 1
  ) returning ball_number into v_number;
  if v_number is not null then perform app_private.log_event(v_game, v_actor, 'last_ball_undone', v_number::text); end if;
  return v_number;
end;
$$;

create or replace function public.clear_called_balls()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id(); v_count integer;
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.called_balls where game_id = v_game;
  get diagnostics v_count = row_count;
  if v_count > 0 then perform app_private.log_event(v_game, v_actor, 'balls_cleared', null, jsonb_build_object('count', v_count)); end if;
end;
$$;

create or replace function public.close_prize(p_prize_key text, p_winner_card_number text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id(); v_winner text := nullif(btrim(p_winner_card_number), '');
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  if p_prize_key not in ('B', 'I', 'N', 'G', 'O', 'Cartela Cheia') then raise exception 'Categoria de prêmio inválida.'; end if;
  if not exists (select 1 from public.games where id = v_game and prizes ? p_prize_key) then raise exception 'O prêmio não está configurado neste jogo.'; end if;
  if v_winner is not null then
    if not exists (select 1 from public.cards where game_id = v_game and card_number = v_winner and purchased_at is not null) then
      raise exception 'A cartela vencedora não existe ou não foi comprada.';
    end if;
    if not app_private.card_pattern_complete(v_game, v_winner, p_prize_key) then raise exception 'A cartela informada ainda não completou este prêmio.'; end if;
  end if;
  insert into public.closed_prizes (game_id, prize_key, winner_card_number, closed_by)
  values (v_game, p_prize_key, v_winner, v_actor)
  on conflict (game_id, prize_key) do update set winner_card_number = excluded.winner_card_number, closed_at = now(), closed_by = excluded.closed_by;
  perform app_private.log_event(v_game, v_actor, 'prize_closed', p_prize_key, jsonb_build_object('winner', v_winner));
end;
$$;

create or replace function public.reopen_prize(p_prize_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.closed_prizes where game_id = v_game and prize_key = p_prize_key;
  if found then perform app_private.log_event(v_game, v_actor, 'prize_reopened', p_prize_key); end if;
end;
$$;

create or replace function public.start_new_game()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := app_private.require_role(array['admin']::text[]); v_game uuid := app_private.active_game_id();
begin
  if v_game is null then raise exception 'Não há jogo ativo.'; end if;
  delete from public.called_balls where game_id = v_game;
  delete from public.closed_prizes where game_id = v_game;
  update public.cards set purchased_at = null, purchased_by = null where game_id = v_game;
  perform app_private.log_event(v_game, v_actor, 'new_game_started');
end;
$$;

create or replace function public.import_game(p_game_name text, p_source_name text, p_prizes jsonb, p_cards jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_role(array['admin']::text[]);
  v_game uuid;
  v_card jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_number numeric;
  v_minimum integer;
  v_row_index integer;
  v_column_index integer;
  v_card_number text;
  v_card_count integer := 0;
  v_prize_key text;
begin
  if coalesce(btrim(p_game_name), '') = '' or char_length(p_game_name) > 80 then raise exception 'Nome do jogo inválido.'; end if;
  if char_length(coalesce(p_source_name, '')) > 120 then raise exception 'Nome do arquivo muito longo.'; end if;
  if coalesce(jsonb_typeof(p_prizes), '') <> 'object' then raise exception 'A lista de prêmios é inválida.'; end if;
  if coalesce(jsonb_typeof(p_cards), '') <> 'array' then raise exception 'A lista de cartelas é inválida.'; end if;
  if jsonb_array_length(p_cards) = 0 then raise exception 'O arquivo precisa conter ao menos uma cartela.'; end if;
  for v_prize_key in select jsonb_object_keys(p_prizes) loop
    if v_prize_key not in ('B', 'I', 'N', 'G', 'O', 'Cartela Cheia') or jsonb_typeof(p_prizes -> v_prize_key) <> 'string' then
      raise exception 'O arquivo contém uma categoria de prêmio inválida.';
    end if;
  end loop;

  update public.games set is_active = false where is_active;
  insert into public.games (game_name, source_name, prizes, is_active, created_by)
  values (btrim(p_game_name), coalesce(nullif(p_source_name, ''), 'JSON importado'), p_prizes, true, v_actor)
  returning id into v_game;

  for v_card in select value from jsonb_array_elements(p_cards) loop
    v_card_number := btrim(coalesce(v_card ->> 'id', ''));
    if v_card_number = '' or char_length(v_card_number) > 40 then raise exception 'Número de cartela inválido.'; end if;
    if coalesce(jsonb_typeof(v_card -> 'rows'), '') <> 'array' then raise exception 'A cartela % precisa ter uma grade válida.', v_card_number; end if;
    if jsonb_array_length(v_card -> 'rows') <> 5 then raise exception 'A cartela % precisa ter 5 linhas.', v_card_number; end if;
    for v_row_index in 0..4 loop
      v_row := v_card -> 'rows' -> v_row_index;
      if coalesce(jsonb_typeof(v_row), '') <> 'array' then raise exception 'A cartela % precisa ter uma grade 5 x 5.', v_card_number; end if;
      if jsonb_array_length(v_row) <> 5 then raise exception 'A cartela % precisa ter uma grade 5 x 5.', v_card_number; end if;
      for v_column_index in 0..4 loop
        v_cell := v_row -> v_column_index;
        if v_cell <> 'null'::jsonb then
          if jsonb_typeof(v_cell) <> 'number' then raise exception 'A cartela % contém uma bola inválida.', v_card_number; end if;
          v_number := (v_cell #>> '{}')::numeric;
          if v_number < 1 or v_number > 75 or v_number <> trunc(v_number) then
            raise exception 'A cartela % contém uma bola inválida.', v_card_number;
          end if;
          v_minimum := 1 + v_column_index * 15;
          if v_number < v_minimum or v_number > v_minimum + 14 then
            raise exception 'A cartela % contém uma bola fora da faixa da coluna.', v_card_number;
          end if;
        end if;
      end loop;
    end loop;
    insert into public.cards (game_id, card_number, rows) values (v_game, v_card_number, v_card -> 'rows');
    v_card_count := v_card_count + 1;
  end loop;
  perform app_private.log_event(v_game, v_actor, 'game_imported', null, jsonb_build_object('cards', v_card_count, 'source', p_source_name));
  return v_game;
end;
$$;

do $$
declare v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'purchase_card', 'undo_card_purchase', 'delete_available_card', 'call_ball', 'uncall_ball',
      'undo_last_ball', 'clear_called_balls', 'close_prize', 'reopen_prize', 'start_new_game', 'import_game'
    )
  loop
    execute format('revoke all on function %s from public, anon', v_function.signature);
    execute format('grant execute on function %s to authenticated', v_function.signature);
  end loop;
end $$;

commit;
