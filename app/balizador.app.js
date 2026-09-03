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
  function perfilPadrao(tipo) {
    const t = TIPOS[tipo];
    return {
      nome: "", tipo, raias: 6, regraSerie: t.regraSerie,
      rotuloEquipe: t.rotuloEquipe, usarRegrasPara: t.usarRegrasPara,
      mostrarCategoria: t.mostrarCategoria, categoriasPara: t.categoriasPara.slice(),
      limiteInd: t.limiteInd, limiteRev: t.limiteRev,
      limiteIndPara: 3, etapas: [], grupos: [], ordemProvas: [],
      ignorarAbas: ["CASOS ESPECÍFICOS", "LEGENDAS"],
      dedupMisto: true,
    };
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
  function renderTipos() {
    const alvo = $("#tipos");
    alvo.innerHTML = "";
    for (const [k, t] of Object.entries(TIPOS)) {
      const b = document.createElement("button");
      b.className = "cartao-tipo";
      b.type = "button";
      b.dataset.tipo = k;
      b.innerHTML = `<strong>${t.rotulo}</strong><span>${t.descricao}</span>
        <em>exige: ${t.exige.join(" · ")}</em>`;
      b.onclick = () => escolherTipo(k);
      alvo.appendChild(b);
    }
  }

  function escolherTipo(tipo) {
    const nomeAtual = estado.perfil ? estado.perfil.nome : "";
    estado.perfil = perfilPadrao(tipo);
    estado.perfil.nome = nomeAtual;
    $$(".cartao-tipo").forEach((b) =>
      b.classList.toggle("marcado", b.dataset.tipo === tipo));
    $("#config").hidden = false;
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
    $("#dedupMisto").checked = p.dedupMisto;
    $("#linhaPara").hidden = !(p.categoriasPara && p.categoriasPara.length);
    atualizarPreviaRaias();
    renderEtapas();
    renderGrupos();
  }

  function atualizarPreviaRaias() {
    const n = parseInt($("#raias").value, 10) || 6;
    $("#previaRaias").textContent = B.ordemRaias(n).join(" · ");
    $("#previaMinimo").textContent = B.minimoPorSerie(n);
    const exemplos = [7, 13, 20, 41].map((x) =>
      `${x} → ${B.tamanhosSeries(x, n, $("#regraSerie").value).join("-")}`);
    $("#previaSeries").textContent = exemplos.join("   |   ");
  }

  function lerConfig() {
    const p = estado.perfil;
    p.nome = $("#nomeComp").value.trim();
    p.raias = parseInt($("#raias").value, 10) || 6;
    p.regraSerie = $("#regraSerie").value;
    p.limiteInd = parseInt($("#limiteInd").value, 10) || 0;
    const lr = $("#limiteRev").value.trim();
    p.limiteRev = lr === "" ? null : parseInt(lr, 10);
    p.limiteIndPara = parseInt($("#limiteIndPara").value, 10) || 3;
    p.rotuloEquipe = $("#rotuloEquipe").value.trim().toUpperCase() || "EQUIPE";
    p.dedupMisto = $("#dedupMisto").checked;
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
  async function carregarArquivo(file) {
    lerConfig();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ignorar = estado.perfil.ignorarAbas;

    let r = D.lerPlanilhaBlocos(wb, { ignorar });
    let formato = "blocos";
    if (!r.inscricoes.length) {
      r = D.lerPlanilhaLinhas(wb, {});
      formato = "linhas";
    }
    if (!r.inscricoes.length) {
      $("#resumoArquivo").innerHTML =
        `<p class="alerta">Não consegui identificar inscrições nesta planilha.
         Confira se a primeira linha traz os nomes das provas
         (ex.: <code>50 LIVRE</code>) ou use o modelo do app.</p>`;
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

    $("#resumoArquivo").innerHTML = `
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
    const totCrit = criticos.length + estado.limites.length +
                    cortes.filter((c) => c.gravidade === "critico").length;

    $("#painelConferencia").innerHTML = `
      <div class="fichas">
        <div class="ficha ${totCrit ? "ruim" : "bom"}"><b>${totCrit}</b><span>problemas críticos</span></div>
        <div class="ficha"><b>${avisos.length}</b><span>avisos de raia</span></div>
        <div class="ficha"><b>${cortes.filter((c) => c.gravidade === "info").length}</b><span>sem classe definida</span></div>
        <div class="ficha"><b>${estado.provas.length}</b><span>provas montadas</span></div>
      </div>
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

  /* ---------------- ligações ---------------- */
  function ligar() {
    renderTipos();
    $$(".passo").forEach((p) => (p.onclick = () => {
      if (!p.classList.contains("bloqueado")) irPara(p.dataset.passo);
    }));
    $("#raias").oninput = atualizarPreviaRaias;
    $("#regraSerie").oninput = atualizarPreviaRaias;
    $("#addEtapa").onclick = () => {
      const n = estado.perfil.etapas.length + 1;
      estado.perfil.etapas.push({ nome: n + "ª ETAPA", dia: "", periodo: "", de: 1, ate: 99 });
      renderEtapas();
    };
    $("#addGrupo").onclick = () => {
      estado.perfil.grupos.push({ rotulo: "", categorias: [], distancias: [], estilos: [] });
      renderGrupos();
    };
    $("#irInscritos").onclick = () => { lerConfig(); irPara("inscritos"); };
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
        estado.perfil = Object.assign(perfilPadrao(p.tipo || "ESCOLAR"), p);
        $$(".cartao-tipo").forEach((b) =>
          b.classList.toggle("marcado", b.dataset.tipo === estado.perfil.tipo));
        $("#config").hidden = false;
        preencherConfig();
        aviso("Perfil carregado.");
      } catch (err) { alert("Não consegui ler este arquivo de perfil."); }
    };
    renderPerfisSalvos();
  }

  function renderPerfisSalvos() {
    const lista = lerPerfis();
    const alvo = $("#perfisSalvos");
    if (!lista.length) { alvo.innerHTML = ""; return; }
    alvo.innerHTML = "<span>Perfis salvos:</span> " + lista.map((p, k) =>
      `<button type="button" class="mini claro" data-k="${k}">${p.nome}</button>`).join(" ");
    $$("button", alvo).forEach((b) => {
      b.onclick = () => {
        estado.perfil = Object.assign(perfilPadrao(lista[b.dataset.k].tipo),
                                      lista[b.dataset.k]);
        $$(".cartao-tipo").forEach((x) =>
          x.classList.toggle("marcado", x.dataset.tipo === estado.perfil.tipo));
        $("#config").hidden = false;
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
