// Mascota del agente: la imagen propia de persona.js (mascota.imagen) o un robot dibujado con los colores del agente.
window.AGENTE_MASCOTA = (() => {
  let n = 0;
  const P = window.AGENTE_PERSONA || {};
  const C = Object.assign({ principal: "#2FA84F", acento: "#F2B33D" }, P.colores || {});
  const IMG = P.mascota && P.mascota.imagen;

  function cara(id){
    return `
    <line x1="100" y1="34" x2="100" y2="52" stroke="${C.acento}" stroke-width="5" stroke-linecap="round"/>
    <circle class="rayos" cx="100" cy="30" r="8" fill="${C.acento}"/>
    <rect x="50" y="50" width="100" height="84" rx="34" fill="url(#cab${id})" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <rect x="62" y="66" width="76" height="52" rx="24" fill="#0F1A16"/>
    <g class="ojos">
      <g class="ojo"><ellipse cx="84" cy="90" rx="8" ry="10" fill="#fff"/><circle class="iris" cx="84" cy="91" r="5" fill="${C.acento}"/><circle cx="85.5" cy="88.5" r="1.6" fill="#fff"/></g>
      <g class="ojo"><ellipse cx="116" cy="90" rx="8" ry="10" fill="#fff"/><circle class="iris" cx="116" cy="91" r="5" fill="${C.acento}"/><circle cx="117.5" cy="88.5" r="1.6" fill="#fff"/></g>
      <path class="feliz" d="M76 92 q8 -9 16 0 M108 92 q8 -9 16 0" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    </g>
    <path class="boca" d="M90 106 Q100 113 110 106" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="46" cy="92" r="7" fill="${C.acento}"/><circle cx="154" cy="92" r="7" fill="${C.acento}"/>`;
  }
  function defs(id){
    return `<defs><linearGradient id="cab${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.principal}" stop-opacity=".85"/><stop offset="1" stop-color="${C.principal}"/></linearGradient></defs>`;
  }
  function cuerpo(){
    return `
    <rect x="66" y="138" width="68" height="52" rx="18" fill="${C.principal}" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <circle cx="100" cy="162" r="9" fill="${C.acento}"/>
    <path d="M66 150 Q44 156 40 176" stroke="${C.principal}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M134 150 Q156 140 162 120" stroke="${C.principal}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <circle cx="39" cy="179" r="7" fill="${C.acento}"/><circle cx="163" cy="117" r="7" fill="${C.acento}"/>
    <ellipse cx="84" cy="196" rx="13" ry="6" fill="${C.acento}"/><ellipse cx="116" cy="196" rx="13" ry="6" fill="${C.acento}"/>`;
  }
  function svg(tipo){
    if (IMG) return `<img class="mascota-img" src="${IMG}" alt="" draggable="false"><div class="badge">!</div>`;
    const id = "m" + (++n);
    if (tipo === "cuerpo") return `<svg viewBox="30 14 140 192" aria-hidden="true">${defs(id)}${cuerpo()}${cara(id)}</svg><div class="badge">!</div>`;
    return `<svg viewBox="36 16 128 128" aria-hidden="true">${defs(id)}${cara(id)}</svg><div class="badge">!</div>`;
  }
  // Estilos para la mascota de imagen: se mueve según el ánimo (no tiene ojos que parpadeen).
  const css = document.createElement("style");
  css.textContent = `.mascota-img{width:100%;height:100%;object-fit:contain;border-radius:14px;display:block;transition:transform .2s}
  .mascota.think .mascota-img{animation:mPensar 1.2s ease-in-out infinite}
  .mascota.happy .mascota-img{animation:mFeliz .6s ease-in-out 2}
  .mascota.mira .mascota-img{filter:drop-shadow(0 0 6px #C56BFF)}
  .mascota.habla .mascota-img{animation:mHabla .3s ease-in-out infinite alternate}
  .mascota.sleep .mascota-img{opacity:.7;transform:rotate(-8deg)}
  @keyframes mPensar{50%{transform:rotate(-6deg) translateY(-2px)}}
  @keyframes mFeliz{50%{transform:translateY(-5px) scale(1.05)}}
  @keyframes mHabla{to{transform:scale(1.04)}}`;
  document.head.appendChild(css);
  function montar(raiz){ (raiz || document).querySelectorAll("[data-m]").forEach(el => { if (!el.firstChild) el.innerHTML = svg(el.dataset.m); }); }
  return { svg, montar };
})();
