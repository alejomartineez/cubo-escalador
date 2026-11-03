-- Ranking online de Cubo Escalador.
-- Pegalo entero en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

create table if not exists public.puntajes (
  tabla   text not null,
  jugador uuid not null,
  apodo   text not null check (char_length(apodo) between 3 and 14),
  valor   double precision not null,
  skin    text not null default 'clasico',
  creado  timestamptz not null default now(),
  primary key (tabla, jugador)
);
create index if not exists puntajes_tabla_valor on public.puntajes (tabla, valor);

-- Límites por tabla para descartar puntajes imposibles. orden: 'menor' si gana el número más chico.
create table if not exists public.limites (
  tabla  text primary key,
  minimo double precision,
  maximo double precision,
  orden  text not null default 'mayor' check (orden in ('mayor', 'menor'))
);
insert into public.limites (tabla, minimo, maximo, orden) values
  ('escalador:sprint',   6500, null, 'menor'),
  ('escalador:sprint-x', 7000, null, 'menor'),
  ('escalador:time',     null, 480,  'mayor'),
  ('escalador:time-x',   null, 420,  'mayor')
on conflict (tabla) do update set minimo = excluded.minimo, maximo = excluded.maximo, orden = excluded.orden;

-- Nadie lee ni escribe las tablas directo: se lee por la vista y se escribe por la función.
alter table public.puntajes enable row level security;
alter table public.limites enable row level security;

-- La vista no muestra el id de cada jugador, solo una huella para reconocer tu propia fila.
create or replace view public.ranking as
  select tabla, apodo, valor, skin, creado,
         left(encode(sha256(convert_to(jugador::text, 'UTF8')), 'hex'), 12) as huella
  from public.puntajes;
grant select on public.ranking to anon, authenticated;

-- Guarda tu mejor marca de cada tabla (si la nueva es peor, deja la anterior).
create or replace function public.enviar_puntaje(p_tabla text, p_jugador uuid, p_apodo text, p_valor double precision, p_skin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  lim public.limites%rowtype;
  v_orden text := 'mayor';
  v_apodo text := btrim(p_apodo);
begin
  if p_tabla !~ '^[a-z]+:[a-z0-9-]+$' or char_length(v_apodo) not between 3 and 14
     or p_valor is null or p_valor <= 0 or p_valor > 100000000 then
    return;
  end if;
  select * into lim from public.limites where tabla = p_tabla;
  if found then
    v_orden := lim.orden;
    if (lim.minimo is not null and p_valor < lim.minimo) or (lim.maximo is not null and p_valor > lim.maximo) then
      return;
    end if;
  end if;

  insert into public.puntajes as p (tabla, jugador, apodo, valor, skin)
  values (p_tabla, p_jugador, v_apodo, p_valor, left(coalesce(p_skin, 'clasico'), 20))
  on conflict (tabla, jugador) do update set
    apodo = excluded.apodo,
    skin = excluded.skin,
    valor = case when (v_orden = 'menor' and excluded.valor < p.valor) or (v_orden = 'mayor' and excluded.valor > p.valor)
                 then excluded.valor else p.valor end,
    creado = case when (v_orden = 'menor' and excluded.valor < p.valor) or (v_orden = 'mayor' and excluded.valor > p.valor)
                  then now() else p.creado end;

  -- el mismo apodo en todas tus tablas
  update public.puntajes set apodo = v_apodo where jugador = p_jugador and apodo <> v_apodo;
end $$;

revoke all on function public.enviar_puntaje(text, uuid, text, double precision, text) from public;
grant execute on function public.enviar_puntaje(text, uuid, text, double precision, text) to anon, authenticated;

-- Topes por juego y dificultad (puntajes por encima se descartan). Salen de lo que mide cada juego.
insert into public.limites (tabla, minimo, maximo, orden) values
  ('lluvia:facil', null, 10000, 'mayor'), ('lluvia:normal', null, 5000, 'mayor'), ('lluvia:dificil', null, 5000, 'mayor'), ('lluvia:extremo', null, 5000, 'mayor'),
  ('clasificador:facil', null, 220, 'mayor'), ('clasificador:normal', null, 220, 'mayor'), ('clasificador:dificil', null, 220, 'mayor'), ('clasificador:extremo', null, 220, 'mayor'),
  ('equilibrio:facil', null, 6000, 'mayor'), ('equilibrio:normal', null, 4000, 'mayor'), ('equilibrio:dificil', null, 4000, 'mayor'), ('equilibrio:extremo', null, 4000, 'mayor'),
  ('ritmo:facil', null, 600000, 'mayor'), ('ritmo:normal', null, 400000, 'mayor'), ('ritmo:dificil', null, 500000, 'mayor'), ('ritmo:extremo', null, 600000, 'mayor'),
  ('voley:facil', null, 250, 'mayor'), ('voley:normal', null, 150, 'mayor'), ('voley:dificil', null, 100, 'mayor'), ('voley:extremo', null, 60, 'mayor'),
  ('paseo:facil', null, 5000, 'mayor'), ('paseo:normal', null, 3000, 'mayor'), ('paseo:dificil', null, 3000, 'mayor'), ('paseo:extremo', null, 2000, 'mayor'),
  ('serpiente:facil', null, 192, 'mayor'), ('serpiente:normal', null, 192, 'mayor'), ('serpiente:dificil', null, 192, 'mayor'), ('serpiente:extremo', null, 192, 'mayor'),
  ('pulseada:facil', null, 40, 'mayor'), ('pulseada:normal', null, 30, 'mayor'), ('pulseada:dificil', null, 28, 'mayor'), ('pulseada:extremo', null, 22, 'mayor'),
  ('cohete:facil', null, 60000, 'mayor'), ('cohete:normal', null, 60000, 'mayor'), ('cohete:dificil', null, 60000, 'mayor'), ('cohete:extremo', null, 60000, 'mayor'),
  ('esqui:facil', null, 40000, 'mayor'), ('esqui:normal', null, 40000, 'mayor'), ('esqui:dificil', null, 40000, 'mayor'), ('esqui:extremo', null, 40000, 'mayor')
on conflict (tabla) do update set minimo = excluded.minimo, maximo = excluded.maximo, orden = excluded.orden;
