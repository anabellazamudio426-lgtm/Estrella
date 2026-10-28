const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("agente", {
  tamano: (w, h) => ipcRenderer.send("tamano", { w, h }),
  posicion: p => ipcRenderer.send("posicion", p),
  foco: si => ipcRenderer.send("foco", si),
  observando: si => ipcRenderer.send("observando", si),
  notificar: (titulo, cuerpo) => ipcRenderer.send("notificar", { titulo, cuerpo }),
  pantalla: opts => ipcRenderer.invoke("pantalla", opts),
  claude: cuerpo => ipcRenderer.invoke("claude", cuerpo),
  voz: (texto, vozId) => ipcRenderer.invoke("voz", { texto, vozId }),
  claveEstado: () => ipcRenderer.invoke("clave:estado"),
  claveGuardar: (tipo, clave) => ipcRenderer.invoke("clave:guardar", { tipo, clave }),
  inicioEstado: () => ipcRenderer.invoke("inicio:estado"),
  inicioPoner: si => ipcRenderer.invoke("inicio:poner", si),
  alAccion: fn => ipcRenderer.on("accion", (_e, a) => fn(a))
});
