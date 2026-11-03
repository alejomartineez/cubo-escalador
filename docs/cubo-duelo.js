// Duelos 1v1 en vivo entre amigos (necesita cubo-comun.js antes).
// La invitación queda en la tabla `retos` de Supabase (ver supabase.sql) y se avisa al instante por Realtime:
// cada jugador escucha su canal `cubo-j-<huella>` mientras tiene el sitio abierto, y la partida va por `cubo-s-<sala>`.
// Solo se retan amigos aceptados, y eso lo revisa el servidor: el aviso en vivo solo hace que se pregunte `mis_retos`,
// que trae nada más los retos de amigos. Por el mismo canal llegan los avisos de solicitudes de amistad.
(() => {
  'use strict';
  const CC = window.CuboComun;
  if (!CC || !CC.RANKING || window.CuboDuelo) return;
  const RED = CC.RANKING;
  const INK = '#1d2340', CREMA = '#fffaf0';
  const ESTADO = 'cubo-duelo';            // sessionStorage: el duelo que se está por jugar en esta pestaña
  const ENVIADOS = 'cubo-retos-enviados'; // localStorage: retos que mandaste (para reconocer cuando te aceptan)
  const VISTOS = 'cubo-retos-vistos';     // sessionStorage: retos que ya contestaste o cerraste

  // Juegos que se pueden jugar 1v1. Los dos juegan con las mismas condiciones (misma semilla, Normal).
  const JUEGOS = [
    { id: 'pulseada', nombre: 'Pulseada', desc: 'Pulseada de verdad: tu fuerza contra la suya. Al mejor de 3.', pagina: 'pulseada.html' },
    { id: 'escalador', nombre: 'Escalador', desc: 'Carrera al escalón 100 con la misma escalera.', pagina: 'escalador.html' },
  ];
  const juegoDe = id => JUEGOS.find(j => j.id === id);
  const skinDe = id => CC.SKINS.find(s => s.id === id) || CC.SKINS[0];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const leerJSON = (st, k, def) => { try { return JSON.parse(st.getItem(k)) ?? def; } catch (e) { return def; } };
  const guardarJSON = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- servidor ----------
  const base = () => RED.url.replace(/\/$/, '');
  async function rpc(nombre, cuerpo) {
    const r = await fetch(base() + '/rest/v1/rpc/' + nombre, {
      method: 'POST', headers: { apikey: RED.clave, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    if (r.status === 404) { const e = new Error('falta-sql'); e.faltaSql = true; throw e; }
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.status === 204 ? null : r.json();
  }
  // Mensaje suelto a un canal sin unirse (lo usa la invitación y la respuesta).
  function avisarCanal(canal, evento, datos) {
    return fetch(base() + '/realtime/v1/api/broadcast', {
      method: 'POST', headers: { apikey: RED.clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: canal, event: evento, payload: datos }] }),
    }).catch(() => {});
  }
  let miHuella = '';
  async function huella() {
    const id = CC.perfil().id;
    if (!id) return '';
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
      return (miHuella = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12));
    } catch (e) { return ''; }
  }
  // El SQL de retos todavía no está en Supabase: se recuerda un rato para no preguntar en cada página.
  const SIN_TABLA = 'cubo-retos-sin-tabla';
  let sinTabla = leerJSON(sessionStorage, SIN_TABLA, 0) > Date.now();
  const faltaTabla = () => { sinTabla = true; guardarJSON(sessionStorage, SIN_TABLA, Date.now() + 10 * 60000); };

  // ---------- Realtime (protocolo Phoenix de Supabase, sin librerías) ----------
  const RT = (() => {
    let ws = null, n = 0, latido = null, espera = 0, timer = null;
    const canales = new Map();
    const mandar = m => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; };
    function unir(topic, c) {
      c.ref = String(++n); c.unido = false;
      mandar({ topic, event: 'phx_join', ref: c.ref, join_ref: c.ref,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } } });
    }
    function abrir() {
      if (ws && ws.readyState <= 1) return;
      try { ws = new WebSocket(base().replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(RED.clave) + '&vsn=1.0.0'); }
      catch (e) { ws = null; reintentar(); return; }
      ws.onopen = () => {
        espera = 0;
        for (const [t, c] of canales) unir(t, c);
        clearInterval(latido);
        latido = setInterval(() => mandar({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++n) }), 25000);
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        const c = canales.get(m.topic);
        if (!c) return;
        if (m.event === 'phx_reply' && m.ref === c.ref) {
          c.unido = !!(m.payload && m.payload.status === 'ok');
          if (c.unido && c.alUnir) c.alUnir();
        } else if (m.event === 'broadcast' && m.payload) c.alMsg(m.payload.event, m.payload.payload || {});
        else if (m.event === 'phx_error' || m.event === 'phx_close') { c.unido = false; setTimeout(() => { if (canales.get(m.topic) === c) unir(m.topic, c); }, 1500); }
      };
      ws.onclose = () => {
        clearInterval(latido); ws = null;
        for (const c of canales.values()) c.unido = false;
        if (canales.size) reintentar();
      };
      ws.onerror = () => {};
    }
    function reintentar() { clearTimeout(timer); espera = Math.min(15000, espera ? espera * 2 : 800); timer = setTimeout(abrir, espera); }
    function canal(nombre, alMsg, alUnir) {
      const topic = 'realtime:' + nombre, c = { alMsg, alUnir, ref: '', unido: false };
      canales.set(topic, c);
      if (ws && ws.readyState === 1) unir(topic, c); else abrir();
      return {
        enviar: (ev, datos) => c.unido && mandar({ topic, event: 'broadcast', ref: String(++n), join_ref: c.ref, payload: { type: 'broadcast', event: ev, payload: datos } }),
        unido: () => c.unido,
        salir() {
          if (canales.get(topic) !== c) return;
          canales.delete(topic);
          mandar({ topic, event: 'phx_leave', payload: {}, ref: String(++n), join_ref: c.ref });
          if (!canales.size && ws) { const w = ws; ws = null; clearInterval(latido); setTimeout(() => { try { w.close(); } catch (e) {} }, 300); }
        },
      };
    }
    addEventListener('online', () => { if (canales.size) abrir(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && canales.size) abrir(); });
    return { canal };
  })();

  // ---------- estilos ----------
  function estilos() {
    if (document.getElementById('cd-estilos')) return;
    const st = document.createElement('style');
    st.id = 'cd-estilos';
    st.textContent = `
.cd-btn{appearance:none;cursor:pointer;height:48px;padding:0 18px;border-radius:14px;border:3px solid ${INK};background:#fff;color:${INK};
  box-shadow:0 4px 0 ${INK};font:400 19px/1 "Lilita One","Trebuchet MS",sans-serif;white-space:nowrap}
.cd-btn.si{background:#ffcc29}
.cd-btn.rojo{background:#ff5d7d;color:#fff}
.cd-btn:active{transform:translateY(3px);box-shadow:0 1px 0 ${INK}}
.cd-btn:disabled{opacity:.55;cursor:default}
.cd-btn:focus-visible{outline:3px solid #ff5d7d;outline-offset:3px}
#cd-reto{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:10000;zoom:var(--ui,1);
  width:min(420px,calc(100vw - 24px));box-sizing:border-box;display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;
  padding:12px 14px;background:${CREMA};color:${INK};border:3px solid ${INK};border-radius:20px;box-shadow:0 6px 0 ${INK};
  font-family:"Rubik",system-ui,sans-serif;animation:cd-cae .25s ease-out}
@keyframes cd-cae{from{transform:translate(-50%,-20px);opacity:0}}
#cd-reto canvas{width:48px;height:52px}
#cd-reto .t b{display:block;font:400 20px/1.1 "Lilita One","Trebuchet MS",sans-serif;overflow-wrap:anywhere}
#cd-reto .t span{display:block;margin-top:2px;font-size:13px;font-weight:600;opacity:.75}
#cd-reto .bs{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
#cd-capa{position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;
  background:rgba(29,35,64,.6);font-family:"Rubik",system-ui,sans-serif;color:${INK}}
#cd-capa .cd-card{zoom:var(--ui,1);width:min(380px,100%);box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;
  padding:18px 18px 20px;background:${CREMA};border:3px solid ${INK};border-radius:22px;box-shadow:0 7px 0 ${INK};animation:cd-sube .2s ease-out}
@keyframes cd-sube{from{transform:translateY(16px);opacity:0}}
#cd-capa h2{margin:0;font:400 30px/1.05 "Lilita One","Trebuchet MS",sans-serif}
#cd-capa h2.gane{color:#fff;-webkit-text-stroke:2px ${INK};paint-order:stroke fill;text-shadow:0 3px 0 ${INK}}
#cd-capa p{margin:0;font-size:15px;font-weight:600;line-height:1.4}
#cd-capa p.chico{font-size:13px;opacity:.7}
#cd-capa p:empty{display:none}
#cd-capa .vs{display:flex;align-items:center;justify-content:center;gap:14px;width:100%}
#cd-capa .vs > div{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px}
#cd-capa .vs canvas{width:64px;height:70px}
#cd-capa .vs small{max-width:100%;font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cd-capa .vs i{font:400 26px "Lilita One","Trebuchet MS",sans-serif;font-style:normal;color:#ff5d7d}
#cd-capa .vs .gano{position:relative}
#cd-capa .vs .gano::before{content:"👑";position:absolute;top:-16px;font-size:22px}
#cd-capa .bs{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;width:100%}
#cd-capa .bs .cd-btn{flex:1 1 130px}
#cd-capa .rueda{width:30px;height:30px;border-radius:50%;border:4px solid rgba(29,35,64,.2);border-top-color:${INK};animation:cd-gira .8s linear infinite}
@keyframes cd-gira{to{transform:rotate(360deg)}}
#cd-capa .cd-juegos{display:grid;gap:8px;width:100%}
#cd-capa .cd-juegos button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;cursor:pointer;padding:10px 14px;border-radius:14px;
  border:3px solid ${INK};background:#fff;box-shadow:0 4px 0 ${INK};color:${INK};font-family:inherit}
#cd-capa .cd-juegos button b{font:400 20px/1 "Lilita One","Trebuchet MS",sans-serif}
#cd-capa .cd-juegos button span{font-size:13px;font-weight:600;opacity:.75}
#cd-capa .cd-juegos button:active{transform:translateY(3px);box-shadow:0 1px 0 ${INK}}
#cd-cuenta{position:fixed;inset:0;z-index:9996;display:grid;place-items:center;pointer-events:none}
#cd-cuenta b{font:400 120px/1 "Lilita One","Trebuchet MS",sans-serif;color:#fff;-webkit-text-stroke:4px ${INK};paint-order:stroke fill;text-shadow:0 7px 0 ${INK};
  animation:cd-num .9s ease-out both}
@keyframes cd-num{from{transform:scale(1.6);opacity:0}25%{transform:scale(1);opacity:1}80%{opacity:1}to{opacity:0;transform:scale(.9)}}
#cd-hud{position:fixed;left:50%;transform:translateX(-50%);z-index:20;zoom:var(--ui,1);width:min(360px,calc(100vw - 32px));box-sizing:border-box;
  display:grid;gap:5px;padding:7px 10px;background:rgba(255,250,240,.94);border:2.5px solid ${INK};border-radius:14px;box-shadow:0 3px 0 ${INK};
  font:800 12px/1 "Rubik",system-ui,sans-serif;color:${INK};pointer-events:none}
#cd-hud .f{display:grid;grid-template-columns:72px 1fr 48px;align-items:center;gap:8px}
#cd-hud .f span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cd-hud .f em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
#cd-hud .b{height:10px;border-radius:99px;background:#e6e2d6;border:2px solid ${INK};overflow:hidden}
#cd-hud .b i{display:block;height:100%;width:0}
@media (prefers-reduced-motion:reduce){#cd-reto,#cd-capa .cd-card,#cd-cuenta b{animation:none}#cd-capa .rueda{animation-duration:2s}}`;
    document.head.appendChild(st);
  }
  function cubito(cv, sk, mirar) {
    const c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const w = cv.width / 2, h = cv.height / 2;
    CC.dibujarCubo(c, w / 2, h - 4, Math.min(w, h) * 0.58, { skin: sk, t: 900, efecto: false, mirar });
  }

  // ---------- ventana del medio (esperas, elegir juego, resultado) ----------
  let capaEl = null, capaCerrar = null;
  function capa(o) {
    estilos();
    cerrarCapa();
    const el = document.createElement('div');
    el.id = 'cd-capa'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    const p = CC.perfil();
    el.innerHTML = `<div class="cd-card">
      ${o.rival ? `<div class="vs"><div class="${o.gano === 'yo' ? 'gano' : ''}"><canvas width="128" height="140"></canvas><small>Vos</small></div><i>VS</i>
        <div class="${o.gano === 'el' ? 'gano' : ''}"><canvas width="128" height="140"></canvas><small>${esc(o.rival.apodo)}</small></div></div>` : ''}
      ${o.titulo ? `<h2 class="${o.gane ? 'gane' : ''}">${esc(o.titulo)}</h2>` : ''}
      ${o.cargando ? '<div class="rueda" aria-hidden="true"></div>' : ''}
      ${o.html || ''}
      ${o.texto ? `<p>${o.texto}</p>` : ''}
      ${o.nota ? `<p class="chico">${o.nota}</p>` : ''}
      <div class="bs"></div></div>`;
    if (o.rival) {
      const [a, b] = el.querySelectorAll('.vs canvas');
      cubito(a, p.skin, 1); cubito(b, skinDe(o.rival.skin), -1);
    }
    const bs = el.querySelector('.bs');
    for (const b of o.botones || []) {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'cd-btn' + (b.si ? ' si' : b.rojo ? ' rojo' : ''); x.textContent = b.txt;
      x.addEventListener('click', () => b.accion(x));
      bs.appendChild(x);
    }
    if (!bs.children.length) bs.remove();
    document.body.appendChild(el);
    capaEl = el; capaCerrar = o.alCerrar || null;
    const f = el.querySelector('.cd-btn.si') || el.querySelector('.cd-btn');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return el;
  }
  function cerrarCapa() {
    if (!capaEl) return;
    capaEl.remove(); capaEl = null;
    const f = capaCerrar; capaCerrar = null;
    if (f) f();
  }
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && capaEl && capaCerrar) { e.stopImmediatePropagation(); cerrarCapa(); }
  }, true);

  // ---------- retar (el que invita) ----------
  // Elegís el juego y queda esperando la respuesta. Devuelve sin esperar.
  function elegirJuego(amigo) {
    const p = CC.perfil();
    if (!p.apodo || !p.codigoAmigo) {
      capa({ titulo: 'Primero, tu apodo', texto: 'Para retar a alguien necesitás un apodo (y tu código de amigo). Ponelo en cualquier ranking.', botones: [{ txt: 'Listo', si: true, accion: cerrarCapa }] });
      return;
    }
    if (!p.amigos.some(a => a.codigo === amigo.codigo)) {
      capa({ titulo: 'Todavía no', rival: amigo, texto: `Para retar a ${esc(amigo.apodo)} tiene que aceptar tu solicitud de amistad.`, botones: [{ txt: 'OK', si: true, accion: cerrarCapa }] });
      return;
    }
    const el = capa({ titulo: 'Retar a ' + amigo.apodo, rival: amigo, nota: 'Le llega la invitación al toque si tiene el juego abierto, y si no cuando entre (dura 10 minutos).',
      html: '<div class="cd-juegos"></div>', botones: [{ txt: 'Cancelar', accion: cerrarCapa }], alCerrar: () => {} });
    const box = el.querySelector('.cd-juegos');
    for (const j of JUEGOS) {
      const b = document.createElement('button');
      b.type = 'button'; b.innerHTML = `<b>${esc(j.nombre)}</b><span>${esc(j.desc)}</span>`;
      b.addEventListener('click', () => retar(amigo, j.id));
      box.appendChild(b);
    }
  }

  let esperando = null;   // el reto que mandaste y estás esperando
  async function retar(amigo, juego) {
    const p = CC.perfil();
    capa({ titulo: 'Mandando el reto…', rival: amigo, cargando: true });
    const mia = await huella();
    let r;
    try {
      if (sinTabla) throw Object.assign(new Error('falta-sql'), { faltaSql: true });
      r = await rpc('retar', { p_jugador: p.id, p_codigo: amigo.codigo, p_juego: juego, p_dif: 'normal' });
    } catch (e) {
      if (e.faltaSql) faltaTabla();
      capa({ titulo: 'No se pudo', texto: e.faltaSql ? 'Los retos se están preparando. Probá de nuevo en un rato.' : 'No hay conexión. Probá de nuevo en un rato.',
        botones: [{ txt: 'OK', si: true, accion: cerrarCapa }] });
      return;
    }
    if (!r || r.error) {
      const msg = { 'sin-apodo': 'Tu apodo todavía no se subió. Esperá unos segundos y probá de nuevo.', 'no-existe': 'No encontramos a tu amigo. Quizás cambió de código.',
        'no-amigos': `${esc(amigo.apodo)} ya no está en tus amigos (o todavía no aceptó tu solicitud).`,
        muchos: 'Mandaste muchos retos seguidos. Esperá un minuto.' }[r && r.error] || 'No se pudo mandar el reto.';
      capa({ titulo: 'Uy', texto: msg, botones: [{ txt: 'OK', si: true, accion: cerrarCapa }] });
      if (r && r.error === 'sin-apodo') CC.subirPendientes();
      if (r && r.error === 'no-amigos') CC.refrescarAmigos(true);
      return;
    }
    const reto = { id: r.id, sala: r.sala, juego, dif: 'normal', vence: r.vence, huella: r.huella || amigo.huella,
      rival: { apodo: amigo.apodo, skin: amigo.skin, huella: r.huella || amigo.huella, codigo: amigo.codigo } };
    const env = leerJSON(localStorage, ENVIADOS, []).filter(x => Date.parse(x.vence) > Date.now());
    env.push(reto); guardarJSON(localStorage, ENVIADOS, env.slice(-10));
    avisarCanal('cubo-j-' + reto.huella, 'reto', {
      id: reto.id, sala: reto.sala, juego, dif: 'normal', vence: reto.vence,
      de: { apodo: p.apodo, skin: p.skin.id, titulo: p.titulo ? p.titulo.nombre : '', huella: mia, codigo: p.codigoAmigo },
    });
    esperar(reto);
  }

  function esperar(reto) {
    const j = juegoDe(reto.juego);
    let fin = false, poll = null;
    const terminar = () => { fin = true; clearInterval(poll); clearInterval(reloj); if (esperando === reto) esperando = null; };
    esperando = reto;
    const restante = () => { const s = Math.max(0, Math.round((Date.parse(reto.vence) - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const el = capa({ titulo: 'Esperando a ' + reto.rival.apodo, rival: reto.rival, cargando: true,
      texto: `Lo retaste a <b>${esc(j ? j.nombre : reto.juego)}</b>. Apenas acepte, arranca.`,
      nota: `Si no tiene el juego abierto, le aparece cuando entre. Vence en <span data-reloj>${restante()}</span>.`,
      botones: [{ txt: 'Cancelar reto', accion: () => cancelar() }], alCerrar: () => { if (!fin) cancelar(true); } });
    const reloj = setInterval(() => {
      const r = el.querySelector('[data-reloj]'); if (r) r.textContent = restante();
      if (Date.parse(reto.vence) <= Date.now()) respuesta('vencido');
    }, 1000);
    function cancelar(yaCerrada) {
      if (fin) return;
      terminar();
      if (!sinTabla) rpc('responder_reto', { p_jugador: CC.perfil().id, p_id: reto.id, p_estado: 'cancelado' }).catch(() => {});
      avisarCanal('cubo-j-' + reto.huella, 'cancelo', { id: reto.id });
      quitarEnviado(reto.id);
      if (!yaCerrada) cerrarCapa();
    }
    function respuesta(estado) {
      if (fin) return;
      if (estado === 'aceptado') { terminar(); capaCerrar = null; irAJugar(reto, 'host'); return; }
      if (estado === 'pendiente') return;
      terminar(); capaCerrar = null; quitarEnviado(reto.id);
      capa({ titulo: estado === 'rechazado' ? 'Ahora no puede' : 'No respondió', rival: reto.rival,
        texto: estado === 'rechazado' ? `${esc(reto.rival.apodo)} no puede jugar ahora. Probá más tarde.` : `${esc(reto.rival.apodo)} no aceptó a tiempo. Mandale otro cuando esté.`,
        botones: [{ txt: 'OK', si: true, accion: cerrarCapa }] });
    }
    reto.responder = respuesta;
    if (!sinTabla) poll = setInterval(() => {
      if (document.hidden) return;
      rpc('ver_reto', { p_jugador: CC.perfil().id, p_id: reto.id }).then(e => respuesta(e || 'cancelado'), () => {});
    }, 5000);
  }
  function quitarEnviado(id) { guardarJSON(localStorage, ENVIADOS, leerJSON(localStorage, ENVIADOS, []).filter(x => x.id !== id)); }

  function irAJugar(reto, rol) {
    const j = juegoDe(reto.juego);
    if (!j) return;
    guardarJSON(sessionStorage, ESTADO, { id: reto.id, sala: reto.sala, juego: reto.juego, dif: reto.dif || 'normal', rol, rival: reto.rival });
    capa({ titulo: '¡Aceptado!', rival: reto.rival, cargando: true, texto: `Abriendo ${esc(j.nombre)}…` });
    location.href = j.pagina + '?duelo=' + encodeURIComponent(reto.sala);
  }

  // ---------- invitaciones (el que recibe) ----------
  const vistos = () => leerJSON(sessionStorage, VISTOS, []);
  const marcarVisto = id => guardarJSON(sessionStorage, VISTOS, [...vistos(), id].slice(-30));
  let cola = [], mostrando = null, retoEl = null;
  function encolar(r) {
    if (!r || !r.id || !juegoDe(r.juego) || Date.parse(r.vence) <= Date.now() || vistos().includes(r.id)) return;
    if ((mostrando && mostrando.id === r.id) || cola.some(x => x.id === r.id)) return;
    if (enDuelo) return;   // ya estás jugando uno: no te interrumpe
    cola.push(r);
    siguiente();
  }
  function siguiente() {
    if (mostrando || !cola.length || !document.body) return;
    mostrando = cola.shift();
    if (Date.parse(mostrando.vence) <= Date.now()) { mostrando = null; siguiente(); return; }
    estilos();
    const r = mostrando, j = juegoDe(r.juego);
    const el = document.createElement('div');
    el.id = 'cd-reto'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Te retaron');
    el.innerHTML = `<canvas width="96" height="104"></canvas><div class="t"><b></b><span></span></div>
      <div class="bs"><button type="button" class="cd-btn si" data-si>¡Acepto!</button><button type="button" class="cd-btn" data-no>Ahora no</button></div>`;
    el.querySelector('b').textContent = `${r.apodo} te reta a ${j.nombre}`;
    el.querySelector('span').textContent = j.desc;
    cubito(el.querySelector('canvas'), skinDe(r.skin), 1);
    el.querySelector('[data-si]').addEventListener('click', e => aceptar(r, e.currentTarget));
    el.querySelector('[data-no]').addEventListener('click', () => rechazar(r));
    document.body.appendChild(el);
    retoEl = el;
    try { CC.vibrar(40); } catch (e) {}
    clearTimeout(r.tVence);
    r.tVence = setTimeout(() => { if (mostrando === r) sacar(r.id); }, Math.max(0, Date.parse(r.vence) - Date.now()));
  }
  function sacar(id) {
    cola = cola.filter(x => x.id !== id);
    if (mostrando && mostrando.id === id) { if (retoEl) retoEl.remove(); retoEl = null; mostrando = null; siguiente(); }
  }
  async function aceptar(r, btn) {
    btn.disabled = true; btn.textContent = 'Entrando…';
    marcarVisto(r.id);
    if (!sinTabla) {
      let estado = null;
      try { estado = await rpc('responder_reto', { p_jugador: CC.perfil().id, p_id: r.id, p_estado: 'aceptado' }); }
      catch (e) { if (e.faltaSql) faltaTabla(); else { btn.disabled = false; btn.textContent = '¡Acepto!'; return; } }
      if (!sinTabla && estado !== 'aceptado') {
        sacar(r.id);
        capa({ titulo: 'Se venció', texto: `El reto de ${esc(r.apodo)} ya no está. Retalo vos desde Amigos.`, botones: [{ txt: 'OK', si: true, accion: cerrarCapa }] });
        return;
      }
    }
    const mia = await huella(), p = CC.perfil();
    const yo = { apodo: p.apodo, skin: p.skin.id, huella: mia, codigo: p.codigoAmigo };
    await Promise.all([avisarCanal('cubo-s-' + r.sala, 'acepto', { id: r.id }), avisarCanal('cubo-j-' + r.huella, 'acepto', { id: r.id, de: yo })]);
    sacar(r.id);
    irAJugar({ ...r, rival: { apodo: r.apodo, skin: r.skin, huella: r.huella, codigo: r.codigo } }, 'guest');
  }
  function rechazar(r) {
    marcarVisto(r.id); sacar(r.id);
    if (!sinTabla) rpc('responder_reto', { p_jugador: CC.perfil().id, p_id: r.id, p_estado: 'rechazado' }).catch(() => {});
    avisarCanal('cubo-s-' + r.sala, 'rechazo', { id: r.id });
    avisarCanal('cubo-j-' + r.huella, 'rechazo', { id: r.id });
  }

  // Lo que te llega a tu canal personal
  function alMensajePropio(ev, d) {
    if (ev === 'reto') {
      // lo que diga el mensaje no importa: se le pregunta al servidor, que solo devuelve retos de amigos
      revisar();
    } else if (ev === 'amistad') {
      // te mandaron, aceptaron o sacaron una solicitud: se trae la lista (si llegan muchos seguidos, una sola vez)
      clearTimeout(tAmistad);
      tAmistad = setTimeout(() => CC.refrescarAmigos(true), 800);
    } else if (ev === 'cancelo') sacar(d.id);
    else if (ev === 'acepto' || ev === 'rechazo') {
      if (esperando && esperando.id === d.id) { esperando.responder(ev === 'acepto' ? 'aceptado' : 'rechazado'); return; }
      // te aceptaron un reto mientras estabas en otro lado
      const reto = leerJSON(localStorage, ENVIADOS, []).find(x => x.id === d.id);
      if (!reto || ev !== 'acepto' || enDuelo) return;
      quitarEnviado(reto.id);
      capa({ titulo: '¡Aceptó tu reto!', rival: reto.rival, texto: `${esc(reto.rival.apodo)} ya está en ${esc(juegoDe(reto.juego).nombre)} esperándote.`,
        botones: [{ txt: '¡Vamos!', si: true, accion: () => irAJugar(reto, 'host') }, { txt: 'Ahora no', accion: cerrarCapa }] });
    }
  }
  let ultimaRevision = 0, tAmistad = null;
  async function revisar() {
    const p = CC.perfil();
    if (sinTabla || !p.apodo || !p.id || enDuelo || navigator.onLine === false) return;
    ultimaRevision = Date.now();
    try {
      const lista = await rpc('mis_retos', { p_jugador: p.id });
      for (const r of lista || []) encolar(r);
    } catch (e) { if (e.faltaSql) faltaTabla(); }
  }
  let propio = null;
  async function escuchar() {
    const p = CC.perfil();
    if (propio || !p.apodo || !p.id) return;
    const h = await huella();
    if (!h || propio) return;
    propio = RT.canal('cubo-j-' + h, alMensajePropio);
    revisar();
  }

  // ---------- la sala (en la página del juego) ----------
  let enDuelo = false;
  // El duelo de esta pestaña si se abrió con ?duelo=<sala>, o null.
  function partida() {
    const sala = new URLSearchParams(location.search).get('duelo');
    if (!sala) return null;
    const cfg = leerJSON(sessionStorage, ESTADO, null);
    if (!cfg || cfg.sala !== sala || !juegoDe(cfg.juego)) { history.replaceState(null, '', location.pathname); return null; }
    enDuelo = true;
    return cfg;
  }
  // h: { alEmpezar(d), alMensaje(ev, d), alIrse() }. El anfitrión (el que retó) decide cuándo arranca y la semilla.
  function sala(cfg, h) {
    const s = { rol: cfg.rol, rival: cfg.rival, host: cfg.rol === 'host', rtt: 160, conectado: false };
    let visto = 0, yoListo = false, elListo = false, empezo = false, cerrada = false, tListo = null, tVivo = null, tEspera = null;
    const nombre = esc(cfg.rival.apodo);
    const ch = RT.canal('cubo-s-' + cfg.sala, (ev, d) => {
      visto = Date.now();
      if (ev === 'hola') {
        if (!d.eco) ch.enviar('hola', { eco: true });
        if (!s.conectado) { s.conectado = true; clearTimeout(tEspera); if (h.alConectar) h.alConectar(); }
      } else if (ev === 'ping') ch.enviar('pong', { t: d.t });
      else if (ev === 'pong') { const r = Date.now() - d.t; if (r > 0 && r < 5000) s.rtt = s.rtt * 0.6 + r * 0.4; }
      else if (ev === 'listo') {
        elListo = true;
        const n = document.querySelector('#cd-capa [data-revancha]');
        if (n && !n.textContent) n.textContent = `¡${cfg.rival.apodo} quiere la revancha!`;
        arrancar();
      }
      else if (ev === 'empezar') {
        if (s.host || !yoListo) return;
        yoListo = elListo = false; clearInterval(tListo); empezo = true;
        h.alEmpezar(d);
      } else if (ev === 'chau') irse();
      else if (ev === 'acepto' || ev === 'rechazo' || ev === 'vivo') {}
      else if (h.alMensaje) h.alMensaje(ev, d);
    }, () => ch.enviar('hola', {}));
    function arrancar() {
      if (!s.host || !yoListo || !elListo) return;
      yoListo = elListo = false; clearInterval(tListo); empezo = true;
      const d = { semilla: Math.floor(Math.random() * 2 ** 31) };
      ch.enviar('empezar', d);
      setTimeout(() => h.alEmpezar(d), Math.min(400, s.rtt / 2));   // así arrancan casi a la vez
    }
    function irse() {
      if (cerrada) return;
      if (h.alIrse) h.alIrse();
    }
    tVivo = setInterval(() => {
      if (!ch.unido()) return;
      if (!s.conectado) ch.enviar('hola', {});
      else { ch.enviar('ping', { t: Date.now() }); if (Date.now() - visto > 12000) { s.conectado = false; irse(); } }
    }, 2000);
    tEspera = setTimeout(() => {
      if (s.conectado || cerrada) return;
      capa({ titulo: 'No llegó', rival: cfg.rival, texto: `${nombre} no entró al duelo. Quizás cerró el juego.`,
        botones: [{ txt: 'Volver', si: true, accion: () => s.salir() }] });
    }, 60000);
    s.enviar = (ev, d) => ch.enviar(ev, d);
    // Avisás que estás para jugar (la primera vez y en cada revancha). Arranca cuando los dos están.
    s.listo = () => {
      yoListo = true; empezo = false;
      ch.enviar('listo', {});
      clearInterval(tListo);
      tListo = setInterval(() => { if (yoListo && !empezo) ch.enviar('listo', {}); }, 1000);
      arrancar();
    };
    s.salir = () => {
      cerrada = true; clearInterval(tVivo); clearInterval(tListo); clearTimeout(tEspera);
      ch.enviar('chau', {});
      setTimeout(() => ch.salir(), 150);
      try { sessionStorage.removeItem(ESTADO); } catch (e) {}
      setTimeout(() => { location.href = 'index.html#amigos'; }, 200);
    };
    addEventListener('pagehide', () => { if (!cerrada) ch.enviar('chau', {}); });
    return s;
  }

  // Pantalla de espera hasta que entra el otro
  function esperandoRival(s) {
    capa({ titulo: 'Duelo contra ' + s.rival.apodo, rival: s.rival, cargando: true, texto: `Esperando a que entre ${esc(s.rival.apodo)}…`,
      botones: [{ txt: 'Salir', accion: () => s.salir() }] });
  }
  // 3, 2, 1, ¡Ya! y después cb()
  function cuenta(cb, alNumero) {
    estilos();
    cerrarCapa();
    let el = document.getElementById('cd-cuenta');
    if (!el) { el = document.createElement('div'); el.id = 'cd-cuenta'; el.setAttribute('aria-live', 'assertive'); document.body.appendChild(el); }
    const pasos = ['3', '2', '1', '¡Ya!'];
    pasos.forEach((t, i) => setTimeout(() => {
      el.innerHTML = `<b>${t}</b>`;
      if (alNumero) alNumero(3 - i);
      if (i === pasos.length - 1) { cb(); setTimeout(() => { el.innerHTML = ''; }, 700); }
    }, i * 800));
  }
  // Resultado con revancha. o: { gane: true | false | null, texto }
  function resultado(s, o) {
    const ver = () => capa({
      titulo: o.titulo || (o.gane === true ? '¡Ganaste!' : o.gane === false ? 'Perdiste' : 'Empate'), gane: o.gane === true,
      rival: s.rival, gano: o.gane === true ? 'yo' : o.gane === false ? 'el' : '', texto: o.texto, nota: o.nota,
      html: o.sinRevancha ? '' : '<p data-revancha style="color:#e0365a;font-weight:800"></p>',
      botones: o.sinRevancha ? [{ txt: 'Volver', si: true, accion: () => s.salir() }] : [
        { txt: 'Revancha', si: true, accion: b => { b.disabled = true; b.textContent = 'Esperando…'; s.listo(); } },
        { txt: 'Salir', accion: () => s.salir() }],
    });
    ver();
  }
  // Barra de la carrera: { yo: 0..1, el: 0..1, txtYo, txtEl }, arriba en `top` px
  let hudEl = null;
  function barra(o) {
    estilos();
    if (o === null) { if (hudEl) hudEl.remove(); hudEl = null; return; }
    if (!hudEl) {
      hudEl = document.createElement('div'); hudEl.id = 'cd-hud'; hudEl.setAttribute('aria-hidden', 'true');
      hudEl.innerHTML = '<div class="f"><span>Vos</span><span class="b"><i></i></span><em></em></div><div class="f"><span></span><span class="b"><i></i></span><em></em></div>';
      document.body.appendChild(hudEl);
    }
    if (o.top != null) hudEl.style.top = o.top + 'px';
    if (o.bottom != null) hudEl.style.bottom = o.bottom + 'px';
    const [a, b] = hudEl.children;
    if (o.nombre) b.firstElementChild.textContent = o.nombre;
    if (o.colorYo) a.querySelector('i').style.background = o.colorYo;
    if (o.colorEl) b.querySelector('i').style.background = o.colorEl;
    a.querySelector('i').style.width = Math.round(100 * Math.max(0, Math.min(1, o.yo))) + '%';
    b.querySelector('i').style.width = Math.round(100 * Math.max(0, Math.min(1, o.el))) + '%';
    a.querySelector('em').textContent = o.txtYo ?? '';
    b.querySelector('em').textContent = o.txtEl ?? '';
  }
  // Generador de números al azar con semilla (los dos ven lo mismo)
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  window.CuboDuelo = { JUEGOS, elegirJuego, retar, partida, sala, esperandoRival, cuenta, resultado, barra, azar, capa, cerrarCapa, skinDe, revisar };

  // escuchar invitaciones en todas las páginas
  const arrancarEscucha = () => setTimeout(escuchar, 800);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarEscucha); else arrancarEscucha();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    escuchar();
    if (Date.now() - ultimaRevision > 20000) revisar();
  });
  // por si el canal se cortó sin enterarnos: cada tanto se miran los retos pendientes
  setInterval(() => { if (!document.hidden && Date.now() - ultimaRevision > 60000) revisar(); }, 15000);
})();
