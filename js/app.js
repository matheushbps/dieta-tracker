const STORAGE_KEY = "dieta-tracker-v1";

const DEFAULT_GOALS = {
  weight: 84,
  kcal: 2200,
  carbPerKg: 3.1,
  proteinPerKg: 2.2,
  fatPerKg: 0.85,
  satFatLimit: 24,
  fiberGoal: 30,
  fiberPer1000: 14,
  sodiumLimit: 2300,
  addedSugarLimit: 25,
};

const MEALS = [
  "Café da manhã",
  "Lanche da manhã",
  "Almoço",
  "Lanche da tarde",
  "Jantar",
  "Ceia",
];

const CATEGORIES = [
  "Proteínas",
  "Carboidratos",
  "Gorduras",
  "Frutas",
  "Vegetais",
  "Laticínios",
  "Bebidas",
  "Doces",
  "Suplementos",
  "Preparos",
  "Outros",
];

const state = {
  foods: [],
  days: {},
  groups: [],
  goals: { ...DEFAULT_GOALS },
  selectedDate: todayISO(),
  selectedFood: null,
  groupSelectedFood: null,
  activeCategory: "Todas",
  quickFilter: "favoritos",
  charts: {},
};

/* ---------- helpers ---------- */

function todayISO(date = new Date()) {
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 10);
}

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function slug(name) {
  return (
    String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || uid("food")
  );
}

function num(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round((value + Number.EPSILON) * p) / p;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function searchKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesSearch(value, query) {
  const searchable = searchKey(value);
  const terms = searchKey(query).split(" ").filter(Boolean);
  return terms.every((term) => searchable.includes(term));
}

function kcalOf({ carbs, protein, fat }) {
  return carbs * 4 + protein * 4 + fat * 9;
}

function netCarbsOf(food) {
  const explicit = num(food.netCarbs, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(num(food.carbs) - num(food.fiber), 0);
}

/* ---------- state ---------- */

function normalizeFood(raw) {
  const carbs = num(raw.carbs);
  const fiber = num(raw.fiber);
  const category = CATEGORIES.includes(raw.category) ? raw.category : "Outros";
  return {
    id: raw.id || slug(raw.name),
    name: String(raw.name || "").trim(),
    portion: num(raw.portion, 100) || 100,
    carbs,
    protein: num(raw.protein),
    fat: num(raw.fat),
    satFat: num(raw.satFat ?? raw.sat_fat),
    fiber,
    sodium: num(raw.sodium),
    addedSugar: num(raw.addedSugar ?? raw.added_sugar ?? raw.sugar),
    netCarbs: num(raw.netCarbs ?? raw.net_carbs, Math.max(carbs - fiber, 0)),
    category,
    favorite: Boolean(raw.favorite),
    source: raw.source || "custom",
  };
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!data) return;
    state.foods = Array.isArray(data.foods) ? data.foods.map(normalizeFood) : [];
    state.days = data.days && typeof data.days === "object" ? data.days : {};
    state.groups = Array.isArray(data.groups) ? data.groups : [];
    state.goals = { ...DEFAULT_GOALS, ...(data.goals || {}) };
  } catch {
    /* storage corrompido: começa limpo */
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        foods: state.foods,
        days: state.days,
        groups: state.groups,
        goals: state.goals,
      }),
    );
    return true;
  } catch (err) {
    console.error(err);
    const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
    alert(
      quota
        ? "Espaço do navegador insuficiente para salvar o banco. Exporte um backup JSON e limpe dados antigos, ou importe em partes menores."
        : "Não foi possível salvar os dados neste navegador.",
    );
    return false;
  }
}

async function ensureSeedFoods() {
  if (state.foods.length) return;
  try {
    const res = await fetch("./data/foods.seed.json");
    if (!res.ok) throw new Error("seed indisponível");
    state.foods = (await res.json()).map(normalizeFood);
    saveState();
  } catch {
    state.foods = [];
  }
}

function dayEntries() {
  if (!state.days[state.selectedDate]) state.days[state.selectedDate] = [];
  return state.days[state.selectedDate];
}

function scaleFood(food, qty) {
  const factor = qty / (food.portion || 100);
  const scaled = {
    carbs: food.carbs * factor,
    protein: food.protein * factor,
    fat: food.fat * factor,
    satFat: food.satFat * factor,
    fiber: food.fiber * factor,
    sodium: food.sodium * factor,
    addedSugar: food.addedSugar * factor,
    netCarbs: netCarbsOf(food) * factor,
  };
  return { ...scaled, kcal: kcalOf(scaled) };
}

function emptyTotals() {
  return {
    kcal: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    satFat: 0,
    fiber: 0,
    sodium: 0,
    addedSugar: 0,
    netCarbs: 0,
  };
}

function totals(entries = dayEntries()) {
  return entries.reduce((acc, e) => {
    for (const key of Object.keys(acc)) acc[key] += num(e[key]);
    return acc;
  }, emptyTotals());
}

function statusClass(value, target, mode = "max") {
  if (!target) return "";
  if (mode === "max") {
    if (value <= target) return "ok";
    if (value <= target * 1.1) return "warn";
    return "bad";
  }
  if (value >= target) return "ok";
  if (value >= target * 0.8) return "warn";
  return "bad";
}

function fiberTarget(kcal) {
  const dynamic = state.goals.fiberPer1000 ? (kcal / 1000) * state.goals.fiberPer1000 : 0;
  return Math.max(state.goals.fiberGoal || 0, dynamic);
}

/* ---------- render: resumo ---------- */

function statCard({ label, value, sub = "", cls = "", pct = null, hero = false }) {
  const bar =
    pct === null
      ? ""
      : `<div class="bar ${cls}"><span style="width:${Math.min(Math.max(pct, 0), 100)}%"></span></div>`;
  return `
    <div class="stat ${cls} ${hero ? "hero-stat" : ""}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
      ${bar}
    </div>`;
}

function renderStats() {
  const t = totals();
  const g = state.goals;
  const weight = g.weight || 1;
  const fTarget = fiberTarget(t.kcal);

  document.getElementById("statsEnergia").innerHTML = statCard({
    label: "Calorias",
    value: `${round(t.kcal, 0)}`,
    sub: `meta ${g.kcal} kcal · restam ${round(Math.max(g.kcal - t.kcal, 0), 0)}`,
    cls: statusClass(t.kcal, g.kcal, "max"),
    pct: g.kcal ? (t.kcal / g.kcal) * 100 : 0,
    hero: true,
  });

  const macroTargets = {
    carbs: g.carbPerKg * weight,
    protein: g.proteinPerKg * weight,
    fat: g.fatPerKg * weight,
  };
  document.getElementById("statsMacros").innerHTML = [
    statCard({
      label: "Carboidratos (g)",
      value: round(t.carbs),
      sub: `meta ${round(macroTargets.carbs)} g`,
      pct: macroTargets.carbs ? (t.carbs / macroTargets.carbs) * 100 : 0,
    }),
    statCard({
      label: "Proteínas (g)",
      value: round(t.protein),
      sub: `meta ${round(macroTargets.protein)} g`,
      cls: statusClass(t.protein, macroTargets.protein, "min"),
      pct: macroTargets.protein ? (t.protein / macroTargets.protein) * 100 : 0,
    }),
    statCard({
      label: "Gorduras (g)",
      value: round(t.fat),
      sub: `meta ${round(macroTargets.fat)} g`,
      pct: macroTargets.fat ? (t.fat / macroTargets.fat) * 100 : 0,
    }),
  ].join("");

  document.getElementById("statsQualidade").innerHTML = [
    statCard({
      label: "Gord. saturada (g)",
      value: round(t.satFat),
      sub: `limite ${g.satFatLimit} g`,
      cls: statusClass(t.satFat, g.satFatLimit, "max"),
      pct: g.satFatLimit ? (t.satFat / g.satFatLimit) * 100 : 0,
    }),
    statCard({
      label: "Fibras (g)",
      value: round(t.fiber),
      sub: `meta ${round(fTarget)} g`,
      cls: statusClass(t.fiber, fTarget, "min"),
      pct: fTarget ? (t.fiber / fTarget) * 100 : 0,
    }),
    statCard({
      label: "Sódio (mg)",
      value: round(t.sodium, 0),
      sub: `limite ${g.sodiumLimit} mg`,
      cls: statusClass(t.sodium, g.sodiumLimit, "max"),
      pct: g.sodiumLimit ? (t.sodium / g.sodiumLimit) * 100 : 0,
    }),
    statCard({
      label: "Carb. líquidos (g)",
      value: round(t.netCarbs),
      sub: `total ${round(t.carbs)} − fibra ${round(t.fiber)}`,
    }),
    statCard({
      label: "Açúcar adic. (g)",
      value: round(t.addedSugar),
      sub: `limite ${g.addedSugarLimit} g`,
      cls: statusClass(t.addedSugar, g.addedSugarLimit, "max"),
      pct: g.addedSugarLimit ? (t.addedSugar / g.addedSugarLimit) * 100 : 0,
    }),
  ].join("");

  document.getElementById("statsPorKg").innerHTML = [
    statCard({
      label: "Carb / kg",
      value: round(t.carbs / weight, 2),
      sub: `meta ${g.carbPerKg} g/kg`,
      pct: g.carbPerKg ? (t.carbs / weight / g.carbPerKg) * 100 : 0,
    }),
    statCard({
      label: "Prot / kg",
      value: round(t.protein / weight, 2),
      sub: `meta ${g.proteinPerKg} g/kg`,
      cls: statusClass(t.protein / weight, g.proteinPerKg, "min"),
      pct: g.proteinPerKg ? (t.protein / weight / g.proteinPerKg) * 100 : 0,
    }),
    statCard({
      label: "Gord / kg",
      value: round(t.fat / weight, 2),
      sub: `meta ${g.fatPerKg} g/kg`,
      pct: g.fatPerKg ? (t.fat / weight / g.fatPerKg) * 100 : 0,
    }),
  ].join("");

  document.getElementById("weightPill").textContent = `Peso: ${g.weight} kg`;

  const satPill = document.getElementById("satPill");
  const satOk = t.satFat <= g.satFatLimit;
  satPill.className = `pill ${satOk ? "ok" : "bad"}`;
  satPill.textContent = satOk
    ? `GS dentro do limite (${round(t.satFat)}/${g.satFatLimit} g)`
    : `GS acima do limite (${round(t.satFat)}/${g.satFatLimit} g)`;

  const fiberPill = document.getElementById("fiberPill");
  const fiberOk = t.fiber >= fTarget;
  fiberPill.className = `pill ${fiberOk ? "ok" : "bad"}`;
  fiberPill.textContent = fiberOk
    ? `Fibra ok (${round(t.fiber)}/${round(fTarget)} g)`
    : `Fibra abaixo (${round(t.fiber)}/${round(fTarget)} g)`;
}

/* ---------- render: registro do dia ---------- */

function renderEntries() {
  const body = document.getElementById("entriesBody");
  const entries = dayEntries();
  if (!entries.length) {
    body.innerHTML = `<tr><td colspan="12" class="muted">Nenhum alimento neste dia.</td></tr>`;
    return;
  }

  const buckets = new Map();
  for (const entry of entries) {
    const meal = entry.meal && MEALS.includes(entry.meal) ? entry.meal : "Sem refeição";
    if (!buckets.has(meal)) buckets.set(meal, []);
    buckets.get(meal).push(entry);
  }

  const ordered = [...MEALS, "Sem refeição"].filter((m) => buckets.has(m));
  body.innerHTML = ordered
    .map((meal) => {
      const rows = buckets.get(meal);
      const st = totals(rows);
      return `
        <tr class="meal-row"><td colspan="12">${escapeHtml(meal)} · ${round(st.kcal, 0)} kcal</td></tr>
        ${rows
          .map(
            (e) => `
          <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${round(e.qty, 1)}</td>
            <td>${round(e.kcal, 0)}</td>
            <td>${round(e.carbs)}</td>
            <td>${round(e.protein)}</td>
            <td>${round(e.fat)}</td>
            <td>${round(e.satFat)}</td>
            <td>${round(e.fiber)}</td>
            <td>${round(e.sodium, 0)}</td>
            <td>${round(e.netCarbs)}</td>
            <td>${round(e.addedSugar)}</td>
            <td><button class="btn ghost" data-del="${e.id}" type="button">Remover</button></td>
          </tr>`,
          )
          .join("")}
        <tr class="subtotal">
          <td>Subtotal</td><td></td>
          <td>${round(st.kcal, 0)}</td>
          <td>${round(st.carbs)}</td>
          <td>${round(st.protein)}</td>
          <td>${round(st.fat)}</td>
          <td>${round(st.satFat)}</td>
          <td>${round(st.fiber)}</td>
          <td>${round(st.sodium, 0)}</td>
          <td>${round(st.netCarbs)}</td>
          <td>${round(st.addedSugar)}</td>
          <td></td>
        </tr>`;
    })
    .join("");
}

/* ---------- render: banco ---------- */

function renderCategoryChips() {
  const counts = new Map();
  for (const food of state.foods) {
    counts.set(food.category, (counts.get(food.category) || 0) + 1);
  }
  const favCount = state.foods.filter((f) => f.favorite).length;
  const chips = [
    `<button class="chip ${state.activeCategory === "Todas" ? "active" : ""}" data-cat="Todas" type="button">Todas (${state.foods.length})</button>`,
    `<button class="chip ${state.activeCategory === "★" ? "active" : ""}" data-cat="★" type="button">★ Favoritos (${favCount})</button>`,
    ...CATEGORIES.filter((c) => counts.get(c)).map(
      (c) =>
        `<button class="chip ${state.activeCategory === c ? "active" : ""}" data-cat="${c}" type="button">${c} (${counts.get(c)})</button>`,
    ),
  ];
  document.getElementById("categoryChips").innerHTML = chips.join("");
}

function filteredFoods(text = "") {
  const q = searchKey(text);
  return state.foods.filter((food) => {
    if (q && !matchesSearch(food.name, q)) return false;
    if (state.activeCategory === "★") return food.favorite;
    if (state.activeCategory !== "Todas" && food.category !== state.activeCategory) return false;
    return true;
  });
}

function renderFoodTable() {
  const list = filteredFoods(document.getElementById("foodFilter").value).sort((a, b) =>
    a.name.localeCompare(b.name, "pt"),
  );
  document.getElementById("foodCount").textContent = `${list.length} / ${state.foods.length} itens`;
  const body = document.getElementById("foodsBody");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="12" class="muted">Nenhum alimento encontrado.</td></tr>`;
    return;
  }
  body.innerHTML = list
    .slice(0, 300)
    .map(
      (f) => `
      <tr>
        <td><button class="star ${f.favorite ? "on" : ""}" data-fav="${f.id}" type="button">${f.favorite ? "★" : "☆"}</button></td>
        <td>${escapeHtml(f.name)}</td>
        <td>
          <select data-cat-for="${f.id}">
            ${CATEGORIES.map((c) => `<option ${c === f.category ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </td>
        <td>${round(f.portion, 1)}</td>
        <td>${round(f.carbs)}</td>
        <td>${round(f.protein)}</td>
        <td>${round(f.fat)}</td>
        <td>${round(f.satFat)}</td>
        <td>${round(f.fiber)}</td>
        <td>${round(f.sodium, 0)}</td>
        <td>${round(f.addedSugar)}</td>
        <td><button class="btn ghost" data-delfood="${f.id}" type="button">Apagar</button></td>
      </tr>`,
    )
    .join("");
}

/* ---------- render: busca rápida ---------- */

function renderQuickChips() {
  const favs = state.foods.filter((f) => f.favorite).slice(0, 12);
  const recentNames = new Set();
  const dates = Object.keys(state.days).sort().reverse().slice(0, 7);
  for (const d of dates) {
    for (const e of state.days[d] || []) recentNames.add(e.foodId);
  }
  const recents = [...recentNames]
    .map((id) => state.foods.find((f) => f.id === id))
    .filter(Boolean)
    .slice(0, 10);

  const parts = [];
  if (favs.length) {
    parts.push(
      `<span class="pill">★ Favoritos</span>`,
      ...favs.map((f) => `<button class="chip" data-quick="${f.id}" type="button">${escapeHtml(f.name)}</button>`),
    );
  }
  if (recents.length) {
    parts.push(
      `<span class="pill">Recentes</span>`,
      ...recents.map((f) => `<button class="chip" data-quick="${f.id}" type="button">${escapeHtml(f.name)}</button>`),
    );
  }
  document.getElementById("quickChips").innerHTML =
    parts.join("") || `<span class="muted">Marque favoritos na aba Banco para acesso rápido.</span>`;
}

function closeSuggestions(box) {
  const el = typeof box === "string" ? document.getElementById(box) : box;
  if (!el) return;
  el.classList.add("hidden");
  el.innerHTML = "";
  el.closest(".panel")?.classList.remove("raised");
}

function openSuggestions(box) {
  box.classList.remove("hidden");
  box.closest(".panel")?.classList.add("raised");
}

function renderSuggestions(query, boxId, onPickAttr) {
  const box = document.getElementById(boxId);
  const q = searchKey(query);
  if (!q) {
    closeSuggestions(box);
    return;
  }
  const hits = state.foods
    .filter((f) => matchesSearch(f.name, q))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.length - b.name.length)
    .slice(0, 40);
  if (!hits.length) {
    closeSuggestions(box);
    return;
  }
  openSuggestions(box);
  box.innerHTML = hits
    .map(
      (f) => `
      <button type="button" ${onPickAttr}="${f.id}">
        ${f.favorite ? "★ " : ""}${escapeHtml(f.name)}
        <span class="meta">${f.category} · base ${f.portion} · C${round(f.carbs)} P${round(f.protein)} G${round(
          f.fat,
        )} · ${round(kcalOf(f), 0)} kcal</span>
      </button>`,
    )
    .join("");
}

function selectFood(food) {
  state.selectedFood = food;
  document.getElementById("selectedFoodLabel").textContent = `Selecionado: ${food.name} · ${food.category}`;
  document.getElementById("portionHint").value = `${food.portion}`;
  document.getElementById("qtyInput").value = String(food.portion);
  document.getElementById("foodSearch").value = food.name;
  closeSuggestions("suggestions");
}

function clearFoodSelection() {
  state.selectedFood = null;
  document.getElementById("foodSearch").value = "";
  document.getElementById("qtyInput").value = "";
  document.getElementById("portionHint").value = "";
  document.getElementById("selectedFoodLabel").textContent = "Nenhum alimento selecionado.";
  closeSuggestions("suggestions");
}

/* ---------- grupos ---------- */

function renderGroupTargets() {
  const select = document.getElementById("groupTarget");
  select.innerHTML = state.groups.length
    ? state.groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("")
    : `<option value="">Crie um grupo primeiro</option>`;
}

function groupTotals(group) {
  const entries = group.items
    .map((item) => {
      const food = state.foods.find((f) => f.id === item.foodId);
      if (!food) return null;
      return scaleFood(food, item.qty);
    })
    .filter(Boolean);
  return totals(entries);
}

function renderGroups() {
  const container = document.getElementById("groupsList");
  if (!state.groups.length) {
    container.innerHTML = `<p class="muted">Nenhum grupo criado ainda.</p>`;
  } else {
    container.innerHTML = state.groups
      .map((g) => {
        const t = groupTotals(g);
        return `
        <div class="group-card">
          <header>
            <h4>${escapeHtml(g.name)}</h4>
            <div class="row">
              <button class="btn ghost" data-addgroup="${g.id}" type="button">Add ao dia</button>
              <button class="btn ghost" data-delgroup="${g.id}" type="button">Excluir</button>
            </div>
          </header>
          <div class="muted" style="font-size: 0.82rem">
            ${round(t.kcal, 0)} kcal · C ${round(t.carbs)} · P ${round(t.protein)} · G ${round(t.fat)} · Fibra ${round(
              t.fiber,
            )}
          </div>
          <div class="stack" style="gap: 4px">
            ${
              g.items.length
                ? g.items
                    .map((item, idx) => {
                      const food = state.foods.find((f) => f.id === item.foodId);
                      return `<div class="row" style="justify-content: space-between">
                        <span>${escapeHtml(food ? food.name : "(alimento removido)")} · ${item.qty}</span>
                        <button class="btn icon" data-delitem="${g.id}:${idx}" type="button">✕</button>
                      </div>`;
                    })
                    .join("")
                : `<span class="muted">Sem itens.</span>`
            }
          </div>
        </div>`;
      })
      .join("");
  }

  document.getElementById("quickGroups").innerHTML = state.groups.length
    ? state.groups
        .map((g) => `<button class="chip" data-addgroup="${g.id}" type="button">+ ${escapeHtml(g.name)}</button>`)
        .join("")
    : `<span class="muted">Crie grupos na aba Grupos para lançar refeições inteiras de uma vez.</span>`;

  renderGroupTargets();
}

function addGroupToDay(groupId) {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return;
  const meal = document.getElementById("mealSelect").value;
  let added = 0;
  for (const item of group.items) {
    const food = state.foods.find((f) => f.id === item.foodId);
    if (!food) continue;
    dayEntries().push({
      id: uid("e"),
      foodId: food.id,
      name: food.name,
      qty: item.qty,
      portion: food.portion,
      meal: item.meal || meal,
      ...scaleFood(food, item.qty),
    });
    added++;
  }
  saveState();
  renderAll();
  if (!added) alert("Este grupo não tem itens válidos.");
}

/* ---------- importação ---------- */

const HEADER_ALIASES = {
  name: ["name", "alimento", "alimentos", "food"],
  portion: ["portion", "porcao", "porção"],
  carbs: ["carbs", "carboidratos", "carbohydrates"],
  protein: ["protein", "proteinas", "proteínas"],
  fat: ["fat", "gorduras"],
  satFat: ["satfat", "gorduras sat", "gorduras saturadas", "saturated"],
  fiber: ["fiber", "fibras", "fibre"],
  sodium: ["sodium", "sodio", "sódio"],
  addedSugar: ["addedsugar", "acucares", "açucares", "açúcares", "acucar", "açúcar"],
  netCarbs: ["netcarbs", "carboidratos liquidos", "carboidratos líquidos", "net carbs"],
  category: ["category", "categoria", "grupo"],
};

function normalizeHeader(h) {
  return String(h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectDelimiter(line) {
  const counts = {
    "\t": (line.match(/\t/g) || []).length,
    ";": (line.match(/;/g) || []).length,
    ",": (line.match(/,/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseDelimited(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim()));
  const header = rows[0].map(normalizeHeader);

  let cols = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h) => aliases.some((a) => h === normalizeHeader(a) || h.includes(normalizeHeader(a))));
    if (idx >= 0) cols[key] = idx;
  }
  let start = 1;
  if (cols.name == null) {
    cols = {
      name: 0,
      portion: 1,
      carbs: 2,
      protein: 3,
      fat: 4,
      satFat: 5,
      fiber: 6,
      sodium: 7,
      addedSugar: 8,
      netCarbs: 9,
      category: 10,
    };
    start = 0;
  }

  const foods = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const name = row[cols.name];
    if (!name) continue;
    const val = (key) => (cols[key] != null ? row[cols[key]] : undefined);
    const carbs = num(val("carbs"));
    const fiber = num(val("fiber"));
    foods.push(
      normalizeFood({
        name,
        portion: num(val("portion"), 100),
        carbs,
        protein: num(val("protein")),
        fat: num(val("fat")),
        satFat: num(val("satFat")),
        fiber,
        sodium: num(val("sodium")),
        addedSugar: num(val("addedSugar")),
        netCarbs: num(val("netCarbs"), Math.max(carbs - fiber, 0)),
        category: val("category"),
        source: "import",
      }),
    );
  }
  return foods;
}

function upsertFoods(incoming) {
  const byName = new Map(state.foods.map((f) => [f.name.toLowerCase(), f]));
  let added = 0;
  let updated = 0;

  for (const food of incoming) {
    if (!food.name) continue;
    const key = food.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      Object.assign(existing, food, {
        id: existing.id,
        favorite: existing.favorite,
        category: food.category && food.category !== "Outros" ? food.category : existing.category,
      });
      updated++;
    } else {
      const created = { ...food, id: food.id || slug(food.name) };
      state.foods.push(created);
      byName.set(key, created);
      added++;
    }
  }

  const saved = saveState();
  return { added, updated, saved };
}

async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  // Excel no Windows costuma salvar CSV em Windows-1252
  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch {
    return utf8;
  }
}

function reportImport(result, label = "Importação") {
  const status = document.getElementById("importStatus");
  if (!result || !(result.added + result.updated)) {
    status.textContent = `${label}: nenhum alimento encontrado no arquivo.`;
    return;
  }
  const saveNote = result.saved === false ? " (atenção: não salvou no navegador)" : "";
  status.textContent = `${label}: ${result.added} novos, ${result.updated} atualizados. Total no banco: ${state.foods.length}.${saveNote}`;
  state.activeCategory = "Todas";
  const filter = document.getElementById("foodFilter");
  if (filter) filter.value = "";
  switchTab("banco");
  renderAll();
  alert(`${label} concluída.\n${result.added} novos · ${result.updated} atualizados\nTotal no banco: ${state.foods.length}\n\nOs dados ficam só neste navegador/dispositivo. Em outro PC ou no iPhone, importe de novo (ou restaure um backup).`);
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- gráficos ---------- */

function lastNDates(n) {
  const out = [];
  const base = new Date(`${state.selectedDate}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(todayISO(d));
  }
  return out;
}

const CHART_THEME = {
  text: "#e6edff",
  muted: "#93a4c9",
  grid: "rgba(140, 175, 255, 0.12)",
};

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: CHART_THEME.text } } },
    scales: {
      x: { ticks: { color: CHART_THEME.muted }, grid: { color: CHART_THEME.grid } },
      y: { ticks: { color: CHART_THEME.muted }, grid: { color: CHART_THEME.grid } },
    },
  };
}

function renderCharts() {
  if (typeof Chart === "undefined") return;
  const dates = lastNDates(14);
  const series = dates.map((d) => totals(state.days[d] || []));
  const labels = dates.map((d) => d.slice(5));

  for (const chart of Object.values(state.charts)) chart?.destroy();

  state.charts.macros = new Chart(document.getElementById("macrosChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Carb", data: series.map((s) => round(s.carbs)), borderColor: "#4f8cff", tension: 0.25 },
        { label: "Prot", data: series.map((s) => round(s.protein)), borderColor: "#45d69b", tension: 0.25 },
        { label: "Gord", data: series.map((s) => round(s.fat)), borderColor: "#f2c161", tension: 0.25 },
        { label: "Fibra", data: series.map((s) => round(s.fiber)), borderColor: "#c084fc", tension: 0.25 },
      ],
    },
    options: baseChartOptions(),
  });

  state.charts.kcal = new Chart(document.getElementById("kcalChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Calorias",
          data: series.map((s) => round(s.kcal, 0)),
          backgroundColor: "rgba(79, 140, 255, 0.6)",
          borderRadius: 6,
        },
        {
          label: "Meta",
          type: "line",
          data: dates.map(() => state.goals.kcal),
          borderColor: "#f2c161",
          pointRadius: 0,
        },
      ],
    },
    options: baseChartOptions(),
  });

  state.charts.quality = new Chart(document.getElementById("qualityChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "GS (g)", data: series.map((s) => round(s.satFat)), borderColor: "#ff7a8a", tension: 0.25 },
        { label: "Fibras (g)", data: series.map((s) => round(s.fiber)), borderColor: "#45d69b", tension: 0.25 },
        {
          label: "Sódio (mg)",
          data: series.map((s) => round(s.sodium, 0)),
          borderColor: "#38bdf8",
          tension: 0.25,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: {
        ...baseChartOptions().scales,
        y1: {
          position: "right",
          ticks: { color: CHART_THEME.muted },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

/* ---------- render geral ---------- */

function renderAll() {
  renderStats();
  renderEntries();
  renderCategoryChips();
  renderFoodTable();
  renderQuickChips();
  renderGroups();
  if (!document.getElementById("tab-graficos").classList.contains("hidden")) renderCharts();
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === name));
  ["hoje", "graficos", "banco", "grupos", "metas"].forEach((t) => {
    document.getElementById(`tab-${t}`).classList.toggle("hidden", t !== name);
  });
  if (name === "graficos") renderCharts();
}

function fillGoalsForm() {
  const form = document.getElementById("goalsForm");
  for (const [k, v] of Object.entries(state.goals)) {
    if (form.elements[k]) form.elements[k].value = v;
  }
}

function fillSelects() {
  document.getElementById("mealSelect").innerHTML = MEALS.map(
    (m, i) => `<option ${i === 2 ? "selected" : ""}>${m}</option>`,
  ).join("");
  document.getElementById("foodFormCategory").innerHTML = CATEGORIES.map(
    (c) => `<option ${c === "Outros" ? "selected" : ""}>${c}</option>`,
  ).join("");
}

/* ---------- eventos ---------- */

function bindEvents() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const dateInput = document.getElementById("dateInput");
  dateInput.value = state.selectedDate;
  dateInput.addEventListener("change", () => {
    state.selectedDate = dateInput.value || todayISO();
    renderAll();
  });

  document.getElementById("foodSearch").addEventListener("input", (e) => {
    renderSuggestions(e.target.value, "suggestions", "data-pick");
  });

  document.getElementById("suggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn) return;
    const food = state.foods.find((f) => f.id === btn.dataset.pick);
    if (food) selectFood(food);
  });

  document.getElementById("quickChips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn) return;
    const food = state.foods.find((f) => f.id === btn.dataset.quick);
    if (food) selectFood(food);
  });

  document.getElementById("addEntryBtn").addEventListener("click", () => {
    const food = state.selectedFood;
    if (!food) return alert("Selecione um alimento na busca.");
    const qty = num(document.getElementById("qtyInput").value);
    if (qty <= 0) return alert("Informe uma quantidade válida.");
    dayEntries().push({
      id: uid("e"),
      foodId: food.id,
      name: food.name,
      qty,
      portion: food.portion,
      meal: document.getElementById("mealSelect").value,
      ...scaleFood(food, qty),
    });
    clearFoodSelection();
    saveState();
    renderAll();
  });

  document.getElementById("entriesBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    state.days[state.selectedDate] = dayEntries().filter((x) => x.id !== btn.dataset.del);
    saveState();
    renderAll();
  });

  document.getElementById("foodFilter").addEventListener("input", renderFoodTable);

  document.getElementById("categoryChips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    state.activeCategory = btn.dataset.cat;
    renderCategoryChips();
    renderFoodTable();
  });

  const foodsBody = document.getElementById("foodsBody");
  foodsBody.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      const food = state.foods.find((f) => f.id === fav.dataset.fav);
      if (food) {
        food.favorite = !food.favorite;
        saveState();
        renderCategoryChips();
        renderFoodTable();
        renderQuickChips();
      }
      return;
    }
    const del = e.target.closest("[data-delfood]");
    if (del && confirm("Apagar este alimento do banco?")) {
      state.foods = state.foods.filter((f) => f.id !== del.dataset.delfood);
      saveState();
      renderAll();
    }
  });

  foodsBody.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-cat-for]");
    if (!sel) return;
    const food = state.foods.find((f) => f.id === sel.dataset.catFor);
    if (!food) return;
    food.category = sel.value;
    saveState();
    renderCategoryChips();
  });

  document.getElementById("foodForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const food = normalizeFood(Object.fromEntries(new FormData(e.target).entries()));
    food.id = slug(food.name);
    food.source = "manual";
    const { added } = upsertFoods([food]);
    e.target.reset();
    e.target.portion.value = 100;
    document.getElementById("importStatus").textContent = added ? "Alimento adicionado." : "Alimento atualizado.";
    renderAll();
  });

  document.getElementById("importPasteBtn").addEventListener("click", () => {
    const foods = parseDelimited(document.getElementById("importPaste").value);
    if (!foods.length) {
      document.getElementById("importStatus").textContent = "Nada para importar.";
      return;
    }
    const r = upsertFoods(foods);
    document.getElementById("importPaste").value = "";
    reportImport(r, "Texto");
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("importStatus").textContent = `Lendo ${file.name}…`;
    let foods = [];
    try {
      const text = await readTextFile(file);
      if (file.name.toLowerCase().endsWith(".json")) {
        const data = JSON.parse(text);
        foods = (Array.isArray(data) ? data : data.foods || []).map(normalizeFood);
      } else {
        foods = parseDelimited(text);
      }
    } catch (err) {
      console.error(err);
      document.getElementById("importStatus").textContent = "Arquivo inválido ou ilegível.";
      e.target.value = "";
      return;
    }
    const r = upsertFoods(foods);
    e.target.value = "";
    reportImport(r, file.name);
  });

  document.getElementById("exportFoodsBtn").addEventListener("click", () => {
    downloadJSON("foods-banco.json", state.foods);
  });

  /* grupos */
  document.getElementById("createGroupBtn").addEventListener("click", () => {
    const input = document.getElementById("newGroupName");
    const name = input.value.trim();
    if (!name) return alert("Informe o nome do grupo.");
    state.groups.push({ id: uid("g"), name, items: [] });
    input.value = "";
    saveState();
    renderGroups();
  });

  document.getElementById("groupFoodSearch").addEventListener("input", (e) => {
    renderSuggestions(e.target.value, "groupSuggestions", "data-gpick");
  });

  document.getElementById("groupSuggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-gpick]");
    if (!btn) return;
    const food = state.foods.find((f) => f.id === btn.dataset.gpick);
    if (!food) return;
    state.groupSelectedFood = food;
    document.getElementById("groupSelectedLabel").textContent = `Selecionado: ${food.name}`;
    document.getElementById("groupFoodSearch").value = food.name;
    document.getElementById("groupQty").value = String(food.portion);
    closeSuggestions("groupSuggestions");
  });

  document.getElementById("addToGroupBtn").addEventListener("click", () => {
    const groupId = document.getElementById("groupTarget").value;
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return alert("Crie ou selecione um grupo.");
    const food = state.groupSelectedFood;
    if (!food) return alert("Selecione um alimento.");
    const qty = num(document.getElementById("groupQty").value);
    if (qty <= 0) return alert("Quantidade inválida.");
    group.items.push({ foodId: food.id, qty });
    saveState();
    renderGroups();
  });

  document.getElementById("groupsList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-delgroup]");
    if (del) {
      if (!confirm("Excluir este grupo?")) return;
      state.groups = state.groups.filter((g) => g.id !== del.dataset.delgroup);
      saveState();
      renderGroups();
      return;
    }
    const delItem = e.target.closest("[data-delitem]");
    if (delItem) {
      const [gid, idx] = delItem.dataset.delitem.split(":");
      const group = state.groups.find((g) => g.id === gid);
      if (group) {
        group.items.splice(Number(idx), 1);
        saveState();
        renderGroups();
      }
      return;
    }
    const add = e.target.closest("[data-addgroup]");
    if (add) addGroupToDay(add.dataset.addgroup);
  });

  document.getElementById("quickGroups").addEventListener("click", (e) => {
    const add = e.target.closest("[data-addgroup]");
    if (add) addGroupToDay(add.dataset.addgroup);
  });

  document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const entries = dayEntries();
    if (!entries.length) return alert("Nenhum alimento no dia para salvar.");
    const name = prompt("Nome do grupo:", `Dia ${state.selectedDate}`);
    if (!name) return;
    state.groups.push({
      id: uid("g"),
      name: name.trim(),
      items: entries.map((e) => ({ foodId: e.foodId, qty: e.qty, meal: e.meal })),
    });
    saveState();
    renderGroups();
    alert("Grupo salvo.");
  });

  /* metas e backup */
  document.getElementById("goalsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of Object.keys(DEFAULT_GOALS)) {
      state.goals[key] = num(fd.get(key), DEFAULT_GOALS[key]);
    }
    saveState();
    renderAll();
    alert("Metas salvas.");
  });

  document.getElementById("exportAllBtn").addEventListener("click", () => {
    downloadJSON(`dieta-backup-${todayISO()}.json`, {
      foods: state.foods,
      days: state.days,
      groups: state.groups,
      goals: state.goals,
    });
  });

  document.getElementById("importAllFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.foods)) state.foods = data.foods.map(normalizeFood);
      if (data.days && typeof data.days === "object") state.days = data.days;
      if (Array.isArray(data.groups)) state.groups = data.groups;
      if (data.goals) state.goals = { ...DEFAULT_GOALS, ...data.goals };
      saveState();
      fillGoalsForm();
      renderAll();
      alert("Backup restaurado.");
    } catch {
      alert("Arquivo de backup inválido.");
    }
    e.target.value = "";
  });

  document.getElementById("resetDayBtn").addEventListener("click", () => {
    if (!confirm("Limpar todos os registros deste dia?")) return;
    state.days[state.selectedDate] = [];
    saveState();
    renderAll();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) {
      closeSuggestions("suggestions");
      closeSuggestions("groupSuggestions");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeSuggestions("suggestions");
    closeSuggestions("groupSuggestions");
  });
}

async function init() {
  loadState();
  await ensureSeedFoods();
  fillSelects();
  fillGoalsForm();
  bindEvents();
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
