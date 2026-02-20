const STORAGE_KEY = "antibk_light_save_v7";

const ZONES = [
  { id:"head",  name:"Голова" },
  { id:"chest", name:"Грудь" },
  { id:"belly", name:"Живот" },
  { id:"belt",  name:"Пояс" },
  { id:"legs",  name:"Ноги" },
];

// ====== Предметы (Təsbeh удалён) ======
const ITEM_DB = {
  sword:  { id:"sword",  slot:"weapon", name:"Короткий меч",       price:20, bonuses:{ str:+1 } },
  gloves: { id:"gloves", slot:"gloves", name:"Перчатки бойца",     price:15, bonuses:{ agi:+1 } },
  armor:  { id:"armor",  slot:"armor",  name:"Кольчуга",           price:30, bonuses:{ hpMax:+5 } },
  amulet: { id:"amulet", slot:"amulet", name:"Амулет Наблюдателя", price:25, bonuses:{ intu:+1 } },
};

const defaultState = {
  player: {
    nick: "АНАР",
    level: 1,
    exp: 0,
    money: 50,
    hpMaxBase: 30,
    hp: 30,
    statsBase: { str:3, agi:3, intu:3, end:3 },
    statPoints: 0,
    bio: "О себе: АНАР",
    wins: 0,
    losses: 0,
  },
  inventory: [],
  equipped: { weapon:null, armor:null, gloves:null, amulet:null },
};

// ====== Utils ======
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function zoneName(id){ return (ZONES.find(z=>z.id===id)?.name) || id; }
function expToNext(p){ return Math.max(0, (p.level * 50) - p.exp); }
function rnd(){ return Math.random(); }

// ====== механика: шанс уклона/крита ======
function calcDodgeChance(attAgi, defAgi){
  // базовый 6%, плюс преимущество ловкости
  const base = 0.06;
  const diff = defAgi - attAgi; // чем выше ловкость защитника — тем больше уклон
  const extra = diff > 0 ? diff * 0.02 : diff * 0.005; // отстающему чуть легче попадать
  return clamp(base + extra, 0.02, 0.35);
}
function calcCritChance(attIntu){
  // 4% + 1.5% за интуицию
  return clamp(0.04 + attIntu * 0.015, 0.04, 0.40);
}
function calcDamage(attStr){
  // базовый урон
  return 4 + Math.floor(attStr / 2);
}
function isCrit(attIntu){
  return rnd() < calcCritChance(attIntu);
}

// ====== storage ======
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    const s = JSON.parse(raw);

    if(!s.player) s.player = structuredClone(defaultState.player);
    if(!s.player.statsBase) s.player.statsBase = structuredClone(defaultState.player.statsBase);

    if(typeof s.player.hpMaxBase !== "number") s.player.hpMaxBase = 30;
    if(typeof s.player.hp !== "number") s.player.hp = s.player.hpMaxBase;
    if(typeof s.player.statPoints !== "number") s.player.statPoints = 0;

    if(typeof s.player.money !== "number") s.player.money = 0;
    if(typeof s.player.level !== "number") s.player.level = 1;
    if(typeof s.player.exp !== "number") s.player.exp = 0;
    if(typeof s.player.nick !== "string") s.player.nick = "АНАР";
    if(typeof s.player.bio !== "string") s.player.bio = "О себе: АНАР";

    if(typeof s.player.wins !== "number") s.player.wins = 0;
    if(typeof s.player.losses !== "number") s.player.losses = 0;

    if(!Array.isArray(s.inventory)) s.inventory = [];
    if(!s.equipped) s.equipped = structuredClone(defaultState.equipped);

    for(const k of Object.keys(defaultState.equipped)){
      if(!(k in s.equipped)) s.equipped[k] = null;
    }

    // вычистим старый tasbeh
    s.inventory = s.inventory.filter(id => id !== "tasbeh");
    for(const k of Object.keys(s.equipped)){
      if(s.equipped[k] === "tasbeh") s.equipped[k] = null;
    }

    const d = computeDerived(s);
    s.player.hp = clamp(s.player.hp, 0, d.hpMax);

    return s;
  }catch{
    return structuredClone(defaultState);
  }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function getEquippedItems(st){
  const ids = Object.values(st.equipped).filter(Boolean);
  return ids.map(id => ITEM_DB[id]).filter(Boolean);
}

function computeDerived(st){
  const p = st.player;

  const bonus = { str:0, agi:0, intu:0, end:0, hpMax:0 };
  for(const it of getEquippedItems(st)){
    const b = it.bonuses || {};
    if(b.str) bonus.str += b.str;
    if(b.agi) bonus.agi += b.agi;
    if(b.intu) bonus.intu += b.intu;
    if(b.end) bonus.end += b.end;
    if(b.hpMax) bonus.hpMax += b.hpMax;
  }

  const stats = {
    str: p.statsBase.str + bonus.str,
    agi: p.statsBase.agi + bonus.agi,
    intu: p.statsBase.intu + bonus.intu,
    end: p.statsBase.end + bonus.end,
  };

  const hpMax = p.hpMaxBase + bonus.hpMax;
  return { stats, hpMax, bonus };
}

// ====== hide/show bottom tabs ======
function setBottomBarVisible(visible){
  const bar = document.querySelector(".bottombar");
  if(!bar) return;
  bar.style.display = visible ? "" : "none";
}

// ====== UI базовые ======
let state = loadState();

const screen = document.getElementById("screen");
const netBadge = document.getElementById("netBadge");
const syncBtn = document.getElementById("syncBtn");

function setNetBadge(){
  const online = navigator.onLine;
  if(netBadge){
    netBadge.textContent = online ? "ONLINE" : "OFFLINE";
    netBadge.classList.toggle("online", online);
    netBadge.classList.toggle("offline", !online);
  }
}
window.addEventListener("online", setNetBadge);
window.addEventListener("offline", setNetBadge);
setNetBadge();

// Заготовка SYNC
if(syncBtn){
  syncBtn.onclick = async () => {
    const res = await window.API?.syncSave?.(state);
    if(res?.ok) alert("SYNC OK ✅");
    else alert("SYNC пока не настроен (нет сервера).");
  };
}

// Навигация
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>go(btn.dataset.go));
});
function go(where){
  if(where==="city") return renderCity();
  if(where==="fight") return renderFight();
  if(where==="shop") return renderShop();
  if(where==="info") return renderInfo();
  return renderCity();
}

// Мини-стили
(function ensureMiniStyle(){
  if(document.getElementById("miniStyle")) return;
  const st = document.createElement("style");
  st.id = "miniStyle";
  st.textContent = `
    .btn.mini2{padding:6px 10px;font-size:12px}
    .pill{display:inline-block;padding:2px 8px;border:1px solid #6b4b2a;border-radius:999px;font-size:12px;color:#cdbd9b}
    .btn.full{width:100%}
  `;
  document.head.appendChild(st);
})();

// ====== Общие для инфо/магазина ======
function slotLabel(slot){
  return ({ weapon:"Оружие", armor:"Броня", gloves:"Перчатки", amulet:"Амулет" }[slot] || slot);
}
function fmtSigned(n){ return (n>=0?`+${n}`:`${n}`); }
function bonusesToText(b){
  const parts = [];
  if(b.str) parts.push(`Сила ${fmtSigned(b.str)}`);
  if(b.agi) parts.push(`Ловкость ${fmtSigned(b.agi)}`);
  if(b.intu) parts.push(`Интуиция ${fmtSigned(b.intu)}`);
  if(b.end) parts.push(`Выносливость ${fmtSigned(b.end)}`);
  if(b.hpMax) parts.push(`HPmax ${fmtSigned(b.hpMax)}`);
  return parts.join(", ") || "без бонусов";
}

// ====== Город ======
function slotName(slot){
  const id = state.equipped[slot];
  if(!id) return "—";
  return ITEM_DB[id]?.name || id;
}

function renderCity(){
  setBottomBarVisible(true);

  const p = state.player;
  const d = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Город</h2>
      <div class="small">Офлайн. Онлайн позже через SYNC.</div>
      <div class="hr"></div>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>
        Уровень: <b>${p.level}</b> |
        Опыт: <b>${p.exp}</b>
        <span class="pill">до след. уровня: <b>${expToNext(p)}</b></span>
        | Деньги: <b>${p.money}</b>
      </div>
      <div>HP: <b>${p.hp}/${d.hpMax}</b></div>
      <div class="small">Победы: <b>${p.wins}</b> | Поражения: <b>${p.losses}</b></div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn" id="toFight">На арену</button>
        <button class="btn" id="toShop">В магазин</button>
        <button class="btn" id="toInfo">Инфо</button>
      </div>
    </div>

    <div class="card">
      <h3 class="title">Экипировка</h3>
      <div class="small">Оружие: <b>${escapeHtml(slotName("weapon"))}</b></div>
      <div class="small">Броня: <b>${escapeHtml(slotName("armor"))}</b></div>
      <div class="small">Перчатки: <b>${escapeHtml(slotName("gloves"))}</b></div>
      <div class="small">Амулет: <b>${escapeHtml(slotName("amulet"))}</b></div>
    </div>
  `;

  document.getElementById("toFight").onclick = ()=>go("fight");
  document.getElementById("toShop").onclick = ()=>go("shop");
  document.getElementById("toInfo").onclick = ()=>go("info");
}

// ====== Инфо ======
function statRow(key, label, base, bonus, total){
  const canAdd = state.player.statPoints > 0;
  return `
    <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
      <div>${label}: <b>${total}</b> <span class="pill">база ${base} + экип ${bonus}</span></div>
      <div><button class="btn mini2" data-addstat="${key}" ${canAdd ? "" : "disabled"}>+1</button></div>
    </div>
  `;
}
function equipRow(slot, label){
  const id = state.equipped[slot];
  const name = id ? (ITEM_DB[id]?.name || id) : "—";
  return `
    <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
      <div>${label}: <b>${escapeHtml(name)}</b></div>
      <div><button class="btn mini2" data-unequip="${slot}" ${id ? "" : "disabled"}>Снять</button></div>
    </div>
  `;
}
function renderInventoryList(){
  if(state.inventory.length === 0){
    return `<div class="small">Пусто. Купи предметы в магазине.</div>`;
  }
  return state.inventory.map(id=>{
    const it = ITEM_DB[id];
    if(!it) return "";
    const eq = state.equipped[it.slot] === id;
    return `
      <div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;">
        <div>
          <b>${escapeHtml(it.name)}</b>
          <div class="small">Слот: ${slotLabel(it.slot)} | ${escapeHtml(bonusesToText(it.bonuses))}</div>
        </div>
        <div>
          <button class="btn mini2" data-equip="${it.id}" ${eq ? "disabled" : ""}>
            ${eq ? "Надето" : "Надеть"}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderInfo(){
  setBottomBarVisible(true);

  const p = state.player;
  const d = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>
        Уровень: <b>${p.level}</b> |
        Опыт: <b>${p.exp}</b>
        <span class="pill">до след. уровня: <b>${expToNext(p)}</b></span>
        | Деньги: <b>${p.money}</b>
      </div>
      <div>HP: <b>${p.hp}/${d.hpMax}</b> <span class="pill">HPmax база ${p.hpMaxBase} + экип ${d.bonus.hpMax}</span></div>
      <div class="small">Победы: <b>${p.wins}</b> | Поражения: <b>${p.losses}</b></div>
      <div class="hr"></div>

      <div class="row" style="align-items:center;justify-content:space-between;">
        <div><b>Распределение статов</b></div>
        <div class="pill">Очки: <b>${p.statPoints}</b></div>
      </div>
      <div class="small">Итог = база + экипировка</div>

      ${statRow("str","Сила", p.statsBase.str, d.bonus.str, d.stats.str)}
      ${statRow("agi","Ловкость", p.statsBase.agi, d.bonus.agi, d.stats.agi)}
      ${statRow("intu","Интуиция", p.statsBase.intu, d.bonus.intu, d.stats.intu)}
      ${statRow("end","Выносливость", p.statsBase.end, d.bonus.end, d.stats.end)}

      <div class="hr"></div>
      <div><b>${escapeHtml(p.bio)}</b></div>
    </div>

    <div class="card">
      <h3 class="title">Ник</h3>
      <input class="input" id="nick" value="${escapeAttr(p.nick)}" maxlength="16" />
      <div class="row" style="margin-top:10px;">
        <button class="btn" id="saveNick">Сохранить</button>
        <button class="btn" id="reset">Сбросить всё</button>
      </div>
    </div>

    <div class="card">
      <h3 class="title">Экипировка (слоты)</h3>
      ${equipRow("weapon","Оружие")}
      ${equipRow("armor","Броня")}
      ${equipRow("gloves","Перчатки")}
      ${equipRow("amulet","Амулет")}
      <div class="small" style="margin-top:8px;">Нажми “Снять”, чтобы убрать предмет со слота.</div>
    </div>

    <div class="card">
      <h3 class="title">Инвентарь</h3>
      ${renderInventoryList()}
    </div>
  `;

  screen.querySelectorAll("[data-addstat]").forEach(btn=>{
    btn.onclick = ()=>{
      const key = btn.dataset.addstat;
      if(state.player.statPoints <= 0) return;
      state.player.statPoints -= 1;
      state.player.statsBase[key] += 1;
      const dd = computeDerived(state);
      state.player.hp = clamp(state.player.hp, 0, dd.hpMax);
      saveState();
      renderInfo();
    };
  });

  screen.querySelectorAll("[data-unequip]").forEach(btn=>{
    btn.onclick = ()=>{
      const slot = btn.dataset.unequip;
      state.equipped[slot] = null;
      const dd = computeDerived(state);
      state.player.hp = clamp(state.player.hp, 0, dd.hpMax);
      saveState();
      renderInfo();
    };
  });

  screen.querySelectorAll("[data-equip]").forEach(btn=>{
    btn.onclick = ()=>{
      const itemId = btn.dataset.equip;
      const it = ITEM_DB[itemId];
      if(!it) return;
      if(!state.inventory.includes(itemId)) return;
      state.equipped[it.slot] = itemId;
      const dd = computeDerived(state);
      state.player.hp = clamp(state.player.hp, 0, dd.hpMax);
      saveState();
      renderInfo();
    };
  });

  document.getElementById("saveNick").onclick = ()=>{
    const nick = (document.getElementById("nick").value || "").trim() || "АНАР";
    state.player.nick = nick.slice(0,16);
    saveState();
    renderInfo();
  };

  document.getElementById("reset").onclick = ()=>{
    state = structuredClone(defaultState);
    saveState();
    renderCity();
  };
}

// ====== Магазин ======
function renderShop(){
  setBottomBarVisible(true);

  const p = state.player;
  const items = Object.values(ITEM_DB);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Магазин</h2>
      <div>Деньги: <b>${p.money}</b></div>
      <div class="small">Купленные предметы попадают в Инвентарь.</div>
    </div>

    ${items.map(it=>{
      const owned = state.inventory.includes(it.id);
      return `
        <div class="card">
          <div><b>${escapeHtml(it.name)}</b> — ${it.price} 💰</div>
          <div class="small">Слот: ${slotLabel(it.slot)} | ${escapeHtml(bonusesToText(it.bonuses))}</div>
          <div class="row" style="margin-top:10px;">
            <button class="btn" data-buy="${it.id}" ${owned ? "disabled" : ""}>
              ${owned ? "Куплено" : "Купить"}
            </button>
          </div>
        </div>
      `;
    }).join("")}
  `;

  screen.querySelectorAll("[data-buy]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.buy;
      const it = ITEM_DB[id];
      if(!it) return;
      if(state.inventory.includes(id)) return;
      if(p.money < it.price) return alert("Не хватает денег.");

      p.money -= it.price;
      state.inventory.push(id);
      saveState();
      renderShop();
    };
  });
}

// ====== Левел-ап ======
function rewardWin(){
  const p = state.player;
  p.exp += 10;
  p.money += 8;

  while(p.exp >= p.level * 50){
    p.exp -= p.level * 50;
    p.level += 1;
    p.hpMaxBase += 5;
    p.statPoints += 3;

    const d = computeDerived(state);
    p.hp = d.hpMax;

    alert(`Уровень повышен! Теперь уровень ${p.level}. +3 очка статов.`);
  }
}

// ====== Бой ======
function renderFight(){
  setBottomBarVisible(true);

  const p = state.player;

  let inBattle = false;
  let round = 1;
  let selectedHit = null;
  let selectedBlock = null;
  let logLines = [];
  let bot = null;

  function createBot(){
    return { nick:"Бот", hpMax: 28, hp: 28, stats: { str:3, agi:3, intu:2, end:3 } };
  }

  const d0 = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Поле боя</h2>

      <div class="battlefield">
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((p.nick||"A")[0].toUpperCase())}</div>
            <div>
              <div class="fname">${escapeHtml(p.nick)}</div>
              <div class="fsub">Уровень: ${p.level}</div>
            </div>
          </div>
          <div class="hpbar"><div id="phpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="php">${p.hp}</b> / <span id="phpMax">${d0.hpMax}</span></div>
        </div>

        <div class="centerBox" style="text-align:center;">
          <div class="centerTitle" style="text-align:center;">Размен: <span id="roundNum">${round}</span></div>
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
        ${ZONES.map(z=>`<button class="zbtn" data-hit="${z.id}" disabled>Удар: ${z.name}</button>`).join("")}
      </div>
      <div class="card zone">
        <div class="ztitle">Защита</div>
        ${ZONES.map(z=>`<button class="zbtn" data-block="${z.id}" disabled>Блок: ${z.name}</button>`).join("")}
      </div>
    </div>

    <div class="card" id="stepCard">
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

  function refreshDerived(){
    const dd = computeDerived(state);
    phpMaxEl.textContent = dd.hpMax;
    state.player.hp = clamp(state.player.hp, 0, dd.hpMax);
    php.textContent = state.player.hp;
    saveState();
    return dd;
  }

  function setBars(dd){
    phpFill.style.width = clamp(Math.round((state.player.hp/dd.hpMax)*100),0,100) + "%";
    if(bot){
      bhpFill.style.width = clamp(Math.round((bot.hp/bot.hpMax)*100),0,100) + "%";
    }
  }

  function renderFullLog(){
    log.innerHTML = logLines.map(escapeHtml).join("<br>");
  }
  function pushLog(t){
    logLines.unshift(t);
    logLines = logLines.slice(0, 14);
    renderFullLog();
  }

  function enableBattleUI(on){
    screen.querySelectorAll("[data-hit]").forEach(btn=>btn.disabled = !on);
    screen.querySelectorAll("[data-block]").forEach(btn=>btn.disabled = !on);
    stepBtn.disabled = !on;
  }

  function setNewFightEnabled(on){
    newFightBtn.disabled = !on;
  }

  function resetSelections(){
    selectedHit = null;
    selectedBlock = null;
    screen.querySelectorAll("[data-hit]").forEach(b=>b.classList.remove("sel"));
    screen.querySelectorAll("[data-block]").forEach(b=>b.classList.remove("sel"));
  }

  function startBattle(){
    setBottomBarVisible(false);

    const dd = refreshDerived();
    const ps = dd.stats;

    bot = createBot();
    inBattle = true;
    round = 1;
    roundNum.textContent = round;

    resetSelections();
    logLines = [];
    renderFullLog();

    bName.textContent = bot.nick;
    bhp.textContent = bot.hp;
    bhpMaxEl.textContent = bot.hpMax;

    enableBattleUI(true);
    setNewFightEnabled(false);
    setBars(dd);

    pushLog(`Бой начался. (Крит: ${(calcCritChance(ps.intu)*100).toFixed(0)}%, Уклон врага: ${(calcDodgeChance(ps.agi, bot.stats.agi)*100).toFixed(0)}%)`);
  }

  function endBattle(resultText, isWin){
    inBattle = false;
    enableBattleUI(false);
    setBottomBarVisible(true);

    if(isWin) state.player.wins += 1;
    else state.player.losses += 1;

    const dd = refreshDerived();
    state.player.hp = dd.hpMax;
    php.textContent = state.player.hp;
    saveState();
    setBars(dd);

    setNewFightEnabled(true);

    pushLog(resultText);
    pushLog(`Жизнь восстановлена полностью (${dd.hpMax}).`);
  }

  // выбор удар/блок
  screen.querySelectorAll("[data-hit]").forEach(btn=>{
    btn.onclick = ()=>{
      if(!inBattle) return;
      selectedHit = btn.dataset.hit;
      screen.querySelectorAll("[data-hit]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });
  screen.querySelectorAll("[data-block]").forEach(btn=>{
    btn.onclick = ()=>{
      if(!inBattle) return;
      selectedBlock = btn.dataset.block;
      screen.querySelectorAll("[data-block]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  newFightBtn.onclick = ()=>{
    if(inBattle) return;
    startBattle();
  };

  // ===== ХОД =====
  stepBtn.onclick = ()=>{
    if(!inBattle) return;

    if(!selectedHit || !selectedBlock){
      pushLog("Сначала выбери удар и блок.");
      return;
    }

    const dd = refreshDerived();
    const ps = dd.stats;

    const botHit = ZONES[Math.floor(Math.random()*5)].id;
    const botBlock = ZONES[Math.floor(Math.random()*5)].id;

    // ===== ТЫ АТАКУЕШЬ =====
    // 1) блок
    if(selectedHit === botBlock){
      pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. БЛОК.`);
    } else {
      // 2) уклон (ловкость)
      const dodgeChance = calcDodgeChance(ps.agi, bot.stats.agi);
      if(rnd() < dodgeChance){
        pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. УКЛОН!`);
      } else {
        // 3) урон + крит
        let dmg = calcDamage(ps.str);
        const crit = isCrit(ps.intu);
        if(crit) dmg = Math.ceil(dmg * 1.5);

        bot.hp = clamp(bot.hp - dmg, 0, bot.hpMax);
        bhp.textContent = bot.hp;

        pushLog(`Размен ${round}: Ты → ${zoneName(selectedHit)}. ${crit ? "КРИТ " : ""}-${dmg}.`);
      }
    }
    setBars(dd);

    if(bot.hp === 0){
      rewardWin();
      const dd2 = refreshDerived();
      setBars(dd2);
      saveState();
      endBattle("Бой окончен: Победа ✅ (+10 опыта, +8 денег)", true);
      return;
    }

    // ===== БОТ АТАКУЕТ =====
    if(botHit === selectedBlock){
      pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. БЛОК.`);
    } else {
      const dodgeChanceP = calcDodgeChance(bot.stats.agi, ps.agi);
      if(rnd() < dodgeChanceP){
        pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. ТЫ УКЛОНИЛСЯ!`);
      } else {
        let dmg = calcDamage(bot.stats.str);
        const crit = isCrit(bot.stats.intu);
        if(crit) dmg = Math.ceil(dmg * 1.5);

        state.player.hp = clamp(state.player.hp - dmg, 0, dd.hpMax);
        php.textContent = state.player.hp;
        saveState();

        pushLog(`Размен ${round}: Бот → ${zoneName(botHit)}. ${crit ? "КРИТ " : ""}-${dmg}.`);
      }
    }
    setBars(dd);

    if(state.player.hp === 0){
      endBattle("Бой окончен: Поражение ❌", false);
      return;
    }

    round += 1;
    roundNum.textContent = round;
  };

  // init
  const ddInit = computeDerived(state);
  setBars(ddInit);
  enableBattleUI(false);
  setNewFightEnabled(true);
  pushLog("Нажми “Новый бой”, чтобы начать.");
}

// ===== Start =====
go("city");
