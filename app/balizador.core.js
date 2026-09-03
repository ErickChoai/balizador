/* =====================================================================
   BALIZADOR — núcleo de regras
   Funciona no navegador e no Node (para os testes de comparação).
   Sem dependências: só lógica de raias, séries, elegibilidade e validação.
   ===================================================================== */
(function (raiz) {
  "use strict";

  const SEM_TEMPO = Infinity;

  /* ---------------- raias e séries ---------------- */

  // Ordem de preenchimento, do centro para fora.
  // 6 -> 3,4,2,5,1,6   |   8 -> 4,5,3,6,2,7,1,8
  function ordemRaias(nRaias) {
    const centro = Math.floor((nRaias + 1) / 2);
    const seq = [centro];
    let k = 1;
    while (seq.length < nRaias) {
      for (const r of [centro + k, centro - k]) {
        if (r >= 1 && r <= nRaias && !seq.includes(r)) seq.push(r);
      }
      k++;
    }
    return seq.slice(0, nRaias);
  }

  // Mínimo por série: metade das raias (6 -> 3, 8 -> 4, 10 -> 5)
  function minimoPorSerie(nRaias) {
    return Math.max(1, Math.floor(nRaias / 2));
  }

  const MENOS_SERIES = "MENOS_SERIES";
  const INCOMPLETA_PRIMEIRO = "INCOMPLETA_PRIMEIRO";

  function tamanhosSeries(n, nRaias, regra, minimo) {
    if (n <= 0) return [];
    if (n <= nRaias) return [n];

    if (regra === INCOMPLETA_PRIMEIRO) {
      const resto = n % nRaias;
      const cheias = Math.floor(n / nRaias);
      if (resto === 0) return Array(cheias).fill(nRaias);
      if (resto >= 3) return [resto].concat(Array(cheias).fill(nRaias));
      const extra = nRaias + resto;           // sobra de 1 ou 2 vira 3+4 / 4+4
      const primeira = Math.floor(extra / 2);
      return [primeira, extra - primeira].concat(Array(cheias - 1).fill(nRaias));
    }

    const min = minimo == null ? minimoPorSerie(nRaias) : minimo;
    let s = Math.ceil(n / nRaias);
    while (s > 1 && Math.floor(n / s) < min) s--;
    const base = Math.floor(n / s);
    const resto = n % s;
    return Array(s - resto).fill(base).concat(Array(resto).fill(base + 1));
  }

  function raiasPara(qtd, nRaias) {
    return ordemRaias(nRaias).slice(0, qtd).sort((a, b) => a - b);
  }

  /* ---------------- ordenação dentro da prova ---------------- */

  // Comparação por ponto de código, para que a montagem seja determinística
  // e idêntica em qualquer navegador (localeCompare varia por idioma do SO).
  function cmpTexto(a, b) {
    const x = String(a), y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // Rodízio entre equipes: colegas não caem todos na mesma série.
  function espalharEquipes(itens, equipeDe, nomeDe) {
    const grupos = new Map();
    for (const i of itens) {
      const k = equipeDe(i) || "";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    let filas = [...grupos.values()];
    for (const f of filas) f.sort((a, b) => cmpTexto(nomeDe(a), nomeDe(b)));
    const saida = [];
    while (filas.some((f) => f.length)) {
      filas.sort((a, b) => b.length - a.length);
      for (const f of filas) if (f.length) saida.push(f.shift());
      filas = filas.filter((f) => f.length);
    }
    return saida;
  }

  // Do mais lento para o mais rápido; quem não tem tempo vem antes de todos.
  function ordemPorTempo(itens, tempoDe, nomeDe) {
    const com = [], sem = [];
    for (const i of itens) {
      const t = tempoDe(i);
      (t == null || !isFinite(t) ? sem : com).push(i);
    }
    sem.sort((a, b) => cmpTexto(nomeDe(a), nomeDe(b)));
    com.sort((a, b) => tempoDe(b) - tempoDe(a) || cmpTexto(nomeDe(a), nomeDe(b)));
    return sem.concat(com);
  }

  /**
   * Monta as séries de uma prova.
   * opts: { nRaias, regra, equipeDe, nomeDe, tempoDe }
   * Devolve [{ numero, linhas: [{ raia, item }] }]
   */
  function montarSeries(itens, opts) {
    const nRaias = opts.nRaias;
    const nomeDe = opts.nomeDe || ((i) => String(i));
    const equipeDe = opts.equipeDe || (() => "");
    const tempoDe = opts.tempoDe || (() => null);
    const temTempo = itens.some((i) => {
      const t = tempoDe(i);
      return t != null && isFinite(t);
    });

    const ordenados = temTempo
      ? ordemPorTempo(itens, tempoDe, nomeDe)
      : espalharEquipes(itens, equipeDe, nomeDe);

    const series = [];
    let k = 0;
    const tamanhos = tamanhosSeries(ordenados.length, nRaias,
                                    opts.regra || MENOS_SERIES);
    tamanhos.forEach((tam, idx) => {
      let grupo = ordenados.slice(k, k + tam);
      k += tam;
      if (temTempo) {
        // dentro da série o mais rápido fica na raia central
        grupo = grupo.slice().sort((a, b) => {
          const ta = tempoDe(a), tb = tempoDe(b);
          const va = ta == null || !isFinite(ta) ? Infinity : ta;
          const vb = tb == null || !isFinite(tb) ? Infinity : tb;
          return va - vb || cmpTexto(nomeDe(a), nomeDe(b));
        });
      }
      const ordem = ordemRaias(nRaias);
      const linhas = grupo.map((item, p) => ({ raia: ordem[p], item }));
      linhas.sort((a, b) => a.raia - b.raia);
      series.push({ numero: idx + 1, linhas });
    });
    return series;
  }

  /* ---------------- elegibilidade paralímpica ---------------- */
  // Mapa de provas por segmento, conferido contra os 80 cortes manuais
  // do árbitro no ParaJASC 2026.
  const R = (a, b) => {
    const s = [];
    for (let i = a; i <= b; i++) s.push(i);
    return s;
  };

  const REGRAS_PARA = {
    DF: {
      "50 LIVRE": R(1, 10), "100 LIVRE": R(1, 10),
      "200 LIVRE": R(1, 5), "400 LIVRE": R(6, 10),
      "50 COSTAS": R(1, 5), "100 COSTAS": [1, 2].concat(R(6, 10)),
      "50 PEITO": R(1, 3), "100 PEITO": R(4, 9),
      "50 BORBOLETA": R(1, 7), "100 BORBOLETA": R(8, 10),
      "150 MEDLEY": R(1, 4), "200 MEDLEY": R(5, 10),
    },
    DV: {
      "50 LIVRE": R(11, 13), "100 LIVRE": R(11, 13), "400 LIVRE": R(11, 13),
      "100 COSTAS": R(11, 13), "100 BORBOLETA": R(11, 13),
      "100 PEITO": R(11, 13), "200 MEDLEY": R(11, 13),
    },
    DI: {
      "100 LIVRE": [14], "200 LIVRE": [14], "400 LIVRE": [14],
      "100 COSTAS": [14], "100 BORBOLETA": [14],
      "100 PEITO": [14], "200 MEDLEY": [14],
    },
    DA: {
      "50 LIVRE": [15], "100 LIVRE": [15], "200 LIVRE": [15], "400 LIVRE": [15],
      "50 COSTAS": [15], "100 COSTAS": [15],
      "50 BORBOLETA": [15], "100 BORBOLETA": [15],
      "100 PEITO": [15], "200 MEDLEY": [15],
    },
    "TEA-DOWN": {
      "50 LIVRE": [16, 22], "100 LIVRE": [16, 22],
      "50 COSTAS": [16, 22], "100 COSTAS": [16, 22],
      "50 BORBOLETA": [16, 22], "100 BORBOLETA": [16, 22],
      "50 PEITO": [16, 22], "100 PEITO": [16, 22],
      "200 MEDLEY": [16, 22],
    },
  };

  const PREFIXO_PROVA = {
    "50 LIVRE": "S", "100 LIVRE": "S", "200 LIVRE": "S", "400 LIVRE": "S",
    "50 COSTAS": "S", "100 COSTAS": "S",
    "50 BORBOLETA": "S", "100 BORBOLETA": "S",
    "50 PEITO": "SB", "100 PEITO": "SB",
    "150 MEDLEY": "SM", "200 MEDLEY": "SM",
  };

  const CLASSES_DO_SEGMENTO = {
    DF: R(1, 10), DV: R(11, 13), DI: [14], DA: [15], "TEA-DOWN": [16, 22],
  };
  const SEGMENTO_CLASSE_UNICA = new Set(["DI", "DA", "TEA-DOWN"]);

  function parseClasses(texto) {
    const out = {};
    const avisos = [];
    if (!texto) return { classes: out, avisos };
    const bruto = String(texto).toUpperCase().replace(/\s+/g, "");
    for (const tok of bruto.split(/[/,;]+/)) {
      if (!tok) continue;
      const m = tok.match(/^(SB|SM|S)(\d+|\?+)$/);
      if (!m) {
        if (tok !== "---" && tok !== "-") avisos.push("classe ilegível: " + tok);
        continue;
      }
      out[m[1]] = m[2].includes("?") ? null : parseInt(m[2], 10);
    }
    return { classes: out, avisos };
  }

  function segmentoEfetivo(declarado, classes) {
    const s = classes.S;
    if (s === 16 || s === 22) return "TEA-DOWN";
    const d = String(declarado || "").toUpperCase().trim();
    return REGRAS_PARA[d] ? d : null;
  }

  const OK = "OK", CORTE_REG = "CORTE_REG", SEM_CLASSE = "SEM_CLASSE";

  function faixaTexto(lista, prefixo) {
    const v = lista.slice().sort((a, b) => a - b);
    const partes = [];
    let ini = v[0], ant = v[0];
    for (const x of v.slice(1)) {
      if (x === ant + 1) { ant = x; continue; }
      partes.push(ini === ant ? `${prefixo}${ini}` : `${prefixo}${ini}-${prefixo}${ant}`);
      ini = ant = x;
    }
    partes.push(ini === ant ? `${prefixo}${ini}` : `${prefixo}${ini}-${prefixo}${ant}`);
    return partes.join(", ");
  }

  /** Diz se o atleta pode nadar a prova. evento = "50 LIVRE" etc. */
  function classificar(segDeclarado, classeTexto, evento) {
    const { classes, avisos } = parseClasses(classeTexto);
    const seg = segmentoEfetivo(segDeclarado, classes);
    const prefixo = PREFIXO_PROVA[evento];
    if (!seg) {
      return { status: SEM_CLASSE, classe: "?", motivo: "segmento não identificado", avisos };
    }
    const permitidas = REGRAS_PARA[seg][evento];
    if (!permitidas) {
      return {
        status: CORTE_REG, classe: prefixo + "?",
        motivo: `${seg} não disputa ${evento.replace(" ", "m ")}`, avisos,
      };
    }
    let num = Object.prototype.hasOwnProperty.call(classes, prefixo)
      ? classes[prefixo] : "AUSENTE";
    // em DI, DA e TEA-DOWN a classe é única: S14 = SB14 = SM14
    if ((num === "AUSENTE" || num === null) && SEGMENTO_CLASSE_UNICA.has(seg)) {
      let base = classes.S;
      if (base == null && CLASSES_DO_SEGMENTO[seg].length === 1) {
        base = CLASSES_DO_SEGMENTO[seg][0];
      }
      if (base != null && CLASSES_DO_SEGMENTO[seg].includes(base)) {
        num = base;
        avisos.push(`${prefixo}${base} deduzido do segmento ${seg}`);
      }
    }
    // Se todas as classes do segmento são elegíveis nesta prova, a falta do
    // SB/SM não muda nada — vale para DV e para os segmentos de classe única.
    if ((num === "AUSENTE" || num === null) &&
        CLASSES_DO_SEGMENTO[seg].every((c) => permitidas.includes(c))) {
      const base = classes.S;
      if (base != null) {
        avisos.push(`${prefixo} não declarado; elegível em qualquer classe ${seg}`);
        return { status: OK, classe: `${prefixo}${base}*`, motivo: "", avisos };
      }
    }

    if (num === "AUSENTE") {
      return {
        status: SEM_CLASSE, classe: prefixo + "?",
        motivo: `sem classe ${prefixo} no mapa de provas (consta só '${classeTexto}')`,
        avisos,
      };
    }
    if (num === null) {
      return {
        status: SEM_CLASSE, classe: prefixo + "?",
        motivo: `classe ${prefixo} sem definição ('${classeTexto}')`, avisos,
      };
    }
    if (permitidas.includes(num)) {
      return { status: OK, classe: prefixo + num, motivo: "", avisos };
    }
    return {
      status: CORTE_REG, classe: prefixo + num,
      motivo: `${prefixo}${num} não nada ${evento.replace(" ", "m ")} — só ` +
              `${faixaTexto(permitidas, prefixo)} no ${seg}`,
      avisos,
    };
  }

  /* ---------------- validações do balizamento ---------------- */

  function normalizar(t) {
    return String(t == null ? "" : t)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase();
  }

  /**
   * Confere um balizamento pronto.
   * provas: [{ numero, titulo, nRaias, series:[{numero,linhas:[{raia,item}]}] }]
   * opts: { nomeDe, equipeDe, limiteDe(item) -> nº máx de provas individuais,
   *         ehRevezamento(prova) }
   */
  function validar(provas, opts) {
    opts = opts || {};
    const nomeDe = opts.nomeDe || ((i) => i.nome);
    const equipeDe = opts.equipeDe || ((i) => i.equipe || "");
    const erros = [];

    for (const p of provas) {
      const nRaias = p.nRaias || 6;
      const vistos = new Map();
      for (const s of p.series) {
        const raias = s.linhas.map((l) => l.raia);
        const rep = raias.filter((r, i) => raias.indexOf(r) !== i);
        if (rep.length) {
          erros.push({
            tipo: "RAIA DUPLICADA", gravidade: "critico", prova: p.numero,
            titulo: p.titulo, serie: s.numero,
            detalhe: `raia(s) ${[...new Set(rep)].join(", ")} com mais de um nadador`,
          });
        }
        if (raias.join() !== raias.slice().sort((a, b) => a - b).join()) {
          erros.push({
            tipo: "RAIA FORA DE ORDEM", gravidade: "aviso", prova: p.numero,
            titulo: p.titulo, serie: s.numero,
            detalhe: `listadas ${raias.join("-")}`,
          });
        }
        const esperado = raiasPara(s.linhas.length, nRaias).join();
        if (raias.slice().sort((a, b) => a - b).join() !== esperado) {
          erros.push({
            tipo: "RAIA FORA DO PADRÃO", gravidade: "aviso", prova: p.numero,
            titulo: p.titulo, serie: s.numero,
            detalhe: `${s.linhas.length} nadadores nas raias ` +
                     `${raias.slice().sort((a, b) => a - b).join("-")}; ` +
                     `o padrão usaria ${esperado.split(",").join("-")}`,
          });
        }
        if (s.linhas.length > nRaias) {
          erros.push({
            tipo: "SÉRIE ACIMA DAS RAIAS", gravidade: "critico", prova: p.numero,
            titulo: p.titulo, serie: s.numero,
            detalhe: `${s.linhas.length} nadadores para ${nRaias} raias`,
          });
        }
        for (const l of s.linhas) {
          const k = normalizar(nomeDe(l.item)) + "|" + normalizar(equipeDe(l.item));
          if (vistos.has(k)) {
            erros.push({
              tipo: "ATLETA REPETIDO NA PROVA", gravidade: "critico",
              prova: p.numero, titulo: p.titulo, serie: s.numero,
              detalhe: `${nomeDe(l.item)} já está na ${vistos.get(k)}ª série`,
            });
          } else vistos.set(k, s.numero);
        }
      }
    }
    return erros;
  }

  /** Conta provas por atleta e aponta quem passou do limite. */
  function conferirLimites(inscricoes, opts) {
    opts = opts || {};
    const limiteInd = opts.limiteIndividual || 5;
    const limiteRev = opts.limiteRevezamento || null;
    const limiteDe = opts.limiteDe || (() => limiteInd);
    const porAtleta = new Map();
    for (const i of inscricoes) {
      const k = normalizar(i.nome) + "|" + normalizar(i.equipe);
      if (!porAtleta.has(k)) porAtleta.set(k, { ind: [], rev: [], ref: i });
      (i.revezamento ? porAtleta.get(k).rev : porAtleta.get(k).ind).push(i);
    }
    const achados = [];
    for (const [, v] of porAtleta) {
      const lim = limiteDe(v.ref);
      if (v.ind.length > lim) {
        achados.push({
          tipo: "ACIMA DO LIMITE INDIVIDUAL", gravidade: "critico",
          nome: v.ref.nome, equipe: v.ref.equipe, quantidade: v.ind.length,
          limite: lim, provas: v.ind.map((x) => x.tituloProva),
        });
      }
      if (limiteRev && v.rev.length > limiteRev) {
        achados.push({
          tipo: "ACIMA DO LIMITE DE REVEZAMENTOS", gravidade: "critico",
          nome: v.ref.nome, equipe: v.ref.equipe, quantidade: v.rev.length,
          limite: limiteRev, provas: v.rev.map((x) => x.tituloProva),
        });
      }
    }
    achados.sort((a, b) => b.quantidade - a.quantidade ||
                           cmpTexto(a.nome, b.nome));
    return achados;
  }

  /* ---------------- tempo ---------------- */

  // Aceita "1:02.35", "62.35", "1:02:35", "00:31,20"
  function lerTempo(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
    const t = String(v).trim().replace(",", ".");
    if (!t || /^[-–—?]+$/.test(t)) return null;
    const partes = t.split(":").map((x) => x.trim());
    let seg = 0;
    try {
      if (partes.length === 1) seg = parseFloat(partes[0]);
      else if (partes.length === 2) seg = parseInt(partes[0], 10) * 60 + parseFloat(partes[1]);
      else if (partes.length === 3) {
        seg = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10) +
              parseFloat("0." + partes[2].replace(".", ""));
      } else return null;
    } catch (e) { return null; }
    return isFinite(seg) && seg > 0 ? seg : null;
  }

  function formatarTempo(seg) {
    if (seg == null || !isFinite(seg)) return "";
    const m = Math.floor(seg / 60);
    const s = seg - m * 60;
    return m > 0 ? `${m}:${s.toFixed(2).padStart(5, "0")}` : s.toFixed(2);
  }

  const api = {
    SEM_TEMPO, MENOS_SERIES, INCOMPLETA_PRIMEIRO,
    OK, CORTE_REG, SEM_CLASSE,
    ordemRaias, minimoPorSerie, tamanhosSeries, raiasPara,
    espalharEquipes, ordemPorTempo, montarSeries,
    REGRAS_PARA, PREFIXO_PROVA, parseClasses, segmentoEfetivo, classificar,
    faixaTexto, normalizar, validar, conferirLimites, lerTempo, formatarTempo,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Balizador = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
