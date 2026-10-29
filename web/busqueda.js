/* Búsqueda en internet GRATIS y sin clave (opcional, la persona la activa en Ajustes).
   - Clima: Open-Meteo (open-meteo.com)
   - Datos generales: Wikipedia en español
   Solo se envía el texto de la búsqueda (o la ciudad), nunca la pantalla ni los archivos. */
(function (raiz) {
  "use strict";
  const CODIGOS = { 0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado", 45: "con niebla", 48: "con niebla", 51: "con llovizna leve", 53: "con llovizna", 55: "con llovizna fuerte", 61: "con lluvia leve", 63: "con lluvia", 65: "con lluvia fuerte", 71: "con nevadas leves", 73: "con nevadas", 75: "con nevadas fuertes", 80: "con chaparrones", 81: "con chaparrones", 82: "con chaparrones fuertes", 95: "con tormenta", 96: "con tormenta y granizo", 99: "con tormenta y granizo" };
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* ¿Pregunta por el clima? Devuelve { ciudad } (ciudad puede ser "") o null */
  function pideClima(texto) {
    const s = norm(texto).replace(/[¿?!¡]/g, " ").trim();
    if (!/\b(clima|temperatura|pronostico|llover|llueve|va a llover|hace (frio|calor))\b/.test(s)) return null;
    const m = s.match(/\ben\s+([a-z0-9ñ .\-]+?)(?:\s+(?:hoy|manana|ahora|esta (?:tarde|noche|semana))\b.*)?$/);
    let ciudad = m ? m[1].trim() : "";
    if (/^(mi|la|el|este|esta|casa|zona|ciudad)\b/.test(ciudad)) ciudad = "";
    return { ciudad };
  }

  async function json(fetchFn, url) {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error("El servicio respondió " + r.status);
    return await r.json();
  }

  async function clima(ciudad, fetchFn) {
    ciudad = String(ciudad || "").trim();
    if (!ciudad) throw new Error("Falta la ciudad");
    const g = await json(fetchFn, "https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=" + encodeURIComponent(ciudad));
    const lugar = g.results && g.results[0];
    if (!lugar) return "No encontré una ciudad que se llame «" + ciudad + "». ¿La escribís de otra forma?";
    const f = await json(fetchFn, "https://api.open-meteo.com/v1/forecast?latitude=" + lugar.latitude + "&longitude=" + lugar.longitude +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1");
    const c = f.current || {}, d = f.daily || {};
    if (typeof c.temperature_2m !== "number") throw new Error("No pude leer el clima");
    const nombre = [lugar.name, lugar.admin1, lugar.country].filter(Boolean).join(", ");
    let t = "En " + nombre + " ahora hay " + Math.round(c.temperature_2m) + " °C (sensación " + Math.round(c.apparent_temperature) + " °C), " + (CODIGOS[c.weather_code] || "con clima variable") + ".";
    if (d.temperature_2m_max && d.temperature_2m_min) t += " Hoy: mínima " + Math.round(d.temperature_2m_min[0]) + " °C y máxima " + Math.round(d.temperature_2m_max[0]) + " °C.";
    if (d.precipitation_probability_max && typeof d.precipitation_probability_max[0] === "number") t += " Probabilidad de lluvia: " + d.precipitation_probability_max[0] + " %.";
    return t + "\n(Fuente: Open-Meteo)";
  }

  async function wikipedia(consulta, fetchFn) {
    consulta = String(consulta || "").trim();
    if (!consulta) throw new Error("Falta la búsqueda");
    const b = await json(fetchFn, "https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=" + encodeURIComponent(consulta));
    const hit = b.query && b.query.search && b.query.search[0];
    if (!hit) return "No encontré nada sobre eso en Wikipedia.";
    const r = await json(fetchFn, "https://es.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(hit.title.replace(/ /g, "_")));
    const txt = String(r.extract || "").replace(/\s+/g, " ").trim();
    if (!txt) return "Encontré «" + hit.title + "» en Wikipedia, pero sin resumen.";
    const corto = txt.length > 650 ? txt.slice(0, 650).replace(/\s+\S*$/, "") + "…" : txt;
    return "«" + hit.title + "»: " + corto + "\n(Fuente: Wikipedia en español)";
  }

  /* Decide a dónde ir. Devuelve texto, o { pregunta } si falta la ciudad */
  async function buscarWeb(consulta, fetchFn) {
    const c = pideClima(consulta);
    if (c) return c.ciudad ? await clima(c.ciudad, fetchFn) : { pregunta: "¿De qué ciudad querés el clima? Decime, por ejemplo: «clima en Formosa»." };
    return await wikipedia(consulta, fetchFn);
  }

  const api = { pideClima, clima, wikipedia, buscarWeb };
  raiz.AGENTE_BUSQUEDA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
