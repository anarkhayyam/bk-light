const STORAGE_KEY = "antibk_light_save_v4";

const ZONES = [
  { id:"head",  name:"Голова" },
  { id:"chest", name:"Грудь" },
  { id:"belly", name:"Живот" },
  { id:"belt",  name:"Пояс" },
  { id:"legs",  name:"Ноги" },
];

// ====== Предметы (Təsbeh удалён) ======
const ITEM_DB = {
  sword:  { id:"sword",  slot:"weapon", name:"Короткий меч",         price:20, bonuses:{ str:+1 } },
  gloves: { id:"gloves", slot:"gloves", name:"Перчатки бойца",       price:15, bonuses:{ agi:+1 } },
  armor:  { id:"armor",  slot:"armor",  name:"Кольчуга",             price:30, bonuses:{ hpMax:+5 } },
  amulet: { id:"amulet", slot:"amulet", name:"Амулет Наблюдателя",   price:25, bonuses:{ intu:+1 } },
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
  },
  inventory: [],
  equipped: { weapon:null, armor:null, gloves:null, amulet:null },
};

// ====== Utils ======
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function zoneName(id){ return (ZONES.find(z=>z.id===id)?.name) || id; }

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

    if(!Array.isArray(s.inventory)) s.inventory = [];
    if(!s.equipped) s.equipped = structuredClone(defaultState.equipped);

    for(const k of Object.keys(defaultState.equipped)){
      if(!(k in s.equipped)) s.equipped[k] = null;
    }

    // поджать HP по текущему max
    const d = computeDerived(s);
    s.player.hp = clamp(s.player.hp, 0, d.hpMax);

    // если где-то остался tasbeh от старых версий — вычистим
    s.inventory = s.inventory.filter(id => id !== "tasbeh");
    for(const k of Object.keys(s.equipped)){
      if(s.equipped[k] === "tasbeh") s.equipped[k] = null;
    }

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

// Мини-стили: fullwidth-кнопка
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

// ====== Город ======
function slotName(slot){
  const id = state.equipped[slot];
  if(!id) return "—";
  return ITEM_DB[id]?.name || id;
}

function renderCity(){
  const p = state.player;
  const d = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Город</h2>
      <div class="small">Офлайн. Онлайн позже через SYNC.</div>
      <div class="hr"></div>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b> | Деньги: <b>${p.money}</b></div>
      <div>HP: <b>${p.hp}/${d.hpMax}</b></div>
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

// ====== Инфо + статы + экип + инвентарь ======
function slotLabel(slot){
  return ({
    weapon:"Оружие",
    armor:"Броня",
    gloves:"Перчатки",
    amulet:"Амулет"
  }[slot] || slot);
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
  const p = state.player;
  const d = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b> | Деньги: <b>${p.money}</b></div>
      <div>HP: <b>${p.hp}/${d.hpMax}</b> <span class="pill">HPmax база ${p.hpMaxBase} + экип ${d.bonus.hpMax}</span></div>
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

  // +1 статы
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

  // снять
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

  // надеть
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

    // восстановление до фулла при апе
    const d = computeDerived(state);
    p.hp = d.hpMax;

    alert(`Уровень повышен! Теперь уровень ${p.level}. +3 очка статов.`);
  }
}

// ====== Бой ======
function renderFight(){
  const p = state.player;

  // состояние боя
  let inBattle = false;
  let finished = false;
  let round = 1;
  let selectedHit = null;
  let selectedBlock = null;
  let logLines = [];

  // текущий бот создаётся при старте боя
  let bot = null;

  function createBot(){
    return {
      nick:"Бот",
      hpMax: 28,
      hp: 28,
      stats: { str:3, agi:3, intu:2, end:3 }
    };
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

        <!-- CENTER: пусто, только кнопка Новый бой -->
        <div class="centerBox">
          <div class="centerTitle">Раунд: <span id="roundNum">${round}</span></div>
          <div class="roundline">&nbsp;</div>
          <div class="row" style="margin-top:8px; justify-content:center;">
            <button class="btn" id="newFightBtn">Новый бой</button>
          </div>
        </div>

        <div class="fighter">
          <div class="fhead">
            <div class="avatar" id="bAv">B</div>
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

  const bAv = document.getElementById("bAv");
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

  function resetSelections(){
    selectedHit = null;
    selectedBlock = null;
    screen.querySelectorAll("[data-hit]").forEach(b=>b.classList.remove("sel"));
    screen.querySelectorAll("[data-block]").forEach(b=>b.classList.remove("sel"));
  }

  function endBattle(resultText){
    finished = true;
    inBattle = false;
    enableBattleUI(false);

    // авто-фулл хп после боя
    const dd = refreshDerived();
    state.player.hp = dd.hpMax;
    php.textContent = state.player.hp;
    saveState();
    setBars(dd);

    pushLog(resultText);
    pushLog(`Жизнь восстановлена полностью (${dd.hpMax}).`);

    // Новый бой остаётся по центру, с него и начинаем следующий
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

  // Новый бой — старт
  newFightBtn.onclick = ()=>{
    const dd = refreshDerived();

    bot = createBot();
    inBattle = true;
    finished = false;
    round = 1;
    roundNum.textContent = round;

    resetSelections();
    logLines = [];
    renderFullLog();

    // заполняем противника
    bAv.textContent = "B";
    bName.textContent = bot.nick;
    bhp.textContent = bot.hp;
    bhpMaxEl.textContent = bot.hpMax;
    setBars(dd);

    enableBattleUI(true);
    pushLog("Бой начался.");
  };

  // Ход
  stepBtn.onclick = ()=>{
    if(!inBattle) return;

    if(!selectedHit || !selectedBlock){
      pushLog("Сначала выбери удар и блок.");
      return;
    }

    const dd = refreshDerived();

    const botHit = ZONES[Math.floor(Math.random()*5)].id;
    const botBlock = ZONES[Math.floor(Math.random()*5)].id;

    // ты бьёшь
    if(selectedHit === botBlock){
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Бот блокирует.`);
    } else {
      const dmg = 4 + Math.floor(dd.stats.str/2);
      bot.hp = clamp(bot.hp - dmg, 0, bot.hpMax);
      bhp.textContent = bot.hp;
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Попадание (-${dmg}).`);
    }
    setBars(dd);

    if(bot.hp === 0){
      rewardWin();
      const dd2 = refreshDerived();
      setBars(dd2);
      saveState();
      endBattle("Бой окончен: Победа ✅ (+10 опыта, +8 денег)");
      return;
    }

    // бот бьёт
    if(botHit === selectedBlock){
      pushLog(`Раунд ${round}: Бот → ${zoneName(botHit)}. Ты блокируешь.`);
    } else {
      const dmg = 3 + Math.floor(bot.stats.str/2);
      state.player.hp = clamp(state.player.hp - dmg, 0, dd.hpMax);
      php.textContent = state.player.hp;
      saveState();
      pushLog(`Раунд ${round}: Бот → ${zoneName(botHit)}. Попадание (-${dmg}).`);
    }
    setBars(dd);

    if(state.player.hp === 0){
      endBattle("Бой окончен: Поражение ❌");
      return;
    }

    round += 1;
    roundNum.textContent = round;
  };

  // initial bars
  const ddInit = computeDerived(state);
  setBars(ddInit);
  pushLog("Нажми “Новый бой”, чтобы начать.");
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

// ====== Магазин/Инфо требуют ITEM_DB и defaultState уже есть ======

function renderShop(){
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

function renderInfo(){
  const p = state.player;
  const d = computeDerived(state);

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b> | Деньги: <b>${p.money}</b></div>
      <div>HP: <b>${p.hp}/${d.hpMax}</b> <span class="pill">HPmax база ${p.hpMaxBase} + экип ${d.bonus.hpMax}</span></div>
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

// ===== Start =====
go("city");
