/* =====================================================================
   BALIZADOR — geração dos arquivos (xlsx, PDF do balizamento, papeletas)
   Depende de XLSX (SheetJS) e jspdf.
   ===================================================================== */
(function (raiz) {
  "use strict";
  const B = raiz.Balizador;

  const ORD = (n) => n + "ª";
  const CX = (t) => String(t == null ? "" : t).toUpperCase();

  function nomeNaipe(n) {
    return { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[n] || n;
  }

  function colunasDe(prova, perfil) {
    const c = ["RAIA", "NOME DO ATLETA", perfil.rotuloEquipe || "EQUIPE"];
    if (prova.paralimpica && !prova.revezamento) {
      if (perfil.mostrarCategoria) c.push("CAT.");
      c.push("CLASSE");
    }
    c.push("TEMPO");
    return c;
  }

  function linhaAtleta(prova, perfil, raia, it) {
    const v = [raia, CX(it.nome), CX(it.equipe)];
    if (prova.paralimpica && !prova.revezamento) {
      if (perfil.mostrarCategoria) v.push(CX(it.letraCategoria || it.categoria || ""));
      v.push(CX(it.classe) || "—");
    }
    v.push("");
    return v;
  }

  /* =================== PLANILHA =================== */
  function gerarXlsx(provas, perfil, extras) {
    extras = extras || {};
    const wb = XLSX.utils.book_new();

    /* --- aba BALIZAMENTO --- */
    const linhas = [];
    const merges = [];
    const pintar = [];   // {r, tipo}
    linhas.push([CX(perfil.nome || "COMPETIÇÃO")]);
    linhas.push(["BALIZAMENTO"]);
    linhas.push([]);

    let etapaAtual = null;
    for (const p of provas) {
      const cols = colunasDe(p, perfil);
      const et = etapaDe(p, perfil);
      if (et && et.rotulo !== etapaAtual) {
        etapaAtual = et.rotulo;
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "etapa" });
        linhas.push([CX(et.rotulo)]);
        linhas.push([]);
      }
      pintar.push({ r: linhas.length, tipo: "prova" });
      linhas.push([ORD(p.numero) + " PROVA", p.titulo].concat(cols.slice(2)));

      if (!p.series.length) {
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "vazia" });
        linhas.push(["SEM INSCRITOS"]);
        linhas.push([]);
        continue;
      }
      for (const s of p.series) {
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "serie" });
        linhas.push([ORD(s.numero) + " SÉRIE"]);
        for (const l of s.linhas) {
          const it = l.item;
          if (it.atletas && it.atletas.length) {
            const ini = linhas.length;
            it.atletas.forEach((a) => linhas.push([null, CX(a), null, ""]));
            const fim = linhas.length - 1;
            [0, 2, cols.length - 1].forEach((c) =>
              merges.push({ s: { r: ini, c }, e: { r: fim, c } }));
            linhas[ini][0] = l.raia;
            linhas[ini][2] = CX(it.equipe);
            pintar.push({ r: ini, tipo: "raiaRev", ate: fim });
          } else {
            pintar.push({ r: linhas.length, tipo: it.marcado ? "vermelho" : "" });
            linhas.push(linhaAtleta(p, perfil, l.raia, it));
          }
        }
      }
      if (p.cortados && p.cortados.length) {
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "cabCorte" });
        linhas.push(["NÃO PARTICIPAM DESTA PROVA"]);
        for (const c of p.cortados) {
          pintar.push({ r: linhas.length, tipo: c.corteTipo === B.SEM_CLASSE ? "azul" : "vermelho" });
          const v = ["—", CX(c.nome), CX(c.equipe)];
          if (p.paralimpica) {
            if (perfil.mostrarCategoria) v.push(CX(c.letraCategoria || ""));
            v.push(CX(c.classe));
          }
          v.push(CX(c.motivo));
          linhas.push(v);
        }
      }
      linhas.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!merges"] = merges;
    ws["!cols"] = [{ wch: 11 }, { wch: 44 }, { wch: 46 }, { wch: 9 },
                   { wch: 14 }, { wch: 14 }, { wch: 14 }];
    aplicarCores(ws, pintar, linhas);
    XLSX.utils.book_append_sheet(wb, ws, "BALIZAMENTO");

    /* --- aba RESUMO --- */
    const resumo = [["Nº", "PROVA", "ETAPA", "ATLETAS", "SÉRIES", "CORTADOS"]];
    provas.forEach((p) => {
      const et = etapaDe(p, perfil);
      resumo.push([p.numero, p.titulo, et ? CX(et.rotulo) : "", p.atletas,
                   p.series.length, (p.cortados || []).length]);
    });
    const wsR = XLSX.utils.aoa_to_sheet(resumo);
    wsR["!cols"] = [{ wch: 6 }, { wch: 52 }, { wch: 34 }, { wch: 10 },
                    { wch: 9 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, wsR, "RESUMO");

    /* --- aba ATLETAS --- */
    const planas = raiz.BalizadorDados.inscricoesPlanas(provas);
    const porAtleta = new Map();
    for (const i of planas) {
      const k = B.normalizar(i.nome) + "|" + B.normalizar(i.equipe);
      if (!porAtleta.has(k)) porAtleta.set(k, { ref: i, ind: [], rev: [] });
      (i.revezamento ? porAtleta.get(k).rev : porAtleta.get(k).ind).push(i);
    }
    const atl = [["ATLETA", (perfil.rotuloEquipe || "EQUIPE"), "CATEGORIA",
                  "CLASSE", "INDIVIDUAIS", "REVEZAMENTOS", "PROVAS"]];
    [...porAtleta.values()]
      .sort((a, b) => B.normalizar(a.ref.nome) < B.normalizar(b.ref.nome) ? -1 : 1)
      .forEach((v) => {
        const todas = v.ind.concat(v.rev);
        atl.push([CX(v.ref.nome), CX(v.ref.equipe), CX(v.ref.categoria || ""),
                  CX(v.ref.classe || ""), v.ind.length, v.rev.length,
                  todas.map((x) => `${x.prova}ª ${x.tituloProva} (SÉRIE ${x.serie}, RAIA ${x.raia})`).join(" · ")]);
      });
    const wsA = XLSX.utils.aoa_to_sheet(atl);
    wsA["!cols"] = [{ wch: 36 }, { wch: 46 }, { wch: 16 }, { wch: 12 },
                    { wch: 13 }, { wch: 14 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsA, "ATLETAS");

    /* --- aba CONFERÊNCIA --- */
    const conf = [["TIPO", "PROVA", "SÉRIE", "ATLETA", (perfil.rotuloEquipe || "EQUIPE"), "DETALHE"]];
    (extras.erros || []).forEach((e) => conf.push([
      e.tipo, e.prova ? `${e.prova}ª ${e.titulo}` : "", e.serie || "",
      e.nome || "", e.equipe || "", CX(e.detalhe || "")]));
    (extras.limites || []).forEach((a) => conf.push([
      a.tipo, "", "", CX(a.nome), CX(a.equipe),
      CX(`${a.quantidade} PROVAS (MÁX. ${a.limite}): ${a.provas.join(", ")}`)]));
    provas.forEach((p) => (p.cortados || []).forEach((c) => conf.push([
      c.corteTipo === B.SEM_CLASSE ? "SEM CLASSE" : "CORTE POR REGULAMENTO",
      `${p.numero}ª ${p.titulo}`, "", CX(c.nome), CX(c.equipe), CX(c.motivo)])));
    const wsC = XLSX.utils.aoa_to_sheet(conf);
    wsC["!cols"] = [{ wch: 28 }, { wch: 46 }, { wch: 8 }, { wch: 34 },
                    { wch: 40 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsC, "CONFERÊNCIA");

    return wb;
  }

  const CORES = {
    etapa: { fg: "FFFFFF", bg: "1A1A1A", b: true },
    prova: { fg: "000000", bg: "FFF200", b: true },
    serie: { fg: "000000", bg: "D9D9D9", b: true },
    vazia: { fg: "000000", bg: "F2F2F2", b: true },
    cabCorte: { fg: "000000", bg: "F2F2F2", b: true },
    vermelho: { fg: "FFFFFF", bg: "C00000", b: true },
    azul: { fg: "1F3864", bg: "B4C6E7", b: true },
    raiaRev: { fg: "FFFFFF", bg: "C00000", b: true },
  };

  function aplicarCores(ws, pintar, linhas) {
    for (const p of pintar) {
      const cor = CORES[p.tipo];
      if (!cor) continue;
      const largura = Math.max(1, (linhas[p.r] || []).length);
      for (let c = 0; c < Math.max(largura, 7); c++) {
        const ref = XLSX.utils.encode_cell({ r: p.r, c });
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        ws[ref].s = {
          font: { bold: !!cor.b, color: { rgb: cor.fg } },
          fill: { patternType: "solid", fgColor: { rgb: cor.bg } },
        };
        if (p.tipo === "raiaRev" && c > 0) delete ws[ref].s;
      }
    }
  }

  function etapaDe(prova, perfil) {
    for (const e of (perfil.etapas || [])) {
      if (prova.numero >= e.de && prova.numero <= e.ate) {
        return { rotulo: `${e.nome} — ${e.dia} (${e.periodo})  ·  PROVAS ${e.de} A ${e.ate}`, ...e };
      }
    }
    return null;
  }

  /* =================== PDF DO BALIZAMENTO =================== */
  const A4 = { w: 210, h: 297 };
  const MG = 12;

  function novoPdf() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  }

  function cabecalhoPagina(doc, perfil, rotuloEtapa, pagina) {
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0);
    doc.text(CX(perfil.nome || "BALIZAMENTO"), MG, MG + 4);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(70);
    if (rotuloEtapa) doc.text(CX(rotuloEtapa), A4.w - MG, MG + 4, { align: "right" });
    doc.setDrawColor(0).setLineWidth(0.3);
    doc.line(MG, MG + 6.5, A4.w - MG, MG + 6.5);
    doc.setFontSize(7).setTextColor(110);
    doc.text("PÁGINA " + pagina, A4.w / 2, A4.h - 6, { align: "center" });
    doc.setTextColor(0);
  }

  function larguras(prova, perfil) {
    const total = A4.w - 2 * MG;
    const base = (prova.paralimpica && !prova.revezamento)
      ? (perfil.mostrarCategoria ? [14, 54, 58, 12, 20, 24] : [15, 58, 62, 22, 25])
      : [15, 66, 72, 33];
    const soma = base.reduce((a, b) => a + b, 0);
    return base.map((x) => x * total / soma);
  }

  function gerarPdfBalizamento(provas, perfil) {
    const doc = novoPdf();
    const util = A4.w - 2 * MG;
    let y = MG + 12, pagina = 1, etapaAtual = null;
    let rotuloPagina = null;

    const novaPagina = (rot) => {
      doc.addPage(); pagina++; y = MG + 12; rotuloPagina = rot;
      cabecalhoPagina(doc, perfil, rot, pagina);
    };
    cabecalhoPagina(doc, perfil, null, 1);

    for (const p of provas) {
      const et = etapaDe(p, perfil);
      const cols = colunasDe(p, perfil);
      const larg = larguras(p, perfil);

      if (et && et.rotulo !== etapaAtual) {
        etapaAtual = et.rotulo;
        if (y > MG + 14) novaPagina(et.rotulo);
        rotuloPagina = et.rotulo;
        doc.setFillColor(26, 26, 26).rect(MG, y, util, 9, "F");
        doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(255);
        doc.text(CX(et.nome + " — " + et.dia + " (" + et.periodo + ")"), MG + 3, y + 6);
        doc.setFontSize(8).text(`PROVAS ${et.de} A ${et.ate}`, A4.w - MG - 3, y + 6, { align: "right" });
        doc.setTextColor(0);
        y += 12;
      }
      if (rotuloPagina === null && et) {
        rotuloPagina = et.rotulo;
        cabecalhoPagina(doc, perfil, et.rotulo, pagina);
      }

      const alturaFaixa = 8;
      const alturaCab = 6;
      if (y + alturaFaixa + alturaCab + 8 > A4.h - MG - 8) novaPagina(rotuloPagina);

      // faixa da prova
      doc.setFillColor(255, 242, 0).rect(MG, y, util, alturaFaixa, "F");
      doc.setDrawColor(0).setLineWidth(0.3).rect(MG, y, util, alturaFaixa);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
      doc.text(ORD(p.numero) + " PROVA — " + p.titulo, MG + 3, y + 5.5);
      doc.setFont("helvetica", "normal").setFontSize(7.5);
      doc.text(`${p.atletas} ATLETAS · ${p.series.length} SÉRIE(S)`,
               A4.w - MG - 3, y + 5.5, { align: "right" });
      y += alturaFaixa + 1;

      const desenharCabecalho = () => {
        doc.setFillColor(217, 217, 217).rect(MG, y, util, alturaCab, "F");
        doc.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(0);
        let x = MG;
        cols.forEach((c, k) => {
          doc.text(c, x + larg[k] / 2, y + 4, { align: "center" });
          x += larg[k];
        });
        doc.setDrawColor(128).setLineWidth(0.15).rect(MG, y, util, alturaCab);
        y += alturaCab;
      };
      desenharCabecalho();

      const escreverLinha = (valores, altura, fundo, corTexto, negrito) => {
        if (y + altura > A4.h - MG - 8) {
          novaPagina(rotuloPagina);
          desenharCabecalho();
        }
        if (fundo) { doc.setFillColor(...fundo); doc.rect(MG, y, util, altura, "F"); }
        doc.setDrawColor(128).setLineWidth(0.15);
        let x = MG;
        doc.setFont("helvetica", negrito ? "bold" : "normal").setFontSize(7.5);
        doc.setTextColor(...(corTexto || [0, 0, 0]));
        valores.forEach((v, k) => {
          doc.rect(x, y, larg[k], altura);
          const texto = String(v == null ? "" : v);
          const centro = k === 0 || k > 2;
          const linhasTxt = doc.splitTextToSize(texto, larg[k] - 2);
          linhasTxt.slice(0, 3).forEach((t, li) => {
            doc.text(t, centro ? x + larg[k] / 2 : x + 1.5,
                     y + 3.2 + li * 3, { align: centro ? "center" : "left" });
          });
          x += larg[k];
        });
        y += altura;
      };

      if (!p.series.length) {
        escreverLinha([""].concat(cols.slice(1).map(() => "")), 5, [242, 242, 242]);
        y -= 5;
        doc.setFont("helvetica", "bold").setFontSize(7.5);
        doc.text("SEM INSCRITOS", A4.w / 2, y + 3.4, { align: "center" });
        y += 5;
      }

      for (const s of p.series) {
        if (y + 5.5 > A4.h - MG - 8) { novaPagina(rotuloPagina); desenharCabecalho(); }
        doc.setFillColor(217, 217, 217).rect(MG, y, util, 5.5, "F");
        doc.setDrawColor(128).rect(MG, y, util, 5.5);
        doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(0);
        doc.text(`${ORD(s.numero)} SÉRIE — ${s.linhas.length} ` +
                 (p.revezamento ? "EQUIPES" : "NADADORES"), MG + 2, y + 3.8);
        y += 5.5;

        for (const l of s.linhas) {
          const it = l.item;
          if (it.atletas && it.atletas.length) {
            const alt = Math.max(10, it.atletas.length * 3.4 + 2);
            if (y + alt > A4.h - MG - 8) { novaPagina(rotuloPagina); desenharCabecalho(); }
            doc.setFillColor(192, 0, 0).rect(MG, y, larg[0], alt, "F");
            doc.setFillColor(248, 215, 213).rect(MG + larg[0], y, util - larg[0], alt, "F");
            doc.setDrawColor(128).setLineWidth(0.15);
            let x = MG;
            larg.forEach((w) => { doc.rect(x, y, w, alt); x += w; });
            doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(255);
            doc.text(String(l.raia), MG + larg[0] / 2, y + alt / 2 + 2, { align: "center" });
            doc.setFontSize(7.5).setTextColor(0).setFont("helvetica", "normal");
            it.atletas.forEach((a, k) => {
              doc.text(CX(a), MG + larg[0] + 1.5, y + 4 + k * 3.4);
            });
            doc.setFont("helvetica", "bold");
            doc.text(CX(it.equipe), MG + larg[0] + larg[1] + 1.5, y + alt / 2 + 1);
            y += alt;
          } else {
            const vals = linhaAtleta(p, perfil, l.raia, it);
            // medir com a MESMA fonte usada para escrever, senão a altura erra
            doc.setFont("helvetica", it.marcado ? "bold" : "normal").setFontSize(7.5);
            const nLinhas = Math.max(
              doc.splitTextToSize(CX(it.nome), larg[1] - 2).length,
              doc.splitTextToSize(CX(it.equipe), larg[2] - 2).length);
            const alt = Math.max(5, 2 + nLinhas * 3);
            escreverLinha(vals, alt, it.marcado ? [192, 0, 0] : null,
                          it.marcado ? [255, 255, 255] : null, !!it.marcado);
          }
        }
      }

      if (p.cortados && p.cortados.length) {
        if (y + 5.5 > A4.h - MG - 8) { novaPagina(rotuloPagina); desenharCabecalho(); }
        doc.setFillColor(242, 242, 242).rect(MG, y, util, 5.5, "F");
        doc.setDrawColor(128).rect(MG, y, util, 5.5);
        doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(0);
        doc.text("NÃO PARTICIPAM DESTA PROVA", MG + 2, y + 3.8);
        y += 5.5;
        for (const c of p.cortados) {
          const azul = c.corteTipo === B.SEM_CLASSE;
          const vals = ["—", CX(c.nome), CX(c.equipe)];
          if (p.paralimpica) {
            if (perfil.mostrarCategoria) vals.push(CX(c.letraCategoria || ""));
            vals.push(CX(c.classe));
          }
          vals.push(CX(c.motivo));
          doc.setFont("helvetica", "bold").setFontSize(7.5);
          const alt = Math.max(5, 2 + Math.max(
            doc.splitTextToSize(CX(c.motivo), larg[larg.length - 1] - 2).length,
            doc.splitTextToSize(CX(c.nome), larg[1] - 2).length,
            doc.splitTextToSize(CX(c.equipe), larg[2] - 2).length) * 3);
          escreverLinha(vals, alt, azul ? [180, 198, 231] : [192, 0, 0],
                        azul ? [31, 56, 100] : [255, 255, 255], true);
        }
      }
      y += 4;
    }
    return doc;
  }

  /* =================== PAPELETAS =================== */
  function gerarPapeletas(provas, perfil) {
    const doc = novoPdf();
    const cartoes = [];
    for (const p of provas) {
      for (const s of p.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const nomes = it.atletas && it.atletas.length ? it.atletas : [it.nome];
          for (const nome of nomes) {
            cartoes.push({
              prova: p.numero, titulo: p.titulo, serie: s.numero, raia: l.raia,
              nome, equipe: it.equipe,
              categoria: p.paralimpica ? (it.letraCategoria || it.categoria || "") : null,
              classe: p.paralimpica ? it.classe : "",
              revezamento: p.revezamento,
            });
          }
        }
      }
    }

    const alturaSlot = (A4.h - 2 * MG) / 4;
    const util = A4.w - 2 * MG;
    const lEsq = util * 0.54, lDir = util - lEsq;

    cartoes.forEach((d, idx) => {
      const pos = idx % 4;
      if (pos === 0 && idx) doc.addPage();
      const topo = MG + pos * alturaSlot;
      desenharPapeleta(doc, MG, topo, lEsq, lDir, d, perfil);
      if (pos < 3 && idx + 1 < cartoes.length) {
        doc.setDrawColor(170).setLineWidth(0.2).setLineDashPattern([1.2, 1.2], 0);
        doc.line(MG / 2, topo + alturaSlot, A4.w - MG / 2, topo + alturaSlot);
        doc.setLineDashPattern([], 0);
      }
    });
    return { doc, total: cartoes.length };
  }

  function ajustar(doc, texto, max, min, largura) {
    let t = max;
    while (t > min) {
      doc.setFontSize(t);
      if (doc.getTextWidth(texto) <= largura) break;
      t -= 0.5;
    }
    doc.setFontSize(t);
    return t;
  }

  function desenharPapeleta(doc, x0, topo, lEsq, lDir, d, perfil) {
    const pad = 3.5;
    const larg = lEsq - pad;
    let y = topo + pad;
    doc.setTextColor(0);

    doc.setFont("helvetica", "bold").setFontSize(8);
    y += 3.2;
    doc.text(ORD(d.prova) + " PROVA", x0, y);
    doc.setFont("helvetica", "normal");
    y += 3.4;
    ajustar(doc, CX(d.titulo), 7.6, 5, larg);
    doc.text(CX(d.titulo), x0, y);

    const tam = ajustar(doc, CX(d.nome), 16, 7.5, larg);
    y += tam * 0.42;
    doc.text(CX(d.nome), x0, y);

    ajustar(doc, CX(d.equipe), 8.5, 5.5, larg);
    y += 4.6;
    doc.text(CX(d.equipe), x0, y);

    doc.setFont("helvetica", "bold").setFontSize(8.5);
    y += 5.6;
    doc.text(ORD(d.serie) + " SÉRIE", x0, y);
    if (d.categoria) {
      y += 4.4;
      doc.text(`CATEGORIA ${CX(d.categoria)}   ·   CLASSE ${CX(d.classe) || "—"}`, x0, y);
    }
    if (d.revezamento) {
      y += 4.4;
      doc.setFont("helvetica", "normal").setFontSize(7.6);
      doc.text("REVEZAMENTO — TEMPO ÚNICO DA EQUIPE", x0, y);
    }

    const xr = x0 + larg * 0.68;
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    doc.text("RAIA", xr, topo + pad + 20, { align: "center" });
    doc.setFont("helvetica", "bold").setFontSize(32);
    doc.text(String(d.raia), xr, topo + pad + 32, { align: "center" });

    const xt = x0 + lEsq, lt = lDir - pad;
    let yt = topo + pad;
    yt += tabelaTempo(doc, xt, yt, lt, "TEMPO ELIMINATÓRIA") + 3;
    tabelaTempo(doc, xt, yt, lt, "TEMPO FINAL");
  }

  function tabelaTempo(doc, x, y, larg, titulo) {
    const props = [0.18, 0.20, 0.28, 0.34];
    const aTit = 6, aCab = 5.4, aLin = 4.4, nLin = 3;
    const alt = aTit + aCab + nLin * aLin;
    doc.setDrawColor(0).setLineWidth(0.4);
    doc.rect(x, y, larg, alt);
    doc.line(x, y + aTit, x + larg, y + aTit);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(0);
    doc.text(titulo, x + larg / 2, y + 4.2, { align: "center" });
    doc.line(x, y + aTit + aCab, x + larg, y + aTit + aCab);
    doc.setFontSize(7.5);
    let bx = x;
    ["MIN", "SEG", "CENT", "TOTAL"].forEach((r, k) => {
      const w = larg * props[k];
      doc.text(r, bx + w / 2, y + aTit + 3.7, { align: "center" });
      bx += w;
    });
    doc.setLineWidth(0.2);
    for (let k = 1; k < nLin; k++) {
      const yy = y + aTit + aCab + k * aLin;
      doc.line(x, yy, x + larg, yy);
    }
    doc.setLineWidth(0.3);
    bx = x;
    props.slice(0, -1).forEach((p) => {
      bx += larg * p;
      doc.line(bx, y + aTit, bx, y + alt);
    });
    return alt;
  }

  raiz.BalizadorSaida = { gerarXlsx, gerarPdfBalizamento, gerarPapeletas, colunasDe };
})(typeof globalThis !== "undefined" ? globalThis : this);
