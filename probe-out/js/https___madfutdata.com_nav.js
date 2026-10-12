const console = { log() {}, info() {}, warn() {}, error() {}, debug() {}, table() {} };

const AVAILABLE_YEARS = [
  { year: "26", label: "MADFUT 26" },
  { year: "27", label: "MADFUT 27" },
];
const DEFAULT_YEAR = AVAILABLE_YEARS[0].year;

(function () {
  const s = document.createElement("style");
  s.textContent = `.col-bc-inner{display:flex;align-items:flex-start;gap:0;}`;
  document.head.appendChild(s);

  const nav = document.createElement("div");
  nav.innerHTML = `
<nav class="top-nav">
  <button class="menu-btn" id="menuBtn" aria-label="Toggle menu" aria-expanded="false">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path class="bar1" d="M 3 5 A 1.0001 1.0001 0 1 0 3 7 L 21 7 A 1.0001 1.0001 0 1 0 21 5 L 3 5 z"/>
      <path class="bar2" d="M 3 11 A 1.0001 1.0001 0 1 0 3 13 L 21 13 A 1.0001 1.0001 0 1 0 21 11 L 3 11 z"/>
      <path class="bar3" d="M 3 17 A 1.0001 1.0001 0 1 0 3 19 L 21 19 A 1.0001 1.0001 0 1 0 21 17 L 3 17 z"/>
    </svg>
  </button>

  <div class="search-wrap" id="searchWrap">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="searchInput" placeholder="SEARCH PLAYERS OR PAGES" aria-label="Search" autocomplete="off">
      <div class="search-year-filter" id="searchYearFilter">
        <button class="search-year-filter-btn" id="searchYearFilterBtn" aria-haspopup="listbox" aria-expanded="false" title="Filter by year">
          <img class="syf-img" id="syfImg" src="https://mf-data.b-cdn.net/web/Icons/madfut_${DEFAULT_YEAR}.png" alt="Year filter" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
          <span class="syf-img-fallback" id="syfFallback">${DEFAULT_YEAR}</span>
        </button>
        <div class="search-year-filter-drop" id="syfDrop" role="listbox">
          ${AVAILABLE_YEARS.map(y => `
          <button class="syf-drop-item" data-year="${y.year}" role="option" aria-selected="false">
            <img src="https://mf-data.b-cdn.net/web/Icons/madfut_${y.year}.png" alt="" onerror="this.style.display='none'">${y.label}
            <span class="syf-check"><svg viewBox="0 0 12 9"><polyline points="1,4.5 4.5,8 11,1"/></svg></span>
          </button>`).join('')}
        </div>
      </div>
    </div>
    <div class="search-dropdown" id="searchDropdown" role="listbox"></div>
  </div>

  <a href="/index.html" class="nav-logo">DATA</a>
</nav>

<div class="nav-drawer" id="navDrawer" aria-hidden="true">
  <div class="nav-drawer-inner">

    <div class="gen-row" role="group" aria-label="Select generation">
      ${AVAILABLE_YEARS.map(y => `
      <a href="#" class="gen-btn" data-year="${y.year}" aria-label="${y.label}" aria-pressed="false">
        <img src="https://mf-data.b-cdn.net/web/Icons/madfut_${y.year}.png" alt="${y.label}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <span class="gen-fallback">${y.year}</span>
      </a>`).join('')}
    </div>

    <div class="drawer-body">
      <div class="main-pages-wrap">
        <div class="sec-head sec-head--toggle" data-collapse="mainPages">MAIN PAGES<span class="sec-chevron">▾</span></div>
        <div class="main-pages-grid collapsible-content" id="mainPagesGrid"></div>
      </div>

      <div class="drawer-sep" aria-hidden="true"></div>

      <div class="side-lists">
        <div class="side-list-col">
          <div class="sec-head sec-head--toggle" data-collapse="morePages">MORE PAGES<span class="sec-chevron">▾</span></div>
          <ul class="drawer-links collapsible-content" id="morePages"></ul>
        </div>
        <div class="side-list-col">
          <div class="sec-head sec-head--toggle" data-collapse="gamesMisc">GAMES / MISC<span class="sec-chevron">▾</span></div>
          <ul class="drawer-links collapsible-content" id="gamesMisc"></ul>
        </div>
      </div>

      <div class="drawer-sep" aria-hidden="true"></div>

      <div class="right-panel">
        <div class="data-col">
          <div class="sec-head sec-head--toggle" data-collapse="colData">DATA<span class="sec-chevron">▾</span></div>
          <ul class="drawer-links collapsible-content" id="colData"></ul>
        </div>
        <div class="socials-col">
          <div class="sec-head">SOCIALS</div>
          <a href="https://www.instagram.com/madfoot1910" class="social-link" target="_blank" rel="noopener">
            <div class="soc-icon insta">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="5"/>
                <circle cx="17.5" cy="6.5" r="1.2" style="fill:var(--mid);stroke:none;" class="insta-dot"/>
              </svg>
            </div>INSTAGRAM
          </a>
          <a href="https://www.youtube.com/@madfut1910" class="social-link" target="_blank" rel="noopener">
            <div class="soc-icon">
              <svg viewBox="0 0 24 24"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
            </div>YOUTUBE
          </a>
          <a href="https://www.tiktok.com/@madfut1910" class="social-link" target="_blank" rel="noopener">
            <div class="soc-icon">
              <svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
            </div>TIKTOK
          </a>
          <a href="https://discord.gg/gUgVq68vdx" class="social-link" target="_blank" rel="noopener">
            <div class="soc-icon">
              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 50 50">
<path d="M 41.625 10.769531 C 37.644531 7.566406 31.347656 7.023438 31.078125 7.003906 C 30.660156 6.96875 30.261719 7.203125 30.089844 7.589844 C 30.074219 7.613281 29.9375 7.929688 29.785156 8.421875 C 32.417969 8.867188 35.652344 9.761719 38.578125 11.578125 C 39.046875 11.867188 39.191406 12.484375 38.902344 12.953125 C 38.710938 13.261719 38.386719 13.429688 38.050781 13.429688 C 37.871094 13.429688 37.6875 13.378906 37.523438 13.277344 C 32.492188 10.15625 26.210938 10 25 10 C 23.789063 10 17.503906 10.15625 12.476563 13.277344 C 12.007813 13.570313 11.390625 13.425781 11.101563 12.957031 C 10.808594 12.484375 10.953125 11.871094 11.421875 11.578125 C 14.347656 9.765625 17.582031 8.867188 20.214844 8.425781 C 20.0625 7.929688 19.925781 7.617188 19.914063 7.589844 C 19.738281 7.203125 19.34375 6.960938 18.921875 7.003906 C 18.652344 7.023438 12.355469 7.566406 8.320313 10.8125 C 6.214844 12.761719 2 24.152344 2 34 C 2 34.175781 2.046875 34.34375 2.132813 34.496094 C 5.039063 39.605469 12.972656 40.941406 14.78125 41 C 14.789063 41 14.800781 41 14.8125 41 C 15.132813 41 15.433594 40.847656 15.621094 40.589844 L 17.449219 38.074219 C 12.515625 36.800781 9.996094 34.636719 9.851563 34.507813 C 9.4375 34.144531 9.398438 33.511719 9.765625 33.097656 C 10.128906 32.683594 10.761719 32.644531 11.175781 33.007813 C 11.234375 33.0625 15.875 37 25 37 C 34.140625 37 38.78125 33.046875 38.828125 33.007813 C 39.242188 32.648438 39.871094 32.683594 40.238281 33.101563 C 40.601563 33.515625 40.5625 34.144531 40.148438 34.507813 C 40.003906 34.636719 37.484375 36.800781 32.550781 38.074219 L 34.378906 40.589844 C 34.566406 40.847656 34.867188 41 35.1875 41 C 35.199219 41 35.210938 41 35.21875 41 C 37.027344 40.941406 44.960938 39.605469 47.867188 34.496094 C 47.953125 34.34375 48 34.175781 48 34 C 48 24.152344 43.785156 12.761719 41.625 10.769531 Z M 18.5 30 C 16.566406 30 15 28.210938 15 26 C 15 23.789063 16.566406 22 18.5 22 C 20.433594 22 22 23.789063 22 26 C 22 28.210938 20.433594 30 18.5 30 Z M 31.5 30 C 29.566406 30 28 28.210938 28 26 C 28 23.789063 29.566406 22 31.5 22 C 33.433594 22 35 23.789063 35 26 C 35 28.210938 33.433594 30 31.5 30 Z"></path>
</svg>
            </div>DISCORD
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="overlay" id="overlay"></div>`;

  const breadcrumb = document.querySelector("nav.breadcrumb-bar");
  if (breadcrumb) {
    document.body.insertBefore(nav, breadcrumb);
  } else {
    document.body.prepend(nav);
  }
  const parent = nav.parentNode;
  while (nav.firstChild) parent.insertBefore(nav.firstChild, nav);
  parent.removeChild(nav);

  const breadcrumbBarEl = document.querySelector("nav.breadcrumb-bar");
  const showBcYear = !(breadcrumbBarEl && breadcrumbBarEl.dataset.showYear === "false");

  const scroll = document.querySelector(".breadcrumb-scroll");
  if (scroll && showBcYear) {
    const bcWrap = document.createElement("div");
    bcWrap.innerHTML = `<div class="bc-year-wrap" id="bcYearWrap">
      <button class="bc-year-btn" id="bcYearBtn" aria-haspopup="listbox" aria-expanded="false">
        <span id="bcYearLabel">MADFUT ${DEFAULT_YEAR}</span>
        <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>
      </button>
      <div class="bc-year-drop" id="bcYearDrop" role="listbox">
        ${AVAILABLE_YEARS.map(y => `
        <button class="bc-year-drop-item" data-year="${y.year}" role="option" aria-selected="false">
          <img src="https://mf-data.b-cdn.net/web/Icons/madfut_${y.year}.png" alt="" onerror="this.style.display='none'">${y.label}
        </button>`).join('')}
      </div>
    </div>`;
    const refNode = scroll.children[1] ? scroll.children[1].nextSibling : null;
    scroll.insertBefore(bcWrap.firstElementChild, refNode);
  }
})();

const { PAGE_YEAR, PAGE_SLUG } = (function() {
  const bcEl = document.querySelector("nav.breadcrumb-bar");
  const explicitYear = bcEl && bcEl.dataset.year ? bcEl.dataset.year : null;

  const parts = window.location.pathname.split("/").filter(Boolean);
  let yr, slug;
  if (parts.length >= 2) {
    yr   = parts[parts.length - 2];
    slug = parts[parts.length - 1].replace(".html", "");
  } else {
    const file = (parts[parts.length - 1] || "").replace(".html", "");
    const m = file.match(/^(\d+)(.+)$/);
    yr   = m ? m[1] : DEFAULT_YEAR;
    slug = m ? m[2] : file;
  }

  return { PAGE_YEAR: explicitYear || yr, PAGE_SLUG: slug };
})();

const menuBtn   = document.getElementById("menuBtn");
const navDrawer = document.getElementById("navDrawer");
const overlay   = document.getElementById("overlay");

function toggleNav(open) {
  menuBtn.classList.toggle("active", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  navDrawer.classList.toggle("open", open);
  navDrawer.setAttribute("aria-hidden", String(!open));
  overlay.classList.toggle("active", open);
  if (window.innerWidth > 768) document.body.style.overflow = open ? "hidden" : "";
}

menuBtn.addEventListener("click", () => toggleNav(!navDrawer.classList.contains("open")));

const NAV_COLLAPSE_KEY = "mf_nav_collapsed_sections";

function _getCollapseState() {
  try {
    return JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function _setCollapseState(id, collapsed) {
  const state = _getCollapseState();
  if (collapsed) {
    state[id] = true;
  } else {
    delete state[id];
  }
  try {
    localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(state));
  } catch (e) {
  }
}

const _savedCollapseState = _getCollapseState();

document.querySelectorAll(".sec-head--toggle").forEach(head => {
  const content = document.getElementById(head.dataset.collapse);
  if (!content) return;

  if (_savedCollapseState[head.dataset.collapse]) {
    content.classList.add("collapsed");
    head.classList.add("collapsed");
  }

  head.addEventListener("click", () => {
    const collapsed = content.classList.toggle("collapsed");
    head.classList.toggle("collapsed", collapsed);
    _setCollapseState(head.dataset.collapse, collapsed);
  });
});
overlay.addEventListener("click", () => toggleNav(false));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { toggleNav(false); closeSyfDrop(); closeBcDrop(); }
});

(function(){
  const input  = document.getElementById("searchInput");
  const wrap   = document.getElementById("searchWrap");
  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");
  ctx.font = "13px 'Roboto Condensed', sans-serif";
  const textW = ctx.measureText(input.placeholder).width;
  wrap.style.maxWidth = Math.ceil(14 + 8 + textW + 26 + 60) + "px";
  wrap.style.width = "100%";
})();

let activeYear = PAGE_YEAR || DEFAULT_YEAR;

const PLACEHOLDER_ICON = "https://mf-data.b-cdn.net/CentreShape.png";
const EVO = "https://mf-data.b-cdn.net/web/Icons/evo.png";
const UPGRADE = "https://mf-data.b-cdn.net/web/Icons/upgrade.png";
const CARD = "https://mf-data.b-cdn.net/web/Icons/cards1.png";
const LTM = "https://mf-data.b-cdn.net/web/Icons/ltm.png";
const DRAFT = "https://mf-data.b-cdn.net/web/Icons/draft.png";
const CUP = "https://mf-data.b-cdn.net/web/Icons/cups.png";
const SBC = "https://mf-data.b-cdn.net/web/Icons/sbc.png";
const FATAL = "https://mf-data.b-cdn.net/web/Icons/fatal.png";
const RANK = "https://mf-data.b-cdn.net/26/Draft/Ranks/draft_ranks_badge_0.png";



const mainPagesData = [
  { slug: "Cards",         color: "#11ffc3ff", label: "CARDS",         desc: "VIEW AND FILTER EVERY CARD",        icon: CARD, enabled: { 26: true, 27: true } },
  { slug: "Evo-Chains",    color: "#00dc3bff", label: "EVO CHAINS",     desc: "EVERY POSSIBLE EVO CHAIN",          icon: EVO, enabled: { 26: true, 27: true } },
  { slug: "Upgrade-Hub",   color: "#ea5200ff", label: "UPGRADE HUB",    desc: "EVERY UPGRADED CARD",               icon: UPGRADE, enabled: { 26: true, 27: false } },
  { slug: "LTM-Cards",     color: "#ffdd00ff", label: "LTM CARDS",      desc: "LTM CARDS WITH RATINGS & COST",     icon: LTM, enabled: { 26: true, 27: true } },
  { slug: "",    color: "#9b6bff", label: "",          desc: "",              icon: PLACEHOLDER_ICON, enabled: { 26: false, 27: false } }, 
  { slug: "",    color: "#9b6bff", label: "",          desc: "",              icon: PLACEHOLDER_ICON, enabled: { 26: false, 27: false } }, 

  { slug: "SBC-Groups",    color: "#be28ffff", label: "SBC GROUPS",     desc: "VIEW ALL SBCS WITH SOLUTIONS",      icon: SBC, enabled: { 26: true, 27: true } },
  { slug: "Objectives",     color: "#d91d00ff", label: "OBJECTIVES",     desc: "VIEW ALL OBJECTIVES",               icon: PLACEHOLDER_ICON, enabled: { 26: true, 27: false } },
  { slug: "Elite-Evos",    color: "#00dc3bff", label: "ELITE EVOS",     desc: "VIEW ALL ELITE EVOS",               icon: EVO, enabled: { 26: true, 27: false } },
  { slug: "Standard-Evos", color: "#00dc3bff", label: "STANDARD EVOS",  desc: "VIEW ALL STANDARD EVOS",            icon: EVO, enabled: { 26: true, 27: true } },
  { slug: "Votes",    color: "#9b6bff", label: "VOTES",          desc: "VIEW IN-GAME VOTE NUMBERS",              icon: PLACEHOLDER_ICON, enabled: { 26: true, 27: false } }, 
  { slug: "Promotions",    color: "#9b6bff", label: "PROMOS",          desc: "SEE ALL IN-GAME NOTTIFICATIONS",              icon: PLACEHOLDER_ICON, enabled: { 26: true, 27: false } }, 

  { slug: "Fatal-My-Club", color: "#ed0000ff", label: "FATAL", desc: "MY CLUB - SIM - DRAFT", icon: FATAL, enabled: { 26: true, 27: true },
  descLinks: [{ text: "MY CLUB", slug: "Fatal-My-Club" },{ text: "SIM",     slug: "Fatal-Sim"     },{ text: "DRAFT",   slug: "Fatal-Draft"   },]},
  { slug: "LTM-Market",    color: "#ffdd00ff", label: "LTM MARKET",     desc: "VIEW WHATS IN THE LTM MARKET",      icon: LTM, enabled: { 26: true, 27: true } },
  { slug: "Draft-Cups",    color: "#1ce1ffff", label: "CUPS",           desc: "VIEW ALL DRAFT AND DAILY CUPS",     icon: CUP, enabled: { 26: true, 27: false } }, 
  { slug: "DOTD",          color: "#00ae0cff", label: "DOTDS",          desc: "VIEW EVERY DRAFT OF THE DAY",       icon: DRAFT, enabled: { 26: true, 27: false } },
  { slug: "Draft-Ranks",   color: "#ff5e00ff", label: "RANKS",          desc: "VIEW ALL RANKED LEVELS",            icon: RANK, enabled: { 26: true, 27: true } },   
  { slug: "Configs",       color: "#8d99ae", label: "CONFIGS",        desc: "VIEW MADFUTS BACKEND",              icon: PLACEHOLDER_ICON, enabled: { 26: true, 27: true } },
];

const morePagesData = {
  items: [
    { slug: "Squad-Builder", label: "SQUAD BUILDER",  enabled: { 26: true, 27: true } },
    { slug: "Card-Creator",  label: "CARD CREATOR",   enabled: { 26: true, 27: true } },
    { slug: "Lightning-Rounds",      label: "LIGHTNING ROUNDS",      enabled: { 26: true, 27: true } },
    { slug: "Live-SBCs",      label: "LIVE SBCS",      enabled: { 26: true, 27: true } },
    { slug: "XP",        label: "EXPERIENCE",    enabled: { 26: false, 27: true } },
    { slug: "Draft-Bonuses", label: "DRAFT BONUSES",  enabled: { 26: false, 27: false } },
    { slug: "Pack-Bonuses",  label: "PACK BONUSES",   enabled: { 26: false, 27: false } },
    { slug: "Pack-Weight",   label: "PACK WEIGHT",    enabled: { 26: false, 27: false } },
    { slug: "JSON-Maker",   label: "JSON MAKER",    enabled: { 26: false, 27: false } },
  ]
};

const gamesMiscData = [
  { label: "ASSET LIBRARY",    href: "/Asset-Libary.html",                      enabled: { 26: true, 27: true } },
  { label: "38-0-0",           hrefFor: yr => "/" + yr + "/38-0.html",          enabled: { 26: true, 27: true } },
  { label: "GUESS THE *BLANK", hrefFor: yr => "/" + yr + "/Guess-Rating.html",  enabled: { 26: false, 27: false } },
  { label: "HIGHER OR LOWER",  hrefFor: yr => "/" + yr + "/Higher-Lower.html",  enabled: { 26: false, 27: false } }, 
];

const colDataData = [
  { label: "HOME PAGE",   href: "/index.html",   enabled: { 26: true,  27: true  }  },
  { label: "UPDATES",     href: "/Updates.html", enabled: { 26: true,  27: true  }  }, 
  { label: "ARTICLES",    href: "/Articles.html",    enabled: { 26: true,  27: true  }  },
  { label: "CONTACT US",  href: "/Contact.html", enabled: { 26: false, 27: false }  },
  { label: "LEGAL STUFF",    href: "/Privacy.html",    enabled: { 26: true,  27: true  }  },
];

// ─────────────────────────────────────────────
// Build the MAIN PAGES card grid
// ─────────────────────────────────────────────
function buildMainPages(year) {
  const grid = document.getElementById("mainPagesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  mainPagesData.forEach(item => {
    const yearEnabled = !!(item.enabled && item.enabled[year]);

    const a = document.createElement("a");
    a.className = "mp-card" + (yearEnabled ? "" : " disabled");
    a.href = "/" + year + "/" + item.slug + ".html";
    a.dataset.slug = item.slug;
    if (item.color) a.style.setProperty("--mp-accent", item.color);

    const title = document.createElement("span");
    title.className = "mp-card-title";
    title.textContent = item.label;

    const desc = document.createElement("span");
    desc.className = "mp-card-desc";

    if (item.descLinks) {
      item.descLinks.forEach((link, i) => {
        if (i > 0) desc.appendChild(document.createTextNode(" - "));
        const a = document.createElement("a");
        a.href = "/" + year + "/" + link.slug + ".html";
        a.textContent = link.text;
        a.addEventListener("click", e => e.stopPropagation());
        desc.appendChild(a);
      });
    } else {
      desc.textContent = item.desc;
    }

    const icon = document.createElement("img");
    icon.className = "mp-card-icon";
    icon.src = item.icon || MP_DEFAULT_ICON;
    icon.alt = "";
    icon.loading = "lazy";
    icon.onerror = () => { icon.style.display = "none"; };

    a.appendChild(icon);
    a.appendChild(title);
    a.appendChild(desc);
    grid.appendChild(a);
  });

  _applyFeatureDots();
}

// ─────────────────────────────────────────────
// Build a year-based link list (MORE PAGES)
// ─────────────────────────────────────────────
function buildList(id, data, year) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = "";

  const items = data.items || [];
  items.forEach(item => {
    const yearEnabled = !!(item.enabled && item.enabled[year]);
    const disabled = !yearEnabled;

    const li = document.createElement("li");
    const a  = document.createElement("a");

    a.href = item.global ? item.href : ("/" + year + "/" + item.slug + ".html");
    a.textContent = item.label;

    if (disabled) {
      a.style.cssText = "opacity:0.35;pointer-events:none;cursor:default;";
    }

    li.appendChild(a);
    ul.appendChild(li);
  });
}

function buildStaticList(id, items, year) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = "";
  items.forEach(item => {
    const li = document.createElement("li");
    const a  = document.createElement("a");
    a.href = item.hrefFor ? item.hrefFor(year) : item.href;
    a.textContent = item.label;
    const yearEnabled = !!(item.enabled && item.enabled[year]);
    if (!yearEnabled) {
      a.style.cssText = "opacity:0.35;pointer-events:none;cursor:default;";
    }
    li.appendChild(a);
    ul.appendChild(li);
  });
}

function setYear(yr, updateGen = false) {
  activeYear = yr;

  if (updateGen) {
    document.querySelectorAll(".gen-btn").forEach(b => {
      const sel = b.dataset.year === yr;
      b.classList.toggle("selected", sel);
      b.setAttribute("aria-pressed", String(sel));
    });
  }

  const syfImg = document.getElementById("syfImg");
  const syfFallback = document.getElementById("syfFallback");
  syfImg.style.display = "";
  syfFallback.style.display = "none";
  syfImg.src = "https://mf-data.b-cdn.net/web/Icons/madfut_" + yr + ".png";
  syfImg.onerror = function() {
    syfImg.style.display = "none";
    syfFallback.style.display = "block";
    syfFallback.textContent = yr;
  };
  syfFallback.textContent = yr;
  document.querySelectorAll(".syf-drop-item").forEach(b => {
    const sel = b.dataset.year === yr;
    b.classList.toggle("active", sel);
    b.setAttribute("aria-selected", String(sel));
  });

  _loadNavData();
  buildMainPages(yr);
  buildList("morePages", morePagesData, yr);
  buildStaticList("gamesMisc", gamesMiscData, yr);
  buildStaticList("colData", colDataData, yr);

  if (searchDropdown.classList.contains("show")) renderDrop(searchInput.value);
}

document.querySelectorAll(".gen-btn").forEach(btn => {
  btn.addEventListener("click", e => { e.preventDefault(); setYear(btn.dataset.year, true); });
});

const searchYearFilter    = document.getElementById("searchYearFilter");
const searchYearFilterBtn = document.getElementById("searchYearFilterBtn");

function closeSyfDrop() {
  searchYearFilter.classList.remove("open");
  searchYearFilterBtn.setAttribute("aria-expanded", "false");
}

searchYearFilterBtn.addEventListener("click", e => {
  e.stopPropagation();
  const open = searchYearFilter.classList.toggle("open");
  searchYearFilterBtn.setAttribute("aria-expanded", String(open));
  closeBcDrop();
  searchDropdown.classList.remove("show");
});

document.querySelectorAll(".syf-drop-item").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    setYear(btn.dataset.year, true);
    closeSyfDrop();
    searchInput.focus();
    renderDrop(searchInput.value);
  });
});

const bcYearWrap = document.getElementById("bcYearWrap");
const bcYearBtn  = document.getElementById("bcYearBtn");
const bcYearDrop = document.getElementById("bcYearDrop");

if (bcYearDrop) {
  document.body.appendChild(bcYearDrop);
  bcYearDrop.style.position = "fixed";
  bcYearDrop.style.zIndex   = "9999";
}

function positionBcDrop() {
  if (!bcYearBtn || !bcYearDrop) return;
  const r = bcYearBtn.getBoundingClientRect();
  bcYearDrop.style.top  = r.bottom + 4 + "px";
  bcYearDrop.style.left = r.left + "px";
}

function closeBcDrop() {
  if (!bcYearWrap || !bcYearBtn) return;
  bcYearWrap.classList.remove("open");
  bcYearBtn.setAttribute("aria-expanded", "false");
  if (bcYearDrop) bcYearDrop.style.display = "none";
}

if (bcYearBtn) bcYearBtn.addEventListener("click", e => {
  e.stopPropagation();
  const opening = bcYearDrop.style.display === "none" || !bcYearDrop.style.display;
  if (opening) {
    positionBcDrop();
    bcYearDrop.style.display = "block";
    bcYearWrap.classList.add("open");
    bcYearBtn.setAttribute("aria-expanded", "true");
  } else {
    closeBcDrop();
  }
  closeSyfDrop();
  searchDropdown.classList.remove("show");
});

document.querySelectorAll(".bc-year-drop-item").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const yr = btn.dataset.year;
    closeBcDrop();
    window.location.href = PAGE_SLUG === "index" ? "/index.html" : "/" + yr + "/" + PAGE_SLUG + ".html";
  });
});

document.addEventListener("click", e => {
  if (!e.target.closest("#searchYearFilter")) closeSyfDrop();
  if (!e.target.closest("#bcYearWrap"))       closeBcDrop();
  if (!e.target.closest("#searchWrap"))       searchDropdown.classList.remove("show");
});

// ─────────────────────────────────────────────
// PLAYER SEARCH — data cache & loading state
// ─────────────────────────────────────────────
let _navPlayers       = [];
let _navColorMap      = {};
let _navDataLoaded    = false;
const _navYearCache   = {};   // year -> { players, colorMap }
const _navYearStarted = {};   // year -> true once loading has begun
let _navLoadQueue     = Promise.resolve(); // loads one year at a time (Card.js writes to window.colorMap)

function _navNorm(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function _applyNavYear(year) {
  const cached = _navYearCache[year];
  _navPlayers    = cached ? cached.players  : [];
  _navColorMap   = cached ? cached.colorMap : {};
  _navDataLoaded = !!cached;
}

async function _loadNavData() {
  const year = activeYear;

  _applyNavYear(year);
  if (_navYearCache[year] || _navYearStarted[year]) return;
  _navYearStarted[year] = true;

  _navLoadQueue = _navLoadQueue.then(async () => {
    try {
      // 27 uses 27/js/Card.js, 26 keeps the old 26/js/Card.js
      const CardModule = await import(`/${year}/js/Card.js`);

      const [rawPlayers] = await Promise.all([
        CardModule.fetchAllPlayersRaw(),
        CardModule.fetchRemoteCardDesigns()
      ]);

      const colorMap = window.colorMap || {};

      const mapped = rawPlayers.map(entry => ({
        fields:     entry?.mapValue?.fields || {},
        createTime: entry.createTime || '',
        database:   entry.database   || ''
      }));

      const ltmByBaseId = new Map();
      const nonLtm = [];
      mapped.forEach(entry => {
        if (entry.database === 'ltm') {
          const baseId = entry.fields?.baseId?.integerValue || entry.fields?.id?.stringValue || '';
          const rating = parseInt(entry.fields?.rating?.integerValue || 0);
          const existing = ltmByBaseId.get(baseId);
          if (!existing) {
            ltmByBaseId.set(baseId, { ...entry, _ltmMinRating: rating, _ltmMaxRating: rating });
          } else {
            existing._ltmMinRating = Math.min(existing._ltmMinRating, rating);
            existing._ltmMaxRating = Math.max(existing._ltmMaxRating, rating);
          }
        } else {
          nonLtm.push(entry);
        }
      });

      _navYearCache[year] = {
        players: [...nonLtm, ...Array.from(ltmByBaseId.values())],
        colorMap
      };
    } catch (err) {
      console.warn(`[NavSearch] Failed to load ${year} player data`, err);
      delete _navYearStarted[year]; // allow a retry next time
    }

    // Only show it if the user is still on this year
    if (year === activeYear) {
      _applyNavYear(year);
      if (searchDropdown.classList.contains('show')) renderDrop(searchInput.value);
    }
  });
}

_loadNavData();

function _buildPlayerResult(entry, query) {
  const f       = entry.fields;
  const name    = f.name?.stringValue    || 'Unknown';
  const rating  = f.rating?.integerValue || '?';
  const pos     = f.position?.stringValue || '';
  const color   = (f.color?.stringValue  || 'default').trim().toLowerCase();
  const id      = (f.id?.stringValue     || '').replace('id', '');
  const baseId  = f.baseId?.integerValue || id;
  const dbName  = entry.database || 'realmExport';

  const isLtm   = entry.database === 'ltm';
  const ratingDisplay = isLtm && entry._ltmMinRating !== entry._ltmMaxRating
    ? `${entry._ltmMinRating}–${entry._ltmMaxRating}`
    : String(rating);
  const design  = isLtm
    ? (_navColorMap[`ltm_${baseId}`] || _navColorMap[color] || {})
    : (_navColorMap[color] || {});
  const colorSmall = c => activeYear === "27"
    ? `https://mf-data.b-cdn.net/27/Colors/${c}_small_27.png`
    : `https://mf-data.b-cdn.net/${activeYear}/Colors/${c}_small.png`;
  const cardImg = design.url_small
    || design.url_micro
    || colorSmall(color);
  const faceImg = activeYear === "27"
    ? `https://trivela.b-cdn.net/27/faceS/p${id}_small.png`
    : `https://trivela.b-cdn.net/${activeYear}/faces/p${id}_small.png`;

  function hlName(text, q) {
    if (!q) return text;
    const norm  = _navNorm(text);
    const normQ = _navNorm(q);
    const idx   = norm.indexOf(normQ);
    if (idx === -1) return text;
    return text.slice(0, idx) + '<em>' + text.slice(idx, idx + q.length) + '</em>' + text.slice(idx + q.length);
  }

  const href = `/${activeYear}/Card-Detail.html?id=${id}&color=${color}&db=${dbName}`;

  const a = document.createElement('a');
  a.className = 'search-result search-result--player';
  a.href      = href;
  a.setAttribute('role', 'option');

  a.innerHTML = `
    <div class="sr-card-thumb">
      <img class="sr-card-bg" src="${cardImg}" alt="" loading="lazy"
           onerror="this.src='${colorSmall('default')}'">
      ${!isLtm ? `<img class="sr-card-face" src="${faceImg}" data-face-type="dynamic" alt="${name}" loading="lazy"
           onerror="
             if(!this.dataset.step){
               this.dataset.step='normal';
               this.dataset.faceType='normal';
               this.src='https://trivela.b-cdn.net/${activeYear}/normalFacesSmall/${id}.png';
             } else if(this.dataset.step==='normal'){
               this.dataset.step='base';
               this.src='https://trivela.b-cdn.net/${activeYear}/normalFacesSmall/${baseId}.png';
             } else {
               this.onerror=null;
               this.src='Main Assets/boo.png';
             }
           ">` : ''}
    </div>
    <div class="sr-player-info">
      <span class="sr-player-name">${hlName(name, query)}</span>
      <span class="sr-player-meta">${ratingDisplay}${pos ? ' · ' + pos : ''}</span>
    </div>
  `;

  return a;
}

// ─────────────────────────────────────────────
// Page results for search
// ─────────────────────────────────────────────
const navPages = [];

[...mainPagesData, ...morePagesData.items].forEach(i => {
  AVAILABLE_YEARS.forEach(({ year: yr }) => {
    if (i.enabled && i.enabled[yr]) {
      navPages.push({ label: i.label, href: "/" + yr + "/" + i.slug + ".html", year: yr });
    }
  });
});

const yearAwareGamesMisc = gamesMiscData.filter(p => p.hrefFor);
AVAILABLE_YEARS.forEach(({ year: yr }) => {
  yearAwareGamesMisc
    .filter(p => p.enabled && p.enabled[yr])
    .forEach(p => navPages.push({ label: p.label, href: p.hrefFor(yr), year: yr }));
});

[
  ...gamesMiscData.filter(p => !p.hrefFor),
  ...colDataData,
]
  .filter(p => p.enabled && AVAILABLE_YEARS.some(y => p.enabled[y.year]))
  .forEach(p => navPages.push({ label: p.label, href: p.href }));

[
  { label: "INSTAGRAM",   href: "https://www.instagram.com/madfoot1910" },
  { label: "YOUTUBE",     href: "https://www.youtube.com/@madfut1910" },
  { label: "TIKTOK",      href: "https://www.tiktok.com/@madfut1910" },
].forEach(p => navPages.push(p));

// ─────────────────────────────────────────────
// ARTICLE SEARCH — data cache & loading state
// ─────────────────────────────────────────────
let _navArticles       = [];
let _navArticlesLoaded = false;

async function _loadNavArticles() {
  try {
    const res = await fetch('/articles-data.json');
    if (res.ok) {
      const data = await res.json();
      _navArticles = data.articles || [];
    }
  } catch (err) {
    console.warn('[NavSearch] Failed to load articles', err);
  } finally {
    _navArticlesLoaded = true;
    if (searchDropdown.classList.contains('show')) renderDrop(searchInput.value);
  }
}
_loadNavArticles();

function _buildArticleResult(article, query) {
  const a = document.createElement('a');
  a.className = 'search-result search-result--article';
  a.href = '/Article.html?slug=' + encodeURIComponent(article.slug);
  a.setAttribute('role', 'option');

  a.innerHTML = `
    <div class="sr-article-thumb">
      <img src="${article.cardImage}" alt="" loading="lazy">
    </div>
    <div class="sr-player-info">
      <span class="sr-player-name">${hlText(article.title, query)}</span>
      <span class="sr-player-meta">${article.categoryLabel}</span>
    </div>
  `;
  return a;
}

const searchInput    = document.getElementById("searchInput");
const searchDropdown = document.getElementById("searchDropdown");
let hlIdx = -1;

function hlText(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return text.slice(0,i) + "<em>" + text.slice(i, i+q.length) + "</em>" + text.slice(i+q.length);
}

let _renderTimer = null;
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => fn(...args), ms);
  };
}

function renderDrop(query) {
  searchDropdown.innerHTML = "";
  hlIdx = -1;
  const q    = query.trim();
  const qNorm = _navNorm(q);

  let matchedArticles = [];
  if (q.length >= 1) {
    matchedArticles = _navArticles.filter(a =>
      _navNorm(a.title).includes(qNorm) ||
      _navNorm(a.desc).includes(qNorm) ||
      _navNorm(a.categoryLabel).includes(qNorm)
    ).slice(0, 6);
  }

  if (q.length >= 1 && (matchedArticles.length > 0 || !_navArticlesLoaded)) {
    const hdr = document.createElement('div');
    hdr.className   = 'search-section-hdr';
    hdr.textContent = 'ARTICLES';
    searchDropdown.appendChild(hdr);

    if (!_navArticlesLoaded) {
      const loading = document.createElement('div');
      loading.className   = 'search-loading';
      loading.textContent = 'Loading articles…';
      searchDropdown.appendChild(loading);
    } else {
      matchedArticles.forEach(article => {
        searchDropdown.appendChild(_buildArticleResult(article, q));
      });
    }
  }

  if (q.length >= 1) {
    const matchedPlayers = _navPlayers
      .filter(entry => _navNorm(entry.fields?.name?.stringValue || '').includes(qNorm))
      .sort((a, b) => {
        const aName = _navNorm(a.fields?.name?.stringValue || '');
        const bName = _navNorm(b.fields?.name?.stringValue || '');
        const aPrefix = aName.startsWith(qNorm) ? 0 : 1;
        const bPrefix = bName.startsWith(qNorm) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return (parseInt(b.fields?.rating?.integerValue || 0)) - (parseInt(a.fields?.rating?.integerValue || 0));
      })
      .slice(0, 8);

    if (matchedPlayers.length > 0) {
      const hdr = document.createElement('div');
      hdr.className   = 'search-section-hdr';
      hdr.textContent = 'PLAYERS';
      searchDropdown.appendChild(hdr);

      if (!_navDataLoaded) {
        const loading = document.createElement('div');
        loading.className   = 'search-loading';
        loading.textContent = 'Loading player data…';
        searchDropdown.appendChild(loading);
      } else {
        matchedPlayers.forEach(entry => {
          searchDropdown.appendChild(_buildPlayerResult(entry, q));
        });
      }
    } else if (_navDataLoaded && q.length >= 2) {
      const hdr = document.createElement('div');
      hdr.className   = 'search-section-hdr';
      hdr.textContent = 'PLAYERS';
      searchDropdown.appendChild(hdr);

      const none = document.createElement('div');
      none.className   = 'search-no-results search-no-results--small';
      none.textContent = 'No players found';
      searchDropdown.appendChild(none);
    } else if (!_navDataLoaded) {
      const hdr = document.createElement('div');
      hdr.className   = 'search-section-hdr';
      hdr.textContent = 'PLAYERS';
      searchDropdown.appendChild(hdr);
      const loading = document.createElement('div');
      loading.className   = 'search-loading';
      loading.textContent = 'Loading player data…';
      searchDropdown.appendChild(loading);
    }
  }

  let pageResults;
  if (!q) {
    pageResults = navPages.filter(p => !p.year || p.year === activeYear).slice(0, 10);
  } else {
    pageResults = navPages.filter(p => {
      const full = (p.year ? p.year + " " : "") + p.label;
      return full.toLowerCase().includes(q.toLowerCase()) || p.label.toLowerCase().includes(q.toLowerCase());
    });
  }

  if (pageResults.length > 0) {
    if (q.length >= 1) {
      const hdr = document.createElement('div');
      hdr.className   = 'search-section-hdr';
      hdr.textContent = 'PAGES';
      searchDropdown.appendChild(hdr);
    }

    pageResults.forEach(page => {
      const a = document.createElement("a");
      a.className = "search-result";
      a.href = page.href;
      const labelSpan = document.createElement("span");
      labelSpan.innerHTML = hlText(page.label, q);
      a.appendChild(labelSpan);
      if (page.year) {
        const tag = document.createElement("span");
        tag.className = "search-year-tag";
        tag.textContent = page.year;
        a.appendChild(tag);
      }
      searchDropdown.appendChild(a);
    });
  }

  if (searchDropdown.children.length === 0) {
    searchDropdown.innerHTML = '<div class="search-no-results">No results found</div>';
  }

  searchDropdown.classList.add("show");
}

const debouncedRender = debounce(renderDrop, 120);

searchInput.addEventListener("input",  () => debouncedRender(searchInput.value));
searchInput.addEventListener("focus",  () => renderDrop(searchInput.value));
searchInput.addEventListener("keydown", e => {
  const items = searchDropdown.querySelectorAll(".search-result");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    hlIdx = Math.min(hlIdx+1, items.length-1);
    items.forEach((el,i) => el.classList.toggle("highlighted", i===hlIdx));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    hlIdx = Math.max(hlIdx-1, -1);
    items.forEach((el,i) => el.classList.toggle("highlighted", i===hlIdx));
  } else if (e.key === "Enter" && hlIdx >= 0 && items[hlIdx]) {
    items[hlIdx].click();
  } else if (e.key === "Escape") {
    searchDropdown.classList.remove("show");
    searchInput.blur();
  }
});

const bcYearLabelEl = document.getElementById("bcYearLabel");
if (bcYearLabelEl) bcYearLabelEl.textContent = "MADFUT " + PAGE_YEAR;
document.querySelectorAll(".bc-year-drop-item").forEach(b => {
  const sel = b.dataset.year === PAGE_YEAR;
  b.classList.toggle("active", sel);
  b.setAttribute("aria-selected", String(sel));
});

// ─────────────────────────────────────────────
// PER-FEATURE "updated recently" dots
// Each feature (LTM Market, Draft Ranks, etc.) has its own
// Firestore collection. We check each one's latest numeric-id
// doc and dot the matching main-pages card if it's recent.
// ─────────────────────────────────────────────
const FIRESTORE_DOCS_BASE =
  "https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/(default)/documents";

const UPDATE_WINDOW_MS =  24 * 60 * 60 * 1000; // 3 weeks

const FEATURE_COLLECTION_BY_SLUG = {
  "LTM-Market":    "ltmMarket",
  "Draft-Ranks":   "draftRanks",
  "Draft-Cups":    "draftCups",
  "Fatal-Sim":     "fatalSim",
  "Fatal-Draft":   "fatalDraft",
  "Fatal-My-Club": "fatalMyClub",
  "SBC-Groups":    "sbcGroups",
  "DOTD":          "dotd",
  "Configs":       "configs",
  "Cards":         "updates",
  "Objective":     "objectives",
  "Elite-Evos":    "evosElite",
  "Upgrade-Hub":   "livePlayers",
  "Votes":         "votes",
  "Promos":        "promo",
};

let _recentlyUpdatedSlugs = new Set();

async function _latestUpdateTimeFor(collectionName) {
  try {
    const url = `${FIRESTORE_DOCS_BASE}/${collectionName}?pageSize=300`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Nav] "${collectionName}" fetch not OK:`, res.status, url);
      return 0;
    }
    const data = await res.json();
    const docs = data.documents || [];

    if (collectionName === "configs") {
      console.log("[Nav DEBUG configs] raw doc count:", docs.length);
      console.log("[Nav DEBUG configs] doc names:", docs.map(d => (d.name || "").split("/").pop()));
    }

    let latest = 0;
    docs.forEach(doc => {
      const id = (doc.name || "").split("/").pop();
      if (!/^\d+$/.test(id)) return; // numeric-id docs only
      const t = new Date(doc.updateTime || doc.createTime).getTime();
      if (t > latest) latest = t;
    });

    if (collectionName === "configs") {
      console.log("[Nav DEBUG configs] latest computed:", latest ? new Date(latest).toISOString() : null);
    }

    if (collectionName === "configs") return Date.now(); // TEMP — force "just updated" to test the dot visually

    return latest;
  } catch (err) {
    console.warn(`[Nav] Failed to check "${collectionName}" update time`, err);
    return 0;
  }
}

async function _checkFeatureUpdates() {
  const entries = Object.entries(FEATURE_COLLECTION_BY_SLUG);

  const results = await Promise.all(
    entries.map(async ([slug, collectionName]) => {
      const latest = await _latestUpdateTimeFor(collectionName);
      const recent = !!latest && (Date.now() - latest) < UPDATE_WINDOW_MS;
      console.log("[FeatureDot]", { slug, collectionName, latest: latest ? new Date(latest).toISOString() : null, recent });
      return [slug, recent];
    })
  );

  _recentlyUpdatedSlugs = new Set(results.filter(([, recent]) => recent).map(([slug]) => slug));
  _applyFeatureDots();
}

function _applyFeatureDots() {
  document.querySelectorAll(".mp-card[data-slug]").forEach(card => {
    const slug = card.dataset.slug;
    let dot = card.querySelector(".mp-card-update-dot");
    if (_recentlyUpdatedSlugs.has(slug)) {
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "mp-card-update-dot";
        dot.title = "Updated in the last week";
        card.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  });
}

_checkFeatureUpdates();

setYear(activeYear, true);