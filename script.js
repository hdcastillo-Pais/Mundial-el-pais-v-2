/* ============================================================
   MARCADOR DEPORTIVO — MUNDIAL 2026
   script.js — Versión 9.2
   Arquitectura: JSON Estático en CDN + Polling Pasivo (sin Firebase)

   CORRECCIÓN v9.1:
   - DATA_URL actualizada: apunta al repositorio de GitHub Pages
     configurado para este despliegue. Actualiza REPO_OWNER y
     REPO_NAME si cambias de repositorio.
   - La fase activa por defecto en la Llave ahora es "DIECISEISAVOS"
     (sincronizado con la eliminación de "PLAY-IN" en el HTML).

   CORRECCIÓN v9.2:
   - Soporte para prórroga y penales en fases eliminatorias.
   - Marcador con formato estándar: 1 (4) – (3) 1 cuando hay penales.
   - Indicador visual del equipo que avanza por penales.
   - getRecentForm corregido: penales cuentan como victoria/derrota.
   ============================================================ */

/* ============================================================
   1. CONFIGURACIÓN
   ============================================================ */

/**
 * URL del archivo data.json servido por GitHub Pages (CDN gratuito).
 * Formato: https://<REPO_OWNER>.github.io/<REPO_NAME>/data.json
 *
 * ⚠️  ACTUALIZA estos dos valores con los datos reales de tu repo:
 */
const REPO_OWNER = 'hdcastillo-Pais';       // ← Cambia esto
const REPO_NAME  = 'Mundial-el-pais-v-2';     // ← Cambia esto

const DATA_URL      = `https://${REPO_OWNER}.github.io/${REPO_NAME}/data.json`;
const POLL_INTERVAL = 45000; // ms — 45 segundos entre consultas
const SCROLL_STEP   = 268;

/* ── Estado global de la aplicación ── */
let initialScrollDone = false;
let allMatches        = [];
let standingsData     = {};
let activeGroup       = null;
let activePhase       = null;
let teamHubTeam       = null;
let pollTimer         = null; // Referencia al setInterval activo

/* ============================================================
   2. REFERENCIAS AL DOM
   ============================================================ */
const track         = document.getElementById('carousel-track');
const bracketTrack  = document.getElementById('bracket-track');
const groupPillsEl  = document.getElementById('group-pills');
const standingsCont = document.getElementById('standings-container');
const teamHub       = document.getElementById('team-hub');
const teamHubInner  = document.getElementById('team-hub-inner');
const teamHubClose  = document.getElementById('team-hub-close');

/* ============================================================
   3. CARGA DE DATOS (FETCH + CACHE-BUSTING)
   ============================================================ */

/**
 * Descarga el JSON estático desde GitHub Pages.
 * Añade ?t=timestamp para evitar lecturas cacheadas por el navegador.
 * Actualiza el estado global y re-renderiza la pestaña activa.
 */
async function cargarDatosMundial() {
  const url = `${DATA_URL}?t=${Date.now()}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.matches) {
      renderError('Sin datos disponibles. Ejecuta la primera sincronización desde el panel de control.', track);
      return;
    }

    /* Actualizar caché global */
    allMatches    = Object.values(data.matches).sort((a, b) =>
      extractMatchNumber(a.id) - extractMatchNumber(b.id)
    );
    standingsData = data.standings || {};

    /* Renderizar pestaña activa */
    const activeTab = document.querySelector('.tab-btn.active');
    const tabName   = activeTab ? activeTab.dataset.tab : 'marcador';

    if (tabName === 'marcador')   { renderMatches(allMatches); updateHeader(allMatches); }
    if (tabName === 'posiciones') { renderGroupPills(); if (activeGroup) renderStandings(activeGroup); }
    if (tabName === 'llave')      { if (activePhase) renderBracket(activePhase); }

    /* Auto-scroll solo en la primera carga */
    if (!initialScrollDone && tabName === 'marcador') {
      initialScrollDone = true;
      setTimeout(() => autoScrollToRelevantMatch(allMatches), 120);
    }

  } catch (err) {
    console.error('[Marcador] Error al cargar datos:', err);
    /* Solo mostrar error si el carrusel está vacío (no sobreescribir datos buenos) */
    if (!allMatches.length) {
      renderError('Error de conexión. Reintentando en 45 segundos…', track);
    }
  }
}

/* ============================================================
   4. CICLO DE POLLING PASIVO (con Page Visibility API)
   ============================================================ */

/** Inicia el intervalo de polling */
function startPolling() {
  if (pollTimer) return; // Ya está activo
  pollTimer = setInterval(cargarDatosMundial, POLL_INTERVAL);
}

/** Detiene el intervalo para no consumir datos en segundo plano */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Pausa el polling cuando el usuario cambia de pestaña o minimiza la ventana.
 * Lo reactiva (con recarga inmediata) cuando el usuario vuelve.
 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    cargarDatosMundial(); // Recarga inmediata al volver
    startPolling();
  } else {
    stopPolling();
  }
});

/* ── Carga inicial y arranque del ciclo ── */
cargarDatosMundial();
startPolling();

/* ============================================================
   5. SISTEMA DE PESTAÑAS
   ============================================================ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === tabName;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach(p => {
    const isActive = p.id === `panel-${tabName}`;
    p.hidden = !isActive;
    p.classList.toggle('active', isActive);
  });

  closeTeamHub();

  if (tabName === 'marcador') {
    renderMatches(allMatches);
    if (!initialScrollDone && allMatches.length) {
      initialScrollDone = true;
      setTimeout(() => autoScrollToRelevantMatch(allMatches), 120);
    }
  }

  if (tabName === 'posiciones') {
    renderGroupPills();
    if (activeGroup && standingsData[activeGroup]) {
      renderStandings(activeGroup);
    } else {
      const firstGroup = Object.keys(standingsData).sort()[0];
      if (firstGroup) { activeGroup = firstGroup; renderGroupPills(); renderStandings(firstGroup); }
    }
  }

  if (tabName === 'llave') {
    const firstActivePill = document.querySelector('.phase-pill.active');
    const phase = firstActivePill ? firstActivePill.dataset.phase : null;
    if (phase) renderBracket(phase);
  }
}

/* ============================================================
   6. NAVEGACIÓN DEL CARRUSEL (drag)
   ============================================================ */
[track, bracketTrack].forEach(t => {
  if (!t) return;

  let isDown = false, startX, scrollLeft;

  t.addEventListener('mousedown', e => {
    isDown = true; startX = e.pageX - t.offsetLeft; scrollLeft = t.scrollLeft;
  });
  t.addEventListener('mouseleave', () => { isDown = false; });
  t.addEventListener('mouseup',    () => { isDown = false; });
  t.addEventListener('mousemove',  e => {
    if (!isDown) return;
    e.preventDefault();
    t.scrollLeft = scrollLeft - (e.pageX - t.offsetLeft - startX) * 1.5;
  });
  t.addEventListener('touchstart', e => {
    startX = e.touches[0].pageX - t.offsetLeft; scrollLeft = t.scrollLeft;
  }, { passive: true });
  t.addEventListener('touchmove', e => {
    t.scrollLeft = scrollLeft - (e.touches[0].pageX - t.offsetLeft - startX) * 1.5;
  }, { passive: true });
});

/* ============================================================
   7. AUTO-SCROLL INTELIGENTE
   ============================================================ */
function autoScrollToRelevantMatch(matches) {
  let targetIndex = matches.findIndex(m => getStatusType(m.estado) === 'live');

  if (targetIndex === -1) {
    const now = Date.now();
    targetIndex = matches.findIndex(m =>
      getStatusType(m.estado) === 'scheduled' && m.timestamp > now
    );
    if (targetIndex === -1) {
      targetIndex = matches.findLastIndex(m => getStatusType(m.estado) === 'scheduled');
    }
  }

  if (targetIndex > 0) {
    const cardW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-w'), 10) || 256;
    const gap   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-gap'), 10) || 12;
    track.scrollTo({ left: targetIndex * (cardW + gap) + 14, behavior: 'smooth' });
  }
}

/* ============================================================
   8. ACTUALIZACIÓN DEL HEADER
   ============================================================ */
function updateHeader(matches) {
  const headerTitle = document.getElementById('header-title');
  const headerSub   = document.getElementById('header-subtitle');
  if (!matches.length) return;

  const liveCount  = matches.filter(m => getStatusType(m.estado) === 'live').length;
  const finalCount = matches.filter(m => getStatusType(m.estado) === 'final').length;

  if (headerTitle) headerTitle.textContent = 'Mundial 2026';
  if (headerSub) {
    if (liveCount > 0) {
      headerSub.textContent = `${liveCount} EN VIVO`;
      headerSub.style.color = 'var(--live-green)';
    } else if (finalCount === matches.length) {
      headerSub.textContent = 'Torneo finalizado';
      headerSub.style.color = '';
    } else {
      headerSub.textContent = `${matches.length} partidos`;
      headerSub.style.color = '';
    }
  }
}

/* ============================================================
   9. RENDERIZADO DEL CARRUSEL
   ============================================================ */
function renderMatches(matches) {
  if (!matches.length) { renderEmpty(track); return; }

  const prevScroll = track.scrollLeft;
  track.innerHTML  = '';
  const frag = document.createDocumentFragment();
  matches.forEach(match => frag.appendChild(createCard(match)));
  track.appendChild(frag);
  if (prevScroll > 0) track.scrollLeft = prevScroll;
}

/* ============================================================
   10. CONSTRUCCIÓN DE TARJETAS
   ============================================================ */
function createCard(match) {
  const { id, fase, estado, grupo, fecha, hora, local, visitante } = match;

  const statusInfo = buildStatusInfo(estado);
  const isTBD      = isTeamTBD(local.nombre) && isTeamTBD(visitante.nombre);

  const article = document.createElement('article');
  article.className = `match-card ${statusInfo.cardClass}${isTBD ? ' is-tbd' : ''}`;
  article.setAttribute('role', 'listitem');
  article.setAttribute('data-match-id', id || '');

  const metaDiv     = document.createElement('div');
  metaDiv.className = 'card-meta';
  const statusSpan  = document.createElement('span');
  statusSpan.className = `card-status ${statusInfo.cssClass}`;
  statusSpan.setAttribute('aria-live', 'polite');
  statusSpan.innerHTML = statusInfo.html;
  metaDiv.appendChild(statusSpan);
  article.appendChild(metaDiv);

  if (fase) {
    const phaseP    = document.createElement('p');
    phaseP.className = 'card-phase';
    const upperFase  = fase.toUpperCase();
    if (upperFase.includes('FASE DE GRUPOS') && grupo && grupo !== 'X' && grupo !== '') {
      phaseP.textContent = `GRUPO ${String(grupo).toUpperCase()}`;
    } else {
      phaseP.textContent = fase;
      if (grupo && grupo !== 'X' && grupo !== '') {
        const groupSpan     = document.createElement('span');
        groupSpan.className = 'card-group';
        groupSpan.textContent = ` Grupo ${grupo}`;
        phaseP.appendChild(groupSpan);
      }
    }
    article.appendChild(phaseP);
  }

  if (statusInfo.type === 'scheduled' && fecha) {
    const dtP     = document.createElement('p');
    dtP.className = 'card-datetime';
    dtP.textContent = formatMatchDateTime(fecha, hora);
    article.appendChild(dtP);
  }

  const divider     = document.createElement('div');
  divider.className = 'card-divider';
  article.appendChild(divider);

  article.appendChild(buildTeamRow(local,     statusInfo.type, match));
  article.appendChild(buildTeamRow(visitante, statusInfo.type, match));

  /* Etiqueta "Penales" si el partido fue definido por penales */
  if (matchHasPenales(match) && statusInfo.type === 'final') {
    const penTag     = document.createElement('p');
    penTag.className = 'card-penalty-tag';
    penTag.textContent = 'Definido por penales';
    article.appendChild(penTag);
  }

  return article;
}

function buildTeamRow(team, matchType, match) {
  const row     = document.createElement('div');
  row.className = 'team-row';

  const isTBD = isTeamTBD(team.nombre);
  const crest = buildCrest(team, isTBD);

  if (!isTBD) {
    crest.classList.add('clickable');
    crest.setAttribute('role', 'button');
    crest.setAttribute('tabindex', '0');
    crest.setAttribute('aria-label', `Ver estadísticas de ${team.nombre}`);
    crest.addEventListener('click', e => { e.stopPropagation(); openTeamHub(team, match); });
    crest.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTeamHub(team, match); }
    });
  }

  row.appendChild(crest);

  const nameSpan     = document.createElement('span');
  nameSpan.className = `team-name${isTBD ? ' is-tbd' : ''}`;
  nameSpan.textContent = team.nombre || 'Por Asignar';
  row.appendChild(nameSpan);

  /* ── Marcador con soporte de penales ── */
  const isLocal   = !isTBD && match.local && team.nombre === match.local.nombre;
  const hasPen    = matchHasPenales(match) && matchType === 'final';

  let scoreText, scoreEmpty;

  if (hasPen && team.goles !== null && team.goles !== undefined) {
    /* Formato estándar de penales:
         Local:     "1 (4)"   → goles regulares + (penales marcados)
         Visitante: "(3) 1"   → (penales marcados) + goles regulares   */
    const penEquipo = isLocal ? match.penales.local : match.penales.visitante;
    scoreText  = isLocal
      ? `${team.goles} (${penEquipo})`
      : `(${penEquipo}) ${team.goles}`;
    scoreEmpty = false;
  } else {
    const result = formatScore(team.goles, matchType);
    scoreText  = result.text;
    scoreEmpty = result.empty;
  }

  const scoreSpan     = document.createElement('span');
  scoreSpan.className = scoreEmpty ? 'team-score empty' : 'team-score';
  if (hasPen) scoreSpan.classList.add('score-penales');
  scoreSpan.textContent = scoreText;
  row.appendChild(scoreSpan);

  /* ── Indicador de clasificación cuando se define por penales ── */
  if (hasPen && !isTBD) {
    const penL   = match.penales.local;
    const penV   = match.penales.visitante;
    const avanza = (isLocal && penL > penV) || (!isLocal && penV > penL);

    if (avanza) {
      const advSpan     = document.createElement('span');
      advSpan.className = 'team-advances';
      advSpan.setAttribute('title', 'Avanza a la siguiente ronda');
      advSpan.setAttribute('aria-label', 'Avanza');
      advSpan.textContent = '▶';
      row.appendChild(advSpan);
    }
  }

  return row;
}

/**
 * Devuelve true si el partido tiene datos de penales completos.
 * Se usa tanto en la tarjeta como en getRecentForm.
 */
function matchHasPenales(match) {
  return (
    match.penales &&
    match.penales.local     !== null && match.penales.local     !== undefined &&
    match.penales.visitante !== null && match.penales.visitante !== undefined
  );
}

function buildCrest(team, isTBD) {
  const wrapper     = document.createElement('div');
  wrapper.className = 'team-crest';

  if (isTBD) {
    const tbd     = document.createElement('div');
    tbd.className = 'crest-tbd';
    tbd.setAttribute('aria-hidden', 'true');
    tbd.textContent = '?';
    wrapper.appendChild(tbd);
    return wrapper;
  }

  const flagUrl = buildFlagUrl(team);
  if (flagUrl) {
    const img   = document.createElement('img');
    img.src     = flagUrl;
    img.alt     = team.nombre || '';
    img.loading = 'lazy';
    img.width   = 30;
    img.height  = 22;
    img.addEventListener('error', function handler() {
      img.removeEventListener('error', handler);
      wrapper.innerHTML = '';
      wrapper.appendChild(buildFallbackCrest(team));
    });
    wrapper.appendChild(img);
    return wrapper;
  }

  wrapper.appendChild(buildFallbackCrest(team));
  return wrapper;
}

function buildFlagUrl(team) {
  if (team.urlFlag && team.urlFlag.startsWith('http')) return team.urlFlag;
  if (team.codeIso && /^[A-Za-z]{2}$/.test(team.codeIso)) {
    return `https://flagcdn.com/w40/${team.codeIso.toLowerCase()}.png`;
  }
  return null;
}

function buildFallbackCrest(team) {
  const label = team.codeFifa
    ? team.codeFifa.substring(0, 3).toUpperCase()
    : (team.nombre || '??').substring(0, 3).toUpperCase();
  const box     = document.createElement('div');
  box.className = 'crest-fallback';
  box.setAttribute('aria-hidden', 'true');
  box.textContent = label;
  return box;
}

/* ============================================================
   11. TEAM HUB — ACORDEÓN
   ============================================================ */
function openTeamHub(team, match) {
  if (teamHubTeam === team.nombre && teamHub.classList.contains('open')) {
    closeTeamHub(); return;
  }
  teamHubTeam = team.nombre;

  const teamStats  = getTeamStatsFromStandings(team.nombre);
  const recentForm = getRecentForm(team.nombre, 3);

  teamHubInner.innerHTML = '';

  const header    = document.createElement('div');
  header.className = 'hub-header';

  const flagUrl = buildFlagUrl(team);
  if (flagUrl) {
    const img     = document.createElement('img');
    img.src       = flagUrl;
    img.alt       = team.nombre;
    img.className = 'hub-flag';
    img.width     = 36;
    img.height    = 26;
    header.appendChild(img);
  }

  const nameEl     = document.createElement('span');
  nameEl.className = 'hub-team-name';
  nameEl.textContent = team.nombre;
  header.appendChild(nameEl);
  teamHubInner.appendChild(header);

  const statsGrid     = document.createElement('div');
  statsGrid.className = 'hub-stats-grid';

  [
    { label: 'PJ', value: teamStats.pj },
    { label: 'PG', value: teamStats.pg },
    { label: 'PE', value: teamStats.pe },
    { label: 'PP', value: teamStats.pp },
    { label: 'GF', value: teamStats.gf },
    { label: 'DG', value: teamStats.dg >= 0 ? `+${teamStats.dg}` : String(teamStats.dg) }
  ].forEach(item => {
    const cell     = document.createElement('div');
    cell.className = 'hub-stat';
    cell.innerHTML = `<span class="hub-stat-label">${item.label}</span><span class="hub-stat-value">${item.value}</span>`;
    statsGrid.appendChild(cell);
  });
  teamHubInner.appendChild(statsGrid);

  const formLabel     = document.createElement('p');
  formLabel.className = 'hub-form-label';
  formLabel.textContent = 'Forma reciente';
  teamHubInner.appendChild(formLabel);

  const formDots     = document.createElement('div');
  formDots.className = 'hub-form-dots';

  recentForm.forEach(result => {
    const dot      = document.createElement('div');
    const classMap = { win: 'win', draw: 'draw', loss: 'loss', none: 'none' };
    const textMap  = { win: 'G', draw: 'E', loss: 'P', none: '–' };
    dot.className  = `form-dot ${classMap[result] || 'none'}`;
    dot.textContent = textMap[result] || '–';
    dot.title      = { win: 'Ganado', draw: 'Empatado', loss: 'Perdido', none: 'Sin dato' }[result] || '';
    formDots.appendChild(dot);
  });
  teamHubInner.appendChild(formDots);

  teamHub.classList.add('open');
  teamHub.setAttribute('aria-expanded', 'true');
}

function closeTeamHub() {
  teamHubTeam = null;
  teamHub.classList.remove('open');
  teamHub.setAttribute('aria-expanded', 'false');
}

teamHubClose.addEventListener('click', closeTeamHub);

function getTeamStatsFromStandings(nombre) {
  const defaults = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
  for (const group of Object.values(standingsData)) {
    const found = group.find(t => t.nombre === nombre);
    if (found) return found;
  }
  return defaults;
}

/**
 * Devuelve los últimos n resultados de un equipo.
 * Los penales se cuentan como victoria/derrota (no empate),
 * reflejando correctamente la eliminación en fase de llaves.
 */
function getRecentForm(nombre, n) {
  const finished = allMatches
    .filter(m => {
      const st = getStatusType(m.estado);
      return st === 'final' &&
             (m.local.nombre === nombre || m.visitante.nombre === nombre) &&
             m.local.goles !== null && m.visitante.goles !== null;
    })
    .slice(-n);

  const results = finished.map(m => {
    const isLocal = m.local.nombre === nombre;
    const gF = extractNumericGoalsFE(isLocal ? m.local.goles     : m.visitante.goles);
    const gC = extractNumericGoalsFE(isLocal ? m.visitante.goles : m.local.goles);
    if (gF === null || gC === null) return 'none';
    if (gF > gC) return 'win';
    if (gF < gC) return 'loss';

    /* Empate en tiempo reglamentario/prórroga: resolver por penales si los hay */
    if (matchHasPenales(m)) {
      const penF = isLocal ? m.penales.local : m.penales.visitante;
      const penC = isLocal ? m.penales.visitante : m.penales.local;
      if (penF > penC) return 'win';
      if (penF < penC) return 'loss';
    }

    return 'draw';
  });

  while (results.length < n) results.unshift('none');
  return results;
}

function extractNumericGoalsFE(val) {
  if (val === null || val === undefined) return null;
  const m = String(val).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/* ============================================================
   12. POSICIONES
   ============================================================ */
function renderGroupPills() {
  groupPillsEl.innerHTML = '';

  const groups = Object.keys(standingsData).sort();
  if (!groups.length) {
    groupPillsEl.innerHTML = '<p style="color:var(--text-muted);font-size:11px;padding:4px 0">Sin datos de posiciones aún.</p>';
    return;
  }

  if (!activeGroup || !standingsData[activeGroup]) activeGroup = groups[0];

  groups.forEach(g => {
    const btn     = document.createElement('button');
    btn.className = `group-pill${g === activeGroup ? ' active' : ''}`;
    btn.textContent = `Grupo ${g}`;
    btn.dataset.group = g;
    btn.addEventListener('click', () => {
      activeGroup = g;
      document.querySelectorAll('.group-pill').forEach(p => p.classList.toggle('active', p.dataset.group === g));
      renderStandings(g);
    });
    groupPillsEl.appendChild(btn);
  });
}

function renderStandings(group) {
  const rows = standingsData[group];

  if (!rows || !rows.length) {
    standingsCont.innerHTML = `<div class="state-screen"><p>No hay datos para el Grupo ${group}.</p></div>`;
    return;
  }

  const table = document.createElement('table');
  table.className = 'standings-table';
  table.setAttribute('aria-label', `Posiciones Grupo ${group}`);

  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left">Equipo</th>
        <th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>DG</th><th>Pts</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  rows.forEach((team, idx) => {
    const tr = document.createElement('tr');
    if (idx < 2) tr.classList.add('classified');

    const flagUrl = buildFlagUrl(team);
    const flagImg = flagUrl
      ? `<img src="${flagUrl}" alt="" class="standings-flag" width="20" height="14" loading="lazy" onerror="this.style.display='none'">`
      : '';

    const dgFormatted = team.dg > 0 ? `+${team.dg}` : String(team.dg);

    tr.innerHTML = `
      <td class="standings-pos">${idx + 1}</td>
      <td><div class="team-cell">${flagImg}<span class="standings-team-name">${escapeHTML(team.nombre)}</span></div></td>
      <td>${team.pj}</td><td>${team.pg}</td><td>${team.pe}</td><td>${team.pp}</td>
      <td>${dgFormatted}</td>
      <td class="standings-pts">${team.pts}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  standingsCont.innerHTML = '';
  standingsCont.appendChild(table);
}

/* ============================================================
   13. LLAVE ELIMINATORIA
   ============================================================ */
document.querySelectorAll('.phase-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.phase-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activePhase = pill.dataset.phase;
    renderBracket(activePhase);
  });
});

(function initDefaultPhase() {
  const firstPill = document.querySelector('.phase-pill.active');
  if (firstPill) activePhase = firstPill.dataset.phase;
})();

function renderBracket(phase) {
  if (!allMatches.length) {
    bracketTrack.innerHTML = `<div class="state-screen"><p>Cargando datos…</p></div>`;
    return;
  }

  const phaseUpper   = phase.toUpperCase();
  const phaseMatches = allMatches.filter(m =>
    String(m.fase || '').toUpperCase().includes(phaseUpper)
  );

  if (!phaseMatches.length) {
    bracketTrack.innerHTML = `<div class="state-screen"><p>No hay partidos de ${phase} disponibles aún.</p></div>`;
    return;
  }

  const prevScroll = bracketTrack.scrollLeft;
  bracketTrack.innerHTML = '';
  const frag = document.createDocumentFragment();
  phaseMatches.forEach(m => frag.appendChild(createCard(m)));
  bracketTrack.appendChild(frag);
  if (prevScroll > 0) bracketTrack.scrollLeft = prevScroll;
}

/* ============================================================
   14. LÓGICA DE ESTADO
   ============================================================ */
function buildStatusInfo(estado) {
  const type = getStatusType(estado);

  const STATUS_MAP = {
    live:      { type: 'live',      cardClass: 'is-live',      cssClass: 'status-live',
                 html: '<span class="live-dot" aria-hidden="true"></span>EN VIVO' },
    final:     { type: 'final',     cardClass: 'is-final',     cssClass: 'status-final',     html: 'Finalizado' },
    suspended: { type: 'suspended', cardClass: 'is-suspended', cssClass: 'status-suspended', html: 'Suspendido' },
    cancelled: { type: 'cancelled', cardClass: 'is-cancelled', cssClass: 'status-cancelled', html: 'Cancelado'  },
    scheduled: { type: 'scheduled', cardClass: '',             cssClass: 'status-scheduled', html: 'Programado' }
  };

  return STATUS_MAP[type] || STATUS_MAP.scheduled;
}

function getStatusType(estado) {
  const upper = String(estado || '').trim().toUpperCase();
  if (upper === 'EN JUEGO' || upper === 'EN VIVO' || upper === 'LIVE' || /\d+['′]/.test(estado)) return 'live';
  if (upper === 'FINALIZADO' || upper === 'FINAL' || upper === 'FT')                              return 'final';
  if (upper === 'SUSPENDIDO' || upper === 'SUSPENDED')                                            return 'suspended';
  if (upper === 'CANCELADO'  || upper === 'CANCELLED' || upper === 'CANCELED')                   return 'cancelled';
  return 'scheduled';
}

/* ============================================================
   15. UTILIDADES PURAS
   ============================================================ */
function formatScore(goles, matchType) {
  if (goles === null || goles === undefined) {
    if (matchType === 'scheduled') return { text: '', empty: true };
    return { text: '–', empty: true };
  }
  return { text: String(goles), empty: false };
}

function cleanHora(hora) {
  let hStr = String(hora || '').trim();
  if (!hStr) return '';
  const match = hStr.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return hStr.replace(/\s*hrs\.?/i, '').trim();
}

function formatMatchDateTime(fechaISO, hora) {
  if (!fechaISO) return hora ? cleanHora(hora) : '';
  try {
    if (String(fechaISO).includes('1899')) return cleanHora(hora) || '';
    let date;
    if (String(fechaISO).includes('-')) {
      const [y, m, d] = fechaISO.split('-').map(Number);
      date = new Date(Date.UTC(y, m - 1, d));
    } else {
      date = new Date(fechaISO);
    }
    if (isNaN(date.getTime())) return cleanHora(hora) || fechaISO;
    const DAYS   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const horaClean = cleanHora(hora);
    return horaClean
      ? `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} · ${horaClean}`
      : `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  } catch (_) {
    return cleanHora(hora) || fechaISO;
  }
}

function extractMatchNumber(matchId) {
  const m = String(matchId || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function isTeamTBD(nombre) {
  const n = String(nombre || '').trim().toUpperCase();
  return !n || n === 'POR ASIGNAR' || n === 'TBD';
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   16. PANTALLAS DE ESTADO
   ============================================================ */
function renderError(message, container) {
  if (!container) return;
  if (container.querySelector('.match-card')) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'state-screen';
  div.setAttribute('role', 'alert');
  const p = document.createElement('p');
  p.textContent = message || 'Error de conexión. Reintentando…';
  div.appendChild(p);
  container.appendChild(div);
}

function renderEmpty(container) {
  if (!container) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'state-screen';
  div.setAttribute('role', 'status');
  const p = document.createElement('p');
  p.textContent = 'No hay partidos disponibles aún.';
  div.appendChild(p);
  container.appendChild(div);
}
