const STORAGE_KEY = "bk_light_v4";

const ZONES = [
  { id: "head", name: "Голова" },
  { id: "chest", name: "Грудь" },
  { id: "belly", name: "Живот" },
  { id: "belt", name: "Пояс" },
  { id: "legs", name: "Ноги" },
];

const defaultState = {
  player: {
    nick: "АНАР",
    level: 1,
    exp: 0,
    money: 0,
    hpMax: 30,
    hp: 30,
    stats: { str: 3, agi: 3, intu: 3, end: 3 },
    bio: "О себе: АНАР",
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const s = JSON.parse(raw);

    // подстраховка структуры
    if (!s.player) s.player = structuredClone(defaultState.player);
    if (!s.player.stats) s.player.stats = structuredClone(defaultState.player.stats);

    if (typeof s.player.hpMax !== "number") s.player.hpMax = defaultState.player.hpMax;
    if (typeof s.player.hp !== "number") s.player.hp = s.player.hpMax;
    if (typeof s.player.level !== "number") s.player.level = 1;
    if (typeof s.player.exp !== "number") s.player.exp = 0;
    if (typeof s.player.money !== "number") s.player.money = 0;
    if (typeof s.player.nick !== "string") s.player.nick = "АНАР";
    if (typeof s.player.bio !== "string") s.player.bio = "О себе: АНАР";

    // clamp hp
    s.player.hp = clamp(s.player.hp, 0, s.player.hpMax);

    return s;
  } catch {
    return structuredClone(defaultState);
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

let state = loadState();

const screen = document.getElementById("screen");
const netBadge = document.getElementById("netBadge");

function setNetBadge() {
  if (!netBadge) return;
  const online = navigator.onLine;
  netBadge.textContent = online ? "ONLINE" : "OFFLINE";
  netBadge.classList.toggle("online", online);
  netBadge.classList.toggle("offline", !online);
}
window.addEventListener("online", setNetBadge);
window.addEventListener("offline", setNetBadge);
setNetBadge();

// PWA service worker (если есть)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// Навигация
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

function go(where) {
  if (where === "fight") return renderFight();
  if (where === "info") return renderInfo();
  return renderFight();
}

function zoneName(id) {
  const z = ZONES.find((x) => x.id === id);
  return z ? z.name : id;
}

/* ===================== INFO ===================== */
function renderInfo() {
  const p = state.player;

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b> | Деньги: <b>${p.money}</b></div>
      <div>HP: <b>${p.hp}/${p.hpMax}</b></div>
      <div class="hr"></div>
      <div>Сила: <b>${p.stats.str}</b></div>
      <div>Ловкость: <b>${p.stats.agi}</b></div>
      <div>Интуиция: <b>${p.stats.intu}</b></div>
      <div>Выносливость: <b>${p.stats.end}</b></div>
      <div class="hr"></div>
      <div><b>${escapeHtml(p.bio)}</b></div>
    </div>

    <div class="card">
      <h3 class="title">Сменить ник</h3>
      <input class="input" id="nick" value="${escapeAttr(p.nick)}" maxlength="16" />
      <div class="row" style="margin-top:10px;">
        <button class="btn" id="saveNick">Сохранить</button>
        <button class="btn" id="resetAll">Сбросить всё</button>
      </div>
      <div class="small" style="margin-top:8px;">Офлайн версия. Потом добавим онлайн.</div>
    </div>
  `;

  ensureInputStyle();

  document.getElementById("saveNick").onclick = () => {
    const nick = (document.getElementById("nick").value || "").trim() || "АНАР";
    state.player.nick = nick.slice(0, 16);
    saveState();
    renderInfo();
  };

  document.getElementById("resetAll").onclick = () => {
    state = structuredClone(defaultState);
    saveState();
    renderInfo();
  };
}

/* ===================== FIGHT ===================== */
function renderFight() {
  const p = state.player;

  // новый бот на каждый вход в бой
  let bot = {
    nick: "Бот",
    hpMax: 28,
    hp: 28,
    level: 1,
    stats: { str: 3, agi: 3, intu: 2, end: 3 },
  };

  let selectedHit = null;
  let selectedBlock = null;
  let round = 1;
  let logLines = [];
  let finished = false;

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Поле боя</h2>

      <div class="battlefield">
        <!-- LEFT -->
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((p.nick || "A")[0].toUpperCase())}</div>
            <div>
              <div class="fname">${escapeHtml(p.nick)}</div>
              <div class="fsub">Уровень: ${p.level}</div>
            </div>
          </div>
          <div class="hpbar"><div id="phpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="php">${p.hp}</b> / ${p.hpMax}</div>
        </div>

        <!-- CENTER (мини-лог) -->
        <div class="centerBox">
          <div class="centerTitle">Раунд: <span id="roundNum">${round}</span></div>
          <div id="lastLine" class="roundline">Выбери удар и блок → жми “Раунд”.</div>
          <div class="row" style="margin-top:8px;">
            <button class="btn" id="newFightBtn" style="display:none;">Новый бой</button>
          </div>
        </div>

        <!-- RIGHT -->
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((bot.nick || "B")[0].toUpperCase())}</div>
            <div>
              <div class="fname">${escapeHtml(bot.nick)}</div>
              <div class="fsub">Противник</div>
            </div>
          </div>
          <div class="hpbar"><div id="bhpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="bhp">${bot.hp}</b> / ${bot.hpMax}</div>
        </div>
      </div>
    </div>

    <div class="grid2">
      <div class="card zone">
        <div class="ztitle">Атака</div>
        ${ZONES.map((z) => `<button class="zbtn" data-hit="${z.id}">Удар: ${z.name}</button>`).join("")}
      </div>

      <div class="card zone">
        <div class="ztitle">Защита</div>
        ${ZONES.map((z) => `<button class="zbtn" data-block="${z.id}">Блок: ${z.name}</button>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="row">
        <button class="btn" id="roundBtn">Раунд</button>
        <button class="btn" id="restBtn">Отдых</button>
      </div>
      <div class="small" style="margin-top:8px;">Выбери 1 удар и 1 блок. Потом жми “Раунд”.</div>
    </div>

    <!-- ЛОГ ПОД КНОПКАМИ -->
    <div class="card">
      <h3 class="title">Лог боя</h3>
      <div class="logBox">
        <div id="log" class="log"></div>
      </div>
    </div>
  `;

  const php = document.getElementById("php");
  const bhp = document.getElementById("bhp");
  const phpFill = document.getElementById("phpFill");
  const bhpFill = document.getElementById("bhpFill");
  const roundNum = document.getElementById("roundNum");

  const log = document.getElementById("log");
  const lastLine = document.getElementById("lastLine");

  const roundBtn = document.getElementById("roundBtn");
  const restBtn = document.getElementById("restBtn");
  const newFightBtn = document.getElementById("newFightBtn");

  function setBars() {
    const pw = clamp(Math.round((p.hp / p.hpMax) * 100), 0, 100);
    const bw = clamp(Math.round((bot.hp / bot.hpMax) * 100), 0, 100);
    phpFill.style.width = pw + "%";
    bhpFill.style.width = bw + "%";
  }

  function renderFullLog() {
    log.innerHTML = logLines.map(escapeHtml).join("<br>");
  }

  function pushLog(t) {
    lastLine.textContent = t;
    logLines.unshift(t);
    logLines = logLines.slice(0, 14);
    renderFullLog();
  }

  function finishBattle(resultText) {
    finished = true;
    roundBtn.disabled = true;
    restBtn.disabled = true;
    newFightBtn.style.display = "inline-block";
    pushLog(resultText);
  }

  function botChoose() {
    const hit = ZONES[Math.floor(Math.random() * 5)].id;
    const block = ZONES[Math.floor(Math.random() * 5)].id;
    return { hit, block };
  }

  function calcDamage(att) {
    return 4 + Math.floor(att.stats.str / 2);
  }

  // выбор удара
  screen.querySelectorAll("[data-hit]").forEach((btn) => {
    btn.onclick = () => {
      selectedHit = btn.dataset.hit;
      screen.querySelectorAll("[data-hit]").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  // выбор блока
  screen.querySelectorAll("[data-block]").forEach((btn) => {
    btn.onclick = () => {
      selectedBlock = btn.dataset.block;
      screen.querySelectorAll("[data-block]").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  restBtn.onclick = () => {
    if (finished) return;
    const gain = 2 + Math.floor(p.stats.end / 4);
    p.hp = clamp(p.hp + gain, 0, p.hpMax);
    php.textContent = p.hp;
    saveState();
    setBars();
    pushLog(`Отдых: +${gain} HP.`);
  };

  roundBtn.onclick = () => {
    if (finished) return;
    if (!selectedHit || !selectedBlock) {
      pushLog("Сначала выбери удар и блок.");
      return;
    }

    const botMove = botChoose();

    // ТЫ АТАКУЕШЬ
    if (selectedHit === botMove.block) {
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Бот блокирует (${zoneName(botMove.block)}).`);
    } else {
      const dmg = calcDamage(p);
      bot.hp = clamp(bot.hp - dmg, 0, bot.hpMax);
      bhp.textContent = bot.hp;
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Попадание (-${dmg}).`);
    }

    setBars();

    if (bot.hp === 0) {
      state.player.exp += 10;
      state.player.money += 8;
      saveState();
      finishBattle("Бой окончен: Победа ✅ (+10 опыта, +8 денег)");
      return;
    }

    // БОТ АТАКУЕТ
    if (botMove.hit === selectedBlock) {
      pushLog(`Раунд ${round}: Бот → ${zoneName(botMove.hit)}. Ты блокируешь (${zoneName(selectedBlock)}).`);
    } else {
      const dmg = 3 + Math.floor(bot.stats.str / 2);
      p.hp = clamp(p.hp - dmg, 0, p.hpMax);
      php.textContent = p.hp;
      saveState();
      pushLog(`Раунд ${round}: Бот → ${zoneName(botMove.hit)}. Попадание (-${dmg}).`);
    }

    setBars();

    if (p.hp === 0) {
      finishBattle("Бой окончен: Поражение ❌ (HP восстановим в новом бою)");
      return;
    }

    round += 1;
    roundNum.textContent = round;
  };

  newFightBtn.onclick = () => {
    state.player.hp = state.player.hpMax;
    saveState();
    renderFight();
  };

  setBars();
  pushLog("Готов к бою.");
}

/* ===================== helpers/styles ===================== */
function ensureInputStyle() {
  if (document.getElementById("bkInputStyle")) return;
  const style = document.createElement("style");
  style.id = "bkInputStyle";
  style.textContent = `
    .input{
      width:100%;
      padding:10px;
      border-radius:10px;
      border:1px solid #6b4b2a;
      background:rgba(0,0,0,.25);
      color:#f1e2c3;
      outline:none;
    }
  `;
  document.head.appendChild(style);
}

// Экранирование
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// Старт
go("fight");
