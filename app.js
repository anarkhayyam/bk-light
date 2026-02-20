const STORAGE_KEY = "antibk_light_save_v1";

const ZONES = [
  { id:"head",  name:"Голова" },
  { id:"chest", name:"Грудь" },
  { id:"belly", name:"Живот" },
  { id:"belt",  name:"Пояс" },
  { id:"legs",  name:"Ноги" },
];

const defaultState = {
  player: {
    nick: "АНАР",
    level: 1,
    exp: 0,
    money: 50,
    hpMax: 30,
    hp: 30,
    stats: { str:3, agi:3, intu:3, end:3 },
    bio: "О себе: АНАР",
  },
  inventory: [],
};

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    const s = JSON.parse(raw);
    if(!s.player) s.player = structuredClone(defaultState.player);
    if(!s.player.stats) s.player.stats = structuredClone(defaultState.player.stats);
    if(!Array.isArray(s.inventory)) s.inventory = [];
    s.player.hpMax = typeof s.player.hpMax==="number" ? s.player.hpMax : 30;
    s.player.hp = clamp(typeof s.player.hp==="number" ? s.player.hp : s.player.hpMax, 0, s.player.hpMax);
    return s;
  }catch{
    return structuredClone(defaultState);
  }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

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

// Sync заготовка (сейчас без сервера просто покажет статус)
if(syncBtn){
  syncBtn.onclick = async () => {
    // Позже ты просто вызовешь: API.setBaseUrl("https://...");
    // Сейчас baseUrl пустой => покажет, что сервер не задан.
    const res = await window.API.syncSave(state);
    if(res.ok) alert("SYNC OK ✅");
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

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function zoneName(id){ return (ZONES.find(z=>z.id===id)?.name) || id; }

function renderCity(){
  const p = state.player;
  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Город</h2>
      <div class="small">Офлайн. Сохранение в телефоне. Онлайн добавим через SYNC.</div>
      <div class="hr"></div>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b> | Деньги: <b>${p.money}</b></div>
      <div>HP: <b>${p.hp}/${p.hpMax}</b></div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn" id="toFight">На арену</button>
        <button class="btn" id="toShop">В магазин</button>
        <button class="btn" id="toInfo">Инфо</button>
      </div>
    </div>
  `;
  document.getElementById("toFight").onclick = ()=>go("fight");
  document.getElementById("toShop").onclick = ()=>go("shop");
  document.getElementById("toInfo").onclick = ()=>go("info");
}

function renderInfo(){
  const p = state.player;
  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Инфо</h2>
      <div>Ник: <b>${escapeHtml(p.nick)}</b></div>
      <div>Уровень: <b>${p.level}</b> | Опыт: <b>${p.exp}</b></div>
      <div>HP: <b>${p.hp}/${p.hpMax}</b> | Деньги: <b>${p.money}</b></div>
      <div class="hr"></div>
      <div>Сила: <b>${p.stats.str}</b></div>
      <div>Ловкость: <b>${p.stats.agi}</b></div>
      <div>Интуиция: <b>${p.stats.intu}</b></div>
      <div>Выносливость: <b>${p.stats.end}</b></div>
      <div class="hr"></div>
      <div><b>${escapeHtml(p.bio)}</b></div>
    </div>

    <div class="card">
      <h3 class="title">Ник</h3>
      <input class="input" id="nick" value="${escapeAttr(p.nick)}" maxlength="16" />
      <div class="row" style="margin-top:10px;">
        <button class="btn" id="saveNick">Сохранить</button>
        <button class="btn" id="reset">Сбросить</button>
      </div>
      <div class="small" style="margin-top:8px;">Онлайн позже: будет логин + сервер.</div>
    </div>
  `;
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

function renderShop(){
  const p = state.player;

  const items = [
    { id:"tasbeh", name:"Təsbeh", price:25, apply:()=>{ p.stats.intu += 1; } },
    { id:"sword",  name:"Короткий меч", price:20, apply:()=>{ p.stats.str += 1; } },
    { id:"gloves", name:"Перчатки", price:15, apply:()=>{ p.stats.agi += 1; } },
    { id:"armor",  name:"Кольчуга", price:30, apply:()=>{ p.hpMax += 5; p.hp = clamp(p.hp + 5, 0, p.hpMax); } },
  ];

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Магазин</h2>
      <div>Деньги: <b>${p.money}</b></div>
      <div class="small">Покупки сохраняются локально.</div>
    </div>

    ${items.map(it=>`
      <div class="card">
        <div><b>${it.name}</b> — ${it.price} 💰</div>
        <div class="row" style="margin-top:10px;">
          <button class="btn" data-buy="${it.id}">Купить</button>
        </div>
      </div>
    `).join("")}
  `;

  screen.querySelectorAll("[data-buy]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.buy;
      const it = items.find(x=>x.id===id);
      if(!it) return;
      if(state.inventory.includes(id)) return alert("Уже куплено.");
      if(p.money < it.price) return alert("Не хватает денег.");
      p.money -= it.price;
      state.inventory.push(id);
      it.apply();
      saveState();
      renderShop();
    };
  });
}

function rewardWin(){
  const p = state.player;
  p.exp += 10;
  p.money += 8;

  while(p.exp >= p.level * 50){
    p.exp -= p.level * 50;
    p.level += 1;
    p.hpMax += 5;
    p.hp = p.hpMax;
    // пока авто-рост, потом сделаем распределение очков
    p.stats.str += 1; p.stats.agi += 1; p.stats.intu += 1; p.stats.end += 1;
    alert(`Уровень повышен! Теперь уровень ${p.level}`);
  }
}

function renderFight(){
  const p = state.player;

  let bot = {
    nick:"Бот",
    hpMax: 28,
    hp: 28,
    stats: { str:3, agi:3, intu:2, end:3 }
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
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((p.nick||"A")[0].toUpperCase())}</div>
            <div>
              <div class="fname">${escapeHtml(p.nick)}</div>
              <div class="fsub">Уровень: ${p.level}</div>
            </div>
          </div>
          <div class="hpbar"><div id="phpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="php">${p.hp}</b> / ${p.hpMax}</div>
        </div>

        <div class="centerBox">
          <div class="centerTitle">Раунд: <span id="roundNum">${round}</span></div>
          <div id="lastLine" class="roundline">Выбери удар и блок → жми “Раунд”.</div>
          <div class="row" style="margin-top:8px;">
            <button class="btn" id="newFightBtn" style="display:none;">Новый бой</button>
          </div>
        </div>

        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${escapeHtml((bot.nick||"B")[0].toUpperCase())}</div>
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
        ${ZONES.map(z=>`<button class="zbtn" data-hit="${z.id}">Удар: ${z.name}</button>`).join("")}
      </div>
      <div class="card zone">
        <div class="ztitle">Защита</div>
        ${ZONES.map(z=>`<button class="zbtn" data-block="${z.id}">Блок: ${z.name}</button>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="row">
        <button class="btn" id="roundBtn">Раунд</button>
        <button class="btn" id="restBtn">Отдых</button>
      </div>
    </div>

    <div class="card">
      <h3 class="title">Лог боя</h3>
      <div class="logBox"><div id="log" class="log"></div></div>
    </div>
  `;

  const php = document.getElementById("php");
  const bhp = document.getElementById("bhp");
  const phpFill = document.getElementById("phpFill");
  const bhpFill = document.getElementById("bhpFill");
  const roundNum = document.getElementById("roundNum");
  const log = document.getElementById("log");
  const lastLine = document.getElementById("lastLine");
  const newFightBtn = document.getElementById("newFightBtn");

  const roundBtn = document.getElementById("roundBtn");
  const restBtn = document.getElementById("restBtn");

  function setBars(){
    phpFill.style.width = clamp(Math.round((p.hp/p.hpMax)*100),0,100) + "%";
    bhpFill.style.width = clamp(Math.round((bot.hp/bot.hpMax)*100),0,100) + "%";
  }
  function renderFullLog(){
    log.innerHTML = logLines.map(escapeHtml).join("<br>");
  }
  function pushLog(t){
    lastLine.textContent = t;
    logLines.unshift(t);
    logLines = logLines.slice(0, 14);
    renderFullLog();
  }
  function finishBattle(t){
    finished = true;
    roundBtn.disabled = true;
    restBtn.disabled = true;
    newFightBtn.style.display = "inline-block";
    pushLog(t);
  }

  screen.querySelectorAll("[data-hit]").forEach(btn=>{
    btn.onclick = ()=>{
      selectedHit = btn.dataset.hit;
      screen.querySelectorAll("[data-hit]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });
  screen.querySelectorAll("[data-block]").forEach(btn=>{
    btn.onclick = ()=>{
      selectedBlock = btn.dataset.block;
      screen.querySelectorAll("[data-block]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  restBtn.onclick = ()=>{
    if(finished) return;
    const gain = 2 + Math.floor(p.stats.end/4);
    p.hp = clamp(p.hp + gain, 0, p.hpMax);
    php.textContent = p.hp;
    saveState();
    setBars();
    pushLog(`Отдых: +${gain} HP.`);
  };

  roundBtn.onclick = ()=>{
    if(finished) return;
    if(!selectedHit || !selectedBlock){
      pushLog("Сначала выбери удар и блок.");
      return;
    }

    const botHit = ZONES[Math.floor(Math.random()*5)].id;
    const botBlock = ZONES[Math.floor(Math.random()*5)].id;

    // ты бьёшь
    if(selectedHit === botBlock){
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Бот блокирует.`);
    } else {
      const dmg = 4 + Math.floor(p.stats.str/2);
      bot.hp = clamp(bot.hp - dmg, 0, bot.hpMax);
      bhp.textContent = bot.hp;
      pushLog(`Раунд ${round}: Ты → ${zoneName(selectedHit)}. Попадание (-${dmg}).`);
    }
    setBars();

    if(bot.hp === 0){
      rewardWin();
      saveState();
      finishBattle("Бой окончен: Победа ✅ (+10 опыта, +8 денег)");
      return;
    }

    // бот бьёт
    if(botHit === selectedBlock){
      pushLog(`Раунд ${round}: Бот → ${zoneName(botHit)}. Ты блокируешь.`);
    } else {
      const dmg = 3 + Math.floor(bot.stats.str/2);
      p.hp = clamp(p.hp - dmg, 0, p.hpMax);
      php.textContent = p.hp;
      saveState();
      pushLog(`Раунд ${round}: Бот → ${zoneName(botHit)}. Попадание (-${dmg}).`);
    }
    setBars();

    if(p.hp === 0){
      finishBattle("Бой окончен: Поражение ❌ (HP восстановим в новом бою)");
      return;
    }

    round += 1;
    roundNum.textContent = round;
  };

  newFightBtn.onclick = ()=>{
    state.player.hp = state.player.hpMax;
    saveState();
    renderFight();
  };

  setBars();
  pushLog("Готов к бою.");
}

// старт
go("city");
