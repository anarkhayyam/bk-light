const STORAGE_KEY = "bk_light_save_v2";

const ZONES = [
  { id:"head",   name:"Голова" },
  { id:"chest",  name:"Грудь" },
  { id:"belly",  name:"Живот" },
  { id:"belt",   name:"Пояс" },
  { id:"legs",   name:"Ноги" },
];

const defaultState = {
  player: {
    nick: "АНАР",
    level: 1,
    exp: 0,
    money: 50,
    stats: { str: 3, agi: 3, intu: 3, end: 3 },
    hpMax: 30,
    hp: 30,
    bio: "О себе: АНАР"
  }
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    return JSON.parse(raw);
  }catch(e){
    return structuredClone(defaultState);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();

const screen = document.getElementById("screen");
const netBadge = document.getElementById("netBadge");

function setNetBadge(){
  const online = navigator.onLine;
  netBadge.textContent = online ? "ONLINE" : "OFFLINE";
  netBadge.classList.toggle("online", online);
  netBadge.classList.toggle("offline", !online);
}
window.addEventListener("online", setNetBadge);
window.addEventListener("offline", setNetBadge);
setNetBadge();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>go(btn.dataset.go));
});

function go(where){
  if(where==="fight") return renderFight();
  if(where==="info") return renderInfo();
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
      <h3 class="title">Ник (локально)</h3>
      <input class="input" id="nick" placeholder="Ник" value="${escapeAttr(p.nick)}" />
      <div class="row" style="margin-top:10px;">
        <button class="btn" id="saveNick">Сохранить</button>
        <button class="btn" id="reset">Сбросить</button>
      </div>
      <div class="small" style="margin-top:8px;">Пока офлайн. Потом добавим онлайн-аккаунт.</div>
    </div>
  `;

  // стиль для input (вставим быстро)
  const style = document.createElement("style");
  style.textContent = `.input{width:100%;padding:10px;border-radius:10px;border:1px solid #6b4b2a;background:rgba(0,0,0,.25);color:#f1e2c3;outline:none;}`;
  document.head.appendChild(style);

  document.getElementById("saveNick").onclick = ()=>{
    const nick = document.getElementById("nick").value.trim().slice(0,16) || "АНАР";
    state.player.nick = nick;
    saveState();
    renderInfo();
  };
  document.getElementById("reset").onclick = ()=>{
    state = structuredClone(defaultState);
    saveState();
    renderInfo();
  };
}

function renderFight(){
  const p = state.player;

  // один бой: игрок против бота
  let bot = {
    nick: "Бот",
    hpMax: 28,
    hp: 28,
    stats: { str: 3, agi: 3, intu: 2, end: 3 }
  };

  let selectedHit = null;
  let selectedBlock = null;
  let logLines = [];

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Бой 5×5</h2>
      <div class="small">Выбери 1 зону удара и 1 зону блока. Потом жми “Раунд”.</div>
      <div class="hr"></div>
      <div>${escapeHtml(p.nick)} HP: <b id="php">${p.hp}</b> / ${p.hpMax}</div>
      <div>${escapeHtml(bot.nick)} HP: <b id="bhp">${bot.hp}</b> / ${bot.hpMax}</div>
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
      <div class="hr"></div>
      <div id="log" class="log"></div>
    </div>
  `;

  const php = document.getElementById("php");
  const bhp = document.getElementById("bhp");
  const log = document.getElementById("log");

  function renderLog(){
    log.innerHTML = logLines.map(l=>escapeHtml(l)).join("<br>");
  }
  function pushLog(t){
    logLines.unshift(t);
    logLines = logLines.slice(0, 12);
    renderLog();
  }

  // выбор удара
  screen.querySelectorAll("[data-hit]").forEach(btn=>{
    btn.onclick = ()=>{
      selectedHit = btn.dataset.hit;
      screen.querySelectorAll("[data-hit]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  // выбор блока
  screen.querySelectorAll("[data-block]").forEach(btn=>{
    btn.onclick = ()=>{
      selectedBlock = btn.dataset.block;
      screen.querySelectorAll("[data-block]").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
    };
  });

  document.getElementById("restBtn").onclick = ()=>{
    const gain = 2 + Math.floor(p.stats.end / 4);
    p.hp = Math.min(p.hpMax, p.hp + gain);
    php.textContent = p.hp;
    saveState();
    pushLog(`Ты отдыхаешь: +${gain} HP.`);
  };

  document.getElementById("roundBtn").onclick = ()=>{
    if(!selectedHit || !selectedBlock){
      pushLog("Сначала выбери удар и блок.");
      return;
    }

    // бот выбирает случайно (потом сделаем умнее)
    const botHit = ZONES[Math.floor(Math.random()*ZONES.length)].id;
    const botBlock = ZONES[Math.floor(Math.random()*ZONES.length)].id;

    // ТВОЙ удар
    const yourAttack = resolveAttack(p.stats, selectedHit, botBlock, bot.stats);
    if(yourAttack.blocked){
      pushLog(`Ты бьёшь в ${zoneName(selectedHit)}, но бот блокирует (${zoneName(botBlock)}).`);
    } else {
      bot.hp = Math.max(0, bot.hp - yourAttack.damage);
      bhp.textContent = bot.hp;
      pushLog(`Ты попал в ${zoneName(selectedHit)}: -${yourAttack.damage} HP боту.`);
    }

    // проверка победы
    if(bot.hp === 0){
      pushLog("Победа! +10 опыта, +8 денег.");
      rewardWin(p);
      saveState();
      return;
    }

    // Удар бота
    const botAttack = resolveAttack(bot.stats, botHit, selectedBlock);
    if(botAttack.blocked){
      pushLog(`Бот бьёт в ${zoneName(botHit)}, ты блокируешь (${zoneName(selectedBlock)}).`);
    } else {
      p.hp = Math.max(0, p.hp - botAttack.damage);
      php.textContent = p.hp;
      pushLog(`Бот попал в ${zoneName(botHit)}: -${botAttack.damage} HP тебе.`);
      saveState();
    }

    if(p.hp === 0){
      pushLog("Ты проиграл. Восстановление до полного HP.");
      p.hp = p.hpMax;
      php.textContent = p.hp;
      saveState();
    }
  };

  renderLog();
}

function resolveAttack(attStats, hitZone, defenderBlockZone, defStats){
  // Блок
  const blocked = (hitZone === defenderBlockZone);

  if(blocked){
    return { blocked: true, damage: 0, isCrit:false, isDodge:false };
  }

  // Уклон от ловкости защитника
  const dodgeChance = Math.min(0.30, defStats.agi * 0.02); // до 30%
  const isDodge = Math.random() < dodgeChance;

  if(isDodge){
    return { blocked:false, damage:0, isCrit:false, isDodge:true };
  }

  // Базовый урон
  let dmg = 2 + Math.floor(attStats.str / 2);

  // Крит от интуиции
  const critChance = Math.min(0.35, 0.05 + attStats.intu * 0.02);
  const isCrit = Math.random() < critChance;

  if(isCrit){
    dmg = Math.floor(dmg * 1.7);
  }

  dmg += Math.floor(Math.random()*2);

  return { blocked:false, damage:dmg, isCrit, isDodge:false };
}
  // БК-лайт формулы (потом настроим)
  const blocked = (hitZone === defenderBlockZone);

  // базовый урон от силы
  let dmg = 2 + Math.floor(attStats.str / 2);

  // шанс крита от интуиции
  const critChance = Math.min(0.35, 0.05 + attStats.intu * 0.02); // до 35%
  const isCrit = Math.random() < critChance;

  if(isCrit) dmg = Math.floor(dmg * 1.6);

  // небольшой разброс
  dmg += Math.floor(Math.random()*2); // +0..1

  return { blocked, damage: blocked ? 0 : dmg, isCrit };
}

function rewardWin(p){
  p.exp += 10;
  p.money += 8;

  // уровень каждые 50 exp
  while(p.exp >= p.level * 50){
    p.exp -= p.level * 50;
    p.level += 1;
    p.hpMax += 5;
    p.hp = p.hpMax;

    // пока авто-рост, потом сделаем распределение очков
    p.stats.str += 1;
    p.stats.agi += 1;
    p.stats.intu += 1;
    p.stats.end += 1;

    alert(`Уровень повышен! Теперь уровень ${p.level}`);
  }
}

function zoneName(id){
  const z = ZONES.find(x=>x.id===id);
  return z ? z.name : id;
}

// экранирование
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }

// старт
go("fight");
