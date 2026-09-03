/* =====================================================================
   BALIZADOR — leitura de planilhas e montagem do balizamento
   Depende de balizador.core.js e da biblioteca XLSX (SheetJS).
   ===================================================================== */
(function (raiz) {
  "use strict";
  const B = raiz.Balizador || require("./balizador.core.js");

  const ESTILOS = ["LIVRE", "COSTAS", "PEITO", "BORBOLETA", "MEDLEY"];
  const AUXILIARES = ["COLEGIO", "COLÉGIO", "CIDADE", "EQUIPE", "ESCOLA",
                      "CLASSE", "TEMPO", "N°", "NO", "CATEGORIA", "EXCESSAO",
                      "EXCESSÃO", "EXCECAO", "EXCEÇÃO", "SEGMENTO"];

  const norm = B.normalizar;

  /* ---------------- reconhecimento de cabeçalhos ---------------- */

  // "25 BORBOLETA", "4x50 LIVRE MISTO", "50 METROS COSTAS", "100M PEITO"
  function lerCabecalhoProva(texto) {
    const u = norm(texto);
    if (!u) return null;
    if (AUXILIARES.includes(u)) return null;
    const m = u.match(/^(4X\s*\d+|\d+)\s*M?(?:ETROS)?\s+(LIVRE|COSTAS?|PEITO|BORBOLETA|MEDLEY)(.*)$/);
    if (!m) return null;
    let dist = m[1].replace(/\s+/g, "");
    if (!/^4X/.test(dist)) dist = dist + "M";
    else dist = dist + "M";
    let estilo = m[2];
    if (estilo.indexOf("COSTA") === 0) estilo = "COSTAS";
    const resto = m[3] || "";
    return {
      distancia: dist,
      estilo,
      misto: /MISTO/.test(resto) || /MISTO/.test(u),
      revezamento: /^4X/.test(dist),
      evento: dist.replace("M", "").replace("4X", "4X") + " " + estilo,
    };
  }

  // Evento no formato usado pelas regras paralímpicas: "50 LIVRE", "100 PEITO"
  function eventoRegras(distancia, estilo) {
    return String(distancia).replace(/M$/, "") + " " + estilo;
  }

  /* ---------------- leitura de uma planilha em blocos ----------------
     Aba = categoria × naipe. Linha 1 traz os cabeçalhos das provas e,
     à direita de cada um, as colunas auxiliares (equipe, classe, tempo).
  -------------------------------------------------------------------- */
  function lerPlanilhaBlocos(wb, opts) {
    opts = opts || {};
    const ignorar = (opts.ignorar || []).map(norm);
    const inscricoes = [];
    const abas = [];

    for (const nomeAba of wb.SheetNames) {
      if (ignorar.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      if (!grade.length) continue;
      const cab = grade[0] || [];

      // onde começa cada bloco de prova
      const blocos = [];
      cab.forEach((c, idx) => {
        const info = lerCabecalhoProva(c);
        if (info) blocos.push({ col: idx, info });
      });
      if (!blocos.length) continue;

      // colunas auxiliares de cada bloco: tudo até o próximo bloco
      blocos.forEach((b, k) => {
        const fim = k + 1 < blocos.length ? blocos[k + 1].col : cab.length;
        b.aux = {};
        for (let c = b.col + 1; c < fim; c++) {
          const t = norm(cab[c]);
          if (!t) continue;
          if (["COLEGIO", "COLÉGIO", "CIDADE", "EQUIPE", "ESCOLA"].includes(t)) {
            b.aux.equipe = b.aux.equipe == null ? c : b.aux.equipe;
          } else if (t === "CLASSE") b.aux.classe = c;
          else if (t === "TEMPO") b.aux.tempo = c;
          else if (["EXCESSAO", "EXCESSÃO", "EXCECAO", "EXCEÇÃO"].includes(t)) {
            b.aux.excecao = c;
          } else if (t === "SEGMENTO") b.aux.segmento = c;
        }
      });

      const info = { aba: nomeAba, provas: blocos.map((b) => b.info), linhas: 0 };
      for (let r = 1; r < grade.length; r++) {
        const linha = grade[r] || [];
        for (const b of blocos) {
          const bruto = linha[b.col];
          if (bruto == null || !String(bruto).trim()) continue;
          const txt = String(bruto).trim();
          if (norm(txt) === "SEM INSCRITOS") continue;
          const equipe = b.aux.equipe != null ? (linha[b.aux.equipe] || "") : "";
          const classe = b.aux.classe != null ? (linha[b.aux.classe] || "") : "";
          const tempo = b.aux.tempo != null ? B.lerTempo(linha[b.aux.tempo]) : null;
          const segmento = b.aux.segmento != null ? (linha[b.aux.segmento] || "") : "";
          const excecao = b.aux.excecao != null ? (linha[b.aux.excecao] || "") : "";

          const base = {
            aba: nomeAba, linha: r + 1, equipe: String(equipe).trim(),
            classe: String(classe).trim(), tempo,
            segmento: String(segmento).trim(), excecao: String(excecao).trim(),
            distancia: b.info.distancia, estilo: b.info.estilo,
            misto: b.info.misto, revezamento: b.info.revezamento,
          };
          if (b.info.revezamento) {
            const atletas = txt.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
            inscricoes.push(Object.assign({}, base, {
              nome: String(equipe).trim() || atletas[0] || txt,
              atletas,
            }));
          } else {
            inscricoes.push(Object.assign({}, base, { nome: txt, atletas: null }));
          }
          info.linhas++;
        }
      }
      abas.push(info);
    }
    return { inscricoes, abas };
  }

  /* ---------------- modelo canônico (uma linha por inscrição) ------- */
  const COLUNAS_MODELO = {
    nome: ["NOME", "ATLETA", "NOME DO ATLETA"],
    equipe: ["EQUIPE", "ESCOLA", "COLEGIO", "COLÉGIO", "CIDADE", "ENTIDADE"],
    categoria: ["CATEGORIA", "CLASSE ETARIA", "FAIXA ETARIA"],
    naipe: ["NAIPE", "SEXO", "GENERO", "GÊNERO"],
    prova: ["PROVA", "NOME DA PROVA", "NOME DA COMPETICAO", "NOME DA COMPETIÇÃO"],
    distancia: ["DISTANCIA", "DISTÂNCIA"],
    estilo: ["ESTILO", "NADO"],
    segmento: ["SEGMENTO"],
    classe: ["CLASSE", "CLASSIFICACAO", "CLASSIFICAÇÃO"],
    tempo: ["TEMPO", "TEMPO DE INSCRICAO", "MELHOR TEMPO"],
  };

  function lerPlanilhaLinhas(wb, opts) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
    if (!linhas.length) return { inscricoes: [], abas: [] };
    const chaves = Object.keys(linhas[0]);
    const mapa = {};
    for (const [campo, nomes] of Object.entries(COLUNAS_MODELO)) {
      const achou = chaves.find((c) => nomes.includes(norm(c)));
      if (achou) mapa[campo] = achou;
    }
    if (!mapa.nome) return { inscricoes: [], abas: [], erro: "não achei a coluna NOME" };

    const inscricoes = [];
    linhas.forEach((l, idx) => {
      const nome = String(l[mapa.nome] || "").trim();
      if (!nome || norm(nome) === "SEM INSCRITOS") return;
      let dist = mapa.distancia ? String(l[mapa.distancia] || "") : "";
      let estilo = mapa.estilo ? norm(l[mapa.estilo]) : "";
      let misto = false, revez = false;
      if ((!dist || !estilo) && mapa.prova) {
        const info = lerCabecalhoProva(String(l[mapa.prova] || "")
          .replace(/^.*?-\s*/, ""));
        if (info) {
          dist = info.distancia; estilo = info.estilo;
          misto = info.misto; revez = info.revezamento;
        }
      }
      inscricoes.push({
        aba: "MODELO", linha: idx + 2, nome,
        equipe: mapa.equipe ? String(l[mapa.equipe] || "").trim() : "",
        categoria: mapa.categoria ? String(l[mapa.categoria] || "").trim() : "",
        naipe: mapa.naipe ? norm(l[mapa.naipe]).slice(0, 4) : "",
        segmento: mapa.segmento ? String(l[mapa.segmento] || "").trim() : "",
        classe: mapa.classe ? String(l[mapa.classe] || "").trim() : "",
        tempo: mapa.tempo ? B.lerTempo(l[mapa.tempo]) : null,
        distancia: dist, estilo, misto, revezamento: revez, atletas: null,
      });
    });
    return { inscricoes, abas: [{ aba: "MODELO", linhas: inscricoes.length }] };
  }

  /* ---------------- categoria e naipe vindos do nome da aba -------- */
  function categoriaDaAba(nomeAba) {
    const u = norm(nomeAba);
    let naipe = "";
    if (/MISTO/.test(u)) naipe = "MISTO";
    else if (/(^|[^A-Z])MASC/.test(u)) naipe = "MASC";
    else if (/(^|[^A-Z])FEM/.test(u)) naipe = "FEM";
    const cat = u.replace(/[-–]\s*(MASC|FEM)\w*\s*$/, "")
                 .replace(/\s*(MASCULINO|FEMININO)\s*$/, "").trim();
    return { categoria: cat.replace(/"/g, "").trim(), naipe };
  }

  /* ---------------- conferência do formato da planilha ----------------
     O app não adivinha: se a planilha não estiver no formato esperado,
     ele recusa e diz exatamente o que faltou. Melhor não gerar nada do
     que gerar um balizamento errado em silêncio.
  --------------------------------------------------------------------- */
  const CAMPOS_EXIGIDOS = {
    PARA: ["equipe", "segmento", "classe"],
    ESCOLAR: ["equipe"],
    ESCOLAR_PARA: ["equipe"],
    TEMPO: ["equipe"],
  };
  const ROTULO_CAMPO = {
    equipe: "a coluna da instituição (CIDADE, ESCOLA, COLÉGIO ou EQUIPE)",
    classe: "a coluna CLASSE, com a classificação funcional (S6, SB5, SM6)",
    tempo: "a coluna TEMPO",
    segmento: "o SEGMENTO (DF, DV, DI, DA, TEA-DOWN) — na coluna SEGMENTO " +
              "ou no nome da aba, como DF-FEM",
  };
  const SEGMENTOS = ["DF", "DV", "DI", "DA", "TEA"];

  // o segmento pode vir da coluna ou do nome da aba (DF-FEM, DV-MASC)
  function segmentoNaAba(nomeAba) {
    const u = norm(nomeAba);
    return SEGMENTOS.some((s) => u.startsWith(s + "-") || u === s);
  }

  function conferirPlanilha(wb, perfil) {
    const tipo = perfil.tipo || "ESCOLAR";
    const ignorar = (perfil.ignorarAbas || []).map(norm);
    const problemas = [];
    const abasBoas = [];
    const abasRuins = [];

    for (const nomeAba of wb.SheetNames) {
      if (ignorar.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      const cab = (grade[0] || []).map((c) => String(c == null ? "" : c).trim());
      const temConteudo = grade.slice(1).some((l) =>
        (l || []).some((c) => c != null && String(c).trim()));
      if (!cab.some((c) => c) && !temConteudo) continue;   // aba vazia: ignora

      const blocos = cab.map((c, i) => ({ i, info: lerCabecalhoProva(c) }))
                        .filter((b) => b.info);
      if (!blocos.length) {
        abasRuins.push({
          aba: nomeAba,
          motivo: cab.some((c) => c)
            ? "a primeira linha não tem nenhum nome de prova reconhecível"
            : "a primeira linha está vazia — sem cabeçalho não dá para saber o que é cada coluna",
          achado: cab.filter((c) => c).slice(0, 6),
        });
        continue;
      }

      // quais colunas auxiliares existem em cada bloco
      const faltando = new Set();
      blocos.forEach((b, k) => {
        const fim = k + 1 < blocos.length ? blocos[k + 1].i : cab.length;
        const achou = { equipe: false, classe: false, tempo: false, segmento: false };
        for (let c = b.i + 1; c < fim; c++) {
          const t = norm(cab[c]);
          if (["COLEGIO", "COLÉGIO", "CIDADE", "EQUIPE", "ESCOLA"].includes(t)) achou.equipe = true;
          else if (t === "CLASSE") achou.classe = true;
          else if (t === "TEMPO") achou.tempo = true;
          else if (t === "SEGMENTO") achou.segmento = true;
        }
        for (const campo of (CAMPOS_EXIGIDOS[tipo] || [])) {
          // no escolar com paradesporto a CLASSE só é exigida nas abas paralímpicas
          if (campo === "classe" && tipo === "ESCOLAR_PARA" &&
              !ehParalimpica(categoriaDaAba(nomeAba).categoria, perfil)) continue;
          // o segmento vale se estiver na coluna OU no nome da aba
          if (campo === "segmento" && segmentoNaAba(nomeAba)) continue;
          if (!achou[campo]) faltando.add(campo);
        }
        if (tipo === "ESCOLAR_PARA" &&
            ehParalimpica(categoriaDaAba(nomeAba).categoria, perfil) && !achou.classe) {
          faltando.add("classe");
        }
      });

      if (faltando.size) {
        abasRuins.push({
          aba: nomeAba,
          motivo: "falta " + [...faltando].map((c) => ROTULO_CAMPO[c]).join(" e "),
          achado: cab.filter((c) => c).slice(0, 8),
        });
      } else {
        const { categoria, naipe } = categoriaDaAba(nomeAba);
        if (!naipe) {
          abasRuins.push({
            aba: nomeAba,
            motivo: 'o nome da aba não diz o naipe — use algo como "MIRIM-FEM" ou "MIRIM-MASC"',
            achado: [],
          });
        } else {
          abasBoas.push({ aba: nomeAba, categoria, naipe,
                          provas: blocos.length });
        }
      }
    }

    if (!abasBoas.length && !abasRuins.length) {
      problemas.push("a planilha não tem nenhuma aba com conteúdo.");
    }
    return {
      ok: abasBoas.length > 0 && abasRuins.length === 0,
      parcial: abasBoas.length > 0 && abasRuins.length > 0,
      abasBoas, abasRuins, problemas,
    };
  }

  /* ---------------- planilha modelo ---------------- */
  function gerarModelo(perfil) {
    const tipo = perfil.tipo || "ESCOLAR";
    const wb = XLSX.utils.book_new();
    const comClasse = tipo === "PARA" || tipo === "ESCOLAR_PARA";
    const rotEq = perfil.rotuloEquipe ||
                  (tipo === "PARA" ? "CIDADE" : "ESCOLA");

    const abas = {
      PARA: [["DF-FEM", ["50 LIVRE", "100 LIVRE", "100 COSTAS", "100 PEITO"]],
             ["DF-MASC", ["50 LIVRE", "100 LIVRE", "100 COSTAS", "100 PEITO"]],
             ["DV-FEM", ["50 LIVRE", "100 LIVRE", "100 COSTAS"]],
             ["DI-MASC", ["100 LIVRE", "100 COSTAS", "100 PEITO"]]],
      ESCOLAR: [['PRÉ-MIRIM "B"-FEM', ["25 LIVRE", "25 COSTAS", "25 PEITO", "4x25 LIVRE"]],
                ['PRÉ-MIRIM "B"-MASC', ["25 LIVRE", "25 COSTAS", "25 PEITO", "4x25 LIVRE"]],
                ["MIRIM-FEM", ["50 LIVRE", "50 COSTAS", "50 PEITO", "4x50 LIVRE"]],
                ["MIRIM-MASC", ["50 LIVRE", "50 COSTAS", "50 PEITO", "4x50 LIVRE"]]],
      ESCOLAR_PARA: [["MIRIM-FEM", ["50 LIVRE", "50 COSTAS"]],
                     ["MIRIM-MASC", ["50 LIVRE", "50 COSTAS"]],
                     ['PARAL "A"-FEM', ["25 LIVRE", "25 COSTAS"]],
                     ['PARAL "A"-MASC', ["25 LIVRE", "25 COSTAS"]]],
      TEMPO: [["INFANTIL-FEM", ["50 LIVRE", "100 LIVRE", "100 COSTAS"]],
              ["INFANTIL-MASC", ["50 LIVRE", "100 LIVRE", "100 COSTAS"]],
              ["JUVENIL-FEM", ["50 LIVRE", "100 LIVRE"]],
              ["JUVENIL-MASC", ["50 LIVRE", "100 LIVRE"]]],
    }[tipo];

    const exemplo = {
      PARA: [["MARIA EXEMPLO DA SILVA", "BLUMENAU", "DF", "S6/SB5/SM6", ""],
             ["JOAO EXEMPLO SANTOS", "JOINVILLE", "DF", "S9/SB8/SM9", ""]],
      ESCOLAR: [["MARIA EXEMPLO DA SILVA", "COLEGIO EXEMPLO", ""],
                ["JOAO EXEMPLO SANTOS", "ESCOLA MODELO", ""]],
      ESCOLAR_PARA: [["MARIA EXEMPLO DA SILVA", "COLEGIO EXEMPLO", "", ""],
                     ["JOAO EXEMPLO SANTOS", "ESCOLA MODELO", "", ""]],
      TEMPO: [["MARIA EXEMPLO DA SILVA", "CLUBE EXEMPLO", "31.20"],
              ["JOAO EXEMPLO SANTOS", "EQUIPE MODELO", "29.85"]],
    }[tipo];

    for (const [nomeAba, provas] of abas) {
      const paralimpica = tipo === "PARA" ||
        (tipo === "ESCOLAR_PARA" && /PARAL/.test(norm(nomeAba)));
      const aux = tipo === "PARA"
        ? [rotEq, "SEGMENTO", "CLASSE", "TEMPO"]
        : paralimpica ? [rotEq, "CLASSE", "TEMPO"] : [rotEq, "TEMPO"];
      const larg = aux.length + 1;

      const linhas = [[]];
      let col = 1;
      for (const prova of provas) {
        linhas[0][col] = prova;
        aux.forEach((a, k) => (linhas[0][col + 1 + k] = a));
        col += larg + 1;
      }
      linhas[0][0] = "N°";
      // duas linhas de exemplo no primeiro bloco
      exemplo.forEach((ex, r) => {
        const l = [];
        l[0] = r + 1;
        const vals = paralimpica || tipo === "PARA"
          ? ex : [ex[0], ex[1], ex[ex.length - 1]];
        vals.forEach((v, k) => (l[1 + k] = v));
        linhas.push(l);
      });
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      ws["!cols"] = [{ wch: 5 }].concat(
        Array(col).fill({ wch: 26 }));
      XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    }

    // aba de instruções
    const guia = [
      ["COMO PREENCHER"],
      [],
      ["1", "Uma aba por categoria e naipe. O nome da aba manda: MIRIM-FEM, MIRIM-MASC."],
      ["2", "A primeira linha traz o nome da prova e, à direita dele, as colunas auxiliares."],
      ["3", "Nome da prova: distância + estilo. Ex.: 50 LIVRE, 100 COSTAS, 4x50 LIVRE, 4x50 LIVRE MISTO."],
      ["4", "Estilos aceitos: LIVRE, COSTAS, PEITO, BORBOLETA, MEDLEY."],
      ["5", "Colunas auxiliares obrigatórias: " +
            (CAMPOS_EXIGIDOS[tipo] || []).map((c) => ROTULO_CAMPO[c]).join(" e ") + "."],
      ["6", "Deixe uma coluna em branco entre um bloco de prova e o próximo."],
      ["7", "Revezamento: escreva os 4 nomes na mesma célula, um por linha (Alt+Enter)."],
      ["8", "Prova sem ninguém: escreva SEM INSCRITOS na primeira linha do bloco."],
      [],
      ["NAO FACA"],
      ["", "Não deixe a primeira linha sem cabeçalho — o app recusa a planilha."],
      ["", "Não misture categorias diferentes na mesma aba."],
      ["", "Não junte nome e escola na mesma célula."],
    ];
    const wsG = XLSX.utils.aoa_to_sheet(guia);
    wsG["!cols"] = [{ wch: 5 }, { wch: 105 }];
    XLSX.utils.book_append_sheet(wb, wsG, "COMO PREENCHER");
    return wb;
  }

  /* ---------------- programa de provas ----------------
     A ordem oficial das provas não sai dos inscritos: ela vem do programa.
     Cada linha vira uma prova numerada, mesmo sem ninguém inscrito.
  ------------------------------------------------------ */

  // "1ª – 25m LIVRE PARALÍMPICO \"A\" + \"B\" FEMININO"
  // "9ª - 50m LIVRE MIRIM FEMININO"      "4x25m LIVRE PRÉ-MIRIM \"B\" MISTO"
  function lerLinhaPrograma(linha) {
    let t = String(linha || "").trim();
    if (!t) return null;
    t = t.replace(/^\s*\d+\s*[ªº°]?\s*[-–—:.)]*\s*/, "");   // tira "12ª -"
    const u = norm(t);
    const m = u.match(/^(4X\s*\d+|\d+)\s*M?(?:ETROS)?\s+(LIVRE|COSTAS?|PEITO|BORBOLETA|MEDLEY)\s+(.*)$/);
    if (!m) return null;
    const distancia = m[1].replace(/\s+/g, "") + "M";
    let estilo = m[2];
    if (estilo.indexOf("COSTA") === 0) estilo = "COSTAS";

    let resto = m[3].trim();
    let naipe = "";
    if (/\bMISTO\b/.test(resto)) { naipe = "MISTO"; resto = resto.replace(/\bMISTO\b/, ""); }
    else if (/\bMASCULINO\b|\bMASC\b/.test(resto)) {
      naipe = "MASC"; resto = resto.replace(/\bMASCULINO\b|\bMASC\b/, "");
    } else if (/\bFEMININO\b|\bFEM\b/.test(resto)) {
      naipe = "FEM"; resto = resto.replace(/\bFEMININO\b|\bFEM\b/, "");
    } else return null;

    const categoria = resto.replace(/\s+/g, " ").trim();
    if (!categoria) return null;
    // mantém o texto original da categoria para exibir bonito no título
    const bruto = t.replace(/^\S+\s+\S+\s+/, "").replace(/\s*(MISTO|MASCULINO|FEMININO|MASC|FEM)\s*$/i, "").trim();
    return { distancia, estilo, categoria, naipe, rotulo: bruto || categoria };
  }

  function lerPrograma(texto) {
    const linhas = String(texto || "").split(/\r?\n/);
    const provas = [], recusadas = [];
    linhas.forEach((l, k) => {
      if (!l.trim()) return;
      const p = lerLinhaPrograma(l);
      if (p) provas.push(p);
      else recusadas.push({ linha: k + 1, texto: l.trim() });
    });
    return { provas, recusadas };
  }

  function chaveProva(distancia, estilo, categoria, naipe) {
    return [distancia, estilo, chaveCategoria(categoria), naipe].join("|");
  }

  /* ---------------- montagem do balizamento ---------------- */

  /**
   * perfil: {
   *   raias, regraSerie, tipo,
   *   limites: { padraoIndividual, padraoRevezamento, porCategoria: {} },
   *   grupos: [{ rotulo, categorias: [...] }]   // categorias que nadam juntas
   *   ordemProvas: [chave...]                    // opcional
   * }
   */
  function montarBalizamento(inscricoes, perfil) {
    const raias = perfil.raias || 6;
    const regra = perfil.regraSerie || B.MENOS_SERIES;

    // categoria e naipe de cada inscrição
    for (const i of inscricoes) {
      if (!i.categoria || !i.naipe) {
        const c = categoriaDaAba(i.aba);
        i.categoria = i.categoria || c.categoria;
        i.naipe = i.naipe || c.naipe;
      }
      if (i.misto) i.naipe = "MISTO";
      i.categoriaProva = grupoDe(i.categoria, i.distancia, i.estilo, perfil);
    }

    // agrupa em provas, com a chave já normalizada
    const mapa = new Map();
    const rotulos = new Map();
    for (const i of inscricoes) {
      const k = chaveProva(i.distancia, i.estilo, i.categoriaProva, i.naipe);
      if (!mapa.has(k)) {
        mapa.set(k, []);
        rotulos.set(k, [i.distancia, i.estilo, i.categoriaProva, i.naipe]);
      }
      mapa.get(k).push(i);
    }

    // a ordem oficial vem do programa; sem programa, cai numa ordem natural
    let sequencia;
    const programa = perfil.programa || [];
    if (programa.length) {
      sequencia = programa.map((p) => ({
        chave: chaveProva(p.distancia, p.estilo, p.categoria, p.naipe),
        partes: [p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe],
        doPrograma: true,
      }));
      const noPrograma = new Set(sequencia.map((s) => s.chave));
      // quem tem inscrito mas não está no programa entra no fim, sinalizado
      [...mapa.keys()]
        .filter((k) => !noPrograma.has(k))
        .sort((a, b) => ordemNatural(rotulos.get(a).join("|"),
                                     rotulos.get(b).join("|")))
        .forEach((k) => sequencia.push({
          chave: k, partes: rotulos.get(k), doPrograma: false,
        }));
    } else {
      sequencia = [...mapa.keys()]
        .sort((a, b) => ordemNatural(rotulos.get(a).join("|"),
                                     rotulos.get(b).join("|")))
        .map((k) => ({ chave: k, partes: rotulos.get(k), doPrograma: false }));
    }

    const provas = [];
    sequencia.forEach((seq, idx) => {
      const [distancia, estilo, categoria, naipe] = seq.partes;
      const itens = mapa.get(seq.chave) || [];
      const revez = /^4X/.test(distancia);
      const paral = ehParalimpica(categoria, perfil);

      // elegibilidade por classe funcional
      const nadam = [], cortados = [];
      for (const i of itens) {
        if (paral && perfil.usarRegrasPara) {
          const ev = eventoRegras(distancia, estilo);
          const seg = i.segmento || perfil.segmentoPadrao || "";
          const res = B.classificar(seg, i.classe, ev);
          i.diagnostico = res;
          if (res.status === B.CORTE_REG || res.status === B.SEM_CLASSE) {
            cortados.push(Object.assign({}, i, {
              motivo: res.motivo, corteTipo: res.status,
            }));
            continue;
          }
        }
        nadam.push(i);
      }

      const series = B.montarSeries(nadam, {
        nRaias: raias, regra,
        nomeDe: (i) => i.nome, equipeDe: (i) => i.equipe,
        tempoDe: (i) => i.tempo,
      });

      provas.push({
        numero: idx + 1, chave: seq.chave, distancia, estilo, categoria, naipe,
        titulo: tituloProva(distancia, estilo, categoria, naipe),
        doPrograma: seq.doPrograma,
        aviso: (programa.length && !seq.doPrograma)
          ? "esta prova não consta no programa oficial — confira a inscrição"
          : "",
        revezamento: revez, paralimpica: paral, nRaias: raias,
        series, cortados,
        total: nadam.length,
        atletas: series.reduce((s, se) => s + se.linhas.reduce(
          (t, l) => t + (l.item.atletas ? l.item.atletas.length : 1), 0), 0),
      });
    });
    return provas;
  }

  function ordemNatural(a, b) {
    const pa = a.split("|"), pb = b.split("|");
    const est = ["LIVRE", "COSTAS", "PEITO", "BORBOLETA", "MEDLEY"];
    const d = (x) => parseInt(String(x).replace(/\D/g, ""), 10) || 0;
    return (/^4X/.test(pa[0]) ? 1 : 0) - (/^4X/.test(pb[0]) ? 1 : 0) ||
           est.indexOf(pa[1]) - est.indexOf(pb[1]) ||
           d(pa[0]) - d(pb[0]) ||
           pa[2].localeCompare(pb[2]) ||
           ["FEM", "MASC", "MISTO"].indexOf(pa[3]) -
           ["FEM", "MASC", "MISTO"].indexOf(pb[3]);
  }

  // Compara categorias ignorando aspas e pontuação: PARAL "A" == PARAL A
  function chaveCategoria(t) {
    return norm(t).replace(/["'“”‘’.\-–—]/g, "").replace(/\s+/g, " ").trim();
  }

  function grupoDe(categoria, distancia, estilo, perfil) {
    const c = chaveCategoria(categoria);
    for (const g of (perfil.grupos || [])) {
      if (!(g.categorias || []).map(chaveCategoria).includes(c)) continue;
      if (g.distancias && g.distancias.length &&
          !g.distancias.includes(distancia)) continue;
      if (g.estilos && g.estilos.length && !g.estilos.includes(estilo)) continue;
      return g.rotulo;
    }
    return categoria;
  }

  function ehParalimpica(categoria, perfil) {
    const c = chaveCategoria(categoria);
    return (perfil.categoriasPara || []).some((p) => c.includes(chaveCategoria(p)));
  }

  function tituloProva(distancia, estilo, categoria, naipe) {
    const n = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[naipe] || naipe;
    const d = /^4X/.test(distancia)
      ? distancia.replace("X", "x").toLowerCase() : distancia.toLowerCase();
    return (d + " " + estilo + " " + categoria + " " + n).toUpperCase();
  }

  /* ---------------- lista achatada para conferência ---------------- */
  function inscricoesPlanas(provas) {
    const saida = [];
    for (const p of provas) {
      for (const s of p.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const nomes = it.atletas && it.atletas.length ? it.atletas : [it.nome];
          for (const nome of nomes) {
            saida.push({
              nome, equipe: it.equipe, categoria: it.categoria,
              classe: it.classe, tituloProva: p.titulo, prova: p.numero,
              serie: s.numero, raia: l.raia, revezamento: p.revezamento,
            });
          }
        }
      }
    }
    return saida;
  }

  const api = {
    lerCabecalhoProva, lerPlanilhaBlocos, lerPlanilhaLinhas, categoriaDaAba, chaveCategoria,
    lerPrograma, lerLinhaPrograma, chaveProva, conferirPlanilha, gerarModelo,
    montarBalizamento, inscricoesPlanas, tituloProva, eventoRegras, COLUNAS_MODELO,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorDados = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
