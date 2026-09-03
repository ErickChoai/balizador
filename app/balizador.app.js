/* =====================================================================
   BALIZADOR, interface
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
      usarRegrasPara: true, mostrarCategoria: false,
      limiteInd: 5, limiteRev: null,
      categoriasPara: ["DF", "DV", "DI", "DA", "TEA"],
    },
    ESCOLAR: {
      rotulo: "Escolar por categoria",
      descricao: "Pré-mirim, mirim, infantil, juvenil. A categoria da aba já " +
                 "define a prova; não há classe funcional.",
      exige: ["nome", "escola", "categoria"],
      usarRegrasPara: false, mostrarCategoria: false,
      limiteInd: 2, limiteRev: 2,
      categoriasPara: [],
    },
    ESCOLAR_PARA: {
      rotulo: "Escolar com paradesporto",
      descricao: "Categorias escolares e categorias paralímpicas A, B e C no " +
                 "mesmo evento, com classe funcional só nas provas paralímpicas.",
      exige: ["nome", "escola", "categoria", "classe (só nas paralímpicas)"],
      usarRegrasPara: false, mostrarCategoria: true,
      limiteInd: 2, limiteRev: 2,
      categoriasPara: ["PARAL"],
    },
    TEMPO: {
      rotulo: "Clube / federação por tempo",
      descricao: "Sem categoria de deficiência. Havendo tempo de inscrição, " +
                 "o balizamento é por desempenho.",
      exige: ["nome", "equipe", "categoria", "tempo"],
      usarRegrasPara: false, mostrarCategoria: false,
      limiteInd: 5, limiteRev: 2,
      categoriasPara: [],
    },
  };

  const estado = {
    perfil: null, inscricoes: [], abas: [], provas: [], erros: [], limites: [],
    categorias: [], descartadas: [], arquivo: null,
    // correções feitas na tela da conferência, sem mexer na planilha:
    // provas tiradas de quem passou do limite, e nomes que faltavam
    ajustes: novosAjustes(),
    // o programa de provas lido da planilha, ou null enquanto não veio um:
    // { ok, aba, formato, arquivo, provas, linhas, problemas, sem }
    programa: null,
  };

  /* O que o árbitro mexeu na tela da conferência, sem tocar na planilha:
     linhas tiradas do balizamento, nomes que ele completou, e os problemas
     que ele leu e decidiu deixar como estão. */
  function novosAjustes() {
    return { removidas: new Set(), nomes: {}, aceitos: new Set(),
             jaVistos: new Set() };
  }

  /* ---------------- perfil ---------------- */
  function perfilPadrao() {
    return {
      nome: "", local: "", data: "", dataInicio: "", dataFim: "",
      datasDoPrograma: false, piscina: "",
      raias: "", regraSerie: B.ULTIMAS_CHEIAS,
      rotuloEquipe: "EQUIPE",
      temPara: false, tipoClasse: "FUNCIONAL", temTempo: false,
      temRevezamento: false, mostrarCategoria: false, categoriasPara: [],
      limiteInd: "", limiteRev: "", limiteIndPara: "",
      etapas: [], grupos: [], programa: [], programaTexto: "", programaArquivo: "",
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
    if (passo === "inscritos") mostrarPainel("formato");
    if (passo === "conferencia") renderConferencia();
    if (passo === "gerar") renderGerar();
    window.scrollTo(0, 0);
  }

  function mostrarPainel(qual) {
    renderEspecificacao();
    $("#painelFormato").hidden = qual !== "formato";
    $("#painelEnvio").hidden = qual !== "envio";
    window.scrollTo(0, 0);
  }

  function liberar(passo, ok) {
    const el = $(`.passo[data-passo="${passo}"]`);
    if (el) el.classList.toggle("bloqueado", !ok);
  }

  /* Depois de ler uma planilha, o que interessa aparece lá embaixo. Quem
     arrastou o arquivo no meio da página não vê nada mudar e acha que não
     pegou. Então a página vai até o resultado sozinha. */
  function mostrarResultado(id) {
    const alvo = $("#" + id);
    if (!alvo) return;
    // deixa o navegador pintar antes de medir a posição. Vai de setTimeout
    // porque requestAnimationFrame não roda com a aba em segundo plano.
    setTimeout(() => {
      const topo = $(".topo");
      const folga = (topo ? topo.getBoundingClientRect().height : 0) + 12;
      const destino = Math.max(0,
        alvo.getBoundingClientRect().top + window.scrollY - folga);
      window.scrollTo({ top: destino, behavior: "smooth" });
      // se a rolagem suave não pegou, vai direto: o importante é ver o resultado
      setTimeout(() => {
        if (Math.abs(window.scrollY - destino) > 40) window.scrollTo(0, destino);
      }, 400);
      alvo.classList.remove("recem-chegado");
      void alvo.offsetWidth;                       // reinicia a animação
      alvo.classList.add("recem-chegado");
    });
  }

  /* ---------------- tela 1: programa de provas ----------------
     Vem antes de tudo porque é o programa que dá a ordem e a numeração das
     provas. Uma linha que o app não entenda barra o programa inteiro: se ela
     passasse batida, todas as provas seguintes ficariam com o número trocado.
  ------------------------------------------------------------- */

  const NAIPE_LONGO = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" };

  function exemploProgramaVisual() {
    const cols = ["Nº", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE", "ETAPA"];
    const linhas = [
      ["1", "25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "FEMININO", "1ª ETAPA"],
      ["2", "25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "MASCULINO", "1ª ETAPA"],
      ["3", "25m", "LIVRE", 'PRÉ-MIRIM "B"', "FEMININO", "1ª ETAPA"],
      ["…", "…", "…", "…", "…", "…"],
      ["21", "4x25m", "LIVRE", 'PRÉ-MIRIM "B"', "MISTO", "2ª ETAPA"],
    ];
    const letra = (i) => String.fromCharCode(65 + i);      // A, B, C...
    const th = cols.map((c, i) =>
      `<th><span class="col">${letra(i)}</span>${c}</th>`).join("");
    const corpo = linhas.map((vals, n) =>
      `<tr><td class="lin">${n + 2}</td>${
        vals.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("");
    return `
      <div class="planilha-exemplo">
        <div class="abas-exemplo"><span class="aba-ativa">PROGRAMA</span></div>
        <div class="scroll-x">
          <table class="grade">
            <thead><tr><th class="lin"></th>${th}</tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>
        <p class="legenda-exemplo">A <b>linha 1</b> é o cabeçalho. Daí para baixo,
          uma prova por linha, na ordem oficial. O nome da aba não importa.</p>
      </div>`;
  }

  /* --- competições de exemplo, prontas para baixar --- */
  function baixarPlanilha(wb, nome) {
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([out], { type: "application/octet-stream" }), nome);
  }

  function renderExemplos() {
    const E = window.BalizadorExemplos;
    if (!E) return;
    html("listaExemplos", E.listaDeExemplos().map((x) => `
      <div class="linha-exemplo">
        <div>
          <b>${x.nome}</b>
          <span>${x.descricao} · ${x.provas} provas</span>
        </div>
        <div class="acoes-exemplo">
          <button type="button" class="mini claro" data-ex="${x.chave}"
                  data-qual="programa">programa de provas</button>
          <button type="button" class="mini claro" data-ex="${x.chave}"
                  data-qual="inscritos">inscritos</button>
        </div>
      </div>`).join(""));
    $$("#listaExemplos button").forEach((b) => {
      b.onclick = () => {
        const comp = E.COMPETICOES[b.dataset.ex];
        const programa = b.dataset.qual === "programa";
        baixarPlanilha(
          programa ? E.planilhaDoPrograma(comp) : E.planilhaDeInscritos(comp),
          E.nomeDoArquivo(b.dataset.ex, programa ? "PROGRAMA" : "INSCRITOS"));
        aviso(programa
          ? "Programa baixado. Arraste-o na área acima para ver o app lendo."
          : "Inscritos baixados. Eles são para o programa desta mesma competição.");
      };
    });
  }

  function baixarModeloPrograma() {
    const wb = D.gerarModeloPrograma();
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([out], { type: "application/octet-stream" }),
           "MODELO - PROGRAMA DE PROVAS.xlsx");
  }

  // agrupa provas consecutivas com a mesma etapa em intervalos de prova
  function etapasDoPrograma(provas) {
    const et = [];
    provas.forEach((p, i) => {
      const nome = String(p.etapa || "").trim();
      if (!nome) return;
      const ultima = et[et.length - 1];
      if (ultima && ultima.nome === nome && ultima.ate === i) {
        ultima.ate = i + 1;
        return;
      }
      et.push({ nome, dia: p.dia || "", periodo: p.periodo || "",
                de: i + 1, ate: i + 1 });
    });
    return et;
  }

  // copia o programa lido para dentro do perfil que está sendo montado
  function adotarPrograma() {
    const prog = estado.programa;
    estado.perfil.programa = (prog && prog.provas) || [];
    estado.perfil.programaArquivo = (prog && prog.arquivo) || "";
    if (prog && prog.provas && prog.provas.length) {
      const et = etapasDoPrograma(prog.provas);
      if (et.length) estado.perfil.etapas = et;
      // as datas já estavam na planilha: não faz sentido pedir de novo
      const datas = datasDoPrograma(prog.provas);
      if (datas && !estado.perfil.dataInicio && !estado.perfil.dataFim) {
        estado.perfil.dataInicio = datas.inicio;
        estado.perfil.dataFim = datas.fim;
        estado.perfil.datasDoPrograma = true;
      }
    }
  }

  /* Joga para os campos da tela as datas que vieram do programa. Sem isto o
     lerConfig da tela seguinte leria os campos ainda vazios e apagaria o que
     a planilha trouxe. */
  function sincronizarDatas() {
    const p = estado.perfil;
    const ini = $("#dataInicio"), fim = $("#dataFim");
    if (ini) ini.value = p.dataInicio || "";
    if (fim) fim.value = p.dataFim || "";
    atualizarPreviaData();
  }

  // recupera o programa de um perfil salvo ou importado
  function programaDoPerfil(p) {
    const base = { ok: true, aba: "", formato: "perfil", linhas: [], problemas: [],
                   arquivo: p.programaArquivo || "perfil salvo" };
    if (p.programa && p.programa.length)
      return Object.assign(base, { provas: p.programa });
    if (p.programaTexto && p.programaTexto.trim()) {
      const r = D.lerPrograma(p.programaTexto);
      if (r.provas.length) return Object.assign(base, { provas: r.provas });
    }
    return null;
  }

  function liberarCompeticao(ok) {
    liberar("competicao", ok);
    const b = $("#irCompeticao");
    if (b) b.disabled = !ok;
  }

  async function carregarPrograma(file) {
    let wb;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: "array", cellDates: false });
    } catch (e) {
      estado.programa = null;
      liberarCompeticao(false);
      html("resultadoPrograma", `
        <div class="recusa">
          <h3>Não consegui abrir este arquivo</h3>
          <p>Ele precisa ser uma planilha <code>.xlsx</code>, <code>.xlsm</code>
             ou <code>.csv</code>. O que veio foi <b>${file.name}</b>.</p>
        </div>`);
      return;
    }
    const r = D.lerProgramaPlanilha(wb);
    r.arquivo = file.name;
    estado.programa = r.provas.length ? r : null;
    if (estado.programa) { adotarPrograma(); sincronizarDatas(); }
    liberarCompeticao(!!(estado.programa && r.ok));
    renderResultadoPrograma(r);
    renderResumoPrograma();
    renderEtapas();
    mostrarResultado("resultadoPrograma");
  }

  function renderResultadoPrograma(r) {
    const ruins = r.linhas.filter((l) => !l.ok);

    if (!r.provas.length) {
      html("resultadoPrograma", `
        <div class="recusa">
          <h3>Não consegui ler o programa desta planilha</h3>
          <p>Prefiro recusar a montar um balizamento com a numeração trocada.</p>
          ${r.problemas.length ? `<ul class="lista-motivos">${
            r.problemas.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
          ${ruins.length ? tabelaLinhasRuins(ruins) : ""}
          <p class="nota"><b>É assim que ela precisa ser:</b></p>
          ${exemploProgramaVisual()}
          <div class="acoes">
            <button type="button" class="mini claro" id="btnModeloRecusaPrograma">
              Baixar a planilha modelo</button>
          </div>
        </div>`);
      ao("btnModeloRecusaPrograma", "click", baixarModeloPrograma);
      return;
    }

    const et = estado.perfil.etapas || [];
    const fichas = `
      <div class="fichas">
        <div class="ficha ${ruins.length ? "ruim" : "bom"}"><b>${r.provas.length}</b>
          <span>provas reconhecidas</span></div>
        <div class="ficha ${ruins.length ? "ruim" : ""}"><b>${ruins.length}</b>
          <span>linhas não entendidas</span></div>
        <div class="ficha"><b>${et.length || 0}</b><span>etapas</span></div>
        <div class="ficha"><b>${r.provas.filter((p) => /^\d+X/.test(p.distancia)).length}</b>
          <span>revezamentos</span></div>
      </div>`;

    if (ruins.length) {
      html("resultadoPrograma", `
        ${fichas}
        <div class="recusa">
          <h3>${ruins.length} linha(s) da planilha eu não entendi</h3>
          <p>Não sigo assim: se uma prova ficar de fora, todas as seguintes
             ficam com o número trocado, e isso não aparece em lugar nenhum
             depois. Corrija estas linhas e envie o arquivo de novo.</p>
          ${tabelaLinhasRuins(ruins)}
          <p class="nota">Se elas não forem provas (um recado, um total, uma
             linha sobrando), apague-as da planilha.</p>
          <div class="acoes">
            <button type="button" class="mini claro" id="btnIgnorarLinhas">
              São linhas que não são provas: ignorar e seguir</button>
          </div>
        </div>
        ${tabelaPrograma(r)}`);
      ao("btnIgnorarLinhas", "click", () => {
        estado.programa.ok = true;
        liberarCompeticao(true);
        aviso(`Seguindo com as ${r.provas.length} provas reconhecidas.`);
        renderResultadoPrograma(Object.assign({}, r, {
          linhas: r.linhas.filter((l) => l.ok), problemas: [] }));
      });
      return;
    }

    html("resultadoPrograma", `${fichas}
      <p class="nota">Lido de <b>${r.arquivo}</b>, aba <b>${r.aba}</b>,
        formato ${r.formato === "colunas"
          ? "de colunas separadas" : "de prova escrita por extenso"}.
        ${et.length ? `As etapas já foram montadas a partir da coluna ETAPA;
          você pode ajustá-las na próxima tela.` : ""}</p>
      ${tabelaPrograma(r)}`);
  }

  function tabelaLinhasRuins(ruins) {
    return `<table class="tabela"><thead><tr><th>LINHA</th>
      <th>O QUE ESTÁ ESCRITO</th><th>O PROBLEMA</th></tr></thead><tbody>${
      ruins.map((l) => `<tr><td class="num">${l.linha}</td>
        <td><code>${(l.texto || "(vazia)").slice(0, 70)}</code></td>
        <td>${l.motivo}</td></tr>`).join("")}</tbody></table>`;
  }

  function tabelaPrograma(r) {
    let etapaAtual = null;
    const linhas = r.provas.map((p, i) => {
      const et = String(p.etapa || "").trim();
      const faixa = et && et !== etapaAtual
        ? `<tr class="faixa-etapa"><td colspan="4">${et}${
            p.dia ? " · " + p.dia : ""}${p.periodo ? " · " + p.periodo : ""}</td></tr>`
        : "";
      etapaAtual = et || etapaAtual;
      const conferido = p.numero != null && p.numero !== i + 1
        ? `<span class="discordancia" title="a planilha diz ${p.numero}">≠ ${p.numero}</span>`
        : "";
      return faixa + `<tr>
        <td class="num">${i + 1}ª ${conferido}</td>
        <td>${p.distancia.toLowerCase()} ${p.estilo}</td>
        <td>${p.rotulo || p.categoria}</td>
        <td class="apagado">${NAIPE_LONGO[p.naipe] || p.naipe}</td></tr>`;
    }).join("");
    return `<div class="lista-programa">
      <table class="tabela"><thead><tr><th>Nº</th><th>PROVA</th>
      <th>CATEGORIA</th><th>NAIPE</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
  }

  function seguirSemPrograma() {
    estado.programa = null;
    adotarPrograma();
    liberarCompeticao(true);
    renderResumoPrograma();
    html("resultadoPrograma", `
      <div class="recusa leve">
        <h3>Seguindo sem o programa</h3>
        <p>Sem ele o app monta só as provas que têm inscritos, numeradas na
           ordem que ele deduzir, que quase nunca é a ordem oficial. Dá para
           voltar aqui e enviar o programa a qualquer momento.</p>
      </div>`);
    irPara("competicao");
  }

  /* ---------------- tela 2: competição ---------------- */
  const ATALHOS = {
    PARA: { temPara: true, tipoClasse: "FUNCIONAL",
            temTempo: false, temRevezamento: false, mostrarCategoria: false,
            limiteInd: 5, limiteRev: null,
            limiteIndPara: 5, categoriasPara: ["DF", "DV", "DI", "DA", "TEA"] },
    ESCOLAR: { temPara: false, temTempo: false,
               temRevezamento: true, mostrarCategoria: false,
               limiteInd: 2, limiteRev: 2,
               limiteIndPara: 3, categoriasPara: [] },
    ESCOLAR_PARA: { temPara: true, tipoClasse: "CONDICAO",
                    temTempo: false, temRevezamento: true, mostrarCategoria: true,
                    limiteInd: 2, limiteRev: 2,
                    limiteIndPara: 3, categoriasPara: ["PARAL"] },
    TEMPO: { temPara: false, temTempo: true,
             temRevezamento: true, mostrarCategoria: false,
             limiteInd: 5, limiteRev: 2,
             limiteIndPara: 5, categoriasPara: [] },
    VAZIO: { temPara: false, temTempo: false,
             temRevezamento: false, mostrarCategoria: false,
             limiteInd: "", limiteRev: "",
             limiteIndPara: "", raias: "", categoriasPara: [] },
  };

  function aplicarAtalho(chave) {
    const nome = estado.perfil ? estado.perfil.nome : "";
    estado.perfil = Object.assign(perfilPadrao(), ATALHOS[chave] || ATALHOS.VAZIO);
    estado.perfil.nome = nome;
    // o programa veio no passo anterior: um atalho de configuração não o apaga
    adotarPrograma();
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
    $("#local").value = p.local || "";
    $("#dataInicio").value = p.dataInicio || "";
    $("#dataFim").value = p.dataFim || "";
    $("#piscina").value = p.piscina || "";
    $("#raias").value = p.raias;
    $("#limiteInd").value = p.limiteInd;
    $("#limiteRev").value = p.limiteRev == null ? "" : p.limiteRev;
    $("#limiteIndPara").value = p.limiteIndPara;
    $("#temTempo").checked = !!p.temTempo;
    $("#temRevezamento").checked = !!p.temRevezamento;
    $("#temPara").checked = !!p.temPara;
    $("#tipoClasse").value = p.tipoClasse || "FUNCIONAL";
    $("#mostrarCategoria").checked = !!p.mostrarCategoria;
    $("#dedupMisto").checked = p.dedupMisto;
    atualizarDependentes();
    atualizarPreviaRaias();
    atualizarPreviaData();
    renderResumoPrograma();
    renderEtapas();
    renderGrupos();
  }

  function atualizarDependentes() {
    // as perguntas do paradesporto só aparecem depois que a caixa é marcada
    const para = $("#temPara").checked;
    $("#blocoPara").hidden = !para;
    $("#linhaPara").hidden = !para;
    renderEspecificacao();
    validarConfig();
  }

  /* ---- exemplo visual: uma miniatura da planilha esperada ---- */
  /* As colunas de apoio que esta competição pede, na ordem em que aparecem
     ao lado do nome da prova. */
  function colunasDeApoio(p) {
    const cols = ["EQUIPE"];
    if (p.temPara && p.tipoClasse === "FUNCIONAL") cols.push("SEGMENTO");
    if (p.temPara) cols.push("CLASSE");
    if (p.temTempo) cols.push("TEMPO");
    return cols;
  }

  /* Miniatura da planilha esperada: o nome da prova numa linha, os atletas
     embaixo, e a próxima prova depois de uma linha em branco.

     Havendo programa de provas, a miniatura usa as provas de verdade da
     competição, na ordem em que ele as numerou. É o mesmo que a pessoa vai
     encontrar na planilha pronta para preencher, então não sobra dúvida. */
  function exemploVisual(p) {
    const funcional = p.temPara && p.tipoClasse === "FUNCIONAL";
    const cols = colunasDeApoio(p);
    const equipes = ["COLÉGIO EXEMPLO", "CLUBE AURORA"];

    const apoio = (k) => {
      const v = [equipes[k]];
      if (funcional) v.push("DF");
      if (p.temPara) v.push(funcional ? (k ? "S9/SB8/SM9" : "S6/SB5/SM6") : "TEA");
      if (p.temTempo) v.push(k ? "29.85" : "31.20");
      return v;
    };

    const doPrograma = (p.programa || []).length;
    const cabecalhos = doPrograma
      ? p.programa.slice(0, 3).map((x) => D.cabecalhoDeProva(
          x.distancia, x.estilo, x.rotulo || x.categoria, x.naipe))
      : (() => {
          const cat = funcional ? "DF" : "MIRIM";
          const base = [`50M LIVRE ${cat} MASCULINO`, `50M LIVRE ${cat} FEMININO`];
          if (p.temRevezamento) base.push(`4X50M LIVRE ${cat} MISTO`);
          return base;
        })();

    const linhas = [];
    cabecalhos.forEach((cab, i) => {
      if (i) linhas.push({ tipo: "vazia", vals: [] });
      linhas.push({ tipo: "prova", vals: [cab].concat(cols) });
      const revez = /^\s*\d+\s*X/i.test(cab);
      if (revez) {
        linhas.push({ tipo: "atleta",
                      vals: ["ANA<br>BRUNO<br>CARLA<br>DIEGO"].concat(apoio(0)) });
        linhas.push({ tipo: "atleta", vals: [""].concat(apoio(1)) });
      } else {
        // o nome do exemplo segue o naipe da prova, senão confunde mais do
        // que ensina: uma Maria embaixo de uma prova masculina
        const fem = /\bFEMININO\b/i.test(cab);
        const nomes = fem
          ? ["MARIA EXEMPLO DA SILVA", "LARA EXEMPLO DIAS"]
          : ["JOÃO EXEMPLO SANTOS", "PEDRO EXEMPLO LIMA"];
        linhas.push({ tipo: "atleta", vals: [nomes[0]].concat(apoio(0)) });
        linhas.push({ tipo: "atleta", vals: [nomes[1]].concat(apoio(1)) });
      }
    });
    if (doPrograma > 3) {
      linhas.push({ tipo: "vazia", vals: [] });
      linhas.push({ tipo: "resto", vals: [
        `… e assim até a ${doPrograma}ª prova`] });
    }

    const nCols = 1 + cols.length;
    const letra = (i) => String.fromCharCode(65 + i);
    const th = Array.from({ length: nCols }, (_, i) =>
      `<th><span class="col">${letra(i)}</span></th>`).join("");
    const corpo = linhas.map((l, n) => {
      if (l.tipo === "resto") {
        return `<tr><td class="lin">${n + 1}</td>
          <td class="cel-resto" colspan="${nCols}">${l.vals[0]}</td></tr>`;
      }
      const tds = Array.from({ length: nCols }, (_, i) =>
        `<td${l.tipo === "prova" ? ' class="cel-prova"' : ""}>${
          l.vals[i] == null ? "" : l.vals[i]}</td>`).join("");
      return `<tr><td class="lin">${n + 1}</td>${tds}</tr>`;
    }).join("");

    return `
      <div class="planilha-exemplo">
        <div class="scroll-x">
          <table class="grade">
            <thead><tr><th class="lin"></th>${th}</tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>
        <p class="legenda-exemplo">${doPrograma
          ? `Estas são <b>as suas provas</b>, na ordem do programa que você
             enviou. A planilha pronta para preencher vem exatamente assim.`
          : "O nome da aba não importa, e você não precisa criar mais de uma."}
          As linhas destacadas são os nomes das provas.${
          p.temRevezamento
            ? " No revezamento, os 4 nomes vão na mesma célula, um por linha; a linha de baixo mostra uma equipe que ainda não definiu os nadadores."
            : ""}</p>
      </div>`;
  }

  /* ---- nada de defaults escondidos: o que falta bloqueia o avanço ---- */
  const OBRIGATORIOS = [
    ["nomeComp", "o nome da competição"],
    ["raias", "quantas raias tem a piscina"],
    ["limiteInd", "o limite de provas individuais por atleta"],
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
    // as etapas só são dispensáveis quando o programa já as trouxe conferidas
    problemasDasEtapas().forEach((p) => faltando.push(p));
    const cartaoEt = $("#cartaoEtapas");
    if (cartaoEt) cartaoEt.classList.toggle("pendente", !!problemasDasEtapas().length);

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

  /* --- datas da competição, escolhidas no calendário ---
     O árbitro só clica; quem escreve a frase é o app. Assim o cabeçalho do
     PDF sai sempre no mesmo formato, sem depender de quem digitou. */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                 "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  // "2026-09-22" -> { dia: 22, mes: 8, ano: 2026 }, sem passar por fuso horário
  function pedacosDaData(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { ano: +m[1], mes: +m[2] - 1, dia: +m[3] };
  }

  function textoDaData(inicio, fim) {
    const a = pedacosDaData(inicio), b = pedacosDaData(fim);
    if (!a && !b) return "";
    if (!a || !b) {
      const u = a || b;
      return `${u.dia} de ${MESES[u.mes]} de ${u.ano}`;
    }
    if (inicio > fim) return textoDaData(fim, inicio);
    if (a.ano === b.ano && a.mes === b.mes && a.dia === b.dia)
      return `${a.dia} de ${MESES[a.mes]} de ${a.ano}`;
    if (a.ano === b.ano && a.mes === b.mes) {
      // "22 e 23" só quando são dois dias seguidos; "22 a 25" pega o meio
      const ligacao = b.dia - a.dia === 1 ? " e " : " a ";
      return `${a.dia}${ligacao}${b.dia} de ${MESES[a.mes]} de ${a.ano}`;
    }
    if (a.ano === b.ano)
      return `${a.dia} de ${MESES[a.mes]} a ${b.dia} de ${MESES[b.mes]} de ${a.ano}`;
    return `${a.dia} de ${MESES[a.mes]} de ${a.ano} a ` +
           `${b.dia} de ${MESES[b.mes]} de ${b.ano}`;
  }

  /* A coluna DIA do programa vira as datas da competição, para ninguém ter de
     digitar duas vezes o que já está na planilha. Aceita 17/10, 17/10/2026 e
     2026-10-17; sem o ano, assume o ano corrente. */
  function diaParaIso(bruto) {
    const t = String(bruto == null ? "" : bruto).trim();
    if (!t) return "";
    const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
    const br = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (!br) return "";
    let ano = br[3] ? parseInt(br[3], 10) : new Date().getFullYear();
    if (ano < 100) ano += 2000;
    const mes = parseInt(br[2], 10), dia = parseInt(br[1], 10);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
    return `${ano}-${pad2(mes)}-${pad2(dia)}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function datasDoPrograma(provas) {
    const dias = (provas || []).map((p) => diaParaIso(p.dia)).filter(Boolean).sort();
    if (!dias.length) return null;
    return { inicio: dias[0], fim: dias[dias.length - 1] };
  }

  function atualizarPreviaData() {
    const texto = textoDaData($("#dataInicio").value, $("#dataFim").value);
    const alvo = $("#previaData");
    if (alvo) {
      alvo.textContent = texto;
      alvo.classList.toggle("veio-do-programa",
        !!(estado.perfil && estado.perfil.datasDoPrograma && texto));
    }
    // uma data de fim antes do início é engano de clique, não de digitação
    const fim = $("#dataFim");
    const invertida = $("#dataInicio").value && fim.value &&
                      $("#dataInicio").value > fim.value;
    fim.classList.toggle("pendente", !!invertida);
  }

  /* --- o cartão do programa dentro da tela de competição --- */
  function renderResumoPrograma() {
    const prog = estado.programa;
    if (!prog || !prog.provas || !prog.provas.length) {
      html("resumoPrograma", `<p class="nota aviso-leve">Sem programa: as provas
        serão numeradas na ordem que o app deduzir, que quase nunca é a ordem
        oficial; e provas sem inscritos não aparecerão.</p>`);
      return;
    }
    const et = estado.perfil.etapas || [];
    html("resumoPrograma", `
      <p class="nota"><b>${prog.provas.length} provas</b>, na ordem do arquivo
        <b>${prog.arquivo || "perfil salvo"}</b>${et.length
          ? `, em <b>${et.length} etapa(s)</b>` : ""}.
        As três primeiras: ${prog.provas.slice(0, 3)
          .map((p) => `<code>${D.linhaDoPrograma(p)}</code>`).join(" · ")}</p>`);
  }

  function atualizarPreviaRaias() {
    const bruto = String($("#raias").value || "").trim();
    if (!bruto) {
      $("#previaRaias").textContent = "";
      $("#previaMinimo").textContent = "";
      $("#previaSeries").textContent = "informe as raias para ver";
      return;
    }
    const n = parseInt(bruto, 10) || 6;
    $("#previaRaias").textContent = B.ordemRaias(n).join(" · ");
    $("#previaMinimo").textContent = B.minimoPorSerie(n);
    const exemplos = [7, 13, 20, 41].map((x) =>
      `${x}: ${B.tamanhosSeries(x, n, B.ULTIMAS_CHEIAS).join("-")}`);
    $("#previaSeries").textContent = exemplos.join("   |   ");
  }

  function lerConfig() {
    const p = estado.perfil;
    p.nome = $("#nomeComp").value.trim();
    p.local = $("#local").value.trim();
    p.dataInicio = $("#dataInicio").value;
    p.dataFim = $("#dataFim").value;
    p.data = textoDaData(p.dataInicio, p.dataFim);
    p.piscina = $("#piscina").value;
    p.raias = parseInt($("#raias").value, 10) || 6;   // 6 só como fallback interno
    p.regraSerie = B.ULTIMAS_CHEIAS;   // últimas séries cheias, sobra na primeira
    p.limiteInd = parseInt($("#limiteInd").value, 10) || 0;
    const lr = $("#limiteRev").value.trim();
    p.limiteRev = lr === "" ? null : parseInt(lr, 10);
    p.limiteIndPara = parseInt($("#limiteIndPara").value, 10) || 3;
    p.rotuloEquipe = "EQUIPE";   // o cabeçalho é sempre EQUIPE
    p.temTempo = $("#temTempo").checked;
    p.temRevezamento = $("#temRevezamento").checked;
    p.temPara = $("#temPara").checked;
    p.tipoClasse = $("#tipoClasse").value;
    p.mostrarCategoria = $("#mostrarCategoria").checked;
    p.dedupMisto = $("#dedupMisto").checked;
    // o programa veio da planilha do passo 1; o perfil só o carrega junto
    p.programa = (estado.programa && estado.programa.provas) || [];
    p.programaArquivo = (estado.programa && estado.programa.arquivo) || "";
    p.programaTexto = p.programa.map(D.linhaDoPrograma).join("\n");
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

  /* --- etapas ---
     Só é opcional quando o programa de provas já trouxe as etapas prontas.
     Sem elas, o PDF sai sem separar as sessões, e aí o árbitro precisa dizer
     onde cada uma começa e termina. Os campos nascem em branco, com exemplo:
     um número já preenchido é um número que ninguém confere. */
  function renderEtapas() {
    const alvo = $("#etapas");
    if (!alvo) return;
    const nProvas = (estado.perfil.programa || []).length;
    alvo.innerHTML = "";
    estado.perfil.etapas.forEach((e, k) => {
      const l = document.createElement("div");
      l.className = "linha-etapa";
      const v = (x) => (x == null || x === "" ? "" : String(x));
      l.innerHTML = `
        <input value="${v(e.nome)}" data-c="nome" placeholder="1ª ETAPA">
        <input value="${v(e.dia)}" data-c="dia" placeholder="22/09">
        <input value="${v(e.periodo)}" data-c="periodo" placeholder="MANHÃ">
        <input value="${v(e.de)}" data-c="de" type="number" min="1" placeholder="1">
        <input value="${v(e.ate)}" data-c="ate" type="number" min="1"
               placeholder="${nProvas || 20}">
        <button type="button" class="mini" title="remover esta etapa">×</button>`;
      $$("input", l).forEach((i) => {
        i.oninput = () => {
          const numerica = i.dataset.c === "de" || i.dataset.c === "ate";
          const bruto = i.value.trim();
          estado.perfil.etapas[k][i.dataset.c] = numerica
            ? (bruto === "" ? "" : parseInt(bruto, 10) || "")
            : i.value;
          validarConfig();
        };
      });
      $("button", l).onclick = () => {
        estado.perfil.etapas.splice(k, 1);
        renderEtapas();
        validarConfig();
      };
      alvo.appendChild(l);
    });
    atualizarNotaEtapas();
  }

  // as etapas vieram do programa? então o cartão é só conferência
  function etapasVieramDoPrograma() {
    const prog = estado.programa;
    return !!(prog && prog.provas &&
              prog.provas.some((p) => String(p.etapa || "").trim()));
  }

  function atualizarNotaEtapas() {
    const doPrograma = etapasVieramDoPrograma();
    const et = estado.perfil.etapas || [];
    const etiqueta = $("#etiquetaEtapas");
    if (etiqueta) {
      etiqueta.textContent = doPrograma ? "já preenchido" : "obrigatório";
      etiqueta.classList.toggle("exigido", !doPrograma && !et.length);
    }
    html("notaEtapas", doPrograma
      ? `As <b>${et.length} etapa(s)</b> vieram da coluna ETAPA do programa de
         provas. Confira e ajuste se precisar.`
      : `O programa que você enviou não trazia a coluna ETAPA, então diga aqui
         onde cada sessão começa e termina. Cada etapa abre uma página nova no
         PDF e aparece no alto dela. Competição de uma sessão só: uma etapa,
         da prova 1 até a última.`);
  }

  /* Uma etapa serve se tem nome e um intervalo de provas que faz sentido. */
  function problemasDasEtapas() {
    const et = estado.perfil.etapas || [];
    const nProvas = (estado.perfil.programa || []).length;
    if (!et.length) return ["em que etapas a competição se divide"];
    const problemas = [];
    et.forEach((e, k) => {
      const qual = `a ${k + 1}ª etapa`;
      if (!String(e.nome || "").trim()) problemas.push(`o nome d${qual}`);
      if (!e.de || !e.ate) problemas.push(`de que prova até que prova vai ${qual}`);
      else if (e.ate < e.de) problemas.push(`o intervalo d${qual}, que termina antes de começar`);
      else if (nProvas && e.ate > nProvas)
        problemas.push(`o intervalo d${qual}, que passa da ${nProvas}ª prova`);
    });
    return problemas;
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

  /* ---------------- tela 3: inscritos ---------------- */
  /* O que cada coluna de apoio guarda. A primeira linha não é coluna: é o
     nome da prova, que abre o bloco. */
  function colunasExigidasDe(p) {
    const eq = "EQUIPE";
    const funcional = p.temPara && p.tipoClasse === "FUNCIONAL";
    const linhas = [[
      "o nome da prova", "obrigatório",
      "abre o bloco, na primeira célula da linha: <code>50M LIVRE MIRIM MASCULINO</code>",
    ], [
      eq, "obrigatória", "a instituição que o atleta representa",
    ]];
    if (funcional) {
      linhas.push(["SEGMENTO", "obrigatória", "DF, DV, DI, DA ou TEA-DOWN"]);
      linhas.push(["CLASSE", "obrigatória", "a classe funcional: <code>S6/SB5/SM6</code>"]);
    } else if (p.temPara) {
      linhas.push(["CLASSE", "obrigatória nas paralímpicas",
                   "o tipo de condição: <code>TEA</code>, <code>DI</code>, <code>DA</code>, <code>DOWN</code>"]);
    }
    linhas.push(["TEMPO", p.temTempo ? "obrigatória" : "opcional",
      p.temTempo
        ? "o tempo de inscrição: <code>31.20</code> ou <code>1:02.35</code>"
        : "se vier preenchida, o balizamento passa a ser por desempenho"]);
    linhas.push(["NOME", "opcional",
      "só se você quiser uma coluna própria para o nome; sem ela, os nomes " +
      "ficam na mesma coluna do nome da prova"]);
    linhas.push(["CATEGORIA", "opcional",
      "para quando a categoria varia dentro da mesma prova"]);
    if (p.temPara) {
      linhas.push(["EXCESSÃO", "opcional",
                   "códigos de adaptação, copiados para o balizamento"]);
    }
    return linhas;
  }

  function renderEspecificacao() {
    const p = estado.perfil;
    if (!p) return;
    const tipo = p.tipo || "ESCOLAR";
    const alvoTipo = $("#tipoAtual");
    if (alvoTipo) alvoTipo.textContent = TIPOS[tipo] ? TIPOS[tipo].rotulo : "";
    html("colunasExigidas", `
      <table class="tabela"><thead><tr><th>O QUE</th><th>SITUAÇÃO</th>
      <th>O QUE VAI NELA</th></tr></thead><tbody>${
        colunasExigidasDe(p).map(([c, s, d]) => `<tr>
          <td><code>${c}</code></td>
          <td class="${s.startsWith("obrigat") ? "exigida" : "apagado"}">${s}</td>
          <td>${d}</td></tr>`).join("")}</tbody></table>`);
    html("exemploFormato", exemploVisual(p));
    const temPrograma = (p.programa || []).length;
    html("notaModelo", temPrograma
      ? `A planilha vem com as <b>${temPrograma} provas do seu programa</b> já
         escritas, na ordem certa. Você só digita os nomes embaixo de cada uma.`
      : `Sem programa de provas, a planilha vem com algumas provas de exemplo
         para você trocar.`);
  }

  function listaAbasRuins(abas, problemas) {
    if (!abas.length && !problemas.length) return "";
    return `<table class="tabela"><thead><tr><th>ABA</th><th>PROBLEMA</th>
      <th>O QUE ACHEI NA PRIMEIRA LINHA</th></tr></thead><tbody>${
      abas.map((a) => `<tr><td><b>${a.aba}</b></td><td>${a.motivo}</td>
        <td class="apagado">${a.achado.length
          ? a.achado.map((x) => `<code>${x}</code>`).join(" ")
          : "(nada)"}</td></tr>`).join("")
      }${problemas.map((p) => `<tr><td></td><td colspan="2">${p}</td></tr>`).join("")
      }</tbody></table>`;
  }

  // linhas com instituição mas sem nome de atleta: não viram inscrição, e
  // sumir com elas caladamente seria justamente o erro que não pode acontecer
  function listaDescartadas(descartadas) {
    if (!descartadas || !descartadas.length) return "";
    return `<div class="recusa leve">
      <h3>${descartadas.length} linha(s) ficaram de fora</h3>
      <p>Elas têm a instituição preenchida, mas nenhum nome de atleta ao lado.
         Se for inscrição de verdade, escreva o nome e envie de novo.</p>
      <table class="tabela"><thead><tr><th>LINHA</th><th>PROVA</th>
      <th>INSTITUIÇÃO</th></tr></thead><tbody>${
        descartadas.slice(0, 12).map((d) => `<tr><td class="num">${d.linha}</td>
          <td>${d.prova}</td><td>${CX(d.equipe)}</td></tr>`).join("")
      }</tbody></table></div>`;
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
          <p class="nota">Corrija a planilha e envie de novo, ou baixe a
             planilha modelo: ela já vem com os cabeçalhos certos.</p>
          <div class="acoes">
            <button type="button" class="mini claro" id="btnModeloRecusa">Baixar planilha modelo</button>
            <button type="button" class="mini claro" id="btnVoltarFormato">Rever o formato completo</button>
          </div>
        </div>`;
      $("#btnModeloRecusa").onclick = () => baixarModelo();
      $("#btnVoltarFormato").onclick = () => mostrarPainel("formato");
      return;
    }

    // a lista vertical é o formato que o app pede; os outros dois continuam
    // valendo para quem já tem a planilha pronta de anos anteriores
    let r = D.lerPlanilhaLista(wb, { ignorar });
    let formato = "lista";
    if (!r.inscricoes.length) {
      r = D.lerPlanilhaBlocos(wb, { ignorar });
      formato = "blocos";
    }
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
    estado.descartadas = r.descartadas || [];
    estado.ajustes = novosAjustes();

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
      ${listaDescartadas(r.descartadas)}
      <p class="nota">Formato reconhecido: <b>${{
        lista: "uma prova embaixo da outra",
        blocos: "blocos de coluna (uma aba por categoria)",
        linhas: "uma linha por inscrição",
      }[formato]}</b> · arquivo <b>${file.name}</b></p>
      <table class="tabela"><thead><tr><th>ABA</th><th>PROVAS ENCONTRADAS</th>
      <th>INSCRIÇÕES</th></tr></thead><tbody>${
        r.abas.map((a) => `<tr><td>${a.aba}</td><td>${
          (a.provas || []).map((p) => p.distancia + " " + p.estilo).join(" · ") || ""
        }</td><td class="num">${a.linhas}</td></tr>`).join("")
      }</tbody></table>`;

    montar();
    liberar("conferencia", true);
    $("#irConferencia").disabled = false;
    // a conferência é quem destranca o passo de gerar
    renderConferencia();
    mostrarResultado("resumoArquivo");
  }

  // uma inscrição é identificada pela linha da planilha de onde veio
  function chaveDaLinha(x) {
    return String(x.aba) + "|" + String(x.linha);
  }

  /* As inscrições que vão para o balizamento: as lidas da planilha, menos as
     que o árbitro tirou na conferência, mais as que ele completou ali. */
  function inscricoesAjustadas() {
    const aj = estado.ajustes || { removidas: new Set(), nomes: {} };
    let lista = estado.inscricoes.filter((i) => !aj.removidas.has(chaveDaLinha(i)));
    for (const [chave, nome] of Object.entries(aj.nomes || {})) {
      if (!String(nome || "").trim()) continue;
      const d = (estado.descartadas || []).find((x) => chaveDaLinha(x) === chave);
      if (d && d.base) {
        lista = lista.concat([Object.assign({}, d.base, { nome: nome.trim() })]);
      }
    }
    return lista;
  }

  function montar() {
    const p = lerConfig();
    estado.provas = D.montarBalizamento(inscricoesAjustadas(), p);
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
    estado.categorias = B.conferirCategorias(planas);

    /* Marca em vermelho, com o motivo escrito, quem o balizamento não deveria
       aceitar do jeito que está: passou do limite de provas, ou aparece em
       duas categorias de idade ao mesmo tempo. */
    const marcados = new Map();
    const anotar = (a, motivo) => {
      const k = B.normalizar(a.nome) + "|" + B.normalizar(a.equipe);
      marcados.set(k, marcados.has(k) ? marcados.get(k) + "; " + motivo : motivo);
    };
    estado.limites.forEach((a) => anotar(a,
      `${a.quantidade} provas, o limite é ${a.limite}`));
    estado.categorias.forEach((a) => anotar(a,
      `inscrito em ${a.categorias.join(" e ")}`));

    for (const pr of estado.provas) {
      for (const s of pr.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const chaves = (it.atletas && it.atletas.length ? it.atletas : [it.nome])
            .map((n) => B.normalizar(n) + "|" + B.normalizar(it.equipe));
          const achado = chaves.find((k) => marcados.has(k));
          it.marcado = !!achado;
          it.motivoMarcado = achado ? marcados.get(achado) : "";
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

  /* ---------------- tela 4: conferência ----------------
     Cada problema traz três coisas: o que é, o que vai acontecer com ele nos
     arquivos, e o jeito de resolver aqui mesmo. Voltar ao Excel para trocar um
     nome é o tipo de ida e volta que faz o árbitro desistir de conferir.

     Enquanto sobrar problema vermelho sem resolver, o passo de gerar fica
     trancado. Nem todo vermelho tem conserto dentro do app; para esses existe
     o "seguir assim mesmo", que é uma decisão consciente e fica registrada.
  ------------------------------------------------------- */

  function montarSecoes() {
    const criticos = estado.erros.filter((e) => e.gravidade === "critico");
    const avisos = estado.erros.filter((e) => e.gravidade !== "critico");

    const cortes = [];
    for (const p of estado.provas) {
      for (const c of (p.cortados || [])) {
        cortes.push({
          gravidade: c.corteTipo === B.SEM_CLASSE ? "info" : "critico",
          prova: p.numero, titulo: p.titulo, nome: c.nome, equipe: c.equipe,
          detalhe: c.motivo,
        });
      }
    }

    const provasFora = estado.provas.filter((p) => p.aviso && p.series.length);
    const semLista = [];
    for (const p of estado.provas) {
      for (const s of p.series) {
        for (const l of s.linhas) {
          if (!l.item.semLista) continue;
          semLista.push({
            prova: p.numero, titulo: p.titulo, nome: "", equipe: l.item.equipe,
            detalhe: `${s.numero}ª série, raia ${l.raia}`, item: l.item,
          });
        }
      }
    }

    const semInscritos = estado.provas.filter((p) => !p.series.length);
    const descartadas = (estado.descartadas || [])
      .filter((d) => !String((estado.ajustes.nomes || {})[chaveDaLinha(d)] || "").trim());
    const juntaveis = provasQueDaParaJuntar();

    return [
      {
        id: "foraPrograma", titulo: "Provas fora do programa oficial",
        nivel: "critico",
        itens: provasFora.map((p) => ({
          prova: p.numero, titulo: p.titulo, nome: "", equipe: "",
          detalhe: `${p.atletas} atleta(s) inscritos nela`,
        })),
        explica: `Cada uma sai nos arquivos <b>em vermelho</b>, com o aviso
          <i>"esta prova não consta no programa oficial"</i> ao lado do título, e
          os atletas dela ocupam raias normalmente. A numeração delas vem depois
          da última prova do programa.`,
        resolver: () => resolverProvasFora(provasFora),
      },
      {
        id: "categorias", titulo: "Atleta em mais de uma categoria",
        nivel: "critico", itens: estado.categorias.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.categorias.join(" e ") + ": " + a.provas.join(" · "),
        })),
        explica: `Categoria é idade: ninguém é mirim e infantil na mesma
          competição. Quando o mesmo nome aparece nas duas, a inscrição foi
          digitada errada em uma delas.
          <br><br>Assim como está, o atleta sai <b>em vermelho no balizamento</b>,
          com o motivo embaixo do nome, e ocupa raia nas duas provas.`,
        resolver: () => escolherProvasDoAtleta(estado.categorias, null, true),
      },
      {
        id: "limites", titulo: "Atletas acima do limite de provas",
        nivel: "critico", itens: estado.limites.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: `${a.quantidade} provas, o limite é ${a.limite}: ` +
                   a.provas.join(", "),
        })),
        explica: `O atleta sai <b>em vermelho no balizamento</b>, com o motivo
          embaixo do nome, e ocupa raia em todas as provas em que foi inscrito.
          O app não escolhe por você quais cortar.`,
        resolver: () => escolherProvasDoAtleta(estado.limites,
          estado.perfil.limiteInd, true),
      },
      {
        id: "duplicados", titulo: "Raias e duplicidades",
        nivel: "critico", itens: criticos,
        explica: `Atleta repetido na mesma prova, ou raia com mais de um
          nadador. O app ficou com a primeira inscrição e tirou a repetida das
          raias, então o balizamento já sai certo.
          <br><br>Confira se as duas linhas eram mesmo da mesma pessoa. Se eram
          duas pessoas de nome parecido, escreva o nome completo de cada uma na
          planilha e envie de novo.`,
        resolver: () => apenasTexto(`O balizamento já está montado sem o
          repetido. Se as duas linhas eram de pessoas diferentes, isso só se
          resolve na planilha, escrevendo o nome completo das duas. Marque como
          resolvido quando tiver conferido.`),
      },
      {
        id: "regulamento", titulo: "Inscrições contra o regulamento",
        nivel: "critico", itens: cortes.filter((c) => c.gravidade === "critico"),
        explica: `A classe funcional destes atletas não disputa esta prova, pelo
          mapa de provas paralímpico. Eles <b>não ocupam raia</b>: saem numa
          faixa vermelha "NÃO PARTICIPAM DESTA PROVA" abaixo da prova, com o
          motivo escrito.`,
        resolver: () => apenasTexto(`Se a classe está errada na planilha,
          corrija e envie de novo. Se está certa, a inscrição é que não podia
          ter sido feita, e o balizamento já está tratando disso: eles não
          entram nas raias.`),
      },
      {
        id: "semNome", titulo: "Linhas que ficaram de fora",
        nivel: "critico", itens: descartadas.map((d) => ({
          prova: "", titulo: d.prova, nome: "", equipe: d.equipe,
          detalhe: `linha ${d.linha} da planilha: ${d.motivo}`,
        })),
        explica: `Estas linhas têm a instituição e o tempo preenchidos, mas
          nenhum nome de atleta ao lado. Elas <b>não entraram no balizamento</b>:
          ninguém ocupa essa raia.`,
        resolver: () => escreverNomesFaltando(descartadas),
      },
      {
        id: "semLista", titulo: "Revezamentos ainda sem a lista de atletas",
        nivel: "info", itens: semLista,
        explica: `A equipe se inscreveu sem dizer quem nada. Isto <b>não é
          erro</b>: a raia fica reservada em nome da equipe e o balizamento sai
          com quatro linhas em branco, para anotar os nomes na borda da piscina
          no dia da prova.`,
        resolver: () => escreverNadadoresDoRevezamento(semLista),
      },
      {
        id: "semClasse", titulo: "Atletas sem classe definida",
        nivel: "info", itens: cortes.filter((c) => c.gravidade === "info"),
        explica: `A classe destes atletas veio em branco ou ilegível, então o
          app não tem como conferir se eles podem nadar a prova. Eles saem numa
          faixa azul abaixo da prova e <b>não ocupam raia</b>.`,
        resolver: () => apenasTexto(`Preencha a classe na planilha de inscritos
          e envie de novo. Sem a classe o app não tem como saber se a inscrição
          é válida, e prefere não colocar o atleta numa raia por engano.`),
      },
      {
        id: "provasVazias", titulo: "Provas do programa sem ninguém inscrito",
        nivel: "info", itens: semInscritos.map((p) => ({
          prova: p.numero, titulo: p.titulo, nome: "", equipe: "",
          detalhe: "nenhuma inscrição chegou para esta prova",
        })),
        explica: `A prova está no programa e sai no balizamento com a marca
          <i>"Sem inscritos"</i>, mantendo o número dela. Isso é de propósito:
          tirar a prova mudaria a numeração de todas as seguintes, e o programa
          impresso já está na mão de todo mundo.`,
        resolver: () => apenasTexto(`Não há o que resolver: a prova fica no
          balizamento com o número dela e a marca de vazia, que é o certo para
          quem está com o programa impresso na mão.`),
      },
      {
        id: "juntar", titulo: "Provas pequenas que dá para juntar",
        nivel: "info", itens: juntaveis.map((j) => ({
          prova: j.a.numero, titulo: j.a.titulo, nome: "", equipe: "",
          detalhe: `${j.nA} inscritos; a ${j.b.numero}ª prova ` +
                   `(${j.b.categoria}) tem ${j.nB}, mesmo estilo e mesmo naipe`,
        })),
        explica: `Duas provas do mesmo estilo e do mesmo naipe, em categorias
          seguidas, ambas com gente de menos para encher uma série. Juntar as
          duas dá uma série cheia em vez de duas quase vazias.
          <br><br>Só faz sentido entre categorias vizinhas e do mesmo naipe:
          feminino não nada com masculino.`,
        resolver: () => juntarCategorias(juntaveis),
      },
      {
        id: "raias", titulo: "Avisos de organização das raias",
        nivel: "info", itens: avisos,
        explica: `Séries com menos gente que o mínimo dentro de uma prova
          grande, ou raias fora do padrão de preenchimento. O balizamento sai
          assim mesmo: é só para você conferir.`,
        resolver: () => apenasTexto(`Não há o que corrigir na planilha: é como a
          divisão em séries ficou. Marque como resolvido quando tiver
          conferido.`),
      },
    ];
  }

  /* Provas pequenas do mesmo estilo e naipe, em categorias vizinhas: as
     únicas que dá para juntar de verdade. Sem isso o aviso de série curta
     aparecia para provas de naipes diferentes, onde não há o que fazer. */
  function provasQueDaParaJuntar() {
    const minimo = B.minimoPorSerie(estado.perfil.raias || 6);
    const grupos = new Map();
    for (const p of estado.provas) {
      const total = p.series.reduce((t, s) => t + s.linhas.length, 0);
      if (!total || total >= minimo || p.revezamento) continue;
      const k = [p.distancia, p.estilo, p.naipe].join("|");
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push({ prova: p, total });
    }
    const pares = [];
    for (const [, lista] of grupos) {
      for (let i = 0; i + 1 < lista.length; i++) {
        pares.push({
          a: lista[i].prova, nA: lista[i].total,
          b: lista[i + 1].prova, nB: lista[i + 1].total,
        });
      }
    }
    return pares;
  }

  function renderConferencia() {
    if (!estado.provas.length) montar();
    const secoes = montarSecoes();
    const comItens = secoes.filter((s) => s.itens.length);
    comItens.forEach((s) => estado.ajustes.jaVistos.add(s.id));

    const resolvidas = secoes.filter((s) =>
      estado.ajustes.jaVistos.has(s.id) && !s.itens.length);
    const pendentesCriticas = comItens.filter((s) =>
      s.nivel === "critico" && !estado.ajustes.aceitos.has(s.id));

    const totCrit = comItens.filter((s) => s.nivel === "critico")
                            .reduce((t, s) => t + s.itens.length, 0);
    const totInfo = comItens.filter((s) => s.nivel === "info")
                            .reduce((t, s) => t + s.itens.length, 0);

    $("#painelConferencia").innerHTML = `
      <div class="fichas">
        <div class="ficha ${pendentesCriticas.length ? "ruim" : "bom"}">
          <b>${pendentesCriticas.length}</b>
          <span>${pendentesCriticas.length === 1
            ? "problema à espera de você" : "problemas à espera de você"}</span></div>
        <div class="ficha"><b>${totCrit}</b><span>casos em vermelho</span></div>
        <div class="ficha"><b>${totInfo}</b><span>avisos, sem impedimento</span></div>
        <div class="ficha"><b>${estado.provas.length}</b><span>provas montadas</span></div>
      </div>
      ${pendentesCriticas.length ? `<p class="nota">Resolva os blocos vermelhos
        para liberar a geração dos arquivos. Em cada um, <b>resolver</b> abre o
        conserto e <b>o que acontece</b> explica o que aquele caso vira nos
        arquivos. Quando não houver conserto possível, o próprio bloco oferece
        seguir assim mesmo.</p>` : ""}
      ${resolvidas.map(secaoResolvidaHtml).join("")}
      ${comItens.map(secaoHtml).join("")}
      ${!comItens.length && !resolvidas.length
        ? '<p class="ok-vazio">Nenhum problema encontrado. O balizamento está pronto para gerar.</p>'
        : ""}`;

    ligarSecoes(comItens);
    const botao = $("#irGerar");
    if (botao) {
      botao.disabled = pendentesCriticas.length > 0;
      botao.textContent = pendentesCriticas.length
        ? `Faltam ${pendentesCriticas.length} bloco(s) vermelho(s)`
        : "Gerar os arquivos";
    }
    liberar("gerar", !pendentesCriticas.length);
  }

  function secaoResolvidaHtml(s) {
    const aceito = estado.ajustes.aceitos.has(s.id);
    return `<section class="bloco resolvido">
      <h3>${s.titulo} <span class="contador">${aceito ? "seguindo assim" : "resolvido"}</span></h3>
    </section>`;
  }

  function secaoHtml(s) {
    const aceito = estado.ajustes.aceitos.has(s.id);
    return `<section class="bloco ${aceito ? "aceito" : s.nivel}" data-secao="${s.id}">
      <h3>${s.titulo} <span class="contador">${s.itens.length}</span>
        ${aceito ? '<span class="selo-aceito">você decidiu seguir assim</span>' : ""}
        <span class="botoes-bloco">
          <button type="button" class="resolver" data-resolver="${s.id}">resolver</button>
          <button type="button" class="info" data-info="${s.id}">o que acontece</button>
        </span></h3>
      <div class="explicacao" id="explica-${s.id}" hidden><p>${s.explica}</p></div>
      <div class="explicacao correcao" id="corrige-${s.id}" hidden></div>
      <table class="tabela"><thead><tr><th>PROVA</th><th>ATLETA</th>
      <th>EQUIPE</th><th>DETALHE</th></tr></thead><tbody>${
      s.itens.map((e) => `<tr>
        <td>${e.prova ? e.prova + "ª " + (e.titulo || "") : (e.titulo || "")}</td>
        <td>${CX(e.nome || "")}</td>
        <td class="apagado">${CX(e.equipe || "")}</td>
        <td>${e.detalhe || ""}</td></tr>`).join("")}</tbody></table></section>`;
  }

  function ligarSecoes(secoes) {
    for (const s of secoes) {
      const bInfo = $(`[data-info="${s.id}"]`);
      const pInfo = $("#explica-" + s.id);
      if (bInfo && pInfo) {
        bInfo.onclick = () => {
          pInfo.hidden = !pInfo.hidden;
          bInfo.textContent = pInfo.hidden ? "o que acontece" : "fechar";
        };
      }
      const bFix = $(`[data-resolver="${s.id}"]`);
      const pFix = $("#corrige-" + s.id);
      if (!bFix || !pFix) continue;
      bFix.onclick = () => {
        const abrindo = pFix.hidden;
        pFix.hidden = !abrindo;
        bFix.textContent = abrindo ? "fechar" : "resolver";
        if (!abrindo) return;
        pFix.innerHTML = "";
        if (typeof s.resolver === "function") pFix.appendChild(s.resolver());
        pFix.appendChild(botaoSeguirAssim(s));
      };
    }
  }

  function apenasTexto(html) {
    const p = document.createElement("p");
    p.innerHTML = html;
    return p;
  }

  /* Todo bloco pode ser encerrado por decisão do árbitro. É o que destranca a
     geração quando o problema não tem conserto dentro do app. */
  function botaoSeguirAssim(s) {
    const acoes = document.createElement("div");
    acoes.className = "acoes";
    const aceito = estado.ajustes.aceitos.has(s.id);
    acoes.innerHTML = `<button type="button" class="${aceito ? "mini claro" : "botao claro"}">
      ${aceito ? "voltar a marcar como pendente" : "li e vou seguir assim mesmo"}</button>`;
    $("button", acoes).onclick = () => {
      if (aceito) estado.ajustes.aceitos.delete(s.id);
      else estado.ajustes.aceitos.add(s.id);
      renderConferencia();
      aviso(aceito ? "Bloco voltou para pendente."
                   : "Anotado. Este bloco não trava mais a geração.");
    };
    return acoes;
  }

  /* --- resolver: tirar do balizamento a prova que não está no programa --- */
  function resolverProvasFora(provasFora) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    for (const p of provasFora) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${p.numero}ª ${p.titulo}</b>
          <span class="apagado">${p.atletas} atleta(s)</span></p>
        <p class="nota">Ela não está no programa. Dá para tirar do balizamento e
          das papeletas, ou deixar como está, em vermelho, e acertar o programa
          depois.</p>`;
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao">
        Tirar esta prova do balizamento</button>`;
      $("button", acoes).onclick = () => {
        for (const s of p.series) {
          for (const l of s.linhas) estado.ajustes.removidas.add(chaveDaLinha(l.item));
        }
        for (const c of (p.cortados || [])) {
          estado.ajustes.removidas.add(chaveDaLinha(c));
        }
        montar();
        renderConferencia();
        aviso(`${p.titulo} saiu do balizamento e das papeletas.`);
      };
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

  /* --- resolver: escolher as provas que o atleta fica ---
     As caixas nascem vazias de propósito: quem escolhe é o árbitro, e uma
     caixa já marcada é uma escolha que ninguém conferiu. Marcar a primeira
     fecha a categoria, porque ninguém nada mirim e infantil na mesma
     competição. --- */
  function escolherProvasDoAtleta(achados, limite, exigirMesmaCategoria) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    if (!achados.length) return caixa;

    for (const a of achados) {
      const chave = B.normalizar(a.nome) + "|" + B.normalizar(a.equipe);
      const minhas = estado.inscricoes.filter((i) =>
        !i.revezamento &&
        B.normalizar(i.nome) + "|" + B.normalizar(i.equipe) === chave);
      if (!minhas.length) continue;

      const teto = limite || minhas.length;
      const escolhidas = new Set();
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(a.nome)}</b>
          <span class="apagado">${CX(a.equipe)}</span></p>
        <p class="nota">Marque as provas que ele vai nadar de verdade:
          até <b>${teto}</b>${exigirMesmaCategoria
            ? ", todas da <b>mesma categoria</b>" : ""}.</p>
        <div class="provas-do-atleta"></div>
        <p class="nota contagem"></p>`;
      const lista = $(".provas-do-atleta", bloco);

      const rotulos = minhas.map((i) => {
        const rot = document.createElement("label");
        rot.className = "marcavel";
        rot.innerHTML = `<input type="checkbox">
          <span><b>${CX(i.categoria || "")}</b>
          ${CX(D.tituloProva(i.distancia, i.estilo, "", i.naipe))}
          <span class="apagado">linha ${i.linha}</span></span>`;
        lista.appendChild(rot);
        return rot;
      });

      const atualizar = () => {
        const catEscolhida = escolhidas.size
          ? D.chaveCategoria([...escolhidas][0].categoria) : null;
        minhas.forEach((i, k) => {
          const cx = $("input", rotulos[k]);
          const marcada = escolhidas.has(i);
          const outraCategoria = exigirMesmaCategoria && catEscolhida &&
            D.chaveCategoria(i.categoria) !== catEscolhida;
          const cheio = escolhidas.size >= teto;
          cx.checked = marcada;
          cx.disabled = !marcada && (outraCategoria || cheio);
          rotulos[k].classList.toggle("bloqueada", cx.disabled);
          rotulos[k].title = cx.disabled
            ? (outraCategoria ? "outra categoria: escolha uma só"
                              : `já marcou ${teto} provas`) : "";
        });
        const alvo = $(".contagem", bloco);
        alvo.textContent = escolhidas.size
          ? `${escolhidas.size} de ${teto} marcadas` +
            (catEscolhida ? `, categoria ${CX([...escolhidas][0].categoria)}` : "")
          : "nenhuma marcada ainda";
        alvo.classList.toggle("alerta-inline", !escolhidas.size);
      };

      minhas.forEach((i, k) => {
        $("input", rotulos[k]).onchange = (ev) => {
          if (ev.target.checked) escolhidas.add(i);
          else escolhidas.delete(i);
          atualizar();
        };
      });
      atualizar();

      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao">
        Aplicar: ficar só com as marcadas</button>`;
      $("button", acoes).onclick = () => {
        if (!escolhidas.size) {
          aviso("Marque pelo menos uma prova antes de aplicar.");
          return;
        }
        minhas.forEach((i) => {
          const k = chaveDaLinha(i);
          if (escolhidas.has(i)) estado.ajustes.removidas.delete(k);
          else estado.ajustes.removidas.add(k);
        });
        montar();
        renderConferencia();
        aviso(`${CX(a.nome)} ficou com ${escolhidas.size} prova(s).`);
      };
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

  /* --- resolver: digitar o nome que faltou na linha --- */
  function escreverNomesFaltando(descartadas) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    const campos = [];

    for (const d of descartadas) {
      const k = chaveDaLinha(d);
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${d.prova}</b>
          <span class="apagado">linha ${d.linha} · ${CX(d.equipe)}</span></p>
        <label class="campo largo">Nome do atleta que faltou
          <input placeholder="digite o nome completo">
        </label>`;
      const campo = $("input", bloco);
      campo.value = (estado.ajustes.nomes || {})[k] || "";
      campos.push([k, campo]);
      caixa.appendChild(bloco);
    }

    const acoes = document.createElement("div");
    acoes.className = "acoes";
    acoes.innerHTML = `<button type="button" class="botao">
      Aplicar e colocar na raia</button>`;
    $("button", acoes).onclick = () => {
      let quantos = 0;
      for (const [k, campo] of campos) {
        const nome = campo.value.trim();
        if (nome) { estado.ajustes.nomes[k] = nome; quantos++; }
        else delete estado.ajustes.nomes[k];
      }
      montar();
      renderConferencia();
      aviso(quantos ? `${quantos} atleta(s) entraram no balizamento.`
                    : "Nenhum nome foi digitado.");
    };
    caixa.appendChild(acoes);
    return caixa;
  }

  /* --- resolver: escrever os 4 nadadores de um revezamento --- */
  function escreverNadadoresDoRevezamento(semLista) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    const campos = [];

    for (const r of semLista) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(r.equipe)}</b>
          <span class="apagado">${r.prova}ª ${r.titulo}</span></p>
        <label class="campo largo">Os quatro nadadores, um por linha
          <textarea rows="4" spellcheck="false"
            placeholder="deixe em branco para anotar no dia da prova"></textarea>
        </label>`;
      const campo = $("textarea", bloco);
      campo.value = (r.item.atletas || []).join("\n");
      campos.push([r.item, campo]);
      caixa.appendChild(bloco);
    }

    const acoes = document.createElement("div");
    acoes.className = "acoes";
    acoes.innerHTML = `<button type="button" class="botao">
      Aplicar os nomes</button>`;
    $("button", acoes).onclick = () => {
      let quantos = 0;
      for (const [item, campo] of campos) {
        const nomes = campo.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (!nomes.length) continue;
        // mexe na inscrição original, para o ajuste sobreviver a um remontar
        const alvo = estado.inscricoes.find((i) => chaveDaLinha(i) === chaveDaLinha(item));
        if (alvo) { alvo.atletas = nomes; alvo.semLista = false; quantos++; }
      }
      montar();
      renderConferencia();
      aviso(quantos ? `${quantos} revezamento(s) com a lista completa.`
                    : "Nenhum nome foi digitado; segue para anotar no dia.");
    };
    caixa.appendChild(acoes);
    return caixa;
  }

  /* --- resolver: juntar duas categorias vizinhas numa prova só --- */
  function juntarCategorias(pares) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    for (const j of pares) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      const rotulo = `${j.a.categoria} + ${j.b.categoria}`;
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${j.a.distancia} ${j.a.estilo}
          ${NAIPE_LONGO[j.a.naipe] || j.a.naipe}</b></p>
        <p class="nota">${j.a.categoria} tem ${j.nA} e ${j.b.categoria} tem
          ${j.nB}. Juntas dão ${j.nA + j.nB} numa série só, com o nome
          <b>${rotulo}</b>.</p>`;
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao">
        Juntar estas duas categorias</button>`;
      $("button", acoes).onclick = () => {
        estado.perfil.grupos.push({
          rotulo, categorias: [j.a.categoria, j.b.categoria],
          distancias: [j.a.distancia], estilos: [j.a.estilo],
        });
        renderGrupos();
        montar();
        renderConferencia();
        aviso(`${rotulo} agora nadam juntos. Dá para desfazer na tela da competição.`);
      };
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }


  /* ---------------- tela 5: gerar ---------------- */
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
  // liga um manipulador sem quebrar tudo se o elemento nao existir
  function html(id, conteudo) {
    const el = $("#" + id);
    if (el) el.innerHTML = conteudo;
    return !!el;
  }

  function ao(id, evento, fn) {
    const el = $("#" + id);
    if (el) el.addEventListener(evento, fn);
    else console.warn("elemento ausente: #" + id);
  }

  function ligar() {
    estado.perfil = perfilPadrao();
    $$("[data-atalho]").forEach((b) =>
      (b.onclick = () => aplicarAtalho(b.dataset.atalho)));
    $$(".passo").forEach((p) => (p.onclick = () => {
      if (!p.classList.contains("bloqueado")) irPara(p.dataset.passo);
    }));
    $("#raias").oninput = atualizarPreviaRaias;
    const mexeuNaData = () => {
      estado.perfil.datasDoPrograma = false;
      atualizarPreviaData();
    };
    ao("dataInicio", "change", mexeuNaData);
    ao("dataFim", "change", mexeuNaData);
    ["temPara", "tipoClasse", "temTempo", "temRevezamento", "mostrarCategoria"].forEach((id) => {
      const el = $("#" + id);
      el.addEventListener("change", atualizarDependentes);
    });
    preencherConfig();
    $("#addEtapa").onclick = () => {
      const etapas = estado.perfil.etapas;
      const anterior = etapas[etapas.length - 1];
      // o intervalo nasce em branco: número preenchido é número que ninguém
      // confere. Só a prova de partida é sugerida, seguindo a etapa anterior.
      etapas.push({
        nome: (etapas.length + 1) + "ª ETAPA", dia: "", periodo: "",
        de: anterior && anterior.ate ? anterior.ate + 1 : "", ate: "",
      });
      renderEtapas();
      validarConfig();
    };
    $("#addGrupo").onclick = () => {
      estado.perfil.grupos.push({ rotulo: "", categorias: [], distancias: [], estilos: [] });
      renderGrupos();
    };
    $("#irInscritos").onclick = () => {
      if (!validarConfig()) return;
      lerConfig(); renderEspecificacao();
      liberar("inscritos", true);
      irPara("inscritos");
    };
    ["nomeComp", "raias", "limiteInd", "limiteIndPara"]
      .forEach((id) => $("#" + id).addEventListener("input", validarConfig));
    // --- tela do programa de provas ---
    html("exemploPrograma", exemploProgramaVisual());
    renderExemplos();
    ao("btnModeloPrograma", "click", baixarModeloPrograma);
    ao("irCompeticao", "click", () => { lerConfig(); irPara("competicao"); });
    ao("semPrograma", "click", seguirSemPrograma);
    ao("btnTrocarPrograma", "click", () => irPara("programa"));
    const zonaP = $("#zonaPrograma");
    if (zonaP) {
      zonaP.onclick = () => $("#arquivoPrograma").click();
      zonaP.ondragover = (e) => { e.preventDefault(); zonaP.classList.add("sobre"); };
      zonaP.ondragleave = () => zonaP.classList.remove("sobre");
      zonaP.ondrop = (e) => {
        e.preventDefault(); zonaP.classList.remove("sobre");
        if (e.dataTransfer.files[0]) carregarPrograma(e.dataTransfer.files[0]);
      };
      $("#arquivoPrograma").onchange = (e) => {
        if (e.target.files[0]) carregarPrograma(e.target.files[0]);
      };
    }

    $("#btnModelo").onclick = () => baixarModelo();
    $("#btnEntendi").onclick = () => mostrarPainel("envio");
    $("#verFormato").onclick = () => mostrarPainel("formato");
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
        carregarProgramaDoPerfil(p);
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
        const p = lista[b.dataset.k];
        estado.perfil = Object.assign(perfilPadrao(), p);
        carregarProgramaDoPerfil(p);
        preencherConfig();
      };
    });
  }

  // um perfil guarda o programa junto: recuperá-lo destrava o passo seguinte
  function carregarProgramaDoPerfil(p) {
    const prog = programaDoPerfil(p);
    if (!prog) return;
    estado.programa = prog;
    estado.perfil.programa = prog.provas;
    liberarCompeticao(true);
    renderResultadoPrograma(prog);
  }

  function aviso(txt) {
    const el = $("#aviso");
    el.textContent = txt;
    el.classList.add("visivel");
    setTimeout(() => el.classList.remove("visivel"), 2600);
  }

  document.addEventListener("DOMContentLoaded", ligar);
})();
