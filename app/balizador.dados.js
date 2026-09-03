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

    // agrupa em provas
    const mapa = new Map();
    for (const i of inscricoes) {
      const k = [i.distancia, i.estilo, i.categoriaProva, i.naipe].join("|");
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(i);
    }

    let chaves = [...mapa.keys()];
    if (perfil.ordemProvas && perfil.ordemProvas.length) {
      const pos = new Map(perfil.ordemProvas.map((c, k) => [c, k]));
      chaves.sort((a, b) => {
        const pa = pos.has(a) ? pos.get(a) : 9999;
        const pb = pos.has(b) ? pos.get(b) : 9999;
        return pa - pb || a.localeCompare(b);
      });
      for (const c of perfil.ordemProvas) if (!mapa.has(c)) mapa.set(c, []);
      chaves = perfil.ordemProvas.concat(
        chaves.filter((c) => !pos.has(c)));
    } else {
      chaves.sort(ordemNatural);
    }

    const provas = [];
    chaves.forEach((k, idx) => {
      const [distancia, estilo, categoria, naipe] = k.split("|");
      const itens = mapa.get(k) || [];
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
        numero: idx + 1, chave: k, distancia, estilo, categoria, naipe,
        titulo: tituloProva(distancia, estilo, categoria, naipe),
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
    montarBalizamento, inscricoesPlanas, tituloProva, eventoRegras, COLUNAS_MODELO,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorDados = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
