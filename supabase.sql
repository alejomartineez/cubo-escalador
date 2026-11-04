-- Ranking online de TwoFingers.
-- Supabase → SQL Editor → New query → pegar → Run. La primera vez va entero; después, solo la parte nueva
-- (cada parte empieza con un título "-- ---------- ... ----------" y se puede correr más de una vez).

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

-- Ronda 2: Lava en el Escalador y dificultad Maestro.
insert into public.limites (tabla, minimo, maximo, orden) values
  ('escalador:lava',     null, 2500, 'mayor'),
  ('escalador:lava-x',   null, 2000, 'mayor'),
  ('escalador:lava-m',   null, 1800, 'mayor'),
  ('escalador:sprint-m', 7000, null, 'menor'),
  ('escalador:time-m',   null, 420,  'mayor')
on conflict (tabla) do update set minimo = excluded.minimo, maximo = excluded.maximo, orden = excluded.orden;

-- Ronda 2: topes nuevos por juego (las curvas cambiaron) y las tablas de Maestro.
insert into public.limites (tabla, minimo, maximo, orden) values
  ('lluvia:facil', null, 6000, 'mayor'), ('lluvia:normal', null, 4000, 'mayor'), ('lluvia:dificil', null, 4000, 'mayor'), ('lluvia:extremo', null, 4000, 'mayor'), ('lluvia:maestro', null, 3000, 'mayor'),
  ('clasificador:facil', null, 220, 'mayor'), ('clasificador:normal', null, 220, 'mayor'), ('clasificador:dificil', null, 220, 'mayor'), ('clasificador:extremo', null, 220, 'mayor'), ('clasificador:maestro', null, 180, 'mayor'),
  ('equilibrio:facil', null, 3000, 'mayor'), ('equilibrio:normal', null, 2000, 'mayor'), ('equilibrio:dificil', null, 1500, 'mayor'), ('equilibrio:extremo', null, 1000, 'mayor'), ('equilibrio:maestro', null, 600, 'mayor'),
  ('ritmo:facil', null, 700000, 'mayor'), ('ritmo:normal', null, 700000, 'mayor'), ('ritmo:dificil', null, 750000, 'mayor'), ('ritmo:extremo', null, 750000, 'mayor'), ('ritmo:maestro', null, 600000, 'mayor'),
  ('voley:facil', null, 300, 'mayor'), ('voley:normal', null, 80, 'mayor'), ('voley:dificil', null, 60, 'mayor'), ('voley:extremo', null, 60, 'mayor'), ('voley:maestro', null, 40, 'mayor'),
  ('paseo:facil', null, 10000, 'mayor'), ('paseo:normal', null, 4000, 'mayor'), ('paseo:dificil', null, 2500, 'mayor'), ('paseo:extremo', null, 1200, 'mayor'), ('paseo:maestro', null, 600, 'mayor'),
  ('serpiente:facil', null, 260, 'mayor'), ('serpiente:normal', null, 260, 'mayor'), ('serpiente:dificil', null, 260, 'mayor'), ('serpiente:extremo', null, 260, 'mayor'), ('serpiente:maestro', null, 260, 'mayor'),
  ('cohete:maestro', null, 60000, 'mayor'),
  ('esqui:facil', null, 30000, 'mayor'), ('esqui:normal', null, 20000, 'mayor'), ('esqui:dificil', null, 15000, 'mayor'), ('esqui:extremo', null, 12000, 'mayor'), ('esqui:maestro', null, 10000, 'mayor'),
  ('pulseada:facil', null, 35, 'mayor'), ('pulseada:normal', null, 28, 'mayor'), ('pulseada:dificil', null, 25, 'mayor'), ('pulseada:extremo', null, 22, 'mayor'), ('pulseada:maestro', null, 20, 'mayor')
on conflict (tabla) do update set minimo = excluded.minimo, maximo = excluded.maximo, orden = excluded.orden;

-- ---------- Un jugador, un apodo y una skin ----------
-- Cada apodo es de una sola persona para siempre (nadie más lo puede usar), y el ranking muestra
-- el apodo y la skin actuales de cada uno en todas sus filas. Para jugar con el mismo apodo en otro
-- dispositivo se usa la clave que el juego te muestra.
create table if not exists public.jugadores (
  id     uuid primary key,
  apodo  text not null check (char_length(apodo) between 3 and 14),
  skin   text not null default 'clasico',
  clave  text not null,
  creado timestamptz not null default now()
);
create unique index if not exists jugadores_apodo on public.jugadores (lower(apodo));
alter table public.jugadores enable row level security;

-- 8 letras y números, sin los que se confunden entre sí (0 y O, 1, I y L)
create or replace function public.nueva_clave() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 8);
$$;
revoke all on function public.nueva_clave() from public, anon, authenticated;

-- Pasa los puntajes de un jugador a otro, quedándose con la mejor marca de cada tabla, y borra al primero.
create or replace function public.juntar_jugadores(p_origen uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_origen is null or p_destino is null or p_origen = p_destino then return; end if;
  insert into public.puntajes as p (tabla, jugador, apodo, valor, skin, creado)
    select x.tabla, p_destino, x.apodo, x.valor, x.skin, x.creado from public.puntajes x where x.jugador = p_origen
  on conflict (tabla, jugador) do update set
    valor  = case when coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'menor'
                  then least(p.valor, excluded.valor) else greatest(p.valor, excluded.valor) end,
    creado = case when (coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'menor' and excluded.valor < p.valor)
                    or (coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'mayor' and excluded.valor > p.valor)
                  then excluded.creado else p.creado end;
  delete from public.puntajes where jugador = p_origen;
  delete from public.jugadores where id = p_origen;
end $$;
revoke all on function public.juntar_jugadores(uuid, uuid) from public, anon, authenticated;

-- Pasar lo que ya había: los que compartían apodo son la misma persona en dos dispositivos,
-- así que se juntan en el más antiguo. Después cada uno queda con su último apodo y skin.
do $$
declare r record;
begin
  for r in
    with ult as (select distinct on (jugador) jugador, apodo from public.puntajes order by jugador, creado desc),
         ini as (select jugador, min(creado) c from public.puntajes group by jugador),
         g as (select u.jugador, first_value(u.jugador) over (partition by lower(u.apodo) order by i.c) as duenio
               from ult u join ini i using (jugador))
    select jugador, duenio from g
    where jugador <> duenio and not exists (select 1 from public.jugadores j where j.id = g.jugador)
  loop
    perform public.juntar_jugadores(r.jugador, r.duenio);
  end loop;
  insert into public.jugadores (id, apodo, skin, clave)
    select distinct on (jugador) jugador, apodo, skin, public.nueva_clave() from public.puntajes order by jugador, creado desc
  on conflict do nothing;
end $$;

-- El ranking toma el apodo y la skin del jugador, no los de cada fila.
create or replace view public.ranking as
  select p.tabla, j.apodo, p.valor, j.skin, p.creado,
         left(encode(sha256(convert_to(p.jugador::text, 'UTF8')), 'hex'), 12) as huella
  from public.puntajes p join public.jugadores j on j.id = p.jugador;
grant select on public.ranking to anon, authenticated;

-- Elegir o cambiar el apodo, y avisar la skin actual. Devuelve { estado: 'ok' | 'ocupado' | 'invalido', clave }.
create or replace function public.registrar_jugador(p_jugador uuid, p_apodo text, p_skin text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_apodo text := btrim(p_apodo);
  v_clave text;
begin
  if p_jugador is null or v_apodo is null or char_length(v_apodo) not between 3 and 14 then
    return json_build_object('estado', 'invalido');
  end if;
  if exists (select 1 from public.jugadores where lower(apodo) = lower(v_apodo) and id <> p_jugador) then
    return json_build_object('estado', 'ocupado');
  end if;
  insert into public.jugadores as j (id, apodo, skin, clave)
    values (p_jugador, v_apodo, left(coalesce(p_skin, 'clasico'), 20), public.nueva_clave())
  on conflict (id) do update set apodo = excluded.apodo, skin = excluded.skin
  returning j.clave into v_clave;
  update public.puntajes set apodo = v_apodo where jugador = p_jugador and apodo <> v_apodo;
  return json_build_object('estado', 'ok', 'clave', v_clave);
exception when unique_violation then
  return json_build_object('estado', 'ocupado');
end $$;
revoke all on function public.registrar_jugador(uuid, text, text) from public;
grant execute on function public.registrar_jugador(uuid, text, text) to anon, authenticated;

-- Usar tu apodo en otro dispositivo: con el apodo y la clave te devuelve tu id de jugador.
-- Lo que este dispositivo ya había subido con otro apodo (p_viejo) se junta con lo tuyo.
create or replace function public.vincular_jugador(p_apodo text, p_clave text, p_viejo uuid)
returns json language plpgsql security definer set search_path = public as $$
declare j public.jugadores%rowtype;
begin
  select * into j from public.jugadores
  where lower(apodo) = lower(btrim(p_apodo)) and clave = upper(regexp_replace(coalesce(p_clave, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then perform pg_sleep(1); return null; end if;   -- la espera frena a quien prueba claves al azar
  perform public.juntar_jugadores(p_viejo, j.id);
  return json_build_object('id', j.id, 'apodo', j.apodo, 'clave', j.clave);
end $$;
revoke all on function public.vincular_jugador(text, text, uuid) from public;
grant execute on function public.vincular_jugador(text, text, uuid) to anon, authenticated;

-- Subir una marca. Hace falta un apodo registrado (los juegos viejos que todavía mandan el apodo lo registran si está libre).
create or replace function public.enviar_puntaje(p_tabla text, p_jugador uuid, p_apodo text, p_valor double precision, p_skin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  lim public.limites%rowtype;
  v_orden text := 'mayor';
  v_apodo text;
begin
  if p_tabla !~ '^[a-z]+:[a-z0-9-]+$' or p_valor is null or p_valor <= 0 or p_valor > 100000000 then
    return;
  end if;
  select apodo into v_apodo from public.jugadores where id = p_jugador;
  if not found then
    if (public.registrar_jugador(p_jugador, p_apodo, p_skin) ->> 'estado') <> 'ok' then return; end if;
    select apodo into v_apodo from public.jugadores where id = p_jugador;
  elsif p_skin is not null then
    update public.jugadores set skin = left(p_skin, 20) where id = p_jugador and skin <> left(p_skin, 20);
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
    valor = case when (v_orden = 'menor' and excluded.valor < p.valor) or (v_orden = 'mayor' and excluded.valor > p.valor)
                 then excluded.valor else p.valor end,
    creado = case when (v_orden = 'menor' and excluded.valor < p.valor) or (v_orden = 'mayor' and excluded.valor > p.valor)
                  then now() else p.creado end;
end $$;

-- ---------- Amigos y títulos ----------
-- Cada jugador tiene un código de amigo de 6 letras (público: sirve para agregarte) y un título que gana subiendo de nivel.
alter table public.jugadores add column if not exists codigo text;
alter table public.jugadores add column if not exists titulo text not null default '';

create or replace function public.nuevo_codigo() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6);
$$;
revoke all on function public.nuevo_codigo() from public, anon, authenticated;
update public.jugadores set codigo = public.nuevo_codigo() where codigo is null;
create unique index if not exists jugadores_codigo on public.jugadores (codigo);

-- El ranking también muestra el título.
create or replace view public.ranking as
  select p.tabla, j.apodo, p.valor, j.skin, p.creado,
         left(encode(sha256(convert_to(p.jugador::text, 'UTF8')), 'hex'), 12) as huella, j.titulo
  from public.puntajes p join public.jugadores j on j.id = p.jugador;
grant select on public.ranking to anon, authenticated;

-- Ahora también guarda el título y devuelve tu código de amigo.
drop function if exists public.registrar_jugador(uuid, text, text);
create or replace function public.registrar_jugador(p_jugador uuid, p_apodo text, p_skin text, p_titulo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_apodo text := btrim(p_apodo);
  v_clave text;
  v_codigo text;
begin
  if p_jugador is null or v_apodo is null or char_length(v_apodo) not between 3 and 14 then
    return json_build_object('estado', 'invalido');
  end if;
  if exists (select 1 from public.jugadores where lower(apodo) = lower(v_apodo) and id <> p_jugador) then
    return json_build_object('estado', 'ocupado');
  end if;
  insert into public.jugadores as j (id, apodo, skin, clave, codigo, titulo)
    values (p_jugador, v_apodo, left(coalesce(p_skin, 'clasico'), 20), public.nueva_clave(), public.nuevo_codigo(), left(coalesce(p_titulo, ''), 24))
  on conflict (id) do update set apodo = excluded.apodo, skin = excluded.skin,
    titulo = case when p_titulo is null then j.titulo else excluded.titulo end,
    codigo = coalesce(j.codigo, excluded.codigo)
  returning j.clave, j.codigo into v_clave, v_codigo;
  update public.puntajes set apodo = v_apodo where jugador = p_jugador and apodo <> v_apodo;
  return json_build_object('estado', 'ok', 'clave', v_clave, 'codigo', v_codigo);
exception when unique_violation then
  return json_build_object('estado', 'ocupado');
end $$;
revoke all on function public.registrar_jugador(uuid, text, text, text) from public;
grant execute on function public.registrar_jugador(uuid, text, text, text) to anon, authenticated;

-- Buscar a alguien por su código de amigo: apodo, skin, título y la huella para encontrarlo en el ranking.
create or replace function public.buscar_amigo(p_codigo text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('apodo', apodo, 'skin', skin, 'titulo', titulo,
           'huella', left(encode(sha256(convert_to(id::text, 'UTF8')), 'hex'), 12))
  from public.jugadores where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
revoke all on function public.buscar_amigo(text) from public;
grant execute on function public.buscar_amigo(text) to anon, authenticated;

-- ---------- Retos 1v1 en vivo ----------
-- Retás a un amigo por su código; la invitación queda guardada unos minutos por si abre el juego después.
-- La partida en sí va por Supabase Realtime (broadcast) en la sala del reto: acá solo se guarda quién retó a quién.
create table if not exists public.retos (
  id     uuid primary key default gen_random_uuid(),
  de     uuid not null references public.jugadores (id) on delete cascade,
  para   uuid not null references public.jugadores (id) on delete cascade,
  juego  text not null,
  dif    text not null default 'normal',
  sala   text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  creado timestamptz not null default now(),
  vence  timestamptz not null default now() + interval '10 minutes'
);
create index if not exists retos_para on public.retos (para, vence);
create index if not exists retos_de on public.retos (de, creado);
alter table public.retos enable row level security;   -- nadie la lee directo: solo por las funciones de abajo

create or replace function public.huella_de(p uuid) returns text language sql immutable as $$
  select left(encode(sha256(convert_to(p::text, 'UTF8')), 'hex'), 12);
$$;

-- Retar a alguien por su código de amigo. Devuelve { id, sala, vence, huella } (huella: la del retado, para avisarle en vivo).
create or replace function public.retar(p_jugador uuid, p_codigo text, p_juego text, p_dif text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_para uuid;
  v_reto public.retos%rowtype;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  if coalesce(p_juego, '') not in ('pulseada', 'escalador') or coalesce(p_dif, '') !~ '^[a-z]{3,10}$' then return json_build_object('error', 'invalido'); end if;
  select id into v_para from public.jugadores where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_para is null or v_para = p_jugador then return json_build_object('error', 'no-existe'); end if;
  -- para que nadie llene la tabla: como mucho 8 retos por minuto
  if (select count(*) from public.retos where de = p_jugador and creado > now() - interval '1 minute') >= 8 then
    return json_build_object('error', 'muchos');
  end if;
  delete from public.retos where vence < now() - interval '1 day';
  update public.retos set estado = 'cancelado' where de = p_jugador and para = v_para and estado = 'pendiente';
  insert into public.retos (de, para, juego, dif, sala)
    values (p_jugador, v_para, p_juego, p_dif, replace(gen_random_uuid()::text, '-', ''))
  returning * into v_reto;
  return json_build_object('id', v_reto.id, 'sala', v_reto.sala, 'vence', v_reto.vence, 'huella', public.huella_de(v_para));
end $$;
revoke all on function public.retar(uuid, text, text, text) from public;
grant execute on function public.retar(uuid, text, text, text) to anon, authenticated;

-- Los retos que te llegaron y siguen en pie, con quién te retó.
create or replace function public.mis_retos(p_jugador uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'sala', r.sala, 'juego', r.juego, 'dif', r.dif, 'vence', r.vence,
           'apodo', j.apodo, 'skin', j.skin, 'titulo', j.titulo, 'codigo', j.codigo, 'huella', public.huella_de(j.id))
         order by r.creado desc), '[]'::json)
  from public.retos r join public.jugadores j on j.id = r.de
  where r.para = p_jugador and r.estado = 'pendiente' and r.vence > now();
$$;
revoke all on function public.mis_retos(uuid) from public;
grant execute on function public.mis_retos(uuid) to anon, authenticated;

-- Aceptar o rechazar (el retado), o cancelar (el que retó). Devuelve el estado que quedó, o null si el reto ya no está.
create or replace function public.responder_reto(p_jugador uuid, p_id uuid, p_estado text)
returns text language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  update public.retos set estado = p_estado
  where id = p_id and estado = 'pendiente' and vence > now()
    and ((p_estado in ('aceptado', 'rechazado') and para = p_jugador) or (p_estado = 'cancelado' and de = p_jugador))
  returning estado into v_estado;
  return v_estado;
end $$;
revoke all on function public.responder_reto(uuid, uuid, text) from public;
grant execute on function public.responder_reto(uuid, uuid, text) to anon, authenticated;

-- Cómo va un reto que mandaste o te llegó: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'vencido'.
create or replace function public.ver_reto(p_jugador uuid, p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when estado = 'pendiente' and vence <= now() then 'vencido' else estado end
  from public.retos where id = p_id and (de = p_jugador or para = p_jugador);
$$;
revoke all on function public.ver_reto(uuid, uuid) from public;
grant execute on function public.ver_reto(uuid, uuid) to anon, authenticated;

-- ---------- Solicitudes de amistad ----------
-- Poner el código de alguien ya no lo hace tu amigo: le llega una solicitud que acepta o rechaza.
-- Son amigos (de los dos lados) cuando la acepta, o si los dos se agregaron. Solo los amigos se pueden retar a un 1v1.
-- Una fila por pedido (de → para). 'rechazada' queda guardada para que no te llegue de nuevo; el que la mandó la sigue viendo pendiente.
create table if not exists public.amistades (
  de     uuid not null references public.jugadores (id) on delete cascade,
  para   uuid not null references public.jugadores (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creado timestamptz not null default now(),
  primary key (de, para),
  check (de <> para)
);
create index if not exists amistades_para on public.amistades (para, estado);
alter table public.amistades enable row level security;   -- nadie la lee directo: solo por las funciones de abajo

create or replace function public.son_amigos(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.amistades where estado = 'aceptada' and ((de = a and para = b) or (de = b and para = a)));
$$;
revoke all on function public.son_amigos(uuid, uuid) from public, anon, authenticated;

create or replace function public.id_de_codigo(p_codigo text) returns uuid language sql stable security definer set search_path = public as $$
  select id from public.jugadores where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
revoke all on function public.id_de_codigo(text) from public, anon, authenticated;

-- Lo que se muestra de otro jugador en la hoja de Amigos.
create or replace function public.amigo_json(j public.jugadores) returns json language sql stable set search_path = public as $$
  select json_build_object('codigo', j.codigo, 'apodo', j.apodo, 'skin', j.skin, 'titulo', j.titulo, 'huella', public.huella_de(j.id));
$$;
revoke all on function public.amigo_json(public.jugadores) from public, anon, authenticated;

-- El pedido en sí (los dos jugadores ya existen). Devuelve 'amigos' o 'pendiente'.
create or replace function public.pedir_amistad_a(p_de uuid, p_para uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if public.son_amigos(p_de, p_para) then return 'amigos'; end if;
  -- el otro ya te había pedido (o se lo habías rechazado y ahora lo agregás vos): quedan amigos
  update public.amistades set estado = 'aceptada' where de = p_para and para = p_de;
  if found then
    delete from public.amistades where de = p_de and para = p_para;
    return 'amigos';
  end if;
  insert into public.amistades (de, para) values (p_de, p_para) on conflict do nothing;
  return 'pendiente';
end $$;
revoke all on function public.pedir_amistad_a(uuid, uuid) from public, anon, authenticated;

-- Tus amigos, las solicitudes que te llegaron y las que mandaste (las rechazadas se ven como pendientes).
create or replace function public.mis_amigos(p_jugador uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'amigos', coalesce((select json_agg(public.amigo_json(j) order by lower(j.apodo))
      from public.amistades a join public.jugadores j on j.id = case when a.de = p_jugador then a.para else a.de end
      where a.estado = 'aceptada' and (a.de = p_jugador or a.para = p_jugador)), '[]'::json),
    'recibidas', coalesce((select json_agg(public.amigo_json(j) order by a.creado desc)
      from public.amistades a join public.jugadores j on j.id = a.de
      where a.para = p_jugador and a.estado = 'pendiente'), '[]'::json),
    'enviadas', coalesce((select json_agg(public.amigo_json(j) order by a.creado desc)
      from public.amistades a join public.jugadores j on j.id = a.para
      where a.de = p_jugador and a.estado <> 'aceptada'), '[]'::json));
$$;
revoke all on function public.mis_amigos(uuid) from public;
grant execute on function public.mis_amigos(uuid) to anon, authenticated;

-- Mandar una solicitud por código. Devuelve { estado: 'pendiente' | 'amigos', amigo } o { error }.
create or replace function public.pedir_amistad(p_jugador uuid, p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare o public.jugadores%rowtype;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  select * into o from public.jugadores where id = public.id_de_codigo(p_codigo);
  if not found then return json_build_object('error', 'no-existe'); end if;
  if o.id = p_jugador then return json_build_object('error', 'propio'); end if;
  -- para que nadie llene la tabla: 10 solicitudes nuevas por minuto y 50 sin contestar
  if not exists (select 1 from public.amistades where (de = p_jugador and para = o.id) or (de = o.id and para = p_jugador))
     and ((select count(*) from public.amistades where de = p_jugador and creado > now() - interval '1 minute') >= 10
       or (select count(*) from public.amistades where de = p_jugador and estado <> 'aceptada') >= 50) then
    return json_build_object('error', 'muchos');
  end if;
  return json_build_object('estado', public.pedir_amistad_a(p_jugador, o.id), 'amigo', public.amigo_json(o));
end $$;
revoke all on function public.pedir_amistad(uuid, text) from public;
grant execute on function public.pedir_amistad(uuid, text) to anon, authenticated;

-- Aceptar o rechazar una solicitud que te llegó. Devuelve 'amigos', 'rechazada' o null si ya no estaba.
create or replace function public.responder_amistad(p_jugador uuid, p_codigo text, p_acepto boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.amistades set estado = case when p_acepto then 'aceptada' else 'rechazada' end
  where de = public.id_de_codigo(p_codigo) and para = p_jugador and estado = 'pendiente';
  if not found then return null; end if;
  return case when p_acepto then 'amigos' else 'rechazada' end;
end $$;
revoke all on function public.responder_amistad(uuid, text, boolean) from public;
grant execute on function public.responder_amistad(uuid, text, boolean) to anon, authenticated;

-- Dejar de ser amigos o cancelar una solicitud que mandaste. También se caen los retos pendientes entre los dos.
create or replace function public.quitar_amistad(p_jugador uuid, p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_otro uuid := public.id_de_codigo(p_codigo);
begin
  if v_otro is null then return; end if;
  delete from public.amistades where (de = p_jugador and para = v_otro) or (de = v_otro and para = p_jugador and estado = 'aceptada');
  update public.retos set estado = 'cancelado'
  where estado = 'pendiente' and ((de = p_jugador and para = v_otro) or (de = v_otro and para = p_jugador));
end $$;
revoke all on function public.quitar_amistad(uuid, text) from public;
grant execute on function public.quitar_amistad(uuid, text) to anon, authenticated;

-- Pasar los amigos que cada dispositivo tenía guardados de antes (cuando agregar era directo).
-- Cada uno queda como solicitud tuya; si el otro también te tenía, quedan amigos sin que nadie tenga que aceptar.
-- El juego la llama una vez por dispositivo con los códigos que tenía. Devuelve lo mismo que mis_amigos.
create or replace function public.migrar_amigos(p_jugador uuid, p_codigos text[])
returns json language plpgsql security definer set search_path = public as $$
declare v_otro uuid;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  for v_otro in select distinct public.id_de_codigo(c) from unnest((coalesce(p_codigos, '{}'))[1:50]) c loop
    exit when (select count(*) from public.amistades where de = p_jugador and estado <> 'aceptada') >= 50;
    if v_otro is not null and v_otro <> p_jugador then perform public.pedir_amistad_a(p_jugador, v_otro); end if;
  end loop;
  return public.mis_amigos(p_jugador);
end $$;
revoke all on function public.migrar_amigos(uuid, text[]) from public;
grant execute on function public.migrar_amigos(uuid, text[]) to anon, authenticated;

-- Retar solo a un amigo aceptado (lo revisa el servidor: un reto a alguien que no es tu amigo no se guarda).
create or replace function public.retar(p_jugador uuid, p_codigo text, p_juego text, p_dif text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_para uuid;
  v_reto public.retos%rowtype;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  if coalesce(p_juego, '') not in ('pulseada', 'escalador') or coalesce(p_dif, '') !~ '^[a-z]{3,10}$' then return json_build_object('error', 'invalido'); end if;
  v_para := public.id_de_codigo(p_codigo);
  if v_para is null or v_para = p_jugador then return json_build_object('error', 'no-existe'); end if;
  if not public.son_amigos(p_jugador, v_para) then return json_build_object('error', 'no-amigos'); end if;
  -- para que nadie llene la tabla: como mucho 8 retos por minuto
  if (select count(*) from public.retos where de = p_jugador and creado > now() - interval '1 minute') >= 8 then
    return json_build_object('error', 'muchos');
  end if;
  delete from public.retos where vence < now() - interval '1 day';
  update public.retos set estado = 'cancelado' where de = p_jugador and para = v_para and estado = 'pendiente';
  insert into public.retos (de, para, juego, dif, sala)
    values (p_jugador, v_para, p_juego, p_dif, replace(gen_random_uuid()::text, '-', ''))
  returning * into v_reto;
  return json_build_object('id', v_reto.id, 'sala', v_reto.sala, 'vence', v_reto.vence, 'huella', public.huella_de(v_para));
end $$;

-- Los retos que te llegaron y siguen en pie, solo de amigos (si dejaron de serlo, ya no aparecen).
create or replace function public.mis_retos(p_jugador uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'sala', r.sala, 'juego', r.juego, 'dif', r.dif, 'vence', r.vence,
           'apodo', j.apodo, 'skin', j.skin, 'titulo', j.titulo, 'codigo', j.codigo, 'huella', public.huella_de(j.id))
         order by r.creado desc), '[]'::json)
  from public.retos r join public.jugadores j on j.id = r.de
  where r.para = p_jugador and r.estado = 'pendiente' and r.vence > now() and public.son_amigos(r.de, r.para);
$$;

-- Para aceptar un reto también tienen que seguir siendo amigos.
create or replace function public.responder_reto(p_jugador uuid, p_id uuid, p_estado text)
returns text language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  update public.retos set estado = p_estado
  where id = p_id and estado = 'pendiente' and vence > now()
    and ((p_estado = 'aceptado' and para = p_jugador and public.son_amigos(de, para))
      or (p_estado = 'rechazado' and para = p_jugador) or (p_estado = 'cancelado' and de = p_jugador))
  returning estado into v_estado;
  return v_estado;
end $$;

-- Al usar tu apodo en otro dispositivo, las amistades del id viejo también pasan al tuyo.
create or replace function public.juntar_jugadores(p_origen uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_origen is null or p_destino is null or p_origen = p_destino then return; end if;
  insert into public.puntajes as p (tabla, jugador, apodo, valor, skin, creado)
    select x.tabla, p_destino, x.apodo, x.valor, x.skin, x.creado from public.puntajes x where x.jugador = p_origen
  on conflict (tabla, jugador) do update set
    valor  = case when coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'menor'
                  then least(p.valor, excluded.valor) else greatest(p.valor, excluded.valor) end,
    creado = case when (coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'menor' and excluded.valor < p.valor)
                    or (coalesce((select orden from public.limites l where l.tabla = excluded.tabla), 'mayor') = 'mayor' and excluded.valor > p.valor)
                  then excluded.creado else p.creado end;
  delete from public.puntajes where jugador = p_origen;

  insert into public.amistades as a (de, para, estado, creado)
    select case when x.de = p_origen then p_destino else x.de end, case when x.para = p_origen then p_destino else x.para end, x.estado, x.creado
    from public.amistades x
    where (x.de = p_origen or x.para = p_origen)
      and (case when x.de = p_origen then p_destino else x.de end) <> (case when x.para = p_origen then p_destino else x.para end)
  on conflict (de, para) do update set estado = case when 'aceptada' in (a.estado, excluded.estado) then 'aceptada' else a.estado end;
  -- pedidos cruzados entre los mismos dos: son amigos; y sobra cualquier otra fila entre dos que ya son amigos
  update public.amistades a set estado = 'aceptada'
  where (a.de = p_destino or a.para = p_destino) and a.estado = 'pendiente'
    and exists (select 1 from public.amistades b where b.de = a.para and b.para = a.de and b.estado = 'pendiente');
  delete from public.amistades a
  where (a.de = p_destino or a.para = p_destino)
    and exists (select 1 from public.amistades b where b.de = a.para and b.para = a.de and b.estado = 'aceptada'
                and (a.estado <> 'aceptada' or a.de > a.para));

  delete from public.jugadores where id = p_origen;   -- se lleva las filas viejas de amistades y retos
end $$;
revoke all on function public.juntar_jugadores(uuid, uuid) from public, anon, authenticated;

-- ---------- Sombras de amigos ----------
-- La sombra es tu mejor partida como curva de progreso (formato de CC.sombra en cubo-comun.js: "1:" + deltas en base 36,
-- unos 1-2 KB). Se sube solo cuando hacés una sombra nueva y se baja solo cuando elegís competir contra un amigo.
-- Una sola por jugador, juego y tabla. Nadie la lee directo: solo las ven los amigos aceptados (sombra_de_amigo).
create table if not exists public.sombras (
  jugador     uuid not null references public.jugadores (id) on delete cascade,
  juego       text not null check (juego ~ '^[a-z]{3,12}$'),
  tabla       text not null check (tabla ~ '^[a-z-]{1,12}$'),
  valor       double precision not null,
  curva       text not null check (char_length(curva) <= 2100 and curva ~ '^1:[0-9a-z]+(~-?[0-9a-z]+)?(,[0-9a-z]+(~-?[0-9a-z]+)?)*$'),
  actualizado timestamptz not null default now(),
  primary key (jugador, juego, tabla)
);
alter table public.sombras enable row level security;

-- Guarda (o reemplaza) tu sombra de esa tabla. Como mucho 40 sombras por jugador y una subida cada 5 s por tabla.
create or replace function public.subir_sombra(p_jugador uuid, p_juego text, p_tabla text, p_valor double precision, p_curva text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return false; end if;
  if p_valor is null or p_valor = 'NaN'::double precision or abs(p_valor) = 'Infinity'::double precision then return false; end if;
  if coalesce(char_length(p_curva), 9999) > 2100 or coalesce(p_juego, '') !~ '^[a-z]{3,12}$' or coalesce(p_tabla, '') !~ '^[a-z-]{1,12}$' then return false; end if;
  if (select count(*) from public.sombras where jugador = p_jugador) >= 40
     and not exists (select 1 from public.sombras where jugador = p_jugador and juego = p_juego and tabla = p_tabla) then
    return false;
  end if;
  insert into public.sombras as s (jugador, juego, tabla, valor, curva) values (p_jugador, p_juego, p_tabla, p_valor, p_curva)
  on conflict (jugador, juego, tabla) do update set valor = excluded.valor, curva = excluded.curva, actualizado = now()
    where s.actualizado < now() - interval '5 seconds';
  return found;   -- false si se salteó por el límite de 5 s: el juego la vuelve a mandar después
exception when check_violation then return false;
end $$;
revoke all on function public.subir_sombra(uuid, text, text, double precision, text) from public;
grant execute on function public.subir_sombra(uuid, text, text, double precision, text) to anon, authenticated;

-- La sombra de un amigo (por su código de amigo). Si no son amigos aceptados, o no tiene sombra en esa tabla, null.
create or replace function public.sombra_de_amigo(p_jugador uuid, p_codigo text, p_juego text, p_tabla text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_otro uuid;
begin
  v_otro := public.id_de_codigo(p_codigo);
  if v_otro is null or v_otro = p_jugador or not public.son_amigos(p_jugador, v_otro) then return null; end if;
  return (select json_build_object('valor', s.valor, 'curva', s.curva, 'actualizado', s.actualizado)
          from public.sombras s where s.jugador = v_otro and s.juego = p_juego and s.tabla = p_tabla);
end $$;
revoke all on function public.sombra_de_amigo(uuid, text, text, text) from public;
grant execute on function public.sombra_de_amigo(uuid, text, text, text) to anon, authenticated;

-- ---------- Zigzag ----------
-- Topes del juego nuevo (metros). Clasificador, Equilibrio, Paseo y Cohete ya no están: sus filas quedan pero nadie sube más.
insert into public.limites (tabla, minimo, maximo, orden) values
  ('zigzag:facil', null, 20000, 'mayor'), ('zigzag:normal', null, 20000, 'mayor'), ('zigzag:dificil', null, 20000, 'mayor'),
  ('zigzag:extremo', null, 20000, 'mayor'), ('zigzag:maestro', null, 20000, 'mayor')
on conflict (tabla) do update set minimo = excluded.minimo, maximo = excluded.maximo, orden = excluded.orden;

-- ---------- Parte: duelos de Vóley ----------
-- Ahora también se puede retar a Vóley (los dos juegan contra el mismo rival y gana el que hace más puntos).
create or replace function public.retar(p_jugador uuid, p_codigo text, p_juego text, p_dif text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_para uuid;
  v_reto public.retos%rowtype;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  if coalesce(p_juego, '') not in ('pulseada', 'escalador', 'voley') or coalesce(p_dif, '') !~ '^[a-z]{3,10}$' then return json_build_object('error', 'invalido'); end if;
  v_para := public.id_de_codigo(p_codigo);
  if v_para is null or v_para = p_jugador then return json_build_object('error', 'no-existe'); end if;
  if not public.son_amigos(p_jugador, v_para) then return json_build_object('error', 'no-amigos'); end if;
  -- para que nadie llene la tabla: como mucho 8 retos por minuto
  if (select count(*) from public.retos where de = p_jugador and creado > now() - interval '1 minute') >= 8 then
    return json_build_object('error', 'muchos');
  end if;
  delete from public.retos where vence < now() - interval '1 day';
  update public.retos set estado = 'cancelado' where de = p_jugador and para = v_para and estado = 'pendiente';
  insert into public.retos (de, para, juego, dif, sala)
    values (p_jugador, v_para, p_juego, p_dif, replace(gen_random_uuid()::text, '-', ''))
  returning * into v_reto;
  return json_build_object('id', v_reto.id, 'sala', v_reto.sala, 'vence', v_reto.vence, 'huella', public.huella_de(v_para));
end $$;

-- ---------- Parte: duelos de Paleta ----------
-- Ahora también se puede retar a Paleta (cara a cara, cada uno con su paleta, a 7 puntos).
create or replace function public.retar(p_jugador uuid, p_codigo text, p_juego text, p_dif text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_para uuid;
  v_reto public.retos%rowtype;
begin
  if not exists (select 1 from public.jugadores where id = p_jugador) then return json_build_object('error', 'sin-apodo'); end if;
  if coalesce(p_juego, '') not in ('pulseada', 'escalador', 'voley', 'paleta') or coalesce(p_dif, '') !~ '^[a-z]{3,10}$' then return json_build_object('error', 'invalido'); end if;
  v_para := public.id_de_codigo(p_codigo);
  if v_para is null or v_para = p_jugador then return json_build_object('error', 'no-existe'); end if;
  if not public.son_amigos(p_jugador, v_para) then return json_build_object('error', 'no-amigos'); end if;
  -- para que nadie llene la tabla: como mucho 8 retos por minuto
  if (select count(*) from public.retos where de = p_jugador and creado > now() - interval '1 minute') >= 8 then
    return json_build_object('error', 'muchos');
  end if;
  delete from public.retos where vence < now() - interval '1 day';
  update public.retos set estado = 'cancelado' where de = p_jugador and para = v_para and estado = 'pendiente';
  insert into public.retos (de, para, juego, dif, sala)
    values (p_jugador, v_para, p_juego, p_dif, replace(gen_random_uuid()::text, '-', ''))
  returning * into v_reto;
  return json_build_object('id', v_reto.id, 'sala', v_reto.sala, 'vence', v_reto.vence, 'huella', public.huella_de(v_para));
end $$;
