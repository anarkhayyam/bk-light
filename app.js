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

  let bot = {
    nick: "Бот",
    hpMax: 28,
    hp: 28,
    stats: { str:3, agi:3, intu:2, end:3 }
  };

  let selectedHit = null;
  let selectedBlock = null;

  screen.innerHTML = `
    <div class="card">
      <h2 class="title">Поле боя</h2>
      <div>${state.player.nick} HP: <b id="php">${state.player.hp}</b></div>
      <div>${bot.nick} HP: <b id="bhp">${bot.hp}</b></div>
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
      <button class="btn" id="roundBtn">Раунд</button>
      <div id="log"></div>
    </div>
  `;

  const php = document.getElementById("php");
  const bhp = document.getElementById("bhp");
  const log = document.getElementById("log");

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

  document.getElementById("roundBtn").onclick = ()=>{
    if(!selectedHit || !selectedBlock){
      log.innerHTML = "Выбери удар и блок.";
      return;
    }

    const botHit = ZONES[Math.floor(Math.random()*5)].id;
    const botBlock = ZONES[Math.floor(Math.random()*5)].id;

    if(selectedHit !== botBlock){
      bot.hp -= 5;
      bhp.textContent = bot.hp;
    }

    if(botHit !== selectedBlock){
      state.player.hp -= 4;
      php.textContent = state.player.hp;
    }

    log.innerHTML = `
      Ты: ${selectedHit} | Бот блок: ${botBlock}<br>
      Бот: ${botHit} | Твой блок: ${selectedBlock}
    `;
  };
}

renderFight();
