(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const api = window.agente;
const PLAT = window.AGENTE_PLATAFORMA;
const P = window.AGENTE_PERSONA;
const KB = window.AGENTE_KB || [];
document.documentElement.classList.add(PLAT);
const isla = $("#isla");
AGENTE_MASCOTA.montar();
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = window.AGENTE_PDF_WORKER || "lib/pdf.worker.min.js";
let sample = null; // cerebro de Claude dentro de claude.ai (vista previa)

/* ---------- estado guardado ---------- */
const KEY = "agente.flotante.v1";
const id = () => Math.random().toString(36).slice(2, 9);
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
S = Object.assign({
  sonido: true, hablar: false, rapido: false, observar: false, cada: 60, pos: "centro", siempre: [],
  modelo: "claude-sonnet-5-5", modeloR: "claude-haiku-5-5",
  tareas: [], notas: [], recs: [], chat: [], consejos: []
}, S || {});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
let claves = { claude: false, eleven: false };

/* ---------- tamaño de la ventana = tamaño de la isla ---------- */
let ultimoTam = "";
function medir(){
  const r = isla.getBoundingClientRect();
  let w = Math.ceil(r.width), h = Math.ceil(r.height);
  if (PLAT === "android" && (isla.classList.contains("open") || isla.classList.contains("notify"))) w = 99999;
  const t = w + "x" + h; if (t !== ultimoTam) { ultimoTam = t; api.tamano(w, h); }
}
new ResizeObserver(medir).observe(isla);

/* ---------- mascota ---------- */
const masc = () => $$("[data-m]");
function animo(a){ masc().forEach(m => { m.classList.remove("happy","think","alert","sleep","mira"); if (a) m.classList.add(a); }); }
function hablando(si){ masc().forEach(m => m.classList.toggle("habla", si)); }
setInterval(() => masc().forEach(m => { if (/happy|sleep|mira/.test(m.className)) return; m.classList.add("blink"); setTimeout(() => m.classList.remove("blink"), 140); }), 3800);
document.addEventListener("pointermove", e => masc().forEach(m => {
  const r = m.getBoundingClientRect(); if (!r.width) return;
  const dx = e.clientX - r.left - r.width/2, dy = e.clientY - r.top - r.height/2, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d/200) * 2.6;
  m.style.setProperty("--ex", (dx/d*k).toFixed(1)+"px"); m.style.setProperty("--ey", (dy/d*k).toFixed(1)+"px");
}));
let tSueno; function despertar(){ clearTimeout(tSueno); if (masc()[0]?.classList.contains("sleep")) animo(null); tSueno = setTimeout(() => { if (estadoActual === "listo") animo("sleep"); }, 120000); }
document.addEventListener("pointerdown", despertar); despertar();

/* ---------- estado visible ---------- */
let estadoActual = "listo";
function estado(tipo, t1, t2){
  estadoActual = tipo;
  $$("[data-dot]").forEach(d => d.className = "dot " + ({ ocupado: "busy", espera: "wait" }[tipo] || ""));
  $("#estT1").textContent = t1 || "Acá andamos";
  if (t2) { $("#pillSub").textContent = t2; $("#estT2").textContent = t2; }
  animo(tipo === "ocupado" ? "think" : tipo === "espera" ? "alert" : tipo === "mira" ? "mira" : null);
}

/* ---------- abrir / cerrar ---------- */
let vista = "inicio", permPend = null, trabajando = false;
function abrir(v){ isla.classList.remove("notify"); isla.classList.add("open"); if (v) ir(v); api.foco(true); }
function cerrar(){ if (permPend) return; isla.classList.remove("open"); api.foco(false); }
function ir(v){
  vista = v;
  $$(".vista").forEach(el => el.hidden = el.dataset.v !== v);
  $$(".ib[data-vista]").forEach(b => b.classList.toggle("on", b.dataset.vista === v));
  if (v === "chat") setTimeout(() => { if (PLAT !== "android") $("#txt").focus(); scrollChat(); }, 40);
  if (v === "ajustes") pintarAjustes();
  if (v === "tablero") pintar();
}
$("#pill").onclick = () => abrir(vista === "ajustes" ? "inicio" : vista);
$("#btnCerrar").onclick = cerrar;
$$(".ib[data-vista]").forEach(b => b.onclick = () => ir(b.dataset.vista));
$$(".w[data-ir]").forEach(b => b.onclick = () => ir(b.dataset.ir));
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
$("#aviso").onclick = () => abrir("chat");
api.alAccion(a => {
  if (a === "toggle") isla.classList.contains("open") ? cerrar() : abrir("chat");
  else if (a === "chat") abrir("chat");
  else if (a === "mirar") { abrir("chat"); mirarAhora(); }
  else if (a === "observar-on") ponerObservador(true);
  else if (a === "observar-off") ponerObservador(false);
  else if (a === "blur" || a === "afuera") { if (!permPend && !arrastrando && !eligiendo) cerrar(); }
});

/* ---------- sonido, voz y avisos ---------- */
let actx;
function bip(tipo){
  if (!S.sonido) return;
  try {
    actx = actx || new AudioContext();
    const notas = tipo === "rec" ? [880,660,880,660] : tipo === "perm" ? [520,780] : tipo === "obs" ? [740,1110] : [660,990];
    notas.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i*.13;
      o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t+.02); g.gain.exponentialRampToValueAtTime(.0001, t+.12);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t+.14); });
  } catch {}
}
let audioActual = null;
const limpiarVoz = t => t.replace(/https?:\/\/\S+/g, "el enlace").replace(/[*#_`>]/g, "").replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, "").replace(/\s+/g, " ").trim().slice(0, 900);
async function decir(texto){
  if (!S.hablar || !texto) return;
  callar();
  const t = limpiarVoz(texto); if (!t) return;
  if (claves.eleven) {
    const r = await api.voz(t, P.vozElevenLabs || "");
    if (r && r.mp3) { audioActual = new Audio("data:audio/mpeg;base64," + r.mp3); audioActual.onplay = () => hablando(true); audioActual.onended = audioActual.onpause = () => hablando(false); audioActual.play().catch(() => hablando(false)); return; }
  }
  if (api.hablarLocal) { api.hablarLocal(t); hablando(true); setTimeout(() => hablando(false), Math.min(20000, t.length * 70)); return; }
  try { const u = new SpeechSynthesisUtterance(t); u.lang = "es-AR"; const v = speechSynthesis.getVoices().find(x => /es[-_](AR|419|US|MX)/i.test(x.lang)) || speechSynthesis.getVoices().find(x => /^es/i.test(x.lang)); if (v) u.voice = v; u.onstart = () => hablando(true); u.onend = () => hablando(false); speechSynthesis.speak(u); } catch {}
}
function callar(){ try { audioActual?.pause(); } catch {} try { speechSynthesis.cancel(); } catch {} api.callar?.(); hablando(false); }
let tAviso;
function avisar(t1, t2, tipo){
  bip(tipo); api.notificar(t1, t2 || "");
  if (isla.classList.contains("open")) { estado("listo", t1, t2); return; }
  $("#avisoT1").textContent = t1; $("#avisoT2").textContent = t2 || "";
  isla.classList.add("notify");
  clearTimeout(tAviso); tAviso = setTimeout(() => isla.classList.remove("notify"), tipo === "rec" ? 10000 : tipo === "obs" ? 9000 : 4500);
}

/* ---------- permisos ---------- */
const ACC = {
  crear_tarea: "sumar una tarea", completar_tarea: "marcar una tarea como hecha", borrar_tarea: "borrar una tarea",
  guardar_nota: "guardar una nota", borrar_nota: "borrar una nota", crear_recordatorio: "programar un recordatorio",
  borrar_recordatorio: "cancelar un recordatorio", ver_pantalla: "mirar tu pantalla"
};
function pedirPermiso(accion, detalle){
  if (S.siempre.includes(accion)) return Promise.resolve(true);
  return new Promise(res => {
    $("#permAccion").textContent = "Quiere " + ACC[accion] + ":\n" + detalle;
    $("#permiso").hidden = false; abrir(vista); estado("espera", "Esperando permiso", "Quiere " + ACC[accion]); bip("perm");
    permPend = res;
    const fin = (ok, siempre) => {
      if (siempre && !S.siempre.includes(accion)) { S.siempre.push(accion); save(); }
      $("#permiso").hidden = true; permPend = null; estado("ocupado", "Trabajando", ok ? "Permiso dado" : "Permiso denegado"); res(ok);
    };
    $("#permNo").onclick = () => fin(false); $("#permSi").onclick = () => fin(true); $("#permSiempre").onclick = () => fin(true, true);
  });
}

/* ---------- conocimiento del agente (búsqueda local) ---------- */
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VACIAS = new Set("el la los las un una unos unas de del al a en y o u que se su sus por para con sin es son fue era me te le lo mi tu mas pero como cual cuales donde cuando quien sobre entre hay este esta esto ese esa eso ya muy tambien no si dame decime contame che profe sabes podes queres hace hacer".split(" "));
const tokens = s => norm(s).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !VACIAS.has(w));
const IDX = KB.map(f => { const tt = tokens(f.titulo + " " + f.doc), tx = tokens(f.texto); const tf = {}; tx.forEach(w => tf[w] = (tf[w] || 0) + 1); tt.forEach(w => tf[w] = (tf[w] || 0) + 4); return { tf, len: tx.length + tt.length }; });
const DF = {}; IDX.forEach(d => Object.keys(d.tf).forEach(w => DF[w] = (DF[w] || 0) + 1));
const AVG = IDX.reduce((a, d) => a + d.len, 0) / (IDX.length || 1);
function buscar(consulta, k = 5){
  const q = tokens(consulta); if (!q.length) return [];
  const nums = (norm(consulta).match(/\b\d{1,2}\b/g) || []);
  return IDX.map((d, i) => {
    let s = 0;
    for (const w of q) { const f = d.tf[w] || (w.length > 4 ? Object.keys(d.tf).filter(x => x.startsWith(w.slice(0, -1))).reduce((a, x) => a + d.tf[x], 0) : 0); if (!f) continue;
      const idf = Math.log(1 + (IDX.length - (DF[w] || 1) + .5) / ((DF[w] || 1) + .5)); s += idf * (f * 2.2) / (f + 1.2 * (.25 + .75 * d.len / AVG)); }
    const tit = norm(KB[i].titulo);
    nums.forEach(nm => { if (new RegExp("(instructivo|clase|instr\\.?)\\s*" + nm + "\\b").test(tit)) s += 8; });
    return { i, s };
  }).filter(x => x.s > 0.8).sort((a, b) => b.s - a.s).slice(0, k).map(x => ({ ...KB[x.i], puntaje: +x.s.toFixed(2) }));
}
const fragTexto = f => `[${f.doc} › ${f.titulo}]\n${f.texto}`;

/* ---------- acciones ---------- */
const recTimers = {};
const hora = t => new Date(t).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
async function permitir(acc, det){ if (!await pedirPermiso(acc, det)) throw new Error("La persona denegó el permiso"); }
const acciones = {
  async crear_tarea({ texto }){ texto = String(texto||"").trim(); if (!texto) throw new Error("Falta el texto"); await permitir("crear_tarea", texto); S.tareas.unshift({ id: id(), texto, hecha: false }); save(); pintar(); return { ok: true }; },
  async completar_tarea({ id: x }){ const t = S.tareas.find(v => v.id === String(x)); if (!t) throw new Error("No existe esa tarea"); await permitir("completar_tarea", t.texto); t.hecha = true; save(); pintar(); return { ok: true }; },
  async borrar_tarea({ id: x }){ const t = S.tareas.find(v => v.id === String(x)); if (!t) throw new Error("No existe esa tarea"); await permitir("borrar_tarea", t.texto); S.tareas = S.tareas.filter(v => v !== t); save(); pintar(); return { ok: true }; },
  async guardar_nota({ texto }){ texto = String(texto||"").trim(); if (!texto) throw new Error("Falta el texto"); await permitir("guardar_nota", texto); S.notas.unshift({ id: id(), texto, t: Date.now() }); save(); pintar(); return { ok: true }; },
  async borrar_nota({ id: x }){ const n = S.notas.find(v => v.id === String(x)); if (!n) throw new Error("No existe esa nota"); await permitir("borrar_nota", n.texto); S.notas = S.notas.filter(v => v !== n); save(); pintar(); return { ok: true }; },
  async crear_recordatorio({ texto, minutos }){ texto = String(texto||"").trim(); const min = Number(minutos);
    if (!texto || !(min > 0) || min > 10080) throw new Error("Hace falta texto y minutos entre 0 y 10080");
    await permitir("crear_recordatorio", texto + "  →  en " + fmtMin(min));
    const r = { id: id(), texto, cuando: Date.now() + min*60000 }; S.recs.push(r); save(); programar(r); pintar(); return { ok: true, suena: hora(r.cuando) }; },
  async borrar_recordatorio({ id: x }){ const r = S.recs.find(v => v.id === String(x)); if (!r) throw new Error("No existe ese recordatorio"); await permitir("borrar_recordatorio", r.texto); clearTimeout(recTimers[r.id]); S.recs = S.recs.filter(v => v !== r); save(); pintar(); return { ok: true }; },
  async ver_pantalla(){ await permitir("ver_pantalla", "Sacar una captura de tu pantalla para entender lo que estás haciendo"); return await captura(1400); },
  async buscar_conocimiento({ consulta }){ const r = buscar(String(consulta || ""), 6); return r.length ? r.map(fragTexto).join("\n\n---\n\n") : "No encontré nada sobre eso en lo que sé."; }
};
function fmtMin(m){ if (m < 1) return Math.round(m*60) + " s"; if (m < 60) return Math.round(m) + " min"; const h = Math.floor(m/60), r = Math.round(m%60); return h + " h" + (r ? " " + r + " min" : ""); }
function programar(r){
  clearTimeout(recTimers[r.id]); const ms = r.cuando - Date.now(); if (ms <= 0 || r.sonado) return;
  recTimers[r.id] = setTimeout(() => { r.sonado = true; save(); pintar(); avisar("⏰ " + r.texto, "Recordatorio de " + P.nombre, "rec"); agregarMsg("ag", "⏰ ¡Acordate! " + r.texto); decir("Acordate: " + r.texto); }, Math.min(ms, 2147483000));
}

/* ---------- tablero ---------- */
const esc = s => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
function pintar(){
  const pend = S.tareas.filter(t => !t.hecha).length;
  $("#nT").textContent = S.tareas.length; $("#nN").textContent = S.notas.length; $("#nR").textContent = S.recs.length;
  $("#wTareas").textContent = pend + (pend === 1 ? " pendiente" : " pendientes");
  const prox = S.recs.filter(r => !r.sonado).sort((a,b) => a.cuando - b.cuando)[0];
  $("#wRec").textContent = prox ? "próximo " + hora(prox.cuando) : "ninguno";
  $("#lTareas").innerHTML = S.tareas.map(t => `<li class="item ${t.hecha?"hecha":""}" data-id="${t.id}"><input type="checkbox" ${t.hecha?"checked":""}><div class="c"><span>${esc(t.texto)}</span></div><button class="x">×</button></li>`).join("") || '<li class="vacio">Sin tareas.</li>';
  $("#lNotas").innerHTML = S.notas.map(n => `<li class="item" data-id="${n.id}"><div class="c"><span>${esc(n.texto)}</span></div><button class="x">×</button></li>`).join("") || '<li class="vacio">Sin notas.</li>';
  $("#lRec").innerHTML = S.recs.slice().sort((a,b) => a.cuando - b.cuando).map(r => `<li class="item" data-id="${r.id}"><div class="c"><span>${esc(r.texto)}</span><span class="meta">${hora(r.cuando)} · <span class="cuenta" data-c="${r.cuando}"></span></span></div><button class="x">×</button></li>`).join("");
  $("#vRec").hidden = S.recs.length > 0; cuentas();
}
function cuentas(){ $$(".cuenta").forEach(el => { const ms = +el.dataset.c - Date.now(); if (ms <= 0) { el.textContent = "ya sonó"; return; } const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor(s%3600/60); el.textContent = (h ? h + ":" + String(m).padStart(2,"0") : m) + ":" + String(s%60).padStart(2,"0"); }); }
setInterval(cuentas, 1000);
$("#lTareas").onclick = e => { const li = e.target.closest(".item"); if (!li) return; const t = S.tareas.find(v => v.id === li.dataset.id); if (!t) return;
  if (e.target.matches("input")) { t.hecha = e.target.checked; if (t.hecha) { animo("happy"); setTimeout(() => animo(null), 1200); } }
  if (e.target.matches(".x")) S.tareas = S.tareas.filter(v => v !== t); save(); pintar(); };
$("#lNotas").onclick = e => { if (!e.target.matches(".x")) return; S.notas = S.notas.filter(v => v.id !== e.target.closest(".item").dataset.id); save(); pintar(); };
$("#lRec").onclick = e => { if (!e.target.matches(".x")) return; const i = e.target.closest(".item").dataset.id; clearTimeout(recTimers[i]); S.recs = S.recs.filter(v => v.id !== i); save(); pintar(); };
$$("form.add").forEach(f => f.onsubmit = e => { e.preventDefault(); const inp = f.querySelector("input"), v = inp.value.trim(); if (!v) return;
  if (f.dataset.tipo === "tarea") S.tareas.unshift({ id: id(), texto: v, hecha: false }); else S.notas.unshift({ id: id(), texto: v, t: Date.now() }); inp.value = ""; save(); pintar(); });

/* ---------- chat ---------- */
const msgs = $("#msgs"), txt = $("#txt");
function scrollChat(){ requestAnimationFrame(() => msgs.scrollTop = msgs.scrollHeight); }
function burbuja(rol, texto, adj){
  const el = document.createElement("div"); el.className = "m " + rol;
  (adj || []).forEach(a => { const s = document.createElement("span"); s.className = "adj"; s.textContent = "📎 " + a; el.appendChild(s); el.appendChild(document.createElement("br")); });
  el.appendChild(document.createTextNode(texto)); msgs.appendChild(el); scrollChat(); return el;
}
function agregarMsg(rol, texto, adj){ const el = burbuja(rol, texto, adj); S.chat.push({ r: rol, t: texto, a: adj || [] }); S.chat = S.chat.slice(-40); save(); return el; }
function guardarResp(texto){ S.chat.push({ r: "ag", t: texto, a: [] }); S.chat = S.chat.slice(-40); save(); }
function pintarChat(){ msgs.innerHTML = ""; if (!S.chat.length) burbuja("ag", P.saludo + " 🤝"); S.chat.forEach(c => burbuja(c.r, c.t, c.a)); }
const SUG = (P.sugerencias && P.sugerencias.length ? P.sugerencias : ["¿Qué sabés hacer?", "¿Qué estoy haciendo en pantalla?", "Recordame tomar agua en 20 minutos", "¿Qué tengo pendiente?", "Anotá: una idea"]);
$("#sugeridas").innerHTML = SUG.map(s => `<button>${esc(s)}</button>`).join("");
$("#sugeridas").onclick = e => { if (e.target.tagName !== "BUTTON") return; txt.value = e.target.textContent; if (/pantalla/i.test(txt.value)) { conPantalla = true; pintarConPantalla(); } enviar(); };
function autoAlto(){ txt.style.height = "auto"; txt.style.height = Math.min(110, txt.scrollHeight) + "px"; }
txt.oninput = autoAlto;
txt.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && PLAT !== "android") { e.preventDefault(); enviar(); } };
$("#send").onclick = enviar;
let conPantalla = false;
function pintarConPantalla(){ $("#btnConPantalla").classList.toggle("activo", conPantalla); txt.placeholder = conPantalla ? "Preguntá sobre lo que hay en tu pantalla…" : "Escribile a " + P.nombre + "…"; }
$("#btnConPantalla").onclick = () => { conPantalla = !conPantalla; pintarConPantalla(); };
$("#btnMirar").onclick = mirarAhora; $("#wMirar").onclick = () => { ir("chat"); mirarAhora(); };
function mirarAhora(){ ir("chat"); conPantalla = true; pintarConPantalla(); if (!txt.value.trim()) txt.value = "Mirá mi pantalla: ¿qué estoy haciendo y en qué me das una mano?"; enviar(); }

/* micrófono (Android) */
if (api.escuchar) {
  $("#btnMic").hidden = false;
  $("#btnMic").onclick = () => {
    $("#btnMic").classList.add("activo"); estado("ocupado", "Escuchando", "Te escucho…"); animo("alert");
    api.escuchar((tipo, texto) => {
      if (tipo === "parcial") { txt.value = texto; autoAlto(); return; }
      $("#btnMic").classList.remove("activo");
      if (tipo === "final" && texto) { txt.value = texto; autoAlto(); enviar(); }
      else estado("listo", "Acá andamos", tipo === "error" ? "No te escuché bien, probá de nuevo." : "Listo");
    });
  };
}

/* ---------- archivos ---------- */
let adjuntos = [], arrastrando = false, eligiendo = false;
const fileIn = $("#file");
[$("#btnAdjuntar"), $("#btnAdj2")].forEach(b => b.onclick = () => { eligiendo = true; fileIn.click(); setTimeout(() => eligiendo = false, 4000); });
fileIn.onchange = () => { eligiendo = false; recibir([...fileIn.files]); fileIn.value = ""; };
let dragN = 0;
window.addEventListener("dragenter", e => { e.preventDefault(); dragN++; arrastrando = true; isla.classList.remove("notify"); isla.classList.add("open","dragging"); });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("dragleave", () => { dragN = Math.max(0, dragN-1); if (!dragN) { isla.classList.remove("dragging"); arrastrando = false; } });
window.addEventListener("drop", e => { e.preventDefault(); dragN = 0; arrastrando = false; isla.classList.remove("dragging"); if (e.dataTransfer.files.length) recibir([...e.dataTransfer.files]); });
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); recibir(f); } });
const leerB64 = f => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = mal; r.readAsDataURL(f); });
async function recibir(files){
  abrir("chat");
  for (const f of files.slice(0, 5)) {
    const a = { nombre: f.name || "archivo", texto: "", img: null, tipo: f.type };
    try {
      if (/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) a.img = await leerB64(f);
      else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) { estado("ocupado", "Leyendo el PDF", f.name); a.texto = await leerPDF(f); }
      else if (f.size < 3e6) a.texto = await f.text();
    } catch {}
    adjuntos.push(a);
  }
  estado("listo", "Acá andamos", files.length + (files.length === 1 ? " archivo listo" : " archivos listos"));
  $("#adjuntos").innerHTML = adjuntos.map((a, i) => `<span class="chip"><span>${a.img ? "🖼" : "📄"} ${esc(a.nombre)}</span><button data-i="${i}">×</button></span>`).join("");
  if (!txt.value) txt.value = files.length === 1 ? "Resumime este archivo" : "Resumime estos archivos";
}
$("#adjuntos").onclick = e => { if (e.target.dataset.i) { adjuntos.splice(+e.target.dataset.i, 1); e.target.parentElement.remove(); } };
async function leerPDF(f){
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; let out = "";
  for (let p = 1; p <= Math.min(doc.numPages, 40) && out.length < 50000; p++) { const c = await (await doc.getPage(p)).getTextContent(); out += "\n[pág. " + p + "] " + c.items.map(i => i.str).join(" "); }
  return out.trim();
}

/* ---------- ojos ---------- */
async function captura(max, comparar){
  estado("mira", "Mirando tu pantalla", "Sacando una captura…");
  const c = await api.pantalla({ max, comparar });
  if (!c || c.error) throw new Error(c?.error || "No pude mirar la pantalla.");
  return c;
}
const bloqueImagen = c => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: c.jpeg } });
const textoVentanas = c => c.ventanas?.length ? "Ventanas abiertas: " + c.ventanas.join(" | ") : (c.app ? "App en primer plano: " + c.app : "");

/* ---------- cerebro con Claude ---------- */
function pintarCerebro(){ $("#brain").innerHTML = "Cerebro: <b>" + (claves.claude || sample ? "Claude" : "local") + "</b>"; }
const TOOLS = [
  { name: "buscar_conocimiento", description: "Busca en la base de conocimiento de " + P.nombre + " (" + (P.temas || "lo que sabe el agente") + "). Devuelve los fragmentos más relevantes. Usala antes de decir que algo no está.", input_schema: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"] } },
  { name: "crear_tarea", description: "Suma una tarea pendiente. La app pide permiso.", input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
  { name: "completar_tarea", description: "Marca como hecha una tarea por id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "borrar_tarea", description: "Borra una tarea por id. Solo si lo piden.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "guardar_nota", description: "Guarda una nota de texto (ideas, consignas, prompts, resúmenes).", input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
  { name: "borrar_nota", description: "Borra una nota por id. Solo si lo piden.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "crear_recordatorio", description: "Programa un aviso con sonido y notificación dentro de N minutos. Si piden una hora concreta, calculá los minutos desde la hora actual.", input_schema: { type: "object", properties: { texto: { type: "string" }, minutos: { type: "number" } }, required: ["texto","minutos"] } },
  { name: "borrar_recordatorio", description: "Cancela un recordatorio por id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "ver_pantalla", description: "Saca una captura de la pantalla (y en la compu, los títulos de las ventanas). Usala cuando la pregunta depende de lo que la persona está haciendo y no te mandaron captura.", input_schema: { type: "object", properties: {} } }
];
function sistema(consulta){
  const rel = buscar(consulta, 5);
  const dinamico = `Fecha y hora: ${new Date().toLocaleString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Dispositivo: ${PLAT === "android" ? "celular Android" : "computadora"}.
Tareas: ${JSON.stringify(S.tareas.slice(0,30).map(t => ({ id: t.id, texto: t.texto, hecha: t.hecha })))}
Notas: ${JSON.stringify(S.notas.slice(0,20).map(n => ({ id: n.id, texto: n.texto.slice(0,200) })))}
Recordatorios: ${JSON.stringify(S.recs.filter(r => !r.sonado).map(r => ({ id: r.id, texto: r.texto, hora: hora(r.cuando) })))}
BASE DE CONOCIMIENTO — fragmentos relevantes para este mensaje (si no alcanzan, usá buscar_conocimiento):
${rel.length ? rel.map(fragTexto).join("\n\n---\n\n") : "(ninguno coincide; buscá si la pregunta toca lo que sabés)"}`;
  return [{ type: "text", text: P.prompt, cache_control: { type: "ephemeral" } }, { type: "text", text: dinamico }];
}
const ERRORES = { sin_clave: "Me falta la clave de Claude: cargala en Ajustes.", sin_conexion: "No hay conexión. Sigo con lo que tengo guardado." };
function mensajeError(r){ if (ERRORES[r.error]) return ERRORES[r.error]; if (r.status === 401) return "La clave de Claude no es válida. Revisala en Ajustes."; if (r.status === 429) return "Estoy saturado, probá en un ratito."; if (r.status === 529 || r.status >= 500) return "Claude está ocupado, probá de nuevo."; return "Error de Claude: " + r.error; }

async function conClaude(texto, adj, cap){
  const bloques = [];
  if (cap) { bloques.push(bloqueImagen(cap)); const tv = textoVentanas(cap); if (tv) bloques.push({ type: "text", text: tv }); }
  adj.filter(a => a.img).slice(0, 4).forEach(a => bloques.push({ type: "image", source: { type: "base64", media_type: a.tipo === "image/jpg" ? "image/jpeg" : a.tipo, data: a.img } }));
  let t = texto || "Mirá esto.";
  adj.filter(a => !a.img).forEach(a => { t += `\n\n<archivo nombre="${a.nombre}">\n${a.texto ? a.texto.slice(0, 40000) : "(no pude leer este archivo)"}\n</archivo>`; });
  bloques.push({ type: "text", text: t });
  const hist = S.chat.slice(-13, -1).filter(c => c.t).map(c => ({ role: c.r === "yo" ? "user" : "assistant", content: c.t }));
  while (hist.length && hist[0].role !== "user") hist.shift();
  const mensajes = []; hist.forEach(m => { const u = mensajes[mensajes.length-1]; if (u && u.role === m.role) u.content += "\n" + m.content; else mensajes.push({ ...m }); });
  if (mensajes.length && mensajes[mensajes.length-1].role === "user") mensajes.push({ role: "assistant", content: "(sigo)" });
  mensajes.push({ role: "user", content: bloques });
  const sys = sistema(texto + " " + S.chat.slice(-3).map(c => c.t).join(" "));
  const el = burbuja("ag", "…"); let salida = "";
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    estado("ocupado", "Pensando", "Pensando…");
    const r = await api.claude({ model: S.rapido ? S.modeloR : S.modelo, max_tokens: 1500, system: sys, tools: TOOLS, messages: mensajes });
    if (!r || r.error) { if (r?.error === "sin_conexion") { el.remove(); return null; } salida += (salida ? "\n" : "") + mensajeError(r || { error: "sin respuesta" }); break; }
    mensajes.push({ role: "assistant", content: r.content });
    const textos = r.content.filter(b => b.type === "text").map(b => b.text.trim()).filter(Boolean);
    if (textos.length) { salida += (salida ? "\n\n" : "") + textos.join("\n"); el.lastChild.textContent = salida; scrollChat(); }
    if (r.stop_reason !== "tool_use") break;
    const resultados = [];
    for (const b of r.content.filter(b => b.type === "tool_use")) {
      try {
        if (b.name === "buscar_conocimiento") estado("ocupado", "Buscando en tu material", String(b.input?.consulta || ""));
        const out = await acciones[b.name](b.input || {});
        if (b.name === "ver_pantalla") resultados.push({ type: "tool_result", tool_use_id: b.id, content: [bloqueImagen(out), { type: "text", text: textoVentanas(out) || "Captura lista." }] });
        else resultados.push({ type: "tool_result", tool_use_id: b.id, content: typeof out === "string" ? out : JSON.stringify(out) });
      } catch (e) { resultados.push({ type: "tool_result", tool_use_id: b.id, content: "Error: " + e.message, is_error: true }); }
    }
    mensajes.push({ role: "user", content: resultados });
  }
  salida = salida || "Listo.";
  el.lastChild.textContent = salida; guardarResp(salida); scrollChat();
  return salida;
}

/* vista previa en claude.ai: Claude sin clave, con las mismas herramientas (salvo mirar la pantalla) */
async function conSample(texto, adj){
  const sys = sistema(texto + " " + S.chat.slice(-3).map(c => c.t).join(" ")).map(b => b.text).join("\n\n");
  let t = texto || "Mirá esto.";
  adj.filter(a => !a.img).forEach(a => { t += `\n\n<archivo nombre="${a.nombre}">\n${a.texto ? a.texto.slice(0, 30000) : "(no pude leer este archivo)"}\n</archivo>`; });
  if (adj.some(a => a.img)) t += "\n\n(La persona adjuntó imágenes que en esta vista previa no puedo ver.)";
  const turnos = [{ role: "user", content: sys + "\n\nEsta es una vista previa en el navegador: acá no podés mirar la pantalla ni flotar sobre otras apps; eso lo hace la app instalada." }];
  const hist = S.chat.slice(-11, -1).filter(c => c.t).map(c => ({ role: c.r === "yo" ? "user" : "assistant", content: c.t }));
  hist.forEach(m => turnos.push(m));
  turnos.push({ role: "user", content: t });
  const tools = TOOLS.filter(x => x.name !== "ver_pantalla").map(x => ({ name: x.name, description: x.description, inputSchema: x.input_schema, execute: async inp => { if (x.name === "buscar_conocimiento") estado("ocupado", "Buscando en tu material", String(inp?.consulta || "")); return await acciones[x.name](inp || {}); } }));
  const el = burbuja("ag", "…");
  estado("ocupado", "Pensando", "Pensando…");
  try {
    const opts = { modelTier: S.rapido ? "quick" : "default", onText: ({ text }) => { el.lastChild.textContent = text; scrollChat(); } };
    const lim = await sample.limits().catch(() => null);
    if (lim?.tools) opts.tools = tools; else opts.cache = false;
    const { text } = await sample(turnos, opts);
    el.lastChild.textContent = text.trim(); guardarResp(text.trim()); return text.trim();
  } catch (e) {
    if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled"].includes(e?.code)) { sample = null; pintarCerebro(); el.remove(); return null; }
    const m = (e?.text ? e.text + "\n" : "") + (e?.code === "rate_limited" ? "Estoy saturado, probá en un ratito." : "Se cortó la conexión, probá de nuevo.");
    el.lastChild.textContent = m; guardarResp(m); return m;
  }
}

async function enviar(){
  if (trabajando) return;
  callar();
  const texto = txt.value.trim(); if (!texto && !adjuntos.length) return;
  const adj = adjuntos; adjuntos = []; $("#adjuntos").innerHTML = ""; txt.value = ""; autoAlto();
  const usarPantalla = conPantalla; conPantalla = false; pintarConPantalla();
  agregarMsg("yo", (usarPantalla ? "👁 " : "") + (texto || "(archivo)"), adj.map(a => a.nombre));
  trabajando = true; let resp = null;
  try {
    let cap = null;
    if (usarPantalla) { try { cap = await captura(1400); } catch (e) { agregarMsg("ag", "No pude mirar la pantalla: " + e.message); } }
    if (claves.claude) resp = await conClaude(texto, adj, cap);
    else if (sample) resp = await conSample(texto, adj);
    if (resp === null) resp = await local(texto, adj, cap);
  } catch (e) { agregarMsg("ag", "Uy, algo falló: " + e.message); }
  trabajando = false;
  if (resp) { estado("listo", "Acá andamos", resp.slice(0, 110)); if (!isla.classList.contains("open")) avisar(P.nombre + " respondió", resp.slice(0, 90)); else bip(); animo("happy"); setTimeout(() => { if (estadoActual === "listo") animo(null); }, 1400); decir(resp); }
  else estado("listo", "Acá andamos", "Listo");
}

/* ---------- cerebro local: el agente sin clave ni conexión ---------- */
async function local(texto, adj, cap){
  const el = burbuja("ag", "…"); await new Promise(r => setTimeout(r, 300));
  let r; try { r = await entender(texto, adj, cap); } catch (e) { r = /deneg/.test(e.message) ? "Dale, no lo hago. 🤝" : "Uy: " + e.message; }
  el.lastChild.textContent = r; guardarResp(r); return r;
}
const cap1 = x => { x = String(x).trim().replace(/[.\s]+$/, ""); return x.charAt(0).toUpperCase() + x.slice(1); };
async function entender(t, adj, cap){
  const s = norm(t).trim();
  if (cap || /que estoy haciendo|que tengo abierto|ventanas abiertas/.test(s)) {
    const c = cap || await captura(800); const v = c.ventanas || [];
    return (v.length ? "Mirá, tenés abierto:\n" + v.slice(0, 10).map(x => "- " + x).join("\n") : c.app ? "Estás en: " + c.app : "Saqué la captura, pero no veo nombres de ventanas.") + "\n\nPara entender la imagen de tu pantalla necesito la clave de Claude (Ajustes).";
  }
  if (adj.length) return adj.map(a => a.img ? `«${a.nombre}»: es una imagen; sin Claude no la puedo describir.` : !a.texto ? `«${a.nombre}»: no pude leerlo.` : `«${a.nombre}»: ${a.texto.trim().split(/\s+/).length} palabras. Arranca así: ${(a.texto.replace(/\s+/g, " ").match(/[^.!?]+[.!?]/g) || [a.texto.slice(0, 200)]).slice(0, 2).join(" ").slice(0, 260).trim()}`).join("\n\n");
  let m;
  if ((m = s.match(/recorda(?:me|rme)?\s+(?:que\s+)?(.+?)\s+en\s+(\d+(?:[.,]\d+)?)\s*(seg|segundos?|min|minutos?|m|h|horas?|hs)\b/))) {
    const n = parseFloat(m[2].replace(",", ".")), u = m[3][0], min = u === "h" ? n*60 : u === "s" ? n/60 : n;
    const o = t.match(/record[aá](?:me|rme)?\s+(?:que\s+)?(.+?)\s+en\s+\d/i);
    const out = await acciones.crear_recordatorio({ texto: cap1(o ? o[1] : m[1]), minutos: min }); return `Dale que va: te aviso a las ${out.suena}. ⏰`;
  }
  if ((m = t.match(/^\s*(?:anot[aá]|guard[aá]|nota)\s*:?\s*(?:que\s+)?(.+)/i))) { await acciones.guardar_nota({ texto: cap1(m[1]) }); return "Anotado. ✍️"; }
  if ((m = t.match(/^\s*(?:tarea|agreg[aá]\s+(?:la\s+)?tarea|sum[aá]\s+(?:la\s+)?tarea)\s*:?\s*(.+)/i))) { await acciones.crear_tarea({ texto: cap1(m[1]) }); return "Sumada a tus tareas. 🎯"; }
  if (/pendiente|mis tareas|ver tareas/.test(s)) { const p = S.tareas.filter(x => !x.hecha), rr = S.recs.filter(x => !x.sonado); if (!p.length && !rr.length) return "No tenés nada pendiente. ¡A disfrutar! ✨"; return (p.length ? "Tareas:\n" + p.map(x => "- " + x.texto).join("\n") : "Sin tareas.") + (rr.length ? "\n\nRecordatorios:\n" + rr.map(x => "- " + x.texto + " (" + hora(x.cuando) + ")").join("\n") : ""); }
  if (/que hora/.test(s)) return "Son las " + hora(Date.now()) + ".";
  if (/que dia|que fecha/.test(s)) return "Hoy es " + new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ".";
  const ex = s.replace(/^(calcula|cuanto es|cuanto da)\s*/, "").replace(/\?/g, "").replace(/x/g, "*").replace(/,/g, ".").replace(/\s/g, "");
  if (/^[\d+\-*/().%^]+$/.test(ex) && /\d/.test(ex) && /[+\-*/%^]/.test(ex)) { try { const v = Function('"use strict";return (' + ex.replace(/\^/g, "**").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)") + ")")(); if (isFinite(v)) return "Da " + (+v.toFixed(6)).toLocaleString("es-AR") + "."; } catch {} }
  if ((/^(hola|buenas|buen dia|che)\b/.test(s) || s.startsWith(norm(P.nombre))) && s.length < 25) return P.saludo;
  if (/gracias/.test(s) && s.length < 30) return "¡De nada! Acá arriba estoy. 🤝";
  if (/que (podes|sabes) hacer|quien sos|como te ves/.test(s)) return "Soy " + P.nombre + ": " + P.descripcion + "\nTambién floto arriba de la pantalla, te anoto tareas y notas, te recuerdo cosas y miro tu pantalla si me das permiso.";
  const r = buscar(t, 3);
  if (r.length) {
    const f = r[0], frases = f.texto.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) || [f.texto];
    let cuerpo = ""; for (const fr of frases) { if ((cuerpo + fr).length > 700) break; cuerpo += fr; }
    const otros = r.slice(1).map(x => "«" + x.titulo + "»").join(" y ");
    return `Mirá, en tu material (${f.doc} › ${f.titulo}) dice:\n\n${cuerpo.trim() || f.texto.slice(0, 700)}${otros ? "\n\nTambién tiene que ver con " + otros + "." : ""}\n\n(Ahora respondo con lo que tengo guardado; con la clave de Claude te lo armo a medida.)`;
  }
  return "Eso no lo tengo en lo que guardé, y sin la clave de Claude no te quiero inventar nada. Probá preguntarme sobre " + (P.temas || "lo que sé") + ", o cargá la clave en Ajustes y lo pensamos juntos. 🤝";
}

/* ---------- modo observador ---------- */
let tObs = null, observando = false;
function ponerObservador(si){
  if (si && !claves.claude) { abrir("ajustes"); estado("listo", "Falta la clave", "El observador necesita la clave de Claude para entender tu pantalla."); si = false; }
  S.observar = !!si; save(); isla.classList.toggle("observando", S.observar); api.observando(S.observar);
  $("#wObsTxt").textContent = S.observar ? "mirando cada " + fmtMin(S.cada/60) : "apagado";
  clearInterval(tObs); if (S.observar) { tObs = setInterval(observar, S.cada * 1000); setTimeout(observar, 4000); }
  $("#optObs").checked = S.observar;
}
async function observar(){
  if (!S.observar || observando || trabajando || permPend || isla.classList.contains("open")) return;
  observando = true;
  try {
    const c = await api.pantalla({ max: 1100, comparar: true, silencioso: true });
    if (!c || c.error || c.cambio < 0.06) return;
    const previos = S.consejos.slice(-4).join(" | ") || "ninguno";
    const r = await api.claude({ model: S.modeloR, max_tokens: 160,
      system: `Sos ${P.nombre}, ${P.descripcion} Mirás de reojo la pantalla de la persona para darle una mano. Rioplatense, voseo, cálido y breve. Ignorá la isla de arriba (sos vos). Respondé SOLO con un consejo o dato útil de máximo 22 palabras si ves algo concreto en lo que ayudar: un error en pantalla, un formulario, algo repetitivo, algo que se puede mejorar. Si no hay nada valioso, respondé exactamente: NADA. No repitas consejos ya dados: ${previos}`,
      messages: [{ role: "user", content: [bloqueImagen(c), { type: "text", text: textoVentanas(c) || "Pantalla actual." }] }] });
    if (!r || r.error) return;
    const t = (r.content || []).filter(b => b.type === "text").map(b => b.text).join(" ").trim();
    if (!t || /^NADA\b/i.test(t)) return;
    S.consejos.push(t); S.consejos = S.consejos.slice(-10);
    S.chat.push({ r: "obs", t: "👁 " + t, a: [] }); S.chat = S.chat.slice(-40); save(); burbuja("obs", "👁 " + t);
    avisar("👁 " + P.nombre + " vio algo", t, "obs");
  } catch {} finally { observando = false; if (estadoActual === "mira") estado("listo", "Acá andamos"); }
}
$("#wObs").onclick = () => ponerObservador(!S.observar);

/* ---------- ajustes ---------- */
async function pintarAjustes(){
  $("#optPos").value = S.pos; $("#optObs").checked = S.observar; $("#optCada").value = String(S.cada); $("#optHablar").checked = S.hablar;
  $("#optRapido").checked = S.rapido; $("#optSonido").checked = S.sonido; $("#optModelo").value = S.modelo; $("#optModeloR").value = S.modeloR;
  const ini = await api.inicioEstado(); if (ini !== null) $("#optInicio").checked = ini;
  $("#claveOk").innerHTML = claves.claude ? '<span class="ok">✓ guardada</span>' : "";
  $("#claveVozOk").innerHTML = claves.eleven ? '<span class="ok">✓ guardada</span>' : "";
  $("#listaPerm").innerHTML = S.siempre.map(a => `<span>${esc(ACC[a] || a)}</span>`).join("") || '<small>ninguno</small>';
}
async function guardarClave(tipo, el){ const v = el.value; el.value = ""; claves = await api.claveGuardar(tipo, v); pintarCerebro(); pintarAjustes(); }
$("#optClave").onchange = async e => { await guardarClave("claude", e.target); estado("listo", "Acá andamos", claves.claude ? "¡Listo! Ahora pienso con Claude. 🚀" : "Clave borrada: uso lo que tengo guardado."); };
$("#optClaveVoz").onchange = async e => { await guardarClave("eleven", e.target); if (claves.eleven) { S.hablar = true; save(); $("#optHablar").checked = true; decir("¡Hola! Ahora hablo con mi voz."); } };
$("#optHablar").onchange = e => { S.hablar = e.target.checked; save(); if (S.hablar) decir("Dale que va, ahora te hablo."); else callar(); };
$("#optPos").onchange = e => { S.pos = e.target.value; save(); api.posicion(S.pos); };
$("#optObs").onchange = e => ponerObservador(e.target.checked);
$("#optCada").onchange = e => { S.cada = +e.target.value; save(); if (S.observar) ponerObservador(true); };
$("#optRapido").onchange = e => { S.rapido = e.target.checked; save(); };
$("#optSonido").onchange = e => { S.sonido = e.target.checked; save(); };
$("#optInicio").onchange = async e => { const r = await api.inicioPoner(e.target.checked); if (r !== null) e.target.checked = r; };
$("#optModelo").onchange = e => { S.modelo = e.target.value.trim() || "claude-sonnet-5-5"; save(); };
$("#optModeloR").onchange = e => { S.modeloR = e.target.value.trim() || "claude-haiku-5-5"; save(); };
$("#borrarPerm").onclick = () => { S.siempre = []; save(); pintarAjustes(); };
$("#borrarChat").onclick = () => { S.chat = []; S.consejos = []; save(); pintarChat(); };

/* ---------- arranque ---------- */
(async () => {
  try { claves = Object.assign(claves, await api.claveEstado()); } catch {}
  if (PLAT === "web" && window.claude?.use) { window.claude.use("sample").then(sm => { sample = sm; pintarCerebro(); }).catch(() => {}); }
  if (P.colores) { const r = document.documentElement.style; if (P.colores.principal) r.setProperty("--verde", P.colores.principal); if (P.colores.acento) r.setProperty("--oro", P.colores.acento); }
  $("#etiquetas").innerHTML = (P.etiquetas || []).map(x => `<span>${esc(x)}</span>`).join("");
  $("#estT2").textContent = P.saludo;
  pintarCerebro(); pintar(); pintarChat(); ir("inicio"); api.posicion(S.pos);
  S.recs.forEach(programar);
  const venc = S.recs.filter(r => !r.sonado && r.cuando <= Date.now());
  if (venc.length) { venc.forEach(r => r.sonado = true); save(); pintar(); setTimeout(() => avisar("Te perdiste " + venc.length + (venc.length === 1 ? " recordatorio" : " recordatorios"), venc.map(r => r.texto).join(" · ")), 1200); }
  estado("listo", "Acá andamos", PLAT === "escritorio" ? "Ctrl+Shift+Espacio para charlar" : "Tocame para charlar");
  if (S.observar) ponerObservador(true);
  medir();
})();
window.__agenteDebug = { buscar, entender };
})();
