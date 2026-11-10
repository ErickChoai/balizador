/* =====================================================================
   BALIZADOR, a conversa com o Claude

   Aberto no claude.ai, o Balizador é uma conversa. O Claude conduz o
   balizamento do começo ao fim: lê o programa de provas com a pessoa, propõe
   e preenche a competição, recebe os inscritos, explica a conferência e
   entrega os arquivos. Cada etapa aparece no fio como um cartão em que a
   pessoa age ali mesmo: arrasta a planilha, confere o formulário, vê as
   raias de cada prova, baixa o PDF.

   O que o Claude não faz: montar série e raia, decidir um bloco vermelho no
   lugar da pessoa, mandar planilha para a IA sem ela ver. Ele age chamando
   as funções de window.BalizadorApp, as mesmas dos botões dos cinco passos,
   e por isso o balizamento sai igual de um jeito ou de outro.

   A conversa abre numa tela com dois caminhos: a demonstração guiada ou as
   planilhas da pessoa. A tela completa dos cinco passos só aparece quando a
   conversa manda para lá (revisão, agrupamentos, prévia), com "Voltar à
   conversa" no topo. Fora do claude.ai não há Claude, e o app abre direto nos
   cinco passos.

   Nome de atleta nunca vai para o Claude: o resumo da tela que segue em
   cada mensagem troca nomes por PESSOA 1, PESSOA 2, e o nome volta só aqui.
   ===================================================================== */
(function () {
  "use strict";
  const B = window.Balizador, D = window.BalizadorDados;
  const E = window.BalizadorExemplos, IA = window.BalizadorIA;
  const app = () => window.BalizadorApp;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const AT = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const NAIPE = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" };

  const conv = {
    sample: null, ligada: false, ferramentas: false,
    turnos: [], controle: null, fila: [], pendentes: [],
    mascara: IA ? IA.novaMascara() : null, voc: null,
    esperando: "programa", exemplo: null, baixados: new Set(), numero: 0, comecou: false,
    // correções que a pessoa respondeu Não: não voltam a ser oferecidas
    recusadas: new Set(),
  };

  /* ---------------- o fio da conversa ----------------
     A tela não corre na frente de quem lê. O primeiro elemento que chega
     depois de um clique da pessoa é a âncora: a tela desce para mostrar o
     que vem, mas nunca a ponto de esconder o começo da âncora. Se a pessoa
     subiu para reler, a tela fica parada até o próximo clique. */
  let seguindo = true, rolandoAte = 0, ultimoY = 0, ancora = null;

  // um clique ou uma mensagem da pessoa: o que vier depois é a nova âncora
  function novaVez() { seguindo = true; ancora = null; }

  function aVista(el, pelaPonta) {
    const topo = ($(".topo") ? $(".topo").getBoundingClientRect().bottom : 0) + 12;
    const caixa = $("#compositor");
    const baixo = Math.min(window.innerHeight,
      caixa ? caixa.getBoundingClientRect().top : window.innerHeight) - 12;
    const r = el.getBoundingClientRect();
    let delta = r.bottom - baixo;
    // cartão: nunca esconder o começo dele; texto sendo escrito: seguir a ponta
    if (!pelaPonta && r.top - delta < topo) delta = r.top - topo;
    // e nunca passar do começo do que chegou depois do último clique
    if (ancora && ancora.isConnected) delta = Math.min(delta, ancora.getBoundingClientRect().top - topo);
    if (delta > 1) {
      rolandoAte = Date.now() + 800;
      window.scrollBy({ top: delta, behavior: pelaPonta ? "auto" : "smooth" });
    }
  }

  function rolar(el, pelaPonta) {
    const fio = $("#fio");
    if (!fio || !document.body.classList.contains("modo-conversa") || !seguindo) return;
    requestAnimationFrame(() => {
      const alvo = el || fio.lastElementChild;
      if (alvo) aVista(alvo, pelaPonta);
    });
  }

  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (Date.now() > rolandoAte) {
      if (y < ultimoY) seguindo = false;
      if (window.innerHeight + y >= document.documentElement.scrollHeight - 120) seguindo = true;
    }
    ultimoY = y;
  }, { passive: true });

  function adicionar(el) {
    $("#fio").appendChild(el);
    if (!ancora || !ancora.isConnected) ancora = el;
    rolar();
    return el;
  }

  function bolha(quem, html) {
    const div = document.createElement("div");
    div.className = "fala " + quem;
    div.innerHTML = (quem === "claude" ? '<span class="quem"><span class="selo-ia" aria-hidden="true">IA</span>' +
      '<b>Claude</b><em>inteligência artificial</em></span>' : "") +
      `<div class="texto">${html}</div>`;
    return adicionar(div);
  }

  function nota(texto) {
    const p = document.createElement("p");
    p.className = "nota-app";
    p.textContent = texto;
    return adicionar(p);
  }

  /* Um cartão é uma etapa em que a pessoa age dentro da conversa. Quando um
     cartão novo do mesmo tipo chega, o anterior fecha numa linha: a
     conversa guarda a história sem deixar dois formulários vivos. */
  function cartao(tipo, etapa, titulo, corpo, resumo, ligar) {
    for (const velho of $$(`.cartao-conversa[data-tipo="${tipo}"]:not(.antigo)`)) {
      velho.classList.add("antigo");
      velho.setAttribute("inert", "");
    }
    const el = document.createElement("section");
    el.className = "cartao-conversa";
    el.dataset.tipo = tipo;
    el.id = "cartao" + (++conv.numero);
    el.innerHTML = `
      <header><span class="etapa">${AT(etapa)}</span><h3>${titulo}</h3></header>
      <p class="resumo">${AT(resumo || titulo)}</p>
      <div class="corpo">${corpo}</div>`;
    adicionar(el);
    if (ligar) ligar(el);
    return el;
  }

  // pergunta respondida fecha numa linha, sem deixar botão velho ativo
  function fechar(tipo) {
    for (const el of $$(`.cartao-conversa[data-tipo="${tipo}"]:not(.antigo)`)) {
      el.classList.add("antigo");
      el.setAttribute("inert", "");
    }
  }

  // a resposta do Claude em HTML simples: parágrafos, listas, negrito
  function formatar(t) {
    const limpo = IA.desmascarar(String(t || ""), conv.mascara)
      // chamada de ferramenta escrita como texto não é para a pessoa ver
      .replace(/<(tool_call|tool_use|function_calls|function_call|invoke)\b[\s\S]*?(<\/\1>|$)/g, "")
      .replace(/```(json)?\s*\{\s*"name"[\s\S]*?(```|$)/g, "")
      .replace(/\s*—\s*/g, ", ").trim();
    const linhas = AT(limpo).split(/\r?\n/);
    const enfeita = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/^#{1,4}\s+(.*)$/, "<b>$1</b>");
    let saida = "", lista = "";
    const fecha = () => { if (lista) { saida += `</${lista}>`; lista = ""; } };
    for (const l of linhas) {
      const ul = l.match(/^\s*[-*•]\s+(.*)$/), ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
      const tipo = ul ? "ul" : ol ? "ol" : "";
      if (tipo) {
        if (lista !== tipo) { fecha(); saida += `<${tipo}>`; lista = tipo; }
        saida += `<li>${enfeita((ul || ol)[1])}</li>`;
        continue;
      }
      fecha();
      if (l.trim()) saida += `<p>${enfeita(l)}</p>`;
    }
    fecha();
    return saida;
  }

  /* ---------------- a trilha das cinco etapas ---------------- */
  const ETAPAS = [["programa", "Programa"], ["competicao", "Competição"],
    ["inscritos", "Inscritos"], ["conferencia", "Conferência"], ["arquivos", "Arquivos"]];

  function passoLivre(p) {
    const el = $(`.passo[data-passo="${p}"]`);
    return !!el && !el.classList.contains("bloqueado");
  }

  function situacaoDasEtapas() {
    const e = app().estado;
    const feito = {
      programa: passoLivre("competicao"),
      competicao: passoLivre("inscritos"),
      inscritos: e.inscricoes.length > 0,
      conferencia: e.inscricoes.length > 0 && app().geracaoLiberada(),
      arquivos: conv.baixados.size > 0,
    };
    const atual = (ETAPAS.find(([k]) => !feito[k]) || ["arquivos"])[0];
    return { feito, atual };
  }

  function renderTrilha() {
    const alvo = $("#trilha");
    if (!alvo) return;
    const { feito, atual } = situacaoDasEtapas();
    alvo.innerHTML = ETAPAS.map(([k, rot], i) => `
      <button type="button" class="degrau ${feito[k] ? "feito" : ""} ${k === atual ? "atual" : ""}"
        data-degrau="${k}" ${feito[k] || k === atual ? "" : "disabled"}>
        <span class="bolinha">${feito[k] ? "✓" : i + 1}</span><span>${rot}</span></button>`).join("");
    $$("[data-degrau]", alvo).forEach((b) => (b.onclick = () => mostrarEtapa(b.dataset.degrau)));
  }

  // clicar numa etapa da trilha traz de volta o cartão dela
  function mostrarEtapa(k) {
    const e = app().estado;
    if (k === "programa") return e.programa ? cartaoPrograma() : cartaoArquivo("programa");
    if (k === "competicao") return cartaoCompeticao();
    if (k === "inscritos") return e.inscricoes.length || e.recusa ? cartaoInscritos() : cartaoArquivo("inscritos");
    if (k === "conferencia") return cartaoConferencia();
    return cartaoArquivos();
  }

  /* ---------------- os cartões ---------------- */
  function ligarAcoes(el) {
    $$("[data-acao]", el).forEach((b) => (b.onclick = () => acao(b.dataset.acao, b)));
  }

  /* ---------------- a abertura ----------------
     A primeira tela: o que é o Balizador e dois caminhos, a demonstração ou
     as planilhas da pessoa. "Início", no topo, volta para cá a qualquer
     momento. Começar de novo recarrega a página e lembra o caminho escolhido. */
  const CHAVE_COMECAR = "balizador.comecar";

  // o nadador de crawl, usado na abertura e enquanto o Claude pensa
  const NADADOR = `<svg class="nadador-svg" viewBox="0 0 48 20" aria-hidden="true">
    <path class="esteira" d="M1 13c3-2 5-2 8 0s5 2 8 0"/>
    <path class="corpo" d="M10 12.5C19 11 27 11 33 12"/>
    <path class="braco" d="M30 11.5c2-6 7-8 12-6"/>
    <circle class="touca" cx="36" cy="11.5" r="4.6"/></svg>`;

  function montarAbertura() {
    const alvo = $("#piscinaAbertura");
    if (!alvo || alvo.childElementCount) return;
    alvo.innerHTML = ETAPAS.map(([, rot], k) => `
      <div class="faixa" style="--k:${k}"><span class="rotulo"><b>${k + 1}</b>${rot}</span>
        <span class="nada">${NADADOR}</span><span class="chegada">✓</span></div>`).join("");
  }

  function mostrarAbertura() {
    montarAbertura();
    document.body.classList.add("na-abertura");
    $("#recomecar").hidden = true;
    $("#continuarConversa").hidden = !conv.comecou;
    window.scrollTo(0, 0);
  }

  function escolherCaminho(caminho) {
    if (conv.comecou) {
      // já tem coisa feita: começar de novo é recarregar, com a escolha guardada
      const box = $("#recomecar");
      box.hidden = false;
      $("#recomecarSim").onclick = () => {
        try { sessionStorage.setItem(CHAVE_COMECAR, caminho); } catch (e) { /* sem memória */ }
        window.location.reload();
      };
      $("#recomecarNao").onclick = () => (box.hidden = true);
      return;
    }
    comecar(caminho);
  }

  /* ---------------- a demonstração guiada ----------------
     Um campeonato inventado, com erros plantados de propósito, andando
     sozinho e parando só nos Sim e Não. O guia é texto do app, com visual
     próprio, e nunca aparece como fala do Claude. O Claude de verdade faz o
     trabalho de IA e comenta; se ele demorar ou falhar, entra a resposta de
     reserva preparada para estas planilhas, com aviso na tela. */
  const DEMO_FALA = { semFerramentas: true, limite: 30000, silencioso: true };
  const DEMO_PRAZO = 40000;
  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const TOTAL_DEMO = 5;

  function guia(n, titulo, texto) {
    const div = document.createElement("div");
    div.className = "guia";
    div.innerHTML = `<span class="guia-passo">Demonstração · passo ${n} de ${TOTAL_DEMO}</span>
      <b>${AT(titulo)}</b><p>${AT(texto)}</p>`;
    return adicionar(div);
  }

  // a planilha como ela chegou, numa folha branca, com os erros marcados
  function folha(d) {
    const ws = d.wb.Sheets[d.wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: true }).slice(0, 22);
    const ncol = Math.max(...linhas.map((l) => l.length));
    const erro = new Set(d.erros.map((e) => (e.linha - 1) + "," + e.coluna));
    const notas = d.erros.filter((e) => e.nota);
    const cols = Array.from({ length: ncol }, (_, c) => XLSX.utils.encode_col(c));
    const corpo = linhas.map((l, r) => `<tr style="--d:${Math.min(r, 18) * 0.05}s"><td class="lin">${r + 1}</td>${
      cols.map((_, c) => `<td class="${erro.has(r + "," + c) ? "erro" : ""}">${AT(l[c] == null ? "" : l[c])}</td>`).join("")}</tr>`).join("");
    const el = document.createElement("figure");
    el.className = "folha-conv";
    el.innerHTML = `<figcaption><span class="arquivo">${AT(d.nome)}</span>
        <span class="aba-nome">${AT(d.wb.SheetNames[0])}</span>
        ${d.wb.SheetNames.length > 1 ? `<span class="apagado">e mais ${d.wb.SheetNames.length - 1} aba(s)</span>` : ""}</figcaption>
      <div class="scroll-x"><table><thead><tr><th class="lin"></th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${corpo}</tbody></table></div>
      ${notas.length ? `<ol class="notas-folha">${notas.map((e) => `<li><b>linha ${e.linha}</b> ${AT(e.nota)}</li>`).join("")}</ol>` : ""}`;
    return adicionar(el);
  }

  async function iniciarDemo() {
    conv.demo = { passo: 1 };
    conv.exemplo = { comp: "ESCOLAR", inscritos: null };
    bolha("eu", formatar("Quero ver a demonstração."));
    guia(1, "O programa de provas",
      "Este é o programa de um campeonato escolar inventado. Duas linhas foram estragadas de propósito: " +
      "numa, o estilo foi escrito junto com a distância; na outra, sobrou um total no fim.");
    const d = E.demoPrograma();
    folha(d);
    await pausa(1600);
    const r = await app().carregarPrograma(arquivoDe(d.wb, d.nome));
    const sug = E.perfilSugerido("ESCOLAR");
    preencher({ nome: sug.nome, tem_tempo: sug.temTempo, tem_revezamento: sug.temRevezamento,
                tem_paradesporto: sug.temPara });
    renderTrilha();
    const ruins = (r && r.linhas || []).filter((l) => !l.ok);
    return contar(`Demonstração guiada, passo 1. O app leu ${r ? r.provas.length : 0} provas do programa e não entendeu ` +
      `${ruins.length} linhas: ${ruins.map((l) => `linha ${l.linha} "${l.texto}" (${l.motivo})`).join("; ")}. ` +
      "O pedido para corrigir, com Sim e Não, aparece logo abaixo da sua fala. Em no máximo duas frases curtas, aponte o que você viu nessas linhas e diga que pode corrigir.",
      cartaoPropostaPrograma);
  }

  function demoCompeticao() {
    conv.demo.passo = 2;
    renderTrilha();
    guia(2, "A competição",
      "Os valores vêm do programa e do que o organizador diz. Aqui: 6 raias e no máximo 2 provas " +
      "individuais por atleta. Confira e confirme.");
    preencher({ raias: 6, limite_individual: 2, local: "Piscina do exemplo" });
    cartaoCompeticao();
  }

  async function demoInscritos() {
    conv.demo.passo = 3;
    guia(3, "Os inscritos",
      "Cada escola mandou a ficha do jeito dela: uma aba por escola, prova marcada com X ou com o tempo, " +
      "total e assinatura no fim. O app não lê isso sozinho. E plantamos mais dois erros, marcados em vermelho.");
    const d = E.demoInscritos();
    folha(d);
    await pausa(1800);
    return receberArquivo(arquivoDe(d.wb, d.nome), "inscritos");
  }

  // quando não sobra correção para responder, a demonstração segue para o fim
  function demoTalvezFim() {
    if (!conv.demo || conv.demo.passo !== 4) return;
    const a = app();
    const resta = a.propostasDeCorrecao().filter((p) => !conv.recusadas.has(p.id)).length;
    if (resta || !a.geracaoLiberada()) return;
    conv.demo.passo = 5;
    setTimeout(demoFinal, 900);
  }

  function demoFinal() {
    const e = app().estado;
    guia(5, "Raias e arquivos",
      "Séries e raias saem pela regra da natação: do centro para fora, com o melhor tempo na raia central " +
      "da última série. A IA não decide nada aqui. Os arquivos estão prontos.");
    const comTempo = (p) => p.series.reduce((s, x) => s + x.linhas.filter((l) => l.item.tempo != null).length, 0);
    const prova = e.provas.filter((p) => p.series.length && !p.revezamento).sort((x, y) => comTempo(y) - comTempo(x))[0];
    return contar("Demonstração guiada, último passo: as raias de uma prova, os arquivos e o convite final aparecem logo abaixo da sua fala. " +
      "Em duas frases curtas, diga o que a IA fez e o que o app fez nesta demonstração.", () => {
    cartaoRaias(prova ? prova.numero : undefined);
    cartaoArquivos();
    cartao("fim-demo", "Fim", "Agora com as suas planilhas?", `
      <p>Foi isso: a IA corrigiu o programa e reescreveu as fichas das escolas, o app conferiu tudo
        pelas regras, e nada mudou sem o seu Sim. Com as suas planilhas o caminho é o mesmo.</p>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-recomecar="minhas">Começar com as minhas planilhas</button>
        <button type="button" class="mini claro" data-recomecar="demo">Ver a demonstração de novo</button>
      </div>`, "Fim da demonstração", (el) => {
      $$("[data-recomecar]", el).forEach((b) => (b.onclick = () => {
        try { sessionStorage.setItem(CHAVE_COMECAR, b.dataset.recomecar); } catch (err) { /* sem memória */ }
        window.location.reload();
      }));
    });
    });
  }

  /* O pedido à IA. Na demonstração, com prazo: passou de DEMO_PRAZO ou deu
     erro, entra a resposta de reserva, pelo mesmo validador, e o cartão avisa. */
  async function pedirIA(pedido, el) {
    const reserva = conv.demo ? E.reservaDaDemo(pedido, IA) : null;
    if (!reserva) return IA.chamar(conv.sample, pedido);
    const controle = new AbortController();
    let prazo = null;
    try {
      return await Promise.race([
        IA.chamar(conv.sample, Object.assign({}, pedido, { sinal: controle.signal })),
        new Promise((_, nao) => { prazo = setTimeout(() => nao(new Error("prazo")), DEMO_PRAZO); }),
      ]);
    } catch (err) {
      controle.abort();
      if (el) {
        const p = document.createElement("p");
        p.className = "aviso-reserva";
        p.textContent = (err && err.message === "prazo"
          ? "O Claude não respondeu em 40 segundos." : "O Claude não respondeu desta vez.") +
          " Entrou a resposta de reserva, preparada para esta demonstração e conferida pelo mesmo validador.";
        $(".corpo", el).appendChild(p);
      }
      return IA.conferirResposta(reserva, pedido.esquema);
    } finally {
      clearTimeout(prazo);
    }
  }

  function comecar(caminho) {
    conv.comecou = true;
    document.body.classList.remove("na-abertura");
    novaVez();
    renderTrilha();
    if (caminho === "demo") return iniciarDemo();
    bolha("eu", formatar("Quero balizar com as minhas planilhas."));
    return contar("A pessoa escolheu começar com as próprias planilhas. O cartão para enviar o programa de provas aparece logo abaixo da sua fala. Dê boas-vindas em uma frase curta.",
      () => cartaoArquivo("programa"));
  }

  function cartaoArquivo(tipo) {
    conv.esperando = tipo;
    const programa = tipo === "programa";
    const id = "anexo" + (conv.numero + 1);
    return cartao("arquivo-" + tipo, programa ? "Programa" : "Inscritos",
      programa ? "Qual é o programa de provas?" : "Quem está inscrito?", `
      <label class="zona-conversa" for="${id}">
        <input type="file" id="${id}" accept=".xlsx,.xlsm,.csv" hidden>
        <b>Arraste a planilha aqui</b>
        <span>ou clique para escolher: .xlsx, .xlsm ou .csv</span>
      </label>
      <p class="nota">${programa
        ? "Uma linha por prova, na ordem oficial, com distância, estilo, categoria e naipe. É ela que dá a numeração das provas."
        : "O nome da prova numa linha e os atletas embaixo. Se a planilha vier de outro jeito, eu organizo com IA."}</p>
      <div class="acoes-cartao">
        ${conv.exemplo ? `<button type="button" class="botao" data-acao="exemplo_${tipo}">
          Usar a do exemplo</button>` : ""}
        <button type="button" class="mini claro" data-acao="modelo_${tipo}">Baixar a planilha modelo</button>
        ${programa ? `<button type="button" class="link" data-acao="sem_programa">não tenho o programa</button>` : ""}
      </div>`, programa ? "Pedido do programa" : "Pedido dos inscritos", (el) => {
      ligarAcoes(el);
      const zona = $(".zona-conversa", el), input = $("input[type=file]", el);
      input.onchange = () => { if (input.files[0]) receberArquivo(input.files[0], tipo); };
      zona.ondragover = (ev) => { ev.preventDefault(); zona.classList.add("sobre"); };
      zona.ondragleave = () => zona.classList.remove("sobre");
      zona.ondrop = (ev) => {
        ev.preventDefault(); ev.stopPropagation(); zona.classList.remove("sobre");
        if (ev.dataTransfer.files[0]) receberArquivo(ev.dataTransfer.files[0], tipo);
      };
    });
  }

  function cartaoPrograma() {
    const e = app().estado;
    const r = e.programa;
    if (!r) return cartaoArquivo("programa");
    const ruins = (r.linhas || []).filter((l) => !l.ok);
    const etapas = e.perfil.etapas || [];
    const revez = r.provas.filter((p) => /^\d+X/.test(p.distancia)).length;
    const juncoes = app().juncoesDoPrograma(r.provas);
    const juntar = e.perfil.juntarPrograma !== false;
    const linha = (p, i) => `<li><span class="num">${i + 1}ª</span>
      ${AT(D.tituloProva(p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe))}
      ${p.etapa ? `<span class="apagado">${AT(p.etapa)}</span>` : ""}</li>`;
    return cartao("programa", "Programa",
      ruins.length && !r.ok ? `Li ${r.provas.length} provas, mas ${ruins.length} linha(s) eu não entendi`
                            : `Li ${r.provas.length} provas no programa`, `
      <div class="numeros">
        <div><b>${r.provas.length}</b><span>provas</span></div>
        <div><b>${etapas.length}</b><span>etapas</span></div>
        <div><b>${revez}</b><span>revezamentos</span></div>
      </div>
      ${ruins.length && !r.ok ? `<div class="alerta-conv">
        <p><b>${ruins.length === 1 ? "1 linha que o app não entendeu" : `${ruins.length} linhas que o app não entendeu`}</b></p>
        <ul>${ruins.slice(0, 5).map((l) => `<li>linha ${l.linha}: <code>${AT(l.texto)}</code></li>`).join("")}</ul>
        <div class="acoes-cartao">
          ${conv.sample ? `<button type="button" class="botao" data-acao="corrigir_programa">
            Corrigir estas linhas com IA</button>` : ""}
          <button type="button" class="mini claro" data-acao="ignorar_linhas">
            Não são provas: ignorar e seguir</button>
          <button type="button" class="mini claro" data-acao="enviar_programa">Enviar outra planilha</button>
        </div></div>` : ""}
      <ol class="lista-provas">${r.provas.slice(0, 6).map(linha).join("")}</ol>
      ${r.provas.length > 6 ? `<details class="mais"><summary>ver as ${r.provas.length} provas</summary>
        <ol class="lista-provas">${r.provas.slice(6).map((p, i) => linha(p, i + 6)).join("")}</ol></details>` : ""}
      ${juncoes.length ? `<div class="pergunta-conv">
        <p><b>O programa junta categorias</b> em ${juncoes.map((j) => AT(j.categoria)).join(", ")}.
          Jogo os inscritos de cada uma direto na prova certa?</p>
        <div class="acoes-cartao">
          <button type="button" class="${juntar ? "botao" : "mini claro"}" data-acao="juntar_sim">Pode juntar</button>
          <button type="button" class="${juntar ? "mini claro" : "botao"}" data-acao="juntar_nao">Prefiro conferir uma por uma</button>
        </div></div>` : ""}
      ${r.ok || !ruins.length ? `<div class="acoes-cartao">
        <button type="button" class="botao" data-acao="programa_ok">Está certo, seguir para a competição</button>
        ${(r.linhas || []).some((l) => l.corrigida) ? `<button type="button" class="mini claro"
          data-acao="baixar_programa">Baixar o programa no modelo do app</button>` : ""}
      </div>` : ""}`, `Programa: ${r.provas.length} provas`, ligarAcoes);
  }

  /* O formulário da competição escreve nos mesmos campos da tela completa:
     o que se preenche aqui vale lá, e o que o Claude preenche aparece aqui. */
  const CAMPOS = [
    ["nomeComp", "Nome da competição", "text", "largo"],
    ["local", "Onde vai ser", "text", "largo"],
    ["dataInicio", "Começa em", "date"],
    ["dataFim", "Termina em", "date"],
    ["raias", "Quantas raias", "number"],
    ["limiteInd", "Provas individuais por atleta", "number"],
    ["limiteIndPara", "Individuais no paradesporto", "number", "", "temPara"],
    ["limiteEquipe", "Atletas de cada instituição na prova", "number"],
  ];
  const MARCAS = [["temTempo", "Tem tempo de inscrição"], ["temRevezamento", "Tem revezamento"],
                  ["temPara", "Tem paradesporto"]];

  function cartaoCompeticao(falta) {
    const e = app().estado;
    const val = (id) => ($("#" + id) ? $("#" + id).value : "");
    const mar = (id) => !!($("#" + id) && $("#" + id).checked);
    const temPara = mar("temPara");
    const etapas = e.perfil.etapas || [];
    const campo = ([id, rot, tipo, largo, depende]) => depende && !mar(depende) ? "" : `
      <label class="campo ${largo || ""}">${rot}
        <input data-espelho="${id}" type="${tipo}" value="${AT(val(id))}"
          ${tipo === "number" ? 'min="1" max="50"' : ""}></label>`;
    return cartao("competicao", "Competição", "Como é a competição?", `
      <div class="campos">${CAMPOS.map(campo).join("")}</div>
      <div class="marcas">${MARCAS.map(([id, rot]) => `
        <label class="marcavel"><input type="checkbox" data-espelho="${id}" ${mar(id) ? "checked" : ""}>
          <span>${rot}</span></label>`).join("")}
        ${temPara ? `<label class="campo">Como a classe vem escrita
          <select data-espelho="tipoClasse">
            <option value="FUNCIONAL" ${val("tipoClasse") === "FUNCIONAL" ? "selected" : ""}>Classe funcional: S6, SB5, SM6</option>
            <option value="CONDICAO" ${val("tipoClasse") === "CONDICAO" ? "selected" : ""}>Tipo de condição: TEA, DI, DA, DOWN</option>
          </select></label>` : ""}
      </div>
      <p class="nota">${etapas.length
        ? `${etapas.length} etapa(s): ${etapas.map((x) => `${AT(x.nome)}, provas ${x.de} a ${x.ate}`).join("; ")}.`
        : "O programa não trouxe etapas."}
        ${etapas.length ? "" : `<button type="button" class="link" data-acao="etapa_unica">uma etapa só, com todas as provas</button>`}
        <button type="button" class="link" data-acao="tela_competicao">etapas, agrupamentos e perfis na tela completa</button></p>
      ${falta && falta.length ? `<div class="alerta-conv"><p><b>Falta antes de seguir:</b></p>
        <ul>${falta.map((f) => `<li>${AT(f)}</li>`).join("")}</ul></div>` : ""}
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="competicao_ok">Confirmar a competição</button>
      </div>`, "Competição", (el) => {
      ligarAcoes(el);
      $$("[data-espelho]", el).forEach((inp) => {
        const evento = inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input";
        inp.addEventListener(evento, () => {
          const alvo = $("#" + inp.dataset.espelho);
          if (!alvo) return;
          if (inp.type === "checkbox") alvo.checked = inp.checked; else alvo.value = inp.value;
          alvo.dispatchEvent(new Event("input", { bubbles: true }));
          alvo.dispatchEvent(new Event("change", { bubbles: true }));
          if (inp.dataset.espelho === "dataInicio" || inp.dataset.espelho === "dataFim") {
            app().estado.perfil.datasDoPrograma = false;
            app().atualizarPreviaData();
          }
          // o paradesporto abre e fecha campos: o cartão se redesenha
          if (inp.dataset.espelho === "temPara") cartaoCompeticao();
        });
      });
    });
  }

  // depois que o Claude preenche, o cartão vivo mostra os valores novos
  function atualizarCartaoCompeticao() {
    const vivo = $('.cartao-conversa[data-tipo="competicao"]:not(.antigo)');
    if (!vivo) return;
    $$("[data-espelho]", vivo).forEach((inp) => {
      const alvo = $("#" + inp.dataset.espelho);
      if (!alvo) return;
      if (inp.type === "checkbox") inp.checked = alvo.checked; else inp.value = alvo.value;
    });
  }

  function cartaoInscritos() {
    const e = app().estado;
    if (!e.inscricoes.length && e.recusa) {
      const temIA = !!(conv.sample && e.ultimaRecusa);
      return cartao("inscritos", "Inscritos", "Esta planilha não está no formato do app", `
        <ul class="motivos-conv">${e.recusa.abas.slice(0, 6).map((a) =>
          `<li><b>${AT(a.aba)}</b>: ${AT(String(a.motivo).length > 90 ? String(a.motivo).slice(0, 88) + "…" : a.motivo)}</li>`).join("")}</ul>
        ${temIA ? `<div class="pergunta-conv destaque-ia">
          <div class="acoes-cartao">
            <button type="button" class="botao" data-acao="organizar_ia">Organizar com IA</button>
            <button type="button" class="mini claro" data-acao="enviar_inscritos">Enviar outra planilha</button>
          </div></div>` : `<div class="acoes-cartao">
            <button type="button" class="mini claro" data-acao="modelo_inscritos">Baixar a planilha modelo</button>
            <button type="button" class="mini claro" data-acao="enviar_inscritos">Enviar outra planilha</button></div>`}`,
        "Inscritos: planilha recusada", ligarAcoes);
    }
    const ins = e.inscricoes;
    const rev = ins.filter((i) => i.revezamento).length;
    const atletas = new Set(ins.filter((i) => !i.revezamento).map((i) => B.chaveAtleta(i))).size;
    const comTempo = ins.filter((i) => i.tempo != null).length;
    const viaIA = ins.filter((i) => i.viaIA).length;
    return cartao("inscritos", "Inscritos", `Recebi ${ins.length} inscrições`, `
      <div class="numeros">
        <div><b>${atletas}</b><span>atletas</span></div>
        <div><b>${ins.length - rev}</b><span>inscrições individuais</span></div>
        <div><b>${rev}</b><span>equipes de revezamento</span></div>
        <div><b>${comTempo}</b><span>com tempo</span></div>
      </div>
      ${viaIA ? `<p class="nota">${viaIA} delas foram organizadas pela IA e revisadas por você.</p>` : ""}
      ${e.recusa ? `<p class="nota">Ficaram de fora as abas ${e.recusa.abas.map((a) => AT(a.aba)).join(", ")}.
        ${conv.sample && e.ultimaRecusa ? `<button type="button" class="link" data-acao="organizar_ia">organizar estas com IA</button>` : ""}</p>` : ""}
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="ver_conferencia">Ver a conferência</button>
        <button type="button" class="mini claro" data-acao="enviar_inscritos">Trocar a planilha</button>
      </div>`, `Inscritos: ${ins.length}`, ligarAcoes);
  }

  const NIVEL = { critico: ["vermelho", "critico"], aviso: ["aviso", "aviso"], info: ["informativo", "info"] };
  const CHECAGENS = [["duplicados", "Atleta repetido na prova"], ["limites", "Limite de provas por atleta"],
    ["tempos", "Tempo impossível"], ["categorias", "Atleta em duas categorias"],
    ["naipes", "Feminino e masculino juntos"], ["foraPrograma", "Prova fora do programa"],
    ["regulamento", "Inscrição contra o regulamento"], ["idades", "Idade e categoria"]];

  function cartaoConferencia(noLugar) {
    const a = app(), e = a.estado;
    if (!e.inscricoes.length) return cartaoArquivo("inscritos");
    if (!e.provas.length) a.montar();
    a.renderConferencia();
    const props = a.propostasDeCorrecao().filter((p) => !conv.recusadas.has(p.id));
    const secoes = a.montarSecoes().filter((s) => s.itens.length);
    const aceito = (s) => e.ajustes.aceitos.has(s.id);
    const vermelhos = secoes.filter((s) => s.nivel === "critico" && !aceito(s));
    const ordem = secoes.slice().sort((x, y) =>
      (x.nivel === "critico" && !aceito(x) ? 0 : 1) - (y.nivel === "critico" && !aceito(y) ? 0 : 1));
    const bloco = (s) => {
      const [rot, cls] = NIVEL[s.nivel] || NIVEL.info;
      const decidido = aceito(s);
      return `<details class="bloco-conv ${decidido ? "aceito" : cls}">
        <summary><span class="selo ${decidido ? "aceito" : cls}">${decidido ? "seguindo assim" : rot}</span>
          <b>${AT(s.titulo)}</b><span class="contador">${s.itens.length}</span></summary>
        <div class="bloco-corpo">
          <div class="scroll-x"><table class="tabela"><tbody>${s.itens.slice(0, 8).map((it) => `<tr>
            <td>${it.prova ? it.prova + "ª " + AT(it.titulo || "") : AT(it.titulo || "")}</td>
            <td>${AT(it.nome || "")}</td><td class="apagado">${AT(it.equipe || "")}</td>
            <td>${it.detalhe || ""}</td></tr>`).join("")}</tbody></table></div>
          ${s.itens.length > 8 ? `<p class="nota">e mais ${s.itens.length - 8}.</p>` : ""}
          ${s.explica ? `<p class="explica">${s.explica}</p>` : ""}
          <div class="acoes-cartao" data-bloco="${AT(s.id)}" data-titulo="${AT(s.titulo)}">
            ${conv.sample ? `<button type="button" class="mini claro" data-acao="explicar_bloco">Me explique este caso</button>` : ""}
            <button type="button" class="mini claro" data-acao="resolver_bloco">Resolver na tela completa</button>
            ${s.nivel === "critico" && !decidido ? `<button type="button" class="link" data-acao="seguir_bloco">seguir assim mesmo</button>` : ""}
          </div>
        </div></details>`;
    };
    // o que o app sabe consertar sozinho, esperando o Sim da pessoa
    const correcoes = props.length ? `<div class="correcoes">
      <p class="correcoes-titulo"><b>Posso corrigir ${props.length === 1 ? "este caso" : `estes ${props.length} casos`} para você</b>
        <span class="apagado">nada muda sem o seu Sim</span></p>
      ${props.map((p, k) => `<div class="correcao" data-correcao="${AT(p.id)}" style="--d:${0.6 + k * 0.15}s">
        <span class="rot">CORREÇÃO PROPOSTA</span>
        <p class="caso">${AT(p.caso)}</p>
        <p class="pergunta"><b>${AT(p.pergunta)}</b></p>
        <div class="acoes-cartao">
          <button type="button" class="botao" data-acao="correcao_sim">Sim</button>
          <button type="button" class="mini claro" data-acao="correcao_nao">${p.escolha ? "Não, escolho eu" : "Não"}</button>
        </div></div>`).join("")}
      ${props.length > 1 ? `<div class="acoes-cartao"><button type="button" class="botao claro"
        data-acao="correcao_todas">Sim para todas as ${props.length}</button></div>` : ""}
    </div>` : "";
    const titulo = vermelhos.length ? `Tem ${vermelhos.length} problema(s) para você decidir`
                                    : "A conferência não achou nada que trave";
    const achou = new Set(secoes.filter((s) => !aceito(s)).map((s) => s.id));
    const checagens = `<ul class="checagens-conv ${noLugar ? "" : "entra"}">${CHECAGENS.map(([id, rot], k) =>
      `<li class="${achou.has(id) ? "achou" : ""}" style="--d:${k * 0.12}s">${rot}</li>`).join("")}</ul>`;
    const corpo = `
      ${checagens}
      <div class="numeros">
        <div class="${vermelhos.length ? "ruim" : "bom"}"><b>${vermelhos.length}</b><span>vermelhos para decidir</span></div>
        <div><b>${props.length}</b><span>correções prontas para o seu Sim</span></div>
        <div><b>${e.provas.length}</b><span>provas montadas</span></div>
      </div>
      ${correcoes}
      ${secoes.length ? `<div class="blocos-conv">${ordem.map(bloco).join("")}</div>`
                      : `<p class="ok-conv">Nenhum problema nas inscrições.</p>`}
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="ver_raias">Ver as raias</button>
        ${vermelhos.length ? "" : `<button type="button" class="botao claro" data-acao="ver_arquivos">Gerar os arquivos</button>`}
      </div>`;
    // depois de um Sim, o mesmo cartão se refaz no lugar
    const vivo = $('.cartao-conversa[data-tipo="conferencia"]:not(.antigo)');
    if (noLugar && vivo) {
      $("h3", vivo).textContent = titulo;
      $(".corpo", vivo).innerHTML = corpo;
      ligarAcoes(vivo);
      return vivo;
    }
    return cartao("conferencia", "Conferência", AT(titulo), corpo,
      `Conferência: ${vermelhos.length} vermelho(s)`, ligarAcoes);
  }

  // a prova como ela vai para a piscina: cada série uma linha, cada raia uma coluna
  function cartaoRaias(numero) {
    const e = app().estado;
    const comGente = e.provas.filter((p) => p.series.length);
    if (!comGente.length) return cartaoConferencia();
    const p = comGente.find((x) => x.numero === Number(numero)) || comGente[0];
    const pos = comGente.indexOf(p);
    const raias = p.nRaias || e.perfil.raias || 6;
    const cab = Array.from({ length: raias }, (_, k) => `<span class="nraia">${k + 1}</span>`).join("");
    const ordem = [];
    for (let a = Math.ceil(raias / 2), b = a + 1; ordem.length < raias;) {
      if (a >= 1) ordem.push(a--);
      if (b <= raias && ordem.length < raias) ordem.push(b++);
    }
    const series = p.series.map((s, si) => {
      const porRaia = new Map(s.linhas.map((l) => [l.raia, l.item]));
      const celulas = Array.from({ length: raias }, (_, k) => {
        const it = porRaia.get(k + 1);
        if (!it) return `<div class="raia vazia"></div>`;
        const nome = p.revezamento ? it.equipe : it.nome;
        const d = (si * raias + ordem.indexOf(k + 1)) * 0.09;
        return `<div class="raia ${it.marcado ? "marcada" : ""}" title="${AT(nome)}" style="--d:${Math.min(d, 4).toFixed(2)}s">
          <b>${AT(nome)}</b>
          ${p.revezamento ? "" : `<span>${AT(it.equipe || "")}</span>`}
          <em>${it.tempo != null ? B.formatarTempo(it.tempo) : "sem tempo"}</em></div>`;
      }).join("");
      return `<div class="serie"><span class="nserie">Série ${s.numero}</span>${celulas}</div>`;
    }).join("");
    return cartao("raias", "Balizamento", AT(`${p.numero}ª ${p.titulo}`), `
      <div class="navega-prova">
        <button type="button" class="mini claro" data-acao="prova_anterior" ${pos ? "" : "disabled"}>anterior</button>
        <select aria-label="Escolher a prova">${comGente.map((x) =>
          `<option value="${x.numero}" ${x === p ? "selected" : ""}>${x.numero}ª ${AT(x.titulo)}</option>`).join("")}</select>
        <button type="button" class="mini claro" data-acao="prova_seguinte" ${pos < comGente.length - 1 ? "" : "disabled"}>seguinte</button>
      </div>
      <div class="scroll-x"><div class="piscina" style="--raias:${raias}">
        <div class="serie cabeca"><span class="nserie">Raia</span>${cab}</div>${series}
      </div></div>
      <p class="nota">${p.series.length} série(s), ${p.total} ${p.revezamento ? "equipe(s)" : "atleta(s)"}.
        A ordem das raias vem do centro para fora, e o melhor tempo nada na raia central da última série.
        ${p.cortados.length ? ` ${p.cortados.length} inscrição(ões) cortada(s) pelo regulamento.` : ""}</p>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="ver_arquivos">Gerar os arquivos</button>
      </div>`, `Raias da ${p.numero}ª prova`, (el) => {
      ligarAcoes(el);
      $("select", el).onchange = (ev) => cartaoRaias(ev.target.value);
      el.dataset.prova = p.numero;
      el.dataset.anterior = pos ? comGente[pos - 1].numero : "";
      el.dataset.seguinte = pos < comGente.length - 1 ? comGente[pos + 1].numero : "";
    });
  }

  function cartaoArquivos() {
    const a = app();
    if (!a.estado.inscricoes.length) return cartaoArquivo("inscritos");
    a.renderConferencia();
    if (!a.geracaoLiberada()) {
      return cartao("arquivos", "Arquivos", "Ainda falta decidir a conferência", `
        <p>Enquanto houver bloco vermelho sem decisão, os arquivos ficam trancados:
          sairia um balizamento com erro conhecido.</p>
        <div class="acoes-cartao"><button type="button" class="botao" data-acao="ver_conferencia">
          Ver a conferência</button></div>`, "Arquivos trancados", ligarAcoes);
    }
    const item = (q, titulo, desc) => `<div class="saida-conv">
      <div><b>${titulo}</b><span>${desc}</span></div>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="baixar_${q}">Baixar</button>
        <button type="button" class="link" data-acao="previa_${q}">ver a prévia</button></div></div>`;
    return cartao("arquivos", "Arquivos", "Os arquivos estão prontos", `
      ${item("pdf", "PDF do balizamento", "As provas corridas, com faixa de etapa e espaço para o tempo.")}
      ${item("papeletas", "Papeletas de raia", "Quatro por folha A4, com prova, série, raia e quadros de tempo.")}
      ${item("xlsx", "Planilha do balizamento", "Balizamento, resumo, atletas e conferência, editável no Excel.")}
      <p class="nota">As logos das instituições entram pela tela completa.
        <button type="button" class="link" data-acao="tela_gerar">pôr as logos</button></p>`,
      "Arquivos prontos", ligarAcoes);
  }

  /* ---------------- a IA reescrevendo a planilha no modelo do app ----------
     A planilha recusada é reescrita aqui mesmo: a IA lê a estrutura numa
     amostra mascarada, o app aplica o mapa em todas as linhas e mostra a
     tabela nova, linha original ao lado da reescrita. O que a IA não teve
     certeza vem com Sim e Não. Nada entra no balizamento sem "Usar estas
     inscrições", e a tabela nova pode ser baixada no modelo do app. */
  let org = null;

  function prepararOrganizacao() {
    const a = app(), u = a.estado.ultimaRecusa;
    if (!u) return null;
    if (org && org.wb === u.wb) return org;
    const perfil = a.lerConfig();
    const grades = IA.lerGrades(u.wb, { abas: u.abas });
    if (!grades.length) return null;
    const voc = IA.vocabulario(perfil), mascara = IA.novaMascara();
    const amostra = IA.montarAmostra(grades, mascara, voc);
    org = { wb: u.wb, arquivo: u.arquivo, base: u.base, grades, voc, mascara, amostra,
            pedido: IA.pedidoDoMapa(amostra, perfil), mapaFeito: false, provasFeitas: false,
            linhas: [], ignoradas: [], resumoAbas: [], pendentes: [], pedidoProvas: null,
            planoB: {}, pedidosAba: {}, ocupado: null, erro: null, controle: null,
            filtro: "todas", editando: null, conferiAmarelas: false };
    return org;
  }

  const textoExato = (p) => "INSTRUÇÕES\n" + p.sistema + "\n\nPEDIDO\n" + p.texto;
  const comCodigos = (t) => AT(t)
    .replace(/\b(PESSOA|DATA|NUMERO) \d+\b/g, (c) => `<mark class="codigo">${c}</mark>`)
    .replace(/ ¶ |\r?\n/g, "<br>");

  function tabelaAmostra(a) {
    const cols = Array.from({ length: a.colunas }, (_, c) => XLSX.utils.encode_col(c));
    let anterior = null;
    const corpo = [];
    for (const l of a.linhas) {
      if (anterior != null && l.i > anterior + 1) {
        corpo.push(`<tr class="pulo"><td class="lin">…</td><td colspan="${cols.length}">${l.i - anterior - 1} linha(s) não vão</td></tr>`);
      }
      corpo.push(`<tr><td class="lin">${l.n}</td>${cols.map((_, c) => `<td>${comCodigos(l.cel[c])}</td>`).join("")}</tr>`);
      anterior = l.i;
    }
    return `<div class="amostra-ia"><p class="nota"><b>Aba ${AT(a.aba)}</b>: ${a.inteira
      ? "aba pequena, vai inteira" : `${a.linhas.length} de ${a.total} linhas`}</p>
      <div class="scroll-x"><table class="grade"><thead><tr><th class="lin"></th>${
        cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${corpo.join("")}</tbody></table></div></div>`;
  }

  function cartaoPropostaOrganizar() {
    const o = prepararOrganizacao();
    if (!o) return nota("Não há planilha recusada esperando a IA.");
    const total = o.amostra.reduce((s, x) => s + x.total, 0);
    const vao = o.amostra.reduce((s, x) => s + x.linhas.length, 0);
    return cartao("organizar", "Inscritos", "Posso reescrever esta planilha no modelo do app?", `
      <div class="numeros">
        <div><b>${vao}</b><span>de ${total} linhas vão, como amostra</span></div>
        <div class="bom"><b>${o.mascara.conta.PESSOA}</b><span>nomes trocados por código</span></div>
        <div class="bom"><b>${o.mascara.conta.DATA}</b><span>datas trocadas por código</span></div>
      </div>
      <details class="mais texto-exato"><summary>ver exatamente o que vai para a IA</summary>
        ${o.amostra.map(tabelaAmostra).join("")}<pre>${AT(textoExato(o.pedido))}</pre></details>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="org_sim">Sim, pode reescrever</button>
        <button type="button" class="mini claro" data-acao="org_nao">Não</button>
      </div>`, "Pedido para reescrever a planilha", ligarAcoes);
  }

  // um cartão com os passos do trabalho da IA acendendo um a um
  function cartaoProgresso(tipo, titulo, passos) {
    return cartao(tipo, "IA trabalhando", titulo, `<ol class="passos-ia">${passos.map((p, k) =>
      `<li data-k="${k}"><span class="marca-passo"></span><span>${AT(p)}</span><em></em></li>`).join("")}</ol>`,
      titulo);
  }
  function marcar(el, k, estado, extra) {
    const li = $(`li[data-k="${k}"]`, el);
    if (!li) return;
    li.className = estado;
    if (extra) $("em", li).textContent = extra;
  }

  async function organizar() {
    const o = org, a = app();
    const perfil = a.lerConfig(), prog = perfil.programa || [];
    const el = cartaoProgresso("progresso-org", "Reescrevendo a planilha", [
      "Amostra enviada, com os nomes trocados por código",
      "Mapa da planilha recebido e conferido contra o esquema",
      "Mapa aplicado aqui, em todas as linhas",
      "Provas conferidas contra o programa"]);
    conv.controleOrg = new AbortController();
    try {
      marcar(el, 0, "fazendo");
      const r = await pedirIA(Object.assign({}, o.pedido, { sinal: conv.controleOrg.signal }), el);
      marcar(el, 0, "feito");
      const conf = IA.conferirMapa(r.dados, o.grades);
      if (conf.erros.length) {
        throw new IA.ErroIA("O mapa que a IA devolveu não serve para esta planilha. Nada foi usado.", conf.erros);
      }
      marcar(el, 1, "feito");
      const ap = IA.aplicarMapa(r.dados, o.grades, o.mascara, perfil);
      Object.assign(o, { mapaFeito: true, linhas: ap.linhas, ignoradas: ap.ignoradas, resumoAbas: ap.abas });
      marcar(el, 2, "feito", `${ap.linhas.length} inscrições`);
      o.pendentes = IA.provasPendentes(o.linhas, prog);
      o.pedidoProvas = o.pendentes.length ? IA.pedidoDasProvas(o.pendentes, prog, o.mascara, o.voc) : null;
      marcar(el, 3, o.pendentes.length ? "espera" : "feito",
        o.pendentes.length ? `${o.pendentes.length} jeito(s) de escrever a prova para casar` : "todas casaram");
    } catch (err) {
      $$("li.fazendo", el).forEach((li) => (li.className = "falhou"));
      return cartaoErroIA(err, "org_sim");
    } finally {
      conv.controleOrg = null;
    }
    seguirOrganizacao();
  }

  function cartaoErroIA(err, tentar) {
    const x = IA.explicarErro(err);
    return cartao("erro-ia", "IA", AT(x.titulo), `
      ${x.detalhes.length ? `<ul class="motivos-conv">${x.detalhes.map((d) => `<li>${AT(d)}</li>`).join("")}</ul>` : ""}
      <div class="acoes-cartao"><button type="button" class="botao" data-acao="${tentar}">Tentar de novo</button></div>`,
      "Erro da IA", ligarAcoes);
  }

  function seguirOrganizacao() {
    const o = org;
    const semConta = o.resumoAbas.find((x) => x.usada && !x.deuConta && !o.planoB[x.aba]);
    if (semConta) return cartaoAbaInteira(semConta.aba);
    if (o.pendentes.length && !o.provasFeitas) return cartaoProvasIA();
    const prog = app().lerConfig().programa || [];
    const conta = { ok: 0, incerto: 0, erro: 0 };
    for (const l of o.linhas) if (!l.excluida) conta[IA.interpretar(l, prog).estado]++;
    return contar(`A IA reescreveu a planilha no modelo do app: ${o.linhas.length} inscrições, ${conta.ok} prontas, ` +
      `${conta.incerto} marcadas para a pessoa responder Sim ou Não, ${conta.erro} que não entram assim. ` +
      "A tabela aparece logo abaixo da sua fala. Em no máximo duas frases curtas, diga o que você viu e o que a pessoa precisa fazer.",
      () => cartaoOrganizada(true));
  }

  function cartaoAbaInteira(aba) {
    const o = org, g = o.grades.find((x) => x.aba === aba);
    if (!o.pedidosAba[aba]) o.pedidosAba[aba] = IA.pedidoDaAbaInteira(g, o.mascara, o.voc, app().lerConfig());
    const p = o.pedidosAba[aba];
    return cartao("aba-inteira", "Inscritos", `Posso mandar a aba ${AT(aba)} inteira?`, `
      <p>O mapa não deu conta desta aba. Com ela inteira, ${g.linhas.length} linhas com os nomes e as
        datas trocados por código, eu transcrevo inscrição por inscrição. Tudo volta para a mesma
        tabela, para você conferir.</p>
      <details class="mais texto-exato"><summary>ver exatamente o que vai</summary>
        ${tabelaAmostra(p.amostra[0])}<pre>${AT(textoExato(p))}</pre></details>
      <div class="acoes-cartao" data-aba="${AT(aba)}">
        <button type="button" class="botao" data-acao="aba_sim">Sim, pode mandar</button>
        <button type="button" class="mini claro" data-acao="aba_nao">Não, deixar esta aba de fora</button>
      </div>`, "Pedido da aba inteira", ligarAcoes);
  }

  async function transcreverAba(aba) {
    const o = org;
    const el = cartaoProgresso("progresso-aba", `Transcrevendo a aba ${aba}`,
      ["Aba enviada, com os nomes trocados por código", "Transcrição conferida contra a planilha"]);
    try {
      marcar(el, 0, "fazendo");
      const r = await IA.chamar(conv.sample, o.pedidosAba[aba]);
      marcar(el, 0, "feito");
      const t = IA.aplicarTranscricao(r.dados, o.grades.find((x) => x.aba === aba), o.mascara);
      o.linhas = o.linhas.filter((l) => l.origem.aba !== aba).concat(t.linhas);
      o.ignoradas = o.ignoradas.filter((x) => x.aba !== aba).concat(t.ignoradas);
      Object.assign(o.resumoAbas.find((x) => x.aba === aba),
        { via: "transcricao", deuConta: true, inscricoes: t.linhas.length, problemas: t.problemas });
      o.planoB[aba] = "feito";
      marcar(el, 1, "feito", `${t.linhas.length} inscrições`);
      const prog = app().lerConfig().programa || [];
      const novas = IA.provasPendentes(o.linhas, prog);
      if (novas.length) {
        o.pendentes = novas;
        o.pedidoProvas = IA.pedidoDasProvas(novas, prog, o.mascara, o.voc);
        o.provasFeitas = false;
      }
    } catch (err) {
      $$("li.fazendo", el).forEach((li) => (li.className = "falhou"));
      return cartaoErroIA(err, "aba_sim");
    }
    seguirOrganizacao();
  }

  function cartaoProvasIA() {
    const o = org;
    const troca = (v) => IA.mascararCelula(v, o.mascara, o.voc);
    const n = o.pendentes.reduce((s, p) => s + p.linhas.length, 0);
    return cartao("provas-ia", "Inscritos", `Posso casar estas provas com o programa? (${n} inscrições)`, `
      <ul class="motivos-conv">${o.pendentes.slice(0, 12).map((p) =>
        `<li>${comCodigos(IA.descricaoDaProva(p.campos, troca))} <span class="apagado">(${p.linhas.length})</span></li>`).join("")}</ul>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="provas_sim">Sim, pode casar</button>
        <button type="button" class="mini claro" data-acao="provas_nao">Não, resolvo na tabela</button>
      </div>`, "Pedido para casar as provas", ligarAcoes);
  }

  async function casarProvas() {
    const o = org;
    const el = cartaoProgresso("progresso-provas", "Casando as provas com o programa",
      ["Nomes de prova enviados, sem dado de atleta", "Cada prova conferida contra o programa"]);
    try {
      marcar(el, 0, "fazendo");
      const r = await pedirIA(o.pedidoProvas, el);
      marcar(el, 0, "feito");
      IA.aplicarProvas(r.dados, o.pendentes, o.mascara);
      marcar(el, 1, "feito");
    } catch (err) {
      $$("li.fazendo", el).forEach((li) => (li.className = "falhou"));
      return cartaoErroIA(err, "provas_sim");
    }
    o.provasFeitas = true;
    seguirOrganizacao();
  }

  // a tabela nova: cada linha da planilha original ao lado de como ela ficou
  function cartaoOrganizada(primeira) {
    const o = org, prog = app().lerConfig().programa || [];
    const itens = o.linhas.map((l) => ({ l, r: IA.interpretar(l, prog) }));
    let ordemDeEntrada = 0;
    const conta = { ok: 0, incerto: 0, erro: 0, fora: 0 };
    for (const x of itens) conta[x.l.excluida ? "fora" : x.r.estado]++;
    const peso = (x) => (x.l.excluida ? 3 : { erro: 0, incerto: 1, ok: 2 }[x.r.estado]);
    const ordem = itens.slice().sort((x, y) => peso(x) - peso(y));
    const linha = (x) => {
      const { l, r } = x;
      x.k = ordemDeEntrada++;
      const est = l.excluida ? "fora" : r.estado;
      let vai = '<span class="apagado">fora do balizamento</span>';
      if (!l.excluida && r.inscricao) {
        const i = r.inscricao, p = r.numero ? prog[r.numero - 1] : null;
        const titulo = p ? D.tituloProva(p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe)
                         : D.tituloProva(i.distancia, i.estilo, i.categoria, i.naipe);
        vai = `<b>${AT(i.revezamento ? i.equipe : i.nome)}</b>${!i.revezamento && i.equipe ? " · " + AT(i.equipe) : ""}
          <br>${r.numero ? `<span class="num-prova">prova ${r.numero}</span> ` : ""}${AT(titulo)}
          · ${i.tempo != null ? B.formatarTempo(i.tempo) : "sem tempo"}`;
      } else if (!l.excluida) vai = '<span class="exigida">não entra assim</span>';
      const botoes = est === "incerto"
        ? `<button type="button" class="botao" data-linha-sim="${AT(l.id)}">Sim, está certo</button>
           <button type="button" class="mini claro" data-linha-nao="${AT(l.id)}">Não, tirar</button>`
        : est === "erro"
          ? `<button type="button" class="mini claro" data-linha-nao="${AT(l.id)}">Tirar</button>
             <button type="button" class="link" data-acao="org_tela">corrigir na tela completa</button>`
          : est === "fora" ? `<button type="button" class="link" data-linha-volta="${AT(l.id)}">voltar</button>` : "";
      return `<div class="linha-org ${est}" style="--d:${Math.min(x.k || 0, 14) * 0.06}s">
        <div class="org-origem">${AT(l.origem.aba)}<b>linha ${l.origem.linha}</b></div>
        <div class="org-de">${(l.original || []).filter(Boolean).map(AT).join('<span class="sep"> · </span>')}</div>
        <div class="org-para">${vai}
          ${!l.excluida && r.motivos.length ? `<ul class="motivos">${r.motivos.map((m) => `<li>${AT(m)}</li>`).join("")}</ul>` : ""}
          ${botoes ? `<div class="acoes-cartao">${botoes}</div>` : ""}</div></div>`;
    };
    const marcadas = ordem.filter((x) => x.l.excluida || x.r.estado !== "ok");
    const prontas = ordem.filter((x) => !x.l.excluida && x.r.estado === "ok");
    const trancado = conta.erro > 0 || conta.incerto > 0 || !(conta.ok);
    const corpo = `
      <div class="numeros">
        <div class="bom"><b>${conta.ok}</b><span>prontas</span></div>
        <div><b>${conta.incerto}</b><span>para você responder</span></div>
        <div class="${conta.erro ? "ruim" : ""}"><b>${conta.erro}</b><span>que não entram assim</span></div>
        <div><b>${o.ignoradas.length}</b><span>linhas que não eram inscrição</span></div>
      </div>
      <div class="tabela-org ${primeira ? "entra" : ""}">
        <div class="linha-org cabeca"><div>DE ONDE VEIO</div><div>NA PLANILHA</div><div>NO MODELO DO APP</div></div>
        ${marcadas.map(linha).join("")}
        ${prontas.slice(0, 6).map(linha).join("")}
      </div>
      ${prontas.length > 6 ? `<details class="mais"><summary>ver as outras ${prontas.length - 6} prontas</summary>
        <div class="tabela-org">${prontas.slice(6).map(linha).join("")}</div></details>` : ""}
      ${o.ignoradas.length ? `<details class="mais"><summary>ver as ${o.ignoradas.length} linhas que não eram inscrição</summary>
        <ul class="motivos-conv">${o.ignoradas.slice(0, 60).map((x) => `<li>${AT(x.aba)}, linha ${x.linha}:
          ${AT(x.motivo)}</li>`).join("")}</ul></details>` : ""}
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="org_usar" ${trancado ? "disabled" : ""}>
          Usar estas ${conta.ok} inscrições</button>
        ${conta.incerto ? `<button type="button" class="botao claro" data-acao="org_todas_certas">
          Sim para todas as ${conta.incerto} marcadas</button>` : ""}
        <button type="button" class="mini claro" data-acao="org_baixar">Baixar a tabela no modelo do app</button>
        <button type="button" class="link" data-acao="org_tela">revisar linha por linha na tela completa</button>
      </div>
      ${trancado && conta.ok ? `<p class="nota">${conta.erro ? `Faltam ${conta.erro} linha(s) que não entram assim: tire ou corrija. ` : ""}${
        conta.incerto ? `Responda Sim ou Não nas ${conta.incerto} marcadas.` : ""}</p>` : ""}`;
    const titulo = `Reescrevi ${itens.length} inscrições no modelo do app`;
    const ligar = (el) => {
      ligarAcoes(el);
      const achar = (id) => o.linhas.find((l) => l.id === id);
      $$("[data-linha-sim]", el).forEach((b) => (b.onclick = () => { achar(b.dataset.linhaSim).conferida = true; cartaoOrganizada(); }));
      $$("[data-linha-nao]", el).forEach((b) => (b.onclick = () => { achar(b.dataset.linhaNao).excluida = true; cartaoOrganizada(); }));
      $$("[data-linha-volta]", el).forEach((b) => (b.onclick = () => { achar(b.dataset.linhaVolta).excluida = false; cartaoOrganizada(); }));
    };
    // a mesma tabela se atualiza no lugar a cada Sim e Não
    const vivo = $('.cartao-conversa[data-tipo="organizada"]:not(.antigo)');
    if (vivo && !primeira) {
      $("h3", vivo).textContent = titulo;
      $(".corpo", vivo).innerHTML = corpo;
      ligar(vivo);
      return vivo;
    }
    return cartao("organizada", "Inscritos", AT(titulo), corpo, "Tabela reescrita no modelo do app", ligar);
  }

  function usarOrganizadas() {
    const r = app().aceitarOrganizadas(org);
    if (!r.ok) return nota("Ainda há linhas para responder ou tirar.");
    const n = r.inscricoes;
    org = null;
    ["organizada", "progresso-org", "progresso-aba", "progresso-provas"].forEach(fechar);
    nota(`As ${n} inscrições reescritas entraram e passaram pelas conferências de sempre.`);
    renderTrilha();
    if (conv.demo) {
      conv.demo.passo = 4;
      guia(4, "A conferência",
        "As regras do app conferem tudo e acham os erros plantados. Cada correção só acontece com o seu Sim.");
    }
    app().propostasDeCorrecao();
    return contar(`A pessoa confirmou a tabela reescrita pela IA: ${n} inscrições entraram e passaram pelas conferências. ` +
      "A conferência, com as correções propostas, aparece logo abaixo da sua fala. Em no máximo duas frases curtas, aponte o que ela achou, começando pelos vermelhos.",
      () => { if (!conv.demo) cartaoInscritos(); cartaoConferencia(); });
  }

  /* ---------------- a IA corrigindo linhas do programa ---------------- */
  let corrProg = null;

  function cartaoPropostaPrograma() {
    const r = app().estado.programa;
    const ruins = r ? r.linhas.filter((l) => !l.ok) : [];
    if (!ruins.length) return cartaoPrograma();
    const pedido = IA.pedidoDoPrograma(ruins, r.provas);
    corrProg = { r, ruins, pedido, itens: null, decisao: {} };
    return cartao("proposta-programa", "Programa", `Posso corrigir ${ruins.length === 1 ? "esta linha" : `estas ${ruins.length} linhas`} do programa?`, `
      <ul class="motivos-conv">${ruins.slice(0, 10).map((l) =>
        `<li>linha ${l.linha}: <code>${AT(l.texto)}</code></li>`).join("")}</ul>
      <details class="mais texto-exato"><summary>ver exatamente o que vai</summary><pre>${AT(textoExato(pedido))}</pre></details>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="prog_sim">Sim, pode corrigir</button>
        <button type="button" class="mini claro" data-acao="prog_nao">Não</button>
      </div>`, "Pedido para corrigir o programa", ligarAcoes);
  }

  async function corrigirPrograma() {
    const c = corrProg;
    const el = cartaoProgresso("progresso-prog", "Corrigindo o programa",
      ["Linhas enviadas", "Correções conferidas com as regras do programa"]);
    try {
      marcar(el, 0, "fazendo");
      const r = await pedirIA(c.pedido, el);
      marcar(el, 0, "feito");
      c.itens = IA.correcoesDoPrograma(r.dados, c.ruins);
      marcar(el, 1, "feito", `${c.itens.filter((x) => x.prova || x.naoEProva).length} correção(ões)`);
    } catch (err) {
      $("li.fazendo", el).forEach((li) => (li.className = "falhou"));
      return cartaoErroIA(err, "prog_sim");
    }
    const vira = c.itens.map((x) => `linha ${x.linha} ${x.naoEProva ? "sai, porque não é prova"
      : x.prova ? "vira " + D.tituloProva(x.prova.distancia, x.prova.estilo, x.prova.categoria, x.prova.naipe)
      : "fica sem correção: " + x.problema}`).join("; ");
    return contar(`A IA propôs correções para ${c.itens.length} linha(s) do programa: ${vira}. ` +
      "A tabela com Sim e Não aparece logo abaixo da sua fala. Em uma frase curta, diga o que vai mudar.",
      () => cartaoCorrecoesPrograma(true));
  }

  function cartaoCorrecoesPrograma(primeira) {
    const c = corrProg;
    const util = c.itens.filter((x) => x.prova || x.naoEProva);
    const pendentes = util.filter((x) => c.decisao[x.linha] == null).length;
    const aceitas = util.filter((x) => c.decisao[x.linha] === true).length;
    const linha = (x) => {
      const d = c.decisao[x.linha];
      const vira = x.naoEProva ? "<i>não é prova: sai do programa</i>"
        : x.prova ? AT(D.tituloProva(x.prova.distancia, x.prova.estilo, x.prova.categoria, x.prova.naipe))
        : `<span class="exigida">${AT(x.problema)}</span>`;
      const pode = x.prova || x.naoEProva;
      return `<div class="linha-org ${d === true ? "ok" : d === false ? "fora" : x.incerto || !pode ? "incerto" : "ok"}">
        <div class="org-origem">programa<b>linha ${x.linha}</b></div>
        <div class="org-de">${AT(x.original)}</div>
        <div class="org-para">${vira}
          ${x.motivo && (x.incerto || !pode) ? `<ul class="motivos"><li>${AT(x.motivo)}</li></ul>` : ""}
          ${pode ? `<div class="acoes-cartao">${d == null
            ? `<button type="button" class="botao" data-sim-prog="${x.linha}">Sim</button>
               <button type="button" class="mini claro" data-nao-prog="${x.linha}">Não</button>`
            : `<span class="apagado">${d ? "aceita" : "recusada"}</span>
               <button type="button" class="link" data-desfaz-prog="${x.linha}">mudar</button>`}</div>` : ""}
        </div></div>`;
    };
    const corpo = `
      <div class="tabela-org">
        <div class="linha-org cabeca"><div>ONDE</div><div>ESTAVA ESCRITO</div><div>VAI FICAR</div></div>
        ${c.itens.map(linha).join("")}
      </div>
      <div class="acoes-cartao">
        <button type="button" class="botao" data-acao="prog_aplicar" ${aceitas && !pendentes ? "" : "disabled"}>
          Aplicar as ${aceitas} correção(ões) aceitas</button>
        ${pendentes > 1 ? `<button type="button" class="botao claro" data-acao="prog_todas">Sim para todas</button>` : ""}
      </div>`;
    const ligar = (el) => {
      ligarAcoes(el);
      $$("[data-sim-prog]", el).forEach((b) => (b.onclick = () => { c.decisao[b.dataset.simProg] = true; cartaoCorrecoesPrograma(); }));
      $$("[data-nao-prog]", el).forEach((b) => (b.onclick = () => { c.decisao[b.dataset.naoProg] = false; cartaoCorrecoesPrograma(); }));
      $$("[data-desfaz-prog]", el).forEach((b) => (b.onclick = () => { delete c.decisao[b.dataset.desfazProg]; cartaoCorrecoesPrograma(); }));
    };
    const vivo = $('.cartao-conversa[data-tipo="correcoes-programa"]:not(.antigo)');
    if (vivo && !primeira) {
      $(".corpo", vivo).innerHTML = corpo;
      ligar(vivo);
      return vivo;
    }
    return cartao("correcoes-programa", "Programa", "Assim ficariam as linhas", corpo, "Correções do programa", ligar);
  }

  function aplicarCorrecoesPrograma() {
    const c = corrProg;
    const aceitas = c.itens.filter((x) => c.decisao[x.linha] === true && (x.prova || x.naoEProva));
    const r2 = IA.programaCorrigido(c.r, aceitas);
    r2.arquivo = c.r.arquivo;
    app().aplicarPrograma(r2);
    corrProg = null;
    fechar("correcoes-programa");
    fechar("progresso-prog");
    nota(`${aceitas.length} linha(s) do programa corrigida(s).`);
    renderTrilha();
    return contar(`A pessoa aplicou ${aceitas.length} correção(ões) no programa. Agora são ${r2.provas.length} provas` +
      (r2.ok ? ", sem linha pendente." : ", e ainda há linha que o app não entende.") +
      " O cartão do programa aparece logo abaixo da sua fala. Em uma frase curta, diga como ficou e que dá para seguir.",
      cartaoPrograma);
  }

  /* ---------------- o que cada botão faz ---------------- */
  function arquivoDe(wb, nome) {
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new File([out], nome, { type: "application/octet-stream" });
  }

  async function acao(nome, botao) {
    const a = app(), e = a.estado;
    novaVez();
    const bloco = botao && botao.closest("[data-bloco]");
    const cartaoAtual = botao && botao.closest(".cartao-conversa");
    switch (nome) {
      case "enviar_programa": return cartaoArquivo("programa");
      case "enviar_inscritos": return cartaoArquivo("inscritos");
      case "exemplo": case "baguncada": {
        conv.exemplo = { comp: "ESCOLAR", inscritos: nome === "baguncada" ? "MATRIZ" : null };
        bolha("eu", formatar(nome === "exemplo" ? "Quero ver um exemplo."
                                                 : "Quero ver a IA organizar uma planilha bagunçada."));
        return carregarExemploPrograma();
      }
      case "exemplo_programa": return carregarExemploPrograma();
      case "exemplo_inscritos": return carregarExemploInscritos();
      case "modelo_programa": return a.baixarModeloPrograma();
      case "modelo_inscritos": return a.baixarModelo();
      case "sem_programa":
        a.seguirSemPrograma();
        nota("Seguindo sem o programa de provas.");
        return contar("A pessoa escolheu seguir sem o programa de provas. Sem ele, o app numera só as provas que têm inscritos, na ordem que deduzir. O cartão da competição aparece logo abaixo da sua fala.",
          () => cartaoCompeticao());
      case "ignorar_linhas":
        e.programa.ok = true;
        a.liberarCompeticao(true);
        nota("As linhas que não eram provas ficaram de fora.");
        renderTrilha();
        return cartaoPrograma();
      case "juntar_sim": case "juntar_nao":
        e.perfil.juntarPrograma = nome === "juntar_sim";
        a.renderGrupos();
        nota(nome === "juntar_sim" ? "Certo: os inscritos de cada categoria entram direto na prova que junta."
                                   : "Certo: cada caso vai ser perguntado na conferência.");
        return;
      case "programa_ok":
        if (conv.demo) return demoCompeticao();
        renderTrilha();
        return contar("A pessoa confirmou o programa. O cartão da competição aparece logo abaixo da sua fala: proponha os valores com base no programa (preencher_competicao) e pergunte o que só ela sabe.",
          () => cartaoCompeticao());
      case "etapa_unica":
        a.etapaUnica();
        return cartaoCompeticao();
      case "tela_competicao": return irParaTela("competicao");
      case "competicao_ok": {
        const r = a.confirmarCompeticao();
        if (!r.ok) return cartaoCompeticao(r.falta);
        nota("Competição confirmada.");
        renderTrilha();
        if (conv.demo) return demoInscritos();
        return contar("A pessoa confirmou a competição. O cartão para enviar os inscritos aparece logo abaixo da sua fala. Diga em uma frase curta o que vem.",
          () => cartaoArquivo("inscritos"));
      }
      case "organizar_ia": return cartaoPropostaOrganizar();
      case "org_sim": fechar("organizar"); fechar("erro-ia"); return organizar();
      case "org_nao":
        fechar("organizar");
        return nota("Certo, a planilha fica como está. Dá para enviar outra a qualquer momento.");
      case "aba_sim": {
        const aba = botao.closest("[data-aba]").dataset.aba;
        fechar("aba-inteira"); fechar("erro-ia");
        return transcreverAba(aba);
      }
      case "aba_nao":
        org.planoB[botao.closest("[data-aba]").dataset.aba] = "fora";
        fechar("aba-inteira");
        return seguirOrganizacao();
      case "provas_sim": fechar("provas-ia"); fechar("erro-ia"); return casarProvas();
      case "provas_nao": fechar("provas-ia"); org.provasFeitas = true; return seguirOrganizacao();
      case "org_todas_certas":
        for (const l of org.linhas) l.conferida = true;
        return cartaoOrganizada();
      case "org_usar": return usarOrganizadas();
      case "org_baixar": {
        const nomeBase = String(org.arquivo || "INSCRITOS").replace(/\.(xlsx|xlsm|xls|csv)$/i, "");
        a.baixarPlanilha(IA.planilhaOrganizada(org.linhas, a.lerConfig().programa || []),
                         "MODELO DO APP - " + nomeBase + ".xlsx");
        return;
      }
      case "org_tela":
        a.revisarOrganizacao(org);
        return definirModo("tela");
      case "corrigir_programa": return cartaoPropostaPrograma();
      case "prog_sim": fechar("proposta-programa"); fechar("erro-ia"); return corrigirPrograma();
      case "prog_nao": fechar("proposta-programa"); return nota("Certo, o programa fica como está.");
      case "prog_todas":
        for (const x of corrProg.itens) if (x.prova || x.naoEProva) corrProg.decisao[x.linha] = true;
        return cartaoCorrecoesPrograma();
      case "prog_aplicar": return aplicarCorrecoesPrograma();
      case "baixar_programa":
        return a.baixarPlanilha(IA.planilhaDoPrograma(e.programa.provas), "PROGRAMA NO MODELO DO APP.xlsx");
      case "correcao_sim": case "correcao_nao": {
        const id = botao.closest("[data-correcao]").dataset.correcao;
        const p = a.propostasDeCorrecao().find((x) => x.id === id);
        if (!p) return cartaoConferencia();
        if (nome === "correcao_nao") { conv.recusadas.add(id); cartaoConferencia(true); return demoTalvezFim(); }
        // a folha da correção mostra o "feito" antes de a conferência se refazer
        const box = botao.closest(".correcao");
        box.classList.add("feita");
        $(".acoes-cartao", box).innerHTML = `<p class="feito-ok">${AT(p.feito)}</p>`;
        await pausa(900);
        return aplicarCorrecoes([p]);
      }
      case "correcao_todas":
        return aplicarCorrecoes(a.propostasDeCorrecao().filter((x) => !conv.recusadas.has(x.id)));
      case "ver_conferencia": return cartaoConferencia();
      case "ver_raias": return cartaoRaias();
      case "prova_anterior": return cartaoRaias(cartaoAtual.dataset.anterior);
      case "prova_seguinte": return cartaoRaias(cartaoAtual.dataset.seguinte);
      case "ver_arquivos": return cartaoArquivos();
      case "explicar_bloco":
        return enviar(`Me explique o bloco "${bloco.dataset.titulo}" da conferência: o que aconteceu e o que eu devo fazer.`);
      case "resolver_bloco": return irParaTela("conferencia");
      case "seguir_bloco": {
        // decisão da pessoa, em dois cliques, dentro do próprio bloco
        bloco.innerHTML = `<p class="confirma"><b>Seguir assim mesmo?</b> O bloco deixa de travar
          os arquivos e não sai em vermelho no balizamento.</p>
          <button type="button" class="botao" data-sim="1">Sim, seguir assim</button>
          <button type="button" class="mini claro" data-nao="1">Não</button>`;
        $("[data-nao]", bloco).onclick = () => cartaoConferencia();
        $("[data-sim]", bloco).onclick = () => {
          a.aceitarBloco(bloco.dataset.bloco);
          nota(`Você decidiu seguir assim: ${bloco.dataset.titulo}.`);
          renderTrilha();
          cartaoConferencia();
        };
        return;
      }
      case "tela_gerar": return irParaTela("gerar");
      default:
        if (nome.startsWith("baixar_")) {
          const q = nome.slice(7);
          await a.baixarSaida(q);
          conv.baixados.add(q);
          return renderTrilha();
        }
        if (nome.startsWith("previa_")) {
          irParaTela("gerar");
          return a.verPrevia(nome.slice(7));
        }
    }
  }

  /* As correções que a pessoa aceitou: cada uma é a edição de verdade, a mesma
     do botão de resolver da conferência. A conferência se refaz na hora, e
     quando o último vermelho cai o Claude fica sabendo. */
  function aplicarCorrecoes(lista) {
    const antes = vermelhosPendentes();
    for (const p of lista) {
      p.aplicar();
      nota(p.feito);
    }
    renderTrilha();
    cartaoConferencia(true);
    const depois = vermelhosPendentes();
    if (conv.demo) return demoTalvezFim();
    if (antes && !depois) {
      return evento("A pessoa aceitou as correções e a conferência ficou sem nenhum vermelho: os arquivos estão liberados. Diga isso e mostre o cartão dos arquivos.");
    }
  }

  function vermelhosPendentes() {
    const a = app(), e = a.estado;
    if (!e.inscricoes.length) return 0;
    return a.montarSecoes().filter((s) => s.itens.length && s.nivel === "critico" &&
      !e.ajustes.aceitos.has(s.id)).length;
  }

  async function carregarExemploPrograma() {
    const comp = E.COMPETICOES[conv.exemplo ? conv.exemplo.comp : "ESCOLAR"];
    const r = await app().carregarPrograma(arquivoDe(E.planilhaDoPrograma(comp), "PROGRAMA DO EXEMPLO.xlsx"));
    // o exemplo já vem com nome e com o que a competição tem; o resto se conversa
    const sug = E.perfilSugerido(conv.exemplo ? conv.exemplo.comp : "ESCOLAR");
    preencher({ nome: sug.nome, tem_tempo: sug.temTempo, tem_revezamento: sug.temRevezamento,
                tem_paradesporto: sug.temPara });
    return depoisDoPrograma(r, "o programa do exemplo (" + sug.nome + ")");
  }

  async function carregarExemploInscritos() {
    const ex = conv.exemplo || { comp: "ESCOLAR" };
    const wb = ex.inscritos ? E.planilhaBaguncada(ex.inscritos).wb
                            : E.planilhaDeInscritos(E.COMPETICOES[ex.comp]);
    const nome = ex.inscritos ? E.nomeDaBaguncada(ex.inscritos) : "INSCRITOS DO EXEMPLO.xlsx";
    return receberArquivo(arquivoDe(wb, nome), "inscritos");
  }

  /* ---------------- planilhas que chegam ---------------- */
  async function receberArquivo(file, tipo) {
    tipo = tipo || conv.esperando;
    if (tipo === "inscritos" && !passoLivre("inscritos")) {
      nota("Antes dos inscritos, a competição precisa estar confirmada.");
      return cartaoCompeticao();
    }
    bolha("eu", `<p class="anexo">${AT(file.name)}</p>`);
    if (tipo === "programa") {
      const r = await app().carregarPrograma(file);
      return depoisDoPrograma(r, "o programa " + file.name);
    }
    const st = await app().carregarArquivo(file);
    return depoisDosInscritos(st, file.name);
  }

  function depoisDoPrograma(r, origem) {
    renderTrilha();
    if (!r) {
      nota("Não consegui abrir este arquivo como planilha.");
      return cartaoArquivo("programa");
    }
    if (!r.provas.length) {
      return contar(`A pessoa enviou ${origem}, mas não deu para ler nenhuma prova. Problemas: ${(r.problemas || []).join("; ")}. ` +
        "O cartão com o modelo aparece logo abaixo da sua fala. Em duas frases curtas, diga o que faltou.", () =>
      cartao("programa", "Programa", "Não consegui ler um programa nesta planilha", `
        <ul class="motivos-conv">${(r.problemas || []).map((p) => `<li>${AT(p)}</li>`).join("")}</ul>
        <p class="nota">Uma linha por prova, com DISTÂNCIA, ESTILO, CATEGORIA e NAIPE.</p>
        <div class="acoes-cartao"><button type="button" class="mini claro" data-acao="modelo_programa">
          Baixar a planilha modelo</button></div>`, "Programa recusado", ligarAcoes));
    }
    const ruins = (r.linhas || []).filter((l) => !l.ok);
    const e = app().estado;
    return contar(`A pessoa enviou ${origem}: ${r.provas.length} provas reconhecidas, ${ruins.length} linhas não entendidas` +
      (ruins.length ? ` (${ruins.map((l) => `linha ${l.linha} "${l.texto}": ${l.motivo}`).join("; ")})` : "") +
      `, ${(e.perfil.etapas || []).length} etapas, ` +
      `${r.provas.filter((p) => /^\d+X/.test(p.distancia)).length} revezamentos. ` +
      "O cartão do programa aparece logo abaixo da sua fala. Em no máximo duas frases curtas, diga o que você viu" +
      (ruins.length ? " e ofereça corrigir as linhas com IA." : " e peça para conferir."), cartaoPrograma);
  }

  async function depoisDosInscritos(st, nome) {
    renderTrilha();
    const e = app().estado;
    if (st && st.aceita) {
      app().propostasDeCorrecao();
      return contar(`Os inscritos de ${nome} foram lidos: ${e.inscricoes.length} inscrições. ` +
        "Os cartões dos inscritos e da conferência aparecem logo abaixo da sua fala. Em no máximo duas frases curtas, aponte o que a conferência achou, começando pelos vermelhos.",
        () => { cartaoInscritos(); cartaoConferencia(); });
    }
    if (st && st.recusada) {
      const motivos = e.recusa.abas.map((a) => `aba ${a.aba}: ${a.motivo}`).join("; ");
      if (conv.demo) {
        return contar(`Demonstração guiada, passo 3. A ficha das escolas ${nome} foi recusada: ${motivos}. ` +
          "O pedido para reescrever, com Sim e Não, aparece logo abaixo da sua fala. Em no máximo duas frases curtas e sem jargão, aponte o que você viu na ficha e diga que pode reescrever no modelo do app, mandando só uma amostra com os nomes trocados por código.",
          cartaoPropostaOrganizar);
      }
      return contar(`A planilha de inscritos ${nome} foi recusada: ${motivos}. ` +
        "O cartão com o botão de organizar com IA aparece logo abaixo da sua fala. Em no máximo duas frases curtas, explique em palavras simples e ofereça organizar com IA.",
        cartaoInscritos);
    }
    cartaoInscritos();
    return evento(`A planilha de inscritos ${nome} não trouxe nenhuma inscrição.`);
  }

  /* ---------------- o resumo da tela que vai em cada mensagem ---------------- */
  const textoSimples = (h) => String(h == null ? "" : h).replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();

  function trocarNomesConhecidos(t) {
    let s = String(t == null ? "" : t);
    const nomes = new Set();
    for (const i of app().estado.inscricoes) {
      if (!i.revezamento && i.nome) nomes.add(String(i.nome).trim());
      for (const a of (i.atletas || [])) nomes.add(String(a).trim());
    }
    [...nomes].filter((n) => n.length > 3).sort((a, b) => b.length - a.length)
      .forEach((n) => { if (s.includes(n)) s = s.split(n).join(IA.mascararCelula(n, conv.mascara, conv.voc)); });
    return s;
  }

  function situacao() {
    const a = app(), e = a.estado;
    conv.voc = IA.vocabulario(e.perfil || {});
    const troca = (t) => IA.mascararCelula(t, conv.mascara, conv.voc);
    const sim = (b) => (b ? "sim" : "não");
    const L = [];
    const { feito, atual } = situacaoDasEtapas();
    L.push(`Etapas feitas: ${ETAPAS.filter(([k]) => feito[k]).map(([, r]) => r).join(", ") || "nenhuma"}. Etapa atual: ${atual}.`);
    const prog = (e.programa && e.programa.provas) || [];
    if (prog.length) {
      L.push(`Programa: ${prog.length} provas.`);
      L.push(prog.slice(0, 60).map((x, k) => `${k + 1}. ` +
        D.tituloProva(x.distancia, x.estilo, x.rotulo || x.categoria, x.naipe) +
        (x.etapa ? ` (${x.etapa})` : "")).join("\n"));
    } else if (passoLivre("competicao")) L.push("Programa: seguindo sem programa de provas.");
    else L.push("Programa: ainda não enviado.");
    const c = a.lerConfig();
    L.push(`Competição: nome "${c.nome}", local "${c.local}", datas ${c.data || "não informadas"}, ` +
      `raias ${$("#raias").value || "não informadas"}, limite de provas individuais ${$("#limiteInd").value || "não informado"}` +
      (c.temPara ? `, limite no paradesporto ${$("#limiteIndPara").value || "não informado"}` : "") +
      (c.limiteEquipe ? `, até ${c.limiteEquipe} atletas por equipe na prova` : "") +
      `. Tempo de inscrição: ${sim(c.temTempo)}. Revezamento: ${sim(c.temRevezamento)}. Paradesporto: ${sim(c.temPara)}` +
      (c.temPara ? ` (classe ${c.tipoClasse === "FUNCIONAL" ? "funcional" : "por condição"})` : "") +
      `. Etapas: ${(c.etapas || []).map((x) => `${x.nome} (provas ${x.de} a ${x.ate})`).join("; ") || "nenhuma"}.`);
    const falta = $("#faltando");
    if (falta && !falta.hidden && falta.textContent.trim()) {
      L.push("Para confirmar a competição: " + falta.textContent.replace(/\s+/g, " ").trim());
    }
    if (e.inscricoes.length) {
      const rev = e.inscricoes.filter((i) => i.revezamento).length;
      L.push(`Inscritos: ${e.inscricoes.length} inscrições (${e.inscricoes.length - rev} individuais, ${rev} equipes de revezamento).`);
    } else if (e.recusa) {
      L.push("Inscritos: a planilha enviada foi recusada. " +
        e.recusa.abas.map((x) => `Aba ${troca(x.aba)}: ${x.motivo}`).join(". ") + ".");
    } else L.push("Inscritos: nenhuma planilha enviada ainda.");
    if (e.inscricoes.length) {
      if (!e.provas.length) a.montar();
      const secoes = a.montarSecoes().filter((s) => s.itens.length);
      if (!secoes.length) L.push("Conferência: nenhum problema.");
      for (const s of secoes) {
        const aceito = e.ajustes.aceitos.has(s.id);
        const nivel = { critico: "vermelho", aviso: "aviso" }[s.nivel] || "informativo";
        L.push(`Bloco da conferência "${s.titulo}" (${nivel}${aceito ? ", a pessoa decidiu seguir assim" : ""}): ${s.itens.length} caso(s).`);
        for (const it of s.itens.slice(0, 6)) {
          L.push("  " + [it.prova ? it.prova + "ª " + (it.titulo || "") : (it.titulo || ""),
            it.nome ? troca(it.nome) : "", it.equipe ? troca(it.equipe) : "",
            trocarNomesConhecidos(textoSimples(it.detalhe))].filter(Boolean).join(" | "));
        }
        if (s.itens.length > 6) L.push(`  e mais ${s.itens.length - 6}.`);
        if (s.explica) L.push("  O que acontece: " + trocarNomesConhecidos(textoSimples(s.explica)).slice(0, 600));
      }
      L.push(`Provas com gente: ${e.provas.filter((p) => p.series.length).map((p) => p.numero).join(", ")}.`);
      const props = a.propostasDeCorrecao().filter((p) => !conv.recusadas.has(p.id));
      if (props.length) {
        L.push("Correções prontas no cartão, esperando o Sim ou o Não da pessoa:");
        for (const p of props.slice(0, 12)) {
          L.push("  " + trocarNomesConhecidos(p.caso) + " Pergunta: " + trocarNomesConhecidos(p.pergunta));
        }
      }
    }
    const r = e.programa;
    if (r && (r.linhas || []).some((l) => !l.ok)) {
      L.push("Linhas do programa que o app não entendeu: " +
        r.linhas.filter((l) => !l.ok).slice(0, 8).map((l) => `linha ${l.linha} "${l.texto}" (${l.motivo})`).join("; ") + ".");
    }
    L.push(`Arquivos: ${a.geracaoLiberada() ? "liberados" : "trancados"}${conv.baixados.size ? ", já baixados: " + [...conv.baixados].join(", ") : ""}.`);
    return L.join("\n");
  }

  /* ---------------- as ferramentas do Claude ---------------- */
  function preencher(x) {
    const feito = [];
    const texto = (id, v, rot) => {
      if (v == null || v === "") return;
      const el = $("#" + id);
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      feito.push(`${rot}: ${v}`);
    };
    const marca = (id, v, rot) => {
      if (typeof v !== "boolean") return;
      const el = $("#" + id);
      if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event("change", { bubbles: true })); }
      feito.push(`${rot}: ${v ? "sim" : "não"}`);
    };
    const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
    if (x.data_inicio && !data(x.data_inicio)) throw new Error("data_inicio precisa ser AAAA-MM-DD");
    if (x.data_fim && !data(x.data_fim)) throw new Error("data_fim precisa ser AAAA-MM-DD");
    const inteiro = (v, min, max) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`valor fora do aceito: ${v}`);
      return n;
    };
    texto("nomeComp", x.nome, "nome");
    texto("local", x.local, "local");
    texto("dataInicio", data(x.data_inicio), "começa em");
    texto("dataFim", data(x.data_fim), "termina em");
    texto("raias", inteiro(x.raias, 2, 12), "raias");
    texto("limiteInd", inteiro(x.limite_individual, 1, 20), "limite individual");
    texto("limiteIndPara", inteiro(x.limite_paradesporto, 1, 20), "limite no paradesporto");
    texto("limiteEquipe", inteiro(x.limite_por_equipe, 1, 50), "atletas por equipe na prova");
    marca("temTempo", x.tem_tempo, "tempo de inscrição");
    marca("temRevezamento", x.tem_revezamento, "revezamento");
    marca("temPara", x.tem_paradesporto, "paradesporto");
    if (x.tipo_classe === "FUNCIONAL" || x.tipo_classe === "CONDICAO") {
      const el = $("#tipoClasse");
      el.value = x.tipo_classe;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      feito.push("classe: " + (x.tipo_classe === "FUNCIONAL" ? "funcional" : "por condição"));
    }
    if (x.data_inicio || x.data_fim) app().estado.perfil.datasDoPrograma = false;
    app().atualizarPreviaData();
    app().validarConfig();
    atualizarCartaoCompeticao();
    const falta = $("#faltando");
    return { preenchido: feito,
             ainda_falta: falta && !falta.hidden ? falta.textContent.replace(/\s+/g, " ").trim() : "nada" };
  }

  const CARTOES = ["enviar_programa", "programa", "corrigir_programa", "competicao",
                   "enviar_inscritos", "inscritos", "organizar", "conferencia", "raias", "arquivos"];

  function ferramentas() {
    return [
      {
        name: "mostrar",
        description: "Põe na conversa, logo depois da sua resposta, o cartão interativo de uma etapa, para a pessoa agir ali mesmo. Use sempre que a próxima ação for dela.",
        inputSchema: { type: "object", properties: {
          cartao: { type: "string", enum: CARTOES },
          prova: { type: "integer", description: "número da prova, só para o cartão raias" },
        }, required: ["cartao"] },
        execute: (x) => {
          if (!CARTOES.includes(x.cartao)) throw new Error("cartão desconhecido: " + x.cartao);
          conv.pendentes.push({ cartao: x.cartao, prova: x.prova });
          return "o cartão vai aparecer logo depois da sua resposta";
        },
      },
      {
        name: "preencher_competicao",
        description: "Preenche campos da competição e devolve o que foi preenchido e o que ainda falta. Mande só os campos que a pessoa disse ou aceitou.",
        inputSchema: { type: "object", properties: {
          nome: { type: "string" }, local: { type: "string" },
          data_inicio: { type: "string", description: "AAAA-MM-DD" },
          data_fim: { type: "string", description: "AAAA-MM-DD" },
          raias: { type: "integer", description: "de 2 a 12" },
          limite_individual: { type: "integer", description: "provas individuais por atleta" },
          limite_paradesporto: { type: "integer", description: "provas individuais por atleta no paradesporto" },
          limite_por_equipe: { type: "integer", description: "atletas de cada instituição na mesma prova" },
          tem_tempo: { type: "boolean" }, tem_revezamento: { type: "boolean" },
          tem_paradesporto: { type: "boolean" },
          tipo_classe: { type: "string", enum: ["FUNCIONAL", "CONDICAO"] },
        } },
        execute: (x) => preencher(x || {}),
      },
      {
        name: "confirmar_competicao",
        description: "Confirma a competição e libera o envio dos inscritos. Só use quando a pessoa disser que os valores estão certos. Devolve o que falta, se faltar.",
        execute: () => {
          const r = app().confirmarCompeticao();
          if (r.ok) { conv.pendentes.push({ cartao: "enviar_inscritos" }); renderTrilha(); }
          return r;
        },
      },
      {
        name: "usar_exemplo",
        description: "Carrega planilhas de exemplo, com dados inventados, para a pessoa ver o app funcionando. programa: o programa de provas do campeonato escolar de exemplo. inscritos: os inscritos do mesmo exemplo, no formato certo. inscritos_fora_do_formato: uma planilha bagunçada que o app recusa e a IA organiza.",
        inputSchema: { type: "object", properties: {
          parte: { type: "string", enum: ["programa", "inscritos", "inscritos_fora_do_formato"] },
        }, required: ["parte"] },
        execute: async (x) => {
          conv.exemplo = conv.exemplo || { comp: "ESCOLAR", inscritos: null };
          if (x.parte === "programa") {
            await carregarExemploPrograma();
            return "programa do exemplo carregado: " + app().estado.programa.provas.length + " provas";
          }
          if (!passoLivre("inscritos")) throw new Error("antes dos inscritos, a competição precisa estar confirmada");
          conv.exemplo.inscritos = x.parte === "inscritos_fora_do_formato" ? "MATRIZ" : null;
          await carregarExemploInscritos();
          const e = app().estado;
          return e.inscricoes.length ? `${e.inscricoes.length} inscrições lidas` : "a planilha foi recusada pelo app";
        },
      },
      {
        name: "ver_prova",
        description: "Devolve as séries e raias de uma prova já montada pelo app, com nomes trocados por código, e mostra o cartão das raias dela.",
        inputSchema: { type: "object", properties: { numero: { type: "integer" } }, required: ["numero"] },
        execute: (x) => {
          const p = app().estado.provas.find((q) => q.numero === Number(x.numero));
          if (!p) throw new Error("não existe a prova " + x.numero);
          const troca = (t) => IA.mascararCelula(t, conv.mascara, conv.voc);
          conv.pendentes.push({ cartao: "raias", prova: p.numero });
          return { prova: `${p.numero}ª ${p.titulo}`, series: p.series.map((s) => ({
            serie: s.numero, raias: s.linhas.map((l) => ({ raia: l.raia,
              quem: troca(p.revezamento ? l.item.equipe : l.item.nome),
              equipe: troca(l.item.equipe || ""),
              tempo: l.item.tempo != null ? B.formatarTempo(l.item.tempo) : "sem tempo" })) })),
            cortados_pelo_regulamento: p.cortados.length };
        },
      },
      {
        name: "seguir_sem_programa",
        description: "Segue sem programa de provas, quando a pessoa não tem um. Sem ele, o app numera só as provas com inscritos.",
        execute: () => {
          app().seguirSemPrograma();
          conv.pendentes.push({ cartao: "competicao" });
          renderTrilha();
          return "seguindo sem programa";
        },
      },
      {
        name: "abrir_tela_completa",
        description: "Leva a pessoa, depois da sua resposta, para a tela completa de um passo, para o que só se faz lá: ajustar etapas e agrupamentos, resolver um bloco da conferência, ver a prévia dos arquivos, pôr as logos.",
        inputSchema: { type: "object", properties: { passo: { type: "string",
          enum: ["programa", "competicao", "inscritos", "conferencia", "gerar"] } }, required: ["passo"] },
        execute: (x) => { conv.pendentes.push({ tela: x.passo }); return "a tela completa abre depois da sua resposta"; },
      },
      {
        name: "organizar_com_ia",
        description: "Mostra, depois da sua resposta, o pedido para reescrever no modelo do app a planilha de inscritos que o app recusou, com o que vai ser enviado e os botões Sim e Não. Não envia nada sozinho: quem decide é a pessoa.",
        execute: () => {
          if (!app().estado.ultimaRecusa) throw new Error("não há planilha recusada esperando a IA");
          conv.pendentes.push({ cartao: "organizar" });
          return "o pedido com Sim e Não aparece depois da sua resposta";
        },
      },
      {
        name: "corrigir_programa_com_ia",
        description: "Mostra, depois da sua resposta, o pedido para corrigir com IA as linhas do programa que o app não entendeu, com Sim e Não. Cada correção depois volta para a pessoa aceitar ou recusar.",
        execute: () => {
          const r = app().estado.programa;
          if (!r || !r.linhas.some((l) => !l.ok)) throw new Error("o programa não tem linha pendente");
          conv.pendentes.push({ cartao: "corrigir_programa" });
          return "o pedido com Sim e Não aparece depois da sua resposta";
        },
      },
    ];
  }

  function cumprirPendentes() {
    const lista = conv.pendentes.splice(0);
    for (const p of lista) {
      if (p.tela) { irParaTela(p.tela); continue; }
      if (p.cartao === "enviar_programa") cartaoArquivo("programa");
      else if (p.cartao === "corrigir_programa") cartaoPropostaPrograma();
      else if (p.cartao === "organizar") cartaoPropostaOrganizar();
      else if (p.cartao === "enviar_inscritos") cartaoArquivo("inscritos");
      else if (p.cartao === "programa") cartaoPrograma();
      else if (p.cartao === "competicao") cartaoCompeticao();
      else if (p.cartao === "inscritos") cartaoInscritos();
      else if (p.cartao === "conferencia") cartaoConferencia();
      else if (p.cartao === "raias") cartaoRaias(p.prova);
      else if (p.cartao === "arquivos") cartaoArquivos();
    }
  }

  /* ---------------- a conversa com o Claude ---------------- */
  const INSTRUCOES = `Você é o Claude, dentro do Balizador, um aplicativo que monta o balizamento de competições de natação: distribui os atletas em séries e raias, gera o PDF, a planilha e as papeletas de raia, e confere erros de inscrição. Aqui você conduz a pessoa pelo balizamento inteiro, conversando. Quem fala com você é quase sempre um árbitro ou organizador de natação, não um programador.

O caminho tem cinco etapas, nesta ordem:
1. Programa de provas: a planilha que dá a ordem e a numeração das provas.
2. Competição: nome, local, datas, número de raias, limite de provas individuais por atleta, se tem tempo de inscrição, revezamento e paradesporto, e as etapas.
3. Inscritos: a planilha dos inscritos. Se vier fora do formato, o app recusa e oferece organizar com IA.
4. Conferência: os problemas encontrados, em blocos. Bloco vermelho tranca os arquivos até a pessoa resolver ou decidir seguir assim.
5. Arquivos: o PDF do balizamento, as papeletas e a planilha.

Como conduzir:
- Uma coisa de cada vez, em no máximo duas frases curtas: o que você viu e o que a pessoa precisa decidir. Os cartões aparecem logo depois da sua fala e mostram os detalhes e os botões Sim e Não: não repita o que eles mostram nem descreva os botões.
- Sempre que a próxima ação for da pessoa, chame a ferramenta mostrar com o cartão certo, para ela agir ali mesmo. Não chame mostrar para um cartão que a mensagem diz que vai aparecer depois da sua fala.
- Nunca escreva uma chamada de ferramenta como texto (nada de tool_call, JSON de ferramenta ou marcação parecida). Se não tiver a ferramenta, só fale.
- Competição: depois do programa, proponha valores com base nele (revezamento quando há provas 4x; paradesporto quando há categorias paralímpicas ou segmentos DF, DV, DI, DA, TEA) e pergunte o que só a pessoa sabe, principalmente quantas raias tem a piscina e quantas provas individuais cada atleta pode nadar. Quando ela responder, preencha com preencher_competicao e peça para conferir no cartão. Use confirmar_competicao só quando ela disser que está certo.
- Programa com linha que o app não entendeu: explique e ofereça corrigir com IA (ferramenta corrigir_programa_com_ia). Cada correção volta com Sim e Não, e depois dá para baixar o programa no modelo do app.
- Planilha de inscritos recusada: explique o motivo e ofereça reescrever a planilha no modelo do app (ferramenta organizar_com_ia). A pessoa vê o que vai ser enviado, responde Sim ou Não, e confere a tabela nova antes de ela entrar.
- Conferência: comece pelos vermelhos. O cartão traz correções prontas, cada uma com Sim e Não (tirar a inscrição repetida, ler o tempo de outro jeito, juntar na prova do programa, tirar prova fora do programa, ficar com as primeiras provas do atleta, unificar a classe). Explique cada uma em palavras simples e peça a resposta. Só diga que corrigiu depois que a mensagem do app disser que a pessoa respondeu Sim. Seguir assim mesmo também é decisão dela, no cartão.
- Mensagens que começam com [evento do app] são o app contando o que a pessoa fez na tela. Responda como continuação natural da conversa.

Regras:
- Séries e raias são montadas pelo app, sempre pelas regras dele: ordem do centro para fora, últimas séries cheias, melhor tempo na raia central da última série. Nunca diga que você montou ou mudou o balizamento.
- Você só sabe o que está no resumo da tela que vem junto de cada mensagem e o que as ferramentas devolvem. Não invente atleta, prova, número nem regra de regulamento.
- Nomes de atletas e algumas equipes chegam trocados por códigos como PESSOA 3. Escreva o código exatamente como veio: o app troca de volta pelo nome na tela. Nunca tente adivinhar o nome.
- Só diga que fez algo depois de a ferramenta confirmar. Se ela devolver erro, explique o que falta.
- Responda em português do Brasil, curto, caloroso e direto. Não use travessão. Lista curta só quando ajudar. Quando indicar um botão, escreva o nome dele como aparece na tela.`;

  // mensagem que a pessoa escreve
  function enviar(texto) {
    texto = String(texto || "").trim();
    if (!texto) return;
    novaVez();
    bolha("eu", formatar(texto));
    return chamar(texto);
  }

  // o app contando ao Claude o que aconteceu na tela
  function evento(texto, extra) {
    if (!conv.sample) return Promise.resolve();
    const x = Object.assign({}, conv.demo ? DEMO_FALA : null, extra);
    const aviso = x.semFerramentas || !conv.ferramentas
      ? " (Nesta resposta você está sem ferramentas: só fale, em no máximo duas frases curtas.)" : "";
    return chamar("[evento do app] " + texto + aviso, x);
  }

  /* A IA fala primeiro, em poucas palavras, e só então o cartão aparece logo
     abaixo da fala. Se a fala não vier a tempo, o cartão aparece assim mesmo. */
  async function contar(texto, depois, extra) {
    if (conv.sample) await evento(texto, Object.assign({ limite: 25000, silencioso: true }, extra));
    return depois ? depois() : undefined;
  }

  /* extra: semFerramentas (só comentar), limite (ms até desistir), silencioso
     (sem resposta, a fala some), antes (pôr a fala antes deste cartão).
     Devolve uma promessa que se cumpre quando a resposta termina. */
  function chamar(conteudo, extra) {
    if (!conv.sample) return Promise.resolve();
    return new Promise((pronto) => {
      const x = Object.assign({}, extra, { pronto });
      if (conv.controle) conv.fila.push({ conteudo, extra: x });
      else falar(conteudo, x);
    });
  }

  async function falar(conteudo, extra) {
    conv.turnos.push({ role: "user", content: conteudo });
    const recentes = conv.turnos.slice(-14);
    const envio = [{ role: "user", content: INSTRUCOES }].concat(recentes.map((t, k) =>
      k === recentes.length - 1
        ? { role: "user", content: t.content + "\n\n---\nResumo da tela agora, feito pelo app:\n" + situacao() }
        : t));
    // enquanto o Claude pensa, o nadador vai e volta na raia
    const fala = bolha("claude pensando", RAIA_PENSANDO);
    if (extra.antes && extra.antes.isConnected) $("#fio").insertBefore(fala, extra.antes);
    conv.controle = new AbortController();
    const prazo = extra.limite ? setTimeout(() => conv.controle && conv.controle.abort(), extra.limite) : null;
    trancarCompositor(true);
    let parcial = "";
    const escrever = (t, fim) => {
      $(".texto", fala).innerHTML = formatar(t) + (fim || "");
      rolar(fala, true);
    };
    try {
      const opcoes = {
        cache: false, effort: "low", signal: conv.controle.signal,
        onText: ({ text }) => {
          parcial = text;
          // a resposta chegou: o nadador bate na borda e o texto aparece
          if (fala.classList.contains("pensando")) {
            chegar(fala).then(() => { fala.classList.remove("pensando"); escrever(parcial); });
            return;
          }
          escrever(text);
        },
      };
      if (conv.ferramentas && !extra.semFerramentas) opcoes.tools = ferramentas();
      const r = await conv.sample(envio, opcoes);
      await chegar(fala);
      fala.classList.remove("pensando");
      escrever(r.text, r.truncated ? '<p class="apagado">A resposta foi cortada. Peça uma parte de cada vez.</p>' : "");
      conv.turnos.push({ role: "assistant", content: r.text });
    } catch (e) {
      fala.classList.remove("pensando");
      if (extra.silencioso && !parcial) {
        // na demonstração, a fala que não veio a tempo simplesmente não aparece
        fala.remove();
        conv.turnos.pop();
      } else if (e && e.code === "cancelled") {
        $(".texto", fala).innerHTML = parcial ? formatar(parcial) : '<p class="apagado">Parado.</p>';
        if (parcial) conv.turnos.push({ role: "assistant", content: parcial });
      } else {
        fala.classList.add("erro");
        $(".texto", fala).innerHTML = `<p>${AT(IA.explicarErro(e).titulo.replace(" Nada foi usado.", ""))}</p>` +
          "<p class=\"apagado\">Os cartões continuam funcionando sem mim.</p>";
        // a conversa fica com um turno do usuário sem resposta: é permitido
      }
    } finally {
      clearTimeout(prazo);
      conv.controle = null;
      trancarCompositor(false);
      cumprirPendentes();
      renderTrilha();
      rolar();
      if (extra.pronto) extra.pronto();
      // a próxima da fila já traz a promessa de quem pediu
      if (conv.fila.length) { const p = conv.fila.shift(); falar(p.conteudo, p.extra); }
    }
  }

  const RAIA_PENSANDO = `<div class="raia-ia"><span class="nadador-ia">${NADADOR}</span></div>
    <span class="legenda-raia">nadando até a resposta</span>`;

  // o nadador acelera até a borda, toca, e só então a resposta aparece
  function chegar(fala) {
    if (fala._chegada) return fala._chegada;
    const n = $(".nadador-ia", fala);
    const calmo = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fala._chegada = new Promise((pronto) => {
      if (!n || calmo) return pronto();
      const x = n.offsetLeft;
      n.style.animation = "none";
      n.style.left = x + "px";
      n.style.transform = "translateY(-50%)";
      void n.offsetWidth;
      n.style.transition = "left .45s ease-in";
      n.style.left = "calc(100% - 3.3rem)";
      setTimeout(() => { fala.classList.add("tocou"); setTimeout(pronto, 320); }, 450);
    });
    return fala._chegada;
  }

  function trancarCompositor(ocupado) {
    const enviarBtn = $("#enviarMensagem"), parar = $("#pararMensagem");
    if (enviarBtn) enviarBtn.hidden = ocupado;
    if (parar) parar.hidden = !ocupado;
  }

  /* ---------------- conversa ou tela completa ---------------- */
  // o retrato da situação ao sair para a tela completa, para saber o que mudou
  let retrato = null;
  function retratar() {
    const e = app().estado;
    return JSON.stringify([situacaoDasEtapas().feito, e.inscricoes.length,
      [...e.ajustes.aceitos].length, Object.keys(e.ajustes.decisoes || {}).length,
      e.ajustes.removidas.size]);
  }

  function definirModo(modo) {
    const conversa = modo === "conversa" && !!conv.sample;
    const antes = document.body.classList.contains("modo-conversa");
    document.body.classList.toggle("modo-conversa", conversa);
    if (!conversa) {
      if (antes) retrato = retratar();
      window.scrollTo(0, 0);
      return;
    }
    // de volta da tela completa: o que mudou lá aparece aqui
    if (!antes && retrato && retrato !== retratar()) {
      nota("Você mexeu na tela completa. A situação agora:");
      const { atual } = situacaoDasEtapas();
      mostrarEtapa(atual);
    }
    retrato = null;
    renderTrilha();
    rolar();
  }

  function irParaTela(passo) {
    definirModo("tela");
    app().irPara(passo);
  }

  /* ---------------- ligação com o app ---------------- */
  function ligar() {
    $$("[data-modo]").forEach((b) => (b.onclick = () => {
      if (b.dataset.modo === "inicio") return mostrarAbertura();
      definirModo("conversa");
    }));
    $$("[data-caminho]").forEach((b) => (b.onclick = () => escolherCaminho(b.dataset.caminho)));
    $("#continuarConversa").onclick = () => {
      document.body.classList.remove("na-abertura");
      renderTrilha();
      rolar();
    };
    const form = $("#compositor"), caixa = $("#mensagem"), anexo = $("#anexo");
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const t = caixa.value;
      caixa.value = "";
      caixa.style.height = "";
      enviar(t);
    });
    caixa.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); }
    });
    caixa.addEventListener("input", () => {
      caixa.style.height = "auto";
      caixa.style.height = Math.min(caixa.scrollHeight, 180) + "px";
    });
    anexo.addEventListener("change", () => {
      if (anexo.files[0]) receberArquivo(anexo.files[0]);
      anexo.value = "";
    });
    $("#pararMensagem").onclick = () => conv.controle && conv.controle.abort();
    // planilha arrastada para qualquer lugar da conversa
    const area = $("#conversa");
    area.addEventListener("dragover", (ev) => { ev.preventDefault(); area.classList.add("sobre"); });
    area.addEventListener("dragleave", (ev) => { if (ev.target === area) area.classList.remove("sobre"); });
    area.addEventListener("drop", (ev) => {
      ev.preventDefault(); area.classList.remove("sobre");
      if (ev.dataTransfer.files[0]) receberArquivo(ev.dataTransfer.files[0]);
    });
  }

  // chamada pelo app quando o claude.ai responde se este app pode usar o Claude
  async function iniciar() {
    if (conv.ligada) return;
    const a = app();
    conv.sample = a.claudeApp.sample;
    if (!conv.sample) {
      // fora do claude.ai: os cinco passos de sempre, com o convite para lá
      const convite = $("#conviteClaude");
      if (convite) convite.hidden = false;
      return;
    }
    conv.ligada = true;
    // no claude.ai, o Balizador veste a noite na piscina da página de entrada
    document.documentElement.classList.add("noite");
    const lim = await conv.sample.limits().catch(() => null);
    conv.ferramentas = !!(lim && lim.tools);
    $("#modos").hidden = false;
    ligar();
    definirModo("conversa");
    // quem pediu para começar de novo volta direto no caminho que escolheu
    let caminho = null;
    try { caminho = sessionStorage.getItem(CHAVE_COMECAR); sessionStorage.removeItem(CHAVE_COMECAR); } catch (e) { /* sem memória */ }
    if (caminho === "demo" || caminho === "minhas") return comecar(caminho);
    mostrarAbertura();
  }

  // o app avisa daqui o que aconteceu numa tela que a conversa abriu
  function eventoDoApp(nome, dados) {
    if (nome !== "revisao_confirmada") return false;
    definirModo("conversa");
    retrato = null;
    nota(`A revisão foi confirmada: ${dados.inscricoes} inscrições organizadas pela IA entraram.`);
    renderTrilha();
    app().propostasDeCorrecao();
    contar(`A pessoa revisou e confirmou as inscrições organizadas pela IA: ${dados.inscricoes} inscrições entraram, e já passaram pelas conferências de sempre. Os cartões dos inscritos e da conferência aparecem logo abaixo da sua fala. Em no máximo duas frases curtas, aponte o que a conferência achou, começando pelos vermelhos.`,
      () => { cartaoInscritos(); cartaoConferencia(); });
    return true;
  }

  window.BalizadorConversa = {
    iniciar,
    ativa: () => conv.ligada,
    evento: eventoDoApp,
  };
})();
