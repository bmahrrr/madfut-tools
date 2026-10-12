// V1.1



import { clubIdToName, leagueIdToName, nationIdToName } from './Mappings.js';
import './EvoCards.js';

// Silences every console.* call inside this module only (module-scoped,
// so other scripts' console output is unaffected). Delete this block to
// get the messages back.
const console = {
  log() {}, info() {}, warn() {}, error() {}, debug() {}, table() {},
};

let selectedClubs        = new Set();
let selectedLeagues      = new Set();
let selectedNations      = new Set();
let selectedColors       = new Set();
let selectedPositions    = new Set();
let selectedAltPositions = new Set();
let selectedRequiredPositions = new Set();
let positionMode         = 'both';
let statFiltersState     = {};
let STAT_KEYS            = ['PAC','SHO','PAS','DRI','DEF','PHY','attack','control','defense'];
let selectedLtmRatings   = new Set(Array.from({ length: 32 }, (_, i) => 67 + i)); // 67-98 until Filter.js replaces it
let sortRules            = [{ field: 'date', dir: 'desc' }];
let displayState         = { showDownload:true, showFatal:true, showAltPos:true, viewMode:'view' };
let downloadState        = { showFatal:true, showAltPos:true };
let miscState            = { inPacks:false, objReward:false, sbcReward:false, cupReward:false, evoReward:false, inTokens:false, inPicks:false, tradable:false, untradeable:false, totw:false, totwWeek:'', genderMen:false, genderWomen:false, dynamicImage:false };
let uniqueColors         = [];
let selectedDbs          = new Set(['updates','sbcGroups','objectives','evosElite','draftCups','ltm','livePlayers','realmExport']);

let setUniqueColors      = c => { uniqueColors = c; };
window._allFilesByDb      = {};
window._selectedFilesByDb = window._selectedFilesByDb || {};
let setDbFileLists = (filesByDb) => {
  window._allFilesByDb = filesByDb;
  Object.entries(filesByDb).forEach(([db, fileSet]) => {
    if (!window._selectedFilesByDb[db]) {
      window._selectedFilesByDb[db] = new Set(fileSet);
    }
  });
};
let normalise            = str => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let updateActiveFilters  = () => {};
let initFilterSidebar    = () => {};
let toggleFilterNav      = () => {};
let clearAllFilters      = () => {};
let rebuildClubLeagueNationLists = () => {};
let rebuildColorFilterOptions    = () => {};
let buildPositionList    = () => {};
let buildAltPositionList = () => {};
let rebuildStatFiltersUI = () => {};
let initRatingSlider     = () => {};
let colorMatchesSelected = key => selectedColors.size === 0 || selectedColors.has(key);

// Live reference to the Filter.js module. Filter.js reassigns its
// `positionMode` export directly (positionMode = 'main', etc.) rather
// than mutating an object, so a one-time destructured copy goes stale
// the instant the user switches Main/Alt/Both. Read it off the module
// itself every time instead.
let FilterModule = null;
function getPositionMode() {
  return FilterModule ? FilterModule.positionMode : positionMode;
}

// Independent of positionMode — a position matches if it's selected as
// "main" and equals the card's main position, OR selected as "alt" and
// is in the card's alt-position list. Starred (required) positions must
// ALL match; the rest are OR'd together.
// Independent of positionMode — a position matches if it's selected as
// "main" and equals the card's main position, OR selected as "alt" and
// is in the card's alt-position list. Starred (required) positions must
// ALL match; the rest are OR'd together.
function positionMatch(fields) {
  if (selectedPositions.size === 0 && selectedAltPositions.size === 0) return true;

  const mainPos = (fields.position?.stringValue || '').toUpperCase().trim();
  const altRaw  = (fields.altPositions?.stringValue || '').toUpperCase();
  const altSet  = new Set(altRaw.split(',').map(s => s.trim()).filter(Boolean));

  const posMatches = pos =>
    (selectedPositions.has(pos)    && mainPos === pos) ||
    (selectedAltPositions.has(pos) && altSet.has(pos));

  const required = selectedRequiredPositions;
  if (required.size > 0) {
    for (const pos of required) {
      if (!posMatches(pos)) return false; // missing a starred position
    }
  }

  const all      = new Set([...selectedPositions, ...selectedAltPositions]);
  const optional = [...all].filter(p => !required.has(p));
  if (optional.length === 0) return true; // only starred positions were selected, already passed
  return optional.some(posMatches);
}

// ─────────────────────────────────────────────
// PAGE MODE — set window.PAGE_MODE = 'livePlayers' in the HTML
// to enable Live Players mode. Default = 'all'.
// ─────────────────────────────────────────────
const PAGE_MODE   = window.PAGE_MODE || 'all';
const IS_LIVE_PAGE = PAGE_MODE === 'livePlayers';
const IS_LTM_PAGE  = PAGE_MODE === 'ltmOnly';

const container = document.getElementById('card-container');

let allPlayers        = [];
let remoteCardDesigns = [];

// Expose globals that Filter.js reads back
window._allPlayers    = allPlayers;
window._filterAndSort = filterAndSort;
window._cardShowToast = showToast;
window._currentSearch = '';

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────
function slugify(name) {
  return String(name || 'player')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'player';
}
function buildDetailUrl(name, id, opts = {}) {
  const { database, rating } = opts;
  const base = `/27/${slugify(name)}-${id}`;
  return (database === 'ltm' && rating) ? `${base}-ovr${rating}` : base;
}
function showToast(message) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className  = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─────────────────────────────────────────────
// Database URLs
// ─────────────────────────────────────────────
const FS_BASE    = 'https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/(default)/documents';
const DOC_PREFIX = '27_';
const isCurrentGenDoc = doc => (doc?.name || '').split('/').pop().startsWith(DOC_PREFIX);

const databases = {
  updates:     `${FS_BASE}/updates`,
  sbcGroups:   `${FS_BASE}/sbcGroups`,
  objectives:  `${FS_BASE}/objectives`,
  evosElite:   `${FS_BASE}/evosElite`,
  draftCups:   `${FS_BASE}/draftCups`,
  ltm:         '/27/json/LtmCards.csv',
  livePlayers: `${FS_BASE}/livePlayers`,
  realmExport: '/27/json/realm27.json'
};

const singleDocumentDatabases = ['realmExport'];

let colorMap = {};

// ─────────────────────────────────────────────
// Local per-database page cache
// ─────────────────────────────────────────────
const CACHE_PREFIX = 'mfCache_v5_';
function loadDbCache(dbName) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dbName);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDbCache(dbName, cache) {
  try {
    localStorage.setItem(CACHE_PREFIX + dbName, JSON.stringify(cache));
  } catch (e) {
    console.warn(`[Cache] failed to save ${dbName}:`, e);
  }
}

// ─────────────────────────────────────────────
// Pagination state
// ─────────────────────────────────────────────
const CARDS_PER_PAGE = 100;
let currentPage      = 1;
let playersToRender  = [];
let totalPages       = 1;
let isRendering      = false;
let dataLoaded       = false;
let designsLoaded    = false; // color.json / card designs finished (or failed)
let renderQueued     = false; // a render was requested while another was running

// ─────────────────────────────────────────────
// Filter & sort  (state imported from Filter.js)
// ─────────────────────────────────────────────
function filterAndSort() {
  if (!dataLoaded || !designsLoaded) return;
  if (IS_LTM_PAGE) { filterAndSortLtm(); return; }
  const query = normalise(window._currentSearch || '');

  const activeDbs = IS_LIVE_PAGE
    ? ['livePlayers']
    : Array.from(selectedDbs);

  const minRating = window.ratingState?.min ?? 0;
  const maxRating = window.ratingState?.max ?? 99;

  let filtered = allPlayers.filter(player => {
    const fields = player?.mapValue?.fields || {};

    // ── Database source filter ──
    // Check both the (possibly dedup-rewritten) database and the original
    // source database so draftCups/objectives cards that lost a dedup race
    // still appear when their source db is selected.
    const playerDb = player._origDatabase || player.database;
    if (!activeDbs.includes(player.database) && !activeDbs.includes(playerDb)) return false;

    // ── Per-file picker within that database source (LTM uses its own
    // rating-tier picker instead — see selectedLtmRatings above) ──
    if (player.database !== 'ltm') {
      const filesSel = window._selectedFilesByDb?.[player.database];
      // Only apply the file filter if there are actually numeric files to
      // pick from for this db. draftCups/objectives/evosElite use non-numeric
      // document keys, so their file picker is empty and should be skipped.
      const hasNumericFiles = window._allFilesByDb?.[player.database]
        ? Array.from(window._allFilesByDb[player.database]).some(f => /^\d+$/.test(f))
        : false;
      if (hasNumericFiles && filesSel && player.fileId && !filesSel.has(player.fileId)) return false;
    }

    // ── Name search with accent normalisation ──
    const name = normalise(fields?.name?.stringValue || '');
    if (query && !name.includes(query)) return false;

    // ── Clubs / Leagues / Nations ──
    const clubId   = String(fields.clubId?.integerValue   || '');
    const leagueId = String(fields.leagueId?.integerValue || '');
    const nationId = String(fields.nationId?.integerValue || '');
    if (selectedClubs.size   > 0 && !selectedClubs.has(clubId))     return false;
    if (selectedLeagues.size > 0 && !selectedLeagues.has(leagueId)) return false;
    if (selectedNations.size > 0 && !selectedNations.has(nationId)) return false;

    // ── Card type / color ──
    const colorVal = (fields.color?.stringValue || '').trim().toLowerCase();
    if (!colorMatchesSelected(colorVal)) return false;

    if (!positionMatch(fields)) return false;

    // ── Rating ──
    const rating = parseInt(fields.rating?.integerValue || 0);
    if (rating < minRating || rating > maxRating) return false;

    // ── LTM rating-tier filter (which of the 67-98 tiers to show) ──
    if (player.database === 'ltm' && !selectedLtmRatings.has(rating)) return false;
    // ── Stat filters ──
    for (const stat of STAT_KEYS) {
      const rules = statFiltersState[stat] || [];
      if (!rules.length) continue;
      const val = parseInt(fields[stat]?.integerValue ?? 0);
      for (const r of rules) {
        if (r.op === '>=' && val < r.val) return false;
        if (r.op === '<=' && val > r.val) return false;
        if (r.op === '='  && val !== r.val) return false;
      }
    }

    // ── Misc: packable ──
    const packable = parseInt(fields.packable?.integerValue ?? 999);
    const PACKABLE_FILTERS = [
      { yes: 'inPacks',   no: 'notInPacks',   val: 0  },
      { yes: 'objReward', no: 'notObjReward', val: -1 },
      { yes: 'sbcReward', no: 'notSbcReward', val: -2 },
      { yes: 'cupReward', no: 'notCupReward', val: -4 },
      { yes: 'evoReward', no: 'notEvoReward', val: -5 },
    ];
    // True sides: card must match at least one of the ticked ones
    const wantedPack = PACKABLE_FILTERS.filter(f => miscState[f.yes]);
    if (wantedPack.length && !wantedPack.some(f => packable === f.val)) return false;
    // False sides: card must match none of the ticked ones
    if (PACKABLE_FILTERS.some(f => miscState[f.no] && packable === f.val)) return false;

    // ── Misc: tokens ──
    if (miscState.inTokens    && fields.inTokens?.booleanValue !== true)  return false;
    if (miscState.notInTokens && fields.inTokens?.booleanValue === true)  return false;

    // ── Misc: picks ──
    if (miscState.inPicks    && fields.inPicks?.booleanValue !== true) return false;
    if (miscState.notInPicks && fields.inPicks?.booleanValue === true) return false;

    // ── Misc: tradability ──
    if (miscState.tradable   && fields.tradable?.booleanValue !== true)  return false;
    if (miscState.untradeable && fields.tradable?.booleanValue === true) return false;

    // ── Misc: TOTW ──
    // Any positive week number = real TOTW card. -1 (or 0, or missing)
    // = not TOTW.
    const totwNumRaw = parseInt(fields.totwNumber?.integerValue ?? -1, 10);
    const isTotw     = totwNumRaw > 0;

    if (window._debugTotw) {
      console.log('[TOTW]', fields.name?.stringValue, 'raw=', totwNumRaw, 'isTotw=', isTotw, '| True=', miscState.totw, 'False=', miscState.notTotw);
    }

    if (miscState.totw && !isTotw) return false;       // True  → only TOTW cards
    if (miscState.notTotw && isTotw) return false;      // False → only non-TOTW cards
    if (miscState.totw && miscState.totwWeek !== '' && String(totwNumRaw) !== String(miscState.totwWeek)) return false;

    // ── Misc: gender ──
    if (miscState.genderMen   && fields.man?.booleanValue !== true)  return false;
    if (miscState.genderWomen && fields.man?.booleanValue === true)  return false;

    // ── Misc: dynamic image ──
    if (miscState.dynamicImage    && fields.url?.booleanValue !== true) return false;
    if (miscState.notDynamicImage && fields.url?.booleanValue === true) return false;

    // ── Evolutions tab filters ──
    if (player.database === 'evo') {
      const chainStr   = fields._evoChain?.stringValue || '';
      const chainNames = chainStr.split('→').map(s => s.trim()).filter(Boolean);
      const chainLen   = chainNames.length;

      if (window._customChainLen !== null && window._customChainLen !== undefined) {
        if (chainLen !== window._customChainLen) return false;
      }
if (window._deselectedEvos?.size > 0 && chainNames.some(n => window._deselectedEvos.has(n))) return false;

      // Must include ALL ticked evos, not just one
      if (window._mustIncludeEvos?.size > 0) {
        const mustAllPresent = [...window._mustIncludeEvos].every(n => chainNames.includes(n));
        if (!mustAllPresent) return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aF = a?.mapValue?.fields || {};
    const bF = b?.mapValue?.fields || {};

    for (const rule of sortRules) {
      let cmp = 0;
      const { field, dir } = rule;
      const mul = dir === 'asc' ? 1 : -1;

      if (field === 'rating') {
        cmp = (parseInt(aF.rating?.integerValue || 0) - parseInt(bF.rating?.integerValue || 0)) * mul;
      } else if (field === 'name') {
        cmp = (aF.name?.stringValue || '').localeCompare(bF.name?.stringValue || '') * mul;
      } else if (field === 'position') {
        cmp = (aF.position?.stringValue || '').localeCompare(bF.position?.stringValue || '') * mul;
      } else if (['pac','sho','pas','dri','def','phy','attack','control','defense'].includes(field)) {
        const aVal = parseInt(aF[field]?.integerValue ?? aF[field.toUpperCase()]?.integerValue ?? 0);
        const bVal = parseInt(bF[field]?.integerValue ?? bF[field.toUpperCase()]?.integerValue ?? 0);
        cmp = (aVal - bVal) * mul;
      } else if (field === 'date') {
        const aDate = parseInt(aF.date?.integerValue ?? 0);
        const bDate = parseInt(bF.date?.integerValue ?? 0);
        cmp = (aDate - bDate) * mul;
      } else if (field === 'added_at') {
        cmp = (new Date(a.createTime) - new Date(b.createTime)) * mul;
      } else if (field === 'file_number') {
        const aVal = parseInt(a.fileId) || 0;
        const bVal = parseInt(b.fileId) || 0;
        cmp = (aVal - bVal) * mul;
      } else if (field === 'net_fatal' || field === 'net_fatal_2nd' || field === 'net_fatal_3rd') {
        const tierIndex = field === 'net_fatal' ? 0 : field === 'net_fatal_2nd' ? 1 : 2;
        const rating = parseInt(aF.rating?.integerValue || 0);
        const netA = getFatalTiersSorted(aF)[tierIndex] - parseInt(aF.rating?.integerValue || 0);
        const netB = getFatalTiersSorted(bF)[tierIndex] - parseInt(bF.rating?.integerValue || 0);
        cmp = (netA - netB) * mul;
      } else if (field === 'highest_fatal') {
        const hiA = Math.max(
          parseInt(aF.attack?.integerValue  || 0),
          parseInt(aF.control?.integerValue || 0),
          parseInt(aF.defense?.integerValue || 0)
        );
        const hiB = Math.max(
          parseInt(bF.attack?.integerValue  || 0),
          parseInt(bF.control?.integerValue || 0),
          parseInt(bF.defense?.integerValue || 0)
        );
        cmp = (hiA - hiB) * mul;
      } else if (field === 'second_highest_fatal') {
        const secA = getFatalTiersSorted(aF)[1];
        const secB = getFatalTiersSorted(bF)[1];
        cmp = (secA - secB) * mul;
      } else if (field === 'third_highest_fatal') {
        const thirdA = getFatalTiersSorted(aF)[2];
        const thirdB = getFatalTiersSorted(bF)[2];
        cmp = (thirdA - thirdB) * mul;
      } else if (field === 'total_fatal') {
        const totA = parseInt(aF.attack?.integerValue  || 0)
                   + parseInt(aF.control?.integerValue || 0)
                   + parseInt(aF.defense?.integerValue || 0);
        const totB = parseInt(bF.attack?.integerValue  || 0)
                   + parseInt(bF.control?.integerValue || 0)
                   + parseInt(bF.defense?.integerValue || 0);
        cmp = (totA - totB) * mul;
      } else {
        // fallback: quick-sort dropdown
        switch (quickSort) {
          case 'newest':      cmp = new Date(b.createTime) - new Date(a.createTime); break;
          case 'oldest':      cmp = new Date(a.createTime) - new Date(b.createTime); break;
          case 'rating-high': cmp = (bF.rating?.integerValue || 0) - (aF.rating?.integerValue || 0); break;
          case 'rating-low':  cmp = (aF.rating?.integerValue || 0) - (bF.rating?.integerValue || 0); break;
          case 'name-az':     cmp = (aF.name?.stringValue || '').localeCompare(bF.name?.stringValue || ''); break;
          case 'name-za':     cmp = (bF.name?.stringValue || '').localeCompare(aF.name?.stringValue || ''); break;
          case 'position-az': cmp = (aF.position?.stringValue || '').localeCompare(bF.position?.stringValue || ''); break;
          case 'position-za': cmp = (bF.position?.stringValue || '').localeCompare(aF.position?.stringValue || ''); break;
        }
      }
      if (cmp !== 0) return cmp;
    }
    return new Date(b.createTime) - new Date(a.createTime);
  });

  renderPlayers(filtered);
  updateActiveFilters();
}

function filterAndSortLtm() {
  const query = normalise(window._currentSearch || '');

  let filtered = allPlayers.filter(player => {
    const fields = player?.mapValue?.fields || {};

    const name = normalise(fields?.name?.stringValue || '');
    if (query && !name.includes(query)) return false;

    const clubId   = String(fields.clubId?.integerValue   || '');
    const leagueId = String(fields.leagueId?.integerValue || '');
    const nationId = String(fields.nationId?.integerValue || '');
    if (selectedClubs.size   > 0 && !selectedClubs.has(clubId))     return false;
    if (selectedLeagues.size > 0 && !selectedLeagues.has(leagueId)) return false;
    if (selectedNations.size > 0 && !selectedNations.has(nationId)) return false;

    if (!positionMatch(fields)) return false;

    const rating = parseInt(fields.rating?.integerValue || 0);
    if (!selectedLtmRatings.has(rating)) return false;

    return true;
  });

  filtered.sort((a, b) => {
    const aF = a?.mapValue?.fields || {};
    const bF = b?.mapValue?.fields || {};
    const rule = sortRules[0] || { field: 'rating', dir: 'desc' };
    const mul  = rule.dir === 'asc' ? 1 : -1;

    if (rule.field === 'name') {
      return (aF.name?.stringValue || '').localeCompare(bF.name?.stringValue || '') * mul;
    }
    if (rule.field === 'rating') {
      return (parseInt(aF.rating?.integerValue || 0) - parseInt(bF.rating?.integerValue || 0)) * mul;
    }
    return new Date(b.createTime) - new Date(a.createTime);
  });

  // Poster/total-cost button (LTM-Card.html) reads this to know exactly
  // which cards are on-screen under the current filters/search.
  window._ltmFilteredCards = filtered;

  renderPlayers(filtered);
  updateActiveFilters();
}

// ─────────────────────────────────────────────
// Card design fetcher
// ─────────────────────────────────────────────
// Fetches JSON with a timeout; returns null on any failure instead of throwing,
// so one source failing never throws away the other.
async function fetchJsonSafe(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    clearTimeout(timeoutId);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[designs] failed to load', url, err);
    return null;
  }
}

// Lists a whole Firestore collection (all pages) and keeps only 27_ docs.
async function fetchCollection27(baseURL) {
  const documents = [];
  let pageToken = '';
  do {
    const url  = `${baseURL}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const data = await fetchCollectionListPage(url);
    if (!data) break;
    pageToken = data.nextPageToken || '';
    documents.push(...(data.documents || []).filter(isCurrentGenDoc));
  } while (pageToken);
  return { documents };
}

async function fetchRemoteCardDesigns() {
  colorMap        = {};
  remoteCardDesigns = [];
  try {
    const [localData, fsData] = await Promise.all([
      fetchJsonSafe("/27/json/color.json"),
      fetchCollection27(`${FS_BASE}/images`)
    ]);
    const sources   = [];
    if (localData?.documents) sources.push(...localData.documents);
    if (fsData?.documents)    sources.push(...fsData.documents);

    sources.forEach(doc => {
      let imagesArray = [];
      if (doc.fields?.images?.arrayValue?.values) imagesArray = doc.fields.images.arrayValue.values;
      else if (doc.mapValue?.fields) imagesArray = [doc];

      imagesArray.forEach(item => {
        const fields = item.mapValue?.fields || {};
        const id     = (fields.id?.stringValue || fields.name?.stringValue || '').trim().toLowerCase();
        if (!id) return;
        const entry = {
          id,
          name:                fields.name?.stringValue                || id,
          url_big:             fields.url_big?.stringValue             || null,
          url_micro:           fields.url_micro?.stringValue           || null,
          url_small:           fields.url_small?.stringValue           || null,
          walkout_floor_color: fields.walkout_floor_color?.stringValue || null,
          flare_1:             fields.flare_1?.stringValue             || null,
          flare_2:             fields.flare_2?.stringValue             || null,
          top_text_color:      fields.top_text_color?.stringValue      || "#000000",
          middle_text_color:   fields.middle_text_color?.stringValue   || "#000000",
          bottom_text_color:   fields.bottom_text_color?.stringValue   || "#000000",
          alt_pos_background:  fields.alt_pos_background?.stringValue  || "#333333",
          alt_pos_text:        fields.alt_pos_text?.stringValue        || "#FFFFFF",
          alt_pos_outline:     fields.alt_pos_outline?.stringValue     || "#000000"
        };
        colorMap[id] = entry;
        remoteCardDesigns.push({
          name:        id,
          displayName: entry.name,
          urlBig:      entry.url_big,
          urlMicro:    entry.url_micro,
          urlSmall:    entry.url_small
        });
      });
    });

    const seen = new Set();
    remoteCardDesigns = remoteCardDesigns.filter(x => {
      if (seen.has(x.name)) return false;
      seen.add(x.name);
      return true;
    });

    window.colorMap = colorMap;
    console.log("Loaded card designs:", Object.keys(colorMap).length);
    if (Object.keys(colorMap).length === 0) console.error('[designs] colorMap is EMPTY, cards will render with fallback art');
  } catch (err) {
    console.error("Failed to load card designs", err);
  } finally {
    designsLoaded = true;
    // If the cards finished loading first they were held back, so paint now
    if (dataLoaded) filterAndSort();
  }
}

// ─────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────
async function fetchAllPlayers() {
  if (IS_LIVE_PAGE) {
    await fetchLivePlayers();
  } else if (IS_LTM_PAGE) {
    await fetchLtmOnlyPlayers();
  } else {
    await fetchAllDatabases();
  }
}

async function fetchLtmOnlyPlayers() {
  try {
    const cards = await fetchLtmCards();
    console.log(`[LTM Page] loaded ${cards.length} cards`);
    allPlayers = cards;
    window._allPlayers = allPlayers;
    dataLoaded = true;
    buildFiltersFromPlayers();
  } catch (err) {
    console.error('fetchLtmOnlyPlayers error:', err);
    const loadingScreen = document.getElementById('loading-screen') || document.getElementById('loading-text');
    if (loadingScreen) loadingScreen.remove();
    container.innerHTML = '<p>Failed to load LTM cards.</p>';
  }
}

async function fetchLivePlayers() {
  try {
    const liveCache    = loadDbCache('livePlayers');
    const updatesCache = loadDbCache('updates');
    const realmCache   = loadDbCache('realmExport');

    const [livePlayers, updateDocs, realmDocs] = await Promise.all([
      fetchDbCollectionAll('livePlayers', databases.livePlayers, liveCache),
      fetchDbCollectionAll('updates', databases.updates, updatesCache),
      fetchPlayerDataCached(databases.realmExport, 'realmExport', 'single', realmCache),
    ]);

    saveDbCache('livePlayers', liveCache);
    saveDbCache('updates', updatesCache);
    saveDbCache('realmExport', realmCache);

    const originalCards = [...updateDocs, ...realmDocs];

    const dbPriority   = { updates: 0, realmExport: 1 };
    const originalById = new Map();
    originalCards.forEach(p => {
      const id = p?.mapValue?.fields?.id?.stringValue;
      if (!id) return;
      const existing     = originalById.get(id);
      if (!existing) { originalById.set(id, p); return; }
      const existingPrio = dbPriority[existing.database] ?? 99;
      const newPrio      = dbPriority[p.database] ?? 99;
      if (newPrio < existingPrio) originalById.set(id, p);
    });

    console.log(`[LivePlayers] Found ${livePlayers.length} live players, ${originalById.size} original cards indexed`);

    const enrichedLivePlayers = livePlayers.map(p => {
      const fields       = p?.mapValue?.fields || {};
      const liveId       = fields.id?.stringValue || '';
      const originalCard = originalById.get(liveId) || null;

      if (originalCard) {
        console.log(`[LivePlayers] ✓ Matched original for ${fields.name?.stringValue} (${liveId}) from ${originalCard.database}`);
      } else {
        console.warn(`[LivePlayers] ✗ No original found for ${fields.name?.stringValue} (id: ${liveId})`);
      }
      return { ...p, baseCard: originalCard };
    });

    const idMap = new Map();
    enrichedLivePlayers.forEach(p => {
      const id = p?.mapValue?.fields?.id?.stringValue;
      if (!id) return;
      const existing = idMap.get(id);
      if (!existing || new Date(p.createTime) > new Date(existing.createTime)) {
        idMap.set(id, p);
      }
    });

    allPlayers = Array.from(idMap.values());
    allPlayers.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    window._allPlayers = allPlayers;
    buildFiltersFromPlayers();
  } catch (err) {
    console.error('fetchLivePlayers error:', err);
    const loadingScreen = document.getElementById('loading-screen') || document.getElementById('loading-text');
    if (loadingScreen) loadingScreen.remove();
    container.innerHTML = '<p>Failed to load players.</p>';
  }
}

async function fetchCollectionListPage(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[fetchCollectionListPage] failed:', url, err);
    return null;
  }
}

// ─────────────────────────────────────────────
// Local SBC group files (/27/json/sbcGroups/27_<n>.json)
// Same Firestore-style shape the JSON Maker outputs. Their players are
// added to the sbcGroups database, and replace Firestore's file with the
// same number.
// ─────────────────────────────────────────────
const LOCAL_SBC_BASE  = '/27/json/sbcGroups/27_';
// Only list local files that actually exist in /27/json/sbcGroups/.
// Add a number here when you drop a new 27_<n>.json file in.
const LOCAL_SBC_FILES = [1, 4];

async function fetchLocalSbcPlayers() {
  const out = [];
  const nums = [...LOCAL_SBC_FILES];

  await Promise.all(nums.map(async n => {
    try {
      const res = await fetch(`${LOCAL_SBC_BASE}${n}.json`, { cache: 'no-cache' });
      if (!res.ok) return;   // file doesn't exist (yet)
      const lastModified = res.headers.get('Last-Modified');
      const json = await res.json();
      const list = (Array.isArray(json) ? json : (json.documents || [json]))
        .filter(d => d && d.fields);

      list.forEach(d => {
        const stamp = d.createTime || (lastModified ? new Date(lastModified).toISOString() : new Date().toISOString());
        const mapped = processDocData(
          { name: d.name, fields: d.fields, createTime: stamp, updateTime: d.updateTime || stamp },
          'sbcGroups'
        );
        mapped.forEach(m => { m.fileId = String(n); });
        out.push(...mapped);
      });
    } catch (err) {
      console.warn(`[local sbcGroups] 27_${n}.json not loaded:`, err);
    }
  }));

  return out;
}

// Lists an entire Firestore collection in ~1-2 paginated requests instead
// of guessing 150 individual document IDs one request at a time.
async function fetchDbCollectionAll(dbName, baseURL, cache) {
  const results = [];
  let pageToken = '';

  // Complete, dedup-independent record of every file/document number this
  // database source actually has. allPlayers (used below in
  // buildFiltersFromPlayers) is post cross-database dedup, so a file whose
  // players all lost that dedup race would otherwise vanish from the
  // file-number picker even though the file genuinely exists.
  if (!window._rawFileIdsByDb) window._rawFileIdsByDb = {};
  if (!window._rawFileIdsByDb[dbName]) window._rawFileIdsByDb[dbName] = new Set();

  do {
    const url  = `${baseURL}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const data = await fetchCollectionListPage(url);
    if (!data) break; // stop paging on failure, keep whatever we already collected

    pageToken = data.nextPageToken || '';

    if (dbName === 'updates') {
      console.log('[updates] raw doc names from Firestore:',
        (data.documents || []).map(d => d.name.split('/').pop()));
    }
    (data.documents || []).filter(isCurrentGenDoc).forEach(doc => {
      const docKey = doc.name.split('/').pop().slice(DOC_PREFIX.length); // "27_5" -> "5"
      const cached = cache[docKey];

      let mapped;
      if (cached?.updateTime && cached.updateTime === doc.updateTime) {
        mapped = cached.players; // unchanged since last visit — reuse
      } else {
        mapped = processDocData(doc, dbName);
        cache[docKey] = { updateTime: doc.updateTime || null, players: mapped };
      }
      // Always (re)stamp fileId, even on the cached-reuse path above —
      // older cache entries were saved before fileId tracking existed and
      // would otherwise silently carry no fileId forever, since their
      // updateTime never changes and the fresh-fetch branch never re-runs.
      mapped.forEach(m => { m.fileId = docKey; });
      // Only expose this file in the picker if it actually has at least
      // one card — an empty document would otherwise show as a
      // toggleable "file" that does nothing when checked/unchecked.
      const hasPlayerCards = mapped.some(m => m?.mapValue?.fields?.name?.stringValue);
      if (hasPlayerCards) window._rawFileIdsByDb[dbName].add(docKey);
      results.push(...mapped);
    });
  } while (pageToken);

  // sbcGroups: add the local files, replacing Firestore's file with the same number
  if (dbName === 'sbcGroups') {
    const local = await fetchLocalSbcPlayers();
    if (local.length) {
      const localFiles = new Set(local.map(p => p.fileId));
      const kept = results.filter(p => !localFiles.has(p.fileId));
      results.length = 0;
      results.push(...kept, ...local);
      localFiles.forEach(f => window._rawFileIdsByDb[dbName].add(f));
    }
  }

  return results;
}

async function fetchAllDatabases() {
  const perDbResults = await Promise.all(Object.entries(databases).map(async ([dbName, baseURL]) => {
    if (dbName === 'ltm') {
      try {
        const players = await fetchLtmCards();
        console.log(`[DB:ltm] got ${players.length} cards`);
        return players;
      } catch (err) {
        console.error('[DB:ltm] failed:', err);
        return [];
      }
    }

    const cache = loadDbCache(dbName);
    let players = [];
    try {
      players = singleDocumentDatabases.includes(dbName)
        ? await fetchPlayerDataCached(baseURL, dbName, 'single', cache)
        : await fetchDbCollectionAll(dbName, baseURL, cache);
      console.log(`[DB:${dbName}] got ${players.length} cards`);
    } catch (err) {
      console.error(`[DB:${dbName}] failed:`, err);
    }
    saveDbCache(dbName, cache);
    return players;
  }));
  const allResults = perDbResults.flat();
  if (allResults.length === 0) {
    console.error('[fetchAllDatabases] Zero cards loaded — check network tab');
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = 'Failed to load cards. Check console.';
    return;
  }

  try {
    let combinedPlayers = allResults;

    combinedPlayers.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    const livePlayers  = combinedPlayers.filter(p => p.database === 'livePlayers');
    const otherPlayers = combinedPlayers.filter(p => p.database !== 'livePlayers');

    const originalTimeMap = {};
    otherPlayers.forEach(p => {
      const id = p?.mapValue?.fields?.id?.stringValue;
      if (id) originalTimeMap[id] = p.createTime;
    });

    const livePlayersWithOriginalTime = livePlayers.map(p => {
      const id           = p?.mapValue?.fields?.id?.stringValue;
      const originalTime = originalTimeMap[id];
      return originalTime ? { ...p, createTime: originalTime } : p;
    });

    // Only real, non-empty ids should ever be used to match a "this other
    // card was upgraded into a live player" relationship. Without this
    // guard, if ANY live player also lacks an id, `undefined` ends up in
    // the set and every id-less reward player (sbcGroups/objectives/
    // draftCups/evosElite) gets wrongly treated as "matched" and dropped.
    const livePlayerIds  = new Set(livePlayers.map(p => p?.mapValue?.fields?.id?.stringValue).filter(Boolean));
    const filteredOthers = otherPlayers.filter(p => {
      if (p.database === 'ltm') return true;
      const id = p?.mapValue?.fields?.id?.stringValue;
      return !id || !livePlayerIds.has(id);
    });
    const merged         = [...livePlayersWithOriginalTime, ...filteredOthers];

    console.log('[DEBUG] per-db counts before dedup:', JSON.stringify(
      merged.reduce((acc, p) => { acc[p.database] = (acc[p.database]||0)+1; return acc; }, {})
    ));
    console.log('[DEBUG] sbcGroups fileIds seen:', JSON.stringify([...new Set(merged.filter(p => p.database === 'sbcGroups').map(p => p.fileId))]));
    console.log('[DEBUG] sbcGroups sample ids:', JSON.stringify(
      merged.filter(p => p.database === 'sbcGroups').slice(0, 10).map(p => ({ fileId: p.fileId, id: p?.mapValue?.fields?.id?.stringValue, name: p?.mapValue?.fields?.name?.stringValue }))
    ));

    const dbSourcePriority = ['updates','realmExport','objectives','sbcGroups','draftCups','ltm','evosElite','livePlayers'];
    const getDbPriority    = db => { const i = dbSourcePriority.indexOf(db); return i === -1 ? 999 : i; };

    // Reward players in sbcGroups/objectives/draftCups/evosElite commonly
    // reuse generic placeholder ids (id001, id002, id003, etc.) instead of
    // a real unique card id. Left as-is, every file's reward player with
    // the same placeholder collapses into a single surviving entry during
    // dedup below — so only one file's cards ever show up.
    const idMap = new Map();
    let noIdCounter = 0;
    merged.forEach(p => {
      let id = p?.mapValue?.fields?.id?.stringValue;
      if (p.database === 'ltm') {
        // Each LTM CSV row expands into one card per rating tier (67-98) —
        // keep every tier distinct instead of collapsing them to one card.
        id = `${id}_r${p?.mapValue?.fields?.rating?.integerValue}`;
      } else if (!id) {
        // Reward players in sbcGroups/objectives/draftCups/evosElite often
        // have no id field at all. Scope a synthetic id to this specific
        // file so id-less reward players from different files never
        // collapse into a single surviving card during dedup below.
        id = `__noid_${p.database}_${p.fileId || 'nofile'}_${noIdCounter++}`;
      }
      const existing         = idMap.get(id);
      if (!existing) { idMap.set(id, p); return; }
      const existingPriority = getDbPriority(existing.database);
      const newPriority      = getDbPriority(p.database);
      const winningDatabase  = existingPriority <= newPriority ? existing.database : p.database;
      // updates vs realmExport: the updates copy always wins, so cards from
      // 27_1 / 27_2 keep their file instead of being taken by realm27.
      const pair = [existing.database, p.database];
      if (pair.includes('updates') && pair.includes('realmExport')) {
        idMap.set(id, p.database === 'updates'
          ? { ...p, database: 'updates', _origDatabase: 'updates' }
          : { ...existing, database: 'updates', _origDatabase: 'updates' });
        return;
      }
      if (new Date(p.createTime) > new Date(existing.createTime)) {
        idMap.set(id, { ...p, database: winningDatabase, _origDatabase: p.database });
      } else {
        idMap.set(id, { ...existing, database: winningDatabase, _origDatabase: existing.database });
      }
    });

    allPlayers = Array.from(idMap.values());
    window._allPlayers = allPlayers;

    const perFile = list => list.reduce((a, p) => {
      if (p.database === 'updates') a[p.fileId] = (a[p.fileId] || 0) + 1;
      return a;
    }, {});
    globalThis.console.log('[updates per file] before dedup: ' + JSON.stringify(perFile(merged)) + ' | after dedup: ' + JSON.stringify(perFile(allPlayers)));
    console.log('[DEBUG] per-db counts after dedup:', JSON.stringify(
      allPlayers.reduce((acc, p) => { acc[p.database] = (acc[p.database]||0)+1; return acc; }, {})
    ));
    console.log('[DEBUG] sbcGroups fileIds surviving:', JSON.stringify([...new Set(allPlayers.filter(p => p.database === 'sbcGroups').map(p => p.fileId))]));

    buildFiltersFromPlayers();
  } catch (err) {
    console.error('fetchAllDatabases error:', err);
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.remove();
    container.innerHTML = '';
  }
}

function buildFiltersFromPlayers() {
  const colorsSet = new Set();
  const filesByDb = {};
  allPlayers.forEach(p => {
    const c = (p?.mapValue?.fields?.color?.stringValue || '').trim().toLowerCase();
    if (c) colorsSet.add(c);
  });

  // Use the raw, complete per-database file list gathered during fetch
  // (see fetchDbCollectionAll) rather than deriving it from allPlayers —
  // a file whose players all lost the cross-database dedup race would
  // otherwise disappear from the picker entirely, even though it exists.
  Object.entries(window._rawFileIdsByDb || {}).forEach(([db, idSet]) => {
    filesByDb[db] = new Set(idSet);
  });

  setUniqueColors(Array.from(colorsSet));
  setDbFileLists(filesByDb);
  updateActiveFilters();

  // Paint real cards immediately — don't wait on evo-chain computation,
  // which fetches evosStandard and runs a DFS over every eligible card.
  // Exception: if the active view only wants evo cards (EvoChains.html
  // forces selectedDbs to just 'evo'), skip this first paint — those
  // entries don't exist yet, so painting now would just flash "No players"
  // for a moment before the real evo cards show up.
  dataLoaded = true;
  const evoOnlyView = selectedDbs.size === 1 && selectedDbs.has('evo');
  if (!evoOnlyView) filterAndSort();

  // Evo chains only matter for the "Show Evo Chains" toggle/filter —
  // build them in the background and refresh the view once ready.
  if (!IS_LIVE_PAGE && !IS_LTM_PAGE && typeof window._buildAndInjectEvoPlayers === 'function') {
    window._buildAndInjectEvoPlayers(() => {
      filterAndSort();
    });
  } else if (evoOnlyView) {
    filterAndSort();
  }
}

// Raw fetch used by other pages (e.g. CardDetail)
async function fetchAllPlayersRaw() {
  const perDbResults = await Promise.all(Object.entries(databases).map(async ([dbName, baseURL]) => {
    if (dbName === 'ltm') {
      try {
        return await fetchLtmCards();
      } catch (err) {
        console.error('[fetchAllPlayersRaw] ltm failed:', err);
        return [];
      }
    }

    const cache = {}; // one-off fetch, no persistent cache needed here
    try {
      return singleDocumentDatabases.includes(dbName)
        ? await fetchPlayerDataCached(baseURL, dbName, 'single', cache)
        : await fetchDbCollectionAll(dbName, baseURL, cache);
    } catch (err) {
      console.error(`[fetchAllPlayersRaw] ${dbName} failed:`, err);
      return [];
    }
  }));
  let combinedPlayers = perDbResults.flat();
  combinedPlayers.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

  const livePlayers  = combinedPlayers.filter(p => p.database === 'livePlayers');
  const otherPlayers = combinedPlayers.filter(p => p.database !== 'livePlayers');

  const originalTimeMap = {};
  otherPlayers.forEach(p => {
    const id = p?.mapValue?.fields?.id?.stringValue;
    if (id) originalTimeMap[id] = p.createTime;
  });

  const livePlayersWithOriginalTime = livePlayers.map(p => {
    const id           = p?.mapValue?.fields?.id?.stringValue;
    const originalTime = originalTimeMap[id];
    return originalTime ? { ...p, createTime: originalTime } : p;
  });

  // Same as fetchAllDatabases() — LTM tiers share a base id and must
  // never be dropped just because a Live Players entry shares that id.
  const livePlayerIds  = new Set(livePlayers.map(p => p?.mapValue?.fields?.id?.stringValue).filter(Boolean));
  const filteredOthers = otherPlayers.filter(p => {
    if (p.database === 'ltm') return true;
    const id = p?.mapValue?.fields?.id?.stringValue;
    return !id || !livePlayerIds.has(id);
  });
  const merged         = [...livePlayersWithOriginalTime, ...filteredOthers];

  const dbSourcePriority = ['objectives','sbcGroups','draftCups','ltm','realmExport','evosElite','updates','livePlayers'];
  const getDbPriority    = db => { const i = dbSourcePriority.indexOf(db); return i === -1 ? 999 : i; };

  const idMap = new Map();
  let noIdCounter = 0;
  merged.forEach(p => {
    let id = p?.mapValue?.fields?.id?.stringValue;
    if (p.database === 'ltm') {
      id = `${id}_r${p?.mapValue?.fields?.rating?.integerValue}`;
    } else if (!id) {
      id = `__noid_${p.database}_${p.fileId || 'nofile'}_${noIdCounter++}`;
    }
    const existing         = idMap.get(id);
    if (!existing) { idMap.set(id, p); return; }
    const existingPriority = getDbPriority(existing.database);
    const newPriority      = getDbPriority(p.database);
    const winningDatabase  = existingPriority <= newPriority ? existing.database : p.database;
    if (new Date(p.createTime) > new Date(existing.createTime)) {
      idMap.set(id, { ...p, database: winningDatabase });
    } else {
      idMap.set(id, { ...existing, database: winningDatabase });
    }
  });

  return Array.from(idMap.values());
}

// Cheap metadata-only probe — an empty/junk field mask makes Firestore
// return just the doc's createTime/updateTime with (almost) no field
// payload, so we can tell "did this page change" without pulling it all.
async function fetchDocUpdateTime(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}mask.fieldPaths=__probe__`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return data.updateTime || data.createTime || null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

function processDocData(data, dbName) {
  let players = data.fields?.players?.arrayValue?.values || [];

  // draftCups documents store a single reward player under `rewardPlayer`,
  // not an array under `players` — wrap it so the rest of the pipeline
  // (which expects an array of player map values) works unchanged.
  if (dbName === 'draftCups' && data.fields?.rewardPlayer?.mapValue) {
    players = [data.fields.rewardPlayer];
  }

  if (data.fields?.evos?.arrayValue?.values) {
    const evos       = data.fields.evos.arrayValue.values;
    const sortedEvos = evos.slice().sort((a, b) =>
      (parseInt(b?.mapValue?.fields?.id?.integerValue ?? 0)) - (parseInt(a?.mapValue?.fields?.id?.integerValue ?? 0))
    );
    const highestEvo = sortedEvos[0];
    if (highestEvo) {
      const nested = highestEvo?.mapValue?.fields?.players?.arrayValue?.values || [];
      players = nested.slice(1).map((p, i) => {
        const fields     = p?.mapValue?.fields || {};
        const existingId = fields?.id?.stringValue;
        const safeId     = (existingId && existingId !== 'id001' && existingId !== 'id002' && existingId !== 'id003')
          ? existingId
          : `evoElite_${data.name}_${i}`;
        return { ...p, mapValue: { ...p.mapValue, fields: { ...fields, id: { stringValue: safeId } } } };
      });
    }
  }
  const mapped = players.map(player => ({
    ...player,
    createTime: player?.mapValue?.fields?.createTime?.stringValue || data.createTime || '1970-01-01T00:00:00Z',
    updateTime: player?.mapValue?.fields?.updateTime?.stringValue || data.updateTime || '1970-01-01T00:00:00Z',
    database:   dbName
  }));
  mapped.sort((a, b) =>
    parseInt(b?.mapValue?.fields?.rating?.integerValue || 0) - parseInt(a?.mapValue?.fields?.rating?.integerValue || 0)
  );
  return mapped;
}

async function fetchPlayerDataCached(url, dbName, docKey, cache, timeoutMs = 12000) {
  const cached = cache[docKey];

  // Step 1: cheap check — if remote updateTime matches what we cached,
  // reuse the cached players and skip the full fetch entirely.
  if (cached?.updateTime) {
    const remoteUpdateTime = await fetchDocUpdateTime(url, timeoutMs);
    if (remoteUpdateTime && remoteUpdateTime === cached.updateTime) {
      return cached.players;
    }
  }

  // Step 2: doc is new or changed since last time — do the full fetch.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Not found');
    const data   = await res.json();
    const mapped = processDocData(data, dbName);
    const derivedFileId = (data.name || '').split('/').pop() || docKey;
    mapped.forEach(m => { m.fileId = derivedFileId; });

    // Remember this page's updateTime + players for next visit.
    cache[docKey] = { updateTime: data.updateTime || null, players: mapped };

    return mapped;
  } catch {
    clearTimeout(timeoutId);
    // Fetch failed — better to show stale cached data than nothing.
    return cached?.players || [];
  }
}

// ─────────────────────────────────────────────
// LTM Cards — identity comes from a CSV, stats come from one
// LtmCard<rating>.json template per rating tier (67-98). Every CSV row
// expands into one card per rating tier.
// ─────────────────────────────────────────────
const LTM_MIN_RATING = 67;
const LTM_MAX_RATING = 98;

function fsString(v) { return { stringValue: v ?? '' }; }
function fsInt(v)    { return { integerValue: parseInt(v) || 0 }; }
function fsBool(v)   { return { booleanValue: v === true || v === 'TRUE' || v === 'true' }; }

// Minimal CSV parser — handles quoted fields (commas/newlines inside quotes).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

// Converts a plain { PAC: 97, position: "ST", ... } rating template into
// Firestore-style fields so it merges cleanly with the rest of the pipeline.
function ratingJsonToFields(json) {
  const fields = {};
  Object.entries(json || {}).forEach(([k, v]) => {
    if (typeof v === 'number')       fields[k] = fsInt(v);
    else if (typeof v === 'boolean') fields[k] = fsBool(v);
    else                              fields[k] = fsString(v);
  });
  return fields;
}

const LTM_STATS_URL = '/27/json/LtmCardStats.json';

let ltmRatingTemplateCache = null;
async function fetchLtmRatingTemplates() {
  if (ltmRatingTemplateCache) return ltmRatingTemplateCache;

  try {
    const res = await fetch(LTM_STATS_URL);
    console.log(`[LTM template] ${LTM_STATS_URL} -> ${res.status} ${res.ok ? 'OK' : 'FAILED'}`);
    if (!res.ok) { ltmRatingTemplateCache = {}; return {}; }

    const text = await res.text();
    let map;
    try {
      map = JSON.parse(text);
    } catch (parseErr) {
      console.error(`[LTM template] ${LTM_STATS_URL} returned non-JSON:`, text.slice(0, 200));
      ltmRatingTemplateCache = {};
      return {};
    }

    const loadedRatings = Object.keys(map);
    console.log(`[LTM template] loaded ${loadedRatings.length} rating brackets:`, loadedRatings);

    ltmRatingTemplateCache = map;
    return map;
  } catch (err) {
    console.error(`[LTM template] ${LTM_STATS_URL} fetch threw:`, err);
    ltmRatingTemplateCache = {};
    return {};
  }
}

async function fetchLtmCards() {
  try {
    const [csvRes, templates] = await Promise.all([
      fetch(databases.ltm),
      fetchLtmRatingTemplates()
    ]);
    console.log(`[LTM] ${databases.ltm} -> ${csvRes.status} ${csvRes.ok ? 'OK' : 'FAILED'}`);
    if (!csvRes.ok) throw new Error(`HTTP ${csvRes.status}`);

    const rows = parseCSV(await csvRes.text());
    console.log(`[LTM] parsed ${rows.length} CSV rows`);

    const players = [];

    rows.forEach(row => {
      if (!row.id) return;

      const createTime = row.createTime || '1970-01-01T00:00:00Z';
      const updateTime = row.updateTime || createTime;

      const identityFields = {
        name:         fsString(row.name),
        position:     fsString((row.position || '').toUpperCase()),
        altPositions: fsString((row.altPositions || '').toUpperCase()),
        nationId:     fsInt(row.nationId),
        leagueId:     fsInt(row.leagueId),
        clubId:       fsInt(row.clubId),
        color:        fsString(row.color),
        specialChem:  fsString(row.specialChem),
        man:          fsBool(row.man),
        totwNumber:   fsInt(row.totwNumber),
        tradable:     fsBool(row.tradable),
        packable:     fsInt(row.packable),
        inPicks:      fsBool(row.inPicks),
        inTokens:     fsBool(row.inTokens),
        id:           fsString(row.id),
        baseId:       fsInt(row.baseId),
        itemId:       fsInt(row.itemId),
        date:         fsInt(row.date)
      };

      // Object.entries() on numeric-looking keys ("67".."98") always
      // enumerates in ascending order regardless of JSON structure, so
      // sort explicitly by rating descending to get highest-first per player.
      const sortedRatingEntries = Object.entries(templates)
        .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

      sortedRatingEntries.forEach(([rating, templateJson]) => {
        // Each rating file is keyed by CSV id — pull this specific
        // player's stat block out of it. No entry means this player
        // doesn't have a card at this rating tier.
        const playerStats = templateJson?.[row.id];
        if (!playerStats) return;

        const fields = {
          ...ratingJsonToFields(playerStats),
          ...identityFields,
          rating: fsInt(rating),
          // LTM cards never use the dynamic face image, regardless of
          // what the rating template says.
          url: fsBool(false)
        };

        players.push({
          mapValue:   { fields },
          createTime,
          updateTime,
          database:   'ltm'
        });
      });
    });

    console.log(`[LTM] built ${players.length} cards from ${rows.length} rows across ${Object.keys(templates).length} rating files`);
    if (players.length === 0 && rows.length > 0) {
      console.warn('[LTM] rows parsed but zero cards built — check that each row\'s id (e.g. "id272978") matches a key inside the rating JSON files');
    }
console.log('[DEBUG files] _rawFileIdsByDb:', JSON.stringify(
  Object.fromEntries(Object.entries(window._rawFileIdsByDb || {}).map(([k,v]) => [k, [...v]]))
));
console.log('[DEBUG files] _allFilesByDb:', JSON.stringify(
  Object.fromEntries(Object.entries(window._allFilesByDb || {}).map(([k,v]) => [k, [...v]]))
));
    return players;
  } catch (err) {
    console.error('[fetchLtmCards] failed:', err);
    return [];
  }
}
// ─────────────────────────────────────────────
// Fatal image code
// ─────────────────────────────────────────────
function getFatalImageCode(attack, control, defense) {
  const A       = parseInt(attack)  || 0;
  const C       = parseInt(control) || 0;
  const D       = parseInt(defense) || 0;
  const highest = Math.max(A, C, D);
  const diff    = highest - 3;
  return `${A <= highest && A >= diff ? 1 : 0}${C <= highest && C >= diff ? 1 : 0}${D <= highest && D >= diff ? 1 : 0}`;
}

// Attack/control/defense ranked highest-to-lowest — index 0 is the
// "Highest Fatal" sort tier, index 1 is "2nd Highest Fatal", index 2 is
// "3rd Highest Fatal".
function getFatalTiersSorted(fields) {
  return [
    parseInt(fields.attack?.integerValue  || 0),
    parseInt(fields.control?.integerValue || 0),
    parseInt(fields.defense?.integerValue || 0)
  ].sort((a, b) => b - a);
}
// ─────────────────────────────────────────────
// Card HTML builder
// ─────────────────────────────────────────────
async function buildCardHTML(p, options = {}) {
  const {
    linkPrefix = 'Card-Detail.html',
    showDownload = true,
    hideMenu = false,
    visibilityOverride = null,   // { name, rating, position, altPositions, stats, fatals, club, league, nation, face }
    designOverride = null,       // { url, topColor, midColor, botColor }
    faceOverride = null,         // { url }
    faceMaskOverride = null,     // { enabled, offsetX, offsetY, scale, showDebug }
    altPosOverride = null,       // { bg, text, outline }
  } = options;
  if (!p?.mapValue?.fields) return '';
  const f = p.mapValue.fields;
  const evoPostId = f._evoPostId?.stringValue || null;

  const name           = f.name?.stringValue          || 'Unknown';
  const rating         = f.rating?.integerValue        || '0';
  const position       = f.position?.stringValue       || 'NA';
  const altPositions   = f.altPositions?.stringValue   || '';
  const totwNumber     = Number(f.totwNumber?.integerValue ?? -1);
  const pac            = f.PAC?.integerValue            || '0';
  const sho            = f.SHO?.integerValue            || '0';
  const pas            = f.PAS?.integerValue            || '0';
  const dri            = f.DRI?.integerValue            || '0';
  const def            = f.DEF?.integerValue            || '0';
  const phy            = f.PHY?.integerValue            || '0';
  const attack         = f.attack?.integerValue         || '0';
  const control        = f.control?.integerValue        || '0';
  const defense        = f.defense?.integerValue        || '0';

  const fatalCode      = getFatalImageCode(attack, control, defense);
  const fatalImageURL  = `https://mf-data.b-cdn.net/26/Fatal/Stats/fatal_card_stats_${fatalCode}.png`;
  const nationId       = f.nationId?.integerValue       || '0';
  const leagueId       = f.leagueId?.integerValue       || '0';
  const clubId         = f.clubId?.integerValue         || '0';
  const color          = f.color?.stringValue           || 'default';
  const id             = f.id?.stringValue?.replace('id', '') || '00000000';
  const baseId         = f.baseId?.integerValue         || '00000000';
  const hasDynamicImg  = f.url?.booleanValue === true;
console.log(name, 'id:', id, 'baseId:', baseId, 'hasDynamicImg:', hasDynamicImg);

  // Visibility of each element — defaults to fully visible unless a caller
  // (e.g. Card Creator's live preview) passes overrides.
  const v = visibilityOverride || {
    name: true, rating: true, position: true, altPositions: true,
    stats: true, fatals: true, club: true, league: true, nation: true, face: true,
  };

  let specialChem = '';
  if (f.specialChem?.stringValue) {
    const chemMap = {
      league3: '+3 League Chem', league2: '+2 League Chem', league1: '+1 League Chem',
      club3:   '+3 Club Chem',   club2:   '+2 Club Chem',   club1:   '+1 Club Chem',
      nation3: '+3 Nation Chem', nation2: '+2 Nation Chem', nation1: '+1 Nation Chem',
      cardBoost: 'Card Boost'
    };
    const chemParts = f.specialChem.stringValue.split(',').map(s => s.trim());
    const grouped = {};
    const order = [];
    for (const part of chemParts) {
      const match = part.match(/^(league|club|nation)(\d)$/);
      if (match) {
        const num = match[2];
        if (!grouped[num]) { grouped[num] = []; order.push(num); }
        grouped[num].push(match[1].charAt(0).toUpperCase() + match[1].slice(1));
      } else {
        order.push('__raw__' + part);
      }
    }
    specialChem = order.map(key => {
      if (key.startsWith('__raw__')) return chemMap[key.slice(7)] || key.slice(7);
      const types = grouped[key];
      if (!types) return '';
      const last = types.pop();
      const label = types.length ? types.join(', ') + ' and ' + last : last;
      return `+${key} ${label} Chem`;
    }).filter(Boolean).join(' + ');
  }

const isGK = position.toUpperCase() === "GK";
  let statLabels = ["PAC","SHO","PAS","DRI","DEF","PHY"];
  if (isGK) statLabels = ["DIV","HAN","KIC","REF","SPD","POS"];

  // Only LTM cards need the value-source fix — their GK stat blocks are
  // keyed as DIV/HAN/KIC/REF/SPD/POS, not PAC/SHO/PAS/DRI/DEF/PHY.
  let statValues = [pac, sho, pas, dri, def, phy];
  if (isGK && p.database === 'ltm') {
    statValues = [
      f.DIV?.integerValue || '0',
      f.HAN?.integerValue || '0',
      f.KIC?.integerValue || '0',
      f.REF?.integerValue || '0',
      f.SPD?.integerValue || '0',
      f.POS?.integerValue || '0'
    ];
  }
  const colorKey        = (color || 'default').toString().trim().toLowerCase();
  const isSmall         = !!window._smallCardsMode;
  const LEAGUE_INSTEAD_OF_CLUB = new Set(['114605', '132794']);
  // This club/league combo shows the league badge only, no club badge
  const isLeagueOnly           = String(clubId) === '112658' && String(leagueId) === '2118';
  const showLeagueInClubSlot   = isSmall && (LEAGUE_INSTEAD_OF_CLUB.has(String(clubId)) || isLeagueOnly);
  const hideClubBadge          = isLeagueOnly && !isSmall; // full-size cards already show the league, so just drop the club
  const clubSlotURL = showLeagueInClubSlot
    ? `https://mf-data.b-cdn.net/27/Badges/Leagues/league_large_${leagueId}.png`
    : `https://mf-data.b-cdn.net/27/Badges/Clubs/club_large_${clubId}.png`;
  const clubSlotAlt = showLeagueInClubSlot ? 'League badge' : 'Club Badge';
  // LTM cards each have their own per-player entry in color.json, keyed
  // as "ltm_<baseId>" (e.g. "ltm_272978") — not the generic "ltm" key.
  const matchedCard     = p.database === 'ltm'
    ? colorMap[`ltm_${baseId}`]
    : colorMap[colorKey];
  const usingDesignOverride = designOverride && designOverride.url;
  const cardImageURL    = usingDesignOverride
    ? designOverride.url
    : (isSmall
        ? (matchedCard?.url_small || `https://mf-data.b-cdn.net/27/Colors/${colorKey || 'default'}_small.png`)
        : (matchedCard?.url_big   || `https://mf-data.b-cdn.net/27/Colors/${colorKey || 'default'}_big.png`));
  const topTextColor    = usingDesignOverride ? (designOverride.topColor || "#000000") : (matchedCard?.top_text_color    || "#000000");
  const middleTextColor = usingDesignOverride ? (designOverride.midColor || "#FFFFFF") : (matchedCard?.middle_text_color || "#FFFFFF");
  const bottomTextColor = usingDesignOverride ? (designOverride.botColor || "#FFFFFF") : (matchedCard?.bottom_text_color || "#FFFFFF");

  const safeFileName = `${name.replace(/'/g, '').replace(/\s+/g, '_')}_${rating}_${color}.png`;

  // LTM cards use a fixed per-card background art (ltm_<baseId>_big.png)
  // and never show a player face.
  // Face mask (used by Card Creator's live preview to crop/reposition a face)
  const FACE_MASK_URL = faceMaskOverride?.url || 'https://mf-data.b-cdn.net/26/mask_cardcreator.png';
  const maskEnabled = !!faceMaskOverride?.enabled;
  const maskSizePct = Math.round((faceMaskOverride?.scale || 1) * 100);
  const maskPosX    = faceMaskOverride?.offsetX || 0;
  const maskPosY    = faceMaskOverride?.offsetY || 0;
  const maskStyle   = maskEnabled
    ? `-webkit-mask-image:url('${FACE_MASK_URL}');mask-image:url('${FACE_MASK_URL}');-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:${maskSizePct}% ${maskSizePct}%;mask-size:${maskSizePct}% ${maskSizePct}%;-webkit-mask-position:${maskPosX}px ${maskPosY}px;mask-position:${maskPosX}px ${maskPosY}px;`
    : '';

  let faceClass = 'player-face';
  let faceSrc = '';

  if (isSmall && hasDynamicImg) {
    faceClass = 'normal-face';
    faceSrc = `https://trivela.b-cdn.net/27/faceS/p${id}_small.png`;
  } else if (hasDynamicImg) {
    faceClass = 'normal-face';
    faceSrc = `https://trivela.b-cdn.net/27/faces/p${id}.png`;
  } else {
    faceClass = 'player-face';
    faceSrc = isSmall
      ? `https://trivela.b-cdn.net/27/normalFacesSmall/${id}.png`
      : `https://trivela.b-cdn.net/27/normalFacesBig/${id}.png`;
  }

  const usingFaceOverride = faceOverride && faceOverride.url;

  const faceHTML = p.database === 'ltm' ? '' : (usingFaceOverride ? `<img
  class="player-face"
  style="${maskStyle}"
  src="${faceOverride.url}"
  alt="${name} Face"
>` : `<img
  class="${faceClass}"
  style="${maskStyle}"
  src="${faceSrc}"
  alt="${name} Face"
  data-step=""
  data-id="${id}"
  data-base-id="${baseId}"
  data-dynamic="${hasDynamicImg ? '1' : '0'}"
  data-small="${isSmall ? '1' : '0'}"
  onerror="
    const step = this.dataset.step;
    const isDynamic = this.dataset.dynamic === '1';
    const pid = this.dataset.id;
    const bid = this.dataset.baseId;
    if (isDynamic && !step) {
      this.dataset.step = 'normal';
      this.classList.remove('normal-face');
      this.classList.add('player-face');
      this.src = 'https://trivela.b-cdn.net/27/normalFacesBig/' + pid + '.png';
    } else if (step === 'normal' || (!isDynamic && !step)) {
      this.dataset.step = 'base';
      this.src = 'https://trivela.b-cdn.net/27/normalFacesBig/' + bid + '.png';
    } else {
      this.onerror = null;
      this.classList.add('fallback-face');
      this.src = 'Main Assets/boo.png';
    }
  "
>`);

  const debugOverlayHTML = (maskEnabled && faceMaskOverride?.showDebug && p.database !== 'ltm')
    ? `<div class="${usingFaceOverride ? 'player-face' : faceClass} mask-debug-overlay"
         style="background-image:url('${FACE_MASK_URL}');background-repeat:no-repeat;background-size:${maskSizePct}% ${maskSizePct}%;background-position:${maskPosX}px ${maskPosY}px;"></div>`
    : '';
  const devData     = escapeForAttr(JSON.stringify(p?.mapValue?.fields || {}, null, 2));
  const devCreate = escapeForAttr(p.createTime || '—');
  const devUpdate = escapeForAttr(p.updateTime || '—');
  const devFileId = escapeForAttr(p.fileId     || '—');

  return `
    <div class="card-and-breakdown">
        <div class="card-wrapper">
          ${hideMenu ? '' : `
          <div class="card-menu-wrap">
            <button class="card-three-dots" onclick="toggleCardMenu(this)">⋮</button>
            <div class="card-menu-dropdown">
              <a class="card-menu-item" href="${buildDetailUrl(name, id, { database: p.database, rating })}" target="_blank" rel="noopener noreferrer">View Player Profile</a>
              <button class="card-menu-item" style="display:${window.showDownloadBtn ? '' : 'none'}" onclick="event.stopPropagation();downloadCardImage(this.closest('.card-and-breakdown').querySelector('.card'),'${safeFileName}')">Download Card</button>
              <button class="card-menu-item" onclick="event.stopPropagation();window._evoOpenTreeFromCard && window._evoOpenTreeFromCard(this)">View Evo Paths</button>
              ${evoPostId ? `<button class="card-menu-item" onclick="event.stopPropagation();window._evoHandlePostClick && window._evoHandlePostClick('${evoPostId}')">Download Social Post</button>` : ''}
              <button class="card-menu-item" onclick="event.stopPropagation();openDevMenu(this)">Dev Menu</button>
            </div>
          </div>`}
          <div class="card-dev-panel" style="display:none" data-create-time="${devCreate}" data-update-time="${devUpdate}" data-file-id="${devFileId}">
            <span class="card-dev-db" style="display:none">${p.database}</span>
            <pre class="card-dev-pre" style="display:none" data-dev="${devData}"></pre>
          </div>
          <div class="card">
            <img src="${cardImageURL}" alt="${color} card">
            <div class="overall-position">
              ${v.rating   ? `<div class="overall player-rating" style="color: ${topTextColor};">${rating}</div>` : ''}
              ${v.position ? `<div class="position player-position" style="color: ${topTextColor};">${position}</div>` : ''}
            </div>
            ${v.altPositions && altPositions ? `<div class="alt-positions">${altPositions.split(',').map(pos => {
              const hex = altPosOverride?.bg || matchedCard?.alt_pos_background || '#333333';
              const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
              const badgeBg     = `rgba(${r},${g},${b},0.8)`;
              const badgeText   = altPosOverride?.text    || matchedCard?.alt_pos_text    || '#fff';
              const badgeBorder = altPosOverride?.outline || matchedCard?.alt_pos_outline || '#000';
              return `<div class="alt-pos" style="--alt-badge-bg:${badgeBg};--alt-badge-text:${badgeText};--alt-badge-border:${badgeBorder};--alt-name-color:${middleTextColor};">${pos.trim()}</div>`;
            }).join('')}</div>` : ''}
            ${v.name ? `<div class="player-name" style="color: ${middleTextColor};">${name}</div>` : ''}
            ${totwNumber !== -1 ? `<div class="totwNumber">TOTW ${totwNumber}</div>` : ''}
            <div class="specialChem">${specialChem}</div>
            ${v.stats ? `
            <div class="stats">
              ${statLabels.map((label, idx) => {
                return `<div class="stat"><div class="stat-label" style="color: ${bottomTextColor};">${label}</div><div class="stat-value" style="color: ${bottomTextColor};">${statValues[idx]}</div></div>`;
              }).join('')}
            </div>
            <div class="stats-separator"></div>` : ''}
            ${v.fatals ? `
            <div class="fatals">
              <img class="fatal-bg" src="${fatalImageURL}" alt="Fatal BG">
              <div class="fatal-value-container">
                <div class="fatal-value">${attack}</div>
                <div class="fatal-value">${control}</div>
                <div class="fatal-value">${defense}</div>
              </div>
            </div>` : ''}
          <div class="badges${isLeagueOnly ? ' badges--league-only' : ''}">
            ${v.nation ? `<img class="badge flag"   src="https://mf-data.b-cdn.net/27/Badges/Nations/nation_large_${nationId}.png" alt="Nation Flag">` : ''}
            ${v.league ? `<img class="badge league" src="https://mf-data.b-cdn.net/27/Badges/Leagues/league_large_${leagueId}.png" alt="League badge">` : ''}
            ${v.club && !hideClubBadge ? `<img class="badge club"   src="${clubSlotURL}" alt="${clubSlotAlt}">` : ''}
          </div>
          ${v.face ? faceHTML + debugOverlayHTML : ''}
        </div>
      </div>
    </div>
  `;
}


// ─────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────
function renderPlayers(players) {
  playersToRender = players;
  currentPage     = 1;
  totalPages      = Math.max(1, Math.ceil(playersToRender.length / CARDS_PER_PAGE));
  renderPage();
  updatePaginationUI();
}

async function renderPage() {
  if (isRendering) return;
  isRendering = true;

  try {
    container.innerHTML = '';
    document.querySelectorAll('body > .card-dev-panel').forEach(p => p.remove());
    document.getElementById('card-dev-backdrop')?.classList.remove('open');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.remove();

    const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
    const endIndex   = Math.min(startIndex + CARDS_PER_PAGE, playersToRender.length);

    if (!IS_LIVE_PAGE) {
      // Build every card's HTML first, then write to the DOM once —
      // avoids one reflow/repaint per card (was up to 100 per page).
      const htmlParts = [];
      for (let index = startIndex; index < endIndex; index++) {
        htmlParts.push(await buildCardHTML(playersToRender[index], { linkPrefix: 'Card-Detail.html', showDownload: true }));
      }
      container.innerHTML = htmlParts.join('');
    } else if (window._liveUpgradedOnly) {
      // "Show upgraded cards only" mode — render just the live/upgraded
      // card for each player, in the normal single-card grid, same as
      // the non-live page. No pair wrapper, no base card, no arrow.
      const htmlParts = [];
      for (let index = startIndex; index < endIndex; index++) {
        htmlParts.push(await buildCardHTML(playersToRender[index], { linkPrefix: 'Card-Detail.html', showDownload: true }));
      }
      container.innerHTML = htmlParts.join('');
    } else {
      for (let index = startIndex; index < endIndex; index++) {
        const p = playersToRender[index];
        const wrapper       = document.createElement('div');
        wrapper.className   = 'live-player-pair';
        const liveHTML      = await buildCardHTML(p, { linkPrefix: 'Card-Detail.html', showDownload: true });

        let baseHTML = '';
        if (p.baseCard) {
          baseHTML = await buildCardHTML(p.baseCard, { linkPrefix: 'Card-Detail.html', showDownload: false });
        } else {
          baseHTML = `
            <div class="live-no-base">
              <div class="live-no-base-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
                </svg>
              </div>
              <span>No base card</span>
            </div>`;
        }

        wrapper.innerHTML = `
          <div class="live-pair-box">
            <div class="live-cards-row">
              <div class="live-card-slot base-card-slot">
                <div class="live-slot-label">ORIGINAL</div>
                ${baseHTML}
              </div>
              <div class="live-upgrade-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div class="live-card-slot live-card-slot-upgraded">
                <div class="live-slot-label upgraded-label">UPGRADED</div>
                ${liveHTML}
              </div>
            </div>
          </div>
        `;
        container.appendChild(wrapper);
      }
    }
  } catch (err) {
    console.error('renderPage error:', err);
  } finally {
    isRendering = false;
    updatePaginationUI();
  }
}

function updatePaginationUI() {
  const resultsCount = document.getElementById('resultsCount');
  const paginationEl = document.getElementById('pagination');
  const pageInput    = document.getElementById('pageInput');

  const start = (currentPage - 1) * CARDS_PER_PAGE + 1;
  const end   = Math.min(currentPage * CARDS_PER_PAGE, playersToRender.length);
  resultsCount.textContent = playersToRender.length === 0
    ? 'No players'
    : `Showing ${start}-${end} of ${playersToRender.length} player${playersToRender.length !== 1 ? 's' : ''}`;

  paginationEl.style.display = playersToRender.length <= CARDS_PER_PAGE ? 'none' : 'flex';
  if (pageInput) { pageInput.value = currentPage; pageInput.max = totalPages; }
  document.getElementById('pageInfo').textContent = `of ${totalPages}`;
  document.getElementById('pagePrev').disabled    = currentPage <= 1;
  document.getElementById('pageFirst').disabled   = currentPage <= 1;
  document.getElementById('pageNext').disabled    = currentPage >= totalPages;
  document.getElementById('pageLast').disabled    = currentPage >= totalPages;
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
async function init() {
  try {
    const F = await import('./Filter.js');
    FilterModule = F;
    ({ selectedClubs, selectedLeagues, selectedNations, selectedColors,
       selectedPositions, selectedAltPositions, selectedRequiredPositions, positionMode,
       statFiltersState, STAT_KEYS, sortRules, displayState, downloadState,
       miscState, uniqueColors, selectedDbs, selectedLtmRatings } = F);
    ({ setUniqueColors, normalise, updateActiveFilters, initFilterSidebar,
       toggleFilterNav, clearAllFilters, rebuildClubLeagueNationLists,
       rebuildColorFilterOptions, buildPositionList, buildAltPositionList,
       rebuildStatFiltersUI, initRatingSlider, colorMatchesSelected } = F);
  } catch (err) {
    console.error('[init] Filter.js failed to load, filters are running on defaults:', err);
  }

  window._filterAndSort = filterAndSort;
  window._cardShowToast = showToast;
  window._currentSearch = '';
  window._allPlayers    = allPlayers;
  window.showDownloadBtn = true;

  if (typeof applyDisplayState === 'function') applyDisplayState();

  document.getElementById('sort-select')?.addEventListener('change', filterAndSort);

  document.getElementById('pageFirst')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage = 1; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.getElementById('pageLast')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage = totalPages; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.getElementById('pagePrev')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.getElementById('pageNext')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  const pageInput = document.getElementById('pageInput');
  if (pageInput) {
    pageInput.addEventListener('change', () => {
      let val = parseInt(pageInput.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > totalPages) val = totalPages;
      if (val !== currentPage) { currentPage = val; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else { pageInput.value = currentPage; }
    });
  }

  // Nothing is rendered until fetchAllPlayers() fully completes across
  // every database — see buildFiltersFromPlayers(), which only fires once
  // the whole fetchAllDatabases() loop is done. This keeps the loading
  // screen up the entire time instead of showing some databases' cards
  // before others.
  try {
    await Promise.all([fetchRemoteCardDesigns(), fetchAllPlayers()]);
  } catch (err) {
    console.error('[init] fatal error during load:', err);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.remove();
    container.innerHTML = `<p style="padding:20px;text-align:center;color:#c0392b">
      Failed to load. Check the console for details.</p>`;
  }
}
function escapeForAttr(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function downloadCardImage(cardEl, fileName) {
  if (!cardEl) return;
  if (typeof html2canvas !== 'function') {
    showToast('Download unavailable — html2canvas missing');
    return;
  }

  const realContainer = cardEl.closest('#card-container');
  const isSmall = !!realContainer?.classList.contains('small-card-mode');

  // Hidden host with the same id/classes so the small-card CSS applies
  const host = document.createElement('div');
  if (realContainer) {
    host.id = 'card-container';
    host.className = realContainer.className;
  }
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;pointer-events:none;' +
    'display:block;margin:0;padding:0;width:auto;max-width:none;overflow:visible;';

  const clone = cardEl.cloneNode(true);
  clone.style.setProperty('transform', 'none', 'important');
  clone.style.setProperty('margin', '0', 'important');
  clone.style.setProperty('left', '0', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('flex-shrink', '0', 'important');

  // Respect the download settings (same rules the old Cards.html version used)
  const ds = window._downloadState || downloadState;
  const hideInClone = sel => clone.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
  hideInClone('.totwNumber, .specialChem, .download-btn, .download-face-btn');
  if (!ds.showFCM)       hideInClone('.fatal-meta-badge');
  if (!ds.showFatal)     hideInClone('.fatals');
  if (!ds.showAltPos)    hideInClone('.alt-positions');
  if (!ds.showBreakdown) hideInClone('.fcm-breakdown');

  host.appendChild(clone);
  document.body.appendChild(host);

  // Small cards are 120px wide, so render them at a higher scale to stay sharp
  const scale = (window._downloadScale || 3) * (isSmall ? 2 : 1);

  try {
    await document.fonts?.ready;
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise(res => { img.onload = img.onerror = res; })
    ));

    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      scale,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      windowWidth: 1280,   // lay out as desktop, so mobile media queries don't apply
      windowHeight: 900,
      onclone: (doc) => {
        // The cloned document gets its own copy of the host; pull it back
        // on-screen there so html2canvas captures it at 0,0.
        const h = doc.getElementById('card-container') || doc.body.lastElementChild;
        if (h && h.style) h.style.left = '0px';
      }
    });

    const link = document.createElement('a');
    link.download = fileName || 'card.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('[downloadCardImage] failed:', err);
    showToast('Failed to download card image');
  } finally {
    host.remove();
  }
}

function toggleCardMenu(btn) {
  event.stopPropagation();
  const wrap = btn.closest('.card-and-breakdown');
  const dropdown = btn.nextElementSibling;
  const devPanel = wrap.querySelector('.card-dev-panel');
  const isOpen = dropdown.classList.contains('open');
  document.querySelectorAll('.card-menu-dropdown.open').forEach(d => {
    d.classList.remove('open', 'flip-right');
    d.style.transform = '';
  });
  document.querySelectorAll('.card-dev-panel').forEach(p => { if (p !== devPanel) p.style.display = 'none'; });
  if (!isOpen) {
    // Reset any leftover state, then measure with default (opens left) positioning
    dropdown.classList.remove('flip-right');
    dropdown.style.transform = '';
    dropdown.classList.add('open');
    let rect = dropdown.getBoundingClientRect();

    // Not enough room on the left -> flip to open on the right instead
    if (rect.left < 8) {
      dropdown.classList.add('flip-right');
      rect = dropdown.getBoundingClientRect();
    }

    // Still hanging off an edge -> nudge it back onto the screen
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > vw - 16) shift = (vw - 16) - rect.right;
    if (rect.left + shift < 8) shift = 8 - rect.left;
    if (shift) dropdown.style.transform = `translateX(${shift}px)`;
  }
}

const DEV_KEY_ORDER = ['name','position','altPositions','rating','PAC','SHO','PAS','DRI','DEF','PHY','attack','control','defense','nationId','leagueId','clubId','color','specialChem','man','totwNumber','tradable','packable','inPicks','inTokens','id','baseId','itemId','url','date'];

function getDevBackdrop() {
  let backdrop = document.getElementById('card-dev-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'card-dev-backdrop';
    backdrop.className = 'card-dev-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => {
      const openPanel = document.querySelector('.card-dev-panel[style*="display: block"], .card-dev-panel[style=""]');
      document.querySelectorAll('.card-dev-panel').forEach(p => { p.style.display = 'none'; });
      backdrop.classList.remove('open');
    });
  }
  return backdrop;
}

function openDevMenu(btn) {
  event.stopPropagation();
  const wrap = btn.closest('.card-and-breakdown');
  const dropdown = wrap.querySelector('.card-menu-dropdown');
  // Hidden data holder — stays inside the card so the card's data is
  // always findable (Dev Menu, Evo Paths, etc.)
  const source = wrap.querySelector('.card-dev-panel');
  const backdrop = getDevBackdrop();

  dropdown.classList.remove('open');

  // The visible panel is a separate element on <body> so position:fixed
  // spans the full viewport. It's remembered on the card for reuse.
  let panel = wrap._devPanel;
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'card-dev-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
    wrap._devPanel = panel;
  }

  if (panel.dataset.built === 'true') {
    const willShow = panel.style.display === 'none';
    panel.style.display = willShow ? '' : 'none';
    backdrop.classList.toggle('open', willShow);
    return;
  }

  const raw = JSON.parse(source.querySelector('.card-dev-pre').dataset.dev
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
  const db   = source.querySelector('.card-dev-db').textContent.trim();
  wrap.dataset.createTime = source.dataset.createTime;
  wrap.dataset.updateTime = source.dataset.updateTime;
  wrap.dataset.fileId     = source.dataset.fileId;

  const exportObj = {};
  DEV_KEY_ORDER.forEach(k => { if (raw[k] !== undefined) exportObj[k] = raw[k].stringValue ?? raw[k].integerValue ?? raw[k].booleanValue ?? ''; });
  Object.keys(raw).forEach(k => { if (exportObj[k] === undefined) exportObj[k] = raw[k].stringValue ?? raw[k].integerValue ?? raw[k].booleanValue ?? ''; });

  const rows = DEV_KEY_ORDER
    .filter(k => raw[k] !== undefined)
    .concat(Object.keys(raw).filter(k => !DEV_KEY_ORDER.includes(k)))
    .map(k => {
      if (!raw[k]) return '';
      const val = raw[k].stringValue ?? raw[k].integerValue ?? raw[k].booleanValue ?? '';
      return `<tr><td class="dev-key">${k}</td><td class="dev-val">${val}</td></tr>`;
    }).join('');

  const exportJson = escapeForAttr(JSON.stringify(exportObj, null, 2));

  panel.innerHTML = `
    <div class="dev-header">
      <span class="dev-title">Dev Menu</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="dev-export-btn" onclick="event.stopPropagation();downloadDevJson(this)" data-json="${exportJson}">Export JSON</button>
        <button class="dev-close" onclick="event.stopPropagation();this.closest('.card-dev-panel').style.display='none';document.getElementById('card-dev-backdrop')?.classList.remove('open')">×</button>
      </div>
    </div>
    <div class="dev-section-label">Card Data</div>
    <table class="dev-table" style="margin-bottom:0">
      <tr><td class="dev-key">_database</td><td class="dev-val">${db}</td></tr>
      <tr><td class="dev-key">_faceClass</td><td class="dev-val" id="dev-face-class-${wrap.id || ''}"><em>checking…</em></td></tr>
      <tr><td class="dev-key">_faceSrc</td><td class="dev-val" style="word-break:break-all" id="dev-face-src-${wrap.id || ''}"><em>checking…</em></td></tr>
      <tr><td class="dev-key">_createTime</td><td class="dev-val">${wrap.dataset.createTime || '—'}</td></tr>
      <tr><td class="dev-key">_updateTime</td><td class="dev-val">${wrap.dataset.updateTime || '—'}</td></tr>
      <tr><td class="dev-key">_fileId</td><td class="dev-val">${wrap.dataset.fileId || '—'}</td></tr>
    </table>
    <div class="dev-section-label" style="margin-top:4px">Fields</div>
    <table class="dev-table">${rows}</table>`;

  panel.dataset.built = 'true';
  backdrop.classList.add('open');
    // Populate face debug info
  const faceImg = wrap.querySelector('.player-face, .normal-face, .fallback-face');
  const faceClassCell = panel.querySelector('[id^="dev-face-class-"]');
  const faceSrcCell   = panel.querySelector('[id^="dev-face-src-"]');
  if (faceImg && faceClassCell && faceSrcCell) {
    const cls = faceImg.classList.contains('normal-face')   ? '✅ normal-face (dynamic)'
               : faceImg.classList.contains('player-face')  ? '🟡 player-face (static)'
               : faceImg.classList.contains('fallback-face') ? '❌ fallback-face (boo.png)'
               : '❓ unknown';
    faceClassCell.textContent = cls;
    faceSrcCell.textContent   = faceImg.currentSrc || faceImg.src || '—';
  } else if (faceClassCell) {
    faceClassCell.textContent = '— no face img found';
  }
  panel.style.display = '';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.card-menu-wrap')) {
    document.querySelectorAll('.card-menu-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Only auto-run the full grid pipeline on pages that actually have a
  // #card-container (Cards.html, EvoChains.html). Pages that import this
  // module just for its helpers (e.g. Card-Detail.html) are unaffected.
  if (document.getElementById('card-container')) init();
});
// ─────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────
function downloadDevJson(btn) {
  const json = btn.dataset.json.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'card_data.json';
  a.click();
}

window.toggleCardMenu = toggleCardMenu;
window.openDevMenu = openDevMenu;
window.downloadDevJson = downloadDevJson;
// Overrides the old inline version in Cards.html, which captured the live
// (CSS-scaled) card and broke on mobile.
window.downloadCardImage = downloadCardImage;
export { buildCardHTML, fetchRemoteCardDesigns, fetchAllPlayersRaw };