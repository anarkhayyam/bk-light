// api.js — позже сюда подключим сервер (логин, комнаты, PvP, синк)
// Сейчас работает в "mock" режиме: ничего не отправляет.

window.API = (() => {
  let baseUrl = ""; // позже сюда поставишь, например: https://your-server.com

  function setBaseUrl(url){ baseUrl = (url || "").trim(); }

  async function ping(){
    if(!baseUrl) return { ok:false, reason:"no_base_url" };
    try{
      const r = await fetch(baseUrl + "/ping", { method:"GET" });
      return { ok: r.ok };
    }catch(e){
      return { ok:false, reason:"network" };
    }
  }

  async function syncSave(saveObj){
    // saveObj — всё состояние игрока/инвентарь/и т.д.
    if(!baseUrl) return { ok:false, reason:"no_base_url" };
    try{
      const r = await fetch(baseUrl + "/sync", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(saveObj)
      });
      if(!r.ok) return { ok:false, reason:"bad_status" };
      const data = await r.json().catch(()=>({}));
      return { ok:true, data };
    }catch(e){
      return { ok:false, reason:"network" };
    }
  }

  return { setBaseUrl, ping, syncSave };
})();
