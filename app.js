// antibk lite (offline) — app.js (FINAL, cleaned)
// Требует в HTML: 1) <div class="bottombar"> кнопки .tab[data-go="city|fight|shop|info"] </div>
//                 2) <div id="screen"></div>

const STORAGE_KEY = "antibk_lite_final_v1";

/* =======================
   УТИЛИТЫ
======================= */
const ZONES = [
  { id: "head",  name: "Голова" },
  { id: "chest", name: "Грудь" },
  { id: "belly", name: "Живот" },
  { id: "belt",  name: "Пояс" },
  { id: "legs",  name: "Ноги"  },
];

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rnd = () => Math.random();
const zoneName = (id) => (ZONES.find(z => z.id === id)?.name) || id;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function expNeed(level) { return level * 50; }
function expToNext(ch) { return Math.max(0, expNeed(ch.level) - ch.exp); }

// простая логика уклон/крит/урон
function calcDodgeChance(attAgi, defAgi) {
  const base = 0.06;
  const diff = defAgi - attAgi;
  const extra = diff > 0 ? diff * 0.02 : diff * 0.005;
  return clamp(base + extra, 0.02, 0.35);
}
function calcCritChance(intu) { return clamp(0.04 + intu * 0.015, 0.04, 0.40); }
function isCrit(intu) { return rnd() < calcCritChance(intu); }
function calcDamage(str) { return 4 + Math.floor(str / 2); }

/* =======================
   ХЭШ ПАРОЛЯ (SHA-256)
======================= */
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* =======================
   ДЕФОЛТЫ (ВЕЩИ / ПЕРСОНАЖИ)
======================= */
function defaultItems() {
  // без "Təsbeh", только тематические вещи
  return {
    sword:  { id: "sword",  slot: "weapon", name: "Короткий меч",       price: 20, bonuses: { str:  +1 } },
    armor:  { id: "armor",  slot: "armor",  name: "Кольчуга",           price: 30, bonuses: { hpMax:+5 } },
    gloves: { id: "gloves", slot: "gloves", name: "Перчатки бойца",     price: 15, bonuses: { agi:  +1 } },
    amulet: { id: "amulet", slot: "amulet", name: "Амулет Наблюдателя", price: 25, bonuses: { intu: +1 } },
  };
}

function newCharacter(nick) {
  return {
    nick,
    level: 1,
    exp: 0,
    money: 50,
    hpMaxBase: 30,
    hp: 30,
    statsBase: { str: 3, agi: 3, intu: 3, end: 3 },
    statPoints: 0,
    bio: `О себе: ${nick}`,
    wins: 0,
    losses: 0,
    inventory: [],
    equipped: { weapon: null, armor: null, gloves: null, amulet: null },
  };
}

function defaultState() {
  return {
    currentNick: null,
    characters: {},
    items: defaultItems(),
    auth: {
      passHashByNick: {}, // nick -> sha256(pass)
      lastNick: "",
    },
  };
}

/* =======================
   ВЕЩИ / ПРОИЗВОДНЫЕ СТАТЫ
======================= */
function getItem(st, id) { return st.items?.[id] || null; }

function getEquippedItems(st, ch) {
  const ids = Object.values(ch.equipped || {}).filter(Boolean);
  return ids.map(id => getItem(st, id)).filter(Boolean);
}

function computeDerived(st, ch) {
  const bonus = { str: 0, agi: 0, intu: 0, end: 0, hpMax: 0 };
  for (const it of getEquippedItems(st, ch)) {
    const b = it.bonuses || {};
    if (b.str) bonus.str += b.str;
    if (b.agi) bonus.agi += b.agi;
    if (b.intu) bonus.intu += b.intu;
    if (b.end) bonus.end += b.end;
    if (b.hpMax) bonus.hpMax += b.hpMax;
  }
  const stats = {
    str:  (ch.statsBase?.str  || 0) + bonus.str,
    agi:  (ch.statsBase?.agi  || 0) + bonus.agi,
    intu: (ch.statsBase?.intu || 0) + bonus.intu,
    end:  (ch.statsBase?.end  || 0) + bonus.end,
  };
  const hpMax = (ch.hpMaxBase || 0) + bonus.hpMax;
  return { stats, hpMax, bonus };
}

function cleanupOrphans(st) {
  const exists = (id) => !!st.items?.[id];

  for (const nick of Object.keys(st.characters || {})) {
    const ch = st.characters[nick];
    ch.inventory = (ch.inventory || []).filter(exists);

    ch.equipped = ch.equipped || { weapon: null, armor: null, gloves: null, amulet: null };
    for (const slot of Object.keys(ch.equipped)) {
      const id = ch.equipped[slot];
      if (id && !exists(id)) ch.equipped[slot] = null;
    }

    const d = computeDerived(st, ch);
    ch.hp = clamp(ch.hp, 0, d.hpMax);
  }
}

/* =======================
   МИГРАЦИЯ (если был старый save)
======================= */
function migrateIfNeeded(raw) {
  // Уже новая схема
  if (raw && raw.items && raw.characters && raw.auth && ("currentNick" in raw)) {
    cleanupOrphans(raw);
    return raw;
  }

  // Если была v8 без auth — добавим auth и заставим логин
  if (raw && raw.items && raw.characters && ("currentNick" in raw)) {
    raw.auth = raw.auth || { passHashByNick: {}, lastNick: "" };
    raw.currentNick = null;
    cleanupOrphans(raw);
    return raw;
  }

  // Если была совсем старая схема: {player, inventory, equipped}
  if (raw && raw.player) {
    const st = defaultState();
    const p = raw.player;
    const nick = (p.nick || "АНАР").trim() || "АНАР";
    st.characters[nick] = newCharacter(nick);

    const ch = st.characters[nick];
    ch.level = +p.level || 1;
    ch.exp = +p.exp || 0;
    ch.money = +p.money || 0;
    ch.hpMaxBase = +p.hpMaxBase || 30;
    ch.hp = +p.hp || ch.hpMaxBase;
    ch.statsBase = p.statsBase || ch.statsBase;
    ch.statPoints = +p.statPoints || 0;
    ch.bio = typeof p.bio === "string" ? p.bio : ch.bio;
    ch.wins = +p.wins || 0;
    ch.losses = +p.losses || 0;

    ch.inventory = Array.isArray(raw.inventory) ? raw.inventory.filter(Boolean) : [];
    ch.equipped = raw.equipped || ch.equipped;

    st.currentNick = null;
    st.auth.lastNick = nick;

    cleanupOrphans(st);
    return st;
  }

  return defaultState();
}

/* =======================
   LOAD / SAVE
======================= */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const obj = JSON.parse(raw);
    const st = migrateIfNeeded(obj);

    st.items = st.items || defaultItems();
    st.characters = st.characters || {};
    st.auth = st.auth || { passHashByNick: {}, lastNick: "" };
    st.auth.passHashByNick = st.auth.passHashByNick || {};
    st.auth.lastNick = typeof st.auth.lastNick === "string" ? st.auth.lastNick : "";

    if (st.currentNick && !st.characters[st.currentNick]) st.currentNick = null;

    cleanupOrphans(st);
    return st;
  } catch {
    return defaultState();
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* =======================
   UI БАЗА
======================= */
let state = loadState();

const screen = document.getElementById("screen");

function moveTabsToTop() {
  const bar = document.querySelector(".bottombar");
  if (!bar) return;
  if (bar.dataset.movedTop === "1") return;

  bar.style.position = "sticky";
  bar.style.top = "0";
  bar.style.zIndex = "999";
  bar.style.marginBottom = "10px";

  const parent = screen?.parentElement || document.body;
  parent.insertBefore(bar, screen);
  bar.dataset.movedTop = "1";
}

function setTopBarVisible(visible) {
  const bar = document.querySelector(".bottombar");
  if (!bar) return;
  bar.style.display = visible ? "" : "none";
}

// Мини-стили для админки/логина/кнопок
(function injectMiniStyle() {
  if (document.getElementById("miniStyle")) return;
  const st = document.createElement("style");
  st.id = "miniStyle";
  st.textContent = `
    .btn.full{width:100%}
    .btn.mini2{padding:6px 10px;font-size:12px}
    .pill{display:inline-block;padding:2px 8px;border:1px solid #6b4b2a;border-radius:999px;font-size:12px;color:#cdbd9b}
    .input, select, textarea{width:100%;box-sizing:border-box}
    .row.gap8{gap:8px}
    .adminTwo{display:grid;grid-template-columns:1fr;gap:10px}
    @media(min-width:900px){ .adminTwo{grid-template-columns:1fr 1fr;} }
    .loginWrap{max-width:520px;margin:0 auto}
  `;
  document.head.appendChild(st);
})();

function getCurrent() {
  return state.currentNick ? state.characters[state.currentNick] : null;
}
function isLoggedIn() {
  const ch = getCurrent();
  return !!(ch && ch.nick);
}

/* =======================
   АДМИН ТАБ (ТОЛЬКО АНАР)
======================= */
function ensureAdminTab() {
  const bar = document.querySelector(".bottombar");
  if (!bar) return;

  const exists = bar.querySelector('[data-go="admin"]');
  const allowed = isLoggedIn() && getCurrent().nick === "АНАР";

  if (allowed && !exists) {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.go = "admin";
    btn.textContent = "Админ";
    btn.addEventListener("click", () => go("admin"));
    bar.appendChild(btn);
  }
  if (!allowed && exists) exists.remove();
}

/* =======================
   НАВИГАЦИЯ
======================= */
moveTabsToTop();

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

function go(where) {
  moveTabsToTop();

  // если не залогинен — только логин
  if (where !== "login" && !isLoggedIn()) return renderLogin();

  ensureAdminTab();

  switch (where) {
    case "login": return renderLogin();
    case "city":  return renderCity();
    case "fight": return renderFight();
    case "shop":  return renderShop();
    case "info":  return renderInfo();
    case "admin": return renderAdmin();
    default:      return renderCity();
  }
}

/* =======================
   ЛОГИН/РЕГИСТРАЦИЯ
======================= */
async function loginOrRegister(nick, pass) {
  nick = (nick || "").trim();
  pass = (pass || "").trim();

  if (!nick) return { ok: false, msg: "Введи ник." };
  if (nick.length > 16) nick = nick.slice(0, 16);
  if (!pass || pass.length < 3) return { ok: false, msg: "Пароль минимум 3 символа." };

  const passHash = await sha256Hex(pass);
  const exists = !!state.characters[nick];
  const stored = state.auth.passHashByNick[nick];

  if (!exists) {
    // регистрация
    state.characters[nick] = newCharacter(nick);
    state.auth.passHashByNick[nick] = passHash;
    state.auth.lastNick = nick;
    state.currentNick = nick;
    saveState();
    return { ok: true, mode: "register" };
  }

  // миграция: пароль не был задан — задаём при первом входе
  if (!stored) {
    state.auth.passHashByNick[nick] = passHash;
    state.auth.lastNick = nick;
    state.currentNick = nick;
    saveState();
    return { ok: true, mode: "setpass" };
  }

  if (stored !== passHash) return { ok: false, msg: "Неверный пароль." };

  state.auth.lastNick = nick;
  state.currentNick = nick;
  saveState();
  return { ok: true, mode: "login" };
}

function logout() {
  state.currentNick = null;
  saveState();
  renderLogin();
}

function renderLogin() {
  setTopBarVisible(false);
  ensureAdminTab();

  const lastNick = state.auth?.lastNick || "";

  screen.innerHTML = `
    <div class="card loginWrap">
      <h2 class="title">Вход</h2>
      <div class="small">Если ника ещё нет — он будет зарегистрирован.</div>
      <div class="hr"></div>

      <div class="small">Ник</div>
      <input class="input" id="lgNick" maxlength="16" value="${escapeAttr(lastNick)}" placeholder="например: АНАР"/>

      <div class="small" style="margin-top:10px;">Пароль</div>
      <input class="input" id="lgPass" type="password" placeholder="минимум 3 символа"/>

      <div class="row" style="margin-top:12px;">
        <button class="btn full" id="lgBtn">Войти</button>
      </div>

      <div class="small" id="lgMsg" style="margin-top:10px;color:#cdbd9b;"></div>
      <div class="small" style="margin-top:10px;">Важно: для iPhone/PWA запускай через <b>https</b> (например GitHub Pages).</div>
    </div>
  `;

  const nickEl = document.getElementById("lgNick");
  const passEl = document.getElementById("lgPass");
  const msgEl  = document.getElementById("lgMsg");

  const act = async () => {
    try {
      msgEl.textContent = "Проверяю...";
      const res = await loginOrRegister(nickEl.value, passEl.value);
      if (!res.ok) { msgEl.textContent = res.msg || "Ошибка."; return; }
      msgEl.textContent =
        res.mode === "register" ? "Персонаж создан ✅" :
        res.mode === "setpass"  ? "Пароль установлен ✅" :
        "Вход выполнен ✅";
      go("city");
    } catch {
      msgEl.textContent = "Ошибка. Запусти через https (GitHub Pages).";
    }
  };

  document.getElementById("lgBtn").onclick = act;
  passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") act(); });
}

/* =======================
   ГОРОД
======================= */
function renderCity() {
  setTopBarVisible(true);

  const ch = getCurrent();
  const d = computeDerived(state, ch);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Город</h2>
      <div class="small">Офлайн версия. Онлайн позже.</div>
      <div class="hr"></div>

      <div>Ник: <b>${escapeHtml(ch.nick)}</b></div>
      <div>
        Уровень: <b>${ch.level}</b> |
        Опыт: <b>${ch.exp}</b>
        <span class="pill">до след. уровня: <b>${expToNext(ch)}</b></span>
        | Деньги: <b>${ch.money}</b>
      </div>
      <div>HP: <b>${ch.hp}/${d.hpMax}</b></div>
      <div class="small">Победы: <b>${ch.wins}</b> | Поражения: <b>${ch.losses}</b></div>

      <div class="hr"></div>
      <button class="btn full" id="logoutBtn">Выход</button>
    </div>
  `;

  document.getElementById("logoutBtn").onclick = logout;
}

/* =======================
   ИНФО (без смены ника/сброса)
======================= */
function slotLabel(slot) {
  return ({ weapon: "Оружие", armor: "Броня", gloves: "Перчатки", amulet: "Амулет" }[slot] || slot);
}
function fmtSigned(n) { return (n >= 0 ? `+${n}` : `${n}`); }
function bonusesToText(b) {
  const parts = [];
  if (b.str) parts.push(`Сила ${fmtSigned(b.str)}`);
  if (b.agi) parts.push(`Ловкость ${fmtSigned(b.agi)}`);
  if (b.intu) parts.push(`Интуиция ${fmtSigned(b.intu)}`);
  if (b.end) parts.push(`Выносливость ${fmtSigned(b.end)}`);
  if (b.hpMax) parts.push(`HPmax ${fmtSigned(b.hpMax)}`);
  return parts.join(", ") || "без бонусов";
}

function renderStatRow(key, label, ch, d) {
  const base = ch.statsBase[key];
  const bonus = d.bonus[key];
  const total = d.stats[key];
  const canAdd = ch.statPoints > 0;
  return `
    <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
      <div>${label}: <b>${total}</b> <span class="pill">база ${base} + экип ${bonus}</span></div>
      <div><button class="btn mini2" data-addstat="${key}" ${canAdd ? "" : "disabled"}>+1</button></div>
    </div>
  `;
}
function renderEquipRow(slot, label, name) {
  return `
    <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
      <div>${label}: <b>${escapeHtml(name)}</b></div>
      <div><button class="btn mini2" data-unequip="${slot}" ${name === "—" ? "disabled" : ""}>Снять</button></div>
    </div>
  `;
}

function renderInfo() {
  setTopBarVisible(true);

  const ch = getCurrent();
  const d = computeDerived(state, ch);

  const equipName = (slot) => {
    const id = ch.equipped?.[slot];
    if (!id) return "—";
    return getItem(state, id)?.name || id;
  };

  const invHtml = (ch.inventory || []).length
    ? (ch.inventory || []).map((id) => {
      const it = getItem(state, id);
      if (!it) return "";
      const eq = ch.equipped?.[it.slot] === id;
      return `
        <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
          <div>
            <b>${escapeHtml(it.name)}</b>
            <div class="small">Слот: ${slotLabel(it.slot)} | ${escapeHtml(bonusesToText(it.bonuses || {}))}</div>
          </div>
          <div>
            <button class="btn mini2" data-equip="${escapeAttr(it.id)}" ${eq ? "disabled" : ""}>${eq ? "Надето" : "Надеть"}</button>
          </div>
        </div>
      `;
    }).join("")
    : `<div class="small">Пусто. Купи предметы в магазине.</div>`;

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>

      <div>Ник: <b>${escapeHtml(ch.nick)}</b></div>
      <div>
        Уровень: <b>${ch.level}</b> |
        Опыт: <b>${ch.exp}</b>
        <span class="pill">до след. уровня: <b>${expToNext(ch)}</b></span>
        | Деньги: <b>${ch.money}</b>
      </div>

      <div>HP: <b>${ch.hp}/${d.hpMax}</b> <span class="pill">HPmax база ${ch.hpMaxBase} + экип ${d.bonus.hpMax}</span></div>
      <div class="small">Победы: <b>${ch.wins}</b> | Поражения: <b>${ch.losses}</b></div>

      <div class="hr"></div>

      <div class="row" style="align-items:center;justify-content:space-between;">
        <div><b>Распределение статов</b></div>
        <div class="pill">Очки: <b>${ch.statPoints}</b></div>
      </div>
      <div class="small">Итог = база + экипировка</div>

      ${renderStatRow("str",  "Сила",        ch, d)}
      ${renderStatRow("agi",  "Ловкость",    ch, d)}
      ${renderStatRow("intu", "Интуиция",    ch, d)}
      ${renderStatRow("end",  "Выносливость",ch, d)}

      <div class="hr"></div>
      <div><b>${escapeHtml(ch.bio || "")}</b></div>
    </div>

    <div class="card">
      <h3 class="title">Экипировка</h3>
      ${renderEquipRow("weapon", "Оружие",   equipName("weapon"))}
      ${renderEquipRow("armor",  "Броня",    equipName("armor"))}
      ${renderEquipRow("gloves", "Перчатки", equipName("gloves"))}
      ${renderEquipRow("amulet", "Амулет",   equipName("amulet"))}
    </div>

    <div class="card">
      <h3 class="title">Инвентарь</h3>
      ${invHtml}
    </div>
  `;

  // + статы
  screen.querySelectorAll("[data-addstat]").forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.addstat;
      if (ch.statPoints <= 0) return;
      ch.statPoints -= 1;
      ch.statsBase[key] += 1;

      const dd = computeDerived(state, ch);
      ch.hp = clamp(ch.hp, 0, dd.hpMax);

      saveState();
      renderInfo();
    };
  });

  // снять
  screen.querySelectorAll("[data-unequip]").forEach((btn) => {
    btn.onclick = () => {
      const slot = btn.dataset.unequip;
      ch.equipped[slot] = null;

      const dd = computeDerived(state, ch);
      ch.hp = clamp(ch.hp, 0, dd.hpMax);

      saveState();
      renderInfo();
    };
  });

  // надеть
  screen.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.onclick = () => {
      const itemId = btn.dataset.equip;
      const it = getItem(state, itemId);
      if (!it) return;
      if (!(ch.inventory || []).includes(itemId)) return;

      ch.equipped[it.slot] = itemId;

      const dd = computeDerived(state, ch);
      ch.hp = clamp(ch.hp, 0, dd.hpMax);

      saveState();
      renderInfo();
    };
  });
}

/* =======================
   МАГАЗИН
======================= */
function renderShop() {
  setTopBarVisible(true);

  const ch = getCurrent();
  const items = Object.values(state.items || {}).sort((a, b) => (a.price || 0) - (b.price || 0));

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Магазин</h2>
      <div>Деньги: <b>${ch.money}</b></div>
      <div class="small">Купленные предметы попадают в инвентарь.</div>
    </div>

    ${items.map((it) => {
      const owned = (ch.inventory || []).includes(it.id);
      return `
        <div class="card">
          <div><b>${escapeHtml(it.name)}</b> — ${it.price} 💰</div>
          <div class="small">Слот: ${slotLabel(it.slot)} | ${escapeHtml(bonusesToText(it.bonuses || {}))}</div>
          <div class="row" style="margin-top:10px;">
            <button class="btn" data-buy="${escapeAttr(it.id)}" ${owned ? "disabled" : ""}>
              ${owned ? "Куплено" : "Купить"}
            </button>
          </div>
        </div>
      `;
    }).join("")}
  `;

  screen.querySelectorAll("[data-buy]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.buy;
      const it = getItem(state, id);
      if (!it) return;
      if ((ch.inventory || []).includes(id)) return;
      if (ch.money < it.price) return alert("Не хватает денег.");

      ch.money -= it.price;
      ch.inventory.push(id);

      saveState();
      renderShop();
    };
  });
}

/* =======================
   БОЙ (Размен по центру)
   - Бой начинается кнопкой "Новый бой" (по центру)
   - Во время боя скрываем верхнее меню полностью
   - HP полностью восстанавливается после боя
======================= */
function rewardWin(ch) {
  ch.exp += 10;
  ch.money += 8;

  while (ch.exp >= expNeed(ch.level)) {
    ch.exp -= expNeed(ch.level);
    ch.level += 1;
    ch.hpMaxBase += 5;
    ch.statPoints += 3;
  }
}

function renderFight() {
  const ch = getCurrent();
  setTopBarVisible(true);

  let inBattle = false;
  let round = 1;
  let selectedHit = null;
  let selectedBlock = null;
  let logLines = [];
  let bot = null;

  function createBot() {
    return { nick: "Бот", hpMax: 28, hp: 28, stats: { str: 3, agi: 3, intu: 2, end: 3 } };
  }

  const d0 = computeDerived(state, ch);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Поле боя</h2>

      <div class="battlefield">
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((ch.nick || "A")[0].toUpperCase())}</div>
            <div>
              <div class="fname">${escapeHtml(ch.nick)}</div>
              <div class="fsub">Уровень: ${ch.level}</div>
            </div>
          </div>
          <div class="hpbar"><div id="phpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="php">${ch.hp}</b> / <span id="phpMax">${d0.hpMax}</span></div>
        </div>

        <div class="centerBox" style="text-align:center;">
          <div class="centerTitle" style="text-align:center;">
            Размен: <span id="roundNum">${round}</span>
          </div>
          <div class="roundline">&nbsp;</div>
          <div class="row" style="margin-top:8px; justify-content:center;">
            <button class="btn" id="newFightBtn">Новый бой</button>
          </div>
        </div>

        <div class="fighter">
          <div class="fhead">
            <div class="avatar">B</div>
            <div>
              <div class="fname" id="bName">—</div>
              <div class="fsub">Противник</div>
            </div>
          </div>
          <div class="hpbar"><div id="bhpFill" class="hpfill" style="width:0%"></div></div>
          <div class="fsub">HP: <b id="bhp">—</b> / <span id="bhpMax">—</span></div>
        </div>
      </div>
    </div>

    <div class="grid2">
      <div class="card zone">
        <div class="ztitle">Атака</div>
        ${ZONES.map(z => `<button class="zbtn" data-hit="${z.id}" disabled>Удар: ${z.name}</button>`).join("")}
      </div>
      <div class="card zone">
        <div class="ztitle">Защита</div>
        ${ZONES.map(z => `<button class="zbtn" data-block="${z.id}" disabled>Блок: ${z.name}</button>`).join("")}
      </div>
    </div>

    <div class="card">
      <button class="btn full" id="stepBtn" disabled>Сделать ход</button>
      <div class="small" style="margin-top:8px;">Сначала нажми “Новый бой”.</div>
    </div>

    <div class="card">
      <h3 class="title">Лог боя</h3>
      <div class="logBox"><div id="log" class="log"></div></div>
    </div>
  `;

  const php = document.getElementById("php");
  const phpMaxEl = document.getElementById("phpMax");
  const phpFill = document.getElementById("phpFill");

  const bName = document.getElementById("bName");
  const bhp = document.getElementById("bhp");
  const bhpMaxEl = document.getElementById("bhpMax");
  const bhpFill = document.getElementById("bhpFill");

  const roundNum = document.getElementById("roundNum");
  const log = document.getElementById("log");

  const newFightBtn = document.getElementById("newFightBtn");
  const stepBtn = document.getElementById("stepBtn");

  function refreshDerived() {
    const dd = computeDerived(state, ch);
    phpMaxEl.textContent = dd.hpMax;
    ch.hp = clamp(ch.hp, 0, dd.hpMax);
    php.textContent = ch.hp;
    saveState();
    return dd;
  }

  function setBars(dd) {
    phpFill.style.width = clamp(Math.round((ch.hp / dd.hpMax) * 100), 0, 100) + "%";
    if (bot) bhpFill.style.width = clamp(Math.round((bot.hp / bot.hpMax) * 100), 0, 100) + "%";
  }

  function renderLog() {
    log.innerHTML = logLines.map(escapeHtml).join("<br>");
  }
  function pushLog(t) {
    logLines.unshift(t);
    logLines = logLines.slice(0, 14);
    renderLog();
  }

  function enableBattleUI(on) {
    screen.querySelectorAll("[data-hit]").forEach(btn => btn.disabled = !on);
    screen.querySelectorAll("[data-block]").forEach(btn => btn.disabled = !on);
    stepBtn.disabled = !on;
  }

  function resetSelections() {
    selectedHit = null;
    selectedBlock = null;
    screen.querySelectorAll("[data-hit]").forEach(b => b.classList.remove("sel"));
    screen.querySelectorAll("[data-block]").forEach(b => b.classList.remove("sel"));
  }

  function startBattle() {
    setTopBarVisible(false); // во время боя скрыть верхние кнопки
    const dd = refreshDerived();
    const ps = dd.stats;

    bot = createBot();
    inBattle = true;
    round = 1;
    roundNum.textContent = round;

    resetSelections();
    logLines = [];
    renderLog();

    bName.textContent = bot.nick;
    bhp.textContent = bot.hp;
    bhpMaxEl.textContent = bot.hpMax;

    enableBattleUI(true);
    newFightBtn.disabled = true;
    setBars(dd);

    pushLog(`Бой начался. Крит: ${(calcCritChance(ps.intu) * 100).toFixed(0)}%`);
  }

  function endBattle(text, isWin) {
    inBattle = false;
    enableBattleUI(false);
    setTopBarVisible(true);

    if (isWin) ch.wins += 1;
    else ch.losses += 1;

    // полное восстановление HP после боя
    const dd = refreshDerived();
    ch.hp = dd.hpMax;
    php.textContent = ch.hp;

    saveState();
    setBars(dd);

    newFightBtn.disabled = false;

    pushLog(text);
    pushLog(`Жизнь восстановлена полностью (${dd.hpMax}).`);
  }

  // выбор удара/блока
  screen.querySelectorAll("[data-hit]").forEach(btn => {
    btn.onclick = () => {
      if (!inBattle) return;
      selectedHit = btn.dataset.hit;
      screen.querySelectorAll("[data-hit]").forEach(b => b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });
  screen.querySelectorAll("[data-block]").forEach(btn => {
    btn.onclick = () => {
      if (!inBattle) return;
      selectedBlock = btn.dataset.block;
      screen.querySelectorAll("[data-block]").forEach(b => b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  newFightBtn.onclick = () => { if (!inBattle) startBattle(); };

  stepBtn.onclick = () => {
    if (!inBattle) return;
    if (!selectedHit || !selectedBlock) return pushLog("Сначала выбери удар и блок.");

    const dd = refreshDerived();
    const ps = dd.stats;

    const botHit = ZONES[Math.floor(Math.random() * 5)].id;
    const botBlock = ZONES[Math.floor(Math.random() * 5)].id;

    // ТЫ АТАКУЕШЬ
    if (selectedHit === botBlock) {
      pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. БЛОК.`);
    } else {
      const dodgeChance = calcDodgeChance(ps.agi, bot.stats.agi);
      if (rnd() < dodgeChance) {
        pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. УКЛОН!`);
      } else {
        let dmg = calcDamage(ps.str);
        const crit = isCrit(ps.intu);
        if (crit) dmg = Math.ceil(dmg * 1.5);
        bot.hp = clamp(bot.hp - dmg, 0, bot.hpMax);
        bhp.textContent = bot.hp;
        pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. ${crit ? "КРИТ " : ""}-${dmg}.`);
      }
    }
    setBars(dd);

    if (bot.hp === 0) {
      rewardWin(ch);
      saveState();
      endBattle("Бой окончен: Победа ✅ (+10 опыта, +8 денег)", true);
      return;
    }

    // БОТ АТАКУЕТ
    if (botHit === selectedBlock) {
      pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. БЛОК.`);
    } else {
      const dodgeChanceP = calcDodgeChance(bot.stats.agi, ps.agi);
      if (rnd() < dodgeChanceP) {
        pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. ТЫ УКЛОНИЛСЯ!`);
      } else {
        let dmg = calcDamage(bot.stats.str);
        const crit = isCrit(bot.stats.intu);
        if (crit) dmg = Math.ceil(dmg * 1.5);
        ch.hp = clamp(ch.hp - dmg, 0, dd.hpMax);
        php.textContent = ch.hp;
        saveState();
        pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. ${crit ? "КРИТ " : ""}-${dmg}.`);
      }
    }
    setBars(dd);

    if (ch.hp === 0) {
      endBattle("Бой окончен: Поражение ❌", false);
      return;
    }

    round += 1;
    roundNum.textContent = round;
  };

  // init
  const ddInit = computeDerived(state, ch);
  setBars(ddInit);
  enableBattleUI(false);
  newFightBtn.disabled = false;
  pushLog("Нажми “Новый бой”, чтобы начать.");
}

/* =======================
   АДМИНКА (ТОЛЬКО АНАР)
   - редактирование персонажей
   - добавление/редактирование/удаление вещей
   - удаление вещи удаляет её из инвентарей и экипировки у всех
   - смена ника и сброс пароля — только тут
======================= */
function deleteItemEverywhere(itemId) {
  delete state.items[itemId];

  for (const nick of Object.keys(state.characters)) {
    const ch = state.characters[nick];

    ch.inventory = (ch.inventory || []).filter(id => id !== itemId);

    ch.equipped = ch.equipped || { weapon: null, armor: null, gloves: null, amulet: null };
    for (const slot of Object.keys(ch.equipped)) {
      if (ch.equipped[slot] === itemId) ch.equipped[slot] = null;
    }

    const d = computeDerived(state, ch);
    ch.hp = clamp(ch.hp, 0, d.hpMax);
  }
}

function renameCharacter(oldNick, newNick) {
  oldNick = (oldNick || "").trim();
  newNick = (newNick || "").trim();
  if (!oldNick || !state.characters[oldNick]) return { ok: false, msg: "Персонаж не найден" };
  if (!newNick) return { ok: false, msg: "Ник пустой" };
  if (newNick.length > 16) newNick = newNick.slice(0, 16);
  if (oldNick === newNick) return { ok: true };
  if (state.characters[newNick]) return { ok: false, msg: "Такой ник уже существует" };

  const ch = state.characters[oldNick];
  delete state.characters[oldNick];
  ch.nick = newNick;
  state.characters[newNick] = ch;

  // пароль перенести
  const h = state.auth.passHashByNick[oldNick];
  if (h) {
    delete state.auth.passHashByNick[oldNick];
    state.auth.passHashByNick[newNick] = h;
  }

  if (state.currentNick === oldNick) state.currentNick = newNick;
  if (state.auth.lastNick === oldNick) state.auth.lastNick = newNick;

  return { ok: true };
}

function renderAdmin() {
  setTopBarVisible(true);

  const current = getCurrent();
  if (!current || current.nick !== "АНАР") {
    screen.innerHTML = `
      <div class="card">
        <h2 class="title">Админ</h2>
        <div class="small">Доступ только для ника <b>АНАР</b>.</div>
      </div>
    `;
    return;
  }

  const nicks = Object.keys(state.characters).sort((a, b) => a.localeCompare(b, "ru"));
  const activeNick = state.currentNick;

  const items = Object.values(state.items || {}).sort((a, b) => a.id.localeCompare(b.id));
  const itemOptions = items.map(it => `<option value="${escapeAttr(it.id)}">${escapeHtml(it.id)} — ${escapeHtml(it.name)}</option>`).join("");

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Админ-панель (только АНАР)</h2>
      <div class="small">Удаление вещи удаляет её из игры у всех персонажей.</div>
    </div>

    <div class="adminTwo">

      <div class="card">
        <h3 class="title">Персонажи</h3>

        <div class="small">Выбрать</div>
        <select class="input" id="charSelect">
          ${nicks.map(n => `<option value="${escapeAttr(n)}" ${n === activeNick ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}
        </select>

        <div class="row gap8" style="margin-top:10px;">
          <button class="btn" id="setActive">Сделать активным</button>
          <button class="btn" id="deleteChar">Удалить</button>
        </div>

        <div class="hr"></div>

        <h4 class="title">Создать нового</h4>
        <input class="input" id="newNick" placeholder="Ник (до 16)" maxlength="16"/>
        <input class="input" id="newPass" type="password" placeholder="Пароль (мин 3)" style="margin-top:8px;"/>
        <div class="row" style="margin-top:10px;">
          <button class="btn" id="createChar">Создать</button>
        </div>
      </div>

      <div class="card">
        <h3 class="title">Редактирование персонажа</h3>
        <div class="small">Редактируется выбранный в списке</div>
        <div class="hr"></div>

        <div class="small">Ник</div>
        <input class="input" id="editNick"/>

        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Уровень</div><input class="input" id="editLevel" type="number" min="1"/></div>
          <div style="flex:1"><div class="small">Опыт</div><input class="input" id="editExp" type="number" min="0"/></div>
        </div>

        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Деньги</div><input class="input" id="editMoney" type="number" min="0"/></div>
          <div style="flex:1"><div class="small">HP база</div><input class="input" id="editHpBase" type="number" min="1"/></div>
        </div>

        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Сила</div><input class="input" id="sStr" type="number"/></div>
          <div style="flex:1"><div class="small">Ловк.</div><input class="input" id="sAgi" type="number"/></div>
          <div style="flex:1"><div class="small">Интуи.</div><input class="input" id="sIntu" type="number"/></div>
          <div style="flex:1"><div class="small">Вынос.</div><input class="input" id="sEnd" type="number"/></div>
        </div>

        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Очки статов</div><input class="input" id="editSP" type="number" min="0"/></div>
          <div style="flex:1"><div class="small">Победы</div><input class="input" id="editWins" type="number" min="0"/></div>
          <div style="flex:1"><div class="small">Поражения</div><input class="input" id="editLoss" type="number" min="0"/></div>
        </div>

        <div class="small" style="margin-top:10px;">Био</div>
        <textarea class="input" id="editBio" rows="3"></textarea>

        <div class="hr"></div>

        <h4 class="title">Сброс пароля</h4>
        <input class="input" id="resetPass" type="password" placeholder="Новый пароль (мин 3)"/>
        <div class="row" style="margin-top:10px;">
          <button class="btn" id="resetPassBtn">Установить пароль</button>
        </div>

        <div class="hr"></div>

        <h4 class="title">Инвентарь</h4>
        <div class="small">Добавить вещь</div>
        <select class="input" id="invAddItem">
          <option value="">— выбрать —</option>
          ${itemOptions}
        </select>
        <div class="row gap8" style="margin-top:10px;">
          <button class="btn" id="invAddBtn">Добавить</button>
          <button class="btn" id="invClearBtn">Очистить</button>
        </div>

        <div class="small" style="margin-top:10px;">Удалить вещь из инвентаря</div>
        <select class="input" id="invRemoveItem"></select>
        <div class="row" style="margin-top:10px;">
          <button class="btn" id="invRemoveBtn">Удалить</button>
        </div>

        <div class="hr"></div>

        <h4 class="title">Экипировка</h4>
        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Оружие</div><select class="input" id="eqWeapon"></select></div>
          <div style="flex:1"><div class="small">Броня</div><select class="input" id="eqArmor"></select></div>
        </div>
        <div class="row gap8" style="margin-top:10px;">
          <div style="flex:1"><div class="small">Перчатки</div><select class="input" id="eqGloves"></select></div>
          <div style="flex:1"><div class="small">Амулет</div><select class="input" id="eqAmulet"></select></div>
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="saveChar">Сохранить персонажа</button>
        </div>
      </div>

    </div>

    <div class="card">
      <h3 class="title">Магазин / Вещи</h3>
      <div class="adminTwo">

        <div>
          <div class="small">Выбрать вещь</div>
          <select class="input" id="itemSelect">
            ${items.map(it => `<option value="${escapeAttr(it.id)}">${escapeHtml(it.id)} — ${escapeHtml(it.name)}</option>`).join("")}
          </select>

          <div class="row gap8" style="margin-top:10px;">
            <button class="btn" id="loadItem">Загрузить</button>
            <button class="btn" id="deleteItem">Удалить из игры</button>
          </div>

          <div class="hr"></div>

          <h4 class="title">Добавить новую вещь</h4>
          <div class="small">ID (латиница/цифры/_/- без пробелов)</div>
          <input class="input" id="newItemId" placeholder="например: ring01"/>

          <div class="small" style="margin-top:8px;">Название</div>
          <input class="input" id="newItemName" placeholder="например: Кольцо силы"/>

          <div class="row gap8" style="margin-top:8px;">
            <div style="flex:1">
              <div class="small">Слот</div>
              <select class="input" id="newItemSlot">
                <option value="weapon">weapon</option>
                <option value="armor">armor</option>
                <option value="gloves">gloves</option>
                <option value="amulet">amulet</option>
              </select>
            </div>
            <div style="flex:1">
              <div class="small">Цена</div>
              <input class="input" id="newItemPrice" type="number" min="0" value="10"/>
            </div>
          </div>

          <div class="small" style="margin-top:8px;">Бонусы</div>
          <div class="row gap8" style="margin-top:8px;">
            <div style="flex:1"><div class="small">str</div><input class="input" id="nbStr" type="number" value="0"/></div>
            <div style="flex:1"><div class="small">agi</div><input class="input" id="nbAgi" type="number" value="0"/></div>
            <div style="flex:1"><div class="small">intu</div><input class="input" id="nbIntu" type="number" value="0"/></div>
            <div style="flex:1"><div class="small">end</div><input class="input" id="nbEnd" type="number" value="0"/></div>
            <div style="flex:1"><div class="small">hpMax</div><input class="input" id="nbHp" type="number" value="0"/></div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btn" id="createItem">Добавить вещь</button>
          </div>
        </div>

        <div>
          <h4 class="title">Редактирование выбранной</h4>

          <div class="small">ID</div>
          <input class="input" id="itId" disabled/>

          <div class="small" style="margin-top:8px;">Название</div>
          <input class="input" id="itName"/>

          <div class="row gap8" style="margin-top:8px;">
            <div style="flex:1">
              <div class="small">Слот</div>
              <select class="input" id="itSlot">
                <option value="weapon">weapon</option>
                <option value="armor">armor</option>
                <option value="gloves">gloves</option>
                <option value="amulet">amulet</option>
              </select>
            </div>
            <div style="flex:1">
              <div class="small">Цена</div>
              <input class="input" id="itPrice" type="number" min="0"/>
            </div>
          </div>

          <div class="small" style="margin-top:8px;">Бонусы</div>
          <div class="row gap8" style="margin-top:8px;">
            <div style="flex:1"><div class="small">str</div><input class="input" id="ibStr" type="number"/></div>
            <div style="flex:1"><div class="small">agi</div><input class="input" id="ibAgi" type="number"/></div>
            <div style="flex:1"><div class="small">intu</div><input class="input" id="ibIntu" type="number"/></div>
            <div style="flex:1"><div class="small">end</div><input class="input" id="ibEnd" type="number"/></div>
            <div style="flex:1"><div class="small">hpMax</div><input class="input" id="ibHp" type="number"/></div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btn" id="saveItem">Сохранить вещь</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);

  function selectedNick() { return ($("charSelect").value || "").trim(); }
  function selectedChar() { return state.characters[selectedNick()] || null; }

  function fillInvRemove(c) {
    const inv = (c.inventory || []).map((id) => {
      const it = getItem(state, id);
      return { id, name: it?.name || id };
    });
    $("invRemoveItem").innerHTML = inv.length
      ? inv.map(x => `<option value="${escapeAttr(x.id)}">${escapeHtml(x.id)} — ${escapeHtml(x.name)}</option>`).join("")
      : `<option value="">(пусто)</option>`;
  }

  function fillEqSelect(selectId, slot, c) {
    const all = Object.values(state.items || {}).filter(i => i.slot === slot);
    const options = [{ id: "", name: "—" }, ...all];
    $(selectId).innerHTML = options.map(o => `<option value="${escapeAttr(o.id)}">${escapeHtml(o.name)}</option>`).join("");
    $(selectId).value = c.equipped?.[slot] || "";
  }

  function fillCharEditor() {
    const c = selectedChar();
    if (!c) return;

    $("editNick").value = c.nick || "";
    $("editLevel").value = c.level ?? 1;
    $("editExp").value = c.exp ?? 0;
    $("editMoney").value = c.money ?? 0;
    $("editHpBase").value = c.hpMaxBase ?? 30;

    $("sStr").value = c.statsBase?.str ?? 0;
    $("sAgi").value = c.statsBase?.agi ?? 0;
    $("sIntu").value = c.statsBase?.intu ?? 0;
    $("sEnd").value = c.statsBase?.end ?? 0;

    $("editSP").value = c.statPoints ?? 0;
    $("editWins").value = c.wins ?? 0;
    $("editLoss").value = c.losses ?? 0;

    $("editBio").value = c.bio || "";

    fillInvRemove(c);
    fillEqSelect("eqWeapon", "weapon", c);
    fillEqSelect("eqArmor",  "armor",  c);
    fillEqSelect("eqGloves", "gloves", c);
    fillEqSelect("eqAmulet", "amulet", c);
  }

  function loadItemToEditor(itemId) {
    const it = getItem(state, itemId);
    if (!it) return;

    $("itId").value = it.id;
    $("itName").value = it.name || "";
    $("itSlot").value = it.slot || "weapon";
    $("itPrice").value = it.price ?? 0;

    const b = it.bonuses || {};
    $("ibStr").value = b.str ?? 0;
    $("ibAgi").value = b.agi ?? 0;
    $("ibIntu").value = b.intu ?? 0;
    $("ibEnd").value = b.end ?? 0;
    $("ibHp").value = b.hpMax ?? 0;
  }

  // init
  fillCharEditor();
  loadItemToEditor($("itemSelect").value);

  // events: characters
  $("charSelect").onchange = fillCharEditor;

  $("setActive").onclick = () => {
    const n = selectedNick();
    if (!state.characters[n]) return;
    state.currentNick = n;
    saveState();
    ensureAdminTab();
    alert(`Активный персонаж: ${n}`);
    renderAdmin();
  };

  $("deleteChar").onclick = () => {
    const n = selectedNick();
    if (!n || !state.characters[n]) return;
    if (n === "АНАР") return alert("АНАР удалить нельзя.");
    if (!confirm(`Удалить персонажа ${n}?`)) return;

    delete state.characters[n];
    delete state.auth.passHashByNick[n];
    if (state.currentNick === n) state.currentNick = "АНАР";

    saveState();
    renderAdmin();
  };

  $("createChar").onclick = async () => {
    let n = ($("newNick").value || "").trim();
    const p = ($("newPass").value || "").trim();
    if (!n) return alert("Введи ник.");
    if (n.length > 16) n = n.slice(0, 16);
    if (state.characters[n]) return alert("Такой ник уже существует.");
    if (!p || p.length < 3) return alert("Пароль минимум 3 символа.");

    state.characters[n] = newCharacter(n);
    state.auth.passHashByNick[n] = await sha256Hex(p);

    saveState();
    renderAdmin();
  };

  $("resetPassBtn").onclick = async () => {
    const c = selectedChar();
    if (!c) return;
    const p = ($("resetPass").value || "").trim();
    if (!p || p.length < 3) return alert("Пароль минимум 3 символа.");
    state.auth.passHashByNick[c.nick] = await sha256Hex(p);
    saveState();
    alert("Пароль установлен ✅");
    $("resetPass").value = "";
  };

  $("invAddBtn").onclick = () => {
    const c = selectedChar();
    const id = ($("invAddItem").value || "").trim();
    if (!c || !id) return;
    if (!getItem(state, id)) return alert("Вещь не найдена.");
    c.inventory = c.inventory || [];
    if (c.inventory.includes(id)) return alert("Уже есть в инвентаре.");
    c.inventory.push(id);
    saveState();
    fillCharEditor();
  };

  $("invRemoveBtn").onclick = () => {
    const c = selectedChar();
    const id = ($("invRemoveItem").value || "").trim();
    if (!c || !id) return;

    c.inventory = (c.inventory || []).filter(x => x !== id);
    for (const slot of Object.keys(c.equipped || {})) {
      if (c.equipped[slot] === id) c.equipped[slot] = null;
    }

    const d = computeDerived(state, c);
    c.hp = clamp(c.hp, 0, d.hpMax);

    saveState();
    fillCharEditor();
  };

  $("invClearBtn").onclick = () => {
    const c = selectedChar();
    if (!c) return;
    if (!confirm("Очистить инвентарь и снять экипировку?")) return;

    c.inventory = [];
    c.equipped = { weapon: null, armor: null, gloves: null, amulet: null };

    const d = computeDerived(state, c);
    c.hp = clamp(c.hp, 0, d.hpMax);

    saveState();
    fillCharEditor();
  };

  $("saveChar").onclick = () => {
    const c0 = selectedChar();
    if (!c0) return;

    const oldNick = c0.nick;
    const newNick = ($("editNick").value || "").trim() || oldNick;

    const ren = renameCharacter(oldNick, newNick);
    if (!ren.ok) return alert(ren.msg || "Ошибка смены ника");

    const c = state.characters[newNick];

    c.level = Math.max(1, parseInt($("editLevel").value || "1", 10));
    c.exp = Math.max(0, parseInt($("editExp").value || "0", 10));
    c.money = Math.max(0, parseInt($("editMoney").value || "0", 10));
    c.hpMaxBase = Math.max(1, parseInt($("editHpBase").value || "30", 10));

    c.statsBase = c.statsBase || { str: 0, agi: 0, intu: 0, end: 0 };
    c.statsBase.str  = parseInt($("sStr").value  || "0", 10);
    c.statsBase.agi  = parseInt($("sAgi").value  || "0", 10);
    c.statsBase.intu = parseInt($("sIntu").value || "0", 10);
    c.statsBase.end  = parseInt($("sEnd").value  || "0", 10);

    c.statPoints = Math.max(0, parseInt($("editSP").value   || "0", 10));
    c.wins       = Math.max(0, parseInt($("editWins").value || "0", 10));
    c.losses     = Math.max(0, parseInt($("editLoss").value || "0", 10));

    c.bio = $("editBio").value || "";

    c.equipped = c.equipped || { weapon: null, armor: null, gloves: null, amulet: null };
    c.equipped.weapon = $("eqWeapon").value || null;
    c.equipped.armor  = $("eqArmor").value  || null;
    c.equipped.gloves = $("eqGloves").value || null;
    c.equipped.amulet = $("eqAmulet").value || null;

    // проверка соответствия слотам
    for (const slot of Object.keys(c.equipped)) {
      const id = c.equipped[slot];
      if (!id) continue;
      const it = getItem(state, id);
      if (!it || it.slot !== slot) c.equipped[slot] = null;
    }

    // если надето — должно быть в инвентаре
    c.inventory = c.inventory || [];
    for (const slot of Object.keys(c.equipped)) {
      const id = c.equipped[slot];
      if (id && !c.inventory.includes(id)) c.inventory.push(id);
    }

    const d = computeDerived(state, c);
    c.hp = clamp(c.hp, 0, d.hpMax);

    saveState();
    alert("Персонаж сохранён ✅");
    renderAdmin();
  };

  // events: items
  $("loadItem").onclick = () => loadItemToEditor($("itemSelect").value);

  $("saveItem").onclick = () => {
    const id = ($("itId").value || "").trim();
    const it = getItem(state, id);
    if (!it) return alert("Вещь не найдена.");

    it.name = ($("itName").value || "").trim() || it.name;
    it.slot = $("itSlot").value;
    it.price = Math.max(0, parseInt($("itPrice").value || "0", 10));

    const bonuses = {
      str:  parseInt($("ibStr").value  || "0", 10),
      agi:  parseInt($("ibAgi").value  || "0", 10),
      intu: parseInt($("ibIntu").value || "0", 10),
      end:  parseInt($("ibEnd").value  || "0", 10),
      hpMax:parseInt($("ibHp").value   || "0", 10),
    };
    for (const k of Object.keys(bonuses)) if (!bonuses[k]) delete bonuses[k];
    it.bonuses = bonuses;

    // если сменили слот — снимем у тех, у кого стало “не в слот”
    for (const n of Object.keys(state.characters)) {
      const c = state.characters[n];
      for (const slot of Object.keys(c.equipped || {})) {
        if (c.equipped[slot] === id && slot !== it.slot) c.equipped[slot] = null;
      }
      const d = computeDerived(state, c);
      c.hp = clamp(c.hp, 0, d.hpMax);
    }

    saveState();
    alert("Вещь сохранена ✅");
    renderAdmin();
  };

  $("deleteItem").onclick = () => {
    const id = ($("itemSelect").value || "").trim();
    if (!id) return;
    if (!confirm(`Удалить вещь "${id}" из игры у всех?`)) return;

    deleteItemEverywhere(id);
    saveState();
    alert("Вещь удалена ✅");
    renderAdmin();
  };

  $("createItem").onclick = () => {
    let id = ($("newItemId").value || "").trim().replace(/\s+/g, "");
    const name = ($("newItemName").value || "").trim();
    const slot = $("newItemSlot").value;
    const price = Math.max(0, parseInt($("newItemPrice").value || "0", 10));

    if (!id) return alert("Нужен ID.");
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return alert("ID только латиница/цифры/_/- без пробелов.");
    if (state.items[id]) return alert("Такой ID уже есть.");
    if (!name) return alert("Нужно название.");

    const bonuses = {
      str:  parseInt($("nbStr").value  || "0", 10),
      agi:  parseInt($("nbAgi").value  || "0", 10),
      intu: parseInt($("nbIntu").value || "0", 10),
      end:  parseInt($("nbEnd").value  || "0", 10),
      hpMax:parseInt($("nbHp").value   || "0", 10),
    };
    for (const k of Object.keys(bonuses)) if (!bonuses[k]) delete bonuses[k];

    state.items[id] = { id, name, slot, price, bonuses };
    saveState();
    alert("Вещь добавлена ✅");
    renderAdmin();
  };
}

/* =======================
   СТАРТ
======================= */
ensureAdminTab();
go(isLoggedIn() ? "city" : "login");
