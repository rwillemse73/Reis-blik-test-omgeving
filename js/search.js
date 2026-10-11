// Reisblik 9.7.5 — zoeken binnen de actieve vakantie
// Zoekt in alle beschikbare locatie-informatie, vaste HTML-teksten,
// categoriegegevens en persoonlijke lokale gegevens.

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("searchContentBtn");
  const modal = document.getElementById("searchModal");
  const closeBtn = document.getElementById("searchCloseBtn");
  const input = document.getElementById("searchInput");
  const startBtn = document.getElementById("searchStartBtn");
  const status = document.getElementById("searchStatus");
  const results = document.getElementById("searchResults");

  if (!openBtn || !modal || !closeBtn || !input || !startBtn || !status || !results) return;

  const PERSONAL_BASE_KEYS = [
    "reisblik_visited_v1",
    "ruinekerk_extra_info_v1",
    "ruinekerk_extra_simple_v1",
    "ruinekerk_notes_v1",
    "ruinekerk_user_locations_v1"
  ];

  function closeSearch(){
    modal.style.display = "none";
    input.value = "";
    status.textContent = "";
    results.innerHTML = "";
  }

  function normalizeText(value){
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripHtml(html){
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    return normalizeText(doc.body ? doc.body.textContent : "");
  }

  function addValueTexts(value, out, seen, depth=0){
    if (depth > 6 || value == null) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = normalizeText(value);
      if (text && !seen.has(text)) { seen.add(text); out.push(text); }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(v => addValueTexts(v, out, seen, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([key, val]) => {
        // Technical fields are useful only when they contain readable content.
        if (key !== "photo" && key !== "lat" && key !== "lon" && key !== "longitude" && key !== "latitude") {
          addValueTexts(val, out, seen, depth + 1);
        }
      });
    }
  }

  function scopedKey(key){return window.reisblikVakantie?.getVakantieStorageKey ? window.reisblikVakantie.getVakantieStorageKey(key) : key;}

  function getPersonalData(key){
    try {
      const raw = localStorage.getItem(scopedKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      console.warn("Reisblik zoeken: lokale gegevens konden niet worden gelezen", key, e);
      return null;
    }
  }

  function personalTextsForLocation(id){
    const wanted = String(id);
    const texts = [];

    const visited = getPersonalData("reisblik_visited_v1");
    if (visited && typeof visited === "object" && visited[wanted]) {
      addValueTexts(visited[wanted], texts, new Set());
    }

    ["ruinekerk_extra_info_v1", "ruinekerk_extra_simple_v1", "ruinekerk_notes_v1"].forEach(key => {
      const data = getPersonalData(key);
      if (!data || typeof data !== "object") return;
      const item = data[wanted];
      if (item !== undefined) addValueTexts(item, texts, new Set());
    });

    return texts;
  }

  function locationLabel(x){
    return normalizeText(x?.name || x?.title || x?.id || "Onbekende locatie");
  }

  function buildSnippet(text, query){
    const clean = normalizeText(text);
    const lower = clean.toLocaleLowerCase("nl-NL");
    const q = query.toLocaleLowerCase("nl-NL");
    const index = lower.indexOf(q);
    if (index < 0) return clean.slice(0, 180);
    const start = Math.max(0, index - 80);
    const end = Math.min(clean.length, index + query.length + 100);
    let snippet = clean.slice(start, end);
    if (start > 0) snippet = "…" + snippet;
    if (end < clean.length) snippet += "…";
    return snippet;
  }

  function escapeRegExp(value){
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(text, query){
    const safe = String(text || "");
    if (!query) return esc(safe);
    const re = new RegExp("(" + escapeRegExp(query) + ")", "ig");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function collectLoadedLocations(){
    try {
      return Array.isArray(locations) ? locations.slice() : [];
    } catch(e) {
      return [];
    }
  }

  async function fetchLocationText(x){
    if (!x || !x.content || x.userCreated) return "";
    try {
      const response = await fetch(x.content + "?search=" + Date.now(), {cache:"no-store"});
      if (!response.ok) return "";
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const article = doc.querySelector("article");
      return stripHtml(article ? article.innerHTML : doc.body?.innerHTML || html);
    } catch(e) {
      console.warn("Reisblik zoeken: locatie niet leesbaar", x.content, e);
      return "";
    }
  }

  function renderResults(found, query, activeVacation){
    if (!found.length) {
      status.textContent = "Geen resultaten gevonden voor: “" + query + "”";
      results.innerHTML = '<div class="search-no-results">Geen tekst gevonden.</div>';
      return;
    }

    status.textContent = found.length + (found.length === 1 ? ' resultaat' : ' resultaten') + ' gevonden in ' + activeVacation.naam + ' voor: “' + query + '”';
    results.innerHTML = found.map((item, index) => {
      return '<button type="button" class="search-result" data-search-index="' + index + '">' +
        '<span class="search-result-title">' + highlight(item.name, query) + '</span>' +
        '<span class="search-result-meta">' + esc(item.categoryLabel || item.category || "") + '</span>' +
        '<span class="search-result-snippet">' + highlight(item.snippet, query) + '</span>' +
        '</button>';
    }).join("");

    results.querySelectorAll(".search-result").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-search-index"));
        const item = found[index];
        if (!item) return;
        closeSearch();
        try {
          openLocationFromMap(item.id);
          setTimeout(() => {
            const card = document.getElementById("card-" + item.id);
            if (card) card.scrollIntoView({behavior:"smooth", block:"start"});
          }, 250);
        } catch(e) {
          console.warn("Reisblik zoeken: locatie openen mislukt", e);
        }
      });
    });
  }

  async function performSearch(){
    const activeVacation = window.reisblikVakantie?.getActieveVakantie ? window.reisblikVakantie.getActieveVakantie() : null;
    if(!activeVacation){
      status.textContent = 'Selecteer eerst een vakantie.';
      results.innerHTML = '';
      return;
    }
    const query = normalizeText(input.value);
    if (!query) {
      status.textContent = "Vul eerst een zoekwoord in.";
      results.innerHTML = "";
      input.focus();
      return;
    }

    status.textContent = 'Zoeken in ' + activeVacation.naam + '…';
    results.innerHTML = "";

    const loaded = collectLoadedLocations();
    const found = [];
    const lowerQuery = query.toLocaleLowerCase("nl-NL");

    // Search every currently available location. For fixed/new HTML locations,
    // also fetch the actual page so the complete story text is included.
    for (const x of loaded) {
      const parts = [];
      const seen = new Set();
      addValueTexts(x, parts, seen);

      const htmlText = await fetchLocationText(x);
      if (htmlText) addValueTexts(htmlText, parts, seen);

      personalTextsForLocation(x.id).forEach(t => {
        if (t && !seen.has(t)) { seen.add(t); parts.push(t); }
      });

      const allText = parts.join(" · ");
      if (allText.toLocaleLowerCase("nl-NL").includes(lowerQuery)) {
        found.push({
          id: x.id,
          name: locationLabel(x),
          category: x.category || "",
          categoryLabel: categoryLabel(x.category),
          snippet: buildSnippet(allText, query)
        });
      }
    }

    // Also search any personal data whose location is not currently loaded.
    // This makes the search useful for content that is still present locally,
    // while deliberately not creating a clickable location that no longer exists.
    const loadedIds = new Set(loaded.map(x => String(x.id)));
    const orphanMatches = [];
    for (const key of PERSONAL_BASE_KEYS.slice(0,4)) {
      const data = getPersonalData(key);
      if (!data || typeof data !== "object") continue;
      for (const [id, value] of Object.entries(data)) {
        if (loadedIds.has(String(id))) continue;
        const parts = [];
        addValueTexts(value, parts, new Set());
        const allText = parts.join(" · ");
        if (allText.toLocaleLowerCase("nl-NL").includes(lowerQuery)) {
          orphanMatches.push({
            id: String(id),
            name: "Persoonlijke gegevens — " + id,
            category: "",
            categoryLabel: "Persoonlijke gegevens",
            snippet: buildSnippet(allText, query),
            orphan: true
          });
        }
      }
    }

    renderResults(found.concat(orphanMatches), query, activeVacation);
  }

  function categoryLabel(category){
    const labels = {
      locaties: "📍 Locaties",
      kunst: "🎨 Kunst",
      winkels: "🛍️ Winkels",
      horeca: "🍴 Horeca",
      informatie: "ℹ️ Informatie"
    };
    return labels[category] || category || "";
  }

  openBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    input.focus();
  });

  closeBtn.addEventListener("click", closeSearch);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeSearch();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.style.display !== "none") closeSearch();
    if (event.key === "Enter" && modal.style.display !== "none" && document.activeElement === input) {
      event.preventDefault();
      performSearch();
    }
  });

  startBtn.addEventListener("click", performSearch);
});
