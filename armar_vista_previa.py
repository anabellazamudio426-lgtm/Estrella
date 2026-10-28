#!/usr/bin/env python3
"""Arma vista-previa/index.html: la isla del agente en un solo archivo para verla desde el navegador del celular."""
import pathlib, re

raiz = pathlib.Path(__file__).resolve().parent.parent
web = raiz / "web"
html = (web / "index.html").read_text(encoding="utf-8")

estilo = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
cuerpo = re.search(r"<body>(.*?)</body>", html, re.S).group(1)

def inline(m):
    src = m.group(1)
    if src.startswith("lib/pdf"):
        return ('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>\n'
                '<script>window.AGENTE_PDF_WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";</script>')
    codigo = (web / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + codigo + "\n</script>"

cuerpo = re.sub(r'<script src="([^"]+)"></script>', inline, cuerpo)

previa = """
/* ---- vista previa: fondo de celular y la isla flotando arriba ---- */
html.web,html.web body{height:100%;overflow:hidden}
html.web body{background:#0d1b16;background-image:radial-gradient(120% 70% at 20% 0%,#1f5a3a 0%,transparent 55%),radial-gradient(90% 60% at 100% 100%,#6b4a10 0%,transparent 60%),linear-gradient(160deg,#0f2a20,#0a1410);}
html.web #raiz{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);z-index:5;max-width:calc(100vw - 16px)}
html.web.android #raiz{left:8px;right:8px;transform:none;max-width:none}
.fondo{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 max(16px,env(safe-area-inset-left,0px)) calc(env(safe-area-inset-bottom,0px) + 28px);pointer-events:none;text-align:center;gap:14px}
.fondo .apps{display:grid;grid-template-columns:repeat(4,56px);gap:18px 22px;opacity:.55}
.fondo .apps i{width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,.12);display:block}
.fondo p{margin:0;color:#c9d6cf;font-size:12.5px;line-height:1.45;max-width:46ch;background:rgba(0,0,0,.35);padding:10px 14px;border-radius:14px}
.fondo b{color:#F2B33D}
"""

fondo = """<div class="fondo" aria-hidden="true"><div class="apps"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
<p><b>Vista previa de Estrella.</b> Así flota arriba de tu pantalla. Tocá la isla para charlar. En la app instalada, además, se queda encima de todas las apps y puede mirar tu pantalla.</p></div>"""

modo = """<script>if (matchMedia("(max-width: 640px)").matches) document.documentElement.classList.add("android-layout");</script>"""

pagina = f"""<title>Estrella vista previa</title>
<meta name="theme-color" content="#0B1612">
<style>{estilo}{previa}
html.android-layout .isla.open,html.android-layout .isla.notify{{width:100%}}
html.android-layout .inicio,html.android-layout .tablero,html.android-layout .ajustes{{grid-template-columns:1fr}}
html.android-layout .msgs{{height:46vh}}
html.android-layout #raiz{{left:8px;right:8px;transform:none;max-width:none}}
</style>
{modo}
{fondo}
{cuerpo}
"""
salida = raiz / "vista-previa" / "index.html"
salida.parent.mkdir(exist_ok=True)
salida.write_text(pagina, encoding="utf-8")
print(salida, len(pagina) // 1024, "KB")
