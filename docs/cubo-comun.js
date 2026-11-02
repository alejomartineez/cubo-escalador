// Cubo Escalador: lo que comparten todos los juegos.
// Perfil (nivel, XP, personaje elegido, récords) guardado en localStorage, y el dibujo del cubo con su personaje.
//
// Uso desde un juego (cargá este archivo antes del script del juego):
//   const CC = window.CuboComun;                 // puede no existir: el juego tiene que andar igual
//   CC.dibujarCubo(ctx, x, pie, lado, { mirar: -1|0|1, mareado: bool, t: performance.now() });
//   const r = CC.sumarXP(34);                    // al terminar una partida → { ganada, nivel, subio, desbloqueadas }
//   CC.anotarRecord('lluvia', '1.234 pts');      // texto del mejor resultado, lo muestra la pantalla de juegos
//   CC.volver();                                 // vuelve a la pantalla de juegos
(() => {
  'use strict';
  const KEY = 'cubo-perfil';
  const INK = '#1d2340';

  const SKINS = [
    { id: 'clasico', nombre: 'Clásico', nivel: 1, cuerpo: '#ffcc29' },
    { id: 'sandia', nombre: 'Sandía', nivel: 2, cuerpo: '#ff6b8b', extra: 'semillas' },
    { id: 'menta', nombre: 'Menta', nivel: 3, cuerpo: '#6be0b5' },
    { id: 'gorra', nombre: 'Gorra', nivel: 4, cuerpo: '#ffcc29', extra: 'gorra', color2: '#ff5d7d' },
    { id: 'gato', nombre: 'Gato', nivel: 5, cuerpo: '#ffad4d', extra: 'orejas' },
    { id: 'robot', nombre: 'Robot', nivel: 7, cuerpo: '#b8c4d6', extra: 'antena', ojos: 'cuadrados', sinCachetes: true },
    { id: 'dj', nombre: 'DJ', nivel: 9, cuerpo: '#c08bff', extra: 'auriculares', color2: '#ff5d7d' },
    { id: 'astronauta', nombre: 'Astronauta', nivel: 12, cuerpo: '#f4f6fb', extra: 'casco' },
    { id: 'rey', nombre: 'Rey', nivel: 15, cuerpo: '#ffcc29', extra: 'corona', color2: '#f5b301' },
    { id: 'noche', nombre: 'Noche', nivel: 18, cuerpo: '#2b3470', ojo: '#fffaf0', extra: 'estrellitas' },
    { id: 'oro', nombre: 'Oro', nivel: 22, cuerpo: '#f5c518', extra: 'brillos' },
  ];
  // XP para pasar del nivel n al n+1
  const xpPara = n => 80 + 40 * (n - 1);

  function leer() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!p || typeof p !== 'object') p = {};
    return {
      xp: Math.max(0, +p.xp || 0),
      skin: typeof p.skin === 'string' ? p.skin : 'clasico',
      records: p.records && typeof p.records === 'object' ? p.records : {},
    };
  }
  let datos = leer();
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(datos)); } catch (e) {} };

  function nivelDe(xp) {
    let n = 1, resto = xp;
    while (resto >= xpPara(n)) { resto -= xpPara(n); n++; }
    return { nivel: n, enNivel: resto, paraSiguiente: xpPara(n) };
  }
  function skin() {
    const s = SKINS.find(k => k.id === datos.skin);
    return s && nivelDe(datos.xp).nivel >= s.nivel ? s : SKINS[0];
  }
  function perfil() {
    datos = leer(); // otro juego pudo haberlo cambiado
    return { xp: datos.xp, ...nivelDe(datos.xp), skin: skin(), records: { ...datos.records } };
  }
  function elegirSkin(id) {
    datos = leer();
    const s = SKINS.find(k => k.id === id);
    if (!s || nivelDe(datos.xp).nivel < s.nivel) return false;
    datos.skin = id; guardar();
    return true;
  }
  function sumarXP(n) {
    datos = leer();
    n = Math.max(0, Math.round(+n || 0));
    const antes = nivelDe(datos.xp).nivel;
    datos.xp += n; guardar();
    const ahora = nivelDe(datos.xp).nivel;
    const nuevas = SKINS.filter(s => s.nivel > antes && s.nivel <= ahora);
    if (ahora > antes) cartel(ahora, nuevas);
    return { ganada: n, nivel: ahora, subio: ahora > antes, desbloqueadas: nuevas.map(s => s.nombre) };
  }
  function anotarRecord(juego, texto) {
    datos = leer(); datos.records[juego] = String(texto); guardar();
  }
  function volver() { location.href = 'index.html'; }

  // ---------- dibujo ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function estrella(ctx, cx, cy, r, puntas = 5) {
    ctx.beginPath();
    for (let k = 0; k < puntas * 2; k++) {
      const a = -Math.PI / 2 + k * Math.PI / puntas, rad = k % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  // Dibuja el cubo con la base apoyada en (x, pie). `lado` es el tamaño del cubo en px.
  function dibujarCubo(ctx, x, pie, s, o = {}) {
    const sk = o.skin || skin();
    const t = o.t ?? performance.now();
    const mareado = !!o.mareado, mirar = Math.max(-1, Math.min(1, o.mirar || 0));
    const lw = Math.max(2, s * 0.08);
    ctx.save();
    ctx.translate(x, pie);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    ctx.fillStyle = 'rgba(29,35,64,.2)'; rr(ctx, -s / 2 + 3, -s + 4, s, s, s * 0.2); ctx.fill();

    if (sk.extra === 'orejas') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = sk.cuerpo; ctx.strokeStyle = INK; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(side * s * 0.46, -s * 0.9); ctx.lineTo(side * s * 0.36, -s * 1.3); ctx.lineTo(side * s * 0.08, -s * 0.96);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff9fb6';
        ctx.beginPath(); ctx.moveTo(side * s * 0.38, -s * 0.98); ctx.lineTo(side * s * 0.34, -s * 1.17); ctx.lineTo(side * s * 0.2, -s * 1.0); ctx.closePath(); ctx.fill();
      }
    }

    // cuerpo
    ctx.fillStyle = mareado ? '#c9d3e3' : sk.cuerpo;
    rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.fill();
    ctx.save(); ctx.clip();
    if (sk.extra === 'semillas' && !mareado) {
      ctx.fillStyle = '#2fb36b'; ctx.fillRect(-s / 2, -s * 0.17, s, s * 0.17);
      ctx.fillStyle = '#9fe8b9'; ctx.fillRect(-s / 2, -s * 0.2, s, s * 0.04);
      ctx.fillStyle = INK;
      for (const [px, py, a] of [[-0.3, -0.3, 0.4], [0.3, -0.32, -0.4], [0, -0.26, 0], [-0.36, -0.75, 0.2], [0.38, -0.78, -0.2]]) {
        ctx.beginPath(); ctx.ellipse(px * s, py * s, s * 0.025, s * 0.045, a, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (sk.extra === 'estrellitas' && !mareado) {
      ctx.fillStyle = '#ffe14d';
      for (const [px, py, k] of [[-0.32, -0.25, 0], [0.3, -0.82, 1], [0.34, -0.22, 2], [-0.36, -0.82, 3]]) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300 + k * 1.7);
        estrella(ctx, px * s, py * s, s * 0.06); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(ctx, -s * 0.36, -s * 0.9, s * 0.72, s * 0.12, s * 0.06); ctx.fill();

    // cara
    const ex = s * 0.2, ey = -s * 0.56, look = mirar * s * 0.06, ojo = sk.ojo || INK;
    ctx.fillStyle = ojo; ctx.strokeStyle = ojo;
    if (mareado) {
      ctx.lineWidth = Math.max(2, s * 0.065);
      for (const side of [-1, 1]) {
        const x0 = side * ex, d = s * 0.08;
        ctx.beginPath(); ctx.moveTo(x0 - d, ey - d); ctx.lineTo(x0 + d, ey + d);
        ctx.moveTo(x0 + d, ey - d); ctx.lineTo(x0 - d, ey + d); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, -s * 0.26, s * 0.08, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      for (const side of [-1, 1]) {
        if (sk.ojos === 'cuadrados') { rr(ctx, side * ex + look - s * 0.07, ey - s * 0.08, s * 0.14, s * 0.14, s * 0.02); ctx.fill(); }
        else { rr(ctx, side * ex + look - s * 0.06, ey - s * 0.1, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
      }
      if (!sk.sinCachetes) {
        ctx.fillStyle = 'rgba(255,93,125,.55)';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.3 + look, -s * 0.3, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = ojo; ctx.lineWidth = Math.max(2, s * 0.056);
      if (sk.ojos === 'cuadrados') {
        ctx.beginPath(); ctx.moveTo(look - s * 0.12, -s * 0.28); ctx.lineTo(look + s * 0.12, -s * 0.28); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(look, -s * 0.34, s * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
    }

    // accesorios
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    if (sk.extra === 'gorra') {
      const lado = mirar < 0 ? -1 : 1;
      ctx.fillStyle = sk.color2;
      rr(ctx, lado > 0 ? s * 0.02 : -s * 0.6, -s * 1.04, s * 0.58, s * 0.12, s * 0.06); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.98, s * 0.4, s * 0.26, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(0, -s * 1.22, s * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (sk.extra === 'antena') {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, -s * 1.32); ctx.stroke();
      ctx.fillStyle = Math.sin(t / 250) > 0 ? '#ff5d7d' : '#ffb3c2';
      ctx.beginPath(); ctx.arc(0, -s * 1.36, s * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (sk.extra === 'auriculares') {
      ctx.lineWidth = Math.max(3, s * 0.1); ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.6, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.lineWidth = lw; ctx.fillStyle = sk.color2;
      for (const side of [-1, 1]) { rr(ctx, side * s * 0.6 - s * 0.11, -s * 0.74, s * 0.22, s * 0.36, s * 0.08); ctx.fill(); ctx.stroke(); }
    } else if (sk.extra === 'casco') {
      ctx.fillStyle = 'rgba(170,215,255,.22)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath(); ctx.arc(0, -s * 0.52, s * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath(); ctx.arc(0, -s * 0.52, s * 0.62, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
    } else if (sk.extra === 'corona') {
      ctx.fillStyle = sk.color2;
      ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.97); ctx.lineTo(-s * 0.36, -s * 1.32); ctx.lineTo(-s * 0.16, -s * 1.14);
      ctx.lineTo(0, -s * 1.4); ctx.lineTo(s * 0.16, -s * 1.14); ctx.lineTo(s * 0.36, -s * 1.32); ctx.lineTo(s * 0.32, -s * 0.97);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5d7d'; ctx.beginPath(); ctx.arc(0, -s * 1.1, s * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (sk.extra === 'brillos') {
      ctx.fillStyle = '#fffaf0';
      for (const [px, py, k] of [[-0.62, -1.0, 0], [0.6, -0.7, 1], [0.5, -1.18, 2]]) {
        const a = 0.5 + 0.5 * Math.sin(t / 220 + k * 2.1);
        ctx.globalAlpha = a; estrella(ctx, px * s, py * s, s * (0.06 + 0.06 * a), 4); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (mareado) {
      for (let k = 0; k < 3; k++) {
        const a = t / 110 + k * (Math.PI * 2 / 3);
        const sx = x + Math.cos(a) * s * 0.55, sy = pie - s * 1.18 + Math.sin(a) * s * 0.16;
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        estrella(ctx, sx, sy, s * 0.14); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ---------- cartel de nivel ----------
  function cartel(nivel, nuevas) {
    if (!document.body) return;
    let el = document.getElementById('cc-nivel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cc-nivel'; el.setAttribute('role', 'status');
      Object.assign(el.style, {
        position: 'fixed', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 84px)', zIndex: '9999',
        transform: 'translateX(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '12px',
        background: '#fffaf0', color: INK, border: '3px solid ' + INK, borderRadius: '16px',
        boxShadow: '0 6px 0 ' + INK, padding: '10px 16px', maxWidth: 'calc(100vw - 32px)',
        fontFamily: '"Rubik", system-ui, sans-serif', opacity: '0',
      });
      document.body.appendChild(el);
    }
    const nueva = nuevas[nuevas.length - 1];
    el.innerHTML = (nueva ? '<canvas width="96" height="104" style="width:48px;height:52px;flex:none"></canvas>' : '') +
      `<div><div style="font-family:'Lilita One','Trebuchet MS',sans-serif;font-size:24px;line-height:1">¡Nivel ${nivel}!</div>` +
      (nueva ? `<div style="font-size:13px;font-weight:600;margin-top:4px">Nuevo personaje: ${nuevas.map(s => s.nombre).join(', ')}</div>` : '') + '</div>';
    const cv = el.querySelector('canvas');
    if (cv) { const c = cv.getContext('2d'); c.scale(2, 2); dibujarCubo(c, 24, 46, 28, { skin: nueva, t: 0 }); }
    if (el.animate) {
      el.animate([
        { opacity: 0, transform: 'translateX(-50%) translateY(-12px) scale(.9)' },
        { opacity: 1, transform: 'translateX(-50%)', offset: 0.1 },
        { opacity: 1, transform: 'translateX(-50%)', offset: 0.85 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-8px)' },
      ], { duration: 3000, easing: 'ease', fill: 'forwards' });
    } else { el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 3000); }
  }

  window.CuboComun = { SKINS, xpPara, nivelDe, perfil, skin, elegirSkin, sumarXP, anotarRecord, volver, dibujarCubo };
})();
