/* =====================================================================
   BALIZADOR, leitura de planilhas e montagem do balizamento
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

  // Uma chave de categoria só no app inteiro, a do núcleo. Quando existiam
  // duas, uma que tirava o hífen e outra que não, PRÉ-MIRIM "B" e PRE MIRIM B
  // caíam na mesma prova e mesmo assim o atleta era acusado de estar em duas
  // categorias ao mesmo tempo.
  const chaveCategoria = B.chaveDeCategoria;

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
    const descartadas = [];

    for (const nomeAba of wb.SheetNames) {
      if (ignorar.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      if (!grade.length || cabecalhoCanonico(grade)) continue;
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
          else if (ROTULOS_LISTA.nascimento.includes(t)) b.aux.nascimento = c;
        }
      });

      const info = { aba: nomeAba, provas: blocos.map((b) => b.info), linhas: 0 };
      const cat = categoriaDaAba(nomeAba);
      for (let r = 1; r < grade.length; r++) {
        const linha = grade[r] || [];
        // cada bloco da linha é uma inscrição diferente: o sub separa uma da
        // outra, senão tirar uma da conferência tirava a linha inteira
        for (let sub = 0; sub < blocos.length; sub++) {
          const b = blocos[sub];
          const bruto = linha[b.col];
          const cel = (c) => c == null ? ""
            : String(linha[c] == null ? "" : linha[c]).trim();
          const equipe = cel(b.aux.equipe);
          const txt = bruto == null ? "" : String(bruto).trim();
          if (!txt) {
            // linha com a instituição preenchida e sem nome nenhum ao lado:
            // no formato em lista isso já era apontado, aqui sumia calado
            if (equipe || cel(b.aux.tempo)) {
              descartadas.push({ aba: nomeAba, linha: r + 1, sub, equipe,
                prova: tituloProva(b.info.distancia, b.info.estilo,
                                   cat.categoria, cat.naipe || b.info.naipe || ""),
                motivo: "tem a instituição preenchida mas não tem o nome do atleta" });
            }
            continue;
          }
          if (norm(txt) === "SEM INSCRITOS") continue;
          const classe = cel(b.aux.classe);
          const tempo = b.aux.tempo != null ? B.lerTempo(linha[b.aux.tempo]) : null;
          const segmento = cel(b.aux.segmento);
          const excecao = cel(b.aux.excecao);

          const base = {
            aba: nomeAba, linha: r + 1, sub, equipe,
            classe, tempo, tempoTexto: cel(b.aux.tempo),
            nascimento: cel(b.aux.nascimento),
            segmento, excecao,
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
    return { inscricoes, abas, descartadas };
  }

  /* ---------------- leitura de uma planilha em lista ----------------
     O formato mais fácil de montar, e por isso o que o app pede primeiro:
     uma planilha só, sem aba nenhuma para nomear. O cabeçalho de cada prova
     traz tudo, "50M LIVRE MASCULINO", e embaixo dele vêm os atletas.
     Acabou uma prova, começa a próxima logo abaixo.

       A                    B                 C        D
     1 50M LIVRE MASCULINO  ESCOLA            CLASSE   TEMPO
     2 JOÃO DA SILVA        COLÉGIO EXEMPLO   S9       31.20
     3 PEDRO SANTOS         ESCOLA MODELO              29.85
     4
     5 50M LIVRE FEMININO   ESCOLA            CLASSE   TEMPO
     6 MARIA DE SOUZA       COLÉGIO EXEMPLO            33.40
  ------------------------------------------------------------------- */

  const ROTULOS_LISTA = {
    nome: ["NOME", "ATLETA", "NOME DO ATLETA", "NOME COMPLETO", "NADADOR",
           "NADADORA", "NADADORES"],
    equipe: ["EQUIPE", "ESCOLA", "COLEGIO", "CIDADE", "CLUBE", "ENTIDADE",
             "INSTITUICAO", "MUNICIPIO", "TIME", "ASSOCIACAO"],
    segmento: ["SEGMENTO", "CONDICAO", "DEFICIENCIA"],
    classe: ["CLASSE", "CLASSIFICACAO", "CLASSE FUNCIONAL"],
    tempo: ["TEMPO", "MELHOR TEMPO", "TEMPO DE INSCRICAO", "T INSCRICAO"],
    categoria: ["CATEGORIA", "CAT"],
    excecao: ["EXCESSAO", "EXCECAO", "OBS", "OBSERVACAO", "OBSERVACOES"],
    // opcional em qualquer competição: é ela que deixa o app conferir se o
    // atleta está na categoria de idade certa
    nascimento: ["NASCIMENTO", "DATA DE NASCIMENTO", "DATA NASCIMENTO",
                 "DT NASCIMENTO", "NASC", "ANO", "ANO DE NASCIMENTO"],
  };

  /**
   * Cabeçalho de um bloco da lista: distância, estilo, categoria (que pode
   * faltar) e naipe. Sem naipe não é cabeçalho: é o naipe que separa este
   * formato do de blocos lado a lado, onde ele vem do nome da aba.
   */
  function lerCabecalhoLista(texto) {
    let t = String(texto == null ? "" : texto).trim();
    if (!t) return null;
    t = t.replace(/^\s*\d+\s*[ªº°]\s*[-–—:.)]*\s*/, "")
         .replace(/^\s*\d+\s*[-–—:.)]\s*/, "");
    const u = norm(t);
    const m = u.match(/^(\d+\s*X\s*\d+|\d+)\s*M?(?:ETROS)?\s+(LIVRE|COSTAS?|PEITO|BORBOLETA|MEDLEY)\s+(.*)$/);
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
    const bruto = t.replace(/^\S+\s+\S+\s+/, "")
                   .replace(/\s*(MISTO|MASCULINO|FEMININO|MASC|FEM)\s*$/i, "").trim();
    return {
      distancia, estilo, categoria, naipe, rotulo: bruto || categoria,
      revezamento: /^\d+X/.test(distancia), misto: naipe === "MISTO",
      evento: distancia.replace(/M$/, "") + " " + estilo,
    };
  }

  function indicePrimeiraCelula(linha) {
    for (let c = 0; c < (linha || []).length; c++)
      if (linha[c] != null && String(linha[c]).trim()) return c;
    return -1;
  }

  /* Esta aba está em lista vertical, ou em blocos lado a lado?
     Só a lista empilha cabeçalhos de prova abaixo da primeira linha. E uma
     lista com uma prova só é reconhecida pelo naipe: ele está no cabeçalho,
     e não no nome da aba. */
  function ehAbaLista(nomeAba, grade) {
    for (let r = 1; r < grade.length; r++) {
      const idx = indicePrimeiraCelula(grade[r]);
      if (idx >= 0 && lerCabecalhoLista(grade[r][idx])) return true;
    }
    const idx0 = indicePrimeiraCelula(grade[0] || []);
    if (idx0 < 0) return false;
    return !!(lerCabecalhoLista(grade[0][idx0]) && !categoriaDaAba(nomeAba).naipe);
  }

  function blocoDaLista(cab, linha, idx) {
    const aux = {};
    for (let c = idx + 1; c < linha.length; c++) {
      const t = norm(linha[c]);
      if (!t) continue;
      for (const campo of Object.keys(ROTULOS_LISTA)) {
        if (aux[campo] != null) continue;
        if (ROTULOS_LISTA[campo].includes(t)) { aux[campo] = c; break; }
      }
    }
    // sem uma coluna NOME, os nomes ficam na própria coluna do cabeçalho
    return { info: cab, aux, colNome: aux.nome != null ? aux.nome : idx };
  }

  function lerPlanilhaLista(wb, opts) {
    opts = opts || {};
    const ignorar = (opts.ignorar || []).map(norm);
    const inscricoes = [];
    const abas = [];
    const descartadas = [];
    const repetidas = [];

    for (const nomeAba of wb.SheetNames) {
      if (ignorar.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      if (!grade.length || cabecalhoCanonico(grade) || !ehAbaLista(nomeAba, grade)) continue;

      const info = { aba: nomeAba, provas: [], linhas: 0 };
      let bloco = null;
      const cabecalhosVistos = new Map();
      for (let r = 0; r < grade.length; r++) {
        const linha = grade[r] || [];
        const idx = indicePrimeiraCelula(linha);
        if (idx < 0) continue;                       // linha em branco: pula

        const cab = lerCabecalhoLista(linha[idx]);
        if (cab) {
          bloco = blocoDaLista(cab, linha, idx);
          info.provas.push(cab);
          // o mesmo cabeçalho duas vezes junta os dois blocos numa prova só.
          // Às vezes é de propósito, às vezes é bloco copiado e não trocado
          const k = chaveProva(cab.distancia, cab.estilo, cab.categoria, cab.naipe);
          if (cabecalhosVistos.has(k)) {
            repetidas.push({
              aba: nomeAba, linha: r + 1, antes: cabecalhosVistos.get(k),
              prova: tituloProva(cab.distancia, cab.estilo,
                                 cab.rotulo || cab.categoria, cab.naipe),
            });
          } else cabecalhosVistos.set(k, r + 1);
          continue;
        }
        if (!bloco) continue;                        // ainda não começou nenhuma prova

        const val = (c) => c == null ? ""
          : String(linha[c] == null ? "" : linha[c]).trim();
        const nome = val(bloco.colNome);
        const equipe = val(bloco.aux.equipe);
        if (norm(nome) === "SEM INSCRITOS") continue;
        if (!nome && !equipe) continue;

        const base = {
          aba: nomeAba, linha: r + 1, equipe,
          classe: val(bloco.aux.classe), segmento: val(bloco.aux.segmento),
          excecao: val(bloco.aux.excecao),
          nascimento: val(bloco.aux.nascimento),
          // o tempo como veio escrito, para a conferência poder mostrar a
          // leitura ao lado do que estava na planilha
          tempoTexto: val(bloco.aux.tempo),
          tempo: bloco.aux.tempo != null ? B.lerTempo(linha[bloco.aux.tempo]) : null,
          categoria: val(bloco.aux.categoria) || bloco.info.categoria,
          naipe: bloco.info.naipe,
          // o cabeçalho já disse categoria e naipe: não caia no nome da aba
          categoriaDefinida: true,
          distancia: bloco.info.distancia, estilo: bloco.info.estilo,
          misto: bloco.info.misto, revezamento: bloco.info.revezamento,
        };

        if (bloco.info.revezamento) {
          const atletas = nome.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          inscricoes.push(Object.assign({}, base, {
            nome: equipe || atletas[0] || nome,
            atletas,
            // revezamento inscrito só com a equipe: os nadadores saem no dia
            semLista: atletas.length === 0,
          }));
          info.linhas++;
          continue;
        }
        if (!nome) {
          descartadas.push({ aba: nomeAba, linha: r + 1, equipe,
            prova: tituloProva(bloco.info.distancia, bloco.info.estilo,
                                bloco.info.rotulo || bloco.info.categoria,
                                bloco.info.naipe),
            motivo: "tem a instituição preenchida mas não tem o nome do atleta",
            // guarda o resto da linha: com o nome digitado na conferência,
            // a inscrição volta sem precisar mexer na planilha
            base: Object.assign({}, base, { atletas: null }) });
          continue;
        }
        inscricoes.push(Object.assign({}, base, { nome, atletas: null }));
        info.linhas++;
      }
      if (info.provas.length) abas.push(info);
    }
    return { inscricoes, abas, descartadas, repetidas };
  }

  /* ---------------- formato canônico: uma linha por inscrição ----------
     É o destino de tudo o que não chega num dos formatos de prova. A planilha
     feita à mão neste formato e a que a etapa de IA organizou passam pelo
     mesmo normalizador, e por isso caem nas mesmas provas e nas mesmas
     conferências. Nada aqui adivinha: o que não for entendido volta com o
     motivo escrito, para quem estiver revisando decidir.

       NOME | EQUIPE | PROVA (ou DISTÂNCIA e ESTILO) | CATEGORIA | NAIPE |
       TEMPO | NASCIMENTO | CLASSE | SEGMENTO
  -------------------------------------------------------------------- */
  const COLUNAS_MODELO = {
    nome: ["NOME", "ATLETA", "NOME DO ATLETA", "NADADOR", "NADADORA"],
    equipe: ["EQUIPE", "ESCOLA", "COLEGIO", "CIDADE", "ENTIDADE", "CLUBE",
             "INSTITUICAO"],
    categoria: ["CATEGORIA", "CLASSE ETARIA", "FAIXA ETARIA"],
    naipe: ["NAIPE", "SEXO", "GENERO"],
    prova: ["PROVA", "NOME DA PROVA"],
    distancia: ["DISTANCIA", "DIST", "METRAGEM"],
    estilo: ["ESTILO", "NADO"],
    segmento: ["SEGMENTO"],
    classe: ["CLASSE", "CLASSIFICACAO", "CLASSE FUNCIONAL"],
    tempo: ["TEMPO", "TEMPO DE INSCRICAO", "MELHOR TEMPO"],
    nascimento: ["NASCIMENTO", "DATA DE NASCIMENTO", "DATA NASCIMENTO",
                 "DT NASCIMENTO", "NASC", "ANO", "ANO DE NASCIMENTO"],
    // de onde a linha veio, quando ela foi organizada a partir de outra
    // planilha: o app só mostra, quem manda é a posição da linha nesta aba
    origem: ["ORIGEM", "LINHA DE ORIGEM"],
  };

  const textoDe = (v) => String(v == null ? "" : v).trim();

  /* A grade de uma aba com o número de linha de verdade. A planilha que não
     começa na A1 tem o "!ref" deslocado, e contar a partir do zero apontaria
     a linha errada para quem for conferir no Excel. */
  function gradeDaAba(ws) {
    const grade = XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: false, defval: null, blankrows: true });
    const ref = ws && ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    /* A data guardada como data do Excel sai no formato americano (m/d/yy):
       09/05/2014 virava "5/9/14", lido como 5 de setembro (no teste gigante,
       ainda um dia antes, pelo fuso). Aqui ela volta a dd/mm/aaaa a partir do
       número da data. Tempo guardado como hora fica de fora: é menor que 1. */
    if (ref) {
      for (const k of Object.keys(ws)) {
        if (k[0] === "!") continue;
        const c = ws[k];
        if (!c || c.t !== "n" || !(c.v >= 1 && c.v < 80000)) continue;
        if (!/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(String(c.w || "").trim())) continue;
        const p = XLSX.SSF.parse_date_code(Math.round(c.v));
        if (!p || !p.y) continue;
        const pos = XLSX.utils.decode_cell(k), row = grade[pos.r - ref.s.r];
        if (row) row[pos.c - ref.s.c] = `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
      }
    }
    return { grade, linha0: ref ? ref.s.r : 0, coluna0: ref ? ref.s.c : 0 };
  }

  // a linha de cabeçalho do formato canônico, nas primeiras linhas da aba:
  // precisa dizer quem nada (NOME ou EQUIPE) e o que nada (PROVA, ou
  // DISTÂNCIA com ESTILO)
  function cabecalhoCanonico(grade) {
    const ate = Math.min(grade.length, 10);
    for (let r = 0; r < ate; r++) {
      const mapa = {};
      (grade[r] || []).forEach((cel, c) => {
        const u = norm(cel).replace(/[.:]+$/, "");
        if (!u) return;
        for (const [campo, nomes] of Object.entries(COLUNAS_MODELO)) {
          if (mapa[campo] != null) continue;
          if (nomes.includes(u)) { mapa[campo] = c; return; }
        }
      });
      const quem = mapa.nome != null || mapa.equipe != null;
      const oque = mapa.prova != null || (mapa.distancia != null && mapa.estilo != null);
      if (quem && oque) return { linha: r, mapa };
    }
    return null;
  }

  /* A prova escrita de qualquer jeito que ainda dê para ler sem chutar:
     "50M LIVRE MIRIM FEMININO", "12ª - 50m nado livre Mirim F",
     "4x50 crawl misto". Devolve só o que entendeu; o resto fica em branco. */
  function lerProvaPorExtenso(texto) {
    let t = textoDe(texto)
      .replace(/^\s*(PROVA\s*)?\d+\s*[ªº°]\s*[-–—:.)]*\s*/i, "")
      .replace(/^\s*PROVA\s*\d+\s*[-–—:.)]?\s*/i, "")
      .replace(/^\s*\d+\s*[-–—:.)]\s+/, "")
      .replace(/^\s*(REVEZAMENTO|REV\.?)\s+/i, "");
    // maiúsculas sem tirar o acento: a categoria sai como foi escrita,
    // PRÉ-MIRIM e não PRE-MIRIM
    // "50L", "50 C", "100P": a letra do estilo colada na distância, como muita ficha abrevia
    // (no teste das 10 equipes, "50L MIR MASC" saía); o M fica de fora, que é de metros
    const ESTILO_LETRA = { L: "LIVRE", C: "COSTAS", P: "PEITO", B: "BORBOLETA" };
    const u = t.toUpperCase().replace(/\s+/g, " ").trim()
      .replace(/^(\d+)\s*([LCPB])(?=\s|$)/, (x, d, e) => d + "M " + ESTILO_LETRA[e]);
    const m = u.match(/^(\d+\s*X\s*\d+|\d+)\s*M?(?:ETROS?)?\s+(?:NADO\s+)?(LIVRE|CRAWL|COSTAS?|DORSO|PEITO|BORBOLETA|GOLFINHO|MEDLEY)\b(.*)$/);
    if (!m) return null;
    // o hífen dentro da palavra fica (PRÉ-MIRIM); o que separa pedaços sai
    let resto = " " + m[3].replace(/^[\s\-–—:]+/, "").replace(/\s[-–—]\s/g, " ")
                          .replace(/[,;/().]/g, " ") + " ";
    let naipe = "";
    const achaNaipe = [["MISTO", /\s(MISTO|MISTA)\s/], ["MASC", /\s(MASCULINO|MASC|M)\s/],
                       ["FEM", /\s(FEMININO|FEM|F)\s/]];
    for (const [n, re] of achaNaipe) {
      if (re.test(resto)) { naipe = n; resto = resto.replace(re, " "); break; }
    }
    // "CATEGORIA MIRIM" é MIRIM: o rótulo veio junto do título
    resto = resto.replace(/\s(CATEGORIA|CAT|NAIPE|PROVA)\s/g, " ");
    return {
      distancia: normalizarDistancia(m[1]),
      estilo: normalizarEstilo(m[2]),
      categoria: resto.replace(/\s+/g, " ").trim(),
      naipe,
    };
  }

  /**
   * Uma inscrição a partir dos campos de uma linha no formato canônico.
   *   campos: { nome, equipe, prova, distancia, estilo, categoria, naipe,
   *             tempo, nascimento, classe, segmento }, todos texto
   *   origem: { aba, linha, sub }   sub separa as inscrições da mesma linha
   * Devolve { inscricao, problemas, avisos }. Havendo problema, a inscrição
   * vem null: é o caso de quem revisa resolver, não do app adivinhar.
   */
  function inscricaoCanonica(campos, origem) {
    const c = {};
    for (const k of Object.keys(COLUNAS_MODELO)) c[k] = textoDe(campos[k]);
    const problemas = [], avisos = [];
    const porExtenso = c.prova ? lerProvaPorExtenso(c.prova) : null;
    const ext = porExtenso || {};

    // a coluna própria vale mais que a prova por extenso, e as duas
    // dizendo coisas diferentes é problema, não escolha
    const escolhe = (coluna, extenso, nome) => {
      if (coluna && extenso && coluna !== extenso) {
        problemas.push(`a prova diz ${extenso} e a coluna ${nome} diz ${coluna}`);
      }
      return coluna || extenso || "";
    };
    const distancia = escolhe(normalizarDistancia(c.distancia), ext.distancia, "DISTÂNCIA");
    const estilo = escolhe(normalizarEstilo(c.estilo), ext.estilo, "ESTILO");
    const naipe = escolhe(normalizarNaipe(c.naipe), ext.naipe, "NAIPE");
    const categoria = (c.categoria || ext.categoria || "").replace(/\s+/g, " ");

    if (!distancia) {
      problemas.push(c.distancia ? `não entendi a distância "${c.distancia}"`
        : c.prova ? `não entendi a prova "${c.prova}"` : "falta a prova");
    }
    if (!estilo && (porExtenso || c.estilo || !c.prova)) {
      problemas.push(c.estilo ? `não entendi o estilo "${c.estilo}"` : "falta o estilo");
    }
    if (!naipe) {
      problemas.push(c.naipe ? `não entendi o naipe "${c.naipe}"`
        : "falta o naipe: FEMININO, MASCULINO ou MISTO");
    }

    const revezamento = /^\d+X/.test(distancia);
    // o nome todo em minúsculas entra em maiúsculas, como os outros da lista (no teste gigante,
    // "maria eduarda pires" saía assim no PDF); quem escreveu com maiúscula e minúscula fica como escreveu
    let nome = c.nome && c.nome === c.nome.toLowerCase() ? c.nome.toUpperCase() : c.nome, atletas = null, semLista = false;
    if (revezamento) {
      // no revezamento quem ocupa a raia é a equipe; nomes escritos são rascunho
      atletas = c.nome.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      semLista = atletas.length === 0;
      nome = c.equipe || atletas[0] || "";
      if (!c.equipe) problemas.push("revezamento sem a equipe");
    } else if (!nome) {
      problemas.push("falta o nome do atleta");
    } else if (norm(nome) === "SEM INSCRITOS") {
      problemas.push("a linha diz SEM INSCRITOS");
    }

    const tempo = c.tempo ? B.lerTempo(c.tempo) : null;
    // "sem tempo" escrito de qualquer jeito é sem tempo, e não tem o que avisar
    const semTempo = /^(9{1,2}[:.,]9{2}([:.,]9{1,2})?|SEM TEMPO|SEM MARCA|S\/?T|N\/?T|-+|–|—|X)$/i;
    if (c.tempo && tempo == null && !semTempo.test(c.tempo)) {
      avisos.push(`o tempo "${c.tempo}" não foi entendido e vai como sem tempo`);
    }

    if (problemas.length) return { inscricao: null, problemas, avisos };
    origem = origem || {};
    const inscricao = {
      aba: origem.aba || "", linha: origem.linha || 0,
      nome, equipe: c.equipe, categoria, naipe,
      // a linha já disse categoria e naipe: o nome da aba não entra
      categoriaDefinida: true,
      segmento: c.segmento, classe: c.classe,
      tempo, tempoTexto: c.tempo, nascimento: c.nascimento, excecao: "",
      distancia, estilo, misto: naipe === "MISTO", revezamento,
      atletas, semLista,
    };
    if (origem.sub != null) inscricao.sub = origem.sub;
    if (c.origem) inscricao.origem = c.origem;
    return { inscricao, problemas, avisos };
  }

  // a linha da planilha como ela estava, para quem confere ver do que se fala
  function vistoDaLinha(linha) {
    return (linha || []).map(textoDe).filter(Boolean).join("  ·  ");
  }

  /* Lê todas as abas que estiverem no formato canônico. Uma linha que não dê
     para entender volta em `recusadas`, com o motivo: é a conferência do
     formato que decide se a planilha passa. */
  function lerPlanilhaLinhas(wb, opts) {
    opts = opts || {};
    const ignorar = (opts.ignorar || []).map(norm);
    const inscricoes = [], abas = [], recusadas = [];
    for (const nomeAba of wb.SheetNames) {
      if (ignorar.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const { grade, linha0 } = gradeDaAba(ws);
      const cab = cabecalhoCanonico(grade);
      if (!cab) continue;
      const info = { aba: nomeAba, provas: [], linhas: 0 };
      const vistas = new Set();
      for (let r = cab.linha + 1; r < grade.length; r++) {
        const linha = grade[r] || [];
        if (!linha.some((x) => textoDe(x))) continue;
        const campos = {};
        for (const [campo, col] of Object.entries(cab.mapa)) campos[campo] = linha[col];
        if (norm(campos.nome) === "SEM INSCRITOS") continue;
        const n = linha0 + r + 1;
        const lida = inscricaoCanonica(campos, { aba: nomeAba, linha: n });
        if (!lida.inscricao) {
          recusadas.push({ aba: nomeAba, linha: n, texto: vistoDaLinha(linha),
                           motivo: lida.problemas.join("; ") });
          continue;
        }
        const i = lida.inscricao;
        const k = i.distancia + " " + i.estilo;
        if (!vistas.has(k)) { vistas.add(k); info.provas.push({ distancia: i.distancia, estilo: i.estilo }); }
        inscricoes.push(i);
        info.linhas++;
      }
      abas.push(info);
    }
    return { inscricoes, abas, recusadas, descartadas: [], repetidas: [] };
  }

  /* Confere uma aba no formato canônico. As colunas que o tipo de competição
     exige têm de existir, e toda linha tem de ser entendida: uma inscrição
     que somisse aqui só apareceria como falta no dia da prova. */
  function conferirAbaLinhas(nomeAba, ws, grade, cab, tipo) {
    const faltando = new Set();
    for (const campo of (CAMPOS_EXIGIDOS[tipo] || [])) {
      if (campo === "classe" && tipo === "ESCOLAR_PARA") continue;
      if (campo === "segmento" && cab.mapa.categoria != null) continue;
      if (cab.mapa[campo] == null) faltando.add(campo);
    }
    const achado = (grade[cab.linha] || []).filter((c) => textoDe(c)).map(String).slice(0, 8);
    if (faltando.size) {
      return { ruim: { aba: nomeAba, achado,
        motivo: "falta " + [...faltando].map((c) => ROTULO_CAMPO[c]).join(" e ") } };
    }
    const lida = lerPlanilhaLinhas({ SheetNames: [nomeAba], Sheets: { [nomeAba]: ws } });
    if (lida.recusadas.length) {
      const exemplos = lida.recusadas.slice(0, 3)
        .map((x) => `linha ${x.linha}: ${x.motivo}`).join("; ");
      return { ruim: { aba: nomeAba, achado,
        motivo: `${lida.recusadas.length} linha(s) não foram entendidas. ${exemplos}` } };
    }
    return { boa: { aba: nomeAba, categoria: "", naipe: "",
                    provas: lida.abas.length ? lida.abas[0].provas.length : 0,
                    formato: "linhas" } };
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
    segmento: "o SEGMENTO (DF, DV, DI, DA, TEA-DOWN): na coluna SEGMENTO " +
              "ou no nome da aba, como DF-FEM",
  };
  const SEGMENTOS = ["DF", "DV", "DI", "DA", "TEA"];

  // o segmento pode vir da coluna ou do nome da aba (DF-FEM, DV-MASC)
  function segmentoNaAba(nomeAba) {
    const u = norm(nomeAba);
    return SEGMENTOS.some((s) => u.startsWith(s + "-") || u === s);
  }

  // no formato de lista o segmento pode estar na categoria do cabeçalho:
  // "50M LIVRE DF MASCULINO"
  function segmentoNaCategoria(categoria) {
    const u = norm(categoria);
    return SEGMENTOS.some((s) => u === s || u.startsWith(s + " ") || u.startsWith(s + "-"));
  }

  /* Confere uma aba escrita em lista vertical: cada bloco precisa das colunas
     auxiliares que o tipo de competição exige. */
  function conferirAbaLista(nomeAba, grade, perfil, tipo) {
    const faltando = new Set();
    let provas = 0;
    for (let r = 0; r < grade.length; r++) {
      const linha = grade[r] || [];
      const idx = indicePrimeiraCelula(linha);
      if (idx < 0) continue;
      const cab = lerCabecalhoLista(linha[idx]);
      if (!cab) continue;
      provas++;
      const bloco = blocoDaLista(cab, linha, idx);
      for (const campo of (CAMPOS_EXIGIDOS[tipo] || [])) {
        if (campo === "classe" && tipo === "ESCOLAR_PARA" &&
            !ehParalimpica(cab.categoria, perfil)) continue;
        if (campo === "segmento" && segmentoNaCategoria(cab.categoria)) continue;
        if (bloco.aux[campo] == null) faltando.add(campo);
      }
      if (tipo === "ESCOLAR_PARA" && ehParalimpica(cab.categoria, perfil) &&
          bloco.aux.classe == null) faltando.add("classe");
    }
    if (!provas) {
      return { ruim: {
        aba: nomeAba,
        motivo: "não achei nenhum cabeçalho de prova nesta aba",
        achado: (grade[0] || []).filter((c) => c).map(String).slice(0, 6),
      } };
    }
    if (faltando.size) {
      return { ruim: {
        aba: nomeAba,
        motivo: "falta " + [...faltando].map((c) => ROTULO_CAMPO[c]).join(" e "),
        achado: (grade[0] || []).filter((c) => c).map(String).slice(0, 8),
      } };
    }
    return { boa: { aba: nomeAba, categoria: "", naipe: "", provas, formato: "lista" } };
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

      // o canônico vem antes: com a PROVA na coluna A, cada linha dele
      // pareceria um cabeçalho da lista vertical
      const canonico = cabecalhoCanonico(grade);
      if (canonico) {
        const r = conferirAbaLinhas(nomeAba, ws, grade, canonico, tipo);
        if (r.boa) abasBoas.push(r.boa); else abasRuins.push(r.ruim);
        continue;
      }

      if (ehAbaLista(nomeAba, grade)) {
        const r = conferirAbaLista(nomeAba, grade, perfil, tipo);
        if (r.boa) abasBoas.push(r.boa); else abasRuins.push(r.ruim);
        continue;
      }

      const blocos = cab.map((c, i) => ({ i, info: lerCabecalhoProva(c) }))
                        .filter((b) => b.info);
      if (!blocos.length) {
        abasRuins.push({
          aba: nomeAba,
          motivo: cab.some((c) => c)
            ? "a primeira linha não tem nenhum nome de prova reconhecível"
            : "a primeira linha está vazia: sem cabeçalho não dá para saber o que é cada coluna",
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
            motivo: 'o nome da aba não diz o naipe: use algo como "MIRIM-FEM" ou "MIRIM-MASC"',
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

  /* ---------------- planilha modelo dos inscritos ----------------
     Sai no formato de lista: uma planilha só, uma prova embaixo da outra.
     Havendo programa de provas, o modelo já vem com as provas da competição
     na ordem certa; o trabalho que sobra é digitar os nomes.
  ---------------------------------------------------------------- */
  const PROVAS_EXEMPLO = {
    PARA: [["50M", "LIVRE", "DF", "FEM"], ["50M", "LIVRE", "DF", "MASC"],
           ["100M", "LIVRE", "DV", "FEM"], ["100M", "PEITO", "DI", "MASC"]],
    ESCOLAR: [["25M", "LIVRE", 'PRÉ-MIRIM "B"', "FEM"],
              ["25M", "LIVRE", 'PRÉ-MIRIM "B"', "MASC"],
              ["50M", "COSTAS", "MIRIM", "FEM"],
              ["4X50M", "LIVRE", "MIRIM", "MISTO"]],
    ESCOLAR_PARA: [["50M", "LIVRE", "MIRIM", "FEM"],
                   ["50M", "LIVRE", "MIRIM", "MASC"],
                   ["25M", "LIVRE", 'PARALÍMPICO "A"', "FEM"],
                   ["4X50M", "LIVRE", "MIRIM", "MISTO"]],
    TEMPO: [["50M", "LIVRE", "INFANTIL", "FEM"], ["50M", "LIVRE", "INFANTIL", "MASC"],
            ["100M", "LIVRE", "JUVENIL", "FEM"], ["4X50M", "LIVRE", "JUVENIL", "MISTO"]],
  };

  const NAIPE_POR_EXTENSO = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" };

  // o nome do exemplo segue o naipe da prova, senão ensina errado
  const NOMES_EXEMPLO = {
    FEM: ["MARIA EXEMPLO DA SILVA", "LARA EXEMPLO DIAS"],
    MASC: ["JOÃO EXEMPLO SANTOS", "PEDRO EXEMPLO LIMA"],
  };

  function cabecalhoDeProva(distancia, estilo, categoria, naipe) {
    return [String(distancia).toUpperCase(), estilo, categoria,
            NAIPE_POR_EXTENSO[naipe] || naipe].filter(Boolean).join(" ");
  }

  function gerarModelo(perfil) {
    const tipo = perfil.tipo || "ESCOLAR";
    const wb = XLSX.utils.book_new();
    const funcional = tipo === "PARA";
    const comClasse = tipo === "PARA" || tipo === "ESCOLAR_PARA";
    const rotEq = "EQUIPE";   // o cabeçalho da coluna é sempre EQUIPE

    // as provas: as do programa, se houver; senão um punhado de exemplo
    const doPrograma = (perfil.programa || []).length > 0;
    const provas = doPrograma
      ? perfil.programa.map((p) => [p.distancia, p.estilo,
                                    p.rotulo || p.categoria, p.naipe, p.etapa])
      : (PROVAS_EXEMPLO[tipo] || PROVAS_EXEMPLO.ESCOLAR);

    const exemploNomes = [
      ["MARIA EXEMPLO DA SILVA", "COLÉGIO EXEMPLO"],
      ["JOÃO EXEMPLO SANTOS", "CLUBE AURORA"],
    ];

    const linhas = [];
    let etapaAtual = null;
    provas.forEach(([dist, estilo, categoria, naipe, etapa], k) => {
      const revez = /^\d+X/.test(String(dist).toUpperCase());
      const paral = comClasse &&
        (funcional || ehParalimpica(categoria, perfil));
      const aux = [rotEq, "NASCIMENTO"];
      if (funcional) aux.push("SEGMENTO");
      if (paral) aux.push("CLASSE");
      aux.push("TEMPO");
      const cab = [cabecalhoDeProva(dist, estilo, categoria, naipe)].concat(aux);
      // a etapa vai numa célula solta à direita: o app a ignora, mas quem
      // preenche vê a que sessão a prova pertence
      if (etapa) {
        cab.push("");
        cab.push(etapa === etapaAtual ? "" : String(etapa).toUpperCase());
        etapaAtual = etapa;
      }
      linhas.push(cab);

      // só as duas primeiras provas vêm com exemplo: o resto é para preencher
      if (k < 2) {
        const fem = naipe === "FEM" || /FEMININO/i.test(String(naipe));
        exemploNomes.forEach(([nome, equipe], j) => {
          if (!revez) nome = fem ? NOMES_EXEMPLO.FEM[j] : NOMES_EXEMPLO.MASC[j];
          const l = [revez ? equipe : nome, equipe];
          l.push(revez ? "" : (j === 0 ? "22/09/2012" : "04/03/2013"));
          if (funcional) l.push("DF");
          if (paral) l.push(funcional ? "S6/SB5/SM6" : "TEA");
          l.push(perfil.temTempo ? "31.20" : "");
          // no revezamento a coluna do nome fica vazia: quem nada é a equipe
          linhas.push(revez ? [""].concat(l.slice(1)) : l);
        });
      }
      linhas.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 14 },
                   { wch: 14 }, { wch: 12 }, { wch: 3 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "INSCRIÇÕES");
    XLSX.utils.book_append_sheet(wb, guiaDoModelo(perfil, rotEq, funcional, comClasse),
                                 "COMO PREENCHER");
    return wb;
  }

  function guiaDoModelo(perfil, rotEq, funcional, comClasse) {
    const guia = [
      ["COMO PREENCHER A PLANILHA DE INSCRITOS"],
      [],
      ["", "Uma planilha só. Não precisa criar aba nenhuma."],
      [],
      ["1", "Cada prova começa numa linha de cabeçalho, com o nome inteiro da"],
      ["", "prova: distância, estilo, categoria e naipe."],
      ["", "Ex.: 50M LIVRE MIRIM FEMININO"],
      [],
      ["2", "Ao lado do cabeçalho vão os nomes das colunas de apoio: " +
            [rotEq].concat(funcional ? ["SEGMENTO"] : [])
                   .concat(comClasse ? ["CLASSE"] : []).concat(["TEMPO"]).join(", ") + "."],
      ["", "A ordem delas não importa."],
      [],
      ["NASCIMENTO", "Não é obrigatória, mas é a coluna que deixa o app conferir se o"],
      ["", "atleta está na categoria de idade certa. Sem ela, ninguém confere isso."],
      ["", "Pode ser 22/09/2012 ou só 2012."],
      [],
      ["3", "Embaixo do cabeçalho, um atleta por linha. Acabou a prova, deixe"],
      ["", "uma linha em branco e comece a próxima."],
      [],
      ["4", "Revezamento: escreva só o nome da equipe, na coluna EQUIPE, e deixe"],
      ["", "a coluna do nome em branco. Quem nada é escolhido no dia da prova,"],
      ["", "pelo representante, e é a equipe que ocupa a raia."],
      [],
      ["5", "Prova sem ninguém: escreva SEM INSCRITOS embaixo do cabeçalho,"],
      ["", "ou simplesmente não escreva nada."],
      [],
      ["NAO FACA"],
      ["", "Não junte o nome do atleta e a instituição na mesma célula."],
      ["", "Não deixe o cabeçalho da prova sem o naipe: é ele que diz se a"],
      ["", "prova é feminina, masculina ou mista."],
      [],
      ["TAMBEM SERVE"],
      ["", "A planilha de anos anteriores, com uma aba por categoria e as"],
      ["", "provas lado a lado, continua sendo lida do mesmo jeito."],
    ];
    const ws = XLSX.utils.aoa_to_sheet(guia);
    ws["!cols"] = [{ wch: 6 }, { wch: 96 }];
    return ws;
  }

  /* ---------------- programa de provas ----------------
     A ordem oficial das provas não sai dos inscritos: ela vem do programa.
     Cada linha vira uma prova numerada, mesmo sem ninguém inscrito.
  ------------------------------------------------------ */

  // "1ª - 25m LIVRE PARALÍMPICO \"A\" + \"B\" FEMININO"
  // "9ª - 50m LIVRE MIRIM FEMININO"      "4x25m LIVRE PRÉ-MIRIM \"B\" MISTO"
  function lerLinhaPrograma(linha) {
    let t = String(linha || "").trim();
    if (!t) return null;
    // tira a numeração da frente ("12ª -", "12 -", "12."), mas só quando ela
    // vem marcada. Sem exigir a marca, o "25" de "25m LIVRE" seria confundido
    // com a numeração e a distância sumiria da prova.
    t = t.replace(/^\s*\d+\s*[ªº°]\s*[-–—:.)]*\s*/, "")
         .replace(/^\s*\d+\s*[-–—:.)]\s*/, "");
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

  /* ---------------- programa de provas numa planilha ----------------
     Digitar o programa à mão é onde mais se erra, e o erro é caro: se uma
     prova some, todas as seguintes ficam com o número trocado. Por isso ele
     vem de planilha, e por isso uma linha que o app não entenda barra o
     programa inteiro em vez de sumir calada.

     Duas formas de escrever, porque as duas aparecem na vida real:

       colunas  Nº | DISTÂNCIA | ESTILO | CATEGORIA | NAIPE | ETAPA
       texto    uma coluna só, com a linha inteira do programa:
                25m LIVRE PRÉ-MIRIM "B" FEMININO
  ------------------------------------------------------------------- */

  const CABECALHOS_PROGRAMA = [
    ["numero",    ["N", "N°", "Nº", "NUM", "NUMERO", "ORDEM", "PROVA N",
                   "PROVA N°", "PROVA Nº"]],
    ["distancia", ["DISTANCIA", "DIST", "METRAGEM", "METROS", "PROVA (M)"]],
    ["estilo",    ["ESTILO", "NADO"]],
    ["categoria", ["CATEGORIA", "CAT", "CATEGORIAS"]],
    ["naipe",     ["NAIPE", "SEXO", "GENERO", "MASC/FEM", "FEM/MASC"]],
    ["etapa",     ["ETAPA", "SESSAO", "BLOCO"]],
    ["dia",       ["DIA", "DATA"]],
    ["periodo",   ["PERIODO", "TURNO"]],
    ["prova",     ["PROVA", "PROVAS", "EVENTO", "NOME DA PROVA", "DESCRICAO"]],
  ];

  const ABAS_NAO_PROGRAMA = ["COMO PREENCHER", "LEGENDA", "LEGENDAS",
                             "INSTRUCOES", "INSTRUCAO", "MODELO"];

  // "25", "25m", "25 M", "50 metros", "4x25", "4 X 25M"  ->  "25M" / "4X25M"
  function normalizarDistancia(texto) {
    const u = norm(texto).replace(/\s+/g, "");
    const m = u.match(/^(?:(\d+)X)?(\d+)M?(?:ETROS?)?$/);
    return m ? (m[1] ? m[1] + "X" : "") + m[2] + "M" : "";
  }

  // A célula inteira tem de ser um estilo conhecido. Aceitar só o começo faria
  // "CRAWL BORBOLETA?" virar LIVRE calado: exatamente o erro que não pode passar.
  const ESCRITAS_ESTILO = {
    LIVRE: ["LIVRE", "CRAWL", "FREE", "L"],
    COSTAS: ["COSTAS", "COSTA", "DORSO", "C"],
    PEITO: ["PEITO", "BRUCO", "CLASSICO", "P"],
    BORBOLETA: ["BORBOLETA", "BORB", "GOLFINHO", "FLY", "B"],
    MEDLEY: ["MEDLEY", "MEDLEY INDIVIDUAL", "4 ESTILOS", "ESTILOS", "M"],
  };

  function normalizarEstilo(texto) {
    const u = norm(texto).replace(/^NADO\s+/, "").replace(/[.]+$/, "");
    for (const estilo of Object.keys(ESCRITAS_ESTILO))
      if (ESCRITAS_ESTILO[estilo].includes(u)) return estilo;
    return "";
  }

  const ESCRITAS_NAIPE = {
    MISTO: ["MISTO", "MISTA", "MISTOS", "MIX", "X"],
    MASC: ["MASCULINO", "MASCULINA", "MASC", "M", "H", "HOMENS", "HOMEM", "MENINO", "MENINOS", "RAPAZ", "RAPAZES"],
    FEM: ["FEMININO", "FEMININA", "FEM", "F", "MULHERES", "MULHER", "MENINA", "MENINAS", "MOCA", "MOCAS"],
  };

  function normalizarNaipe(texto) {
    const u = norm(texto).replace(/[.]+$/, "");
    for (const naipe of Object.keys(ESCRITAS_NAIPE))
      if (ESCRITAS_NAIPE[naipe].includes(u)) return naipe;
    return "";
  }

  function linhaVaziaPrograma(linha) {
    return !(linha || []).some((c) => String(c == null ? "" : c).trim());
  }

  // acha a linha de cabeçalho: a que casar com mais nomes de coluna conhecidos
  function acharCabecalhoPrograma(grade) {
    let melhor = { linha: -1, mapa: {}, acertos: 0 };
    const ate = Math.min(grade.length, 15);
    for (let r = 0; r < ate; r++) {
      const mapa = {};
      let acertos = 0;
      (grade[r] || []).forEach((cel, c) => {
        const u = norm(cel).replace(/[.:]+$/, "");
        if (!u) return;
        for (const par of CABECALHOS_PROGRAMA) {
          if (mapa[par[0]] != null) continue;
          if (par[1].some((n) => norm(n) === u)) { mapa[par[0]] = c; acertos++; return; }
        }
      });
      if (acertos > melhor.acertos) melhor = { linha: r, mapa, acertos };
    }
    return melhor.acertos ? melhor : null;
  }

  // sem cabeçalho: vale a coluna em que mais células parecem uma prova
  function colunaDeTexto(grade) {
    const pontos = [];
    for (const linha of grade) {
      (linha || []).forEach((cel, c) => {
        if (lerLinhaPrograma(cel)) pontos[c] = (pontos[c] || 0) + 1;
      });
    }
    let escolhida = 0, maior = 0;
    pontos.forEach((v, c) => { if ((v || 0) > maior) { maior = v || 0; escolhida = c; } });
    return maior ? escolhida : -1;
  }

  // por que esta linha de texto não virou prova
  function motivoTexto(texto) {
    const t = String(texto).replace(/^\s*\d+\s*[ªº°]?\s*[-–—:.)]*\s*/, "");
    const u = norm(t);
    if (!/^(\d+\s*X\s*)?\d+\s*M?(ETROS?)?\s/.test(u))
      return "a linha não começa com a distância. Escreva assim: " +
             '25m LIVRE PRÉ-MIRIM "B" FEMININO';
    if (!/\b(LIVRE|COSTAS?|PEITO|BORBOLETA|MEDLEY)\b/.test(u))
      return "não achei o estilo: LIVRE, COSTAS, PEITO, BORBOLETA ou MEDLEY";
    if (!/\b(MISTO|MASCULINO|MASC|FEMININO|FEM)\b/.test(u))
      return "falta o naipe no fim: FEMININO, MASCULINO ou MISTO";
    return "não sobrou nada para a categoria entre o estilo e o naipe";
  }

  function problemaCampo(nome, valor, aceito) {
    return valor
      ? "não entendi " + nome + ' "' + valor + '": use ' + aceito
      : "falta " + nome + ": use " + aceito;
  }

  function numeroDeclarado(valor) {
    const m = String(valor == null ? "" : valor).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  /* Um título de etapa no meio da lista ("1ª ETAPA, SÁBADO DE MANHÃ"): não é
     prova, e diz a etapa das provas que vêm embaixo. No teste gigante, a lista
     tinha 4 etapas assim e o app mostrava "0 etapas". */
  function etapaDoTitulo(t) {
    const n = norm(String(t || "")).replace(/\s+/g, " ").trim();
    const m = n.match(/^(\d{1,2}) ?[ªºAO°]?\.? ?ETAPA\b(.*)$/) || n.match(/^ETAPA (\d{1,2})\b(.*)$/);
    if (!m) return null;
    const resto = m[2] || "";
    if (/\d+ ?M\b|LIVRE|COSTAS|PEITO|BORBOLETA|MEDLEY/.test(resto)) return null;
    return { nome: Number(m[1]) + "ª ETAPA",
             periodo: /MANHA/.test(resto) ? "MANHÃ" : /TARDE/.test(resto) ? "TARDE" : /NOITE/.test(resto) ? "NOITE" : "" };
  }

  function lerProgramaColunas(grade, inicio, mapa, porColunas, saida) {
    let etapaAtual = null;
    // o cabeçalho copiado de novo no meio da lista (quem colou duas folhas) fica de fora sozinho
    const textoDaLinha = (l) => (l || []).map((v) => norm(String(v == null ? "" : v)).replace(/\s+/g, " ").trim()).filter(Boolean).join("|");
    const cabecalho = textoDaLinha(grade[inicio - 1]);
    for (let r = inicio; r < grade.length; r++) {
      const linha = grade[r] || [];
      if (linhaVaziaPrograma(linha)) continue;
      if (cabecalho && textoDaLinha(linha) === cabecalho) {
        (saida.cabecalhosRepetidos = saida.cabecalhosRepetidos || []).push(r + 1);
        continue;
      }
      const cel = (campo) => mapa[campo] == null ? ""
        : String(linha[mapa[campo]] == null ? "" : linha[mapa[campo]]).trim();

      let distancia = "", estilo = "";
      if (porColunas) {
        distancia = normalizarDistancia(cel("distancia"));
        estilo = normalizarEstilo(cel("estilo"));
      } else {
        const c = lerCabecalhoProva(cel("prova"));
        if (c) { distancia = c.distancia; estilo = c.estilo; }
      }
      const categoria = cel("categoria").replace(/\s+/g, " ").trim();
      const naipe = normalizarNaipe(cel("naipe"));

      const visto = [cel("numero"),
        porColunas ? (cel("distancia") + " " + cel("estilo")).trim() : cel("prova"),
        categoria, cel("naipe")].filter(Boolean).join("  ·  ");

      const faltas = [];
      if (!distancia) faltas.push(problemaCampo("a distância",
        porColunas ? cel("distancia") : cel("prova"), "25m, 50m, 100m ou 4x50m"));
      if (!estilo) faltas.push(problemaCampo("o estilo",
        porColunas ? cel("estilo") : cel("prova"),
        "LIVRE, COSTAS, PEITO, BORBOLETA ou MEDLEY"));
      if (!categoria) faltas.push('falta a categoria; ex.: MIRIM, PRÉ-MIRIM "B"');
      if (!naipe) faltas.push(problemaCampo("o naipe", cel("naipe"),
        "FEMININO, MASCULINO ou MISTO"));

      // linha em que nada foi entendido quase nunca é uma prova: é um recado,
      // um total, um resto de outra planilha. Dizer isso é mais útil que listar
      // os quatro campos que faltam.
      if (faltas.length) {
        // a prova inteira numa célula só ("50m peito infantil feminino"): o app lê por extenso.
        // No teste gigante ela era tratada como recado, e o Não na correção jogava fora uma prova de verdade.
        const fora = new Set(["numero", "etapa", "dia", "periodo"].map((k) => mapa[k]).filter((c) => c != null));
        const cheias = linha.map((v, c) => (fora.has(c) || v == null ? "" : String(v).trim())).filter(Boolean);
        const resto = cheias.join(" ");
        // só a prova que está toda numa célula; "50m peito" com a categoria ao lado é correção do Mars
        const inteira = cheias.length === 1 ? lerLinhaPrograma(resto) : null;
        if (inteira && inteira.distancia && inteira.estilo && inteira.categoria && inteira.naipe) {
          const cat = String(inteira.categoria).toUpperCase();
          saida.linhas.push({ linha: r + 1, texto: visto, ok: true, prova: {
            distancia: inteira.distancia, estilo: inteira.estilo, categoria: cat, naipe: inteira.naipe,
            rotulo: String(inteira.rotulo || cat).toUpperCase(), numero: numeroDeclarado(cel("numero")),
            etapa: cel("etapa") || (etapaAtual ? etapaAtual.nome : ""), dia: cel("dia"),
            periodo: cel("periodo") || (etapaAtual ? etapaAtual.periodo : ""),
          } });
          continue;
        }
        const tudo = linha.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean).join(" ");
        const titulo = faltas.length === 4 ? etapaDoTitulo(tudo) : null;
        if (titulo) {
          etapaAtual = titulo;
          (saida.titulosDeEtapa = saida.titulosDeEtapa || []).push({ linha: r + 1, texto: tudo, etapa: titulo.nome });
          continue;
        }
        if (faltas.length === 4) {
          saida.linhas.push({ linha: r + 1, texto: visto, ok: false,
            motivo: "esta linha não parece uma prova; se for um recado, um total " +
                    "ou uma sobra, apague-a da planilha" });
          continue;
        }
        saida.linhas.push({ linha: r + 1, texto: visto, ok: false,
                            motivo: faltas.join("; ") });
        continue;
      }
      saida.linhas.push({ linha: r + 1, texto: visto, ok: true, prova: {
        distancia, estilo, categoria, naipe, rotulo: categoria,
        numero: numeroDeclarado(cel("numero")),
        etapa: cel("etapa") || (etapaAtual ? etapaAtual.nome : ""), dia: cel("dia"),
        periodo: cel("periodo") || (etapaAtual ? etapaAtual.periodo : ""),
      } });
    }
  }

  function lerProgramaTexto(grade, inicio, col, mapa, saida) {
    for (let r = inicio; r < grade.length; r++) {
      const linha = grade[r] || [];
      if (linhaVaziaPrograma(linha)) continue;
      const cel = (campo) => mapa[campo] == null ? ""
        : String(linha[mapa[campo]] == null ? "" : linha[mapa[campo]]).trim();
      const texto = String(linha[col] == null ? "" : linha[col]).trim();
      if (!texto) {
        saida.linhas.push({ linha: r + 1, ok: false,
          texto: linha.filter(Boolean).join("  ·  "),
          motivo: "a coluna da prova está em branco nesta linha" });
        continue;
      }
      const p = lerLinhaPrograma(texto);
      if (!p) {
        saida.linhas.push({ linha: r + 1, texto, ok: false, motivo: motivoTexto(texto) });
        continue;
      }
      const numCol = numeroDeclarado(cel("numero"));
      const numTexto = (texto.match(/^\s*(\d+)\s*[ªº°]/) || [])[1];
      p.numero = numCol != null ? numCol : numTexto ? parseInt(numTexto, 10) : null;
      p.etapa = cel("etapa"); p.dia = cel("dia"); p.periodo = cel("periodo");
      saida.linhas.push({ linha: r + 1, texto, ok: true, prova: p });
    }
  }

  function lerGradePrograma(grade) {
    const saida = { formato: "", provas: [], linhas: [], problemas: [] };
    if (!grade || !grade.length) {
      saida.problemas.push("Esta aba está vazia.");
      return saida;
    }
    const cab = acharCabecalhoPrograma(grade);
    const mapa = cab ? cab.mapa : {};
    // o título em cima do cabeçalho ("PROGRAMA DE PROVAS: JOGOS DA ESTAÇÃO 2026") dá o nome da competição
    if (cab) {
      for (let r = 0; r < cab.linha; r++) {
        const cheias = (grade[r] || []).map((v) => String(v == null ? "" : v).trim()).filter(Boolean);
        if (cheias.length !== 1) continue;
        const nome = cheias[0].replace(/^\s*programa(\s+de\s+provas)?\s*[:\-–—]?\s*/i, "").trim();
        if (nome.length >= 6 && nome.length <= 80 && /[a-zà-ú]{3}/i.test(nome) && !/^(n[ºo°]|prova|etapa)\b/i.test(nome)) {
          saida.titulo = nome;
          break;
        }
      }
    }
    const porColunas = mapa.distancia != null && mapa.estilo != null;
    const porProvaCurta = !porColunas && mapa.prova != null &&
                          mapa.categoria != null && mapa.naipe != null;

    if (porColunas || porProvaCurta) {
      if (mapa.categoria == null)
        saida.problemas.push("Não achei a coluna CATEGORIA no cabeçalho.");
      if (mapa.naipe == null)
        saida.problemas.push("Não achei a coluna NAIPE no cabeçalho.");
      saida.formato = "colunas";
      lerProgramaColunas(grade, cab.linha + 1, mapa, porColunas, saida);
    } else {
      const col = mapa.prova != null ? mapa.prova : colunaDeTexto(grade);
      if (col < 0) {
        saida.problemas.push(
          "Não achei nem as colunas DISTÂNCIA / ESTILO / CATEGORIA / NAIPE, " +
          "nem uma coluna com as provas escritas por extenso.");
        return saida;
      }
      saida.formato = "texto";
      lerProgramaTexto(grade, cab ? cab.linha + 1 : 0, col, mapa, saida);
    }

    // prova repetida duplicaria os mesmos atletas em duas provas do balizamento
    const vistas = new Map();
    for (const l of saida.linhas) {
      if (!l.ok) continue;
      const k = chaveProva(l.prova.distancia, l.prova.estilo,
                           l.prova.categoria, l.prova.naipe);
      if (vistas.has(k)) {
        l.ok = false;
        l.motivo = "esta prova já aparece na linha " + vistas.get(k) +
                   ": duas linhas iguais colocariam os mesmos atletas em duas provas";
        continue;
      }
      vistas.set(k, l.linha);
    }
    saida.provas = saida.linhas.filter((l) => l.ok).map((l) => l.prova);
    return saida;
  }

  /**
   * Lê o programa de provas de uma planilha.
   * Devolve { ok, aba, formato, provas, linhas, problemas }, onde `linhas` traz
   * uma entrada por linha lida, inclusive as recusadas, com o motivo.
   */
  function lerProgramaPlanilha(wb) {
    const vazio = { ok: false, aba: "", formato: "", provas: [], linhas: [],
                    problemas: [] };
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
      vazio.problemas.push("O arquivo não tem nenhuma aba.");
      return vazio;
    }
    let primeira = null;
    for (const nomeAba of wb.SheetNames) {
      if (ABAS_NAO_PROGRAMA.includes(norm(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      const r = lerGradePrograma(grade);
      r.aba = nomeAba;
      r.ok = r.provas.length > 0 && !r.linhas.some((l) => !l.ok) && !r.problemas.length;
      if (!primeira) primeira = r;
      if (r.linhas.length) return r;      // a primeira aba com conteúdo manda
    }
    if (primeira) return primeira;
    vazio.problemas.push("Não achei nenhuma aba com conteúdo neste arquivo.");
    return vazio;
  }

  // volta de prova para linha de texto, usado ao guardar o perfil
  function linhaDoPrograma(p) {
    const naipe = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[p.naipe]
                  || p.naipe;
    return [String(p.distancia).toLowerCase(), p.estilo,
            p.rotulo || p.categoria, naipe].join(" ");
  }

  /* ---------------- planilha modelo do programa ---------------- */
  function gerarModeloPrograma() {
    const wb = XLSX.utils.book_new();
    const linhas = [
      ["Nº", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE", "ETAPA"],
      [1, "25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "FEMININO", "1ª ETAPA"],
      [2, "25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "MASCULINO", "1ª ETAPA"],
      [3, "25m", "LIVRE", 'PRÉ-MIRIM "B"', "FEMININO", "1ª ETAPA"],
      [4, "25m", "LIVRE", 'PRÉ-MIRIM "B"', "MASCULINO", "1ª ETAPA"],
      [5, "50m", "LIVRE", "MIRIM", "FEMININO", "1ª ETAPA"],
      [6, "50m", "LIVRE", "MIRIM", "MASCULINO", "1ª ETAPA"],
      [7, "50m", "COSTAS", "MIRIM", "FEMININO", "2ª ETAPA"],
      [8, "50m", "COSTAS", "MIRIM", "MASCULINO", "2ª ETAPA"],
      [9, "4x25m", "LIVRE", 'PRÉ-MIRIM "B"', "MISTO", "2ª ETAPA"],
      [10, "4x50m", "LIVRE", "MIRIM", "MISTO", "2ª ETAPA"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 13 }, { wch: 26 },
                   { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "PROGRAMA");

    const guia = [
      ["COMO PREENCHER O PROGRAMA DE PROVAS"],
      [],
      ["", "Uma linha por prova, na ordem oficial da competição. É esta ordem que"],
      ["", "dá a numeração das provas no balizamento, no PDF e nas papeletas."],
      [],
      ["OBRIGATORIAS"],
      ["DISTÂNCIA", "25m, 50m, 100m, 200m. Revezamento: 4x25m, 4x50m."],
      ["ESTILO", "LIVRE, COSTAS, PEITO, BORBOLETA ou MEDLEY."],
      ["CATEGORIA", 'Como está no regulamento: MIRIM, PRÉ-MIRIM "B", PARALÍMPICO "A" + "B".'],
      ["NAIPE", "FEMININO, MASCULINO ou MISTO."],
      [],
      ["OPCIONAIS"],
      ["Nº", "Só para conferência. Quem manda na numeração é a ordem das linhas."],
      ["ETAPA", "Nome da sessão. O app monta sozinho o intervalo de provas de cada etapa."],
      ["DIA", "Ex.: 22/09. Aparece no cabeçalho da etapa."],
      ["PERÍODO", "Ex.: MANHÃ, TARDE."],
      [],
      ["NAO FACA"],
      ["", "Não deixe linhas soltas com recados ou observações: o app não sabe o"],
      ["", "que fazer com elas e recusa o programa inteiro."],
      ["", "Não repita a mesma prova em duas linhas."],
      ["", "Não apague a linha de cabeçalho."],
      [],
      ["TAMBEM SERVE"],
      ["", "Se você já tem o programa escrito por extenso, cole numa coluna só,"],
      ["", "com o cabeçalho PROVA e uma prova por linha:"],
      ["", '25m LIVRE PRÉ-MIRIM "B" FEMININO'],
    ];
    const wsG = XLSX.utils.aoa_to_sheet(guia);
    wsG["!cols"] = [{ wch: 14 }, { wch: 92 }];
    XLSX.utils.book_append_sheet(wb, wsG, "COMO PREENCHER");
    return wb;
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
    const programa = perfil.programa || [];

    // categoria e naipe de cada inscrição
    for (const i of inscricoes) {
      i.categoriaOriginal = "";
      i.juntadaPeloPrograma = "";
      // na lista vertical o cabeçalho da prova já disse tudo; só o formato de
      // blocos lado a lado precisa tirar categoria e naipe do nome da aba
      if (!i.categoriaDefinida && (!i.categoria || !i.naipe)) {
        const c = categoriaDaAba(i.aba);
        i.categoria = i.categoria || c.categoria;
        i.naipe = i.naipe || c.naipe;
      }
      if (i.misto) i.naipe = "MISTO";
      i.categoriaProva = grupoDe(i.categoria, i.distancia, i.estilo, perfil);
      // agrupamento montado à mão manda mais que o casamento automático:
      // sem isto, "INFANTIL + JUVENIL" voltaria a virar "INFANTIL" por
      // semelhança, desfazendo o que o árbitro pediu
      i.deGrupo = chaveCategoria(i.categoriaProva) !== chaveCategoria(i.categoria);
    }

    /* O programa é quem manda, inclusive quando ele junta categorias numa
       linha só. "PARALÍMPICO A + B" quer dizer que A e B nadam juntas nesta
       prova, então PARAL A e PARAL B caem direto ali, sem ninguém precisar
       dizer nada. A letra tem de ser a mesma, sempre; só a palavra pode
       estar abreviada, e é aí que mora o palpite. */
    if (programa.length && perfil.juntarPrograma !== false) {
      const noPrograma = new Set(programa.map((p) =>
        chaveProva(p.distancia, p.estilo, p.categoria, p.naipe)));
      const candidatas = new Map();
      for (const p of programa) {
        const k = [p.distancia, p.estilo, p.naipe].join("|");
        if (!candidatas.has(k)) candidatas.set(k, []);
        candidatas.get(k).push(p);
      }
      for (const i of inscricoes) {
        if (i.deGrupo) continue;
        const k = chaveProva(i.distancia, i.estilo, i.categoriaProva, i.naipe);
        if (noPrograma.has(k)) continue;
        const ki = chaveCategoria(i.categoriaProva);
        let achada = null, como = "", outra = false;
        for (const p of (candidatas.get([i.distancia, i.estilo, i.naipe].join("|")) || [])) {
          for (const parte of partesDaCategoria(p.categoria)) {
            const tipo = casaCategoria(ki, parte);
            if (!tipo) continue;
            if (tipo === "exato") { achada = p; como = tipo; break; }
            if (!achada) { achada = p; como = tipo; }
            else if (chaveCategoria(achada.categoria) !== chaveCategoria(p.categoria)) outra = true;
          }
          if (como === "exato") break;
        }
        // semelhante a duas categorias do programa é palpite demais: fica como está
        if (!achada || (como !== "exato" && outra)) continue;
        i.categoriaOriginal = i.categoriaProva;
        i.categoriaProva = achada.rotulo || achada.categoria;
        i.juntadaPeloPrograma = como;
        // a categoria escrita de outro jeito (MIR., INFANTL) é a mesma do programa: a
        // conferência não acusa o atleta em duas categorias por causa da escrita
        if (partesDaCategoria(achada.categoria).length === 1) i.categoriaCorrigida = achada.rotulo || achada.categoria;
      }
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
    if (programa.length) {
      sequencia = programa.map((p) => ({
        chave: chaveProva(p.distancia, p.estilo, p.categoria, p.naipe),
        partes: [p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe],
        doPrograma: true,
      }));
      /* Grupo montado à mão sobre provas que o programa deixou separadas: a
         prova que sai disso fica no lugar da primeira delas, para a numeração
         impressa não mudar. As outras saem como provas sem inscritos, que é o
         que elas viraram de fato. */
      for (const g of (perfil.grupos || [])) {
        const cats = (g.categorias || []).map(chaveCategoria).filter(Boolean);
        if (!cats.length || !g.rotulo) continue;
        if (sequencia.some((x) => x.doPrograma &&
            chaveCategoria(x.partes[2]) === chaveCategoria(g.rotulo))) continue;
        const porProva = new Map();
        sequencia.forEach((seq, idx) => {
          if (!seq.doPrograma) return;
          const [d, e, cat, n] = seq.partes;
          // a prova do programa é absorvida se qualquer parte dela estiver no
          // grupo: quem junta PARALÍMPICO "A" com "C" mira a prova A + B também
          if (!partesDaCategoria(cat).some((p) => cats.includes(p))) return;
          if (g.distancias && g.distancias.length && !g.distancias.includes(d)) return;
          if (g.estilos && g.estilos.length && !g.estilos.includes(e)) return;
          const k = [d, e, n].join("|");
          if (!porProva.has(k)) porProva.set(k, []);
          porProva.get(k).push(idx);
        });
        for (const [, idxs] of porProva) {
          const [d, e, , n] = sequencia[idxs[0]].partes;
          sequencia[idxs[0]] = {
            chave: chaveProva(d, e, g.rotulo, n),
            partes: [d, e, g.rotulo, n],
            doPrograma: true,
          };
        }
      }

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
      const revez = /^\d+X/.test(distancia);
      const paral = ehParalimpica(categoria, perfil);

      /* Atleta repetido na mesma prova: fica a primeira inscrição e a
         repetida sai das raias. Sem isto ele ocupava duas raias e ainda
         aparecia duas vezes na papeleta.
         Revezamento não entra: duas equipes da mesma escola na mesma prova
         são duas equipes de verdade, e quem cuida disso é a conferência. */
      const repetidos = [];
      let unicos = itens;
      if (!revez) {
        const vistos = new Map();
        unicos = [];
        for (const i of itens) {
          const k = B.chaveAtleta(i);
          if (vistos.has(k)) {
            // com várias fichas juntas, a linha sozinha não diz onde: vai junto o nome da ficha (a aba)
            const antes = vistos.get(k);
            const onde = antes.linha ? ", na " + (antes.aba && antes.aba !== i.aba ? antes.aba + ", " : "") + "linha " + antes.linha : "";
            repetidos.push(Object.assign({}, i, { motivo: "já tinha inscrição nesta prova" + onde }));
            continue;
          }
          vistos.set(k, { linha: i.linha || 0, aba: i.aba || "" });
          unicos.push(i);
        }
      }

      // de onde veio quem o programa mandou juntar nesta prova
      const casadas = [];
      for (const i of itens) {
        if (!i.juntadaPeloPrograma || !i.categoriaOriginal) continue;
        const c = casadas.find((x) => chaveCategoria(x.categoria) ===
                                      chaveCategoria(i.categoriaOriginal));
        if (c) c.quantos++;
        else casadas.push({ categoria: i.categoriaOriginal, quantos: 1,
                            como: i.juntadaPeloPrograma });
      }

      // elegibilidade por classe funcional
      const nadam = [], cortados = [];
      for (const i of unicos) {
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
        // fica sempre, para a conferência saber do que está falando. Já o
        // aviso é o que sai impresso em vermelho, e some quando o árbitro
        // diz que leu e vai seguir assim mesmo.
        foraDoPrograma: !!(programa.length && !seq.doPrograma),
        aviso: (programa.length && !seq.doPrograma)
          ? "esta prova não consta no programa oficial; confira a inscrição"
          : "",
        revezamento: revez, paralimpica: paral, nRaias: raias,
        series, cortados, repetidos, casadas,
        total: nadam.length,
        // no revezamento quem ocupa a raia é a equipe, e os nadadores só são
        // escolhidos no dia: o que se conta aqui são as equipes
        atletas: series.reduce((s, se) => s + (revez ? se.linhas.length
          : se.linhas.reduce((t, l) => t + (l.item.atletas
            ? l.item.atletas.length : 1), 0)), 0),
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

  /* ---------------- categorias que o programa junta ----------------
     O programa escreve numa linha só o que os inscritos mandam em duas:

       programa    25m LIVRE PARALÍMPICO "A" + "B" FEMININO
       inscritos   25M LIVRE PARAL A FEMININO   e   25M LIVRE PARAL B FEMININO

     Sem casar as duas coisas, as provas do programa saem vazias e as dos
     inscritos saem no fim, em vermelho, fora do programa. O "+" do programa
     já diz quem nada junto: é dele que sai a proposta.
  ------------------------------------------------------------------- */

  // 'PARALÍMPICO "A" + "B"'  ->  ["PARALIMPICO A", "PARALIMPICO B"]
  // 'MIRIM + INFANTIL'       ->  ["MIRIM", "INFANTIL"]
  function partesDaCategoria(categoria) {
    const k = chaveCategoria(categoria);
    if (k.indexOf("+") < 0) return [k];
    const partes = k.split("+").map((s) => s.trim()).filter(Boolean);
    let base = "";
    return partes.map((p, i) => {
      const pedacos = p.split(" ").filter(Boolean);
      if (i === 0) {
        base = pedacos.length > 1 ? pedacos.slice(0, -1).join(" ") : "";
        return p;
      }
      // "B" sozinho depois do "+" herda o PARALÍMPICO da primeira parte
      if (base && pedacos.length === 1 && /^[A-Z]$/.test(pedacos[0]))
        return base + " " + pedacos[0];
      return p;
    });
  }

  // "PARALIMPICO A" -> { base: "PARALIMPICO", letra: "A" }
  function pedacosDaCategoria(chave) {
    const t = String(chave).split(" ").filter(Boolean);
    if (t.length > 1 && /^[A-Z]$/.test(t[t.length - 1]))
      return { base: t.slice(0, -1).join(" "), letra: t[t.length - 1] };
    return { base: String(chave), letra: "" };
  }

  /* Como esta categoria dos inscritos se parece com esta parte do programa.
     A letra tem de ser a mesma, sempre: A não vira B por semelhança nenhuma.
     A palavra pode estar abreviada, e é só aí que existe palpite: PARAL é o
     começo de PARALÍMPICO. Por isso "semelhante" volta separado de "exato":
     o exato o app aplica sozinho, o semelhante ele mostra e pergunta. */
  function casaCategoria(chaveInscritos, chavePrograma) {
    if (chaveInscritos === chavePrograma) return "exato";
    const x = pedacosDaCategoria(chaveInscritos);
    const y = pedacosDaCategoria(chavePrograma);
    if (x.letra !== y.letra) return "";
    if (x.base === y.base) return "exato";
    const curto = x.base.length <= y.base.length ? x.base : y.base;
    const longo = x.base.length <= y.base.length ? y.base : x.base;
    if (curto.length >= 4 && longo.indexOf(curto) === 0) return "semelhante";
    // abreviada com três letras (MIR., INF.) ou com uma letra a menos ou trocada (INFANTL,
    // INFATIL): no teste das 10 equipes, essas provas saíam do balizamento com os atletas
    if (B.pareceOMesmo(x.base, y.base)) return "semelhante";
    return "";
  }

  /**
   * Olha as provas montadas e propõe, para cada prova que ficou fora do
   * programa, a prova do programa que deveria tê-la recebido.
   * Devolve [{ origem, destino, parte, tipo, soma }], tipo = exato|semelhante.
   */
  function propostasDePrograma(provas) {
    const doPrograma = provas.filter((p) => p.doPrograma);
    if (!doPrograma.length) return [];
    const saida = [];
    for (const f of provas) {
      if (f.doPrograma || !f.series.length) continue;
      const kf = chaveCategoria(f.categoria);
      let melhor = null;
      for (const d of doPrograma) {
        if (d.distancia !== f.distancia || d.estilo !== f.estilo ||
            d.naipe !== f.naipe) continue;
        const partes = partesDaCategoria(d.categoria);
        for (const parte of partes) {
          const tipo = casaCategoria(kf, parte);
          if (!tipo) continue;
          // exato ganha de semelhante; entre iguais, fica o primeiro
          if (!melhor || (melhor.tipo === "semelhante" && tipo === "exato"))
            melhor = { destino: d, parte, tipo, soma: partes.length > 1 };
        }
      }
      if (melhor) saida.push(Object.assign({ origem: f }, melhor));
    }
    return saida;
  }

  /* As propostas viram linhas de "categorias que nadam juntas", as mesmas da
     tela da competição, para ficarem visíveis e desfazíveis lá. Uma linha por
     categoria do programa e distância: é a distância que mede o agrupamento,
     porque o mesmo programa junta A com B no 25m e B com C no 50m. */
  function gruposDePropostas(propostas) {
    const mapa = new Map();
    for (const pr of propostas) {
      const k = chaveCategoria(pr.destino.categoria) + "|" + pr.origem.distancia;
      if (!mapa.has(k)) {
        mapa.set(k, { rotulo: pr.destino.categoria, categorias: [],
                      distancias: [pr.origem.distancia], estilos: [] });
      }
      const g = mapa.get(k);
      if (!g.categorias.includes(pr.origem.categoria))
        g.categorias.push(pr.origem.categoria);
      if (!g.estilos.includes(pr.origem.estilo)) g.estilos.push(pr.origem.estilo);
    }
    return [...mapa.values()];
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
          // no revezamento a linha é da equipe: os quatro nomes que vierem
          // escritos são rascunho, quem nada só é definido no dia da prova
          const nomes = !p.revezamento && it.atletas && it.atletas.length
            ? it.atletas : [it.nome];
          for (const nome of nomes) {
            saida.push({
              nome, equipe: it.equipe, categoria: it.categoria, categoriaCorrigida: it.categoriaCorrigida || "",
              classe: it.classe, tituloProva: p.titulo, prova: p.numero,
              serie: s.numero, raia: l.raia, revezamento: p.revezamento,
              naipe: p.naipe, distancia: p.distancia,
              segmento: it.segmento, nascimento: it.nascimento,
              tempo: it.tempo, tempoTexto: it.tempoTexto,
              semLista: !!it.semLista, aba: it.aba, linha: it.linha,
            });
          }
        }
      }
    }
    return saida;
  }

  /* Categoria escrita quase igual a outra do mesmo programa: "INFATIL" numa
     prova e INFANTIL em várias. O app não sabe qual é a certa, então só
     aponta, para a pessoa decidir. No teste grande de 12/11/2026, quem notou
     foi o Mars, e a pessoa não tinha onde corrigir. Só conta palavra longa
     sem número: PETIZ 1 e PETIZ 2, ou MIRIM I e MIRIM II, são categorias
     diferentes de verdade. */
  function categoriasParecidas(provas) {
    const lev = (a, b) => {
      const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        let ant = d[0];
        d[0] = i;
        for (let j = 1; j <= b.length; j++) {
          const t = d[j];
          d[j] = Math.min(d[j] + 1, d[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1));
          ant = t;
        }
      }
      return d[b.length];
    };
    const conta = new Map();
    for (const p of provas || []) {
      const c = String(p.categoria || "").trim();
      if (c) conta.set(c, (conta.get(c) || 0) + 1);
    }
    const achadas = [];
    for (const [rara, n] of conta) {
      const pr = norm(rara).split(/\s+/);
      for (const [comum, m] of conta) {
        if (rara === comum || m <= n || m < 2) continue;
        const pc = norm(comum).split(/\s+/);
        if (pr.join(" ") === pc.join(" ") || pr.length !== pc.length) continue;
        const dif = pr.map((w, k) => [w, pc[k]]).filter(([a, b]) => a !== b);
        if (dif.length !== 1) continue;
        const [a, b] = dif[0];
        if (a.length < 5 || b.length < 5 || /\d/.test(a + b)) continue;
        if (lev(a, b) > (b.length > 6 ? 2 : 1)) continue;
        achadas.push({ de: rara, para: comum, vezes: n, outras: m,
          // o número é a posição na lista, o mesmo do balizamento e do cartão (não o da coluna Nº)
          numeros: (provas || []).map((p, i) => (String(p.categoria || "").trim() === rara ? i + 1 : null)).filter((x) => x != null) });
        break;
      }
    }
    return achadas;
  }

  const api = {
    categoriasParecidas,
    lerCabecalhoProva, lerPlanilhaBlocos, lerPlanilhaLinhas, categoriaDaAba, chaveCategoria,
    lerPlanilhaLista, lerCabecalhoLista, ehAbaLista,
    lerPrograma, lerLinhaPrograma, chaveProva, conferirPlanilha, gerarModelo,
    cabecalhoDeProva,
    lerProgramaPlanilha, linhaDoPrograma, gerarModeloPrograma,
    normalizarDistancia, normalizarEstilo, normalizarNaipe,
    montarBalizamento, inscricoesPlanas, tituloProva, eventoRegras, COLUNAS_MODELO,
    partesDaCategoria, casaCategoria, propostasDePrograma, gruposDePropostas,
    inscricaoCanonica, lerProvaPorExtenso, cabecalhoCanonico, gradeDaAba,
    ROTULOS_LISTA, CABECALHOS_PROGRAMA,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorDados = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
