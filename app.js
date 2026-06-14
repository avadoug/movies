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
  failed: new Set(),
  watchlist: new Set(JSON.parse(localStorage.getItem("watchlist") || "[]")),
  showWatchlistOnly: false,
  hydratedStarted: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const keyFor = (m) => `${m.title}__${m.year}`;
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const hashNum = (s) => Array.from(s).reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0);

function setup(){
  byId("totalCount").textContent = MOVIES.length;
  byId("apiKeyInput").value = state.apiKey;
  byId("regionSelect").value = state.region;
  buildTags();
  buildServices();
  bindEvents();
  render();
  if (state.apiKey) setStatus("API key found. Press Load posters & current streaming when ready.", "good");
}

function bindEvents(){
  byId("searchInput").addEventListener("input", e => { state.query = e.target.value; state.showWatchlistOnly = false; render(); });
  byId("sortSelect").addEventListener("change", e => { state.sort = e.target.value; render(); });
  byId("saveKeyBtn").addEventListener("click", saveKey);
  byId("regionSelect").addEventListener("change", e => { state.region = e.target.value; localStorage.setItem("region", state.region); state.live.clear(); state.failed.clear(); setStatus(`Region changed to ${state.region}. Reload live data for fresh provider results.`, "warn"); render(); });
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

function saveKey(){
  state.apiKey = byId("apiKeyInput").value.trim();
  if(state.apiKey){ localStorage.setItem("tmdb_api_key", state.apiKey); setStatus("TMDb key saved. Ready to fetch live posters and streaming providers.", "good"); }
  else { localStorage.removeItem("tmdb_api_key"); setStatus("Key cleared. Using local curated mode.", "warn"); }
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
  const title = state.showWatchlistOnly ? "Your saved watchlist" : "All recommended movies";
  byId("viewTitle").textContent = title;
  byId("viewSubtitle").textContent = subtitleFor(arr.length);
  const grid = byId("movieGrid");
  if(!arr.length){ grid.innerHTML = `<div class="empty-state"><h3>No movies matched.</h3><p>Ease up one filter, tiny algorithm gremlin.</p></div>`; return; }
  grid.innerHTML = arr.map(cardHTML).join("");
  grid.querySelectorAll("[data-action='toggle-watch']").forEach(btn => btn.addEventListener("click", e => toggleWatch(e.currentTarget.dataset.key)));
  grid.querySelectorAll("[data-action='details']").forEach(btn => btn.addEventListener("click", e => openDetails(e.currentTarget.dataset.key)));
}

function subtitleFor(count){
  if(state.onlyMine && !state.live.size) return "Load live data first, then the My Services filter can bite properly.";
  if(state.onlyMine) return `${count} movies currently matched to your saved services, based on loaded provider data.`;
  if(state.freeOnly) return `${count} movies with free/ad-supported availability in loaded data.`;
  return "Curated by taste, filtered by mood, updated by live provider data when available.";
}

function cardHTML(m){
  const key = keyFor(m), live = state.live.get(key), loading = state.loading.has(key), saved = state.watchlist.has(key);
  const poster = posterHTML(m, live);
  const provider = providerHTML(live, loading);
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
function providerHTML(live, loading){
  if(loading) return `<div class="providers"><div class="loading-bar"><span></span></div><p class="why">Fetching live streaming data...</p></div>`;
  if(!live) return `<div class="providers"><p class="why">Live providers not loaded yet.</p></div>`;
  const p = providersFor(live);
  const chunks = [];
  if(p.flatrate?.length) chunks.push(providerLine("Streaming", p.flatrate));
  if(p.free?.length) chunks.push(providerLine("Free", p.free));
  if(p.ads?.length) chunks.push(providerLine("Ads", p.ads));
  if(!chunks.length) chunks.push(`<p class="why">No subscription/free providers found in ${state.region}. Rent/buy may exist.</p>`);
  if(p.rent?.length || p.buy?.length) chunks.push(providerLine("Rent/buy", [...(p.rent||[]), ...(p.buy||[])].slice(0,5)));
  return `<div class="providers">${chunks.join("")}</div>`;
}
function providerLine(label, list){
  const unique = [...new Map(list.map(p => [p.provider_id, p])).values()].slice(0,6);
  return `<div class="provider-line"><span class="provider-label">${esc(label)}</span>${unique.map(providerChip).join("")}</div>`;
}
function providerChip(p){
  const logo = p.logo_path ? `<img src="${IMG}w45${esc(p.logo_path)}" alt="" loading="lazy" />` : "";
  return `<span class="provider-chip">${logo}${esc(p.provider_name)}</span>`;
}

async function hydrateVisibleThenAll(){
  saveKey();
  if(!state.apiKey){ setStatus("Add a TMDb API key first. The site cannot pull current providers from thin air, unfortunately. Yet.", "bad"); return; }
  state.hydratedStarted = true;
  const visible = getFiltered();
  setStatus(`Fetching live data for ${MOVIES.length} movies. Visible cards get priority.`, "warn");
  await hydrateBatch(visible);
  const remaining = MOVIES.filter(m => !state.live.has(keyFor(m)) && !state.failed.has(keyFor(m)));
  await hydrateBatch(remaining);
  setStatus(`Done. Loaded ${state.live.size} live movie records. ${state.failed.size} failed or ambiguous.`, state.failed.size ? "warn" : "good");
}

async function hydrateBatch(list){
  const queue = list.filter(m => !state.live.has(keyFor(m)) && !state.loading.has(keyFor(m)) && !state.failed.has(keyFor(m)));
  const concurrency = 5;
  let idx = 0;
  async function worker(){
    while(idx < queue.length){
      const m = queue[idx++];
      await hydrateMovie(m);
      if(idx % 8 === 0) render();
    }
  }
  await Promise.all(Array.from({length:concurrency}, worker));
  render();
}

async function hydrateMovie(m){
  const key = keyFor(m);
  state.loading.add(key);
  softUpdateCard(key, m);
  try{
    const result = await tmdbSearch(m);
    if(!result) throw new Error("No TMDb search result");
    const [details, watch] = await Promise.all([
      tmdbGet(`/movie/${result.id}`),
      tmdbGet(`/movie/${result.id}/watch/providers`)
    ]);
    state.live.set(key, {tmdbId:result.id, poster_path:details.poster_path || result.poster_path, overview:details.overview, runtime:details.runtime, genres:details.genres||[], vote_average:details.vote_average, release_date:details.release_date, watch});
  }catch(err){
    console.warn("TMDb failed", m.title, err);
    state.failed.add(key);
  }finally{
    state.loading.delete(key);
    softUpdateCard(key, m);
    byId("loadedCount").textContent = state.live.size;
  }
}
async function tmdbSearch(m){
  const params = new URLSearchParams({api_key:state.apiKey, query:m.title, include_adult:"false"});
  if(m.year) params.set("year", String(m.year));
  let data = await fetchJson(`${TMDB}/search/movie?${params.toString()}`);
  if(!data.results?.length){
    params.delete("year");
    data = await fetchJson(`${TMDB}/search/movie?${params.toString()}`);
  }
  const exact = data.results?.find(r => norm(r.title) === norm(m.title) && String(r.release_date||"").startsWith(String(m.year)));
  return exact || data.results?.[0];
}
async function tmdbGet(path){ return fetchJson(`${TMDB}${path}?api_key=${encodeURIComponent(state.apiKey)}`); }
async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function softUpdateCard(key, m){
  const el = byId(`card-${cssSafe(key)}`);
  if(el) el.outerHTML = cardHTML(m);
  const newEl = byId(`card-${cssSafe(key)}`);
  if(newEl){
    const watchBtn = newEl.querySelector("[data-action='toggle-watch']"); if(watchBtn) watchBtn.addEventListener("click", e => toggleWatch(e.currentTarget.dataset.key));
    const detailsBtn = newEl.querySelector("[data-action='details']"); if(detailsBtn) detailsBtn.addEventListener("click", e => openDetails(e.currentTarget.dataset.key));
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
  const p = providerHTML(live, state.loading.has(key));
  const poster = posterHTML(m, live);
  const genres = live?.genres?.map(g=>g.name) || [];
  const jw = `https://www.justwatch.com/${state.region.toLowerCase()}/search?q=${encodeURIComponent(m.title)}`;
  byId("dialogContent").innerHTML = `<div class="dialog-layout">
    <div class="poster">${poster}</div>
    <div class="dialog-copy">
      <div class="meta"><span>${m.year}</span><span>${m.score}% Dougcore</span><span>${esc(m.cluster)}</span>${live?.runtime?`<span>${live.runtime} min</span>`:""}</div>
      <h2>${esc(m.title)}</h2>
      <p><strong>Why it fits:</strong> ${esc(m.why)}</p>
      ${live?.overview ? `<p>${esc(live.overview)}</p>` : `<p>Live overview not loaded yet. Add a TMDb key and fetch data for the full portal readout.</p>`}
      ${genres.length ? `<div class="meta">${genres.map(g=>`<span>${esc(g)}</span>`).join("")}</div>` : ""}
      <h3>Where it is streaming</h3>
      ${p}
      <div class="card-actions" style="margin-top:1rem">
        <a href="${jw}" target="_blank" rel="noopener">Open JustWatch search</a>
        ${live?.tmdbId ? `<a href="https://www.themoviedb.org/movie/${live.tmdbId}" target="_blank" rel="noopener">Open TMDb page</a>` : ""}
        <button data-action="toggle-watch" data-key="${esc(key)}">${state.watchlist.has(key) ? "Remove from watchlist" : "Add to watchlist"}</button>
      </div>
    </div>
  </div>`;
  const watchBtn = byId("dialogContent").querySelector("[data-action='toggle-watch']");
  if(watchBtn) watchBtn.addEventListener("click", e => { toggleWatch(e.currentTarget.dataset.key); openDetails(key); });
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
  const text = rows.map(m => `${m.title} (${m.year}) - ${m.why}`).join("\n");
  const blob = new Blob([text || "No movies saved yet."], {type:"text/plain"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tardis808-movie-watchlist.txt"; a.click(); URL.revokeObjectURL(a.href);
}
function setStatus(msg, kind=""){
  const box = byId("statusBox"); box.textContent = msg; box.className = `status ${kind}`.trim();
}

setup();
