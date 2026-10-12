/**
 * js/Filter.js  —  Madfut 26 Filter System (full rewrite)
 *
 * Features:
 *  - Desktop: persistent right sidebar with tabbed pages
 *  - Mobile: floating bottom search bar + swipe-up fullscreen sheet
 *  - Search with accent/diacritic normalisation
 *  - Sort: multi-rule, per-field asc/desc
 *  - Badges: Club / League / Nation / Card Design tabs
 *  - Positions: football pitch UI, 3 modes (both/main/alt)
 *  - Stats: dual range sliders + number inputs for all stats + FCM
 *  - Display toggles: download btn, FCM, fatal stats, alt positions, view/download mode
 *  - Misc: pack availability, tokens, rewards, etc.
 *
 * Bridge globals set by Card.js:
 *   window._filterAndSort   — triggers re-filter
 *   window._cardShowToast   — shows toast message
 *   window._allPlayers      — current player array
 *   window.colorMap         — card design map
 */

import { clubIdToName, leagueIdToName, nationIdToName } from './Mappings.js';

// ─────────────────────────────────────────────
// Page mode
// ─────────────────────────────────────────────
const PAGE_MODE   = window.PAGE_MODE || 'all';
const IS_LIVE_PAGE = PAGE_MODE === 'livePlayers';
const IS_EVO_CHAINS_PAGE = PAGE_MODE === 'evoChains';
const IS_LTM_PAGE  = PAGE_MODE === 'ltmOnly';
const IS_SQUAD_BUILDER = PAGE_MODE === 'squadBuilder';
// ─────────────────────────────────────────────
// Exported filter state  (read by Card.js)
// ─────────────────────────────────────────────
export const selectedClubs        = new Set();
export const selectedLeagues      = new Set();
export const selectedNations      = new Set();
export const selectedColors       = new Set();
export const selectedPositions    = new Set();
export const selectedAltPositions = new Set();
export const selectedRequiredPositions = new Set(); // "starred" — card must match ALL of these
export let   positionMode         = 'both'; // 'both' | 'main' | 'alt'

// ── LTM rating-tier filter — which rating tiers (67-98) to show for
// LTM cards. Starts fully populated (= show every tier).
export const LTM_MIN_RATING = 67;
export const LTM_MAX_RATING = 98;
export const selectedLtmRatings = new Set();
for (let r = LTM_MIN_RATING; r <= LTM_MAX_RATING; r++) selectedLtmRatings.add(r);

let ltmRatingPanelOpen = IS_LTM_PAGE; // dedicated LTM page: rating picker starts open
function ltmRatingButtonLabel() {
  const total = LTM_MAX_RATING - LTM_MIN_RATING + 1;
  if (selectedLtmRatings.size === total) return 'All ratings';
  if (selectedLtmRatings.size === 0) return 'None selected';
  return `${selectedLtmRatings.size} rating${selectedLtmRatings.size === 1 ? '' : 's'}`;
}

// ─────────────────────────────────────────────
// Color collections — ids come from color.json (all_gold, all_silver, ...).
// Names and icons are read from colorMap like any other design; this only
// defines which real card colors each collection matches.
// ─────────────────────────────────────────────
const GOLD_COLORS   = ['rare_gold',   'gold'];
const SILVER_COLORS = ['rare_silver', 'silver'];
const BRONZE_COLORS = ['rare_bronze', 'bronze'];
const UCL_KEYWORDS  = ['ucl', 'ecl', 'europa'];

const _fileNameOf = url => String(url || '').split('?')[0].split('/').pop().toLowerCase();

// UCL/ECL/Europa if the color id or any of its image file names contain a keyword.
const _uclCache = new Map();
function isUclColor(key) {
  if (_uclCache.has(key)) return _uclCache.get(key);
  const d     = window.colorMap?.[key];
  const names = [key, _fileNameOf(d?.url_big), _fileNameOf(d?.url_small), _fileNameOf(d?.url_micro)];
  const hit   = names.some(n => UCL_KEYWORDS.some(k => n.includes(k)));
  if (d) _uclCache.set(key, hit); // only cache once design data is loaded
  return hit;
}

const isMetalColor = k =>
  GOLD_COLORS.includes(k) || SILVER_COLORS.includes(k) || BRONZE_COLORS.includes(k);

const COLOR_COLLECTION_TESTS = {
  all_gold:    k => GOLD_COLORS.includes(k),
  all_silver:  k => SILVER_COLORS.includes(k),
  all_bronze:  k => BRONZE_COLORS.includes(k),
  all_special: k => !isMetalColor(k),
  all_ucl:     isUclColor,
};

// Used by Card.js — true if a card's color passes the current color selection.
// Selected entries are OR'd; each is either a normal color id or a collection id.
export function colorMatchesSelected(colorKey) {
  if (selectedColors.size === 0) return true;
  const key = (colorKey || '').trim().toLowerCase();
  for (const sel of selectedColors) {
    const test = COLOR_COLLECTION_TESTS[sel];
    if (test ? test(key) : sel === key) return true;
  }
  return false;
}

// Thumbnail for a collection in the badge picker
function collectionIcon(id) {
  const cm  = window.colorMap || {};
  const col = COLOR_COLLECTIONS[id];
  const key = (col.iconKey && cm[col.iconKey]) ? col.iconKey : Object.keys(cm).find(k => col.test(k));
  return cm[key]?.url_small || cm[key]?.url_micro || '';
}

const NO_BATCH_DBS = new Set(['ltm', 'realmExport', 'evo']);
let filePanelOpenDbs = new Set();

// Only files whose key is purely numeric are shown/toggleable in the
// file-number picker.
function numericFiles(dbValue) {
  const all = window._allFilesByDb?.[dbValue];
  if (!all) return [];
  return Array.from(all).filter(f => /^\d+$/.test(f) && (window._rawFileIdsByDb?.[dbValue]?.has(f) ?? true));
}
function extractFileNum(f) {
  return parseInt(f, 10);
}

function dbFileButtonLabel(dbValue) {
  const all = numericFiles(dbValue);
  if (!all.length) return 'No files';
  const selSet   = window._selectedFilesByDb?.[dbValue];
  const selCount = selSet ? all.filter(f => selSet.has(f)).length : all.length;
  if (selCount === all.length) return 'All files';
  if (selCount === 0) return 'None selected';
  return `${selCount} file${selCount === 1 ? '' : 's'}`;
}

function buildFileBatchPanel(dbValue) {
  const rawIds = window._rawFileIdsByDb?.[dbValue] || new Set();
  const all = numericFiles(dbValue).filter(f => rawIds.has(f));
  all.sort((a, b) => extractFileNum(b) - extractFileNum(a));
  const sel = window._selectedFilesByDb?.[dbValue] || new Set(all);
  return `
  <div style="padding:8px 0 12px">
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" class="evo-name-ctrl-btn" data-file-batch-ctrl="all" data-db="${dbValue}">Select All</button>
      <button type="button" class="evo-name-ctrl-btn" data-file-batch-ctrl="none" data-db="${dbValue}">Deselect All</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;max-height:180px;overflow-y:auto">
      ${all.map(f => `
      <label style="display:flex;align-items:center;justify-content:center;gap:4px;padding:5px 0;border-radius:5px;border:1px solid ${sel.has(f) ? 'var(--dark,#262626)' : '#ccc'};background:${sel.has(f) ? 'var(--dark,#262626)' : '#fff'};color:${sel.has(f) ? '#fff' : 'var(--mid)'};font-size:11px;font-weight:700;cursor:pointer;font-family:'Roboto Condensed',sans-serif">
        <input type="checkbox" class="file-batch-check" value="${escHtml(f)}" data-db="${dbValue}" ${sel.has(f) ? 'checked' : ''} style="display:none">
        ${escHtml(f)}
      </label>`).join('')}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// DB filter state — tracked in JS, not DOM
// ─────────────────────────────────────────────
const ALL_DB_SOURCES = ['updates','sbcGroups','objectives','evosElite','draftCups','ltm','livePlayers','realmExport','evo'];

// Default DB selection depends on the page: everywhere else starts with
// evo chains off; EvoChains.html starts (and resets back to) evo-only.
function defaultDbSources() {
  return IS_EVO_CHAINS_PAGE ? ['evo'] : ALL_DB_SOURCES.filter(s => s !== 'evo');
}

export const selectedDbs = new Set(defaultDbSources());

export const STAT_KEYS = ['PAC','SHO','PAS','DRI','DEF','PHY','attack','control','defense'];
export let   statFiltersState = {};
STAT_KEYS.forEach(k => { statFiltersState[k] = []; });

export let uniqueColors = [];
export function setUniqueColors(colors) { uniqueColors = colors; }

// ── Evo-specific filter state (Evolutions tab) ──────────────
window._deselectedEvos  = window._deselectedEvos  || new Set();
window._mustIncludeEvos = window._mustIncludeEvos || new Set();
window._customChainLen  = window._customChainLen  ?? null; // null = any length
let _evoNames = [];

// ── "My Evos" — a saved snapshot of the All Evolutions tick
// selection, persisted so it survives reloads. Save/Load just copy
// selection state; the enable toggle decides whether it's actively
// used to restrict results, independent of the live tick list.
const MY_EVOS_KEY = 'mfMyEvos_v1';

function loadMyEvos() {
  try {
    const raw = localStorage.getItem(MY_EVOS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveMyEvosToStorage() {
  try { localStorage.setItem(MY_EVOS_KEY, JSON.stringify([...window._myEvosSet])); }
  catch (e) { console.warn('[Filter] failed to save My Evos:', e); }
}

window._myEvosSet = window._myEvosSet || loadMyEvos();
// ─────────────────────────────────────────────
// Pitch layout  [pos, left%, top%]
// ─────────────────────────────────────────────
const PITCH_POSITIONS = [
  { pos: 'GK',  x: 50, y:  7 },
  { pos: 'RB',  x: 18, y: 22 },
  { pos: 'CB',  x: 37, y: 21 },
  { pos: 'CB',  x: 63, y: 21 },
  { pos: 'LB',  x: 82, y: 22 },
  { pos: 'CDM', x: 35, y: 37 },
  { pos: 'CDM', x: 65, y: 37 },
  { pos: 'RM',  x: 17, y: 52 },
  { pos: 'CM',  x: 37, y: 51 },
  { pos: 'CM',  x: 63, y: 51 },
  { pos: 'LM',  x: 83, y: 52 },
  { pos: 'RW',  x: 21, y: 66 },
  { pos: 'CAM', x: 50, y: 65 },
  { pos: 'LW',  x: 79, y: 66 },
  { pos: 'ST',  x: 37, y: 81 },
  { pos: 'ST',  x: 63, y: 81 },
];

const ALL_POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','RM','LM','LW','RW','ST'];

// ─────────────────────────────────────────────
// Sort state
// ─────────────────────────────────────────────
const SORT_FIELDS_BEFORE_FATAL = ['Rating','Date','Added At'];
const SORT_FIELDS_AFTER_FATAL  = ['Attack','Control','Defense','Net Fatal','Total Fatal','PAC','SHO','PAS','DRI','DEF','PHY','Name','Position'];

const FATAL_TIER_FIELDS = ['highest_fatal','second_highest_fatal','third_highest_fatal'];
const FATAL_TIER_LABELS = {
  highest_fatal:        'Highest Fatal',
  second_highest_fatal: '2nd Highest Fatal',
  third_highest_fatal:  '3rd Highest Fatal',
};

const NET_FATAL_TIER_FIELDS = ['net_fatal','net_fatal_2nd','net_fatal_3rd'];
const NET_FATAL_TIER_LABELS = {
  net_fatal:      'Net Fatal (Highest)',
  net_fatal_2nd:  'Net Fatal (2nd)',
  net_fatal_3rd:  'Net Fatal (3rd)',
};

function fatalTierOptionsForRule(index) {
  const allUsed = new Set(sortRules.map(r => r.field).filter(f => FATAL_TIER_FIELDS.includes(f)));
  const allNetUsed = new Set(sortRules.map(r => r.field).filter(f => NET_FATAL_TIER_FIELDS.includes(f)));
  const currentField = sortRules[index]?.field;

  const usedByOthers = new Set(allUsed);
  if (FATAL_TIER_FIELDS.includes(currentField)) usedByOthers.delete(currentField);

  const netUsedByOthers = new Set(allNetUsed);
  if (NET_FATAL_TIER_FIELDS.includes(currentField)) netUsedByOthers.delete(currentField);

  const unlocked = ['highest_fatal'];
  if (allUsed.has('highest_fatal')) unlocked.push('second_highest_fatal');
  if (allUsed.has('highest_fatal') && allUsed.has('second_highest_fatal')) unlocked.push('third_highest_fatal');

  const netUnlocked = ['net_fatal'];
  if (allNetUsed.has('net_fatal')) netUnlocked.push('net_fatal_2nd');
  if (allNetUsed.has('net_fatal') && allNetUsed.has('net_fatal_2nd')) netUnlocked.push('net_fatal_3rd');

  return [
    ...unlocked
      .filter(f => f === currentField || !usedByOthers.has(f))
      .map(f => ({ value: f, label: FATAL_TIER_LABELS[f] })),
    ...netUnlocked
      .filter(f => f === currentField || !netUsedByOthers.has(f))
      .map(f => ({ value: f, label: NET_FATAL_TIER_LABELS[f] })),
  ];
}


export let sortRules = [{ field: window._defaultSortField || 'date', dir: 'desc' }];

// ─────────────────────────────────────────────
// Display state
// ─────────────────────────────────────────────
export const displayState = {
  showFCM:         false,
  showFatal:       true,
  showAltPos:      true,
  showBreakdown:   false,
  showChainList:   true,
};
// Download-specific visibility (independent from view toggles)
export const downloadState = {
  showFCM:       false,
  showFatal:     true,
  showAltPos:    true,
  showBreakdown: false,
};

// ─────────────────────────────────────────────
// Misc state
// ─────────────────────────────────────────────
export const miscState = {
  // Packable filters (packable field) — each has a True and a False side
  inPacks:        false,
  notInPacks:     false,
  objReward:      false,
  notObjReward:   false,
  sbcReward:      false,
  notSbcReward:   false,
  cupReward:      false,
  notCupReward:   false,
  evoReward:      false,
  notEvoReward:   false,
  // Boolean filters
  inTokens:        false,
  notInTokens:     false,
  inPicks:         false,
  notInPicks:      false,
  tradable:        false,
  untradeable:     false,
  totw:            false,
  notTotw:         false,
  totwWeek:        '',   // empty = any week, number = specific week (1-30)
  genderMen:       false,
  genderWomen:     false,
  dynamicImage:    false,
  notDynamicImage: false,
};

// ─────────────────────────────────────────────
// Bridge helpers
// ─────────────────────────────────────────────
function triggerFilter()      { if (typeof window._filterAndSort === 'function') window._filterAndSort(); }
function showToast(msg)       { if (typeof window._cardShowToast === 'function') window._cardShowToast(msg); }
function allPlayers()         { return window._allPlayers || []; }

// ─────────────────────────────────────────────
// Accent / diacritic normalisation
// ─────────────────────────────────────────────
function normalise(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Export so Card.js can use it for search
export { normalise };

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────
let sidebarBody      = null;
let sheetBody        = null;
let mobileSearch     = null;
let mobileSheet      = null;
let fabBadge         = null;
let activeTagsBar    = null;

// ─────────────────────────────────────────────
// Current pages
// ─────────────────────────────────────────────
let desktopPage = 'search';
let mobilePage  = 'search';

// Single source of truth for section labels — used by both the desktop
// sidebar and the mobile sheet so they never drift out of sync.
const SECTION_LABELS = {
  sort:      'Sort',
  search:    'Database Sources',
  badges:    'Card Elements',
  evos:      'Evolutions',
  positions: 'Positions',
  stats:     'Stats',
  display:   'Display',
  misc:      'Misc',
};

// Single source of truth for section ORDER — change this list to reorder
// the folders; desktop sidebar and mobile sheet both read from it.
const SECTION_ORDER = IS_EVO_CHAINS_PAGE
  ? ['sort', 'evos', 'badges', 'positions', 'stats', 'display', 'misc']
  : IS_LIVE_PAGE
  ? ['sort', 'badges', 'positions', 'stats', 'display', 'misc']
  : ['sort', 'search', 'evos', 'badges', 'positions', 'stats', 'display', 'misc'];

function getVisiblePages() {
  return SECTION_ORDER.filter(p => p !== 'evos' || selectedDbs.has('evo'));
}

// ─────────────────────────────────────────────
// Page builders
// ─────────────────────────────────────────────
function buildPage(page) {
  switch (page) {
    case 'search':    return buildSearchPage();
    case 'sort':      return buildSortPage();
    case 'badges':    return buildBadgesPage();
    case 'positions': return buildPositionsPage();
    case 'stats':     return buildStatsPage();
    case 'display':   return buildDisplayPage();
    case 'misc':      return buildMiscPage();
    case 'evos':      return buildEvosPage();
    default:          return '<div style="padding:20px;color:#555">Coming soon</div>';
  }
}

// ── STANDALONE SEARCH BAR (rendered above the collapsible sections) ──
function buildSearchBarHTML() {
  const searchVal = window._currentSearch || '';
  const isSmall   = !!window._smallCardsMode;
  return `
  <div class="card-size-toggle-row">
    <button class="card-size-btn ${!isSmall ? 'active' : ''}" id="cardSizeBig">Big</button>
    <button class="card-size-btn ${isSmall ? 'active' : ''}" id="cardSizeSmall">Small</button>
  </div>
  <div class="fs-search-wrap standalone-search-wrap">
    <input class="fs-search-input" type="text" id="desktopSearchInput"
      placeholder="Search player name…"
      value="${escHtml(searchVal)}"
      autocomplete="off">
    <button class="fs-search-clear" id="desktopSearchClear">×</button>
  </div>
  ${IS_LIVE_PAGE ? `
  <div class="display-toggle-row standalone-live-toggle">
    <span class="display-toggle-label">Show upgraded cards only</span>
    <label class="toggle-switch">
      <input type="checkbox" id="liveUpgradedOnlyToggle" ${window._liveUpgradedOnly ? 'checked' : ''}>
      <span class="toggle-slider"></span>
    </label>
  </div>` : ''}`;
}

function bindSearchBarEvents(container) {
  if (!container) return;
  const inp = container.querySelector('#desktopSearchInput');
  const clr = container.querySelector('#desktopSearchClear');
  if (inp) {
    inp.addEventListener('input', e => {
      window._currentSearch = e.target.value;
      if (mobileSearch) mobileSearch.value = e.target.value;
      triggerFilter();
      updateActiveFilters();
    });
  }
  if (clr) {
    clr.addEventListener('click', () => {
      if (inp) inp.value = '';
      window._currentSearch = '';
      if (mobileSearch) mobileSearch.value = '';
      triggerFilter();
      updateActiveFilters();
    });
  }
  container.querySelector('#liveUpgradedOnlyToggle')?.addEventListener('change', e => {
    window._liveUpgradedOnly = e.target.checked;
    triggerFilter();
  });

  container.querySelector('#cardSizeBig')?.addEventListener('click', () => {
    window._smallCardsMode = false;
    document.getElementById('card-container')?.classList.remove('small-card-mode');
    // Re-render the search bar so the active button updates
    container.innerHTML = buildSearchBarHTML();
    bindSearchBarEvents(container);
    triggerFilter();
    // Display section shows/hides the Evo chain list toggle based on card size
    if (sidebarBody) renderAllSections(sidebarBody);
    if (sheetBody)   renderMobileSheet();
  });

  container.querySelector('#cardSizeSmall')?.addEventListener('click', () => {
    window._smallCardsMode = true;
    document.getElementById('card-container')?.classList.add('small-card-mode');
    container.innerHTML = buildSearchBarHTML();
    bindSearchBarEvents(container);
    triggerFilter();
    if (sidebarBody) renderAllSections(sidebarBody);
    if (sheetBody)   renderMobileSheet();
  });
}

// ── DATABASE SOURCE PAGE (was "search") ──────
function buildSearchPage() {
  // Squad Builder has no standalone pinned search bar in its picker
  // sidebar (that bar lives outside .filter-sidebar-body, which is the
  // only thing that gets moved into the picker panel) — so give it a
  // real search row here instead, inside the section that does move.
  const searchFieldHTML = '';
  const html = `
  <div class="page-pad">
    ${searchFieldHTML}
    <div class="db-filter-group">
      ${dbSources().map(s => {
        if (s.value === 'ltm') {
          return `
      <div id="ltmDbRow" style="border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;align-items:center;padding:7px 0;min-height:40px;box-sizing:border-box">
          <label class="fs-check-row" style="flex:1;padding:0;border:none;cursor:pointer">
            <input type="checkbox" class="db-filter" value="ltm" ${selectedDbs.has('ltm') ? 'checked' : ''}>
            <div class="fs-check-label">${s.label}</div>
          </label>
          <button type="button" id="ltmRatingToggleBtn"
            style="flex-shrink:0;font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px;border:1px solid #ccc;background:${ltmRatingPanelOpen ? 'var(--dark,#262626)' : '#fff'};color:${ltmRatingPanelOpen ? '#fff' : 'var(--mid)'};cursor:pointer;font-family:'Roboto Condensed',sans-serif">
            ${ltmRatingButtonLabel()} ▾
          </button>
        </div>
        ${ltmRatingPanelOpen ? buildLtmRatingPanel() : ''}
      </div>`;
        }
        if (NO_BATCH_DBS.has(s.value)) {
          return `
      <label class="fs-check-row" style="padding:7px 0;min-height:40px;box-sizing:border-box;align-items:center;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer">
        <input type="checkbox" class="db-filter" value="${s.value}" ${selectedDbs.has(s.value) ? 'checked' : ''}>
        <div class="fs-check-label">${s.label}</div>
      </label>`;
        }
        const isOpen = filePanelOpenDbs.has(s.value);
        return `
      <div id="dbRow_${s.value}" style="border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;align-items:center;padding:7px 0;min-height:40px;box-sizing:border-box">
          <label class="fs-check-row" style="flex:1;padding:0;border:none;cursor:pointer">
            <input type="checkbox" class="db-filter" value="${s.value}" ${selectedDbs.has(s.value) ? 'checked' : ''}>
            <div class="fs-check-label">${s.label}</div>
          </label>
          <button type="button" class="file-batch-toggle-btn" data-file-batch-toggle="${s.value}"
            style="flex-shrink:0;font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px;border:1px solid #ccc;background:${isOpen ? 'var(--dark,#262626)' : '#fff'};color:${isOpen ? '#fff' : 'var(--mid)'};cursor:pointer;font-family:'Roboto Condensed',sans-serif">
            ${dbFileButtonLabel(s.value)} ▾
          </button>
        </div>
        ${isOpen ? buildFileBatchPanel(s.value) : ''}
      </div>`;
      }).join('')}
    </div>
  </div>`;
  return html;
}

function dbSources() {
  return [
    { value: 'updates',     label: 'Updates'           },
    { value: 'sbcGroups',   label: 'SBC Groups'        },
    { value: 'objectives',  label: 'Objectives'        },
    { value: 'evosElite',   label: 'Elite Evos'        },
    { value: 'draftCups',   label: 'Draft Cups'        },
    { value: 'ltm',         label: 'LTM Cards'         },
    { value: 'livePlayers', label: 'Live Players'      },
    { value: 'realmExport', label: 'Base Cards (Realm)'},
    { value: 'evo',         label: 'Evo Chains'        },
  ];
}

function buildLtmRatingPanel() {
  const ratings = [];
  for (let r = LTM_MAX_RATING; r >= LTM_MIN_RATING; r--) ratings.push(r);
  return `
  <div id="ltmRatingPanel" style="padding:8px 0 12px">
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" class="evo-name-ctrl-btn" data-ltm-rating-ctrl="all">Select All</button>
      <button type="button" class="evo-name-ctrl-btn" data-ltm-rating-ctrl="none">Deselect All</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:6px">
      ${ratings.map(r => `
      <label style="display:flex;align-items:center;justify-content:center;gap:4px;padding:5px 0;border-radius:5px;border:1px solid ${selectedLtmRatings.has(r) ? 'var(--dark,#262626)' : '#ccc'};background:${selectedLtmRatings.has(r) ? 'var(--dark,#262626)' : '#fff'};color:${selectedLtmRatings.has(r) ? '#fff' : 'var(--mid)'};font-size:11px;font-weight:700;cursor:pointer;font-family:'Roboto Condensed',sans-serif">
        <input type="checkbox" class="ltm-rating-check" value="${r}" ${selectedLtmRatings.has(r) ? 'checked' : ''} style="display:none">
        ${r}
      </label>`).join('')}
    </div>
  </div>`;
}

// ── SORT PAGE ────────────────────────────────
// Fields where duplicates across rules make no sense — only one rule
// per field is ever meaningful (sorting by Rating twice changes nothing).
// Fatal tier fields are excluded here because they have their own
// unlocking logic via fatalTierOptionsForRule.
const SINGLE_USE_FIELDS = new Set([
  ...SORT_FIELDS_BEFORE_FATAL.map(f => f.toLowerCase().replace(/ /g,'_')),
  ...SORT_FIELDS_AFTER_FATAL.map(f => f.toLowerCase().replace(/ /g,'_')),
]);

function buildSortPage() {
  return `
  <div class="sort-page-wrap">
    ${sortRules.map((r, i) => {
      // Fields already used by OTHER rules that are single-use
      const usedElsewhere = new Set(
        sortRules
          .filter((_, j) => j !== i)
          .map(rule => rule.field)
          .filter(f => SINGLE_USE_FIELDS.has(f))
      );

      const options = [
        ...SORT_FIELDS_BEFORE_FATAL.map(f => {
          const val = f.toLowerCase().replace(/ /g,'_');
          return { value: val, label: f, disabled: usedElsewhere.has(val) };
        }),
        ...fatalTierOptionsForRule(i).map(o => ({ ...o, disabled: false })),
        ...SORT_FIELDS_AFTER_FATAL.map(f => {
          const val = f.toLowerCase().replace(/ /g,'_');
          return { value: val, label: f, disabled: usedElsewhere.has(val) };
        }),
      ];

      return `
    <div class="sort-rule-card">
      <div class="sort-rule-top">
        <span class="sort-rule-label">Rule ${i + 1}</span>
        ${i > 0 ? `<button class="sort-rule-remove" data-remove="${i}">×</button>` : ''}
      </div>
      <select class="sort-field-select" data-sort-field="${i}">
${options.map(o => `<option value="${o.value}" ${r.field === o.value ? 'selected' : ''} ${o.disabled ? 'disabled style="color:#ccc"' : ''}>${o.label}${o.disabled ? ' ✓' : ''}</option>`).join('')}      </select>
      <div class="sort-dir-btns">
        <button class="sort-dir-btn ${r.dir === 'asc' ? 'active' : ''}" data-sort-dir="${i}" data-val="asc">↑ Asc</button>
        <button class="sort-dir-btn ${r.dir === 'desc' ? 'active' : ''}" data-sort-dir="${i}" data-val="desc">↓ Desc</button>
      </div>
    </div>`;
    }).join('')}
    ${sortRules.length < 5 ? `<button class="sort-add-btn" id="sortAddBtn">+ Add sort rule</button>` : ''}
  </div>`;
}

// ── BADGES PAGE ──────────────────────────────
let badgeTab    = 'clubs';
let badgeSearch = '';

const BADGE_TAB_LABELS = { clubs: 'Club', leagues: 'League', nations: 'Nation', design: 'Rarity ' };

function buildBadgesPage() {
  const tabs   = ['clubs', 'leagues', 'nations', 'design'];
  const selSet = getBadgeSel();

  // Selected items chips
  const selectedItems = [...getBadgeSel()].map(id => {
    const name = _badgeName(id);
    const img  = getBadgeImg(id);
    const imgEl = img
      ? `<img src="${img}" onerror="this.style.display='none'" alt="" style="width:16px;height:16px;object-fit:contain;border-radius:2px;flex-shrink:0">`
      : '';
    return `<div class="badge-chip" data-badge-remove="${id}">${imgEl}<span>${escHtml(name)}</span><button>×</button></div>`;
  }).join('');

  // Dropdown list — only shown when badgeSearch has content
  const term  = badgeSearch.toLowerCase();
  const items = term
    ? getBadgeData().filter(([, n]) => n.toLowerCase().includes(term))
    : [];

  const dropdownHtml = term ? `
    <div class="badge-dropdown" id="badgeDropdown">
      ${items.length ? items.map(([id, name]) => {
        const sel   = selSet.has(id);
        const img   = getBadgeImg(id);
        const imgEl = img
          ? `<img src="${img}" onerror="this.style.display='none'" alt="">`
          : `<div class="badge-fallback">${name.substring(0,2).toUpperCase()}</div>`;
        return `<div class="fs-select-item ${sel ? 'selected' : ''}" data-badge-id="${id}" data-badge-name="${escHtml(name)}">
          ${imgEl}<span>${escHtml(name)}</span>${sel ? '<div class="fs-select-dot"></div>' : ''}
        </div>`;
      }).join('') : `<div class="badge-no-results">No results</div>`}
    </div>` : '';

  return `
  <div class="page-pad">
    <div class="badge-tabs">
      ${tabs.map(t => `<button class="badge-tab-btn ${badgeTab === t ? 'active' : ''}" data-badge-tab="${t}">${BADGE_TAB_LABELS[t]}</button>`).join('')}
    </div>
    ${selectedItems ? `<div class="badge-chips-row" id="badgeChipsRow">${selectedItems}</div>` : ''}
    <div class="fs-search-wrap badge-search-wrap" style="margin-bottom:0">
      <input class="fs-search-input" id="badgeSearchInput" type="text"
        placeholder="Search ${BADGE_TAB_LABELS[badgeTab]}…" value="${escHtml(badgeSearch)}"
        autocomplete="off">
      <button class="fs-search-clear" id="badgeSearchClear">×</button>
    </div>
    ${dropdownHtml}
  </div>`;
}

function _badgeName(id) {
  if (badgeTab === 'clubs')   return clubIdToName[id]   || id;
  if (badgeTab === 'leagues') return leagueIdToName[id] || id;
  if (badgeTab === 'nations') return nationIdToName[id] || id;
  return window.colorMap?.[id]?.name || id;
}

function getBadgeData() {
  if (badgeTab === 'clubs')   return Object.entries(clubIdToName).sort((a,b) => a[1].localeCompare(b[1]));
  if (badgeTab === 'leagues') return Object.entries(leagueIdToName).sort((a,b) => a[1].localeCompare(b[1]));
  if (badgeTab === 'nations') return Object.entries(nationIdToName).sort((a,b) => a[1].localeCompare(b[1]));
  // design: from colorMap
  const cm = window.colorMap || {};
  return Object.entries(cm).map(([id, d]) => [id, d.name || id]).sort((a,b) => a[1].localeCompare(b[1]));
}

function getBadgeSel() {
  if (badgeTab === 'clubs')   return selectedClubs;
  if (badgeTab === 'leagues') return selectedLeagues;
  if (badgeTab === 'nations') return selectedNations;
  return selectedColors;
}

function getBadgeImg(id) {
  if (badgeTab === 'clubs')   return `https://mf-data.b-cdn.net/27/Badges/Clubs/club_small_${id}.png`;
  if (badgeTab === 'leagues') return `https://mf-data.b-cdn.net/27/Badges/Leagues/league_small_${id}.png`;
  if (badgeTab === 'nations') return `https://mf-data.b-cdn.net/27/Badges/Nations/nation_small_${id}.png`;
  const cm = window.colorMap || {};
  return cm[id]?.url_small || cm[id]?.url_micro || '';
}

// ── POSITIONS PAGE ───────────────────────────
// Row layout: label row + position rows
const POSITION_ROWS = [
  { positions: ['LW', 'ST', 'RW'],       group: 'attack'  },
  { positions: ['LM', 'CAM', 'RM'],       group: 'mid'     },
  { positions: ['CM', 'CB', 'CDM'],       group: 'mid'     },
  { positions: ['LB', 'GK', 'RB'],        group: 'defend'  },
];

const POSITION_GROUPS = {
  attack: ['LW', 'ST', 'RW'],
  mid:    ['LM', 'CAM', 'RM', 'CM', 'CDM'],
  defend: ['LB', 'CB', 'RB', 'GK'],
};

function buildPositionsPage() {
  // Group header highlight state
  const groupMainState = {
    attack: POSITION_GROUPS.attack.every(p => selectedPositions.has(p)),
    mid:    POSITION_GROUPS.mid.every(p => selectedPositions.has(p)),
    defend: POSITION_GROUPS.defend.every(p => selectedPositions.has(p)),
  };
  const groupAltState = {
    attack: POSITION_GROUPS.attack.every(p => selectedAltPositions.has(p)),
    mid:    POSITION_GROUPS.mid.every(p => selectedAltPositions.has(p)),
    defend: POSITION_GROUPS.defend.every(p => selectedAltPositions.has(p)),
  };

  function groupBtnClass(group) {
    const main = groupMainState[group];
    const alt  = groupAltState[group];
    if (positionMode === 'both' && main && alt) return 'pos-group-btn sel-both';
    if (positionMode === 'both' && main)        return 'pos-group-btn sel-main';
    if (positionMode === 'both' && alt)         return 'pos-group-btn sel-alt';
    if (positionMode === 'main' && main)        return 'pos-group-btn sel-main';
    if (positionMode === 'alt'  && alt)         return 'pos-group-btn sel-alt';
    return 'pos-group-btn';
  }

  const rows = POSITION_ROWS.map(row => {
    const btns = row.positions.map(pos => {
      const isMain     = selectedPositions.has(pos);
      const isAlt      = selectedAltPositions.has(pos);
      const isSelected = isMain || isAlt;
      const isStarred  = selectedRequiredPositions.has(pos);
      let cls = 'pos-rect-btn';
      if (isMain && isAlt)  cls += ' sel-both';
      else if (isMain)      cls += ' sel-main';
      else if (isAlt)       cls += ' sel-alt';
      if (isStarred) cls += ' starred';
      // Star only shows once a position is actually selected (main/alt/both) —
      // starring means "every card shown must match this position".
      const starHTML = isSelected
        ? `<span class="pos-star-btn${isStarred ? ' active' : ''}" data-star-pos="${pos}" title="Require this position on every card"></span>`
        : '';
      return `<button class="${cls}" data-pos="${pos}">${pos}${starHTML}</button>`;
    }).join('');
    return `<div class="pos-row">${btns}</div>`;
  }).join('');

  return `
  <div class="page-pad">
    <div class="pitch-mode-row">
      ${['both','main','alt'].map(m => `
      <button class="pitch-mode-btn ${positionMode === m ? 'active' : ''}" data-pos-mode="${m}">
        ${m === 'both' ? 'Both' : m === 'main' ? 'Main' : 'Alt'}
      </button>`).join('')}
      <div class="pos-info-wrap">
        <div class="pos-info-icon" tabindex="0">i</div>
        <div class="pos-info-tooltip">
          <strong>Main</strong> = position on card &amp; gameplay.<br>
          <strong>Alt</strong> = chemistry only.<br>
          <strong>Both</strong> = match either.<br><br>
          <em>Left + Right fade</em> = both selected.<br>
          <em>Left fade</em> = main selected.<br>
          <em>Right fade</em> = alt selected.
        </div>
      </div>
    </div>
    <div class="pos-group-header-row">
      <button class="${groupBtnClass('attack')}" data-pos-group="attack">Attackers</button>
      <button class="${groupBtnClass('mid')}"    data-pos-group="mid">Midfielders</button>
      <button class="${groupBtnClass('defend')}" data-pos-group="defend">Defenders</button>
    </div>
    <div class="pos-grid-wrap">
      ${rows}
    </div>
  </div>`;
}
// ── STATS PAGE ───────────────────────────────
const STAT_DEFS = [
  { key: 'PAC',     label: 'Pace',        max: 99,  group: 'card' },
  { key: 'SHO',     label: 'Shooting',    max: 99,  group: 'card' },
  { key: 'PAS',     label: 'Passing',     max: 99,  group: 'card' },
  { key: 'DRI',     label: 'Dribbling',   max: 99,  group: 'card' },
  { key: 'DEF',     label: 'Defending',   max: 99,  group: 'card' },
  { key: 'PHY',     label: 'Physical',    max: 99,  group: 'card' },
  { key: 'attack',  label: 'Attack',      max: 99,  group: 'fatal' },
  { key: 'control', label: 'Control',     max: 99,  group: 'fatal' },
  { key: 'defense', label: 'Defense',     max: 99,  group: 'fatal' },
];

const RATING_DEF = { key: 'rating', label: 'Rating', max: 99, group: 'card' };

if (!window.ratingState) window.ratingState = { min: 0, max: 99 };

let showStatSliders = false;

function buildStatsPage() {
  const allDefs   = [RATING_DEF, ...STAT_DEFS];
  const cardDefs  = allDefs.filter(d => d.group === 'card');
  const fatalDefs = allDefs.filter(d => d.group === 'fatal');

  return `
  <div class="page-pad">
    <button class="stat-slider-toggle-btn" id="statSliderToggleBtn">
      ${showStatSliders ? '▲ Hide sliders' : '▼ Show sliders'}
    </button>
    <div id="statSlidersWrap" style="display:${showStatSliders ? '' : 'none'}">
      <div class="stats-group-label">Card Stats</div>
      ${cardDefs.map(d => buildStatSlider(d)).join('')}
      <div class="stats-group-label" style="margin-top:6px">Fatal</div>
      ${fatalDefs.map(d => buildStatSlider(d)).join('')}
    </div>
    <div class="stats-group-label" style="margin-top:${showStatSliders ? '14' : '0'}px">Card Stats</div>
    ${cardDefs.map(d => buildStatNumOnly(d)).join('')}
    <div class="stats-group-label" style="margin-top:6px">Fatal</div>
    ${fatalDefs.map(d => buildStatNumOnly(d)).join('')}
  </div>`;
}

function buildStatNumOnly({ key, label, max }) {
  const [lo, hi] = getStatState(key);
  return `
  <div class="stat-num-only-row">
    <span class="stat-range-name">${label}</span>
    <div class="stat-num-row" style="margin-top:0">
      <input class="stat-num-input" type="number" min="0" max="${max}" value="${lo}"
        data-num-lo="${key}" data-max="${max}">
      <span class="stat-num-dash">–</span>
      <input class="stat-num-input" type="number" min="0" max="${max}" value="${hi}"
        data-num-hi="${key}" data-max="${max}">
    </div>
  </div>`;
}

function getStatState(key) {
  if (key === 'rating') return [window.ratingState.min, window.ratingState.max];
  const rules = statFiltersState[key] || [];
  const lo = rules.find(r => r.op === '>=')?.val ?? 0;
  const hi = rules.find(r => r.op === '<=')?.val ?? 99;
  return [lo, hi];
}

function buildStatSlider({ key, label, max }) {
  const [lo, hi] = getStatState(key);
  const pLo = (lo / max) * 100;
  const pHi = (hi / max) * 100;
  return `
  <div class="stat-range-wrap">
    <div class="stat-range-header">
      <span class="stat-range-name">${label}</span>
      <span class="stat-range-vals" id="srv_${key}">${lo} – ${hi}</span>
    </div>
    <div class="range-slider-track-wrap">
      <div class="range-track-bg"></div>
      <div class="range-track-fill" id="srf_${key}" style="left:${pLo}%;width:${pHi - pLo}%"></div>
      <input type="range" class="range-slider-input" min="0" max="${max}" value="${lo}" step="1"
        data-stat-lo="${key}" data-max="${max}" style="z-index:3">
      <input type="range" class="range-slider-input" min="0" max="${max}" value="${hi}" step="1"
        data-stat-hi="${key}" data-max="${max}" style="z-index:4">
    </div>
    <div class="stat-num-row">
      <input class="stat-num-input" type="number" min="0" max="${max}" value="${lo}"
        data-num-lo="${key}" data-max="${max}">
      <span class="stat-num-dash">–</span>
      <input class="stat-num-input" type="number" min="0" max="${max}" value="${hi}"
        data-num-hi="${key}" data-max="${max}">
    </div>
  </div>`;
}

// ── DISPLAY PAGE ─────────────────────────────
function buildDisplayPage() {
  const toggles = [
    { key: 'showFatal',     label: 'Fatal stats'    },
    { key: 'showAltPos',    label: 'Alt positions'  },
    ...((IS_EVO_CHAINS_PAGE && !window._smallCardsMode) ? [{ key: 'showChainList', label: 'Evo chain list' }] : []),
  ];
  const currentScale = window._downloadScale || 3;
  const scalePickerHTML = `
  <div class="display-toggle-row" style="margin-top:10px">
    <span class="display-toggle-label">Image scale</span>
    <div style="display:flex;gap:4px">
      ${[1,2,3,4,5].map(s => `
      <button class="dl-scale-btn${currentScale === s ? ' active' : ''}" data-scale="${s}"
        style="width:30px;height:30px;border-radius:6px;border:1px solid #ccc;background:${currentScale===s?'var(--dark)':'#fff'};color:${currentScale===s?'#fff':'var(--mid)'};font-size:12px;font-weight:700;cursor:pointer;font-family:'Roboto Condensed',sans-serif">
        ${s}×
      </button>`).join('')}
    </div>
  </div>`;
  return `
  <div class="page-pad">
    <div class="display-panel" id="displayPanel">
      ${toggles.map(({ key, label }) => `
      <div class="display-toggle-row">
        <span class="display-toggle-label">${label}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-display="${key}" ${displayState[key] ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('')}
      ${scalePickerHTML}
    </div>
  </div>`;
}

// ── MISC PAGE ────────────────────────────────
// Renders one True/False (or custom-labeled) pair for a boolean field.
// Checking one button clears the other, so a field is either the first
// state, the second state, or unset (no filter) — never both. The two
// buttons always sit right next to each other, beside the field's label.
function buildTfRow(fieldLabel, trueKey, falseKey, labels = ['True', 'False']) {
  return `
  <div class="tf-row">
    <span class="tf-row-label">${fieldLabel}</span>
    <div class="tf-btn-group">
      <label class="misc-chip-label tf-chip">
        <input type="checkbox" data-misc-tf="${trueKey}" data-misc-tf-pair="${falseKey}" ${miscState[trueKey] ? 'checked' : ''}>
        <span>${labels[0]}</span>
      </label>
      <label class="misc-chip-label tf-chip">
        <input type="checkbox" data-misc-tf="${falseKey}" data-misc-tf-pair="${trueKey}" ${miscState[falseKey] ? 'checked' : ''}>
        <span>${labels[1]}</span>
      </label>
    </div>
  </div>`;
}

function buildMiscPage() {
  return `
  <div class="misc-page-wrap">
    <div class="misc-group-label">Availability</div>
    <div class="misc-tf-list">
      ${buildTfRow('In Packs',   'inPacks',   'notInPacks')}
      ${buildTfRow('Obj Reward', 'objReward', 'notObjReward')}
      ${buildTfRow('SBC Reward', 'sbcReward', 'notSbcReward')}
      ${buildTfRow('Cup Reward', 'cupReward', 'notCupReward')}
      ${buildTfRow('Evo Reward', 'evoReward', 'notEvoReward')}
    </div>

    <div class="misc-tf-list">
      ${buildTfRow('In Tokens', 'inTokens', 'notInTokens')}
      ${buildTfRow('In Picks', 'inPicks', 'notInPicks')}
      ${buildTfRow('Tradable', 'tradable', 'untradeable')}
      ${buildTfRow('TOTW', 'totw', 'notTotw')}
      ${miscState.totw ? `
      <div class="misc-week-row">
        <span class="misc-week-label">Week</span>
        <input class="misc-week-input" type="number" min="1" max="30"
          placeholder="Any" value="${escHtml(miscState.totwWeek)}" id="totwWeekInput">
      </div>` : ''}
      ${buildTfRow('Gender', 'genderMen', 'genderWomen', ['Male', 'Female'])}
      ${buildTfRow('Dynamic', 'dynamicImage', 'notDynamicImage')}
    </div>
  </div>`;
}

// ── EVOS PAGE ────────────────────────────────
const EVO_CHECK_SVG = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Builds the Must Include list — always in stable alphabetical order.
// Ticking an item no longer reorders the list; only its own checkmark
// updates in place (see the click handler in bindPageEvents).
function buildMustIncludeItemsHTML() {
  const ordered = _evoNames.slice().sort((a, b) => a.localeCompare(b));

  return ordered.map(name => {
    const isSel = window._mustIncludeEvos.has(name);
    return `<div class="evo-name-item${isSel ? ' pinned' : ''}" data-must-evo="${escHtml(name)}">
      <div class="evo-name-check" style="${isSel ? 'background:var(--dark,#262626);border-color:var(--dark,#262626)' : ''}">
        ${isSel ? EVO_CHECK_SVG : ''}
      </div>
      <span>${escHtml(name)}</span>
    </div>`;
  }).join('');
}


function buildEvosPage() {
  const customLen = window._customChainLen ?? '';

  const evoItems = _evoNames.map(name => {
    const desel = window._deselectedEvos.has(name) ? ' deselected' : '';
    return `<div class="evo-name-item${desel}" data-evo="${escHtml(name)}">
      <div class="evo-name-check">${EVO_CHECK_SVG}</div><span>${escHtml(name)}</span>
    </div>`;
  }).join('');

  return `
  <div class="page-pad">
    <div class="chain-custom-len-row">
      <span class="chain-custom-len-label">Exact chain length</span>
      <input type="number" min="0" max="10" id="customChainLenInput" placeholder="Number" value="${customLen}">
      <button type="button" class="chain-len-any-btn" id="chainLenAnyBtn">Any</button>
    </div>

    <div class="evo-sub-heading">Must Include Evo</div>
    <div class="evo-name-controls">
      <button class="evo-name-ctrl-btn" data-must-ctrl="clear">Clear Selection</button>
    </div>
    <input class="evo-name-search" type="text" id="mustIncludeSearch" placeholder="Search evolutions…" style="margin-bottom:8px">
    <div class="evo-name-list" id="mustIncludeList" style="max-height:160px;overflow-y:auto">${buildMustIncludeItemsHTML()}</div>

    <div class="evo-heading-row">
      <div class="evo-sub-heading" style="margin:0">All Evolutions${window._myEvosSet.size ? ` <span style="opacity:0.55;font-weight:400;text-transform:none;letter-spacing:0">(${window._myEvosSet.size} saved)</span>` : ''}</div>
      <div class="pos-info-wrap">
        <div class="pos-info-icon" tabindex="0">i</div>
        <div class="pos-info-tooltip">
          Tick the evos to include in results.<br><br>
          <strong>Save</strong> stores your current tick selection as "My Evos".<br>
          <strong>Load</strong> restores that saved selection into the list below, replacing your current ticks.
        </div>
      </div>
    </div>
    <div class="evo-name-controls">
      <button class="evo-name-ctrl-btn" data-evo-ctrl="all">Select All</button>
      <button class="evo-name-ctrl-btn" data-evo-ctrl="none">Deselect All</button>
      <button class="evo-name-ctrl-btn evo-name-icon-btn" data-evo-ctrl="save-mine" title="Save current selection as My Evos">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>
          <path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>
        </svg>
        Save
      </button>
      <button class="evo-name-ctrl-btn evo-name-icon-btn" data-evo-ctrl="load-mine" title="Load My Evos into the list">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Load
      </button>
    </div>
    <input class="evo-name-search evo-list-search" type="text" placeholder="Search evolutions…" style="margin-bottom:8px">
    <div class="evo-name-list" id="allEvosList" style="max-height:160px;overflow-y:auto">${evoItems}</div>
  </div>`;
}
// ─────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderPageInto(container, page) {
  if (!container) return;
  container.innerHTML = buildPage(page);
  bindPageEvents(container, page);
}

// ─────────────────────────────────────────────
// Active filter tags
// ─────────────────────────────────────────────
export function updateActiveFilters() {
  const bar       = document.getElementById('activeTagsBar');
  const mobileBar = document.getElementById('mobileActiveTagsBar');
  if (!bar && !mobileBar) return;

  const tags = [];

  selectedClubs.forEach(id => {
    const name = clubIdToName[id] || id;
    tags.push({ text: `Club: ${name}`, remove: () => { selectedClubs.delete(id); triggerFilterAndRefresh(); } });
  });
  selectedLeagues.forEach(id => {
    const name = leagueIdToName[id] || id;
    tags.push({ text: `League: ${name}`, remove: () => { selectedLeagues.delete(id); triggerFilterAndRefresh(); } });
  });
  selectedNations.forEach(id => {
    const name = nationIdToName[id] || id;
    tags.push({ text: `Nation: ${name}`, remove: () => { selectedNations.delete(id); triggerFilterAndRefresh(); } });
  });
  selectedColors.forEach(c => {
    if (c.toLowerCase() === 'default') return;
    const name = window.colorMap?.[c]?.name || c;
    tags.push({ text: `Type: ${name}`, remove: () => { selectedColors.delete(c); triggerFilterAndRefresh(); } });
  });
  selectedPositions.forEach(p => {
    tags.push({ text: `Pos: ${p}`, remove: () => { selectedPositions.delete(p); triggerFilterAndRefresh(); } });
  });

  // Rating
  const rMin = window.ratingState?.min ?? 0;
  const rMax = window.ratingState?.max ?? 99;
  if (rMin > 0 || rMax < 99) {
    tags.push({ text: `Rating: ${rMin}–${rMax}`, remove: () => {
      window.ratingState.min = 0; window.ratingState.max = 99;
      triggerFilterAndRefresh();
    }});
  }

  // Stat filters
  STAT_KEYS.forEach(stat => {
    const rules = statFiltersState[stat] || [];
    const lo = rules.find(r => r.op === '>=');
    const hi = rules.find(r => r.op === '<=');
    const hasLo = lo && lo.val > 0;
    const hasHi = hi && hi.val < 99;
    if (hasLo || hasHi) {
      const loV = lo?.val ?? 0;
      const hiV = hi?.val ?? 99;
      tags.push({ text: `${stat.toUpperCase()}: ${loV}–${hiV}`, remove: () => {
        statFiltersState[stat] = [];
        triggerFilterAndRefresh();
      }});
    }
  });

  {
    const totalRatings = LTM_MAX_RATING - LTM_MIN_RATING + 1;
    if (selectedLtmRatings.size !== totalRatings) {
      tags.push({ text: `LTM Ratings: ${selectedLtmRatings.size}/${totalRatings}`, remove: () => {
        for (let r = LTM_MIN_RATING; r <= LTM_MAX_RATING; r++) selectedLtmRatings.add(r);
        triggerFilterAndRefresh();
      }});
    }
  }

if (window._mustIncludeEvos && window._mustIncludeEvos.size > 0) {
    tags.push({ text: `Must include: ${window._mustIncludeEvos.size} evo(s)`, remove: () => { window._mustIncludeEvos.clear(); triggerFilterAndRefresh(); } });
  }
  if (window._customChainLen !== null && window._customChainLen !== undefined) {
    tags.push({ text: `Chain: ${window._customChainLen} Evo${window._customChainLen === 1 ? '' : 's'}`, remove: () => { window._customChainLen = null; triggerFilterAndRefresh(); } });
  }
  if (window._deselectedEvos.size > 0) {
    tags.push({ text: `${window._deselectedEvos.size} evo(s) excluded`, remove: () => { window._deselectedEvos.clear(); triggerFilterAndRefresh(); } });
  }

const tagHTML = tags.map((t, i) =>
    `<div class="a-tag" data-tag="${i}">${escHtml(t.text)}<button data-tag-remove="${i}">×</button></div>`
  ).join('') + `<button class="clear-all-tags" id="clearAllTagsBtn">Clear all</button>`;

  const emptyHTML = '<span class="no-filters-hint">No filters active</span>';

  [bar, mobileBar].forEach(b => {
    if (!b) return;
    b.innerHTML = tags.length === 0 ? emptyHTML : tagHTML;
    b.querySelectorAll('[data-tag-remove]').forEach(btn => {
      const i = parseInt(btn.dataset.tagRemove);
      btn.addEventListener('click', () => tags[i].remove());
    });
    b.querySelector('#clearAllTagsBtn')?.addEventListener('click', clearAllFilters);
  });

  if (tags.length === 0) { updateMobileBadge(0); return; }
  updateMobileBadge(tags.length);
}

function updateMobileBadge(count) {
  const badge = document.getElementById('mobileFabBadge');
  if (!badge) return;
  badge.style.display = count > 0 ? 'block' : 'none';
  badge.textContent = count;
}

function triggerFilterAndRefresh() {
  triggerFilter();
  updateActiveFilters();
  // Re-render desktop single-page sidebar
  if (sidebarBody) renderAllSections(sidebarBody);
  renderPageInto(sheetBody, mobilePage);
}

// ─────────────────────────────────────────────
// Stat update helpers
// ─────────────────────────────────────────────
function applyStatLo(key, rawVal, max) {
  const hi  = getStatState(key)[1];
  const val = Math.max(0, Math.min(parseInt(rawVal) || 0, hi));
  _setStatLo(key, val, max);
}

function applyStatHi(key, rawVal, max) {
  const lo  = getStatState(key)[0];
  const val = Math.max(lo, Math.min(parseInt(rawVal) || max, max));
  _setStatHi(key, val, max);
}

function _setStatLo(key, val, max) {
  if (key === 'rating') { window.ratingState.min = val; }
  else {
    if (!statFiltersState[key]) statFiltersState[key] = [];
    const arr = statFiltersState[key];
    const idx = arr.findIndex(r => r.op === '>=');
    if (idx >= 0) arr[idx].val = val; else arr.push({ op: '>=', val });
  }
  refreshStatUI(key, max);
  triggerFilter();
  updateActiveFilters();
}

function _setStatHi(key, val, max) {
  if (key === 'rating') { window.ratingState.max = val; }
  else {
    if (!statFiltersState[key]) statFiltersState[key] = [];
    const arr = statFiltersState[key];
    const idx = arr.findIndex(r => r.op === '<=');
    if (idx >= 0) arr[idx].val = val; else arr.push({ op: '<=', val });
  }
  refreshStatUI(key, max);
  triggerFilter();
  updateActiveFilters();
}

function refreshStatUI(key, max) {
  const [lo, hi] = getStatState(key);
  const pLo = (lo / max) * 100;
  const pHi = (hi / max) * 100;

  [sidebarBody, sheetBody].forEach(container => {
    if (!container) return;
    const rv  = container.querySelector(`#srv_${key}`);
    const rf  = container.querySelector(`#srf_${key}`);
    const los = container.querySelectorAll(`[data-stat-lo="${key}"], [data-num-lo="${key}"]`);
    const his = container.querySelectorAll(`[data-stat-hi="${key}"], [data-num-hi="${key}"]`);
    if (rv) rv.textContent = `${lo} – ${hi}`;
    if (rf) { rf.style.left = pLo + '%'; rf.style.width = (pHi - pLo) + '%'; }
    los.forEach(el => { el.value = lo; });
    his.forEach(el => { el.value = hi; });
  });
}

// A position with no main/alt selection left can't be "required" anymore —
// drop its star so filtering doesn't keep demanding a position nothing
// is asking for.
function pruneRequiredIfDeselected(pos) {
  if (!selectedPositions.has(pos) && !selectedAltPositions.has(pos)) {
    selectedRequiredPositions.delete(pos);
  }
}

// ─────────────────────────────────────────────
// Bind events for a rendered page
// ─────────────────────────────────────────────
function bindPageEvents(container, page) {
  if (!container) return;

  // ── Database Source page (was "search") ──
  if (page === 'search') {
    if (IS_SQUAD_BUILDER) {
      const nameInp = container.querySelector('#sbFilterNameSearch');
      const nameClr = container.querySelector('#sbFilterNameSearchClear');
      nameInp?.addEventListener('input', e => {
        window._currentSearch = e.target.value;
        triggerFilter();
      });
      nameClr?.addEventListener('click', () => {
        if (nameInp) nameInp.value = '';
        window._currentSearch = '';
        triggerFilter();
      });
    }
    // DB filter checkboxes — update selectedDbs state, then trigger filter
    container.querySelectorAll('.db-filter').forEach(cb => {
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          selectedDbs.add(e.target.value);
        } else {
          selectedDbs.delete(e.target.value);
        }
        triggerFilter();
        updateActiveFilters();
        // Evolutions tab visibility depends on the 'evo' source specifically —
        // rebuild the tab list so it appears/disappears immediately.
        if (e.target.value === 'evo') {
          if (sidebarBody) renderAllSections(sidebarBody);
          if (sheetBody)   renderMobileSheet();
        }
      });
    });

    // LTM ratings toggle button + panel
    container.querySelector('#ltmRatingToggleBtn')?.addEventListener('click', () => {
      ltmRatingPanelOpen = !ltmRatingPanelOpen;
      renderPageInto(container, 'search');
    });
    container.querySelectorAll('.ltm-rating-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const r = parseInt(e.target.value);
        if (e.target.checked) selectedLtmRatings.add(r); else selectedLtmRatings.delete(r);
        renderPageInto(container, 'search');
        triggerFilter();
        updateActiveFilters();
      });
    });
    container.querySelector('[data-ltm-rating-ctrl="all"]')?.addEventListener('click', () => {
      for (let r = LTM_MIN_RATING; r <= LTM_MAX_RATING; r++) selectedLtmRatings.add(r);
      renderPageInto(container, 'search');
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('[data-ltm-rating-ctrl="none"]')?.addEventListener('click', () => {
      selectedLtmRatings.clear();
      renderPageInto(container, 'search');
      triggerFilter();
      updateActiveFilters();
    });
        // Batch (file number) toggle button + panel for non-LTM/non-Realm/non-Evo dbs
    container.querySelectorAll('[data-file-batch-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const db = btn.dataset.fileBatchToggle;
        if (filePanelOpenDbs.has(db)) filePanelOpenDbs.delete(db);
        else filePanelOpenDbs.add(db);
        renderPageInto(container, 'search');
      });
    });
    container.querySelectorAll('.file-batch-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const db = e.target.dataset.db;
        const val = e.target.value;
        if (!window._selectedFilesByDb[db]) {
          window._selectedFilesByDb[db] = new Set(window._allFilesByDb?.[db] || []);
        }
        if (e.target.checked) window._selectedFilesByDb[db].add(val);
        else window._selectedFilesByDb[db].delete(val);
        renderPageInto(container, 'search');
        triggerFilter();
        updateActiveFilters();
      });
    });
    container.querySelectorAll('[data-file-batch-ctrl="all"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const db      = btn.dataset.db;
        const current = window._selectedFilesByDb[db] || new Set(window._allFilesByDb?.[db] || []);
        numericFiles(db).forEach(f => current.add(f));
        window._selectedFilesByDb[db] = current;
        renderPageInto(container, 'search');
        triggerFilter();
        updateActiveFilters();
      });
    });
    container.querySelectorAll('[data-file-batch-ctrl="none"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const db      = btn.dataset.db;
        const current = window._selectedFilesByDb[db] || new Set(window._allFilesByDb?.[db] || []);
        numericFiles(db).forEach(f => current.delete(f));
        window._selectedFilesByDb[db] = current;
        renderPageInto(container, 'search');
        triggerFilter();
        updateActiveFilters();
      });
    });
  }
  // ── Sort page ──
  if (page === 'sort') {
    container.querySelectorAll('[data-sort-field]').forEach(sel => {
      sel.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.sortField);
        sortRules[i].field = e.target.value;
        triggerFilter();
        // Which fatal tiers are available on OTHER rules' dropdowns depends
        // on what was just picked here — refresh the page so options stay
        // accurate everywhere, not just this one select.
        renderPageInto(container, 'sort');
      });
    });
    container.querySelectorAll('[data-sort-dir]').forEach(btn => {
      btn.addEventListener('click', e => {
        const i   = parseInt(e.currentTarget.dataset.sortDir);
        const val = e.currentTarget.dataset.val;
        sortRules[i].dir = val;
        container.querySelectorAll(`[data-sort-dir="${i}"]`).forEach(b => {
          b.classList.toggle('active', b.dataset.val === val);
        });
        triggerFilter();
      });
    });
    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', e => {
        const i = parseInt(e.currentTarget.dataset.remove);
        sortRules.splice(i, 1);
        renderPageInto(container, 'sort');
        triggerFilter();
      });
    });
    container.querySelector('#sortAddBtn')?.addEventListener('click', () => {
      sortRules.push({ field: 'rating', dir: 'desc' });
      renderPageInto(container, 'sort');
    });
  }

  // ── Badges page ──
if (page === 'badges') {
    container.querySelectorAll('[data-badge-tab]').forEach(btn => {
      btn.addEventListener('click', e => {
        badgeTab    = e.currentTarget.dataset.badgeTab;
        badgeSearch = '';
        renderPageInto(container, 'badges');
      });
    });

    const bSearchInp = container.querySelector('#badgeSearchInput');
    const bSearchClr = container.querySelector('#badgeSearchClear');

    if (bSearchInp) {
      bSearchInp.addEventListener('input', e => {
        badgeSearch = e.target.value;
        // Re-render just the dropdown area
        const existing = container.querySelector('#badgeDropdown');
        const wrap     = container.querySelector('.badge-search-wrap');
        if (existing) existing.remove();

        const term  = badgeSearch.toLowerCase();
        const selSet = getBadgeSel();
        const items  = term ? getBadgeData().filter(([, n]) => n.toLowerCase().includes(term)) : [];

        if (term) {
          const dropdown = document.createElement('div');
          dropdown.className = 'badge-dropdown';
          dropdown.id        = 'badgeDropdown';
          dropdown.innerHTML = items.length ? items.map(([id, name]) => {
            const sel   = selSet.has(id);
            const img   = getBadgeImg(id);
            const imgEl = img
              ? `<img src="${img}" onerror="this.style.display='none'" alt="">`
              : `<div class="badge-fallback">${name.substring(0,2).toUpperCase()}</div>`;
            return `<div class="fs-select-item ${sel ? 'selected' : ''}" data-badge-id="${id}" data-badge-name="${escHtml(name)}">
              ${imgEl}<span>${escHtml(name)}</span>${sel ? '<div class="fs-select-dot"></div>' : ''}
            </div>`;
          }).join('') : `<div class="badge-no-results">No results</div>`;
          wrap?.insertAdjacentElement('afterend', dropdown);
          bindBadgeItems(container);
        }
      });
    }

    if (bSearchClr) {
      bSearchClr.addEventListener('click', () => {
        badgeSearch = '';
        if (bSearchInp) bSearchInp.value = '';
        renderPageInto(container, 'badges');
      });
    }

    // Chip remove buttons
    container.querySelectorAll('[data-badge-remove]').forEach(chip => {
      chip.addEventListener('click', e => {
        const id  = e.currentTarget.dataset.badgeRemove;
        const sel = getBadgeSel();
        sel.delete(id);
        renderPageInto(container, 'badges');
        triggerFilter();
        updateActiveFilters();
      });
    });

    bindBadgeItems(container);
  }

if (page === 'positions') {
// Mode buttons — only changes what future clicks do, never clears selections
    container.querySelectorAll('[data-pos-mode]').forEach(btn => {
      btn.addEventListener('click', e => {
        positionMode = e.currentTarget.dataset.posMode;
        _refreshPositionPage();
        // No triggerFilter here — selections unchanged, just UI mode
      });
    });

    // Star toggle — mark a selected position as "required" (AND logic).
    // Bound first + stopPropagation so it never falls through to the
    // pos-rect-btn handler below and re-toggles main/alt selection.
    container.querySelectorAll('[data-star-pos]').forEach(star => {
      star.addEventListener('click', e => {
        e.stopPropagation();
        const pos = e.currentTarget.dataset.starPos;
        if (selectedRequiredPositions.has(pos)) selectedRequiredPositions.delete(pos);
        else selectedRequiredPositions.add(pos);
        _refreshPositionPage();
        triggerFilter();
        updateActiveFilters();
      });
    });

    // Individual position buttons — always toggle both main and alt independently
    container.querySelectorAll('.pos-rect-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.closest('[data-star-pos]')) return; // handled above
        const pos = e.currentTarget.dataset.pos;
        let nowSelected;
        if (positionMode === 'main') {
          nowSelected = !selectedPositions.has(pos);
          if (!nowSelected) selectedPositions.delete(pos);
          else selectedPositions.add(pos);
        } else if (positionMode === 'alt') {
          nowSelected = !selectedAltPositions.has(pos);
          if (!nowSelected) selectedAltPositions.delete(pos);
          else selectedAltPositions.add(pos);
        } else {
          // 'both' — toggle main AND alt together so the card must match
          // as either main or alt (this is what makes it distinct from
          // plain Main mode and lights up the sel-both style).
          const isOn = selectedPositions.has(pos) || selectedAltPositions.has(pos);
          nowSelected = !isOn;
          if (isOn) {
            selectedPositions.delete(pos);
            selectedAltPositions.delete(pos);
          } else {
            selectedPositions.add(pos);
            selectedAltPositions.add(pos);
          }
        }
        // New selections default to required (starred). Deselecting a
        // position always drops its star — see pruneRequiredIfDeselected.
        if (nowSelected) selectedRequiredPositions.add(pos);
        pruneRequiredIfDeselected(pos);
        _refreshPositionPage();
        triggerFilter();
        updateActiveFilters();
      });
    });

    // Group header buttons
    container.querySelectorAll('[data-pos-group]').forEach(btn => {
      btn.addEventListener('click', e => {
        const group = e.currentTarget.dataset.posGroup;
        const positions = POSITION_GROUPS[group];
        const allMain = positions.every(p => selectedPositions.has(p));
        const allAlt  = positions.every(p => selectedAltPositions.has(p));

        let nowSelected;
        if (positionMode === 'main') {
          nowSelected = !allMain;
          if (allMain) positions.forEach(p => selectedPositions.delete(p));
          else         positions.forEach(p => selectedPositions.add(p));
        } else if (positionMode === 'alt') {
          nowSelected = !allAlt;
          if (allAlt) positions.forEach(p => selectedAltPositions.delete(p));
          else        positions.forEach(p => selectedAltPositions.add(p));
        } else {
          // both mode — toggle main AND alt together, same as individual buttons
          const allBoth = positions.every(p => selectedPositions.has(p) && selectedAltPositions.has(p));
          nowSelected = !allBoth;
          if (allBoth) {
            positions.forEach(p => { selectedPositions.delete(p); selectedAltPositions.delete(p); });
          } else {
            positions.forEach(p => { selectedPositions.add(p); selectedAltPositions.add(p); });
          }
        }
        // New selections default to required (starred); deselections drop it.
        if (nowSelected) positions.forEach(p => selectedRequiredPositions.add(p));
        positions.forEach(pruneRequiredIfDeselected);
        _refreshPositionPage();
        triggerFilter();
        updateActiveFilters();
      });
    });
  }


  function _refreshPositionPage() {
  if (sidebarBody) renderAllSections(sidebarBody);
  if (sheetBody)   renderMobileSheet();
}

  // ── Stats page ──
if (page === 'stats') {
    container.querySelector('#statSliderToggleBtn')?.addEventListener('click', () => {
      showStatSliders = !showStatSliders;
      if (sidebarBody) renderAllSections(sidebarBody);
      if (sheetBody)   renderMobileSheet();
    });
    container.querySelectorAll('[data-stat-lo]').forEach(inp => {
      inp.addEventListener('input', e => {
        applyStatLo(e.target.dataset.statLo, e.target.value, parseInt(e.target.dataset.max));
      });
    });
    container.querySelectorAll('[data-stat-hi]').forEach(inp => {
      inp.addEventListener('input', e => {
        applyStatHi(e.target.dataset.statHi, e.target.value, parseInt(e.target.dataset.max));
      });
    });
    container.querySelectorAll('[data-num-lo]').forEach(inp => {
      inp.addEventListener('change', e => {
        applyStatLo(e.target.dataset.numLo, e.target.value, parseInt(e.target.dataset.max));
      });
    });
    container.querySelectorAll('[data-num-hi]').forEach(inp => {
      inp.addEventListener('change', e => {
        applyStatHi(e.target.dataset.numHi, e.target.value, parseInt(e.target.dataset.max));
      });
    });
  }

// ── Display page ──
if (page === 'display') {
    // Toggles now affect both the on-screen view and the downloaded image
    container.querySelectorAll('[data-display]').forEach(inp => {
      inp.addEventListener('change', e => {
        const key = e.target.dataset.display;
        displayState[key]  = e.target.checked;
        downloadState[key] = e.target.checked;
        applyDisplayState();
      });
    });

    // Download scale picker
    container.querySelectorAll('.dl-scale-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const scale = parseInt(e.currentTarget.dataset.scale);
        window._downloadScale = scale;
        container.querySelectorAll('.dl-scale-btn').forEach(b => {
          const active = parseInt(b.dataset.scale) === scale;
          b.style.background = active ? 'var(--dark)' : '#fff';
          b.style.color      = active ? '#fff'        : 'var(--mid)';
          b.style.borderColor = active ? 'var(--dark)' : '#ccc';
        });
      });
    });
  }

  // ── Misc page ──
if (page === 'misc') {
    container.querySelectorAll('[data-misc]').forEach(inp => {
      inp.addEventListener('change', e => {
        miscState[e.target.dataset.misc] = e.target.checked;
        // Re-render to show/hide TOTW week input
        if (e.target.dataset.misc === 'totw') {
          if (sidebarBody) renderAllSections(sidebarBody);
          if (sheetBody)   renderMobileSheet();
        }
        triggerFilter();
        updateActiveFilters();
      });
    });

    // True/False pairs — checking one clears its opposite in state AND
    // in the DOM, so only one of True/False is ever active (or neither,
    // meaning "no filter" for that field).
    container.querySelectorAll('[data-misc-tf]').forEach(inp => {
      inp.addEventListener('change', e => {
        const key     = e.target.dataset.miscTf;
        const pairKey = e.target.dataset.miscTfPair;
        miscState[key] = e.target.checked;
        if (e.target.checked) {
          miscState[pairKey] = false;
          const pairInp = container.querySelector(`[data-misc-tf="${pairKey}"]`);
          if (pairInp) pairInp.checked = false;
        }
        // TOTW's True side reveals a week-number input — re-render so it
        // shows/hides immediately.
        if (key === 'totw' || pairKey === 'totw') {
          if (sidebarBody) renderAllSections(sidebarBody);
          if (sheetBody)   renderMobileSheet();
        }
        triggerFilter();
        updateActiveFilters();
      });
    });

    container.querySelector('#totwWeekInput')?.addEventListener('input', e => {
      miscState.totwWeek = e.target.value;
      triggerFilter();
      updateActiveFilters();
    });
  }

// ── Evos page ──
  if (page === 'evos') {
    container.querySelector('#customChainLenInput')?.addEventListener('input', e => {
      const raw = e.target.value;
      window._customChainLen = raw === '' ? null : Math.max(0, parseInt(raw) || 0);
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('#chainLenAnyBtn')?.addEventListener('click', () => {
      window._customChainLen = null;
      const inp = container.querySelector('#customChainLenInput');
      if (inp) inp.value = '';
      triggerFilter();
      updateActiveFilters();
    });
    // Must-include list — multi-select. Ticking an item now only toggles
    // its own checkmark in place; the list order never changes so items
    // don't jump around while browsing.
    const toggleEvoItemVisual = (item, isSel) => {
      item.classList.toggle('pinned', isSel);
      const check = item.querySelector('.evo-name-check');
      if (check) {
        check.style.background  = isSel ? 'var(--dark,#262626)' : '';
        check.style.borderColor = isSel ? 'var(--dark,#262626)' : '';
        check.innerHTML         = isSel ? EVO_CHECK_SVG : '';
      }
    };

    container.querySelector('#mustIncludeList')?.addEventListener('click', e => {
      const item = e.target.closest('[data-must-evo]');
      if (!item) return;
      const name = item.dataset.mustEvo;
      const nowSelected = !window._mustIncludeEvos.has(name);
      if (nowSelected) window._mustIncludeEvos.add(name);
      else window._mustIncludeEvos.delete(name);
      toggleEvoItemVisual(item, nowSelected);
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('[data-must-ctrl="clear"]')?.addEventListener('click', () => {
      window._mustIncludeEvos.clear();
      container.querySelectorAll('#mustIncludeList [data-must-evo]').forEach(item => toggleEvoItemVisual(item, false));
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('#mustIncludeSearch')?.addEventListener('input', e => {
      const q = normalise(e.target.value);
      container.querySelectorAll('#mustIncludeList [data-must-evo]').forEach(el => {
        el.style.display = (!q || normalise(el.dataset.mustEvo).includes(q)) ? '' : 'none';
      });
    });

    // All-evolutions list — toggle the clicked item's own class only
    container.querySelector('#allEvosList')?.addEventListener('click', e => {
      const item = e.target.closest('.evo-name-item[data-evo]');
      if (!item) return;
      const name = item.dataset.evo;
      if (window._deselectedEvos.has(name)) window._deselectedEvos.delete(name);
      else window._deselectedEvos.add(name);
      item.classList.toggle('deselected', window._deselectedEvos.has(name));
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('[data-evo-ctrl="all"]')?.addEventListener('click', () => {
      window._deselectedEvos.clear();
      container.querySelectorAll('.evo-name-item[data-evo]').forEach(el => el.classList.remove('deselected'));
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('[data-evo-ctrl="none"]')?.addEventListener('click', () => {
      _evoNames.forEach(n => window._deselectedEvos.add(n));
      container.querySelectorAll('.evo-name-item[data-evo]').forEach(el => el.classList.add('deselected'));
      triggerFilter();
      updateActiveFilters();
    });
    container.querySelector('.evo-list-search')?.addEventListener('input', e => {
      const q = normalise(e.target.value);
      container.querySelectorAll('[data-evo]').forEach(el => {
        el.style.display = (!q || normalise(el.dataset.evo).includes(q)) ? '' : 'none';
      });
    });

    // Save current tick selection as "My Evos"
    container.querySelector('[data-evo-ctrl="save-mine"]')?.addEventListener('click', () => {
      window._myEvosSet = new Set(_evoNames.filter(n => !window._deselectedEvos.has(n)));
      saveMyEvosToStorage();
      showToast(`Saved ${window._myEvosSet.size} evo(s) as My Evos`);
      if (sidebarBody) renderAllSections(sidebarBody);
      if (sheetBody)   renderMobileSheet();
    });

    // Restore a previously saved selection into the live tick list
    container.querySelector('[data-evo-ctrl="load-mine"]')?.addEventListener('click', () => {
      if (!window._myEvosSet.size) { showToast('No saved evos yet'); return; }
      window._deselectedEvos.clear();
      _evoNames.forEach(n => { if (!window._myEvosSet.has(n)) window._deselectedEvos.add(n); });
      triggerFilter();
      updateActiveFilters();
      if (sidebarBody) renderAllSections(sidebarBody);
      if (sheetBody)   renderMobileSheet();
    });
  }
}
function bindBadgeItems(container) {
  container.querySelectorAll('[data-badge-id]').forEach(item => {
    item.addEventListener('click', e => {
      const id   = e.currentTarget.dataset.badgeId;
      const name = e.currentTarget.dataset.badgeName;
      const sel  = getBadgeSel();
      if (sel.has(id)) sel.delete(id);
      else { sel.add(id); showToast(`${name} added`); }
      renderPageInto(container, 'badges');
      triggerFilter();
      updateActiveFilters();
    });
  });
}

// ─────────────────────────────────────────────
// Apply display state to DOM
// ─────────────────────────────────────────────
function applyDisplayState() {
  document.querySelectorAll('.fatal-meta-badge').forEach(el => {
    el.style.display = displayState.showFCM ? '' : 'none';
  });

  document.querySelectorAll('.fatals').forEach(el => {
    el.style.display = displayState.showFatal ? '' : 'none';
  });

  document.getElementById('card-container')?.classList.toggle('fatal-on', displayState.showFatal);
  document.querySelectorAll('.alt-positions').forEach(el => {
    el.style.display = displayState.showAltPos ? '' : 'none';
  });

  document.querySelectorAll('.fcm-breakdown').forEach(el => {
    el.style.display = displayState.showBreakdown ? '' : 'none';
  });
  window.showBreakdown = displayState.showBreakdown;

  document.querySelectorAll('.evo-chain-list').forEach(el => {
    el.style.display = (displayState.showChainList && !window._smallCardsMode) ? '' : 'none';
  });
}
// ─────────────────────────────────────────────
// Clear all filters
// ─────────────────────────────────────────────
export function clearAllFilters() {
  // Reset db sources back to this page's default (all non-evo sources
  // normally; evo-only on EvoChains.html), not literally every source.
  selectedDbs.clear();
  defaultDbSources().forEach(s => selectedDbs.add(s));

  selectedClubs.clear();
  selectedLeagues.clear();
  selectedNations.clear();
  selectedColors.clear();
  selectedPositions.clear();
  selectedAltPositions.clear();
  selectedRequiredPositions.clear();

  window.ratingState = { min: 0, max: 99 };
  STAT_KEYS.forEach(k => { statFiltersState[k] = []; });

  if (window._currentSearch !== undefined) {
    window._currentSearch = '';
    document.querySelectorAll('.fs-search-input, .mobile-search-input').forEach(inp => { inp.value = ''; });
  }

window._deselectedEvos.clear();
window._mustIncludeEvos.clear();
window._customChainLen = null;

selectedLtmRatings.clear();
for (let r = LTM_MIN_RATING; r <= LTM_MAX_RATING; r++) selectedLtmRatings.add(r);

sortRules.length = 0;
sortRules.push({ field: window._defaultSortField || 'date', dir: 'desc' });
triggerFilter();
  updateActiveFilters();
  if (sidebarBody) renderAllSections(sidebarBody);
  renderPageInto(sheetBody, mobilePage);
}

// ─────────────────────────────────────────────
// Rebuild helpers (called from Card.js after data loads)
// ─────────────────────────────────────────────
export function rebuildClubLeagueNationLists() {
  // Built on-demand in the badges page
}

export function rebuildColorFilterOptions() {
  // Built on-demand in badges page
}

export function buildPositionList() {
  if (sidebarBody) renderAllSections(sidebarBody);
  if (sheetBody && mobilePage === 'positions') renderPageInto(sheetBody, 'positions');
}

export function buildAltPositionList() { buildPositionList(); }

export function rebuildStatFiltersUI() {
  if (sidebarBody) renderAllSections(sidebarBody);
  if (sheetBody && mobilePage === 'stats') renderPageInto(sheetBody, 'stats');
}

export function initRatingSlider() {
  if (sidebarBody) renderAllSections(sidebarBody);
  if (sheetBody && mobilePage === 'stats') renderPageInto(sheetBody, 'stats');
}

// ─────────────────────────────────────────────
// Desktop sidebar page switching
// ─────────────────────────────────────────────
function switchDesktopPage(page) {
  desktopPage = page;
  document.querySelectorAll('.filter-sidebar .fpn-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  renderPageInto(sidebarBody, page);
}

function switchMobilePage(page) {
  mobilePage = page;
  document.querySelectorAll('.mobile-filter-sheet .fpn-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  renderPageInto(sheetBody, page);
}

// ─────────────────────────────────────────────
// Mobile sheet open / close
// ─────────────────────────────────────────────
function openSheet() {
  if (mobileSheet) {
    mobileSheet.classList.add('open');
    renderMobileSheet();
  }
}

// Tracks which mobile sections the user has manually expanded — persists across re-opens
const _mobileExpandedSections = new Set(); // all sections start closed

function renderMobileSheet() {
  if (!sheetBody) return;
  const pages  = getVisiblePages();
  const labels = SECTION_LABELS;
  sheetBody.innerHTML = pages.map(page => {
    const isCollapsed = !_mobileExpandedSections.has(page);
    return `
      <div class="filter-section-wrapper" data-section="${page}">
        <div class="filter-section-header ${isCollapsed ? 'collapsed' : ''}" data-section-toggle="${page}">
          <span class="filter-section-title-text">${labels[page]}</span>
          <span class="filter-section-chevron">▼</span>
        </div>
        <div class="filter-section-content ${isCollapsed ? 'collapsed' : ''}" data-section-body="${page}"
          style="max-height: ${isCollapsed ? '0' : '2000px'}">
          ${buildPage(page)}
        </div>
      </div>`;
  }).join('');

  // Bind collapse toggles — update the persistent set
  sheetBody.querySelectorAll('[data-section-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const page = header.dataset.sectionToggle;
      const body = sheetBody.querySelector(`[data-section-body="${page}"]`);
      const isNowCollapsed = header.classList.toggle('collapsed');
      body.classList.toggle('collapsed', isNowCollapsed);
      body.style.maxHeight = isNowCollapsed ? '0' : '2000px';
      if (isNowCollapsed) _mobileExpandedSections.delete(page);
      else _mobileExpandedSections.add(page);
    });
  });

  // Bind all page events
  pages.forEach(page => {
    const sectionBody = sheetBody.querySelector(`[data-section-body="${page}"]`);
    if (sectionBody) bindPageEvents(sectionBody, page);
  });
}

function closeSheet() {
  mobileSheet?.classList.remove('open');
}

// ─────────────────────────────────────────────
// Build sidebar and mobile sheet HTML into DOM
// ─────────────────────────────────────────────
function buildFilterSidebarDOM() {
  const pages  = getVisiblePages();
  const labels = SECTION_LABELS;

  // Ensure active tags bar exists
  const tagsBar = document.getElementById('activeTagsBar');
  if (!tagsBar) {
    const bar = document.createElement('div');
    bar.className = 'active-tags-bar';
    bar.id        = 'activeTagsBar';
    bar.innerHTML = '<span class="no-filters-hint">No filters active</span>';
    const sidebar = document.querySelector('.filter-sidebar');
    if (sidebar) sidebar.prepend(bar);
  }

  // Hide the tab nav (single-page mode)
  const nav = document.querySelector('.filter-sidebar .filter-page-nav');
  if (nav) nav.style.display = 'none';

  // Standalone search bar, pinned above the collapsible sections
  let searchBarEl = document.getElementById('sidebarSearchBarEl');
  if (!searchBarEl) {
    searchBarEl = document.createElement('div');
    searchBarEl.className = 'sidebar-search-bar';
    searchBarEl.id        = 'sidebarSearchBarEl';
    const sidebar = document.querySelector('.filter-sidebar');
    const tagsBarEl = document.getElementById('activeTagsBar');
    if (tagsBarEl) tagsBarEl.insertAdjacentElement('afterend', searchBarEl);
    else sidebar?.prepend(searchBarEl);
  }
  searchBarEl.innerHTML = buildSearchBarHTML();
  bindSearchBarEvents(searchBarEl);

  // Build single scrollable body with all sections stacked
  sidebarBody = document.querySelector('.filter-sidebar-body') || document.getElementById('sidebarBodyEl');
  if (!sidebarBody) {
    sidebarBody = document.createElement('div');
    sidebarBody.className = 'filter-sidebar-body';
    document.querySelector('.filter-sidebar')?.appendChild(sidebarBody);
  }

  // Render all sections at once
  renderAllSections(sidebarBody);
}

function renderAllSections(container) {
  if (!container) return;
  const pages  = getVisiblePages();
  const labels = SECTION_LABELS;
  const collapsed = container._collapsedSections || new Set(SECTION_ORDER);
  container._collapsedSections = collapsed;

  container.innerHTML = pages.map(page => {
    const isCollapsed = collapsed.has(page);
    return `
      <div class="filter-section-wrapper" data-section="${page}">
        <div class="filter-section-header ${isCollapsed ? 'collapsed' : ''}" data-section-toggle="${page}">
          <span class="filter-section-title-text">${labels[page]}</span>
          <span class="filter-section-chevron">▼</span>
        </div>
        <div class="filter-section-content ${isCollapsed ? 'collapsed' : ''}" data-section-body="${page}"
          style="max-height: ${isCollapsed ? '0' : '2000px'}">
          ${buildPage(page)}
        </div>
      </div>`;
  }).join('');

  // Bind collapse toggles
  container.querySelectorAll('[data-section-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const page = header.dataset.sectionToggle;
      const body = container.querySelector(`[data-section-body="${page}"]`);
      const isNowCollapsed = header.classList.toggle('collapsed');
      body.classList.toggle('collapsed', isNowCollapsed);
      body.style.maxHeight = isNowCollapsed ? '0' : '2000px';
      if (isNowCollapsed) collapsed.add(page); else collapsed.delete(page);
    });
  });

  // Bind all page events for each section
  pages.forEach(page => {
    const sectionBody = container.querySelector(`[data-section-body="${page}"]`);
    if (sectionBody) bindPageEvents(sectionBody, page);
  });
}

function buildMobileSheetDOM() {
  const pages  = getVisiblePages();
  const labels = SECTION_LABELS;
  // Find or create mobile bar
  let bar = document.querySelector('.mobile-filter-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'mobile-filter-bar';
bar.innerHTML = `
      <div class="mobile-search-row">
        <input class="mobile-search-input" type="text" placeholder="Search player name…" id="mobileSearchInput">
        <div style="position:relative;flex-shrink:0">
          <button class="mobile-filter-fab" id="mobileFabBtn">
            <svg width="20" height="20" fill="none" stroke="#000" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
            </svg>
          </button>
          <div class="mobile-fab-badge" id="mobileFabBadge"></div>
        </div>
      </div>`;
    // Position the bar to align with the sheet footer Apply button
    bar.style.bottom = '80px';
    document.body.appendChild(bar);
  }

  mobileSearch = document.getElementById('mobileSearchInput');
  if (mobileSearch) {
    mobileSearch.addEventListener('input', e => {
      window._currentSearch = e.target.value;
      const ds = document.getElementById('desktopSearchInput');
      if (ds) ds.value = e.target.value;
      triggerFilter();
      updateActiveFilters();
    });
  }

  document.getElementById('mobileFabBtn')?.addEventListener('click', openSheet);

  let touchStartY = 0;
  bar.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  bar.addEventListener('touchmove', e => {
    if (touchStartY - e.touches[0].clientY > 50) openSheet();
  }, { passive: true });

  // Create mobile sheet
  mobileSheet = document.querySelector('.mobile-filter-sheet');
  if (!mobileSheet) {
    mobileSheet = document.createElement('div');
    mobileSheet.className = 'mobile-filter-sheet';
    mobileSheet.id        = 'mobileFilterSheet';

    const navBtns = pages.map(p =>
      `<button class="fpn-btn ${p === 'search' ? 'active' : ''}" data-page="${p}">${labels[p]}</button>`
    ).join('');

mobileSheet.innerHTML = `
      <div class="sheet-top-nav">
        <span class="sheet-title">Filters</span>
      </div>
      <div class="mobile-active-tags-bar" id="mobileActiveTagsBar">
        <span class="no-filters-hint">No filters active</span>
      </div>
      <div class="sheet-search-bar" id="sheetSearchBarEl"></div>
      <div class="filter-page-nav sheet-page-nav" id="sheetPageNav">${navBtns}</div>
      <div class="sheet-body" id="sheetBodyEl"></div>
      <div class="sheet-footer">
        <button class="sheet-reset-btn" id="sheetResetBtn">Reset</button>
        <button class="sheet-apply-btn" id="sheetApplyBtn">Apply Filters</button>
      </div>`;
    document.body.appendChild(mobileSheet);
  }

  sheetBody = document.getElementById('sheetBodyEl');

  const sheetSearchBarEl = document.getElementById('sheetSearchBarEl');
  if (sheetSearchBarEl) {
    sheetSearchBarEl.innerHTML = buildSearchBarHTML();
    bindSearchBarEvents(sheetSearchBarEl);
  }

  document.getElementById('sheetApplyBtn')?.addEventListener('click', closeSheet);
  document.getElementById('sheetResetBtn')?.addEventListener('click', clearAllFilters);
  document.getElementById('sheetDragHandle')?.addEventListener('click', closeSheet);

document.getElementById('sheetPageNav')?.querySelectorAll('.fpn-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      const header = sheetBody?.querySelector(`[data-section-toggle="${page}"]`);
      if (header) {
        const isCollapsed = header.classList.contains('collapsed');
        if (isCollapsed) header.click(); // expand it
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

// Swipe-down to close ONLY on the drag handle, not the scrollable body
  let sheetTouchY = 0;
  const dragHandle = document.getElementById('sheetDragHandle');
  dragHandle?.addEventListener('touchstart', e => { sheetTouchY = e.touches[0].clientY; }, { passive: true });
  dragHandle?.addEventListener('touchmove', e => {
    if (e.touches[0].clientY - sheetTouchY > 40) closeSheet();
  }, { passive: true });
}

// ─────────────────────────────────────────────
// Sidebar toggle (desktop)
// ─────────────────────────────────────────────
export function toggleFilterNav() {
  const sidebar = document.querySelector('.filter-sidebar');
  const main    = document.getElementById('main-content');
  if (!sidebar) return;
  sidebar.classList.toggle('visible');
  const isVisible = sidebar.classList.contains('visible');
  main?.classList.toggle('filter-nav-hidden', !isVisible);
  main?.classList.toggle('sidebar-open', isVisible);
}

export function initFilterSidebar() {
  const sidebar = document.querySelector('.filter-sidebar');
  const main    = document.getElementById('main-content');
  if (!sidebar) return;
  if (window.innerWidth > 768) {
    sidebar.classList.add('visible');
    main?.classList.remove('filter-nav-hidden');
    main?.classList.add('sidebar-open');
  } else {
    sidebar.classList.remove('visible');
    main?.classList.add('filter-nav-hidden');
    main?.classList.remove('sidebar-open');
  }
}

// ─────────────────────────────────────────────
// DOMContentLoaded bootstrap
// ─────────────────────────────────────────────
export function setupEvoFilterSections(evoNames) {
  _evoNames = evoNames || [];
  if (sidebarBody) renderAllSections(sidebarBody);
  if (sheetBody)   renderMobileSheet();
}
window._setupEvoFilterSections = setupEvoFilterSections;

document.addEventListener('DOMContentLoaded', () => {
  initFilterSidebar();
  buildFilterSidebarDOM();
  // Squad Builder has its own picker filter button and moves
  // .filter-sidebar-body into its own panel — it never uses Filter.js's
  // floating mobile search bar / bottom sheet, so skip building it.
  if (!IS_SQUAD_BUILDER) buildMobileSheetDOM();
  window._downloadState  = downloadState;
  window._applyDisplay   = applyDisplayState;
  // Apply immediately so defaults take effect before cards render
  applyDisplayState();

  document.getElementById('toggleFilterBtn')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      openSheet();
    } else {
      toggleFilterNav();
    }
  });

  updateActiveFilters();
});