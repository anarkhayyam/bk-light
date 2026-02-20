const STORAGE_KEY = "bk_light_safe";

const ZONES = [
  { id:"head", name:"Голова" },
  { id:"chest", name:"Грудь" },
  { id:"belly", name:"Живот" },
  { id:"belt", name:"Пояс" },
  { id:"legs", name:"Ноги" },
];

let state = {
  player: {
    nick: "АНАР",
    level: 1,
    hpMax: 30,
    hp: 30,
    stats: { str:3, agi:3, intu:3, end:3 }
  }
};

const screen = document.getElementById("screen");

function renderFight(){

  let p = state.player;

  let bot = {
    nick: "Бот",
    hpMax: 28,
    hp: 28,
    stats: { str:3, agi:3, intu:2, end:3 }
  };

  let selectedHit = null;
  let selectedBlock = null;
  let round = 1;
  let logLines = [];

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Поле боя</h2>

      <div class="battlefield">
        <!-- LEFT -->
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${(p.nick||"A")[0].toUpperCase()}</div>
            <div>
              <div class="fname">${p.nick}</div>
              <div class="fsub">Уровень: ${p.level}</div>
            </div>
          </div>
          <div class="hpbar"><div id="phpFill" class="hpfill"></div></div>
          <div class="fsub">HP: <b id="php">${p.hp}</b> / ${p.hpMax}</div>
        </div>

        <!-- CENTER -->
        <div class="centerBox">
          <div class="centerTitle">Раунд: <span id="roundNum">${round}</span></div>
          <div class="logBox"><div id="log" class="log"></div></div>
        </div>

        <!-- RIGHT -->
        <div class="fighter">
          <div class="fhead">
            <div class="avatar">${(bot.nick||"B")[0].toUpperCase()}</div>
            <div>
              <div class="fname">${bot.nick}</div>
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
        ${ZONES.map(z=>`<button class="zbtn" data-hit="${z.id}">${z.name}</button>`).join("")}
      </div>

      <div class="card zone">
        <div class="ztitle">Защита</div>
        ${ZONES.map(z=>`<button class="zbtn" data-block="${z.id}">${z.name}</button>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="row">
        <button class="btn" id="roundBtn">Раунд</button>
        <button class="btn" id="restBtn">Отдых</button>
      </div>
    </div>
  `;

  const php = document.getElementById("php");
  const bhp = document.getElementById("bhp");
  const phpFill = document.getElementById("phpFill");
  const bhpFill = document.getElementById("bhpFill");
  const roundNum = document.getElementById("roundNum");
  const log = document.getElementById("log");

  function setBars(){
    phpFill.style.width = Math.max(0, Math.min(100, Math.round((p.hp/p.hpMax)*100))) + "%";
    bhpFill.style.width = Math.max(0, Math.min(100, Math.round((bot.hp/bot.hpMax)*100))) + "%";
  }

  function pushLog(t){
    logLines.unshift(t);
    logLines = logLines.slice(0, 10);
    log.innerHTML = logLines.join("<br>");
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

  document.getElementById("restBtn").onclick = ()=>{
    p.hp = Math.min(p.hpMax, p.hp + 3);
    php.textContent = p.hp;
    setBars();
    pushLog("Ты отдыхаешь: +3 HP.");
  };

  document.getElementById("roundBtn").onclick = ()=>{
    if(!selectedHit || !selectedBlock){
      pushLog("Выбери удар и блок.");
      return;
    }

    const botHit = ZONES[Math.floor(Math.random()*5)].id;
    const botBlock = ZONES[Math.floor(Math.random()*5)].id;

    // ты бьёшь
    if(selectedHit === botBlock){
      pushLog(`Раунд ${round}: Ты → ${selectedHit}, бот блокирует.`);
    } else {
      bot.hp = Math.max(0, bot.hp - 5);
      bhp.textContent = bot.hp;
      pushLog(`Раунд ${round}: Ты → ${selectedHit}, попал (-5).`);
    }

    // бот бьёт
    if(botHit === selectedBlock){
      pushLog(`Бот → ${botHit}, ты блокируешь.`);
    } else {
      p.hp = Math.max(0, p.hp - 4);
      php.textContent = p.hp;
      pushLog(`Бот → ${botHit}, попал (-4).`);
    }

    setBars();
    round += 1;
    roundNum.textContent = round;
  };

  setBars();
  pushLog("Готов к бою.");
}
