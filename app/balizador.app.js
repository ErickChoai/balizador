/* =====================================================================
   BALIZADOR — interface
   ===================================================================== */
(function () {
  "use strict";
  const B = window.Balizador, D = window.BalizadorDados, S = window.BalizadorSaida;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const CX = (t) => String(t == null ? "" : t).toUpperCase();

  const TIPOS = {
    PARA: {
      rotulo: "Paradesportiva",
      descricao: "Segmentos DF, DV, DI, DA e TEA-DOWN com classe funcional " +
                 "(S/SB/SM). O app valida cada inscrição contra o mapa de provas.",
      exige: ["nome", "cidade", "segmento", "classe"],
      rotuloEquipe: "CIDADE", usarRegrasPara: true, mostrarCategoria: false,
      regraSerie: B.INCOMPLETA_PRIMEIRO, limiteInd: 5, limiteRev: null,
      categoriasPara: ["DF", "DV", "DI", "DA", "TEA"],
    },
    ESCOLAR: {
      rotulo: "Escolar por categoria",
      descricao: "Pré-mirim, mirim, infantil, juvenil. A categoria da aba já " +
                 "define a prova; não há classe funcional.",
      exige: ["nome", "escola", "categoria"],
      rotuloEquipe: "ESCOLA", usarRegrasPara: false, mostrarCategoria: false,
      regraSerie: B.MENOS_SERIES, limiteInd: 2, limiteRev: 2,
      categoriasPara: [],
    },
    ESCOLAR_PARA: {
      rotulo: "Escolar com paradesporto",
      descricao: "Categorias escolares e categorias paralímpicas A, B e C no " +
                 "mesmo evento, com classe funcional só nas provas paralímpicas.",
      exige: ["nome", "escola", "categoria", "classe (só nas paralímpicas)"],
      rotuloEquipe: "ESCOLA", usarRegrasPara: false, mostrarCategoria: true,
      regraSerie: B.MENOS_SERIES, limiteInd: 2, limiteRev: 2,
      categoriasPara: ["PARAL"],
    },
    TEMPO: {
      rotulo: "Clube / federação por tempo",
      descricao: "Sem categoria de deficiência. Havendo tempo de inscrição, " +
                 "o balizamento é por desempenho.",
      exige: ["nome", "equipe", "categoria", "tempo"],
      rotuloEquipe: "EQUIPE", usarRegrasPara: false, mostrarCategoria: false,
      regraSerie: B.MENOS_SERIES, limiteInd: 5, limiteRev: 2,
      categoriasPara: [],
    },
  };

  const estado = {
    perfil: null, inscricoes: [], abas: [], provas: [], erros: [], limites: [],
    arquivo: null,
  };

  /* ---------------- perfil ---------------- */
  function perfilPadrao() {
    return {
      nome: "", raias: "", regraSerie: "",
      rotuloEquipe: "ESCOLA",
      temPara: false, tipoClasse: "FUNCIONAL", temTempo: false,
      temRevezamento: false, mostrarCategoria: false, categoriasPara: [],
      limiteInd: "", limiteRev: "", limiteIndPara: "",
      etapas: [], grupos: [], programa: [], programaTexto: "",
      ignorarAbas: ["CASOS ESPECÍFICOS", "LEGENDAS", "COMO PREENCHER"],
      dedupMisto: true,
    };
  }

  // o "tipo" continua existindo, mas agora é deduzido do que foi marcado
  function tipoDe(p) {
    if (p.temPara && p.tipoClasse === "FUNCIONAL") return "PARA";
    if (p.temPara) return "ESCOLAR_PARA";
    if (p.temTempo) return "TEMPO";
    return "ESCOLAR";
  }

  function salvarPerfis(lista) {
    try { localStorage.setItem("balizador.perfis", JSON.stringify(lista)); }
    catch (e) { /* modo privado: segue sem salvar */ }
  }
  function lerPerfis() {
    try { return JSON.parse(localStorage.getItem("balizador.perfis") || "[]"); }
    catch (e) { return []; }
  }

  /* ---------------- navegação ---------------- */
  function irPara(passo) {
    $$(".passo").forEach((p) => p.classList.toggle("ativo", p.dataset.passo === passo));
    $$(".tela").forEach((t) => (t.hidden = t.dataset.tela !== passo));
    if (passo === "conferencia") renderConferencia();
    if (passo === "gerar") renderGerar();
    window.scrollTo(0, 0);
  }

  function liberar(passo, ok) {
    const el = $(`.passo[data-passo="${passo}"]`);
    if (el) el.classList.toggle("bloqueado", !ok);
  }

  /* ---------------- tela 1: competição ---------------- */
  const ATALHOS = {
    PARA: { temPara: true, tipoClasse: "FUNCIONAL", rotuloEquipe: "CIDADE",
            temTempo: false, temRevezamento: false, mostrarCategoria: false,
            regraSerie: B.INCOMPLETA_PRIMEIRO, limiteInd: 5, limiteRev: null,
            limiteIndPara: 5, categoriasPara: ["DF", "DV", "DI", "DA", "TEA"] },
    ESCOLAR: { temPara: false, rotuloEquipe: "ESCOLA", temTempo: false,
               temRevezamento: true, mostrarCategoria: false,
               regraSerie: B.MENOS_SERIES, limiteInd: 2, limiteRev: 2,
               limiteIndPara: 3, categoriasPara: [] },
    ESCOLAR_PARA: { temPara: true, tipoClasse: "CONDICAO", rotuloEquipe: "ESCOLA",
                    temTempo: false, temRevezamento: true, mostrarCategoria: true,
                    regraSerie: B.MENOS_SERIES, limiteInd: 2, limiteRev: 2,
                    limiteIndPara: 3, categoriasPara: ["PARAL"] },
    TEMPO: { temPara: false, rotuloEquipe: "EQUIPE", temTempo: true,
             temRevezamento: true, mostrarCategoria: false,
             regraSerie: B.MENOS_SERIES, limiteInd: 5, limiteRev: 2,
             limiteIndPara: 5, categoriasPara: [] },
    VAZIO: { temPara: false, rotuloEquipe: "ESCOLA", temTempo: false,
             temRevezamento: false, mostrarCategoria: false,
             regraSerie: "", limiteInd: "", limiteRev: "",
             limiteIndPara: "", raias: "", categoriasPara: [] },
  };

  function aplicarAtalho(chave) {
    const nome = estado.perfil ? estado.perfil.nome : "";
    const prog = estado.perfil ? estado.perfil.programaTexto : "";
    estado.perfil = Object.assign(perfilPadrao(), ATALHOS[chave] || ATALHOS.VAZIO);
    estado.perfil.nome = nome;
    estado.perfil.programaTexto = prog || "";
    if (chave === "ESCOLAR_PARA") {
      estado.perfil.grupos = [{
        rotulo: 'PARALÍMPICO "A" + "B"',
        categorias: ['PARAL "A"', 'PARAL "B"'], distancias: ["25M"], estilos: [],
      }];
    }
    preencherConfig();
  }

  function preencherConfig() {
    const p = estado.perfil;
    $("#nomeComp").value = p.nome;
    $("#raias").value = p.raias;
    $("#regraSerie").value = p.regraSerie;
    $("#limiteInd").value = p.limiteInd;
    $("#limiteRev").value = p.limiteRev == null ? "" : p.limiteRev;
    $("#limiteIndPara").value = p.limiteIndPara;
    $("#rotuloEquipe").value = p.rotuloEquipe;
    $("#temTempo").checked = !!p.temTempo;
    $("#temRevezamento").checked = !!p.temRevezamento;
    $("#temPara").checked = !!p.temPara;
    $("#tipoClasse").value = p.tipoClasse || "FUNCIONAL";
    $("#mostrarCategoria").checked = !!p.mostrarCategoria;
    $("#dedupMisto").checked = p.dedupMisto;
    $("#programa").value = p.programaTexto || "";
    atualizarDependentes();
    atualizarPreviaRaias();
    atualizarPrograma();
    renderEtapas();
    renderGrupos();
  }

  function atualizarDependentes() {
    const para = $("#temPara").checked;
    $("#blocoPara").hidden = !para;
    $("#linhaPara").hidden = !para;
    $("#notaClasse").textContent = $("#tipoClasse").value === "FUNCIONAL"
      ? "Com a classe funcional, o app confere cada inscrição contra o mapa de "
        + "provas paralímpico e corta quem não pode nadar aquela prova."
      : "Com o tipo de condição, o app apenas registra a classe no balizamento "
        + "e nas papeletas. Não há mapa de provas para validar.";
    renderPreviaFormato();
  }

  /* ---- exemplo visual: uma miniatura da planilha esperada ---- */
  function exemploVisual(p) {
    const eq = p.rotuloEquipe || "EQUIPE";
    const para = p.temPara;
    const funcional = para && p.tipoClasse === "FUNCIONAL";
    const cols = ["50 LIVRE", eq];
    if (funcional) cols.push("SEGMENTO", "CLASSE");
    else if (para) cols.push("CLASSE");
    cols.push("TEMPO");

    const ex1 = ["MARIA EXEMPLO DA SILVA", eq === "CIDADE" ? "BLUMENAU" : "COLÉGIO EXEMPLO"];
    const ex2 = ["JOÃO EXEMPLO SANTOS", eq === "CIDADE" ? "JOINVILLE" : "ESCOLA MODELO"];
    if (funcional) { ex1.push("DF", "S6/SB5/SM6"); ex2.push("DF", "S9/SB8/SM9"); }
    else if (para) { ex1.push("TEA"); ex2.push("DI"); }
    ex1.push(p.temTempo ? "31.20" : "");
    ex2.push(p.temTempo ? "29.85" : "");

    const letra = (i) => String.fromCharCode(66 + i);   // B, C, D...
    const aba = funcional ? "DF-FEM" : para ? 'PARAL "A"-FEM' : "MIRIM-FEM";

    const th = cols.map((c, i) =>
      `<th><span class="col">${letra(i)}</span>${c}</th>`).join("") +
      `<th class="vazia"><span class="col">${letra(cols.length)}</span></th>` +
      `<th><span class="col">${letra(cols.length + 1)}</span>100 COSTAS</th>`;
    const linha = (vals, n) => `<tr><td class="lin">${n}</td>` +
      vals.map((v) => `<td>${v}</td>`).join("") +
      `<td class="vazia"></td><td>${n === 1 ? "MARIA EXEMPLO DA SILVA" : "JOÃO EXEMPLO SANTOS"}</td></tr>`;

    return `
      <div class="planilha-exemplo">
        <div class="abas-exemplo"><span class="aba-ativa">${aba}</span>
          <span>${aba.replace("-FEM", "-MASC")}</span><span>…</span></div>
        <div class="scroll-x">
          <table class="grade">
            <thead><tr><th class="lin"></th>${th}</tr></thead>
            <tbody>${linha(ex1, 1)}${linha(ex2, 2)}</tbody>
          </table>
        </div>
        <p class="legenda-exemplo">A <b>linha 1</b> é o cabeçalho. A coluna
          <b>${letra(cols.length)}</b> fica em branco para separar um bloco de
          prova do próximo.${p.temRevezamento
            ? " Num bloco de revezamento (<b>4x50 LIVRE</b>), os 4 nomes vão na mesma célula, um por linha."
            : ""}</p>
      </div>`;
  }

  /* mostra, em tempo real, a planilha que será exigida */
  function renderPreviaFormato() {
    const p = lerConfig();
    const eq = p.rotuloEquipe;
    const linhas = [["NOME DA PROVA", "obrigatória",
                     "o cabeçalho do bloco: <code>50 LIVRE</code>, <code>4x50 LIVRE MISTO</code>"],
                    [eq, "obrigatória", "a instituição que o atleta representa"]];
    if (p.temPara && p.tipoClasse === "FUNCIONAL") {
      linhas.push(["SEGMENTO", "obrigatória",
                   "DF, DV, DI, DA ou TEA-DOWN — pode vir no nome da aba, como <code>DF-FEM</code>"]);
      linhas.push(["CLASSE", "obrigatória", "a classe funcional: <code>S6/SB5/SM6</code>"]);
    } else if (p.temPara) {
      linhas.push(["CLASSE", "obrigatória nas abas paralímpicas",
                   "o tipo de condição: <code>TEA</code>, <code>DI</code>, <code>DA</code>, <code>DOWN</code>"]);
    }
    linhas.push(["TEMPO", p.temTempo ? "obrigatória" : "opcional",
                 p.temTempo ? "o tempo de inscrição: <code>31.20</code> ou <code>1:02.35</code>"
                            : "se deixar em branco, o app espalha as equipes entre as séries"]);

    const abasEx = p.temPara && p.tipoClasse === "FUNCIONAL"
      ? ["DF-FEM", "DF-MASC", "DV-FEM", "DI-MASC"]
      : p.temPara ? ["MIRIM-FEM", "MIRIM-MASC", 'PARAL "A"-FEM', 'PARAL "A"-MASC']
      : ["MIRIM-FEM", "MIRIM-MASC", "INFANTIL-FEM", "INFANTIL-MASC"];

    $("#previaFormato").innerHTML = `
      <p class="nota"><b>Uma aba por categoria e naipe.</b> O nome da aba manda —
        sem <code>-FEM</code> ou <code>-MASC</code> no fim, a aba é recusada.
        Exemplo: ${abasEx.map((x) => `<code>${x}</code>`).join(" · ")}</p>
      <table class="tabela"><thead><tr><th>COLUNA</th><th>SITUAÇÃO</th>
      <th>O QUE VAI NELA</th></tr></thead><tbody>${
        linhas.map(([c, s, d]) => `<tr><td><code>${c}</code></td>
          <td class="${s.startsWith("obrig") ? "exigida" : "apagado"}">${s}</td>
          <td>${d}</td></tr>`).join("")}</tbody></table>
      <p class="nota">Prova sem ninguém: escreva <code>SEM INSCRITOS</code> na
        primeira linha do bloco.</p>
      ${exemploVisual(p)}`;
    validarConfig();
  }

  /* ---- nada de defaults escondidos: o que falta bloqueia o avanço ---- */
  const OBRIGATORIOS = [
    ["nomeComp", "o nome da competição"],
    ["raias", "quantas raias tem a piscina"],
    ["regraSerie", "como distribuir as séries"],
    ["limiteInd", "o limite de provas individuais por atleta"],
    ["programa", "o programa de provas"],
  ];

  function validarConfig() {
    const faltando = [];
    for (const [id, rotulo] of OBRIGATORIOS) {
      const el = $("#" + id);
      if (!el) continue;
      const vazio = !String(el.value || "").trim();
      el.classList.toggle("pendente", vazio);
      if (vazio) faltando.push(rotulo);
    }
    if ($("#temPara").checked && !String($("#limiteIndPara").value).trim()) {
      $("#limiteIndPara").classList.add("pendente");
      faltando.push("o limite de provas do paradesporto");
    } else {
      $("#limiteIndPara").classList.remove("pendente");
    }

    const alvo = $("#faltando");
    const botao = $("#irInscritos");
    if (faltando.length) {
      alvo.hidden = false;
      alvo.innerHTML = `<b>Falta preencher antes de seguir:</b>
        <ul>${faltando.map((f) => `<li>${f}</li>`).join("")}</ul>`;
      botao.disabled = true;
    } else {
      alvo.hidden = true;
      botao.disabled = false;
    }
    return !faltando.length;
  }

  function atualizarPrograma() {
    const texto = $("#programa").value;
    const r = D.lerPrograma(texto);
    estado.perfil.programaTexto = texto;
    estado.perfil.programa = r.provas;
    const alvo = $("#resumoPrograma");
    if (!texto.trim()) {
      alvo.innerHTML = `<p class="nota aviso-leve">Sem programa: as provas serão
        numeradas na ordem que o app deduzir, e provas sem inscritos não
        aparecerão.</p>`;
      return;
    }
    const recusa = r.recusadas.length
      ? `<p class="alerta">${r.recusadas.length} linha(s) não reconhecida(s):
         ${r.recusadas.slice(0, 4).map((x) =>
           `<code>linha ${x.linha}: ${x.texto.slice(0, 60)}</code>`).join(" ")}</p>`
      : "";
    alvo.innerHTML = `
      <p class="nota"><b>${r.provas.length} provas</b> reconhecidas.
        As três primeiras: ${r.provas.slice(0, 3).map((p) =>
          `<code>${p.distancia.toLowerCase()} ${p.estilo} ${p.rotulo} ` +
          `${{ FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[p.naipe]}</code>`
        ).join(" · ")}</p>${recusa}`;
  }

  function atualizarPreviaRaias() {
    const bruto = String($("#raias").value || "").trim();
    if (!bruto) {
      $("#previaRaias").textContent = "—";
      $("#previaMinimo").textContent = "—";
      $("#previaSeries").textContent = "informe as raias para ver";
      return;
    }
    const n = parseInt(bruto, 10) || 6;
    $("#previaRaias").textContent = B.ordemRaias(n).join(" · ");
    $("#previaMinimo").textContent = B.minimoPorSerie(n);
    const exemplos = [7, 13, 20, 41].map((x) =>
      `${x} → ${B.tamanhosSeries(x, n, $("#regraSerie").value).join("-")}`);
    $("#previaSeries").textContent = exemplos.join("   |   ");
  }

  function lerConfig() {
    const p = estado.perfil;
    p.nome = $("#nomeComp").value.trim();
    p.raias = parseInt($("#raias").value, 10) || 6;   // 6 só como fallback interno
    p.regraSerie = $("#regraSerie").value;
    p.limiteInd = parseInt($("#limiteInd").value, 10) || 0;
    const lr = $("#limiteRev").value.trim();
    p.limiteRev = lr === "" ? null : parseInt(lr, 10);
    p.limiteIndPara = parseInt($("#limiteIndPara").value, 10) || 3;
    p.rotuloEquipe = $("#rotuloEquipe").value.trim().toUpperCase() || "EQUIPE";
    p.temTempo = $("#temTempo").checked;
    p.temRevezamento = $("#temRevezamento").checked;
    p.temPara = $("#temPara").checked;
    p.tipoClasse = $("#tipoClasse").value;
    p.mostrarCategoria = $("#mostrarCategoria").checked;
    p.dedupMisto = $("#dedupMisto").checked;
    p.programaTexto = $("#programa").value;
    p.programa = D.lerPrograma(p.programaTexto).provas;
    // derivados, usados pelo motor
    p.tipo = tipoDe(p);
    p.usarRegrasPara = p.temPara && p.tipoClasse === "FUNCIONAL";
    if (p.temPara && !p.categoriasPara.length) {
      p.categoriasPara = p.usarRegrasPara
        ? ["DF", "DV", "DI", "DA", "TEA"] : ["PARAL"];
    }
    if (!p.temPara) p.categoriasPara = [];
    return p;
  }

  /* --- etapas --- */
  function renderEtapas() {
    const alvo = $("#etapas");
    alvo.innerHTML = "";
    estado.perfil.etapas.forEach((e, k) => {
      const l = document.createElement("div");
      l.className = "linha-etapa";
      l.innerHTML = `
        <input value="${e.nome}" data-c="nome" placeholder="1ª ETAPA">
        <input value="${e.dia}" data-c="dia" placeholder="22/09">
        <input value="${e.periodo}" data-c="periodo" placeholder="MANHÃ">
        <input value="${e.de}" data-c="de" type="number" min="1" style="width:5rem">
        <input value="${e.ate}" data-c="ate" type="number" min="1" style="width:5rem">
        <button type="button" class="mini" title="remover">×</button>`;
      $$("input", l).forEach((i) => {
        i.oninput = () => {
          const v = i.dataset.c === "de" || i.dataset.c === "ate"
            ? parseInt(i.value, 10) || 1 : i.value;
          estado.perfil.etapas[k][i.dataset.c] = v;
        };
      });
      $("button", l).onclick = () => {
        estado.perfil.etapas.splice(k, 1); renderEtapas();
      };
      alvo.appendChild(l);
    });
  }

  /* --- grupos de categorias que nadam juntas --- */
  function renderGrupos() {
    const alvo = $("#grupos");
    alvo.innerHTML = "";
    estado.perfil.grupos.forEach((g, k) => {
      const l = document.createElement("div");
      l.className = "linha-etapa";
      l.innerHTML = `
        <input value="${g.rotulo}" data-c="rotulo" placeholder='PARALÍMPICO "A" + "B"' style="flex:2">
        <input value="${(g.categorias || []).join(', ')}" data-c="categorias" placeholder='PARAL "A", PARAL "B"' style="flex:2">
        <input value="${(g.distancias || []).join(', ')}" data-c="distancias" placeholder="25M" style="width:7rem">
        <input value="${(g.estilos || []).join(', ')}" data-c="estilos" placeholder="LIVRE, COSTAS" style="width:10rem">
        <button type="button" class="mini" title="remover">×</button>`;
      $$("input", l).forEach((i) => {
        i.oninput = () => {
          const c = i.dataset.c;
          estado.perfil.grupos[k][c] = c === "rotulo" ? i.value
            : i.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
        };
      });
      $("button", l).onclick = () => {
        estado.perfil.grupos.splice(k, 1); renderGrupos();
      };
      alvo.appendChild(l);
    });
  }

  /* ---------------- tela 2: inscritos ---------------- */
  const COLUNAS_POR_TIPO = {
    PARA: [
      ["NOME DA PROVA", "obrigatória", "o próprio cabeçalho do bloco: 50 LIVRE"],
      ["CIDADE", "obrigatória", "a cidade que o atleta representa"],
      ["SEGMENTO", "obrigatória", "DF, DV, DI, DA ou TEA-DOWN — pode vir no nome da aba (DF-FEM)"],
      ["CLASSE", "obrigatória", "a classificação funcional: S6/SB5/SM6"],
      ["TEMPO", "opcional", "se preenchida, o balizamento passa a ser por desempenho"],
      ["EXCESSÃO", "opcional", "códigos de adaptação, copiados para o balizamento"],
    ],
    ESCOLAR: [
      ["NOME DA PROVA", "obrigatória", "o próprio cabeçalho do bloco: 25 LIVRE"],
      ["ESCOLA", "obrigatória", "aceita também COLÉGIO, EQUIPE ou CIDADE"],
      ["TEMPO", "opcional", "se preenchida, o balizamento passa a ser por desempenho"],
    ],
    ESCOLAR_PARA: [
      ["NOME DA PROVA", "obrigatória", "o próprio cabeçalho do bloco"],
      ["ESCOLA", "obrigatória", "aceita também COLÉGIO, EQUIPE ou CIDADE"],
      ["CLASSE", "obrigatória nas paralímpicas", "TEA, DI, DA, DOWN, DF-S6…"],
      ["TEMPO", "opcional", "se preenchida, o balizamento passa a ser por desempenho"],
    ],
    TEMPO: [
      ["NOME DA PROVA", "obrigatória", "o próprio cabeçalho do bloco"],
      ["EQUIPE", "obrigatória", "aceita também CLUBE, ESCOLA ou CIDADE"],
      ["TEMPO", "recomendada", "sem ela o app espalha as equipes em vez de balizar por tempo"],
    ],
  };

  function renderEspecificacao() {
    const tipo = estado.perfil ? estado.perfil.tipo : "ESCOLAR";
    $("#tipoAtual").textContent = TIPOS[tipo] ? TIPOS[tipo].rotulo : "";
    const linhas = COLUNAS_POR_TIPO[tipo] || COLUNAS_POR_TIPO.ESCOLAR;
    $("#colunasExigidas").innerHTML = `
      <table class="tabela"><thead><tr><th>COLUNA</th><th>SITUAÇÃO</th>
      <th>O QUE VAI NELA</th></tr></thead><tbody>${
        linhas.map(([c, s, d]) => `<tr>
          <td><code>${c}</code></td>
          <td class="${s.startsWith("obrig") ? "exigida" : "apagado"}">${s}</td>
          <td>${d}</td></tr>`).join("")}</tbody></table>`;
  }

  function listaAbasRuins(abas, problemas) {
    if (!abas.length && !problemas.length) return "";
    return `<table class="tabela"><thead><tr><th>ABA</th><th>PROBLEMA</th>
      <th>O QUE ACHEI NA PRIMEIRA LINHA</th></tr></thead><tbody>${
      abas.map((a) => `<tr><td><b>${a.aba}</b></td><td>${a.motivo}</td>
        <td class="apagado">${a.achado.length
          ? a.achado.map((x) => `<code>${x}</code>`).join(" ")
          : "(nada)"}</td></tr>`).join("")
      }${problemas.map((p) => `<tr><td>—</td><td colspan="2">${p}</td></tr>`).join("")
      }</tbody></table>`;
  }

  async function carregarArquivo(file) {
    lerConfig();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ignorar = estado.perfil.ignorarAbas;

    // antes de qualquer coisa: a planilha está no formato esperado?
    const conf = D.conferirPlanilha(wb, estado.perfil);
    if (!conf.ok && !conf.parcial) {
      estado.inscricoes = [];
      estado.provas = [];
      liberar("conferencia", false);
      liberar("gerar", false);
      $("#irConferencia").disabled = true;
      $("#resumoArquivo").innerHTML = `
        <div class="recusa">
          <h3>Não posso usar esta planilha</h3>
          <p>Ela não está no formato que o app entende. Prefiro recusar a
             montar um balizamento errado sem você perceber.</p>
          ${listaAbasRuins(conf.abasRuins, conf.problemas)}
          <p class="nota"><b>É assim que ela precisa ser:</b></p>
          ${exemploVisual(estado.perfil)}
          <p class="nota">Se preferir, baixe a planilha modelo no botão acima:
             ela já vem com os cabeçalhos certos.</p>
        </div>`;
      return;
    }

    let r = D.lerPlanilhaBlocos(wb, { ignorar });
    let formato = "blocos";
    if (!r.inscricoes.length) {
      r = D.lerPlanilhaLinhas(wb, {});
      formato = "linhas";
    }
    if (!r.inscricoes.length) {
      $("#resumoArquivo").innerHTML = `
        <div class="recusa"><h3>Nenhuma inscrição encontrada</h3>
        <p>Os cabeçalhos foram reconhecidos, mas não há nomes de atleta
           abaixo deles.</p></div>`;
      return;
    }

    let inscricoes = r.inscricoes;
    if (estado.perfil.dedupMisto) {
      const vistos = new Set();
      inscricoes = inscricoes.filter((i) => {
        if (!i.revezamento) return true;
        const k = [i.distancia, i.estilo, i.misto, B.normalizar(i.equipe),
                   (i.atletas || []).map(B.normalizar).join(">")].join("|");
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    }

    estado.inscricoes = inscricoes;
    estado.abas = r.abas;
    estado.arquivo = file.name;

    const ind = inscricoes.filter((i) => !i.revezamento).length;
    const rev = inscricoes.filter((i) => i.revezamento).length;
    const atletas = inscricoes.reduce(
      (s, i) => s + (i.atletas ? i.atletas.length : 1), 0);
    const comTempo = inscricoes.filter((i) => i.tempo != null).length;

    const alertaParcial = conf.parcial ? `
      <div class="recusa leve">
        <h3>${conf.abasRuins.length} aba(s) foram ignoradas</h3>
        <p>O resto foi lido normalmente, mas confira se estas deveriam entrar:</p>
        ${listaAbasRuins(conf.abasRuins, [])}
      </div>` : "";

    $("#resumoArquivo").innerHTML = alertaParcial + `
      <div class="fichas">
        <div class="ficha"><b>${atletas}</b><span>atletas</span></div>
        <div class="ficha"><b>${ind}</b><span>inscrições individuais</span></div>
        <div class="ficha"><b>${rev}</b><span>equipes de revezamento</span></div>
        <div class="ficha"><b>${comTempo}</b><span>com tempo informado</span></div>
      </div>
      <p class="nota">Formato reconhecido: <b>${formato === "blocos"
        ? "blocos de coluna (uma aba por categoria)" : "uma linha por inscrição"}</b>
        · arquivo <b>${file.name}</b></p>
      <table class="tabela"><thead><tr><th>ABA</th><th>PROVAS ENCONTRADAS</th>
      <th>INSCRIÇÕES</th></tr></thead><tbody>${
        r.abas.map((a) => `<tr><td>${a.aba}</td><td>${
          (a.provas || []).map((p) => p.distancia + " " + p.estilo).join(" · ") || "—"
        }</td><td class="num">${a.linhas}</td></tr>`).join("")
      }</tbody></table>`;

    montar();
    liberar("conferencia", true);
    liberar("gerar", true);
    $("#irConferencia").disabled = false;
  }

  function montar() {
    const p = lerConfig();
    estado.provas = D.montarBalizamento(estado.inscricoes, p);
    if (p.etapas && p.etapas.length === 0) {
      p.etapas = [];
    }
    estado.erros = B.validar(estado.provas, {
      nomeDe: (i) => i.nome, equipeDe: (i) => i.equipe,
    });
    const planas = D.inscricoesPlanas(estado.provas);
    estado.limites = B.conferirLimites(planas, {
      limiteIndividual: p.limiteInd,
      limiteRevezamento: p.limiteRev,
      limiteDe: (i) => (ehPara(i.categoria, p) ? p.limiteIndPara : p.limiteInd),
    });
    // marca em vermelho quem passou do limite
    const marcados = new Set(estado.limites.map(
      (a) => B.normalizar(a.nome) + "|" + B.normalizar(a.equipe)));
    for (const pr of estado.provas) {
      for (const s of pr.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const chaves = (it.atletas && it.atletas.length ? it.atletas : [it.nome])
            .map((n) => B.normalizar(n) + "|" + B.normalizar(it.equipe));
          it.marcado = chaves.some((k) => marcados.has(k));
          it.letraCategoria = letraCategoria(it.categoria);
        }
      }
      for (const c of pr.cortados) c.letraCategoria = letraCategoria(c.categoria);
    }
  }

  function ehPara(categoria, perfil) {
    const c = D.chaveCategoria(categoria);
    return (perfil.categoriasPara || []).some((x) => c.includes(D.chaveCategoria(x)));
  }

  function letraCategoria(cat) {
    const m = B.normalizar(cat).match(/\b([ABC])\b/);
    return m ? m[1] : "";
  }

  /* ---------------- tela 3: conferência ---------------- */
  function renderConferencia() {
    if (!estado.provas.length) montar();
    const criticos = estado.erros.filter((e) => e.gravidade === "critico");
    const avisos = estado.erros.filter((e) => e.gravidade !== "critico");
    const cortes = [];
    for (const p of estado.provas) {
      for (const c of (p.cortados || [])) {
        cortes.push({
          tipo: c.corteTipo === B.SEM_CLASSE ? "SEM CLASSE" : "CONTRA O REGULAMENTO",
          gravidade: c.corteTipo === B.SEM_CLASSE ? "info" : "critico",
          prova: p.numero, titulo: p.titulo, nome: c.nome, equipe: c.equipe,
          detalhe: c.motivo,
        });
      }
    }
    const foraDoPrograma = estado.provas
      .filter((p) => p.aviso && p.series.length)
      .map((p) => ({
        prova: p.numero, titulo: p.titulo, nome: "", equipe: "",
        detalhe: `${p.atletas} atleta(s) inscritos — ${p.aviso}`,
      }));
    const semInscritos = estado.provas.filter((p) => !p.series.length).length;
    const totCrit = criticos.length + estado.limites.length +
                    cortes.filter((c) => c.gravidade === "critico").length +
                    foraDoPrograma.length;

    $("#painelConferencia").innerHTML = `
      <div class="fichas">
        <div class="ficha ${totCrit ? "ruim" : "bom"}"><b>${totCrit}</b><span>problemas críticos</span></div>
        <div class="ficha"><b>${avisos.length}</b><span>avisos de raia</span></div>
        <div class="ficha"><b>${cortes.filter((c) => c.gravidade === "info").length}</b><span>sem classe definida</span></div>
        <div class="ficha"><b>${estado.provas.length}</b><span>provas montadas${
          semInscritos ? `, ${semInscritos} sem inscritos` : ""}</span></div>
      </div>
      ${bloco("Provas fora do programa oficial", foraDoPrograma, "critico")}
      ${bloco("Atletas acima do limite de provas", estado.limites.map((a) => ({
        prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
        detalhe: `${a.quantidade} provas (máximo ${a.limite}): ${a.provas.join(", ")}`,
      })), "critico")}
      ${bloco("Raias e duplicidades", criticos, "critico")}
      ${bloco("Inscrições contra o regulamento",
              cortes.filter((c) => c.gravidade === "critico"), "critico")}
      ${bloco("Sem classe definida", cortes.filter((c) => c.gravidade === "info"), "info")}
      ${bloco("Avisos de organização das raias", avisos, "aviso")}
      ${totCrit === 0 && !avisos.length
        ? '<p class="ok-vazio">Nenhum problema encontrado. O balizamento está pronto para gerar.</p>' : ""}`;
  }

  function bloco(titulo, itens, nivel) {
    if (!itens.length) return "";
    return `<section class="bloco ${nivel}">
      <h3>${titulo} <span class="contador">${itens.length}</span></h3>
      <table class="tabela"><thead><tr><th>PROVA</th><th>ATLETA</th>
      <th>EQUIPE</th><th>DETALHE</th></tr></thead><tbody>${
      itens.map((e) => `<tr>
        <td>${e.prova ? e.prova + "ª " + (e.titulo || "") : "—"}</td>
        <td>${CX(e.nome || "")}</td>
        <td class="apagado">${CX(e.equipe || "")}</td>
        <td>${e.detalhe || ""}</td></tr>`).join("")}</tbody></table></section>`;
  }

  /* ---------------- tela 4: gerar ---------------- */
  function renderGerar() {
    if (!estado.provas.length) montar();
    const atletas = estado.provas.reduce((s, p) => s + p.atletas, 0);
    $("#resumoGerar").innerHTML = `
      <div class="fichas">
        <div class="ficha"><b>${estado.provas.length}</b><span>provas</span></div>
        <div class="ficha"><b>${atletas}</b><span>atletas balizados</span></div>
        <div class="ficha"><b>${estado.perfil.raias}</b><span>raias</span></div>
        <div class="ficha"><b>${Math.ceil(atletas / 4)}</b><span>folhas de papeleta</span></div>
      </div>`;
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function baseNome() {
    return (estado.perfil.nome || "BALIZAMENTO").replace(/[\\/:*?"<>|]/g, "").trim();
  }

  function baixarModelo() {
    const p = lerConfig();
    const wb = D.gerarModelo(p);
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([out], { type: "application/octet-stream" }),
           "MODELO - " + (p.nome || "BALIZADOR") + ".xlsx");
  }

  /* ---------------- ligações ---------------- */
  function ligar() {
    estado.perfil = perfilPadrao();
    $$("[data-atalho]").forEach((b) =>
      (b.onclick = () => aplicarAtalho(b.dataset.atalho)));
    $$(".passo").forEach((p) => (p.onclick = () => {
      if (!p.classList.contains("bloqueado")) irPara(p.dataset.passo);
    }));
    $("#raias").oninput = atualizarPreviaRaias;
    $("#regraSerie").oninput = atualizarPreviaRaias;
    $("#programa").oninput = atualizarPrograma;
    ["temPara", "tipoClasse", "temTempo", "temRevezamento", "rotuloEquipe",
     "mostrarCategoria"].forEach((id) => {
      const el = $("#" + id);
      el.addEventListener("change", atualizarDependentes);
    });
    $("#btnModeloTopo").onclick = () => baixarModelo();
    preencherConfig();
    $("#addEtapa").onclick = () => {
      const n = estado.perfil.etapas.length + 1;
      estado.perfil.etapas.push({ nome: n + "ª ETAPA", dia: "", periodo: "", de: 1, ate: 99 });
      renderEtapas();
    };
    $("#addGrupo").onclick = () => {
      estado.perfil.grupos.push({ rotulo: "", categorias: [], distancias: [], estilos: [] });
      renderGrupos();
    };
    $("#irInscritos").onclick = () => {
      if (!validarConfig()) return;
      lerConfig(); renderEspecificacao(); irPara("inscritos");
    };
    ["nomeComp", "raias", "regraSerie", "limiteInd", "limiteIndPara", "programa"]
      .forEach((id) => $("#" + id).addEventListener("input", validarConfig));
    $("#regraSerie").addEventListener("change", validarConfig);
    $("#btnModelo").onclick = () => baixarModelo();
    $("#irConferencia").onclick = () => irPara("conferencia");
    $("#irGerar").onclick = () => irPara("gerar");

    const zona = $("#zona");
    zona.onclick = () => $("#arquivo").click();
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add("sobre"); };
    zona.ondragleave = () => zona.classList.remove("sobre");
    zona.ondrop = (e) => {
      e.preventDefault(); zona.classList.remove("sobre");
      if (e.dataTransfer.files[0]) carregarArquivo(e.dataTransfer.files[0]);
    };
    $("#arquivo").onchange = (e) => {
      if (e.target.files[0]) carregarArquivo(e.target.files[0]);
    };

    $("#btnXlsx").onclick = () => {
      montar();
      const wb = S.gerarXlsx(estado.provas, estado.perfil,
                             { erros: estado.erros, limites: estado.limites });
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      baixar(new Blob([out], { type: "application/octet-stream" }),
             baseNome() + " - BALIZAMENTO.xlsx");
    };
    $("#btnPdf").onclick = () => {
      montar();
      const doc = S.gerarPdfBalizamento(estado.provas, estado.perfil);
      doc.save(baseNome() + " - BALIZAMENTO.pdf");
    };
    $("#btnPapeletas").onclick = () => {
      montar();
      const { doc } = S.gerarPapeletas(estado.provas, estado.perfil);
      doc.save(baseNome() + " - PAPELETAS.pdf");
    };
    $("#btnPerfilSalvar").onclick = () => {
      const p = lerConfig();
      if (!p.nome) { alert("Dê um nome à competição antes de salvar."); return; }
      const lista = lerPerfis().filter((x) => x.nome !== p.nome);
      lista.push(JSON.parse(JSON.stringify(p)));
      salvarPerfis(lista);
      renderPerfisSalvos();
      aviso("Perfil salvo neste navegador.");
    };
    $("#btnPerfilExportar").onclick = () => {
      const p = lerConfig();
      baixar(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
             (p.nome || "perfil") + ".perfil.json");
    };
    $("#perfilArquivo").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const p = JSON.parse(await f.text());
        estado.perfil = Object.assign(perfilPadrao(), p);
        preencherConfig();
        aviso("Perfil carregado.");
      } catch (err) { alert("Não consegui ler este arquivo de perfil."); }
    };
    renderPerfisSalvos();
    renderEspecificacao();
  }

  function renderPerfisSalvos() {
    const lista = lerPerfis();
    const alvo = $("#perfisSalvos");
    if (!lista.length) { alvo.innerHTML = ""; return; }
    alvo.innerHTML = "<span>Perfis salvos:</span> " + lista.map((p, k) =>
      `<button type="button" class="mini claro" data-k="${k}">${p.nome}</button>`).join(" ");
    $$("button", alvo).forEach((b) => {
      b.onclick = () => {
        estado.perfil = Object.assign(perfilPadrao(), lista[b.dataset.k]);
        preencherConfig();
      };
    });
  }

  function aviso(txt) {
    const el = $("#aviso");
    el.textContent = txt;
    el.classList.add("visivel");
    setTimeout(() => el.classList.remove("visivel"), 2600);
  }

  document.addEventListener("DOMContentLoaded", ligar);
})();
