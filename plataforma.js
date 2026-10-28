// Una sola interfaz para la isla: escritorio (Electron), Android (puente nativo) o navegador.
(() => {
  // --- Escritorio: preload.js ya expuso window.agente ---
  if (window.agente) { window.AGENTE_PLATAFORMA = "escritorio"; return; }

  // --- Android: el puente nativo AgenteAndroid ---
  if (window.AgenteAndroid) {
    window.AGENTE_PLATAFORMA = "android";
    const pendientes = new Map(); let n = 0;
    window.__agenteResp = (id, json) => { const p = pendientes.get(id); if (!p) return; pendientes.delete(id); try { p(JSON.parse(json)); } catch { p({ error: "respuesta inválida" }); } };
    const pedir = (metodo, args) => new Promise(ok => { const id = "r" + (++n); pendientes.set(id, ok); window.AgenteAndroid.pedir(id, metodo, JSON.stringify(args ?? null)); });
    const oyentes = [];
    window.__agenteAccion = a => oyentes.forEach(f => f(a));
    let vozCb = null;
    window.__agenteVoz = (tipo, texto) => vozCb && vozCb(tipo, texto);
    window.agente = {
      tamano: (w, h) => window.AgenteAndroid.tamano(w, h),
      posicion: p => window.AgenteAndroid.posicion(p),
      foco: si => window.AgenteAndroid.foco(!!si),
      observando: si => window.AgenteAndroid.observando(!!si),
      notificar: (t, c) => window.AgenteAndroid.notificar(t, c),
      pantalla: o => pedir("pantalla", o),
      claude: c => pedir("claude", c),
      voz: (t, vozId) => pedir("voz", { texto: t, vozId: vozId || "" }),
      claveEstado: () => pedir("claveEstado"),
      claveGuardar: (tipo, k) => pedir("claveGuardar", { tipo, clave: k }),
      inicioEstado: async () => null,
      inicioPoner: async () => null,
      hablarLocal: t => window.AgenteAndroid.hablar(t),
      callar: () => window.AgenteAndroid.callar(),
      escuchar: cb => { vozCb = cb; window.AgenteAndroid.escuchar(); },
      alAccion: f => oyentes.push(f)
    };
    return;
  }

  // --- Navegador común: lo que se pueda ---
  window.AGENTE_PLATAFORMA = "web";
  window.agente = {
    tamano(){}, posicion(){}, foco(){}, observando(){}, notificar(){},
    pantalla: async () => ({ error: "Mirar la pantalla funciona en la app de compu o de Android." }),
    claude: async () => ({ error: "sin_clave" }), voz: async () => ({ error: "sin_clave" }),
    claveEstado: async () => ({ claude: false, eleven: false }), claveGuardar: async () => ({ claude: false, eleven: false }),
    inicioEstado: async () => null, inicioPoner: async () => null, alAccion(){}
  };
})();
