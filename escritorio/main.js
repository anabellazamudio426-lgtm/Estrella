// Estrella — agente flotante de escritorio (plantilla «agente-flotante» de DIA, copyleft).
const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut, Tray, Menu, nativeImage, Notification, safeStorage, systemPreferences, shell } = require("electron");
const path = require("path");
const fs = require("fs");

if (process.platform === "linux") app.commandLine.appendSwitch("enable-transparent-visuals");
app.setAppUserModelId("ar.dia.flotante.estrella");
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, tray = null, ultimoBitmap = null;
let posicion = "centro";
const ICONO = path.join(__dirname, "icono.png");
const MARGEN = 12; // espacio para la sombra alrededor de la isla

/* ---------- configuración (clave de Claude cifrada si el sistema lo permite) ---------- */
const cfgPath = () => path.join(app.getPath("userData"), "config.json");
function leerCfg() { try { return JSON.parse(fs.readFileSync(cfgPath(), "utf8")); } catch { return {}; } }
function guardarCfg(c) { try { fs.mkdirSync(path.dirname(cfgPath()), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(c)); } catch {} }
function leerClave(tipo = "claude") {
  const c = leerCfg(), k = "clave_" + tipo;
  if (c[k + "_cif"] && safeStorage.isEncryptionAvailable()) { try { return safeStorage.decryptString(Buffer.from(c[k + "_cif"], "base64")); } catch { return ""; } }
  return c[k] || "";
}
function guardarClave(tipo, v) {
  const c = leerCfg(), k = "clave_" + tipo; delete c[k]; delete c[k + "_cif"];
  if (v) { if (safeStorage.isEncryptionAvailable()) c[k + "_cif"] = safeStorage.encryptString(v).toString("base64"); else c[k] = v; }
  guardarCfg(c);
}
const estadoClaves = () => ({ claude: !!leerClave("claude"), eleven: !!leerClave("eleven") });

/* ---------- ventana ---------- */
function crearVentana() {
  const area = screen.getPrimaryDisplay().workArea;
  const w = 300 + MARGEN * 2, h = 52 + MARGEN * 2;
  win = new BrowserWindow({
    width: w, height: h, x: Math.round(area.x + (area.width - w) / 2), y: area.y + 2,
    frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, maximizable: false, minimizable: false,
    show: false, focusable: true, backgroundColor: "#00000000", icon: ICONO, title: "Estrella",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "web", "index.html"));
  win.once("ready-to-show", () => win.showInactive());
  win.on("blur", () => win.webContents.send("accion", "blur"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  // mantener siempre encima aunque otra app pida lo mismo
  setInterval(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, "screen-saver"); }, 15000);
}

function ubicar(w, h) {
  if (!win) return;
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  let x;
  if (posicion === "izquierda") x = area.x + 8;
  else if (posicion === "derecha") x = area.x + area.width - w - 8;
  else x = Math.round(area.x + (area.width - w) / 2);
  win.setBounds({ x, y: area.y + 2, width: Math.round(w), height: Math.min(Math.round(h), area.height - 4) });
}

/* ---------- bandeja y atajos ---------- */
function menuBandeja(observando) {
  return Menu.buildFromTemplate([
    { label: "Abrir chat", accelerator: "CommandOrControl+Shift+Space", click: () => enviar("chat") },
    { label: "Mirá mi pantalla", accelerator: "CommandOrControl+Shift+P", click: () => enviar("mirar") },
    { label: "Modo observador", type: "checkbox", checked: !!observando, click: m => enviar(m.checked ? "observar-on" : "observar-off") },
    { type: "separator" },
    { label: "Iniciar con la compu", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: m => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { label: "Mostrar / ocultar", click: () => { if (win.isVisible()) win.hide(); else win.showInactive(); } },
    { type: "separator" },
    { label: "Salir", click: () => { app.isQuitting = true; app.quit(); } }
  ]);
}
function enviar(a) { if (!win) return; if (!win.isVisible()) win.showInactive(); win.webContents.send("accion", a); }

app.whenReady().then(() => {
  const arrancar = () => {
    crearVentana();
    try {
      tray = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 18, height: 18 }));
      tray.setToolTip("Estrella");
      tray.setContextMenu(menuBandeja(false));
      tray.on("click", () => enviar("chat"));
    } catch {}
    globalShortcut.register("CommandOrControl+Shift+Space", () => enviar("toggle"));
    globalShortcut.register("CommandOrControl+Shift+P", () => enviar("mirar"));
  };
  // en Linux la transparencia necesita un instante
  if (process.platform === "linux") setTimeout(arrancar, 300); else arrancar();
});
app.on("second-instance", () => enviar("chat"));
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());

/* ---------- IPC ---------- */
ipcMain.on("tamano", (_e, { w, h }) => ubicar(w + MARGEN * 2, h + MARGEN * 2));
ipcMain.on("posicion", (_e, p) => { posicion = p; const b = win.getBounds(); ubicar(b.width, b.height); });
ipcMain.on("foco", (_e, si) => { if (!win) return; if (si) { win.setFocusable(true); win.focus(); } else { win.blur(); } });
ipcMain.on("observando", (_e, si) => { if (tray) tray.setContextMenu(menuBandeja(si)); });
ipcMain.on("notificar", (_e, { titulo, cuerpo }) => {
  if (win && win.isFocused()) return;
  try { if (Notification.isSupported()) new Notification({ title: titulo, body: cuerpo, icon: ICONO, silent: true }).show(); } catch {}
});
ipcMain.handle("clave:estado", () => estadoClaves());
ipcMain.handle("clave:guardar", (_e, { tipo, clave }) => { guardarClave(tipo === "eleven" ? "eleven" : "claude", String(clave || "").trim()); return estadoClaves(); });
ipcMain.handle("inicio:estado", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("inicio:poner", (_e, si) => { app.setLoginItemSettings({ openAtLogin: !!si }); return app.getLoginItemSettings().openAtLogin; });

// Captura de la pantalla + títulos de ventanas abiertas
ipcMain.handle("pantalla", async (_e, { max = 1400, comparar = false } = {}) => {
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    // en Mac la primera captura dispara el pedido de permiso del sistema
  }
  const disp = screen.getDisplayMatching(win.getBounds());
  const k = Math.min(1, max / Math.max(disp.size.width, disp.size.height));
  const tam = { width: Math.round(disp.size.width * k), height: Math.round(disp.size.height * k) };
  let fuentes;
  try { fuentes = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: tam }); }
  catch (e) { return { error: "No pude capturar la pantalla: " + e.message }; }
  const f = fuentes.find(s => String(s.display_id) === String(disp.id)) || fuentes[0];
  if (!f || f.thumbnail.isEmpty()) return { error: process.platform === "darwin" ? "Mac no me dio permiso. Activalo en Ajustes del Sistema → Privacidad → Grabación de pantalla." : "No pude capturar la pantalla." };
  let cambio = 1;
  if (comparar) {
    const chico = f.thumbnail.resize({ width: 64, height: Math.round(64 * tam.height / tam.width), quality: "good" }).toBitmap();
    if (ultimoBitmap && ultimoBitmap.length === chico.length) {
      let dif = 0, n = chico.length / 4;
      for (let i = 0; i < chico.length; i += 4) {
        const a = (chico[i] + chico[i + 1] + chico[i + 2]) / 3, b = (ultimoBitmap[i] + ultimoBitmap[i + 1] + ultimoBitmap[i + 2]) / 3;
        if (Math.abs(a - b) > 18) dif++;
      }
      cambio = dif / n;
    }
    ultimoBitmap = chico;
  }
  let ventanas = [];
  try {
    const vs = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } });
    ventanas = vs.map(v => v.name).filter(n => n && n !== "Estrella").slice(0, 25);
  } catch {}
  return { jpeg: f.thumbnail.toJPEG(72).toString("base64"), ancho: tam.width, alto: tam.height, cambio, ventanas };
});

// Llamada a la API de Claude (la clave nunca llega a la página)
ipcMain.handle("claude", async (_e, cuerpo) => {
  const clave = leerClave("claude");
  if (!clave) return { error: "sin_clave" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(cuerpo)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j?.error?.message || ("HTTP " + r.status), status: r.status };
    return j;
  } catch (e) {
    return { error: "sin_conexion", detalle: e.message };
  }
});

// Voz con ElevenLabs (opcional)
ipcMain.handle("voz", async (_e, { texto, vozId }) => {
  const clave = leerClave("eleven");
  if (!clave || !vozId) return { error: "sin_clave" };
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozId}?output_format=mp3_44100_64`, {
      method: "POST", headers: { "content-type": "application/json", "xi-api-key": clave, accept: "audio/mpeg" },
      body: JSON.stringify({ text: String(texto || "").slice(0, 900), model_id: "eleven_flash_v2_5", language_code: "es" })
    });
    if (!r.ok) return { error: "HTTP " + r.status };
    return { mp3: Buffer.from(await r.arrayBuffer()).toString("base64") };
  } catch (e) { return { error: e.message }; }
});
