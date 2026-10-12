// V1.1





/**
 * js/EvoCards.js  —  Evo chain cards injected as standalone grid items
 *
 * When "Show Evo Chains" is toggled on, each eligible card gets its full
 * evo-chain result cards inserted directly after it in #card-container.
 * They look and behave identically to normal cards — same grid cell size,
 * same badges, same fatal stats — with only a small chain-label badge
 * overlaid in the top-left corner to identify them.
 *
 * Toggle off removes all injected evo cards and restores the original grid.
 */

import { nationIdToName } from './Mappings.js';

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let allEvos = [];
const chainCache = new WeakMap();
let uniqueEvosCache = null; // computed once per allEvos load, not per-player

function getUniqueEvos() {
  if (uniqueEvosCache) return uniqueEvosCache;
  const seen = new Set();
  uniqueEvosCache = allEvos.filter(e => { if (seen.has(e.name)) return false; seen.add(e.name); return true; });
  return uniqueEvosCache;
}

// ── Social post download registry ──────────────────────────
// Keyed by a unique id stamped onto each injected evo entry
// (field `_evoPostId`) so Card.js's three-dot menu can trigger
// the right post download without needing to know chain internals.
const _evoPostRegistry = new Map();
let _evoPostIdCounter   = 0;

// ─────────────────────────────────────────────
// Evo requirement / upgrade logic  (unchanged)
// ─────────────────────────────────────────────
// Position groups used by evo requirements
const EVO_POSITION_GROUPS = {
  DEFENDERS:   ['LB', 'CB', 'RB'],
  MIDFIELDERS: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATTACKERS:   ['LW', 'ST', 'RW'],
};
// Singular forms point to the same lists
EVO_POSITION_GROUPS.DEFENDER   = EVO_POSITION_GROUPS.DEFENDERS;
EVO_POSITION_GROUPS.MIDFIELDER = EVO_POSITION_GROUPS.MIDFIELDERS;
EVO_POSITION_GROUPS.ATTACKER   = EVO_POSITION_GROUPS.ATTACKERS;

const _reqParseCache = new Map();
function parseRequirement(req) {
  let parsed = _reqParseCache.get(req);
  if (parsed) return parsed;
  const [type, val] = req.split(',');
  if (val && val.includes('-')) {
    const [lo, hi] = val.split('-').map(Number);
    parsed = { type, val, lo, hi };
  } else {
    parsed = { type, val, lo: 0, hi: 0 };
  }
  _reqParseCache.set(req, parsed);
  return parsed;
}
function meetsRequirement(req, card) {
  const { type, val, lo, hi } = parseRequirement(req);
  const rangeCheck = v => { const n = parseInt(v); return n >= lo && n <= hi; };
  const isGK = (card.position || '').toUpperCase() === 'GK';
  switch (type) {
    case 'nation':   return String(card.nationId)  === val;
    case 'league':   return String(card.leagueId)  === val;
    case 'club':     return String(card.clubId)    === val;
    case 'color': {
      const c = (card.color || '').toLowerCase(), r = val.toLowerCase();
      const aliases = {
        all_silver: ['silver','rare_silver'],
        all_gold:   ['gold','rare_gold'],
        all_bronze: ['bronze','rare_bronze'],
      };
      if (r === 'all_special') {
        const base = ['gold','rare_gold','silver','rare_silver','bronze','rare_bronze'];
        return !base.includes(c);
      }
      return aliases[r] ? aliases[r].includes(c) : c === r;
    }
    case 'position': {
      const pos = (card.position || '').toUpperCase();
      const want = (val || '').toUpperCase();
      const group = EVO_POSITION_GROUPS[want];
      return group ? group.includes(pos) : pos === want;
    }
    // Group written as the key itself, e.g. "defenders,1"
    case 'defenders':   return EVO_POSITION_GROUPS.DEFENDERS.includes((card.position || '').toUpperCase());
    case 'midfielders': return EVO_POSITION_GROUPS.MIDFIELDERS.includes((card.position || '').toUpperCase());
    case 'attackers':   return EVO_POSITION_GROUPS.ATTACKERS.includes((card.position || '').toUpperCase());
    case 'rating':   return rangeCheck(card.rating);
    case 'attack':   return rangeCheck(card.attack);
    case 'control':  return rangeCheck(card.control);
    case 'defense':  return rangeCheck(card.defense);
    case 'PAC': return isGK ? false : rangeCheck(card.PAC);
    case 'SHO': return isGK ? false : rangeCheck(card.SHO);
    case 'PAS': return isGK ? false : rangeCheck(card.PAS);
    case 'DRI': return isGK ? false : rangeCheck(card.DRI);
    case 'DEF': return isGK ? false : rangeCheck(card.DEF);
    case 'PHY': return isGK ? false : rangeCheck(card.PHY);
    default: return true;
  }
}

function parseUpgrade(s) {
  const p = s.split(',').map(Number);
  return { overall: p[0]||0, attack: p[1]||0, control: p[2]||0, defense: p[3]||0 };
}

function cap(v) { return Math.min(99, parseInt(v) || 0); }

function applyEvo(card, evo) {
  const c = { ...card };
  evo.upgrades.forEach(u => {
    const up  = parseUpgrade(u);
    c.rating  = cap(c.rating  + up.overall);
    c.PAC     = cap(c.PAC     + up.overall);
    c.SHO     = cap(c.SHO     + up.overall);
    c.PAS     = cap(c.PAS     + up.overall);
    c.DRI     = cap(c.DRI     + up.overall);
    c.DEF     = cap(c.DEF     + up.overall);
    c.PHY     = cap(c.PHY     + up.overall);
    c.attack  = cap(c.attack  + up.attack);
    c.control = cap(c.control + up.control);
    c.defense = cap(c.defense + up.defense);
  });
  c.color = 'evo';
  return c;
}

function buildChains(card) {
  const results = [];
  const unique  = getUniqueEvos();

  function dfs(cur, usedList, usedNames) {
    if (usedList.length >= 1) results.push(usedList);

    for (const evo of unique) {
      if (usedNames.has(evo.name)) continue;
      if (evo.requirements.every(r => meetsRequirement(r, cur))) {
        const nextNames = new Set(usedNames);
        nextNames.add(evo.name);
        dfs(applyEvo(cur, evo), [...usedList, evo], nextNames);
      }
    }
  }
  dfs(card, [], new Set());
  return results;
}

function chainTotals(chain) {
  return chain.reduce((acc, evo) => {
    evo.upgrades.forEach(u => {
      const up = parseUpgrade(u);
      acc.overall  += up.overall;
      acc.attack   += up.attack;
      acc.control  += up.control;
      acc.defense  += up.defense;
    });
    return acc;
  }, { overall: 0, attack: 0, control: 0, defense: 0 });
}

// ─────────────────────────────────────────────
// Evo Path Tree — branching "column" diagram for the 3-dot menu
// Column 0 = original card. Each column to the right = every evo
// that card qualifies for at that stage. Lines connect parent -> child.
// ─────────────────────────────────────────────
function buildEvoTree(card) {
  const unique = getUniqueEvos();

  function walk(cur, used) {
    const children = [];
    unique.forEach(evo => {
      if (used.has(evo.name)) return;
      if (evo.requirements.every(r => meetsRequirement(r, cur))) {
        const nextCard = applyEvo(cur, evo);
        const nextUsed = new Set(used); nextUsed.add(evo.name);
        children.push({ evo, card: nextCard, children: walk(nextCard, nextUsed) });
      }
    });
    return children;
  }
  return { evo: null, card, children: walk(card, new Set()) };
}

function layoutEvoTree(root) {
  const nodes = [], links = [];
  const ROW_H = 92, COL_W = 230;
  let row = 0;

  function visit(node, depth, parent) {
    const layoutNode = { node, depth, x: depth * COL_W, y: 0 };
    if (!node.children.length) {
      layoutNode.y = row * ROW_H;
      row++;
    } else {
      const childYs = node.children.map(c => visit(c, depth + 1, layoutNode).y);
      layoutNode.y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    }
    nodes.push(layoutNode);
    if (parent) links.push({ from: parent, to: layoutNode });
    return layoutNode;
  }

  visit(root, 0, null);
  const maxDepth = nodes.length ? Math.max(...nodes.map(n => n.depth)) : 0;
  return { nodes, links, rowCount: row, maxDepth };
}

function escTree(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Walks the tree in the exact order given by `chainNames`, returning the
// set of tree-node objects and the set of "to" nodes for links on that path
function findActivePath(tree, chainNames) {
  const activeNodes = new Set([tree]);
  const activeToNodes = new Set();
  let cur = tree;
  for (const name of chainNames) {
    const next = cur.children.find(c => c.evo && c.evo.name === name);
    if (!next) break; // path diverged from what the tree can produce — stop highlighting further
    activeNodes.add(next);
    activeToNodes.add(next);
    cur = next;
  }
  return { activeNodes, activeToNodes };
}

function renderEvoTreeModal(tree, rootCardName, activeChain = null) {
  if (!tree.children.length) {
    if (typeof window._cardShowToast === 'function') window._cardShowToast('No evo chains available for this card');
    return;
  }

  const { nodes, links, rowCount, maxDepth } = layoutEvoTree(tree);
  const PAD = 40, BOX_W = 190;
  const width  = (maxDepth + 1) * 230 + PAD * 2;
  const height = Math.max(1, rowCount) * 92 + PAD * 2;

  let activeNodes = new Set(), activeToNodes = new Set();
  if (activeChain && activeChain.length) {
    ({ activeNodes, activeToNodes } = findActivePath(tree, activeChain));
  }

  const svgLinks = links.map(l => {
    const isActive = activeToNodes.has(l.to.node);
    const x1 = l.from.x + BOX_W + PAD, y1 = l.from.y + 30 + PAD;
    const x2 = l.to.x + PAD,           y2 = l.to.y + 30 + PAD;
    const mx = (x1 + x2) / 2;
    const stroke = isActive ? '#f59e0b' : 'rgba(34,197,94,0.55)';
    const width_ = isActive ? 4 : 2.5;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="${width_}"${isActive ? ' class="evo-tree-link-active"' : ''}/>`;
  }).join('');

  const boxesHTML = nodes.map(n => {
    const isRoot   = n.depth === 0;
    const isActive = activeNodes.has(n.node);
    const label  = isRoot ? escTree(rootCardName) : escTree(n.node.evo.name);
    const sub    = isRoot ? 'ORIGINAL' : `${n.node.card.rating} OVR`;
    const cls = ['evo-tree-box'];
    if (isRoot) cls.push('evo-tree-box--root');
    if (isActive && !isRoot) cls.push('evo-tree-box--active');
    return `<div class="${cls.join(' ')}" style="left:${n.x + PAD}px;top:${n.y + PAD}px">
      <div class="evo-tree-box-name">${label}</div>
      <div class="evo-tree-box-sub">${sub}</div>
    </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'evo-tree-modal-overlay open';
  overlay.innerHTML = `
    <div class="evo-tree-modal">
      <div class="evo-tree-modal-hdr">
        <span>Evo Paths — ${escTree(rootCardName)}</span>
        <div class="evo-tree-hdr-btns">
          <button class="evo-tree-zoom-btn" id="evoTreeZoomOut" aria-label="Zoom out">−</button>
          <button class="evo-tree-zoom-btn" id="evoTreeZoomIn" aria-label="Zoom in">+</button>
          <button class="evo-tree-zoom-btn evo-tree-zoom-btn--text" id="evoTreeZoomFit">Fit</button>
          <button class="evo-tree-close" id="evoTreeCloseBtn">×</button>
        </div>
      </div>
      ${activeChain && activeChain.length ? `<div class="evo-tree-legend"><span class="evo-tree-legend-swatch"></span>Highlighted path: ${escTree(activeChain.join(' → '))}</div>` : ''}
      <div class="evo-tree-scroll">
        <div class="evo-tree-sizer" style="width:${width}px;height:${height}px">
          <div class="evo-tree-canvas" style="width:${width}px;height:${height}px">
            <svg class="evo-tree-svg" width="${width}" height="${height}">${svgLinks}</svg>
            ${boxesHTML}
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let cleanupDrag = () => {};
  const close = () => { cleanupDrag(); overlay.remove(); };
  overlay.querySelector('#evoTreeCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Zoom & pan ─────────────────────────────────────────
  const scroller = overlay.querySelector('.evo-tree-scroll');
  const sizer    = overlay.querySelector('.evo-tree-sizer');
  const canvas   = overlay.querySelector('.evo-tree-canvas');
  const MIN_ZOOM = 0.25, MAX_ZOOM = 2.5;
  let zoom = 1;

  function applyZoom(next) {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    canvas.style.transform = `scale(${zoom})`;
    sizer.style.width  = (width  * zoom) + 'px';   // keeps scrollbars matching the zoomed size
    sizer.style.height = (height * zoom) + 'px';
  }

  // Zoom to `next`, keeping the point under (clientX, clientY) fixed on screen.
  // With no coordinates it zooms around the centre of the view.
  function zoomAt(next, clientX, clientY) {
    const s = scroller.getBoundingClientRect();
    if (clientX == null) { clientX = s.left + s.width / 2; clientY = s.top + s.height / 2; }
    const before = sizer.getBoundingClientRect();
    const px = (clientX - before.left) / zoom;
    const py = (clientY - before.top)  / zoom;
    applyZoom(next);
    const after = sizer.getBoundingClientRect();
    scroller.scrollLeft += after.left + px * zoom - clientX;
    scroller.scrollTop  += after.top  + py * zoom - clientY;
  }

  // Zoom and scroll so every node in `list` is visible (centred if it fits).
  function fitTo(list, floor) {
    const BOX_H = 56, M = 12;
    const left   = Math.min(...list.map(n => n.x)) + PAD - M;
    const top    = Math.min(...list.map(n => n.y)) + PAD - M;
    const right  = Math.max(...list.map(n => n.x)) + PAD + BOX_W + M;
    const bottom = Math.max(...list.map(n => n.y)) + PAD + BOX_H + M;
    const bw = right - left, bh = bottom - top;
    const vw = scroller.clientWidth, vh = scroller.clientHeight;

    applyZoom(Math.max(floor, Math.min(1, vw / bw, vh / bh)));

    const s = scroller.getBoundingClientRect();
    const z = sizer.getBoundingClientRect();
    const wantX = bw * zoom <= vw ? s.left + (vw - bw * zoom) / 2 : s.left;
    const wantY = bh * zoom <= vh ? s.top  + (vh - bh * zoom) / 2 : s.top;
    scroller.scrollLeft += z.left + left * zoom - wantX;
    scroller.scrollTop  += z.top  + top  * zoom - wantY;
  }

  // Opening view: the whole highlighted chain, or the whole tree if there is none
  function fitInitial() {
    const hasChain = activeChain && activeChain.length;
    fitTo(hasChain ? nodes.filter(n => n.depth === 0 || activeNodes.has(n.node)) : nodes,
          hasChain ? MIN_ZOOM : 0.5);
  }
  fitInitial();

  // Pinch (two fingers). One finger still scrolls normally.
  let pinch = null;
  const touchDist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroller.addEventListener('touchstart', e => {
    if (e.touches.length === 2) pinch = { d: touchDist(e.touches), z: zoom };
  }, { passive: true });
  scroller.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !pinch) return;
    e.preventDefault();
    const t = e.touches;
    zoomAt(pinch.z * touchDist(t) / pinch.d,
           (t[0].clientX + t[1].clientX) / 2,
           (t[0].clientY + t[1].clientY) / 2);
  }, { passive: false });
  scroller.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });

  // PC: plain mouse-wheel zooms (drag handles panning, so scroll is free for zoom).
  // Ctrl+scroll (trackpad pinch) still works too, since it fires wheel events the same way.
  scroller.addEventListener('wheel', e => {
    e.preventDefault();
    const d = Math.max(-25, Math.min(25, e.deltaY));
    zoomAt(zoom * Math.exp(-d * 0.01), e.clientX, e.clientY);
  }, { passive: false });

  // PC: click-and-drag panning (mouse only — touch already pans via native scroll/pinch)
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragScrollX = 0, dragScrollY = 0;

  function onDragMove(e) {
    if (!isDragging) return;
    scroller.scrollLeft = dragScrollX - (e.clientX - dragStartX);
    scroller.scrollTop  = dragScrollY - (e.clientY - dragStartY);
  }
  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    scroller.classList.remove('evo-tree-dragging');
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }
  scroller.addEventListener('mousedown', e => {
    if (e.button !== 0) return; // left mouse button only
    isDragging  = true;
    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    dragScrollX = scroller.scrollLeft;
    dragScrollY = scroller.scrollTop;
    scroller.classList.add('evo-tree-dragging');
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  });
  cleanupDrag = onDragEnd;

  overlay.querySelector('#evoTreeZoomIn').addEventListener('click',  () => zoomAt(zoom * 1.25));
  overlay.querySelector('#evoTreeZoomOut').addEventListener('click', () => zoomAt(zoom / 1.25));
  overlay.querySelector('#evoTreeZoomFit').addEventListener('click', fitInitial);
}

// Reuses the dev-panel's already-embedded field data — no new registry needed.
// Works for normal cards AND evo-injected cards alike, since buildCardHTML /
// buildEvoCardElement both stamp a `.card-dev-pre[data-dev]` at render time.
window._evoOpenTreeFromCard = function(btn) {
  const wrap    = btn.closest('.card-and-breakdown');
  const pre     = wrap?.querySelector('.card-dev-pre');
  const dbSpan  = wrap?.querySelector('.card-dev-db');
  if (!pre || !pre.dataset.dev) return;

  if (!allEvos.length) {
    if (typeof window._cardShowToast === 'function') window._cardShowToast('Evolutions still loading, try again shortly');
    return;
  }

  let fields;
  try {
    fields = JSON.parse(pre.dataset.dev.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
  } catch { return; }

  const isEvoCard  = (dbSpan?.textContent || '').trim() === 'evo';
  const chainLabel = fields._evoChain?.stringValue || '';
  const chainNames = chainLabel ? chainLabel.split('→').map(s => s.trim()).filter(Boolean) : [];

  if (isEvoCard && chainNames.length) {
    // This card's own field object only has the *upgraded* stats (the
    // originals were overwritten when the evo entry was built), so we
    // look up the true original card by id among all loaded players.
    const evoId = fields.id?.stringValue;
    const baseEntry = (window._allPlayers || []).find(p =>
      p.database !== 'evo' && p?.mapValue?.fields?.id?.stringValue === evoId
    );

    if (baseEntry) {
      const baseCard = fieldsToCard(baseEntry.mapValue.fields);
      renderEvoTreeModal(buildEvoTree(baseCard), baseCard.name, chainNames);
      return;
    }
    if (typeof window._cardShowToast === 'function') window._cardShowToast('Original base card not found');
    return;
  }

  const card = fieldsToCard(fields);
  renderEvoTreeModal(buildEvoTree(card), card.name);
};
// ─────────────────────────────────────────────
// Parse card object from the dev-panel data attribute
// ─────────────────────────────────────────────
function fieldsToCard(fields) {
  return {
    name:         fields.name?.stringValue         || 'Unknown',
    rating:       parseInt(fields.rating?.integerValue)    || 0,
    position:     fields.position?.stringValue     || 'NA',
    altPositions: fields.altPositions?.stringValue || '',
    PAC:     parseInt(fields.PAC?.integerValue)     || 0,
    SHO:     parseInt(fields.SHO?.integerValue)     || 0,
    PAS:     parseInt(fields.PAS?.integerValue)     || 0,
    DRI:     parseInt(fields.DRI?.integerValue)     || 0,
    DEF:     parseInt(fields.DEF?.integerValue)     || 0,
    PHY:     parseInt(fields.PHY?.integerValue)     || 0,
    attack:  parseInt(fields.attack?.integerValue)  || 0,
    control: parseInt(fields.control?.integerValue) || 0,
    defense: parseInt(fields.defense?.integerValue) || 0,
    nationId:  String(fields.nationId?.integerValue  || '0'),
    leagueId:  String(fields.leagueId?.integerValue  || '0'),
    clubId:    String(fields.clubId?.integerValue    || '0'),
    color:     fields.color?.stringValue             || 'default',
    id:        (fields.id?.stringValue || '').replace('id', ''),
    baseId:    String(fields.baseId?.integerValue    || '0'),
    specialChem: fields.specialChem?.stringValue     || '',
    hasDynamicImg: fields.url?.booleanValue === true,
  };
}

// ─────────────────────────────────────────────
// Build a standalone card-and-breakdown element for one evo result
// Mirrors the structure Card.js produces so it sits naturally in the grid
// ─────────────────────────────────────────────
function buildEvoCardElement(finalCard, chain, baseCard) {
  const totals   = chainTotals(chain);
  const ck       = 'evo';
  const cm       = window.colorMap?.[ck] || {};
  const imgUrl   = cm.url_big || `https://mf-data.b-cdn.net/27/Colors/evo_big_27.png`;
  const top      = cm.top_text_color    || '#000000';
  const mid      = cm.middle_text_color || '#FFFFFF';
  const bot      = cm.bottom_text_color || '#FFFFFF';

  const A = finalCard.attack, C = finalCard.control, D = finalCard.defense;
  const h = Math.max(A, C, D), d = h - 3;
  const fc = `${A<=h&&A>=d?1:0}${C<=h&&C>=d?1:0}${D<=h&&D>=d?1:0}`;

  const isGK = (finalCard.position || '').toUpperCase() === 'GK';
  const sl   = isGK ? ['DIV','HAN','KIC','REF','SPD','POS'] : ['PAC','SHO','PAS','DRI','DEF','PHY'];
  const sv   = [finalCard.PAC, finalCard.SHO, finalCard.PAS, finalCard.DRI, finalCard.DEF, finalCard.PHY];

  const altHTML = finalCard.altPositions ? finalCard.altPositions.split(',').map(pos => {
    const hex = cm.alt_pos_background || '#333333';
    const r   = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `<div class="alt-pos" style="background:rgba(${r},${g},${b},0.8);color:${cm.alt_pos_text||'#fff'};border:1px solid ${cm.alt_pos_outline||'#000'}">${pos.trim()}</div>`;
  }).join('') : '';

  const chainLabel = chain.map(e => e.name).join(' → ');
  const safeId     = String(finalCard.id     || '');
  const safeBase   = String(finalCard.baseId || '');
  const safeName   = (finalCard.name || '').replace(/'/g,'').replace(/\s+/g,'_');

  // Stat diff pills for the chain label badge
  const pills = [
    totals.overall  ? `+${totals.overall} OVR` : '',
    totals.attack   ? `+${totals.attack} ATK`  : '',
    totals.control  ? `+${totals.control} CTL` : '',
    totals.defense  ? `+${totals.defense} DEF` : '',
  ].filter(Boolean).join('  ');

  const wrap = document.createElement('div');
  wrap.className      = 'card-and-breakdown evo-injected-card';
  wrap.dataset.evoFor = finalCard.name;

  // Store upgraded stats as a Firestore-shaped mapValue so Card.js
  // filterAndSort() reads the same field paths it uses for real cards
  const evoPlayerEntry = {
    _isEvoInjected: true,
    createTime: new Date().toISOString(),
    database: 'evo',
    mapValue: { fields: {
      name:         { stringValue:  finalCard.name },
      rating:       { integerValue: String(finalCard.rating) },
      position:     { stringValue:  finalCard.position },
      altPositions: { stringValue:  finalCard.altPositions || '' },
      PAC:          { integerValue: String(finalCard.PAC) },
      SHO:          { integerValue: String(finalCard.SHO) },
      PAS:          { integerValue: String(finalCard.PAS) },
      DRI:          { integerValue: String(finalCard.DRI) },
      DEF:          { integerValue: String(finalCard.DEF) },
      PHY:          { integerValue: String(finalCard.PHY) },
      attack:       { integerValue: String(finalCard.attack) },
      control:      { integerValue: String(finalCard.control) },
      defense:      { integerValue: String(finalCard.defense) },
      nationId:     { integerValue: finalCard.nationId },
      leagueId:     { integerValue: finalCard.leagueId },
      clubId:       { integerValue: finalCard.clubId },
      color:        { stringValue:  'evo' },
      id:           { stringValue:  finalCard.id },
      baseId:       { integerValue: finalCard.baseId },
    }}
  };
  wrap._evoPlayerEntry = evoPlayerEntry;

  // Flat fields object for the dev menu (human-readable + chain metadata)
 try { wrap.dataset.evoFields = JSON.stringify({
    _evoChain:   chainLabel,
    _evoTotals:  pills || 'none',
    name:        finalCard.name,
    position:    finalCard.position,
    altPositions: finalCard.altPositions || '',
    rating:      finalCard.rating,
    PAC:         finalCard.PAC,  SHO: finalCard.SHO, PAS: finalCard.PAS,
    DRI:         finalCard.DRI,  DEF: finalCard.DEF, PHY: finalCard.PHY,
    attack:      finalCard.attack, control: finalCard.control, defense: finalCard.defense,
    nationId:    finalCard.nationId, leagueId: finalCard.leagueId, clubId: finalCard.clubId,
    color:       'evo',
    id:          finalCard.id,
    baseId:      finalCard.baseId,
  }); } catch(e) { wrap.dataset.evoFields = '{}'; }

  // Build a Firestore-shaped fields object with upgraded stats for the dev panel + filtering
  const evoFieldsForDev = {
    
    name:         { stringValue:  finalCard.name },
    position:     { stringValue:  finalCard.position },
    altPositions: { stringValue:  finalCard.altPositions || '' },
    rating:       { integerValue: String(finalCard.rating) },
    PAC:          { integerValue: String(finalCard.PAC) },
    SHO:          { integerValue: String(finalCard.SHO) },
    PAS:          { integerValue: String(finalCard.PAS) },
    DRI:          { integerValue: String(finalCard.DRI) },
    DEF:          { integerValue: String(finalCard.DEF) },
    PHY:          { integerValue: String(finalCard.PHY) },
    attack:       { integerValue: String(finalCard.attack) },
    control:      { integerValue: String(finalCard.control) },
    defense:      { integerValue: String(finalCard.defense) },
    nationId:     { integerValue: String(finalCard.nationId) },
    leagueId:     { integerValue: String(finalCard.leagueId) },
    clubId:       { integerValue: String(finalCard.clubId) },
    color:        { stringValue:  'evo' },
    id:           { stringValue:  finalCard.id },
    baseId:       { integerValue: String(finalCard.baseId) },
  };

  function escEvo(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  const evoDevData = escEvo(JSON.stringify(evoFieldsForDev, null, 2));

  wrap.innerHTML = `
    <div class="card-menu-wrap">
      <button class="card-three-dots" onclick="toggleCardMenu(this)">⋮</button>
      <div class="card-menu-dropdown">
        <div class="card-menu-item" style="pointer-events:none;opacity:0.5;font-size:10px;white-space:normal;line-height:1.4">${chainLabel}</div>
        ${pills ? `<div class="card-menu-item" style="pointer-events:none;opacity:0.5;font-size:10px">${pills}</div>` : ''}
        <button class="card-menu-item" onclick="event.stopPropagation();window._evoDownloadCard(this.closest('.card-and-breakdown').querySelector('.card'),'${safeName}_evo.png')">Download Card</button>
        <button class="card-menu-item" onclick="event.stopPropagation();window._evoOpenTreeFromCard && window._evoOpenTreeFromCard(this)">View Evo Paths</button>
        <button class="card-menu-item" onclick="event.stopPropagation();openDevMenu(this)">Dev Menu <span style="opacity:0.5;font-size:11px">evo</span></button>
      </div>
    </div>
    <div class="card-dev-panel" style="display:none;position:absolute;top:0;left:0;width:100%;z-index:200">
      <span class="card-dev-db" style="display:none">evo</span>
      <pre class="card-dev-pre" style="display:none" data-dev="${evoDevData}"></pre>
    </div>

    <div class="card-wrapper">
      <div class="card">
        <img src="${imgUrl}" alt="evo card">
        <div class="overall-position">
          <div class="overall player-rating" style="color:${top}">${finalCard.rating}</div>
          <div class="position player-position" style="color:${top}">${finalCard.position}</div>
        </div>
        ${altHTML ? `<div class="alt-positions">${altHTML}</div>` : ''}
        <div class="player-name" style="color:${mid}">${finalCard.name}</div>
        <div class="specialChem"></div>
        <div class="stats">
          ${sl.map((l,i) => `<div class="stat">
            <div class="stat-label" style="color:${bot}">${l}</div>
            <div class="stat-value" style="color:${bot}">${sv[i]}</div>
          </div>`).join('')}
        </div>
        <div class="stats-separator"></div>
        <div class="fatals">
          <img class="fatal-bg" src="https://mf-data.b-cdn.net/26/Fatal/Stats/fatal_card_stats_${fc}.png" alt="">
          <div class="fatal-value-container">
            <div class="fatal-value">${finalCard.attack}</div>
            <div class="fatal-value">${finalCard.control}</div>
            <div class="fatal-value">${finalCard.defense}</div>
          </div>
        </div>
        <div class="badges">
          <img class="badge flag"   src="https://mf-data.b-cdn.net/27/Badges/Nations/nation_large_${finalCard.nationId}.png" onerror="this.style.opacity='.15'" alt="">
          <img class="badge league" src="https://mf-data.b-cdn.net/27/Badges/Leagues/league_large_${finalCard.leagueId}.png" onerror="this.style.opacity='.15'" alt="">
          <img class="badge club"   src="https://mf-data.b-cdn.net/27/Badges/Clubs/club_large_${finalCard.clubId}.png" onerror="this.style.opacity='.15'" alt="">
        </div>
        <img class="player-face"
          src="https://trivela.b-cdn.net/27/normalFacesSmall/${safeId}.png"
          alt=""
          onerror="
            if (!this.dataset.step) {
              this.dataset.step='p'; this.classList.add('normal-face');
              this.src='https://trivela.b-cdn.net/27/faces/p${safeId}.png';
            } else if (this.dataset.step==='p') {
              this.dataset.step='base'; this.classList.remove('normal-face'); this.classList.add('fallback-face');
              this.src='https://trivela.b-cdn.net/27/normalFacesSmall/${safeBase}.png';
            } else {
              this.onerror=null; this.src='Main Assets/boo.png';
            }
          ">
      </div>
    </div>`;

  return wrap;
}

// ─────────────────────────────────────────────
// Build evo player entries and inject into allPlayers
// Called once after Card.js has finished loading all players
// ─────────────────────────────────────────────
// Only these card colors are eligible to spawn evo chains
const EVO_ELIGIBLE_COLORS = new Set([
  'best_xi',
  'best_xi_nominee',
  'historic_xi_nominee',
  'historic_xi',
  'ltm',
  'madfut_icon',
  'evo',
  'evo_elite',
]);

function buildAndInjectEvoPlayers(callback) {
  const players = window._allPlayers;
  if (!Array.isArray(players) || !players.length) { callback?.(); return; }
  if (!allEvos.length) { callback?.(); return; }

  const eligible = players
    .filter(p => !p._isEvoInjected)
    .filter(p => {
      const c = (p?.mapValue?.fields?.color?.stringValue || '').trim().toLowerCase();
      return !EVO_ELIGIBLE_COLORS.has(c);
    });

  console.log('[EvoCards] building evo entries for', eligible.length, 'eligible players');
  let count = 0;

  // Process in chunks with a yield between each so the tab stays responsive
  // instead of one long blocking task while chains are computed.
  const CHUNK_SIZE = 60;
  let idx = 0;

  function processOne(p) {
    let card;
    try { card = fieldsToCard(p.mapValue.fields); } catch { return; }
    card._database   = p.database;
    card._createTime = p.createTime;

    buildChains(card).forEach(chain => {
      const finalCard = chain.reduce((c, evo) => applyEvo(c, evo), { ...card });
      const chainLabel = chain.map(e => e.name).join(' → ');
      const totals     = chainTotals(chain);
      const pills = [
        totals.overall  ? `+${totals.overall} OVR` : '',
        totals.attack   ? `+${totals.attack} ATK`  : '',
        totals.control  ? `+${totals.control} CTL` : '',
        totals.defense  ? `+${totals.defense} DEF` : '',
      ].filter(Boolean).join('  ');

      const postId = 'evopost_' + (_evoPostIdCounter++);
      _evoPostRegistry.set(postId, { baseCard: card, finalCard, chain, totals });

      const baseFields = p.mapValue.fields;
      const evoEntry = {
        _isEvoInjected: true,
        _originalDb:    p.database,
        createTime:     p.createTime,
        database:       'evo',
        mapValue: { fields: {
          ...baseFields,
          _evoChain:    { stringValue:  chainLabel },
          _evoTotals:   { stringValue:  pills || 'none' },
          _evoPostId:   { stringValue:  postId },
          name:         { stringValue:  finalCard.name },
          rating:       { integerValue: String(finalCard.rating) },
          position:     { stringValue:  finalCard.position },
          altPositions: { stringValue:  finalCard.altPositions || '' },
          PAC:          { integerValue: String(finalCard.PAC) },
          SHO:          { integerValue: String(finalCard.SHO) },
          PAS:          { integerValue: String(finalCard.PAS) },
          DRI:          { integerValue: String(finalCard.DRI) },
          DEF:          { integerValue: String(finalCard.DEF) },
          PHY:          { integerValue: String(finalCard.PHY) },
          attack:       { integerValue: String(finalCard.attack) },
          control:      { integerValue: String(finalCard.control) },
          defense:      { integerValue: String(finalCard.defense) },
          color:        { stringValue:  'evo' },
          packable:     { integerValue: '-99' },
          tradable:     { booleanValue: false },
          inPicks:      { booleanValue: false },
          inTokens:     { booleanValue: false },
        }}
      };

      players.push(evoEntry);
      count++;
    });
  }

  function processChunk() {
    const end = Math.min(idx + CHUNK_SIZE, eligible.length);
    for (; idx < end; idx++) processOne(eligible[idx]);

    if (idx < eligible.length) {
      setTimeout(processChunk, 0);
    } else {
      console.log('[EvoCards]', count, 'evo entries injected into allPlayers');
      callback?.();
    }
  }

  processChunk();
}

// kept for compatibility but no longer used for DOM injection
function attachEvoCards() {
  const container = document.getElementById('card-container');
  if (!container) return;

  // Only process originals — skip any we already injected
  const originals = [...container.querySelectorAll('.card-and-breakdown:not(.evo-injected-card)')];

  originals.forEach(cardEl => {
    // Skip if we've already processed this one in this render cycle
    if (cardEl.dataset.evoAttached === '1') return;

    const devPre = cardEl.querySelector('.card-dev-pre');
    if (!devPre) return;

    let fields;
    try {
      const raw = devPre.dataset.dev
        .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      fields = JSON.parse(raw);
    } catch { return; }

    const card = fieldsToCard(fields);

    let chains;
    if (chainCache.has(cardEl)) {
      chains = chainCache.get(cardEl);
    } else {
      chains = buildChains(card);
      chainCache.set(cardEl, chains);
    }

    // Mark so we don't double-inject on re-runs
    cardEl.dataset.evoAttached = '1';

    // Insert each chain result immediately after the original card
    let insertAfter = cardEl;
    chains.forEach(chain => {
      const finalCard = chain.reduce((c, evo) => applyEvo(c, evo), { ...card });
      const el        = buildEvoCardElement(finalCard, chain, card);
      insertAfter.insertAdjacentElement('afterend', el);
      insertAfter = el;
    });
  });
}

// ─────────────────────────────────────────────
// Remove all injected evo cards
// ─────────────────────────────────────────────
function removeEvoCards() {
  const container = document.getElementById('card-container');
  if (!container) return;

  // Unregister from _allPlayers before removing from DOM
  container.querySelectorAll('.evo-injected-card').forEach(el => {
    if (el._evoPlayerEntry && Array.isArray(window._allPlayers)) {
      const idx = window._allPlayers.indexOf(el._evoPlayerEntry);
      if (idx !== -1) window._allPlayers.splice(idx, 1);
    }
    el.remove();
  });

  // Reset the attachment markers so re-toggling works
  container.querySelectorAll('.card-and-breakdown[data-evo-attached]').forEach(el => {
    delete el.dataset.evoAttached;
  });
}

// ─────────────────────────────────────────────
// Toggle button
// ─────────────────────────────────────────────


function mountToggleButton() {} // no-op, toggle removed

function observeContainer() {} // no longer needed

// ─────────────────────────────────────────────
// Fetch evosStandard from Firestore
// Now with per-page retry + localStorage fallback so a single
// slow/failed request doesn't leave the whole page with zero chains.
// ─────────────────────────────────────────────
const EVOS_CACHE_KEY = 'mfCache_v27_evosStandard';

function loadEvosCache() {
  try {
    const raw = localStorage.getItem(EVOS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEvosCache(evos) {
  try {
    localStorage.setItem(EVOS_CACHE_KEY, JSON.stringify({ evos, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[EvoCards] failed to cache evosStandard:', e);
  }
}

async function fetchEvosPage(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[EvoCards] evosStandard page fetch failed (attempt ${attempt}/${attempts}):`, err);
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, 500 * attempt)); // small backoff
      }
    }
  }
  return null; // all attempts failed
}

async function fetchAllEvos() {
  const base = 'https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/(default)/documents/evosStandard';
  const evos = [];
  let hadFailure = false;

  try {
    let pageToken = '';
    do {
      const url  = `${base}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
      const data = await fetchEvosPage(url);

      if (!data) {
        // This page failed after all retries — stop paging, but don't
        // throw away whatever we already collected from earlier pages.
        hadFailure = true;
        break;
      }

      pageToken = data.nextPageToken || '';
      (data.documents || [])
        .filter(doc => doc.name.split('/').pop().startsWith('27_'))
        .forEach(doc => {
        (doc.fields?.evos?.arrayValue?.values || []).forEach(item => {
          const f = item?.mapValue?.fields;
          if (!f?.name?.stringValue) return;
          evos.push({
            name:         f.name.stringValue,
            requirements: (f.standardRequirements?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean),
            upgrades:     (f.standardUpgrades?.arrayValue?.values     || []).map(v => v.stringValue).filter(Boolean),
          });
        });
      });
    } while (pageToken);
  } catch (e) {
    console.error('[EvoCards] fetch error:', e);
    hadFailure = true;
  }

  if (evos.length > 0 && !hadFailure) {
    // Full clean fetch — refresh the cache for next time.
    saveEvosCache(evos);
    console.log(`[EvoCards] ${evos.length} evolutions loaded (fresh)`);
    return evos;
  }

  if (evos.length > 0 && hadFailure) {
    // Partial fetch (some pages failed) — still better than nothing,
    // but cache it too so a repeat failure doesn't lose even this.
    console.warn(`[EvoCards] ${evos.length} evolutions loaded (partial — some pages failed)`);
    saveEvosCache(evos);
    return evos;
  }

  // Nothing came back at all — fall back to last known-good cache
  // instead of leaving the user with zero evo chains.
  const cached = loadEvosCache();
  if (cached?.evos?.length) {
    console.warn(`[EvoCards] evosStandard fetch failed entirely — using cached copy from ${new Date(cached.savedAt).toLocaleString()} (${cached.evos.length} evolutions)`);
    return cached.evos;
  }

  console.error('[EvoCards] evosStandard fetch failed and no cache available — 0 evolutions');
  return [];
}
// ─────────────────────────────────────────────
// Social post generation (Download Social Post)
// ─────────────────────────────────────────────
function escapeXML(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function hasWC2026Upgrade(chain) {
  return chain.some(evo => (evo.name || '').toLowerCase().includes('wc 2026'));
}

// Synchronous card-face HTML builder used only for the social-post canvas —
// works for any card object/color (unlike the on-page injected cards, which
// are always forced to color 'evo').
function buildPostCardHTML(card) {
  const ck  = (card.color || 'default').toLowerCase();
  const cm  = window.colorMap?.[ck] || {};
  const img = cm.url_big || `https://mf-data.b-cdn.net/27/Colors/${ck || 'default'}_big.png`;
  const top = cm.top_text_color    || '#000000';
  const mid = cm.middle_text_color || '#FFFFFF';
  const bot = cm.bottom_text_color || '#FFFFFF';

  const A = parseInt(card.attack)||0, C = parseInt(card.control)||0, D = parseInt(card.defense)||0;
  const h = Math.max(A,C,D), d = h - 3;
  const fc = `${A<=h&&A>=d?1:0}${C<=h&&C>=d?1:0}${D<=h&&D>=d?1:0}`;

  const isGK = (card.position||'').toUpperCase() === 'GK';
  const sl = isGK ? ['DIV','HAN','KIC','REF','SPD','POS'] : ['PAC','SHO','PAS','DRI','DEF','PHY'];
  const sv = [card.PAC, card.SHO, card.PAS, card.DRI, card.DEF, card.PHY];

  const altHTML = card.altPositions ? card.altPositions.split(',').map(pos => {
    const hex = cm.alt_pos_background || '#333333';
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `<div class="alt-pos" style="background:rgba(${r},${g},${b},0.8);color:${cm.alt_pos_text||'#fff'};border:1px solid ${cm.alt_pos_outline||'#000'}">${pos.trim()}</div>`;
  }).join('') : '';

  return `
    <div class="card-wrapper">
      <div class="card">
        <img src="${img}" alt="${ck} card">
        <div class="overall-position">
          <div class="overall player-rating" style="color:${top}">${card.rating}</div>
          <div class="position player-position" style="color:${top}">${card.position}</div>
        </div>
        ${altHTML ? `<div class="alt-positions">${altHTML}</div>` : ''}
        <div class="player-name" style="color:${mid}">${card.name}</div>
        <div class="stats">
          ${sl.map((l,i) => `<div class="stat">
            <div class="stat-label" style="color:${bot}">${l}</div>
            <div class="stat-value" style="color:${bot}">${sv[i]}</div>
          </div>`).join('')}
        </div>
        <div class="stats-separator"></div>
        <div class="fatals">
          <img class="fatal-bg" src="https://mf-data.b-cdn.net/26/Fatal/Stats/fatal_card_stats_${fc}.png" alt="">
          <div class="fatal-value-container">
            <div class="fatal-value">${card.attack}</div>
            <div class="fatal-value">${card.control}</div>
            <div class="fatal-value">${card.defense}</div>
          </div>
        </div>
        <div class="badges">
          <img class="badge flag"   src="https://mf-data.b-cdn.net/27/Badges/Nations/nation_large_${card.nationId}.png" onerror="this.style.opacity='.15'" alt="">
          <img class="badge league" src="https://mf-data.b-cdn.net/27/Badges/Leagues/league_large_${card.leagueId}.png" onerror="this.style.opacity='.15'" alt="">
          ${(String(card.clubId) === '112658' && String(card.leagueId) === '2118') ? '' : `<img class="badge club"   src="https://mf-data.b-cdn.net/27/Badges/Clubs/club_large_${card.clubId}.png" onerror="this.style.opacity='.15'" alt="">`}
        </div>
        <img class="player-face"
          src="https://trivela.b-cdn.net/27/normalFacesSmall/${card.id}.png"
          alt=""
          onerror="
            if (!this.dataset.step) {
              this.dataset.step='p'; this.classList.add('normal-face');
              this.src='https://trivela.b-cdn.net/27/faces/p${card.id}.png';
            } else if (this.dataset.step==='p') {
              this.dataset.step='base'; this.classList.remove('normal-face'); this.classList.add('fallback-face');
              this.src='https://trivela.b-cdn.net/27/normalFacesSmall/${card.baseId}.png';
            } else {
              this.onerror=null; this.src='Main Assets/boo.png';
            }
          ">
      </div>
    </div>`;
}

// ── Embedded font loader for post-canvas SVG text ──────────
const _fontDataCache = {};
async function getFontDataURI(url, mime) {
  if (_fontDataCache[url]) return _fontDataCache[url];
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const dataUri = `data:${mime};base64,${btoa(binary)}`;
  _fontDataCache[url] = dataUri;
  return dataUri;
}

// ── Blurred-flag fill for the nation title ─────────────────
const _blurredFlagCache = {};

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function getBlurredFlagDataURI(nationId) {
  const key = String(nationId);
  if (_blurredFlagCache[key]) return _blurredFlagCache[key];

  const flagUrl = `https://mf-data.b-cdn.net/27/Badges/Nations/nation_large_${nationId}.png`;
  const size    = 400;
  const canvas  = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const overscan = size * 1.6;
  const offset   = -(overscan - size) / 2;

  try {
    // Fetch the flag as bytes and convert to a same-origin data: URI first —
    // drawing a cross-origin <img> straight onto a canvas taints it, which
    // makes toDataURL() fail (or silently return blank/black). A data URI
    // sidesteps that entirely, same trick getFontDataURI already uses.
    const flagDataUri = await getFontDataURI(flagUrl, 'image/png');

    // Blur via native SVG feGaussianBlur instead of ctx.filter —
    // ctx.filter (Canvas2D `filter` property) is unsupported/no-op on a lot
    // of mobile browsers and in-app webviews (Instagram/TikTok/older iOS
    // Safari), which is why the blur silently disappeared on mobile only.
    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs>
          <filter id="flagBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="45" edgeMode="duplicate"/>
            <feColorMatrix type="saturate" values="1.5"/>
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.95"/>
              <feFuncG type="linear" slope="0.95"/>
              <feFuncB type="linear" slope="0.95"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <image href="${flagDataUri}" x="${offset}" y="${offset}"
               width="${overscan}" height="${overscan}" filter="url(#flagBlur)"/>
      </svg>`;

    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const svgUrl  = URL.createObjectURL(svgBlob);
    try {
      const img = await loadImageEl(svgUrl);
      ctx.drawImage(img, 0, 0, size, size);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  } catch (e) {
    console.error('[EvoCards] flag blur failed, falling back to solid colour:', e);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, size, size);
  }

  const dataUri = canvas.toDataURL('image/png');
  _blurredFlagCache[key] = dataUri;
  return dataUri;
}

async function buildEmbeddedFontFaceCSS() {
  const cruyffURL  = new URL('Fonts/CruyffSansExpanded-Heavy.e64b4629.otf', location.origin + '/style.css').href;
  const robotoCURL = new URL('Fonts/Roboto_Condensed-Medium.ttf', location.origin + '/style.css').href;
  const titanURL   = new URL('Fonts/TitanOne-Regular.ttf', location.origin + '/style.css').href;
  const [cruyffData, robotoCData, titanData] = await Promise.all([
    getFontDataURI(cruyffURL, 'font/otf'),
    getFontDataURI(robotoCURL, 'font/ttf'),
    getFontDataURI(titanURL, 'font/ttf'),
  ]);
  return `
    @font-face { font-family: 'Cruyff Sans Expanded'; src: url(${cruyffData}) format('opentype'); font-weight: 900; }
    @font-face { font-family: 'Roboto Condensed'; src: url(${robotoCData}) format('truetype'); font-weight: 400; }
    @font-face { font-family: 'Titan One'; src: url(${titanData}) format('truetype'); font-weight: 400; }
  `;
}

async function getGoogleFontDataURI(family) {
  const key = 'gf_' + family;
  if (_fontDataCache[key]) return _fontDataCache[key];
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  const cssRes = await fetch(cssUrl);
  const cssText = await cssRes.text();
  const match = cssText.match(/src:\s*url\(([^)]+)\)\s*format\('(woff2|truetype|opentype)'\)/);
  if (!match) throw new Error('Could not resolve font file for ' + family);
  const fontUrl = match[1].replace(/["']/g, '');
  const fmt  = match[2];
  const mime = fmt === 'woff2' ? 'font/woff2' : fmt === 'truetype' ? 'font/ttf' : 'font/otf';
  const dataUri = await getFontDataURI(fontUrl, mime);
  _fontDataCache[key] = dataUri;
  return dataUri;
}

function buildLayeredTextSVG(lines, opts) {
  const {
    width, lineHeight, fontFamily, fontSize, fontWeight = '900',
    italic = false, outerStroke = 22, innerStroke = 4, extrusionDepth = 10,
    gradientId, fontFaceCSS = '', reflected = false,
    flagImageDataUri = null, // NEW: when set, fill text with this image instead of the gradient
    solidFill = null,        // when set, fill text with this flat colour instead of the gradient
  } = opts;
  const topPad  = fontSize * 0.85;
  const height  = topPad + lineHeight * (lines.length - 1) + fontSize * 0.4;
  const cx      = width / 2;
  const style   = italic ? 'italic' : 'normal';
  const fAttrs  = `font-family='${fontFamily}' font-size="${fontSize}" font-weight="${fontWeight}" font-style="${style}" text-anchor="middle"`;

  const cos64 = 0.4384, sin64 = 0.8988;
  let extrusion = '';
  for (let i = extrusionDepth; i >= 1; i--) {
    const dx = (cos64 * i).toFixed(2), dy = (sin64 * i).toFixed(2);
    extrusion += lines.map((line, li) =>
      `<text x="${cx}" y="${topPad + li*lineHeight}" ${fAttrs} fill="#000000" transform="translate(${dx},${dy})">${escapeXML(line)}</text>`
    ).join('');
  }
  const outer = lines.map((line, li) =>
    `<text x="${cx}" y="${topPad + li*lineHeight}" ${fAttrs} fill="none" stroke="#1f1f1f" stroke-width="${outerStroke}" stroke-linejoin="round">${escapeXML(line)}</text>`
  ).join('');
  const inner = lines.map((line, li) =>
    `<text x="${cx}" y="${topPad + li*lineHeight}" ${fAttrs} fill="none" stroke="#ffffff" stroke-width="${innerStroke}" stroke-linejoin="round">${escapeXML(line)}</text>`
  ).join('');
  const fill = lines.map((line, li) =>
    `<text x="${cx}" y="${topPad + li*lineHeight}" ${fAttrs} fill="url(#${gradientId})">${escapeXML(line)}</text>`
  ).join('');

  const fillDef = flagImageDataUri
    ? `<pattern id="${gradientId}" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">
         <image href="${flagImageDataUri}" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice"/>
       </pattern>`
    : solidFill
    ? `<linearGradient id="${gradientId}"><stop offset="0%" stop-color="${solidFill}"/><stop offset="100%" stop-color="${solidFill}"/></linearGradient>`
    : `<linearGradient id="${gradientId}" x1="0" y1="0.65" x2="0" y2="0.35" spreadMethod="pad">
        ${reflected
          ? `<stop offset="0%" stop-color="#616161ff"/><stop offset="35%" stop-color="#b6b6b6ff"/><stop offset="100%" stop-color="#eae9e9ff"/>`
          : `<stop offset="0%" stop-color="#bfbec1"/><stop offset="35%" stop-color="#d5d5d7"/><stop offset="100%" stop-color="#ffffff"/>`}
      </linearGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
    <defs>
      <style>${fontFaceCSS}</style>
      ${fillDef}
    </defs>
    ${extrusion}${outer}${inner}${fill}
  </svg>`;
}

async function evoPlayerNameSVG(name, uid) {
  const fontFaceCSS = await buildEmbeddedFontFaceCSS();
  return buildLayeredTextSVG([name.toUpperCase()], {
    width: 1730, lineHeight: 150,
    fontFamily: 'Titan One', fontSize: 122, fontWeight: 400, italic: false,
    outerStroke: 25, innerStroke: 8, extrusionDepth: 28,
    gradientId: 'evoPlayerNameGrad_' + uid,
    fontFaceCSS, solidFill: '#252525ff',
  });
}

async function evoNationNameSVG(nationName, nationId, uid) {
  const fontFaceCSS = await buildEmbeddedFontFaceCSS();
  const flagDataUri = await getBlurredFlagDataURI(nationId);
  const text        = nationName.toUpperCase();

  // Bigger base size than before, but shrink-to-fit for long names
  // (e.g. "SAUDI ARABIA") so they never run off the sides of the card.
  const baseSize = 150;
  const minSize  = 70;
  const maxWidth = 1600; // usable width inside the 1730 canvas, leaves side margin

  await document.fonts.load(`400 ${baseSize}px "Titan One"`).catch(() => {});
  await document.fonts.ready;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = `400 ${baseSize}px "Titan One"`;
  const textWidth = mctx.measureText(text).width;

  const fontSize = textWidth > maxWidth
    ? Math.max(minSize, baseSize * (maxWidth / textWidth))
    : baseSize;
  const scale = fontSize / baseSize; // scale strokes down with the text so thin stays thin

  return buildLayeredTextSVG([text], {
    width: 1730, lineHeight: 150,
    fontFamily: 'Titan One', fontSize, fontWeight: 400, italic: false,
    outerStroke: 25 * scale, innerStroke: 8 * scale, extrusionDepth: 14 * scale,
    gradientId: 'evoNationNameGrad_' + uid,
    fontFaceCSS,
    flagImageDataUri: flagDataUri,
  });
}
async function buildNationTitleHTML(player, svgUid) {
  const nationName = (nationIdToName[player.nationId] || 'Unknown').toUpperCase();

  // Header keeps the plain header style; the nation-name line is filled
  // with that nation's own blurred flag colours as its base colour.
  const [headerSVGMarkup, nationSVGMarkup] = await Promise.all([
    evoHeaderLineSVG('2026 World Cup Upgrade:', svgUid + '_hdr'),
    evoNationNameSVG(nationName, player.nationId, svgUid + '_nation'),
  ]);

  return `
    <div class="post-nation-title" style="position:absolute;top:210px;left:0;width:100%;height:330px;z-index:1">
      <div style="position:relative;z-index:2;padding-top:30px">
        ${headerSVGMarkup}
        ${nationSVGMarkup}
      </div>
    </div>`;
}
async function evoChainTitleSVG(uid) {
  return evoHeaderLineSVG('EVO CHAIN', uid);
}

// Generic single-line "header" style SVG — same layered-text technique as
// the other titles, so the nation title's top line matches everything else.
async function evoHeaderLineSVG(text, uid) {
  const fontFaceCSS = await buildEmbeddedFontFaceCSS();
  return buildLayeredTextSVG([String(text).toUpperCase()], {
    width: 1730, lineHeight: 90,
    fontFamily: 'Cruyff Sans Expanded', fontSize: 72, fontWeight: 900, italic: false,
    outerStroke: 16, innerStroke: 2, extrusionDepth: 12,
    gradientId: 'evoHeaderGrad_' + uid,
    fontFaceCSS,
  });
}
async function evoNamesSVG(names, uid) {
  const fontFaceCSS = await buildEmbeddedFontFaceCSS();
  return buildLayeredTextSVG(names, {
    width: 1730, lineHeight: 60,
    fontFamily: 'Roboto Condensed', fontSize: 52, fontWeight: 400, italic: true,
    outerStroke: 9, innerStroke: 1.5, extrusionDepth: 6,
    gradientId: 'evoNamesGrad_' + uid,
    fontFaceCSS,
  });
}

// ── WC 2026 title-choice modal ──────────────────────────────
let _wcModalPendingPostId = null;

function ensureWcModal() {
  if (document.getElementById('evoWcTitleModalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'wc-title-modal-overlay';
  overlay.id = 'evoWcTitleModalOverlay';
  overlay.innerHTML = `
    <div class="wc-title-modal">
      <div class="wc-title-modal-hdr">This chain includes a WC 2026 Upgrade</div>
      <div class="wc-title-modal-sub">Choose a title style for the post</div>
      <button class="wc-title-modal-btn" id="evoWcTitleBtnDefault">Default Title</button>
      <button class="wc-title-modal-btn" id="evoWcTitleBtnNation">Nation Title</button>
      <button class="wc-title-modal-cancel" id="evoWcTitleModalCancel">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#evoWcTitleBtnDefault').addEventListener('click', () => {
    const id = _wcModalPendingPostId;
    _closeWcModal();
    if (id !== null) window._evoDownloadPostCard(id, 'default');
  });
  overlay.querySelector('#evoWcTitleBtnNation').addEventListener('click', () => {
    const id = _wcModalPendingPostId;
    _closeWcModal();
    if (id !== null) window._evoDownloadPostCard(id, 'nation');
  });
  overlay.querySelector('#evoWcTitleModalCancel').addEventListener('click', _closeWcModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeWcModal(); });
}

function _openWcModal(postId) {
  ensureWcModal();
  _wcModalPendingPostId = postId;
  document.getElementById('evoWcTitleModalOverlay')?.classList.add('open');
}
function _closeWcModal() {
  _wcModalPendingPostId = null;
  document.getElementById('evoWcTitleModalOverlay')?.classList.remove('open');
}

window._evoHandlePostClick = function(postId) {
  const data = _evoPostRegistry.get(postId);
  if (!data) return;
  if (hasWC2026Upgrade(data.chain)) {
    _openWcModal(postId);
  } else {
    window._evoDownloadPostCard(postId, 'default');
  }
};

// Same-page popup used on iPhone/iPad instead of opening a new tab.
function openPosterPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'poster-popup-overlay';
  overlay.innerHTML = `
    <button class="poster-popup-close" aria-label="Close">×</button>
    <div class="poster-popup">
      <p class="poster-popup-hint">Generating image…</p>
      <img class="poster-popup-img" alt="Evo poster" style="display:none">
    </div>`;
  document.body.appendChild(overlay);

  const img  = overlay.querySelector('.poster-popup-img');
  const hint = overlay.querySelector('.poster-popup-hint');

  const close = () => {
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    overlay.remove();
  };
  overlay.querySelector('.poster-popup-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  return {
    show(blobUrl) {
      // User closed the popup while it was still generating
      if (!overlay.isConnected) { URL.revokeObjectURL(blobUrl); return; }
      img.src = blobUrl;
      img.style.display = '';
      hint.textContent = 'Press and hold the image to save it';
    },
    close,
  };
}

window._evoDownloadPostCard = async function(postId, titleMode = 'default') {
  const data = _evoPostRegistry.get(postId);
  if (!data) return;
  const { baseCard, finalCard, chain, totals } = data;

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const popup = isIOS ? openPosterPopup() : null;

  const POST_W = 1730, POST_H = 2160;
  const isWC       = hasWC2026Upgrade(chain);
  const chainTitle = chain[chain.length-1]?.name || 'EVO CHAIN';
  const svgUid     = 'p' + postId + '_' + Date.now();

    const usesDefaultTitleStyle = !(isWC && titleMode === 'nation');
  const bgUrl = usesDefaultTitleStyle
    ? 'https://mf-data.b-cdn.net/web/Evo%20Chains%20BG2.jpg'
    : 'https://mf-data.b-cdn.net/web/Evo%20Chains%20BG.jpg';

  let titleBlockHTML = '';
  if (isWC && titleMode === 'nation') {
    titleBlockHTML = await buildNationTitleHTML(baseCard, svgUid);
  } else {
    // Default title — used both when isWC && titleMode === 'default', and
    // for any chain that never had the WC modal choice in the first place
    // (no special styling for those, just the plain default treatment).
    const playerNameSVGMarkup = await evoPlayerNameSVG(baseCard.name, svgUid);
    titleBlockHTML = `
      <div class="post-player-name-title" style="position:absolute;top:175px;left:0;width:100%">
        ${playerNameSVGMarkup}
      </div>`;
  }

  const [titleSVGMarkup, namesSVGMarkup] = await Promise.all([
    evoChainTitleSVG(svgUid),
    evoNamesSVG(chain.map(e => e.name), svgUid),
  ]);

  const wrap = document.createElement('div');
  wrap.className = 'post-canvas-root';
  wrap.style.width  = POST_W + 'px';
  wrap.style.height = POST_H + 'px';

  wrap.innerHTML = `
    <img class="post-bg" crossorigin="anonymous" src="${bgUrl}">

    ${titleBlockHTML}
    <div class="post-divider" style="top:1747px;left:${(POST_W-651)/2}px"></div>

    <div class="post-base-card" style="top:960px;left:910px;transform:scale(2.22);transform-origin:top left">
      ${buildPostCardHTML(baseCard)}
    </div>

    <div class="post-main-card" style="top:600px;left:100px;transform:scale(3.55);transform-origin:top left">
      ${buildPostCardHTML(finalCard)}
    </div>

    <div class="post-upgrades" style="top:760px;left:910px;position:absolute;width:400px;z-index:2">
      +${totals.overall} OVR<br>
      +${totals.attack} ATK<br>
      +${totals.control} CON<br>
      +${totals.defense} DEF
    </div>

    <div class="evo-chain-title-img" style="position:absolute;top:1670px;left:0;width:100%">
      ${titleSVGMarkup}
    </div>
    <div class="post-path" style="position:absolute;top:1780px;left:0;width:100%">
      ${namesSVGMarkup}
    </div>
  `;

  document.body.appendChild(wrap);

  try {
    await Promise.all([
      document.fonts.load('900 72px "Cruyff Sans Expanded"'),
      document.fonts.load('italic 400 44px "Roboto Condensed"'),
      document.fonts.load('400 122px "Titan One"'),
    ]).catch(() => {});
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 100));

    const canvas = await html2canvas(wrap, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: 1,
      width: POST_W,
      height: POST_H,
    });

    const filename = `${(baseCard.name||'evo').replace(/\s+/g,'_')}_evo_post.png`;

    if (popup) {
      canvas.toBlob(blob => {
        if (!blob) { popup.close(); return; }
        popup.show(URL.createObjectURL(blob));
      }, 'image/png');
    } else {
      // Desktop path — unchanged.
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  } catch (e) {
    console.error('Post download failed', e);
    if (popup) popup.close();
    if (typeof window._cardShowToast === 'function') window._cardShowToast('Post download failed');
  } finally {
    wrap.remove();
  }
};

// ─────────────────────────────────────────────
// Download helper (keeps the existing global contract)
// ─────────────────────────────────────────────
window._evoDownloadCard = async function(cardEl, filename) {
  try {
    // offsetWidth/offsetHeight ignore CSS transforms (unlike
    // getBoundingClientRect), so these always give the card's true,
    // untransformed layout size — even on mobile where .card is
    // visually shrunk via transform: scale(0.7). Passing them in
    // explicitly stops html2canvas from sizing its output canvas off
    // the visually-scaled-down rect, which was the actual cause of
    // smaller downloads on mobile.
    const naturalWidth  = cardEl.offsetWidth;
    const naturalHeight = cardEl.offsetHeight;

    const canvas = await html2canvas(cardEl, {
      useCORS: true,
      backgroundColor: null,
      scale: 3,
      width: naturalWidth,
      height: naturalHeight,
      windowWidth: naturalWidth,
      windowHeight: naturalHeight,
      onclone: (clonedDoc, clonedEl) => {
        // Strip the mobile scale-down transform on the clone so the
        // content drawn actually fills the full-size canvas above.
        clonedEl.style.transform = 'none';
        clonedEl.style.marginBottom = '0';
      },
    });
    const a      = document.createElement('a');
    a.download   = filename;
    a.href       = canvas.toDataURL('image/png');
    a.click();
  } catch (e) {
    console.error('[EvoCards] download failed:', e);
  }
};
// ─────────────────────────────────────────────
// Evo chain list + total upgrades, appended under every evo card.
// Runs on ANY page that loads EvoCards.js (Cards.html, EvoChains.html, etc.)
// ─────────────────────────────────────────────
function escChain(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function unescapeChainAttr(str) {
  return String(str || '')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function attachChainList(cardWrap) {
  if (cardWrap.dataset.chainListAttached === '1') return;

  const dbSpan = cardWrap.querySelector('.card-dev-db');
  if (!dbSpan || dbSpan.textContent.trim() !== 'evo') return;

  const pre = cardWrap.querySelector('.card-dev-pre');
  if (!pre || !pre.dataset.dev) return;

  let fields;
  try {
    fields = JSON.parse(unescapeChainAttr(pre.dataset.dev));
  } catch {
    return;
  }

  const chainLabel = fields._evoChain?.stringValue;
  if (!chainLabel) return;

  const names = chainLabel.split('→').map(s => s.trim()).filter(Boolean);
  if (!names.length) return;

  const list = document.createElement('div');
  list.className = 'evo-chain-list';
  list.innerHTML = names.map((name, i) => `
    <div class="evo-chain-item">
      <div class="evo-chain-num">${i + 1}</div>
      <span>${escChain(name)}</span>
    </div>`).join('');

  // ── Totals row (Overall / Attack / Control / Defense) ──
  const totalsStr = fields._evoTotals?.stringValue || '';
  const getVal = (re) => {
    const m = totalsStr.match(re);
    return m ? m[1] : null;
  };
  const ovr = getVal(/([+-]?\d+)\s*OVR/);
  const atk = getVal(/([+-]?\d+)\s*ATK/);
  const ctl = getVal(/([+-]?\d+)\s*CTL/);
  const def = getVal(/([+-]?\d+)\s*DEF/);

  if (ovr || atk || ctl || def) {
    const totals = document.createElement('div');
    totals.className = 'evo-chain-totals';
    const pieces = [];
    if (ovr) pieces.push(`<span class="evo-total-pill evo-total-ovr">${ovr} OVR</span>`);
    if (atk) pieces.push(`<span class="evo-total-pill evo-total-atk">${atk} ATK</span>`);
    if (ctl) pieces.push(`<span class="evo-total-pill evo-total-ctl">${ctl} CTL</span>`);
    if (def) pieces.push(`<span class="evo-total-pill evo-total-def">${def} DEF</span>`);
    totals.innerHTML = pieces.join('');
    list.appendChild(totals);
  }

  const wrapperEl = cardWrap.querySelector('.card-wrapper');
  if (wrapperEl) {
    wrapperEl.insertAdjacentElement('afterend', list);
  } else {
    cardWrap.appendChild(list);
  }

  cardWrap.dataset.chainListAttached = '1';

  if (typeof window._applyDisplay === 'function') window._applyDisplay();
}

function scanForEvoCards(root) {
  if (!root.querySelectorAll) return;
  root.querySelectorAll('.card-and-breakdown').forEach(attachChainList);
}

function initChainListObserver() {
  const container = document.getElementById('card-container');
  if (!container) return;

  scanForEvoCards(container);

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList?.contains('card-and-breakdown')) attachChainList(node);
        scanForEvoCards(node);
      });
    }
  });
  observer.observe(container, { childList: true, subtree: true });
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('evo-card-styles')) return;
  const s = document.createElement('style');
  s.id    = 'evo-card-styles';
  s.textContent = `

/* ── Toggle button ──────────────────────────── */
.evo-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  border: 1.5px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06);
  color: #ccc;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Roboto Condensed', sans-serif;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.evo-toggle-btn:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
.evo-toggle-btn--active {
  background: rgba(34,197,94,0.15);
  border-color: rgba(34,197,94,0.5);
  color: #4ade80;
}

/* ── Evo chain badge overlaid at top-left of each evo card ─ */
.evo-chain-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 140px;
  pointer-events: none;
}

.evo-chain-name {
  display: block;
  background: rgba(34,197,94,0.85);
  color: #052e16;
  font-family: 'Roboto Condensed', sans-serif;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.evo-chain-pills {
  display: block;
  background: rgba(0,0,0,0.55);
  color: #d1fae5;
  font-family: 'Roboto Condensed', sans-serif;
  font-size: 8px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

/* ── Evo chain step list, appended under each evo card ── */
.evo-chain-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(0,0,0,0.08);
}
.evo-chain-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Roboto Condensed', sans-serif;
  font-size: 11px;
  color: var(--muted, #787878);
}
.evo-chain-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #22c55e;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

/* ── Evo chain totals row ── */
.evo-chain-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed rgba(0,0,0,0.08);
}
.evo-total-pill {
  font-family: 'Roboto Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(0,0,0,0.05);
}
.evo-total-ovr { color: #262626ff; }
.evo-total-atk { color: #16a34a; }
.evo-total-ctl { color: #2563eb; }
.evo-total-def { color: #dc2626; }


/* ── Social post offscreen canvas ───────────────────────── */
.post-canvas-root {
  position: fixed;
  left: -99999px;
  top: 0;
  overflow: hidden;
  font-family: 'Roboto Condensed', sans-serif;
}
.post-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.post-title {
  position: absolute; width: 100%;
  font-size: 72px; line-height: 144px;
  color: #ffffff;
  font-family: "Titan One";
  text-align: center;
  -webkit-text-stroke: 4px #1f1f1f;
  paint-order: stroke fill;
  z-index: 2;
}
.post-divider {
  position: absolute; width: 651px; height: 12px;
  background-color: #ffffff;
  background-image: linear-gradient(90deg, #dbdbdb 0%, #ffffff 50%, #dbdbdb 100%);
  border: 5px solid #1f1f1f; border-radius: 50px; z-index: 2;
}
.post-path {
  font-size: 57px; line-height: 63px; color: #ffffff; font-weight: 400;
  font-style: italic; font-family: "Roboto Condensed";
  text-align: center; -webkit-text-stroke: 4px #1f1f1f;
  paint-order: stroke fill; z-index: 2;
}
.evo-chain-title-img { z-index: 2; pointer-events: none; }
.post-upgrades {
  opacity: 0.651; font-size: 47px; line-height: 52px; color: #ffffff;
  font-weight: 400; font-style: italic; font-family: "Roboto Condensed";
  text-align: center; z-index: 2;
}
.post-main-card { position: absolute; z-index: 3; filter: drop-shadow(0 10px 25px rgba(0,0,0,0.5)); }
.post-base-card { position: absolute; z-index: 2; opacity: 0.97; }
.post-nation-title-line1 {
  font-family: "Cruyff Sans Expanded", sans-serif; font-size: 44px; color: #ffffff;
  font-weight: 900; -webkit-text-stroke: 3px #1f1f1f; paint-order: stroke fill; text-align: center;
}
.post-nation-title-line2 {
  font-family: "Cruyff Sans Expanded", sans-serif; font-size: 84px; color: #ffffff;
  font-weight: 900; -webkit-text-stroke: 5px #1f1f1f; paint-order: stroke fill;
  text-align: center; margin-top: 6px;
}

/* ── WC 2026 title choice modal ──────────────────────────── */
.wc-title-modal-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 1000; align-items: center; justify-content: center;
}
.wc-title-modal-overlay.open { display: flex; }
.wc-title-modal {
  background: #fff; border-radius: 14px; padding: 22px; width: 300px;
  max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 10px;
  font-family: 'Roboto Condensed', sans-serif;
}
.wc-title-modal-hdr { font-size: 15px; font-weight: 700; color: var(--dark, #262626); }
.wc-title-modal-sub { font-size: 12px; color: var(--muted, #787878); margin-bottom: 4px; }
.wc-title-modal-btn {
  padding: 10px 14px; border-radius: 8px; border: 1.5px solid var(--dark, #262626);
  background: var(--dark, #262626); color: #fff; font-weight: 700; font-size: 13px;
  cursor: pointer; font-family: 'Roboto Condensed', sans-serif;
}
.wc-title-modal-btn:hover { opacity: 0.85; }
.wc-title-modal-cancel {
  padding: 8px 14px; border-radius: 8px; border: 1.5px solid #ccc; background: #fff;
  color: var(--muted, #787878); font-size: 12px; cursor: pointer;
  font-family: 'Roboto Condensed', sans-serif;
}

/* ── Evo Paths tree modal ────────────────────────────────── */
.evo-tree-modal-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  z-index: 1000; align-items: center; justify-content: center; padding: 20px;
}
.evo-tree-modal-overlay.open { display: flex; }
.evo-tree-modal {
  background: var(--bg-light, #f6f6f6); border-radius: 14px; width: 100%; max-width: 920px;
  height: 85vh; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.3);
}
.evo-tree-modal-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--bg-grey, #e1e1e1);
  font-family: 'Roboto Condensed', sans-serif; font-weight: 700; font-size: 14px;
  color: var(--dark, #262626); flex-shrink: 0;
}
.evo-tree-close {
  background: var(--bg-grey, #e1e1e1); border: none; color: var(--dark, #262626);
  font-size: 16px; width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
  line-height: 1; display: flex; align-items: center; justify-content: center;
}
.evo-tree-close:hover { background: #cacaca; }
.evo-tree-scroll {
  flex: 1; min-height: 0; overflow: auto; padding: 10px;
  touch-action: pan-x pan-y;        /* one finger pans, the pinch is handled in JS */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  cursor: grab;
}
.evo-tree-scroll.evo-tree-dragging {
  cursor: grabbing;
  user-select: none;
}
.evo-tree-sizer { margin: 0 auto; }
.evo-tree-canvas { position: relative; transform-origin: 0 0; }
.evo-tree-hdr-btns { display: flex; align-items: center; gap: 6px; }
.evo-tree-zoom-btn {
  background: var(--bg-grey, #e1e1e1); border: none; color: var(--dark, #262626);
  font-size: 16px; font-weight: 700; min-width: 26px; height: 26px; padding: 0 8px;
  border-radius: 999px; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Roboto Condensed', sans-serif;
}
.evo-tree-zoom-btn:hover { background: #cacaca; }
.evo-tree-zoom-btn--text { font-size: 12px; }
.evo-tree-svg { position: absolute; top: 0; left: 0; pointer-events: none; }
.evo-tree-box {
  position: absolute; width: 190px; padding: 8px 10px; border-radius: 8px;
  background: #fff; border: 1.5px solid rgba(34,197,94,0.35);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08); font-family: 'Roboto Condensed', sans-serif;
}
.evo-tree-box--root {
  border-color: var(--dark, #262626); background: var(--dark, #262626);
}
.evo-tree-box--root .evo-tree-box-name,
.evo-tree-box--root .evo-tree-box-sub { color: #fff; }
.evo-tree-box-name {
  font-size: 12px; font-weight: 700; color: var(--dark, #262626);
  white-space: nowrap; overflow: hidden; text-overflow: ellaipsis;
}
.evo-tree-box-sub {
  font-size: 10px; color: #22c55e; font-weight: 700; margin-top: 2px;
}
.evo-tree-box--active {
  border-color: #f59e0b; border-width: 2px;
  background: #fff7ed;
  box-shadow: 0 0 0 3px rgba(245,158,11,0.18), 0 2px 6px rgba(0,0,0,0.08);
}
.evo-tree-box--active .evo-tree-box-name { color: #92400e; }
.evo-tree-box--active .evo-tree-box-sub  { color: #f59e0b; }
.evo-tree-link-active { filter: drop-shadow(0 0 2px rgba(245,158,11,0.5)); }
.evo-tree-legend {
  display: flex; align-items: center; gap: 8px; padding: 8px 18px;
  font-family: 'Roboto Condensed', sans-serif; font-size: 11px; color: var(--mid, #424242);
  border-bottom: 1px solid var(--bg-grey, #e1e1e1); flex-shrink: 0;
}
.evo-tree-legend-swatch {
  width: 12px; height: 12px; border-radius: 3px; background: #f59e0b; flex-shrink: 0;
}

/* ── Inline evo picker (Card-Detail Evo tab) ─────────────── */
.evo-pick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.evo-pick-box {
  position: relative;
  width: 168px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1.5px solid rgba(34,197,94,0.35);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  font-family: 'Roboto Condensed', sans-serif;
  text-align: left;
}
.evo-pick-box-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--dark, #262626);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evo-pick-box-sub {
  font-size: 10px;
  color: #22c55e;
  font-weight: 700;
  margin-top: 2px;
}
.evo-pick-box--clickable {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.evo-pick-box--clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
}
.evo-pick-box--disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: #ccc;
}
.evo-pick-box--disabled .evo-pick-box-sub { color: var(--muted, #787878); }

/* ── Inline evo tree (Card-Detail Evo tab) — reuses the 3-dot-menu tree look ── */
.evo-tree-inline-scroll {
  overflow: auto;
  max-width: 100%;
  border-radius: 10px;
  background: var(--bg-light, #f6f6f6);
  padding: 10px;
}
.evo-tree-box--clickable {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.evo-tree-box--clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
}
.evo-tree-box--dimmed {
  opacity: 0.3;
}

/* ── Poster preview popup (iPhone/iPad) ── */
.poster-popup-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.88);
  z-index: 2000; display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.poster-popup {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  max-width: 100%;
}
.poster-popup-hint {
  margin: 0; color: #fff; text-align: center;
  font-family: 'Roboto Condensed', sans-serif; font-size: 13px;
}
.poster-popup-img {
  max-width: 100%; max-height: calc(100vh - 110px);
  object-fit: contain; border-radius: 8px;
}
.poster-popup-close {
  position: absolute; top: 14px; right: 14px;
  width: 34px; height: 34px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.18); color: #fff; font-size: 22px;
  line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

`;
  document.head.appendChild(s);
}
// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  initChainListObserver();

  window._buildAndInjectEvoPlayers = async function(callback) {
    allEvos = await fetchAllEvos();
    uniqueEvosCache = null; // force recompute against the freshly loaded evos
    if (typeof window._setupEvoFilterSections === 'function') {
      const names = [...new Set(allEvos.map(e => e.name))].sort((a, b) => a.localeCompare(b));
      window._setupEvoFilterSections(names);
    }
    buildAndInjectEvoPlayers(callback);
  };
});

function setAllEvos(evos) {
  allEvos = evos || [];
  uniqueEvosCache = null; // force recompute against the newly set evos
}

export { fetchAllEvos, buildChains, applyEvo, chainTotals, fieldsToCard, meetsRequirement, buildEvoTree, layoutEvoTree, setAllEvos, _evoPostRegistry as evoPostRegistry, EVO_ELIGIBLE_COLORS as EVO_BANNED_COLORS };