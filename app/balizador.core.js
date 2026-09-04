/* =====================================================================
   BALIZADOR, núcleo de regras
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
  const ULTIMAS_CHEIAS = "ULTIMAS_CHEIAS";

  /**
   * Tamanho de cada série, da primeira para a última.
   *
   * ULTIMAS_CHEIAS é a regra do app: as últimas séries saem cheias e a sobra
   * fica na primeira. Como o balizamento por tempo põe os mais rápidos nas
   * últimas séries, é lá que a piscina precisa estar cheia. Se a sobra deixar
   * a primeira série abaixo do mínimo, ela puxa nadadores da segunda.
   *
   *   41 atletas em 8 raias  ->  4, 5, 8, 8, 8, 8
   *   41 atletas em 6 raias  ->  5, 6, 6, 6, 6, 6, 6
   */
  function tamanhosSeries(n, nRaias, regra, minimo) {
    if (n <= 0) return [];
    if (n <= nRaias) return [n];

    if (regra == null || regra === ULTIMAS_CHEIAS) {
      const min = minimo == null ? minimoPorSerie(nRaias) : minimo;
      const series = Math.ceil(n / nRaias);
      const primeira = n - (series - 1) * nRaias;
      const cheias = Array(series - 1).fill(nRaias);
      if (primeira >= min) return [primeira].concat(cheias);
      // primeira série curta demais: a segunda cede o que falta
      cheias[0] = nRaias - (min - primeira);
      return [min].concat(cheias);
    }

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
                                    opts.regra || ULTIMAS_CHEIAS);
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
    // SB/SM não muda nada: vale para DV e para os segmentos de classe única.
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
      motivo: `${prefixo}${num} não nada ${evento.replace(" ", "m ")}: só ` +
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
        // Série curta no meio de uma prova grande é problema de divisão. Prova
        // pequena inteira não é: isso é tratado fora do laço, e só vira aviso
        // quando existe outra prova com que dê para juntar.
        const minimo = minimoPorSerie(nRaias);
        const totalDaProva = p.series.reduce((t, x) => t + x.linhas.length, 0);
        if (s.linhas.length < minimo && totalDaProva >= minimo) {
          erros.push({
            tipo: "SÉRIE ABAIXO DO MÍNIMO", gravidade: "aviso", prova: p.numero,
            titulo: p.titulo, serie: s.numero,
            detalhe: `${s.linhas.length} nadadores, abaixo do mínimo de ${minimo}`,
          });
        }
        for (const l of s.linhas) {
          // em revezamento a linha é a equipe, não o atleta: duas equipes da
          // mesma escola na mesma prova não são a mesma pessoa duas vezes.
          // Quem cuida desse caso é conferirRevezamentos.
          if (p.revezamento) continue;
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
      // revezamento inscrito só com a equipe: quem aparece na linha é a
      // escola, não um atleta. Contá-la faria a escola passar do limite de
      // revezamentos sozinha, sem ter inscrito ninguém duas vezes.
      if (i.semLista) continue;
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

  /* Compara categorias ignorando aspas, pontos e hífens:
       PARAL "A" == PARAL A        PRÉ-MIRIM "B" == PRE MIRIM B
     Esta é a única chave de categoria do app. Quando existiam duas, uma que
     tirava o hífen e outra que não, PRÉ-MIRIM "B" e PRE MIRIM B caíam na
     mesma prova e mesmo assim o atleta era acusado de estar em duas
     categorias. */
  function chaveDeCategoria(t) {
    return normalizar(t).replace(/["'“”‘’.]/g, "")
      .replace(/[-–—]/g, " ")     // vira espaço, não some: PRÉ-MIRIM = PRE MIRIM
      .replace(/\s+/g, " ").trim();
  }

  /**
   * Atleta inscrito em mais de uma categoria. Categoria é idade: ninguém é
   * mirim e infantil na mesma competição. Quando isso aparece, a inscrição
   * foi digitada errada, e o balizamento sairia com a pessoa nadando contra
   * duas faixas etárias diferentes.
   */
  function conferirCategorias(inscricoes) {
    const porAtleta = new Map();
    for (const i of inscricoes) {
      // a categoria de uma linha de revezamento é a da equipe, não a do
      // nadador. Contá-la faria todo mundo que nada o revezamento da escola
      // ser acusado de estar em duas categorias de idade ao mesmo tempo.
      if (i.revezamento) continue;
      const cat = chaveDeCategoria(i.categoria);
      if (!cat) continue;
      const k = normalizar(i.nome) + "|" + normalizar(i.equipe);
      if (!porAtleta.has(k)) porAtleta.set(k, { ref: i, cats: new Map() });
      const v = porAtleta.get(k);
      if (!v.cats.has(cat)) v.cats.set(cat, { rotulo: i.categoria, provas: [] });
      v.cats.get(cat).provas.push(i.tituloProva);
    }
    const achados = [];
    for (const [, v] of porAtleta) {
      if (v.cats.size < 2) continue;
      const cats = [...v.cats.values()];
      achados.push({
        tipo: "ATLETA EM MAIS DE UMA CATEGORIA", gravidade: "critico",
        nome: v.ref.nome, equipe: v.ref.equipe, quantidade: cats.length,
        categorias: cats.map((c) => c.rotulo),
        provas: cats.map((c) => c.rotulo + ": " + c.provas.join(", ")),
      });
    }
    achados.sort((a, b) => cmpTexto(a.nome, b.nome));
    return achados;
  }

  /* ---------------- revezamentos ----------------
     A célula do revezamento é o lugar onde mais se erra sem que nada apite:
     três nomes onde deviam ser quatro, o mesmo nadador escrito duas vezes,
     um misto com quatro meninas. Nada disso muda a raia, então só uma
     conferência de propósito encontra.
  ------------------------------------------------ */

  /**
   * opts: { sexoDe(nome, equipe) -> "FEM" | "MASC" | "" }
   * O sexo não vem da planilha: sai das provas individuais do próprio atleta,
   * e por isso o misto só é conferido quando os quatro são conhecidos.
   */
  function conferirRevezamentos(provas, opts) {
    opts = opts || {};
    const sexoDe = opts.sexoDe || (() => "");
    const achados = [];
    for (const p of provas) {
      if (!p.revezamento) continue;
      const equipes = new Map();
      for (const s of p.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const ke = normalizar(it.equipe);
          if (!equipes.has(ke)) equipes.set(ke, { rotulo: it.equipe, n: 0 });
          equipes.get(ke).n++;
          const nomes = (it.atletas || []).filter((n) => String(n).trim());
          if (it.semLista || !nomes.length) continue;

          if (nomes.length !== 4) {
            achados.push({
              tipo: nomes.length < 4 ? "REVEZAMENTO INCOMPLETO"
                                     : "REVEZAMENTO COM GENTE DEMAIS",
              gravidade: nomes.length < 4 ? "critico" : "aviso",
              prova: p.numero, titulo: p.titulo, nome: "", equipe: it.equipe,
              detalhe: `${nomes.length} nome(s) na célula, o revezamento tem 4`,
              item: it,
            });
          }
          const vistos = new Map();
          for (const n of nomes) {
            const k = normalizar(n);
            if (vistos.has(k)) {
              achados.push({
                tipo: "NADADOR REPETIDO NO REVEZAMENTO", gravidade: "critico",
                prova: p.numero, titulo: p.titulo, nome: n, equipe: it.equipe,
                detalhe: "escrito duas vezes na mesma equipe", item: it,
              });
            } else vistos.set(k, true);
          }
          if (p.naipe === "MISTO" && nomes.length === 4) {
            const sexos = nomes.map((n) => sexoDe(n, it.equipe));
            if (sexos.every((s) => s === "FEM" || s === "MASC")) {
              const f = sexos.filter((s) => s === "FEM").length;
              if (f !== 2) {
                achados.push({
                  tipo: "MISTO FORA DE DOIS E DOIS", gravidade: "aviso",
                  prova: p.numero, titulo: p.titulo, nome: "", equipe: it.equipe,
                  detalhe: `${f} do feminino e ${4 - f} do masculino, ` +
                           "pelas provas individuais deles", item: it,
                });
              }
            }
          }
        }
      }
      for (const [, v] of equipes) {
        if (v.n < 2) continue;
        achados.push({
          tipo: "DUAS EQUIPES DA MESMA INSTITUIÇÃO", gravidade: "aviso",
          prova: p.numero, titulo: p.titulo, nome: "", equipe: v.rotulo,
          detalhe: `${v.n} equipes desta instituição nesta prova`,
        });
      }
    }
    return achados;
  }

  /** Quantos atletas cada instituição pode inscrever na mesma prova. */
  function conferirPorEquipe(provas, limite) {
    if (!limite || limite < 1) return [];
    const achados = [];
    for (const p of provas) {
      if (p.revezamento) continue;
      const equipes = new Map();
      for (const s of p.series) {
        for (const l of s.linhas) {
          const k = normalizar(l.item.equipe);
          if (!k) continue;
          if (!equipes.has(k)) equipes.set(k, { rotulo: l.item.equipe, nomes: [] });
          equipes.get(k).nomes.push(l.item.nome);
        }
      }
      for (const [, v] of equipes) {
        if (v.nomes.length <= limite) continue;
        achados.push({
          tipo: "ACIMA DO LIMITE POR EQUIPE", gravidade: "critico",
          prova: p.numero, titulo: p.titulo, nome: "", equipe: v.rotulo,
          detalhe: `${v.nomes.length} atletas, o limite é ${limite}: ` +
                   v.nomes.join(", "),
        });
      }
    }
    return achados;
  }

  /* ---------------- a mesma pessoa em linhas diferentes ----------------
     Todo o resto do app conta atleta por nome mais equipe. Quando a mesma
     pessoa aparece escrita de dois jeitos, ou em duas equipes, ela vira duas
     pessoas: o limite de provas deixa de valer e a duplicidade some. Estas
     conferências existem para isso não passar calado.
  ---------------------------------------------------------------------- */

  function chaveAtleta(i) {
    return normalizar(i.nome) + "|" + normalizar(i.equipe);
  }

  function agrupar(inscricoes, chave) {
    const m = new Map();
    for (const i of inscricoes) {
      const k = chave(i);
      if (k == null) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  }

  /** O mesmo nome em duas equipes. Pode ser xará, pode ser a mesma pessoa. */
  function conferirMesmoNome(inscricoes) {
    const porNome = agrupar(inscricoes.filter((i) => !i.revezamento && !i.semLista),
                            (i) => normalizar(i.nome) || null);
    const achados = [];
    for (const [, lista] of porNome) {
      const equipes = new Map();
      for (const i of lista) {
        const k = normalizar(i.equipe);
        if (!equipes.has(k)) equipes.set(k, { rotulo: i.equipe, provas: [] });
        equipes.get(k).provas.push(i.tituloProva);
      }
      if (equipes.size < 2) continue;
      const v = [...equipes.values()];
      achados.push({
        tipo: "MESMO NOME EM DUAS EQUIPES", gravidade: "aviso",
        nome: lista[0].nome, equipe: v.map((x) => x.rotulo).join(" e "),
        quantidade: v.length,
        provas: v.map((x) => x.rotulo + ": " + x.provas.join(", ")),
      });
    }
    achados.sort((a, b) => cmpTexto(a.nome, b.nome));
    return achados;
  }

  /** O mesmo atleta com classe funcional ou segmento diferente entre provas. */
  function conferirClasses(inscricoes) {
    const porAtleta = agrupar(inscricoes.filter((i) => !i.revezamento), chaveAtleta);
    const achados = [];
    for (const [, lista] of porAtleta) {
      for (const campo of ["classe", "segmento"]) {
        const vistos = new Map();
        for (const i of lista) {
          const v = String(i[campo] == null ? "" : i[campo]).trim();
          if (!v) continue;
          const k = normalizar(v);
          if (!vistos.has(k)) vistos.set(k, { rotulo: v, provas: [] });
          vistos.get(k).provas.push(i.tituloProva);
        }
        if (vistos.size < 2) continue;
        const v = [...vistos.values()];
        achados.push({
          tipo: campo === "classe" ? "CLASSE DIFERENTE ENTRE AS PROVAS"
                                   : "SEGMENTO DIFERENTE ENTRE AS PROVAS",
          gravidade: "critico", campo,
          nome: lista[0].nome, equipe: lista[0].equipe, quantidade: v.length,
          valores: v.map((x) => x.rotulo),
          provasPorValor: v.map((x) => x.provas.join(", ")),
          provas: v.map((x) => x.rotulo + ": " + x.provas.join(", ")),
        });
      }
    }
    achados.sort((a, b) => cmpTexto(a.nome, b.nome));
    return achados;
  }

  /** O mesmo atleta inscrito no feminino e no masculino. */
  function conferirNaipes(inscricoes) {
    const porAtleta = agrupar(
      inscricoes.filter((i) => !i.revezamento &&
                        (i.naipe === "FEM" || i.naipe === "MASC")), chaveAtleta);
    const achados = [];
    for (const [, lista] of porAtleta) {
      const naipes = new Map();
      for (const i of lista) {
        if (!naipes.has(i.naipe)) naipes.set(i.naipe, []);
        naipes.get(i.naipe).push(i.tituloProva);
      }
      if (naipes.size < 2) continue;
      achados.push({
        tipo: "ATLETA NOS DOIS NAIPES", gravidade: "critico",
        nome: lista[0].nome, equipe: lista[0].equipe, quantidade: naipes.size,
        naipes: [...naipes.keys()],
        provas: [...naipes.entries()].map(([n, p]) =>
          (n === "FEM" ? "FEMININO" : "MASCULINO") + ": " + p.join(", ")),
      });
    }
    achados.sort((a, b) => cmpTexto(a.nome, b.nome));
    return achados;
  }

  /* ---------------- nomes quase iguais ---------------- */

  function distancia(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let ant = linha[0];
      linha[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = linha[j];
        linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1,
                            ant + (a[i - 1] === b[j - 1] ? 0 : 1));
        ant = tmp;
      }
    }
    return linha[b.length];
  }

  /* Duas escritas do mesmo nome. Vale a abreviação palavra por palavra,
     COL EXEMPLO e COLÉGIO EXEMPLO, o nome que ganhou um pedaço no fim,
     JOÃO DA SILVA e JOÃO DA SILVA JUNIOR, e o erro de digitação de uma ou
     duas letras em nome comprido. */
  function pareceOMesmo(a, b) {
    const x = normalizar(a), y = normalizar(b);
    if (!x || !y || x === y) return "";
    const px = x.split(" "), py = y.split(" ");
    const menor = Math.min(px.length, py.length);
    let iguais = true;
    for (let i = 0; i < menor; i++) {
      if (px[i] === py[i]) continue;
      const c = px[i].length <= py[i].length ? px[i] : py[i];
      const g = px[i].length <= py[i].length ? py[i] : px[i];
      if (c.length >= 3 && g.indexOf(c) === 0) continue;
      iguais = false;
      break;
    }
    if (iguais && px.length !== py.length) return "um tem palavras a mais";
    if (iguais && px.length === py.length) return "palavra abreviada";
    // erro de digitação: quanto mais curto o nome, menos folga, senão
    // "JOSE" e "JOAO" virariam a mesma pessoa
    const menorTexto = Math.min(x.length, y.length);
    const d = distancia(x, y);
    if (menorTexto >= 9 && d <= 2) return "diferença de duas letras";
    if (menorTexto >= 6 && d <= 1) return "diferença de uma letra";
    return "";
  }

  /** Nomes quase iguais na mesma equipe, e equipes quase iguais. */
  function conferirParecidos(inscricoes) {
    const achados = [];
    const equipes = new Map();
    const porEquipe = new Map();
    for (const i of inscricoes) {
      const ke = normalizar(i.equipe);
      if (ke && !equipes.has(ke)) equipes.set(ke, i.equipe);
      if (i.revezamento || i.semLista) continue;
      if (!porEquipe.has(ke)) porEquipe.set(ke, new Map());
      const kn = normalizar(i.nome);
      const mapa = porEquipe.get(ke);
      if (!mapa.has(kn)) mapa.set(kn, { rotulo: i.nome, provas: [] });
      mapa.get(kn).provas.push(i.tituloProva);
    }

    const lista = [...equipes.entries()];
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const motivo = pareceOMesmo(lista[i][1], lista[j][1]);
        if (!motivo) continue;
        achados.push({
          tipo: "EQUIPES QUASE IGUAIS", gravidade: "aviso", motivo,
          nome: "", equipe: lista[i][1] + " e " + lista[j][1], quantidade: 2,
          provas: [lista[i][1], lista[j][1]],
        });
      }
    }

    for (const [, mapa] of porEquipe) {
      const nomes = [...mapa.values()];
      for (let i = 0; i < nomes.length; i++) {
        for (let j = i + 1; j < nomes.length; j++) {
          const motivo = pareceOMesmo(nomes[i].rotulo, nomes[j].rotulo);
          if (!motivo) continue;
          achados.push({
            tipo: "NOMES QUASE IGUAIS", gravidade: "aviso", motivo,
            nome: nomes[i].rotulo + " e " + nomes[j].rotulo,
            equipe: "", quantidade: 2,
            provas: [nomes[i].rotulo + ": " + nomes[i].provas.join(", "),
                     nomes[j].rotulo + ": " + nomes[j].provas.join(", ")],
          });
        }
      }
    }
    return achados;
  }

  /* ---------------- idade e categoria ----------------
     Sem o regulamento na mão o app não sabe que ano nasce quem é mirim. O
     que ele sabe é o que está na planilha: se numa categoria quase todo mundo
     nasceu em 2012 e 2013, quem nasceu em 2008 está no lugar errado. A conta
     é essa, e o bloco diz de onde ela saiu.
  ---------------------------------------------------- */

  function anoDeNascimento(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.getFullYear();
    const t = String(v).trim();
    let m = t.match(/(\d{4})\s*$/) || t.match(/^(\d{4})/);
    if (m) {
      const ano = parseInt(m[1], 10);
      return ano >= 1900 && ano <= 2100 ? ano : null;
    }
    m = t.match(/\b(\d{2})\b\s*$/);   // 22/09/12
    if (m) {
      const n = parseInt(m[1], 10);
      return n > 30 ? 1900 + n : 2000 + n;
    }
    return null;
  }

  function mediana(v) {
    const s = v.slice().sort((a, b) => a - b);
    const meio = Math.floor(s.length / 2);
    return s.length % 2 ? s[meio] : Math.round((s[meio - 1] + s[meio]) / 2);
  }

  /** opts: { folga } anos de distância da mediana que ainda passam. */
  function conferirIdades(inscricoes, opts) {
    const folga = (opts && opts.folga) || 2;
    const porCategoria = agrupar(
      inscricoes.filter((i) => !i.revezamento && !i.semLista &&
                        anoDeNascimento(i.nascimento) != null),
      (i) => chaveDeCategoria(i.categoria) || null);
    const achados = [];
    for (const [, lista] of porCategoria) {
      const anos = lista.map((i) => anoDeNascimento(i.nascimento));
      if (anos.length < 4) continue;          // gente de menos para ter maioria
      const centro = mediana(anos);
      const dentro = anos.filter((a) => Math.abs(a - centro) <= folga);
      if (dentro.length < anos.length * 0.6) continue;   // categoria bagunçada
      const faixa = [...new Set(dentro)].sort((a, b) => a - b);
      for (const i of lista) {
        const ano = anoDeNascimento(i.nascimento);
        if (Math.abs(ano - centro) <= folga) continue;
        achados.push({
          tipo: "IDADE FORA DA CATEGORIA", gravidade: "aviso",
          nome: i.nome, equipe: i.equipe, categoria: i.categoria,
          ano, faixa: faixa[0] + (faixa.length > 1 ? " a " + faixa[faixa.length - 1] : ""),
          quantidade: 1, provas: [i.tituloProva],
        });
      }
    }
    achados.sort((a, b) => cmpTexto(a.nome, b.nome));
    return achados;
  }

  /** O mesmo atleta com duas datas de nascimento diferentes. */
  function conferirNascimentos(inscricoes) {
    const porAtleta = agrupar(inscricoes.filter((i) => !i.revezamento), chaveAtleta);
    const achados = [];
    for (const [, lista] of porAtleta) {
      const anos = new Map();
      for (const i of lista) {
        const a = anoDeNascimento(i.nascimento);
        if (a == null) continue;
        if (!anos.has(a)) anos.set(a, []);
        anos.get(a).push(i.tituloProva);
      }
      if (anos.size < 2) continue;
      achados.push({
        tipo: "DUAS DATAS DE NASCIMENTO", gravidade: "critico",
        nome: lista[0].nome, equipe: lista[0].equipe, quantidade: anos.size,
        valores: [...anos.keys()].map(String),
        provas: [...anos.entries()].map(([a, p]) => a + ": " + p.join(", ")),
      });
    }
    return achados;
  }

  /* ---------------- tempo ---------------- */

  /**
   * Aceita as formas em que o tempo aparece nas planilhas de verdade:
   *
   *   1:02.35   1:02:35   1.02.35   1'02"35     ->  62,35 s
   *   62.35     62,35     0:31.20                ->  como está escrito
   *   1:02                                       ->  1 minuto e 2 segundos
   *
   * Três grupos de números só podem ser minuto, segundo e centésimo, venham
   * separados por dois pontos, por ponto ou pelo apóstrofo da natação. Com
   * dois grupos o separador é que decide: ":" separa minuto de segundo, "."
   * separa segundo de centésimo. Com um grupo só, são segundos.
   *
   * Nada de adivinhar o resto: "1.02" continua sendo 1,02 segundo e "0:00:31"
   * continua sendo 0,31. Quem aponta esses dois é a conferência de tempo
   * impossível, que mostra a leitura ao lado da alternativa e deixa o árbitro
   * escolher, em vez de trocar o tempo dele por conta própria.
   */
  function lerTempo(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
    let t = String(v).trim();
    if (!t || /^[-–—?]+$/.test(t)) return null;
    // 99:99.99 é como os programas de natação escrevem "sem tempo". Lido ao pé
    // da letra viraria uma marca de 100 minutos, e o atleta cairia na série
    // errada em vez de ir para as primeiras, junto com quem não tem tempo.
    if (/^9{1,2}[:.,]9{2}([:.,]9{1,2})?$/.test(t)) return null;
    // 1'02"35 é 1:02.35 escrito do jeito antigo
    t = t.replace(/[’']/g, ":").replace(/[”"]/g, ".").replace(/,/g, ".");
    if (/[^0-9:.\s]/.test(t)) return null;
    const partes = t.split(/[:.]/).map((x) => x.trim()).filter((x) => x !== "");
    if (!partes.length || partes.some((x) => !/^\d+$/.test(x))) return null;
    let seg = 0;
    if (partes.length === 1) seg = parseFloat(partes[0]);
    else if (partes.length === 2) {
      seg = t.indexOf(":") >= 0
        ? parseInt(partes[0], 10) * 60 + parseFloat(partes[1])
        : parseFloat(partes[0] + "." + partes[1]);
    } else if (partes.length === 3) {
      seg = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10) +
            parseFloat("0." + partes[2]);
    } else return null;
    return isFinite(seg) && seg > 0 ? seg : null;
  }

  /* ---------------- tempo que não pode estar certo ----------------
     Um tempo de revezamento com a marca de um atleta só, ou o ponto que
     alguém esqueceu de digitar, põem o nadador na raia central da última
     série. O app não conserta sozinho: ele mede a velocidade que aquele
     tempo daria e, quando o número é impossível, mostra o caso.
  ------------------------------------------------------------------- */

  // O recorde mundial dos 50m livre dá 2,39 m/s. Acima de 2,6 não existe.
  const VELOCIDADE_MAXIMA = 2.6;
  // Folgado de propósito: um 25m de classe baixa passa de dois minutos.
  const VELOCIDADE_MINIMA = 0.15;

  // "50M" -> 50   "4X50M" -> 200   "100" -> 100
  function metrosDaProva(distancia) {
    const m = String(distancia == null ? "" : distancia).toUpperCase()
      .replace(/\s+/g, "").match(/^(?:(\d+)X)?(\d+)M?$/);
    if (!m) return 0;
    return (m[1] ? parseInt(m[1], 10) : 1) * parseInt(m[2], 10);
  }

  /** null se o tempo cabe na prova; senão { tipo, metros, piso, teto }. */
  function tempoSuspeito(segundos, distancia) {
    if (segundos == null || !isFinite(segundos) || segundos <= 0) return null;
    const metros = metrosDaProva(distancia);
    if (!metros) return null;
    const piso = metros / VELOCIDADE_MAXIMA;
    const teto = metros / VELOCIDADE_MINIMA;
    if (segundos < piso) return { tipo: "RAPIDO", metros, piso, teto };
    if (segundos > teto) return { tipo: "LENTO", metros, piso, teto };
    return null;
  }

  /**
   * Outras leituras possíveis do que está escrito, ficando só com as que dão
   * um tempo plausível para a distância. É o que vira o botão da conferência.
   */
  function alternativasDeTempo(texto, distancia) {
    const t = String(texto == null ? "" : texto).trim()
      .replace(/[’']/g, ":").replace(/[”"]/g, ".").replace(/,/g, ".");
    if (!t || /[^0-9:.\s]/.test(t)) return [];
    const partes = t.split(/[:.]/).map((x) => x.trim()).filter((x) => x !== "");
    if (partes.some((x) => !/^\d+$/.test(x))) return [];
    const saida = [];
    const põe = (seg, como) => {
      if (seg == null || !isFinite(seg) || seg <= 0) return;
      if (tempoSuspeito(seg, distancia)) return;
      if (saida.some((x) => Math.abs(x.segundos - seg) < 0.005)) return;
      saida.push({ segundos: seg, como });
    };
    if (partes.length === 3) {
      // 0:00:31 é como o Excel escreve 31 segundos numa célula de hora
      põe(parseInt(partes[0], 10) * 3600 + parseInt(partes[1], 10) * 60 +
          parseFloat(partes[2]), "hora, minuto e segundo");
    }
    if (partes.length === 2 && t.indexOf(":") < 0) {
      // 1.02 pode ser 1 minuto e 2 segundos escrito com ponto
      põe(parseInt(partes[0], 10) * 60 + parseFloat(partes[1]),
          "minuto e segundo");
    }
    if (partes.length === 1 && partes[0].length >= 3) {
      // 3120 é 31.20 sem o ponto
      const n = partes[0];
      põe(parseFloat(n.slice(0, -2) + "." + n.slice(-2)), "com o ponto no lugar");
      if (n.length >= 5) {
        põe(parseInt(n.slice(0, n.length - 4), 10) * 60 +
            parseFloat(n.slice(-4, -2) + "." + n.slice(-2)),
            "minuto, segundo e centésimo");
      }
    }
    return saida;
  }

  function formatarTempo(seg) {
    if (seg == null || !isFinite(seg)) return "";
    const m = Math.floor(seg / 60);
    const s = seg - m * 60;
    return m > 0 ? `${m}:${s.toFixed(2).padStart(5, "0")}` : s.toFixed(2);
  }

  const api = {
    SEM_TEMPO, MENOS_SERIES, INCOMPLETA_PRIMEIRO, ULTIMAS_CHEIAS,
    OK, CORTE_REG, SEM_CLASSE,
    ordemRaias, minimoPorSerie, tamanhosSeries, raiasPara,
    espalharEquipes, ordemPorTempo, montarSeries,
    REGRAS_PARA, PREFIXO_PROVA, parseClasses, segmentoEfetivo, classificar,
    faixaTexto, normalizar, validar, conferirLimites, conferirCategorias,
    lerTempo, formatarTempo,
    chaveDeCategoria, chaveAtleta, metrosDaProva,
    tempoSuspeito, alternativasDeTempo, anoDeNascimento, pareceOMesmo,
    conferirRevezamentos, conferirPorEquipe, conferirMesmoNome, conferirClasses,
    conferirNaipes, conferirParecidos, conferirIdades, conferirNascimentos,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Balizador = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
