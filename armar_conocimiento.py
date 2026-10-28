#!/usr/bin/env python3
"""Convierte conocimiento/*.md en web/conocimiento.js (fragmentos para buscar sin conexión)."""
import json, pathlib, re

raiz = pathlib.Path(__file__).resolve().parent.parent
frag = []
for f in sorted((raiz / "conocimiento").glob("*.md")):
    doc, sec, buf = "", "", []
    def cerrar():
        t = "\n".join(buf).strip()
        if t:
            frag.append({"doc": doc, "titulo": sec or doc, "texto": t})
    for linea in f.read_text(encoding="utf-8").splitlines():
        if linea.startswith("# "):
            cerrar(); buf = []; doc = linea[2:].strip(); sec = ""
        elif linea.startswith("## "):
            cerrar(); buf = []; sec = linea[3:].strip()
        else:
            buf.append(linea)
    cerrar()

js = "// Generado por herramientas/armar_conocimiento.py — no editar a mano.\nwindow.AGENTE_KB = " + json.dumps(frag, ensure_ascii=False, indent=0) + ";\n"
(raiz / "web" / "conocimiento.js").write_text(js, encoding="utf-8")
print(len(frag), "fragmentos,", sum(len(x["texto"]) for x in frag), "caracteres")
