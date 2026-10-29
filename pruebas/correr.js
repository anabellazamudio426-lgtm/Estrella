/* Pruebas automáticas de Estrella. Se corren con:  node pruebas/correr.js
   No necesitan internet: la búsqueda se prueba con respuestas simuladas. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const raiz = path.join(__dirname, "..");
let ok = 0, mal = 0;
const caso = async (nombre, f) => { try { await f(); ok++; console.log("  ✓ " + nombre); } catch (e) { mal++; console.log("  ✗ " + nombre + "\n      " + e.message); } };
const igual = (a, b, m) => { if (a !== b) throw new Error((m || "") + " esperaba «" + b + "» y obtuve «" + a + "»"); };
const verdad = (c, m) => { if (!c) throw new Error(m || "no se cumplió"); };
const leer = p => fs.readFileSync(path.join(raiz, p), "utf8");
function archivos(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "build", "vista-previa", "lib"].includes(n)) continue;
    const p = path.join(dir, n), s = fs.statSync(p);
    if (s.isDirectory()) archivos(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  console.log("\nSintaxis");
  for (const f of ["app.js", "busqueda.js", "mascota.js", "persona.js", "plataforma.js", "conocimiento.js"])
    await caso("web/" + f + " se puede leer", () => { new vm.Script(leer("web/" + f), { filename: f }); });

  console.log("\nIdentidad");
  const ventana = {}; vm.runInNewContext(leer("web/persona.js"), { window: ventana });
  const P = ventana.AGENTE_PERSONA;
  await caso("se llama Estrella", () => igual(P.nombre, "Estrella"));
  await caso("el saludo es el pedido", () => igual(P.saludo, "¡Holaaa! ⭐💛 Soy Estrella, tu compañera. ¿Qué hacemos hoy?"));
  await caso("colores dorado y crema", () => { igual(P.colores.principal.toUpperCase(), "#D4AF37"); igual(P.colores.acento.toUpperCase(), "#FFF8ED"); });
  await caso("responde en español (el prompt lo pide)", () => verdad(/espa|argent|vos|rioplat/i.test(P.prompt), "el prompt no menciona el idioma"));

  console.log("\nBúsqueda en internet");
  const B = require("../web/busqueda.js");
  await caso("detecta preguntas de clima", () => { verdad(B.pideClima("¿Cómo está el clima en Formosa hoy?"), "no detectó"); igual(B.pideClima("¿Cómo está el clima en Formosa hoy?").ciudad, "formosa"); });
  await caso("clima sin ciudad pide la ciudad", () => igual(B.pideClima("el clima hoy").ciudad, ""));
  await caso("no confunde otras preguntas con clima", () => igual(B.pideClima("explicame la fotosíntesis"), null));
  const falso = async (u) => {
    const j = u.includes("geocoding") ? { results: [{ name: "Formosa", admin1: "Formosa", country: "Argentina", latitude: -26.18, longitude: -58.17 }] }
      : u.includes("open-meteo") ? { current: { temperature_2m: 31.4, apparent_temperature: 34, weather_code: 2, wind_speed_10m: 10 }, daily: { temperature_2m_max: [36], temperature_2m_min: [24], precipitation_probability_max: [20] } }
      : u.includes("list=search") ? { query: { search: [{ title: "Algarrobo" }] } }
      : { extract: "El algarrobo es un árbol de la familia de las leguminosas." };
    return { ok: true, json: async () => j };
  };
  await caso("arma la respuesta del clima", async () => { const t = await B.clima("Formosa", falso); verdad(/31 °C/.test(t) && /Open-Meteo/.test(t), t); });
  await caso("arma el resumen de Wikipedia con su fuente", async () => { const t = await B.wikipedia("algarrobo", falso); verdad(/Algarrobo/.test(t) && /Wikipedia/.test(t), t); });
  await caso("buscarWeb pregunta la ciudad si falta", async () => { const r = await B.buscarWeb("el clima hoy", falso); verdad(r.pregunta, "debía preguntar"); });
  await caso("si el servicio falla, avisa con un error claro", async () => { let c = false; try { await B.wikipedia("x", async () => ({ ok: false, status: 500 })); } catch (e) { c = /500/.test(e.message); } verdad(c); });

  console.log("\nPrivacidad y seguridad");
  await caso("no hay claves secretas en el código", () => {
    const rx = /sk-ant-[A-Za-z0-9_-]{20,}|\bsk_[a-f0-9]{30,}|ghp_[A-Za-z0-9]{30,}/;
    for (const f of archivos(raiz)) { if (/\.(png|jpg|ico|zip|keystore|jar|dll|bin)$/i.test(f)) continue; let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; } if (rx.test(t)) throw new Error("posible clave en " + path.relative(raiz, f)); }
  });
  await caso("la política de red solo permite los 3 servicios de búsqueda", () => {
    const m = leer("web/index.html").match(/connect-src ([^"]+)"/); verdad(m, "no hay connect-src");
    const hosts = m[1].split(/\s+/).filter(x => x.startsWith("http")).sort();
    igual(hosts.join(" "), ["https://api.open-meteo.com", "https://es.wikipedia.org", "https://geocoding-api.open-meteo.com"].sort().join(" "));
  });
  await caso("Android pide solo los permisos esperados", () => {
    const xml = leer("android/app/src/main/AndroidManifest.xml");
    const permitidos = new Set(["INTERNET", "SYSTEM_ALERT_WINDOW", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_SPECIAL_USE", "FOREGROUND_SERVICE_MEDIA_PROJECTION", "POST_NOTIFICATIONS", "RECORD_AUDIO", "RECEIVE_BOOT_COMPLETED", "VIBRATE", "SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM", "WAKE_LOCK", "MODIFY_AUDIO_SETTINGS"]);
    for (const m of xml.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)) verdad(permitidos.has(m[1]), "permiso inesperado: " + m[1]);
  });
  await caso("buscar en internet siempre pide permiso", () => verdad(/permitir\("buscar_web"/.test(leer("web/app.js")), "falta pedir permiso"));
  await caso("la búsqueda en internet arranca apagada", () => verdad(/web: false/.test(leer("web/app.js")), "debe venir apagada"));

  console.log("\nPantalla y ajustes");
  await caso("todos los #id que usa app.js existen en index.html", () => {
    const html = leer("web/index.html"), js = leer("web/app.js");
    const usados = new Set([...js.matchAll(/\$\("#([A-Za-z0-9_]+)"\)/g)].map(m => m[1]));
    const falta = [...usados].filter(i => !new RegExp('id="' + i + '"').test(html));
    verdad(!falta.length, "faltan en index.html: " + falta.join(", "));
  });
  await caso("index.html carga busqueda.js antes que app.js", () => { const h = leer("web/index.html"); verdad(h.indexOf("busqueda.js") > 0 && h.indexOf("busqueda.js") < h.indexOf("app.js")); });
  await caso("hay avisos de costos y botón de borrar todo", () => { const h = leer("web/index.html"); verdad(/Costos, en claro/.test(h) && /id="borrarTodo"/.test(h) && /id="verDatos"/.test(h)); });

  console.log("\n" + ok + " bien, " + mal + " con problemas");
  process.exit(mal ? 1 : 0);
})();
