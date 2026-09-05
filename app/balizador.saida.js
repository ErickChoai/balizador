/* =====================================================================
   BALIZADOR: geração dos arquivos (xlsx, PDF do balizamento, papeletas)
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

  /* Quem não informou tempo aparece como 99:99.99, que é o que os programas
     de natação escrevem e o que o árbitro espera ler na folha. Espaço em
     branco confunde com erro de impressão. */
  const SEM_TEMPO = "99:99.99";

  function tempoDeInscricao(it) {
    return it && it.tempo != null && isFinite(it.tempo)
      ? B.formatarTempo(it.tempo) : SEM_TEMPO;
  }

  function colunasDe(prova, perfil) {
    const c = ["RAIA", "NOME DO ATLETA", perfil.rotuloEquipe || "EQUIPE"];
    if (prova.paralimpica && !prova.revezamento) {
      if (perfil.mostrarCategoria) c.push("CAT.");
      c.push("CLASSE");
    }
    if (perfil.temTempo) c.push("INSCRIÇÃO");
    c.push("TEMPO");
    return c;
  }

  function linhaAtleta(prova, perfil, raia, it) {
    // no revezamento quem nada é a equipe: o nome dela ocupa a coluna do
    // nome, e a coluna da equipe fica vazia para não repetir a mesma coisa
    const v = [raia, CX(it.nome), prova.revezamento ? "" : CX(it.equipe)];
    if (prova.paralimpica && !prova.revezamento) {
      if (perfil.mostrarCategoria) v.push(CX(it.letraCategoria || it.categoria || ""));
      v.push(CX(it.classe));
    }
    if (perfil.temTempo) v.push(tempoDeInscricao(it));
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
      pintar.push({ r: linhas.length, tipo: p.aviso ? "provaFora" : "prova" });
      linhas.push([ORD(p.numero) + " PROVA", p.titulo].concat(cols.slice(2)));
      if (p.aviso) {
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "provaFora" });
        linhas.push([CX(p.aviso)]);
      }

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
          pintar.push({ r: linhas.length, tipo: it.marcado ? "vermelho" : "" });
          const linha = linhaAtleta(p, perfil, l.raia, it);
          // por que está em vermelho, escrito ao lado e não só na conferência
          if (it.marcado && it.motivoMarcado) linha.push(CX(it.motivoMarcado));
          linhas.push(linha);
        }
      }
      if (p.cortados && p.cortados.length) {
        merges.push({ s: { r: linhas.length, c: 0 }, e: { r: linhas.length, c: cols.length - 1 } });
        pintar.push({ r: linhas.length, tipo: "cabCorte" });
        linhas.push(["NÃO PARTICIPAM DESTA PROVA"]);
        for (const c of p.cortados) {
          pintar.push({ r: linhas.length, tipo: c.corteTipo === B.SEM_CLASSE ? "azul" : "vermelho" });
          const v = ["", CX(c.nome), CX(c.equipe)];
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
    provaFora: { fg: "FFFFFF", bg: "C00000", b: true },
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
        return { rotulo: `${e.nome}, ${e.dia} (${e.periodo})  ·  PROVAS ${e.de} A ${e.ate}`, ...e };
      }
    }
    return null;
  }

  /* =================== PDF DO BALIZAMENTO =================== */
  const A4 = { w: 210, h: 297 };
  const MG = 12;
  const ALT_SLOT = (A4.h - 2 * MG) / 4;   // quatro papeletas por folha

  /* As logos das instituições, lado a lado dentro de uma faixa. Cada uma
     entra na altura da faixa, guardando a proporção; se a soma passar da
     largura, todas encolhem juntas, para nenhuma ficar deformada. */
  function desenharLogos(doc, logos, x, y, larg, alt) {
    const lista = (logos || []).filter((l) => l && l.dados);
    if (!lista.length || larg <= 0) return;
    const vao = 3;
    let larguras = lista.map((l) => alt * ((l.w && l.h) ? l.w / l.h : 1));
    let total = larguras.reduce((a, b) => a + b, 0) + vao * (lista.length - 1);
    let altura = alt;
    if (total > larg) {
      const k = larg / total;
      larguras = larguras.map((w) => w * k);
      altura = alt * k;
      total = larg;
    }
    let cx = x + (larg - total) / 2;
    for (let i = 0; i < lista.length; i++) {
      // imagem que o jsPDF não entender não pode derrubar o PDF inteiro
      try {
        // o apelido faz a mesma imagem ser guardada uma vez só, mesmo saindo
        // em toda página; a compressão evita um PDF de megabytes por causa
        // de duas logos
        doc.addImage(lista[i].dados, "PNG", cx, y + (alt - altura) / 2,
                     larguras[i], altura, "logo" + i, "FAST");
      } catch (e) { /* segue sem ela */ }
      cx += larguras[i] + vao;
    }
  }

  function novoPdf() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  }

  /* Cabeçalho de página, no estilo da folha oficial: o que é, de que
     competição, onde e quando. Sem patrocínio e sem registro de atleta. */
  const SITE = "erickchoai.github.io/balizador";

  /* Marca d'água e crédito. Bem claros de propósito: esta folha é usada na
     borda da piscina, com gente escrevendo tempo em cima dela. */
  function marcaDagua(doc) {
    doc.setFont("helvetica", "bold").setFontSize(52).setTextColor(244);
    doc.text("BALIZADOR", A4.w / 2, A4.h / 2, { align: "center", angle: 32 });
    doc.setTextColor(0);
  }

  /* A marca do app, desenhada e não importada: é o mesmo quadradinho BZ da
     tela, e assim ela não depende de nenhum arquivo de imagem. */
  function marcaBalizador(doc, x, base, lado) {
    doc.setFillColor(11, 114, 133);
    doc.roundedRect(x, base - lado + 0.6, lado, lado, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold").setFontSize(lado * 1.8).setTextColor(255);
    doc.text("BZ", x + lado / 2, base - lado / 2 + 1.4, { align: "center" });
    doc.setTextColor(0);
  }

  function rodapeCredito(doc, pagina) {
    const lado = 4;
    const base = A4.h - 6;
    marcaBalizador(doc, MG, base, lado);
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(150);
    doc.text("Feito com Balizador · " + SITE, MG + lado + 1.6, A4.h - 7);
    if (pagina != null)
      doc.text(String(pagina), A4.w - MG, A4.h - 7, { align: "right" });
    doc.setTextColor(0);
  }

  function cabecalhoPagina(doc, perfil, rotuloEtapa, pagina, logos) {
    marcaDagua(doc);
    let y = MG + 4;
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(0);
    doc.text("BALIZAMENTO", MG, y);
    doc.setFontSize(11);
    doc.text(CX(perfil.nome || ""), MG, y + 6);
    y += 6;

    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(60);
    if (perfil.local) { y += 4.5; doc.text("Local: " + perfil.local, MG, y); }
    const piscina = [
      perfil.piscina ? "Piscina de " + perfil.piscina + " metros" : "",
      (perfil.raias || 6) + " raias",
    ].filter(Boolean).join(" · ");
    const dataEPiscina = [perfil.data ? "Data: " + perfil.data : "", piscina]
      .filter(Boolean).join("   ");
    if (dataEPiscina) { y += 4.5; doc.text(dataEPiscina, MG, y); }

    if (rotuloEtapa) {
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(0);
      doc.text(CX(rotuloEtapa), A4.w - MG, MG + 4, { align: "right" });
    }
    // a faixa livre entre o texto do cabeçalho e a etapa
    const xLogos = MG + 80;
    desenharLogos(doc, logos, xLogos, MG,
                  A4.w - MG - xLogos - (rotuloEtapa ? 24 : 0), 15);
    doc.setDrawColor(0).setLineWidth(0.4);
    doc.line(MG, y + 2.5, A4.w - MG, y + 2.5);

    rodapeCredito(doc, pagina);
    return y + 7;                       // onde o conteúdo pode começar
  }

  function nomeInstituicao(perfil) {
    const r = (perfil.rotuloEquipe || "EQUIPE").toLowerCase();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  /* As colunas da prova. A de tempo só aparece quando a competição tem tempo
     de inscrição; a de balizamento é sempre em branco, para anotar na borda
     da piscina. Nome e instituição dividem o que sobra da largura. */
  function colunasPdf(prova, perfil) {
    const cols = [{ chave: "raia", rotulo: "Raia", larg: 12, alinha: "center" }];
    cols.push({ chave: "nome", rotulo: prova.revezamento ? "Nadadores" : "Nome",
                larg: 0, peso: prova.revezamento ? 1.3 : 1, alinha: "left" });
    if (prova.paralimpica && !prova.revezamento) {
      if (perfil.mostrarCategoria)
        cols.push({ chave: "categoria", rotulo: "Cat.", larg: 12, alinha: "center" });
      cols.push({ chave: "classe", rotulo: "Classe", larg: 21, alinha: "center" });
    }
    cols.push({ chave: "equipe", rotulo: nomeInstituicao(perfil),
                larg: 0, peso: 1, alinha: "left" });
    if (perfil.temTempo)
      cols.push({ chave: "tempo", rotulo: "Tempo", larg: 19, alinha: "right" });
    cols.push({ chave: "baliza", rotulo: "Balizamento", larg: 25, alinha: "center" });

    const fixo = cols.reduce((s, c) => s + c.larg, 0);
    const sobra = (A4.w - 2 * MG) - fixo;
    const pesos = cols.reduce((s, c) => s + (c.peso || 0), 0);
    cols.forEach((c) => { if (!c.larg) c.larg = sobra * c.peso / pesos; });
    return cols;
  }

  function xDaColuna(cols, k) {
    let x = MG;
    for (let i = 0; i < k; i++) x += cols[i].larg;
    return x;
  }

  // escreve um valor respeitando o alinhamento da coluna
  function escreverCelula(doc, cols, k, texto, y) {
    const c = cols[k];
    const x = xDaColuna(cols, k);
    if (c.alinha === "center") doc.text(texto, x + c.larg / 2, y, { align: "center" });
    else if (c.alinha === "right") doc.text(texto, x + c.larg - 1.5, y, { align: "right" });
    else doc.text(texto, x + 1.5, y);
  }

  function gerarPdfBalizamento(provas, perfil, logos) {
    const doc = novoPdf();
    const util = A4.w - 2 * MG;
    const RODAPE = A4.h - MG - 6;
    let pagina = 1, etapaAtual = null, rotuloPagina = null;
    let y = cabecalhoPagina(doc, perfil, null, 1, logos);
    // uma página recém-aberta não deve ser quebrada de novo pela etapa
    let paginaVazia = true;

    const novaPagina = (rot) => {
      doc.addPage(); pagina++; rotuloPagina = rot;
      y = cabecalhoPagina(doc, perfil, rot, pagina, logos);
      paginaVazia = true;
    };

    for (const p of provas) {
      const et = etapaDe(p, perfil);
      const cols = colunasPdf(p, perfil);

      /* --- faixa da etapa --- */
      if (et && et.rotulo !== etapaAtual) {
        etapaAtual = et.rotulo;
        // cada etapa abre uma página, mas sem deixar uma folha em branco atrás
        if (!paginaVazia) novaPagina(et.nome);
        rotuloPagina = et.nome;
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
        doc.text("Etapa: " + CX(et.nome), MG, y + 3);
        const quando = [et.dia, et.periodo].filter(Boolean).join("   ");
        if (quando) doc.text("Data: " + CX(quando), MG + 55, y + 3);
        doc.setFont("helvetica", "normal").setFontSize(8);
        doc.text(`Provas ${et.de} a ${et.ate}`, A4.w - MG, y + 3, { align: "right" });
        doc.setLineWidth(0.4).line(MG, y + 5, A4.w - MG, y + 5);
        y += 9;
      }
      if (rotuloPagina === null && et) rotuloPagina = et.nome;

      /* --- cabeçalho de colunas, redesenhado a cada quebra de página --- */
      const desenharColunas = () => {
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(0);
        cols.forEach((c, k) => escreverCelula(doc, cols, k, c.rotulo, y + 3));
        doc.setDrawColor(0).setLineWidth(0.25);
        doc.line(MG, y + 4.4, A4.w - MG, y + 4.4);
        y += 6.5;
      };

      const cabeDaProva = () => {
        // prova que não consta no programa sai em vermelho, com o motivo
        // escrito embaixo: na borda da piscina ninguém tem a conferência à mão
        const fora = !!p.aviso;
        if (fora) doc.setFillColor(252, 231, 228).rect(MG, y - 1, util, 12.5, "F");
        const cor = fora ? [150, 26, 20] : [0, 0, 0];
        doc.setFont("helvetica", "bold").setFontSize(10);
        doc.setTextColor(cor[0], cor[1], cor[2]);
        doc.text(ORD(p.numero) + " PROVA", MG, y + 3.4);
        doc.text(p.distancia + " " + p.estilo, MG + 26, y + 3.4);
        doc.setFontSize(9);
        doc.text(CX(p.categoria || ""), MG + 60, y + 3.4);
        doc.text(nomeNaipe(p.naipe), A4.w - MG, y + 3.4, { align: "right" });
        doc.setFont("helvetica", fora ? "bold" : "normal").setFontSize(6.5);
        if (!fora) doc.setTextColor(120);
        doc.text(`${p.atletas} ${p.revezamento ? "equipes" : "atletas"}` +
                 ` · ${p.series.length} série(s)`, MG + 26, y + 7);
        if (fora) doc.text(CX(p.aviso), MG + 60, y + 7);
        doc.setTextColor(0);
        doc.setDrawColor(fora ? 150 : 0);
        doc.setLineWidth(0.4).line(MG, y + 8.6, A4.w - MG, y + 8.6);
        doc.setDrawColor(0);
        y += fora ? 12 : 10.5;
        paginaVazia = false;
      };

      if (y + 26 > RODAPE) novaPagina(rotuloPagina);
      cabeDaProva();

      if (!p.series.length) {
        doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(120);
        doc.text("Sem inscritos", MG + 1.5, y + 3);
        doc.setTextColor(0);
        y += 8;
        continue;
      }
      desenharColunas();

      for (const s of p.series) {
        if (y + 12 > RODAPE) { novaPagina(rotuloPagina); desenharColunas(); }
        doc.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(80);
        doc.text(ORD(s.numero) + " SÉRIE", MG + 1.5, y + 3);
        doc.setTextColor(0);
        y += 4.5;

        for (const l of s.linhas) {
          const it = l.item;
          const colNome = cols.findIndex((c) => c.chave === "nome");
          const largNome = cols[colNome].larg;

          doc.setFont("helvetica", "bold").setFontSize(8);
          const partesNome = doc.splitTextToSize(CX(it.nome), largNome - 3);
          const colEq = cols.findIndex((c) => c.chave === "equipe");
          doc.setFont("helvetica", "normal");
          const partesEq = doc.splitTextToSize(
            p.revezamento ? "" : CX(it.equipe), cols[colEq].larg - 3);
          const motivo = it.marcado && it.motivoMarcado ? it.motivoMarcado : "";
          const alt = Math.max(5.2, 1.6 + Math.max(partesNome.length,
                                                   partesEq.length) * 3.4) +
                      (motivo ? 3 : 0);
          if (y + alt > RODAPE) { novaPagina(rotuloPagina); desenharColunas(); }

          // acima do limite de provas: fundo claro e texto vermelho, sem bloco
          if (it.marcado) {
            doc.setFillColor(252, 231, 228).rect(MG, y, util, alt, "F");
          }
          const cor = it.marcado ? [150, 26, 20] : [0, 0, 0];
          doc.setTextColor(cor[0], cor[1], cor[2]);
          cols.forEach((c, k) => {
            if (c.chave === "baliza") return;
            doc.setFont("helvetica", c.chave === "nome" ? "bold" : "normal");
            doc.setFontSize(c.chave === "raia" ? 9 : 8);
            if (c.chave === "nome" || c.chave === "equipe") {
              const partes = c.chave === "nome" ? partesNome : partesEq;
              partes.forEach((t, j) =>
                doc.text(t, xDaColuna(cols, k) + 1.5, y + 3.4 + j * 3.4));
              return;
            }
            const v = {
              raia: String(l.raia),
              categoria: CX(it.letraCategoria || it.categoria || ""),
              classe: CX(it.classe),
              tempo: tempoDeInscricao(it),
            }[c.chave] || "";
            escreverCelula(doc, cols, k, v, y + 3.4);
          });
          if (motivo) {
            doc.setFont("helvetica", "italic").setFontSize(6);
            doc.setTextColor(150, 26, 20);
            doc.text(CX(motivo), xDaColuna(cols, colNome) + 1.5, y + alt - 1.2);
          }
          doc.setTextColor(0);
          linhaDeBase(doc, y + alt);
          y += alt;
        }
        y += 1.5;
      }

      /* --- quem não pode nadar esta prova --- */
      if (p.cortados && p.cortados.length) {
        if (y + 10 > RODAPE) novaPagina(rotuloPagina);
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(120);
        doc.text("NÃO PARTICIPAM DESTA PROVA", MG + 1.5, y + 3);
        doc.setDrawColor(180).setLineWidth(0.2).line(MG, y + 4.2, A4.w - MG, y + 4.2);
        doc.setTextColor(0);
        y += 6;
        for (const c of p.cortados) {
          const azul = c.corteTipo === B.SEM_CLASSE;
          const cor = azul ? [31, 56, 100] : [150, 26, 20];
          doc.setFont("helvetica", "bold").setFontSize(7.5);
          const largMotivo = util - 12 - cols[1].larg - 3;
          const partes = doc.splitTextToSize(c.motivo || "", largMotivo);
          const alt = Math.max(4.6, 1.4 + partes.length * 3.2);
          if (y + alt > RODAPE) novaPagina(rotuloPagina);
          doc.setTextColor(cor[0], cor[1], cor[2]);
          doc.text(CX(c.nome), MG + 12, y + 3);
          doc.setFont("helvetica", "normal");
          partes.forEach((t, j) =>
            doc.text(t, MG + 12 + cols[1].larg, y + 3 + j * 3.2));
          doc.setFontSize(6.5).setTextColor(120);
          doc.text(CX(c.equipe), MG + 12, y + 3 + 3.2);
          doc.setTextColor(0);
          y += alt + 1.4;
        }
      }
      y += 5;
    }
    return doc;
  }

  // filete claríssimo entre atletas: separa sem sujar a folha
  function linhaDeBase(doc, y) {
    doc.setDrawColor(225).setLineWidth(0.1);
    doc.line(MG, y, A4.w - MG, y);
  }


  /* =================== PAPELETAS =================== */
  function gerarPapeletas(provas, perfil, logos) {
    const doc = novoPdf();
    const cartoes = [];
    for (const p of provas) {
      for (const s of p.series) {
        for (const l of s.linhas) {
          const it = l.item;
          // uma papeleta por raia. No revezamento a raia é da equipe: quem
          // nada só é escolhido no dia, e não é o app que decide isso
          cartoes.push({
            prova: p.numero, titulo: p.titulo, serie: s.numero, raia: l.raia,
            nome: it.nome, equipe: it.equipe,
            tempo: perfil.temTempo ? tempoDeInscricao(it) : "",
            categoria: p.paralimpica && !p.revezamento
              ? (it.letraCategoria || it.categoria || "") : null,
            classe: p.paralimpica && !p.revezamento ? it.classe : "",
            revezamento: p.revezamento,
          });
        }
      }
    }

    const alturaSlot = ALT_SLOT;
    const daPapeleta = (logos || []).filter((l) => l && l.naPapeleta);
    const util = A4.w - 2 * MG;
    const lEsq = util * 0.54, lDir = util - lEsq;

    cartoes.forEach((d, idx) => {
      const pos = idx % 4;
      if (pos === 0 && idx) doc.addPage();
      if (pos === 0) rodapeCredito(doc, null);
      const topo = MG + pos * alturaSlot;
      desenharPapeleta(doc, MG, topo, lEsq, lDir, d, perfil, daPapeleta);
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

  function desenharPapeleta(doc, x0, topo, lEsq, lDir, d, perfil, logos) {
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

    // no revezamento o nome já é a equipe: não escreve duas vezes
    if (B.normalizar(d.nome) !== B.normalizar(d.equipe)) {
      ajustar(doc, CX(d.equipe), 8.5, 5.5, larg);
      y += 4.6;
      doc.text(CX(d.equipe), x0, y);
    }

    doc.setFont("helvetica", "bold").setFontSize(8.5);
    y += 5.6;
    doc.text(ORD(d.serie) + " SÉRIE", x0, y);
    if (d.categoria) {
      y += 4.4;
      doc.text(`CATEGORIA ${CX(d.categoria)}` +
               (CX(d.classe) ? `   ·   CLASSE ${CX(d.classe)}` : ""), x0, y);
    }
    if (d.tempo) {
      // o tempo de inscrição na papeleta serve de conferência na borda da
      // piscina; quem não informou aparece como 99:99.99, não em branco
      y += 4.4;
      doc.setFont("helvetica", "normal").setFontSize(8);
      doc.text("INSCRIÇÃO: " + d.tempo, x0, y);
    }
    if (d.revezamento) {
      y += 4.4;
      doc.setFont("helvetica", "normal").setFontSize(7.6);
      doc.text("REVEZAMENTO: TEMPO ÚNICO DA EQUIPE", x0, y);
    }

    const xr = x0 + larg * 0.68;
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    doc.text("RAIA", xr, topo + pad + 20, { align: "center" });
    doc.setFont("helvetica", "bold").setFontSize(32);
    doc.text(String(d.raia), xr, topo + pad + 32, { align: "center" });

    // as logos marcadas, no pé do cartão, abaixo do que está escrito
    desenharLogos(doc, logos, x0, topo + ALT_SLOT - 19, lEsq - pad * 2, 14);

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
