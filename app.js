const MOVIES = window.CURATED_MOVIES || [];
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";
const COMMON_SERVICES = [
  "Netflix", "Amazon Prime Video", "Hulu", "Max", "Disney Plus", "Peacock Premium",
  "Paramount Plus", "Apple TV Plus", "Starz", "Showtime", "MGM Plus", "AMC Plus",
  "Shudder", "Criterion Channel", "Tubi TV", "Pluto TV", "The Roku Channel", "Freevee", "Kanopy", "Hoopla"
];

const state = {
  apiKey: localStorage.getItem("tmdb_api_key") || "",
  region: localStorage.getItem("region") || "US",
  query: "",
  selectedTags: new Set(),
  myServices: new Set(JSON.parse(localStorage.getItem("my_services") || "[]")),
  onlyMine: false,
  freeOnly: false,
  sort: "score",
  live: new Map(),
  loading: new Set(),
  failed: new Map(),
  watchlist: new Set(JSON.parse(localStorage.getItem("watchlist") || "[]")),
  showWatchlistOnly: false,
  hydratedStarted: false,
  loadedFromCache: false
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const keyFor = (m) => `${m.title}__${m.year}`;
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const hashNum = (s) => Array.from(s).reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cacheKey(){ return `movie_radar_live_${state.region}`; }
function isBearerToken(){ return state.apiKey.includes(".") || state.apiKey.startsWith("eyJ"); }

function setup(){
  byId("totalCount").textContent = MOVIES.length;
  byId("apiKeyInput").value = state.apiKey;
  byId("regionSelect").value = state.region;
  loadLiveCache();
  buildTags();
  buildServices();
  bindEvents();
  render();
  if (state.live.size) setStatus(`Loaded ${state.live.size} cached provider records. Press refresh data for a fresh pull.`, "good");
  else if (state.apiKey) setStatus("Key found. Press Load posters & current streaming, or Save + load, to fill every Where to watch row.", "good");
}

function bindEvents(){
  byId("searchInput").addEventListener("input", e => { state.query = e.target.value; state.showWatchlistOnly = false; render(); });
  byId("sortSelect").addEventListener("change", e => { state.sort = e.target.value; render(); });
  byId("saveKeyBtn").addEventListener("click", () => { saveKey(true); });
  const testKeyBtn = byId("testKeyBtn");
  if(testKeyBtn) testKeyBtn.addEventListener("click", testKey);
  const clearLiveBtn = byId("clearLiveBtn");
  if(clearLiveBtn) clearLiveBtn.addEventListener("click", refreshLiveData);
  byId("regionSelect").addEventListener("change", e => {
    state.region = e.target.value;
    localStorage.setItem("region", state.region);
    state.live.clear();
    state.failed.clear();
    loadLiveCache();
    setStatus(`Region changed to ${state.region}. Load live data for fresh provider results.`, "warn");
    render();
  });
  byId("hydrateBtn").addEventListener("click", hydrateVisibleThenAll);
  byId("surpriseBtn").addEventListener("click", pickSurprise);
  byId("watchlistBtn").addEventListener("click", () => { state.showWatchlistOnly = !state.showWatchlistOnly; render(); });
  byId("resetBtn").addEventListener("click", resetFilters);
  byId("exportBtn").addEventListener("click", exportWatchlist);
  byId("clearServicesBtn").addEventListener("click", () => { state.myServices.clear(); saveServices(); buildServices(); render(); });
  byId("onlyMineToggle").addEventListener("change", e => { state.onlyMine = e.target.checked; render(); });
  byId("freeToggle").addEventListener("change", e => { state.freeOnly = e.target.checked; render(); });
  byId("closeDialog").addEventListener("click", () => byId("movieDialog").close());
  byId("movieDialog").addEventListener("click", e => { if (e.target.id === "movieDialog") byId("movieDialog").close(); });
}

function saveKey(autoLoad = false){
  state.apiKey = byId("apiKeyInput").value.trim();
  if(state.apiKey){
    localStorage.setItem("tmdb_api_key", state.apiKey);
    setStatus("TMDb key/token saved. Loading streaming providers now.", "good");
    if(autoLoad) hydrateVisibleThenAll();
  } else {
    localStorage.removeItem("tmdb_api_key");
    setStatus("Key cleared. Cards will use local curated mode plus JustWatch lookup buttons.", "warn");
    render();
  }
}

async function testKey(){
  state.apiKey = byId("apiKeyInput").value.trim();
  if(!state.apiKey){
    setStatus("Paste a TMDb v3 API key or v4 Read Access Token first.", "bad");
    return;
  }
  localStorage.setItem("tmdb_api_key", state.apiKey);
  setStatus("Testing TMDb key/token...", "warn");
  try{
    const data = await tmdbGet("/configuration");
    if(data?.images?.secure_base_url){
      setStatus("TMDb key/token works. Press Save to load streaming providers on every card.", "good");
    } else {
      setStatus("TMDb responded, but the response looked unusual. Try pressing Save anyway.", "warn");
    }
  }catch(err){
    setStatus(`TMDb test failed: ${err.message || err}. If you pasted the long token, make sure it is the API Read Access Token.`, "bad");
  }
}

function refreshLiveData(){
  state.live.clear();
  state.failed.clear();
  localStorage.removeItem(cacheKey());
  render();
  if(!state.apiKey){ setStatus("Paste a TMDb key/token first, then refresh can pull current provider rows.", "bad"); return; }
  setStatus("Cleared old provider cache. Pulling fresh streaming data.", "warn");
  hydrateVisibleThenAll();
}

function loadLiveCache(){
  try{
    const raw = localStorage.getItem(cacheKey());
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.items)) return;
    state.live = new Map(parsed.items);
    state.loadedFromCache = true;
  }catch(err){
    console.warn("Could not load provider cache", err);
  }
}

function saveLiveCache(){
  try{
    localStorage.setItem(cacheKey(), JSON.stringify({savedAt:new Date().toISOString(), items:[...state.live.entries()]}));
  }catch(err){
    console.warn("Could not save provider cache", err);
  }
}

function buildTags(){
  const tagCounts = new Map();
  for(const m of MOVIES) for(const t of m.tags) tagCounts.set(t, (tagCounts.get(t)||0)+1);
  const top = [...tagCounts.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,34);
  byId("tagFilters").innerHTML = top.map(([tag,count]) => `<button class="chip" data-tag="${esc(tag)}">${esc(tag)} <span>${count}</span></button>`).join("");
  $$("#tagFilters .chip").forEach(btn => btn.addEventListener("click", () => {
    const tag = btn.dataset.tag;
    state.selectedTags.has(tag) ? state.selectedTags.delete(tag) : state.selectedTags.add(tag);
    btn.classList.toggle("active");
    render();
  }));
}

function buildServices(){
  const html = COMMON_SERVICES.map(s => {
    const checked = state.myServices.has(s) ? "checked" : "";
    return `<label><input type="checkbox" value="${esc(s)}" ${checked}/> ${esc(s.replace("Amazon Prime Video","Prime Video").replace("Peacock Premium","Peacock"))}</label>`;
  }).join("");
  byId("serviceFilters").innerHTML = html;
  $$("#serviceFilters input").forEach(input => input.addEventListener("change", e => {
    e.target.checked ? state.myServices.add(e.target.value) : state.myServices.delete(e.target.value);
    saveServices(); render();
  }));
}
function saveServices(){ localStorage.setItem("my_services", JSON.stringify([...state.myServices])); }

function movieMatches(m){
  const q = norm(state.query);
  if(q){
    const hay = norm([m.title, m.year, m.cluster, m.tags.join(" "), m.why].join(" "));
    if(!hay.includes(q)) return false;
  }
  if(state.showWatchlistOnly && !state.watchlist.has(keyFor(m))) return false;
  if(state.selectedTags.size){
    for(const t of state.selectedTags) if(!m.tags.includes(t)) return false;
  }
  const live = state.live.get(keyFor(m));
  if(state.onlyMine){
    if(!live) return false;
    const names = allStreamProviders(live).map(p => p.provider_name);
    const matches = names.some(n => [...state.myServices].some(s => providerMatches(n, s)));
    if(!matches) return false;
  }
  if(state.freeOnly){
    if(!live) return false;
    const p = providersFor(live);
    if(!((p.free && p.free.length) || (p.ads && p.ads.length))) return false;
  }
  return true;
}

function providerMatches(providerName, selected){
  const p = norm(providerName), s = norm(selected);
  if(p === s) return true;
  if(s === "max" && (p.includes("max") || p.includes("hbo"))) return true;
  if(s.includes("amazon") && (p.includes("prime") || p.includes("amazon"))) return true;
  if(s.includes("disney") && p.includes("disney")) return true;
  if(s.includes("apple") && p.includes("apple")) return true;
  if(s.includes("paramount") && p.includes("paramount")) return true;
  if(s.includes("peacock") && p.includes("peacock")) return true;
  return p.includes(s) || s.includes(p);
}

function getFiltered(){
  let arr = MOVIES.filter(movieMatches);
  arr.sort((a,b) => {
    if(state.sort === "title") return a.title.localeCompare(b.title);
    if(state.sort === "yearDesc") return b.year - a.year;
    if(state.sort === "yearAsc") return a.year - b.year;
    if(state.sort === "availability") return Number(!!state.live.get(keyFor(b))) - Number(!!state.live.get(keyFor(a))) || b.score-a.score;
    if(state.sort === "watchlist") return Number(state.watchlist.has(keyFor(b))) - Number(state.watchlist.has(keyFor(a))) || b.score-a.score;
    return b.score - a.score || a.title.localeCompare(b.title);
  });
  return arr;
}

function render(){
  const arr = getFiltered();
  byId("visibleCount").textContent = arr.length;
  byId("loadedCount").textContent = state.live.size;
  byId("watchlistBtn").textContent = state.showWatchlistOnly ? "Show all movies" : `Show watchlist (${state.watchlist.size})`;
  byId("viewTitle").textContent = state.showWatchlistOnly ? "Your saved watchlist" : "All recommended movies";
  byId("viewSubtitle").textContent = subtitleFor(arr.length);
  const grid = byId("movieGrid");
  if(!arr.length){ grid.innerHTML = `<div class="empty-state"><h3>No movies matched.</h3><p>Ease up one filter, tiny algorithm gremlin.</p></div>`; return; }
  grid.innerHTML = arr.map(cardHTML).join("");
  bindCardActions(grid);
}

function bindCardActions(root = document){
  $$('[data-action="toggle-watch"]', root).forEach(btn => btn.addEventListener("click", e => toggleWatch(e.currentTarget.dataset.key)));
  $$('[data-action="details"]', root).forEach(btn => btn.addEventListener("click", e => openDetails(e.currentTarget.dataset.key)));
  $$('[data-action="load-one"]', root).forEach(btn => btn.addEventListener("click", e => loadOne(e.currentTarget.dataset.key)));
}

function subtitleFor(count){
  if(state.onlyMine && !state.live.size) return "Load live data first, then the My Services filter can bite properly.";
  if(state.onlyMine) return `${count} movies currently matched to your saved services, based on loaded provider data.`;
  if(state.freeOnly) return `${count} movies with free/ad-supported availability in loaded data.`;
  if(state.live.size) return `Streaming providers are loaded for ${state.live.size} titles. Each card now has a Where to watch row.`;
  return "Curated by taste. Add a TMDb key/token to fill the Where to watch row on every card.";
}

function cardHTML(m){
  const key = keyFor(m), live = state.live.get(key), loading = state.loading.has(key), saved = state.watchlist.has(key);
  const poster = posterHTML(m, live);
  const provider = providerHTML(m, live, loading, false);
  const jw = `https://www.justwatch.com/${state.region.toLowerCase()}/search?q=${encodeURIComponent(m.title)}`;
  const tmdb = live?.tmdbId ? `https://www.themoviedb.org/movie/${live.tmdbId}` : `https://www.themoviedb.org/search?query=${encodeURIComponent(m.title)}`;
  return `<article class="movie-card" id="card-${cssSafe(key)}">
    <div class="poster">
      ${poster}
      <div class="badge-row"><span class="score">${m.score}% Dougcore</span><span class="year-badge">${m.year}</span></div>
    </div>
    <div class="body">
      <div class="title-row"><h3>${esc(m.title)}</h3><button class="${saved?'':'off'}" title="save to watchlist" data-action="toggle-watch" data-key="${esc(key)}">★</button></div>
      <p class="why">${esc(m.why)}</p>
      <div class="tags">${m.tags.slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
      ${provider}
      <div class="card-actions">
        <button data-action="details" data-key="${esc(key)}">Details</button>
        <a href="${jw}" target="_blank" rel="noopener">JustWatch</a>
        <a href="${tmdb}" target="_blank" rel="noopener">TMDb</a>
      </div>
    </div>
  </article>`;
}

function posterHTML(m, live){
  if(live?.poster_path) return `<img src="${IMG}w342${esc(live.poster_path)}" alt="Poster for ${esc(m.title)}" loading="lazy" />`;
  const h = Math.abs(hashNum(m.title + m.year));
  const palette = [
    ["#351c75","#00d4ff"], ["#742a64","#ffb86b"], ["#13294b","#7cffb0"], ["#3b1b5f","#ff4fd8"],
    ["#0f3a3f","#f8e16c"], ["#4a1d1f","#ff6b8a"], ["#1f2447","#8cf5ff"]
  ][h % 7];
  return `<div class="poster-placeholder" style="--g1:${palette[0]};--g2:${palette[1]}"><div class="poster-title">${esc(m.title)}</div></div>`;
}

function providersFor(live){
  const r = live?.watch?.results?.[state.region] || live?.watch?.results?.US || {};
  return {flatrate:r.flatrate||[], free:r.free||[], ads:r.ads||[], rent:r.rent||[], buy:r.buy||[], link:r.link};
}
function allStreamProviders(live){ const p = providersFor(live); return [...(p.flatrate||[]), ...(p.free||[]), ...(p.ads||[])]; }

function providerHTML(m, live, loading, expanded = false){
  const key = keyFor(m);
  const justwatch = `https://www.justwatch.com/${state.region.toLowerCase()}/search?q=${encodeURIComponent(m.title)}`;
  const head = `<div class="where-title">Where to watch <span>${esc(state.region)}</span></div>`;
  if(loading) return `<div class="providers where-box">${head}<div class="loading-bar"><span></span></div><p class="provider-note">Fetching current streaming providers...</p></div>`;
  if(!live){
    const failed = state.failed.get(key);
    const msg = failed ? `Lookup failed or was ambiguous: ${esc(failed)}` : (state.apiKey ? "Not loaded yet. Use Load this movie or Load all." : "Not loaded yet. Paste a TMDb key/token, then press Save + load.");
    const loadButton = state.apiKey ? `<button class="load-one" data-action="load-one" data-key="${esc(key)}">Load this movie</button>` : "";
    return `<div class="providers where-box unloaded">${head}<p class="provider-note">${msg}</p><div class="provider-tools">${loadButton}<a href="${justwatch}" target="_blank" rel="noopener">Check JustWatch</a></div></div>`;
  }
  const p = providersFor(live);
  const chunks = [];
  if(p.flatrate?.length) chunks.push(providerLine("Subscription", p.flatrate));
  if(p.free?.length) chunks.push(providerLine("Free", p.free));
  if(p.ads?.length) chunks.push(providerLine("Ads", p.ads));
  if(!chunks.length) chunks.push(`<p class="provider-note">No subscription/free providers found in ${esc(state.region)} right now.</p>`);
  if(p.rent?.length || p.buy?.length){
    const rentBuy = [...(p.rent||[]), ...(p.buy||[])];
    chunks.push(providerLine("Rent/buy", rentBuy.slice(0, expanded ? 10 : 5)));
  }
  const officialLink = p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">TMDb provider page</a>` : "";
  const loadedNote = `<p class="provider-note small-note">Loaded from TMDb watch-provider data. Double-check before paying because catalogs mutate.</p>`;
  return `<div class="providers where-box loaded">${head}${chunks.join("")}${expanded ? `<div class="provider-tools">${officialLink}<a href="${justwatch}" target="_blank" rel="noopener">Verify on JustWatch</a></div>${loadedNote}` : ""}</div>`;
}

function providerLine(label, list){
  const unique = [...new Map(list.map(p => [p.provider_id, p])).values()].slice(0,8);
  return `<div class="provider-line"><span class="provider-label">${esc(label)}</span>${unique.map(providerChip).join("")}</div>`;
}
function providerChip(p){
  const logo = p.logo_path ? `<img src="${IMG}w45${esc(p.logo_path)}" alt="" loading="lazy" />` : "";
  return `<span class="provider-chip">${logo}${esc(p.provider_name)}</span>`;
}

async function loadOne(key){
  const m = MOVIES.find(x => keyFor(x) === key);
  if(!m) return;
  if(!state.apiKey){ setStatus("Paste a TMDb key/token before loading provider data.", "bad"); return; }
  await hydrateMovie(m, true);
  render();
  saveLiveCache();
}

async function hydrateVisibleThenAll(){
  saveKey(false);
  if(!state.apiKey){ setStatus("Add a TMDb API key or Read Access Token first. The site cannot pull current providers from the void, sadly.", "bad"); return; }
  state.hydratedStarted = true;
  const visible = getFiltered();
  const toLoad = MOVIES.filter(m => !state.live.has(keyFor(m)) && !state.loading.has(keyFor(m)));
  if(!toLoad.length){ setStatus(`Everything available is already loaded for ${state.region}. Use refresh data to pull again.`, "good"); return; }
  setStatus(`Fetching live provider rows for ${toLoad.length} movies. Visible cards get priority.`, "warn");
  await hydrateBatch(visible);
  const remaining = MOVIES.filter(m => !state.live.has(keyFor(m)) && !state.failed.has(keyFor(m)));
  await hydrateBatch(remaining);
  saveLiveCache();
  setStatus(`Done. Loaded ${state.live.size} current movie records. ${state.failed.size} failed or ambiguous.`, state.failed.size ? "warn" : "good");
}

async function hydrateBatch(list){
  const queue = list.filter(m => !state.live.has(keyFor(m)) && !state.loading.has(keyFor(m)) && !state.failed.has(keyFor(m)));
  const concurrency = 2;
  let idx = 0;
  let completed = 0;
  async function worker(){
    while(idx < queue.length){
      const m = queue[idx++];
      await hydrateMovie(m, false);
      completed++;
      if(completed % 10 === 0){
        saveLiveCache();
        setStatus(`Loading current providers... ${state.live.size} loaded, ${state.failed.size} failed.`, "warn");
        render();
        await sleep(350);
      }
    }
  }
  await Promise.all(Array.from({length:concurrency}, worker));
  saveLiveCache();
  render();
}

async function hydrateMovie(m, throwOnError = false){
  const key = keyFor(m);
  state.loading.add(key);
  softUpdateCard(key, m);
  try{
    const result = await tmdbSearch(m);
    if(!result) throw new Error("No TMDb search result");
    const watch = await tmdbGet(`/movie/${result.id}/watch/providers`);
    state.live.set(key, {
      tmdbId: result.id,
      poster_path: result.poster_path || null,
      overview: result.overview || "",
      vote_average: result.vote_average || null,
      release_date: result.release_date || "",
      watch
    });
    state.failed.delete(key);
  }catch(err){
    console.warn("TMDb failed", m.title, err);
    state.failed.set(key, err.message || "unknown error");
    if(throwOnError) setStatus(`Could not load ${m.title}: ${err.message || err}`, "bad");
  }finally{
    state.loading.delete(key);
    softUpdateCard(key, m);
    byId("loadedCount").textContent = state.live.size;
  }
}

async function tmdbSearch(m){
  const params = new URLSearchParams({query:m.title, include_adult:"false"});
  if(m.year) params.set("year", String(m.year));
  let data = await tmdbFetch(`/search/movie`, params);
  if(!data.results?.length){
    params.delete("year");
    data = await tmdbFetch(`/search/movie`, params);
  }
  const exact = data.results?.find(r => norm(r.title) === norm(m.title) && String(r.release_date||"").startsWith(String(m.year)));
  const closeYear = data.results?.find(r => norm(r.title) === norm(m.title));
  return exact || closeYear || data.results?.[0];
}
async function tmdbGet(path){ return tmdbFetch(path, new URLSearchParams()); }
async function tmdbFetch(path, params){
  const p = new URLSearchParams(params || undefined);
  const headers = {accept:"application/json"};
  if(isBearerToken()) headers.Authorization = `Bearer ${state.apiKey}`;
  else p.set("api_key", state.apiKey);
  const qs = p.toString();
  const url = `${TMDB}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {headers});
  if(res.status === 401) throw new Error("Unauthorized TMDb key/token");
  if(res.status === 429){ await sleep(1200); return tmdbFetch(path, params); }
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function softUpdateCard(key, m){
  const el = byId(`card-${cssSafe(key)}`);
  if(el) {
    el.outerHTML = cardHTML(m);
    const newEl = byId(`card-${cssSafe(key)}`);
    if(newEl) bindCardActions(newEl);
  }
}
function cssSafe(s){ return btoa(unescape(encodeURIComponent(s))).replace(/=+$/,'').replace(/[^a-zA-Z0-9]/g,''); }

function toggleWatch(key){
  state.watchlist.has(key) ? state.watchlist.delete(key) : state.watchlist.add(key);
  localStorage.setItem("watchlist", JSON.stringify([...state.watchlist]));
  render();
}

function openDetails(key){
  const m = MOVIES.find(x => keyFor(x) === key);
  if(!m) return;
  const live = state.live.get(key);
  const p = providerHTML(m, live, state.loading.has(key), true);
  const poster = posterHTML(m, live);
  const jw = `https://www.justwatch.com/${state.region.toLowerCase()}/search?q=${encodeURIComponent(m.title)}`;
  byId("dialogContent").innerHTML = `<div class="dialog-layout">
    <div class="poster">${poster}</div>
    <div class="dialog-copy">
      <div class="meta"><span>${m.year}</span><span>${m.score}% Dougcore</span><span>${esc(m.cluster)}</span></div>
      <h2>${esc(m.title)}</h2>
      <p><strong>Why it fits:</strong> ${esc(m.why)}</p>
      ${live?.overview ? `<p>${esc(live.overview)}</p>` : `<p>Live overview not loaded yet. Add a TMDb key/token and fetch data for the full portal readout.</p>`}
      <h3>Where it is streaming</h3>
      ${p}
      <div class="card-actions" style="margin-top:1rem">
        <a href="${jw}" target="_blank" rel="noopener">Open JustWatch search</a>
        ${live?.tmdbId ? `<a href="https://www.themoviedb.org/movie/${live.tmdbId}" target="_blank" rel="noopener">Open TMDb page</a>` : ""}
        <button data-action="toggle-watch" data-key="${esc(key)}">${state.watchlist.has(key) ? "Remove from watchlist" : "Add to watchlist"}</button>
        ${!live && state.apiKey ? `<button data-action="load-one" data-key="${esc(key)}">Load current streaming</button>` : ""}
      </div>
    </div>
  </div>`;
  bindCardActions(byId("dialogContent"));
  byId("movieDialog").showModal();
}

function pickSurprise(){
  const arr = getFiltered();
  if(!arr.length) return;
  const weighted = arr.flatMap(m => Array(Math.max(1, Math.round((m.score-60)/8))).fill(m));
  const m = weighted[Math.floor(Math.random()*weighted.length)];
  openDetails(keyFor(m));
  const el = byId(`card-${cssSafe(keyFor(m))}`); if(el) el.scrollIntoView({behavior:"smooth", block:"center"});
}
function resetFilters(){
  state.query = ""; state.selectedTags.clear(); state.onlyMine=false; state.freeOnly=false; state.showWatchlistOnly=false; state.sort="score";
  byId("searchInput").value = ""; byId("sortSelect").value="score"; byId("onlyMineToggle").checked=false; byId("freeToggle").checked=false;
  $$("#tagFilters .chip").forEach(b=>b.classList.remove("active"));
  render();
}
function exportWatchlist(){
  const rows = [...state.watchlist].map(k => MOVIES.find(m => keyFor(m) === k)).filter(Boolean);
  const text = rows.map(m => {
    const live = state.live.get(keyFor(m));
    const p = live ? providersFor(live) : null;
    const subs = p?.flatrate?.map(x=>x.provider_name).join(", ") || "not loaded/no subscription listing";
    const free = [...(p?.free||[]), ...(p?.ads||[])].map(x=>x.provider_name).join(", ") || "not loaded/no free listing";
    return `${m.title} (${m.year})\n  Why: ${m.why}\n  Subscription: ${subs}\n  Free/ads: ${free}`;
  }).join("\n\n");
  const blob = new Blob([text || "No movies saved yet."], {type:"text/plain"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tardis808-movie-watchlist-with-streaming.txt"; a.click(); URL.revokeObjectURL(a.href);
}
function setStatus(msg, kind=""){
  const box = byId("statusBox"); box.textContent = msg; box.className = `status ${kind}`.trim();
}

setup();
