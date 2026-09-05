/* =====================================================================
   BALIZADOR, interface
   ===================================================================== */
(function () {
  "use strict";
  const B = window.Balizador, D = window.BalizadorDados, S = window.BalizadorSaida;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const CX = (t) => String(t == null ? "" : t).toUpperCase();

  /* Valor que vai dentro de um atributo HTML. Sem isto, a aspa de
     PARALÍMPICO "A" + "B" fecha o atributo no meio e o campo aparece
     cortado em PARALÍMPICO, levando junto o casamento com o programa. */
  const AT = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const TIPOS = {
    PARA: {
      rotulo: "Paradesportiva",
      descricao: "Segmentos DF, DV, DI, DA e TEA-DOWN com classe funcional " +
                 "(S/SB/SM). O app valida cada inscrição contra o mapa de provas.",
      exige: ["nome", "cidade", "segmento", "classe"],
      usarRegrasPara: true, mostrarCategoria: false,
      limiteInd: 5,
      categoriasPara: ["DF", "DV", "DI", "DA", "TEA"],
    },
    ESCOLAR: {
      rotulo: "Escolar por categoria",
      descricao: "Pré-mirim, mirim, infantil, juvenil. A categoria da aba já " +
                 "define a prova; não há classe funcional.",
      exige: ["nome", "escola", "categoria"],
      usarRegrasPara: false, mostrarCategoria: false,
      limiteInd: 2,
      categoriasPara: [],
    },
    ESCOLAR_PARA: {
      rotulo: "Escolar com paradesporto",
      descricao: "Categorias escolares e categorias paralímpicas A, B e C no " +
                 "mesmo evento, com classe funcional só nas provas paralímpicas.",
      exige: ["nome", "escola", "categoria", "classe (só nas paralímpicas)"],
      usarRegrasPara: false, mostrarCategoria: true,
      limiteInd: 2,
      categoriasPara: ["PARAL"],
    },
    TEMPO: {
      rotulo: "Clube / federação por tempo",
      descricao: "Sem categoria de deficiência. Havendo tempo de inscrição, " +
                 "o balizamento é por desempenho.",
      exige: ["nome", "equipe", "categoria", "tempo"],
      usarRegrasPara: false, mostrarCategoria: false,
      limiteInd: 5,
      categoriasPara: [],
    },
  };

  const estado = {
    perfil: null, inscricoes: [], abas: [], provas: [], erros: [], limites: [],
    categorias: [], descartadas: [], arquivo: null, planas: [],
    // o que cada conferência achou na última montagem
    tempos: [], naipes: [], classes: [], mesmoNome: [], parecidos: [],
    idades: [], nascimentos: [], porEquipe: [], revezamentos: [],
    provasRepetidas: [],
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
             jaVistos: new Set(), tempos: {}, classes: {},
             // atletas cujas provas o árbitro já escolheu na mão. Se o que
             // ele escolheu continua furando a regra, é exceção autorizada.
             decisoes: {} };
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
      limiteInd: "", limiteIndPara: "", limiteEquipe: "",
      juntarPrograma: true,
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
    // as listas dos agrupamentos saem do programa, que pode ter chegado agora
    if (passo === "competicao") preencherListasDoPrograma();
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

  /* Etapa que volta depois de já ter terminado: 1ª, 2ª, 1ª de novo. Cada
     volta vira uma faixa nova no PDF, com o mesmo nome, e o árbitro acaba
     com duas "1ª ETAPA" separadas em vez de uma. */
  function etapasForaDeOrdem(provas) {
    const et = etapasDoPrograma(provas);
    const vistas = new Map();
    const saida = [];
    for (const e of et) {
      const k = B.normalizar(e.nome);
      if (vistas.has(k)) {
        saida.push({ nome: e.nome, de: e.de, ate: e.ate, antes: vistas.get(k) });
      } else vistas.set(k, e.de + " a " + e.ate);
    }
    return saida;
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

    const voltas = etapasForaDeOrdem(r.provas);
    const trocadas = r.provas.filter((p, i) => p.numero != null && p.numero !== i + 1);
    const juncoes = juncoesDoPrograma(r.provas);
    const juntar = estado.perfil.juntarPrograma !== false;

    html("resultadoPrograma", `${fichas}
      ${juncoes.length ? `<div class="recusa pergunta" id="cartaoJuncoes">
        <h3>Este programa manda categorias nadarem juntas</h3>
        <p>Onde o nome da prova traz um <b>+</b>, o programa está dizendo que
          aquelas categorias dividem as mesmas raias. Posso já jogar os
          inscritos de cada uma na prova certa, mesmo que na planilha de
          inscritos elas venham separadas e com o nome abreviado.</p>
        <div class="juncao">${juncoes.map((j) => `
          <b>${j.categoria}</b>
          <span class="apagado">junta ${j.partes.length} categorias, em
            ${j.provas.length} prova(s): ${j.distancias.join(", ").toLowerCase()}</span>`).join("")}
        </div>
        <p class="nota" id="notaJuncoes">${juntar
          ? "Vou juntar sozinho. A conferência mostra depois o que casou com o quê."
          : "Não vou juntar nada: cada caso vai ser perguntado na conferência."}</p>
        <div class="acoes">
          <button type="button" class="botao" id="btnJuntarSim">Pode juntar</button>
          <button type="button" class="mini claro" id="btnJuntarNao">
            Prefiro conferir uma por uma</button>
        </div>
      </div>` : ""}
      <p class="nota">Lido de <b>${r.arquivo}</b>, aba <b>${r.aba}</b>,
        formato ${r.formato === "colunas"
          ? "de colunas separadas" : "de prova escrita por extenso"}.
        ${et.length ? `As etapas já foram montadas a partir da coluna ETAPA;
          você pode ajustá-las na próxima tela.` : ""}</p>
      ${voltas.length ? `<div class="recusa leve">
        <h3>A coluna ETAPA volta atrás</h3>
        <p>${voltas.map((v) => `<b>${v.nome}</b> aparece de novo nas provas
          ${v.de} a ${v.ate}, depois de já ter terminado nas ${v.antes}`)
          .join("; ")}. Cada volta vira uma faixa separada no PDF, com o mesmo
          nome. Se as provas eram para estar juntas, junte as linhas na
          planilha; se são sessões diferentes mesmo, dê nomes diferentes.</p>
      </div>` : ""}
      ${trocadas.length ? `<div class="recusa leve">
        <h3>${trocadas.length} prova(s) com a numeração diferente da ordem</h3>
        <p>A coluna <b>Nº</b> diz um número e a posição da linha diz outro.
          Quem manda no balizamento é a ordem das linhas, e é esse número que
          vai sair impresso. Confira na tabela abaixo, onde a diferença aparece
          marcada, se não faltou nem sobrou prova no meio.</p>
      </div>` : ""}
      ${tabelaPrograma(r)}`);

    /* Decidir fecha o cartão. Ele é uma pergunta, e pergunta respondida sai
       da frente: fica uma linha dizendo o que ficou valendo, com um jeito de
       mudar. Enquanto ele continuava inteiro na tela, clicar parecia não ter
       feito nada. */
    const marcarJuncao = (valor, fechando) => {
      estado.perfil.juntarPrograma = valor;
      const cartao = $("#cartaoJuncoes");
      if (fechando && cartao) {
        cartao.className = "recusa pergunta fechada";
        cartao.innerHTML = `<p><b>${valor ? "Certo, junto sozinho."
                                          : "Certo, não junto nada."}</b>
          ${valor
            ? "Os inscritos de cada categoria já entram na prova certa. A lista "
              + "está na tela da competição, e a conferência mostra o que casou."
            : "Cada caso vai ser perguntado na conferência."}
          <button type="button" class="link" id="btnMudarJuncao">mudar</button></p>`;
        ao("btnMudarJuncao", "click", () => renderResultadoPrograma(r));
        renderGrupos();
        aviso(valor ? "Certo, junto sozinho pelo programa."
                    : "Certo, pergunto caso a caso na conferência.");
        return;
      }
      // ainda aberto: mostra qual das duas está valendo
      const sim = $("#btnJuntarSim"), nao = $("#btnJuntarNao");
      const nota = $("#notaJuncoes");
      if (sim && nao) {
        sim.className = valor ? "botao" : "mini claro";
        nao.className = valor ? "mini claro" : "botao";
      }
      if (nota) {
        nota.textContent = valor
          ? "Do jeito que está, junto sozinho."
          : "Do jeito que está, não junto nada.";
      }
      renderGrupos();
    };
    ao("btnJuntarSim", "click", () => marcarJuncao(true, true));
    ao("btnJuntarNao", "click", () => marcarJuncao(false, true));
    // deixa a tela já mostrando o que está valendo, sem esperar clique
    if (juncoes.length) marcarJuncao(juntar, false);
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
            limiteInd: 5,
            limiteIndPara: 5, categoriasPara: ["DF", "DV", "DI", "DA", "TEA"] },
    ESCOLAR: { temPara: false, temTempo: false,
               temRevezamento: true, mostrarCategoria: false,
               limiteInd: 2,
               limiteIndPara: 3, categoriasPara: [] },
    ESCOLAR_PARA: { temPara: true, tipoClasse: "CONDICAO",
                    temTempo: false, temRevezamento: true, mostrarCategoria: true,
                    limiteInd: 2,
                    limiteIndPara: 3, categoriasPara: ["PARAL"] },
    TEMPO: { temPara: false, temTempo: true,
             temRevezamento: true, mostrarCategoria: false,
             limiteInd: 5,
             limiteIndPara: 5, categoriasPara: [] },
    VAZIO: { temPara: false, temTempo: false,
             temRevezamento: false, mostrarCategoria: false,
             limiteInd: "",
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
    $("#limiteIndPara").value = p.limiteIndPara;
    if ($("#limiteEquipe"))
      $("#limiteEquipe").value = p.limiteEquipe == null ? "" : p.limiteEquipe;
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
      ? p.programa.slice(0, 2).map((x) => D.cabecalhoDeProva(
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
        // no revezamento quem nada é a equipe: a coluna do nome fica vazia
        linhas.push({ tipo: "atleta", vals: [""].concat(apoio(0)) });
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
    if (doPrograma > 2) {
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
            ? " No revezamento basta a equipe: quem nada é escolhido no dia."
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

  // "2026-09-22" -> "22/09", que é como o dia sai no cabeçalho da etapa
  function diaCurto(iso) {
    const p = pedacosDaData(iso);
    return p ? pad2(p.dia) + "/" + pad2(p.mes + 1) : String(iso || "").trim();
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
    p.limiteIndPara = parseInt($("#limiteIndPara").value, 10) || 3;
    const le = $("#limiteEquipe") ? $("#limiteEquipe").value.trim() : "";
    p.limiteEquipe = le === "" ? null : parseInt(le, 10);
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
      const v = (x) => (x == null || x === "" ? "" : AT(x));
      l.innerHTML = `
        <input value="${v(e.nome)}" data-c="nome" placeholder="1ª ETAPA">
        <input value="${v(diaParaIso(e.dia) || "")}" data-c="dia" type="date">
        <input value="${v(e.periodo)}" data-c="periodo" placeholder="MANHÃ">
        <input value="${v(e.de)}" data-c="de" type="number" min="1" placeholder="1">
        <input value="${v(e.ate)}" data-c="ate" type="number" min="1"
               placeholder="${nProvas || 20}">
        <button type="button" class="mini" title="remover esta etapa">×</button>`;
      $$("input", l).forEach((i) => {
        i.oninput = () => {
          const campo = i.dataset.c;
          const numerica = campo === "de" || campo === "ate";
          const bruto = i.value.trim();
          // o calendário devolve 2026-09-22; no cabeçalho da etapa sai 22/09
          estado.perfil.etapas[k][campo] = campo === "dia" ? diaCurto(bruto)
            : numerica ? (bruto === "" ? "" : parseInt(bruto, 10) || "")
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
  /* As listas que os campos do agrupamento oferecem saem do próprio programa
     de provas: é lá que estão as categorias, as distâncias e os estilos que
     existem nesta competição. Digitar continua valendo, para quando o nome
     dos inscritos for diferente do nome do programa. */
  function preencherListasDoPrograma() {
    const prog = estado.perfil.programa || [];
    const põe = (id, valores) => {
      const alvo = $("#" + id);
      if (!alvo) return;
      alvo.innerHTML = [...new Set(valores.filter(Boolean))]
        .map((v) => `<option value="${AT(v)}">`).join("");
    };
    põe("listaCategorias", prog.map((p) => p.rotulo || p.categoria));
    põe("listaDistancias", prog.map((p) => p.distancia));
    põe("listaEstilos", prog.map((p) => p.estilo));
  }

  function renderGrupos() {
    const alvo = $("#grupos");
    preencherListasDoPrograma();
    alvo.innerHTML = "";

    /* O que o programa já manda juntar aparece aqui em cima, escrito, para
       ninguém precisar adivinhar se aconteceu. Não é campo: é o que o app faz
       sozinho, e mexer nisso é mexer no programa de provas. */
    const juncoes = juncoesDoPrograma(estado.perfil.programa || []);
    const juntando = estado.perfil.juntarPrograma !== false;
    if (juncoes.length) {
      const caixa = document.createElement("div");
      caixa.className = "juncoes-programa" + (juntando ? "" : " desligada");
      caixa.innerHTML = `
        <p class="rotulo-juncoes">${juntando
          ? "Estas o programa já manda juntar, e o app faz sozinho:"
          : "Estas o programa manda juntar, mas você pediu para conferir uma por uma:"}</p>
        ${juncoes.map((j) => `<p><b>${AT(j.categoria)}</b>
          <span class="apagado">recebe ${j.partes.length} categorias, em
          ${j.provas.length} prova(s): ${AT(j.distancias.join(", ").toLowerCase())}</span></p>`).join("")}`;
      alvo.appendChild(caixa);
    }
    estado.perfil.grupos.forEach((g, k) => {
      const l = document.createElement("div");
      // sem a classe "grupo" a linha cai na grade das etapas, que tem seis
      // colunas, e os campos ficam tortos debaixo dos próprios rótulos
      l.className = "linha-etapa grupo";
      l.innerHTML = `
        <input value="${AT(g.rotulo)}" data-c="rotulo" list="listaCategorias"
               placeholder='PARALÍMPICO "A" + "B"'>
        <input value="${AT((g.categorias || []).join(', '))}" data-c="categorias"
               list="listaCategorias" placeholder='PARAL "A", PARAL "B"'>
        <input value="${AT((g.distancias || []).join(', '))}" data-c="distancias"
               list="listaDistancias" placeholder="25M">
        <input value="${AT((g.estilos || []).join(', '))}" data-c="estilos"
               list="listaEstilos" placeholder="LIVRE, COSTAS">
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
        // duas linhas da mesma equipe sem nadador escrito são duas equipes,
        // não a mesma repetida: quem nada só é escolhido no dia
        if (!(i.atletas || []).length) return true;
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
    estado.provasRepetidas = r.repetidas || [];
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
    const aj = estado.ajustes || novosAjustes();
    let lista = estado.inscricoes.filter((i) => !aj.removidas.has(chaveDaLinha(i)));
    for (const [chave, nome] of Object.entries(aj.nomes || {})) {
      if (!String(nome || "").trim()) continue;
      const d = (estado.descartadas || []).find((x) => chaveDaLinha(x) === chave);
      if (d && d.base) {
        lista = lista.concat([Object.assign({}, d.base, { nome: nome.trim() })]);
      }
    }
    /* As correções da conferência entram aqui, por cima do que foi lido. A
       planilha do árbitro não é tocada em momento nenhum: se ele recomeçar,
       tudo volta a ser o que estava escrito nela. */
    const tempos = aj.tempos || {}, classes = aj.classes || {};
    return lista.map((i) => {
      const k = chaveDaLinha(i);
      const t = tempos[k], c = classes[B.chaveAtleta(i)];
      if (t === undefined && !c) return i;
      const novo = Object.assign({}, i);
      if (t !== undefined) {
        novo.tempo = t === null ? null : t;
        novo.tempoCorrigido = true;
      }
      if (c) {
        if (c.classe) novo.classe = c.classe;
        if (c.segmento) novo.segmento = c.segmento;
      }
      return novo;
    });
  }

  /* Tempo que não cabe na prova: o revezamento com a marca de um atleta só,
     o ponto que ninguém digitou. Quem decide o que fazer é o árbitro. */
  function conferirTempos() {
    const achados = [];
    for (const p of estado.provas) {
      for (const s of p.series) {
        for (const l of s.linhas) {
          const it = l.item;
          const r = B.tempoSuspeito(it.tempo, p.distancia);
          if (!r) continue;
          achados.push({
            prova: p.numero, titulo: p.titulo, nome: it.nome, equipe: it.equipe,
            serie: s.numero, raia: l.raia, tipo: r.tipo, metros: r.metros,
            piso: r.piso, teto: r.teto, tempo: it.tempo,
            texto: String(it.tempoTexto || "").trim() || B.formatarTempo(it.tempo),
            alternativas: B.alternativasDeTempo(
              String(it.tempoTexto || "").trim() || String(it.tempo), p.distancia),
            item: it,
          });
        }
      }
    }
    return achados;
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
    estado.planas = planas;
    estado.limites = B.conferirLimites(planas, {
      limiteIndividual: p.limiteInd,
      limiteDe: (i) => (ehPara(i.categoria, p) ? p.limiteIndPara : p.limiteInd),
    });
    estado.categorias = B.conferirCategorias(planas);

    estado.mesmoNome = B.conferirMesmoNome(planas);
    estado.classes = B.conferirClasses(planas);
    estado.naipes = B.conferirNaipes(planas);
    estado.parecidos = B.conferirParecidos(planas);
    estado.idades = B.conferirIdades(planas, {});
    estado.nascimentos = B.conferirNascimentos(planas);
    estado.porEquipe = B.conferirPorEquipe(estado.provas, p.limiteEquipe);
    estado.revezamentos = B.conferirRevezamentos(estado.provas, {});
    estado.tempos = conferirTempos();

    /* Marca em vermelho, com o motivo escrito, quem o balizamento não deveria
       aceitar do jeito que está: passou do limite de provas, ou aparece em
       duas categorias de idade ao mesmo tempo.

       Bloco que o árbitro leu e aceitou não pinta nada. Aceitar é dizer que
       aquele caso é à parte, autorizado, e já resolvido fora do app: sair em
       vermelho na piscina depois disso só confunde quem vai ler a folha. */
    const aceito = (id) => estado.ajustes.aceitos.has(id);
    const marcados = new Map();
    const anotar = (a, motivo) => {
      const k = B.normalizar(a.nome) + "|" + B.normalizar(a.equipe);
      marcados.set(k, marcados.has(k) ? marcados.get(k) + "; " + motivo : motivo);
    };
    const decidido = (a) => !!(estado.ajustes.decisoes || {})[B.chaveAtleta(a)];
    if (!aceito("limites")) {
      estado.limites.filter((a) => !decidido(a)).forEach((a) => anotar(a,
        `${a.quantidade} provas, o limite é ${a.limite}`));
    }
    if (!aceito("categorias")) {
      estado.categorias.filter((a) => !decidido(a)).forEach((a) => anotar(a,
        `inscrito em ${a.categorias.join(" e ")}`));
    }
    if (!aceito("naipes")) {
      estado.naipes.filter((a) => !decidido(a))
        .forEach((a) => anotar(a, "inscrito nos dois naipes"));
    }

    /* O vermelho da prova fora do programa some quando o bloco que fala dela
       foi aceito. São dois blocos diferentes: as que têm dona no programa
       estão em "provas que o programa junta", as outras em "fora do
       programa". */
    estado.propostas = D.propostasDePrograma(estado.provas);
    const temDona = new Set(estado.propostas.map((x) => x.origem.chave));
    for (const pr of estado.provas) {
      if (pr.aviso && aceito(temDona.has(pr.chave) ? "juntarPrograma"
                                                   : "foraPrograma")) {
        pr.aviso = "";
      }
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

    /* Provas que ficaram fora do programa mas têm dona lá dentro: o programa
       junta A e B numa linha só, ou escreve PARALÍMPICO onde os inscritos
       escrevem PARAL. Elas saem do bloco vermelho de "fora do programa" e vão
       para um bloco próprio, que mostra o casamento e pergunta antes. */
    const propostas = estado.propostas || [];
    const comDona = new Set(propostas.map((pr) => pr.origem.chave));
    const vaiReceber = new Set(propostas.map((pr) => pr.destino.chave));

    // usa a marca da montagem, não o aviso: o aviso some quando o árbitro
    // aceita o bloco, e mesmo assim a lista tem de continuar aqui
    const provasFora = estado.provas.filter(
      (p) => p.foraDoPrograma && p.series.length && !comDona.has(p.chave));
    const semInscritos = estado.provas.filter(
      (p) => !p.series.length && !vaiReceber.has(p.chave));

    /* Atleta cujas provas o árbitro já escolheu na mão sai dos blocos
       vermelhos. Se o que ele escolheu continua furando a regra, o caso vai
       para a lista das exceções autorizadas, que fica à vista. */
    const jaDecidido = (x) => !!(estado.ajustes.decisoes || {})[B.chaveAtleta(x)];
    const pendentes = (lista) => lista.filter((x) => !jaDecidido(x));
    const autorizados = []
      .concat(estado.categorias.filter(jaDecidido)
        .map((x) => ({ x, oque: "nada " + x.categorias.join(" e ") })))
      .concat(estado.limites.filter(jaDecidido)
        .map((x) => ({ x, oque: `nada ${x.quantidade} provas, o limite é ${x.limite}` })))
      .concat(estado.naipes.filter(jaDecidido)
        .map((x) => ({ x, oque: "nada nos dois naipes" })));
    const descartadas = (estado.descartadas || [])
      .filter((d) => !String((estado.ajustes.nomes || {})[chaveDaLinha(d)] || "").trim());
    const juntaveis = provasQueDaParaJuntar();

    return [
      {
        id: "juntarPrograma",
        titulo: "Provas que o programa junta ou escreve de outro jeito",
        nivel: "critico",
        itens: propostas.map((pr) => ({
          prova: pr.origem.numero, titulo: pr.origem.titulo, nome: "", equipe: "",
          detalhe: `${pr.origem.total} atleta(s), que vão para a ` +
                   `${pr.destino.numero}ª ${pr.destino.titulo}`,
        })),
        explica: `O programa escreve numa linha só o que os inscritos mandaram
          em duas, <i>PARALÍMPICO "A" + "B"</i> no lugar de <i>PARAL A</i> e
          <i>PARAL B</i>, ou escreve a mesma categoria com outra palavra.
          <br><br>Do jeito que está, estas provas saem <b>no fim do
          balizamento, em vermelho</b>, com o aviso de que não constam no
          programa, e as provas do programa saem marcadas como <i>sem
          inscritos</i>. A numeração impressa deixa de bater com a da piscina.
          <br><br>Cada atleta continua com a categoria dele: a letra sai ao lado
          do nome e o limite de provas não muda. Juntar vale só para montar as
          raias, que é o que o programa está mandando fazer.`,
        resolver: () => casarComPrograma(propostas),
      },
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
        nivel: "critico", itens: pendentes(estado.categorias).map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.categorias.join(" e ") + ": " + a.provas.join(" · "),
        })),
        explica: `Categoria é idade: ninguém é mirim e infantil na mesma
          competição. Quando o mesmo nome aparece nas duas, a inscrição foi
          digitada errada em uma delas.
          <br><br>Assim como está, o atleta sai <b>em vermelho no balizamento</b>,
          com o motivo embaixo do nome, e ocupa raia nas duas provas.`,
        resolver: () => escolherProvasDoAtleta(pendentes(estado.categorias),
          null, "categoria"),
      },
      {
        id: "limites", titulo: "Atletas acima do limite de provas",
        nivel: "critico", itens: pendentes(estado.limites).map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: `${a.quantidade} provas, o limite é ${a.limite}: ` +
                   a.provas.join(", "),
        })),
        explica: `O atleta sai <b>em vermelho no balizamento</b>, com o motivo
          embaixo do nome, e ocupa raia em todas as provas em que foi inscrito.
          O app não escolhe por você quais cortar.`,
        resolver: () => escolherProvasDoAtleta(pendentes(estado.limites),
          estado.perfil.limiteInd, "categoria"),
      },
      {
        id: "duplicados", titulo: "Atleta inscrito duas vezes na mesma prova",
        nivel: "critico",
        itens: estado.provas.flatMap((p) => (p.repetidos || []).map((r) => ({
          prova: p.numero, titulo: p.titulo, nome: r.nome, equipe: r.equipe,
          detalhe: r.motivo,
        }))).concat(criticos),
        explica: `O app ficou com a primeira inscrição e <b>tirou a repetida
          das raias</b>: ela não ocupa raia, não aparece na papeleta e não
          conta no limite de provas do atleta.
          <br><br>Confira se as duas linhas eram mesmo da mesma pessoa. Se eram
          duas pessoas de nome parecido, isso só se resolve na planilha,
          escrevendo o nome completo das duas.`,
      },
      {
        id: "tempos", titulo: "Tempos que não podem estar certos",
        nivel: "critico", itens: estado.tempos.map((t) => ({
          prova: t.prova, titulo: t.titulo, nome: t.nome, equipe: t.equipe,
          detalhe: `${t.texto} em ${t.metros}m: ` + (t.tipo === "RAPIDO"
            ? `mais rápido que o recorde mundial, o mínimo possível seria ${B.formatarTempo(t.piso)}`
            : `mais lento que o limite de ${B.formatarTempo(t.teto)}`),
        })),
        explica: `O tempo manda na raia: o mais rápido vai para o centro da
          última série. Um revezamento com a marca de um atleta só, ou um
          ponto que ninguém digitou, jogam o nadador para a raia errada e
          <b>ninguém percebe olhando o balizamento</b>.
          <br><br>O app não troca o tempo por conta própria. Ele mostra o que
          está escrito, o que leu, e a outra leitura possível, quando existe.
          <br><br>Deixando como está, o tempo continua valendo do jeito que
          foi lido.`,
        resolver: () => resolverTempos(estado.tempos),
      },
      {
        id: "naipes", titulo: "Atleta inscrito no feminino e no masculino",
        nivel: "critico", itens: pendentes(estado.naipes).map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.provas.join(" · "),
        })),
        explica: `A mesma pessoa não nada as duas coisas. Uma das inscrições
          foi digitada no naipe errado, ou são dois atletas com o mesmo nome
          na mesma equipe.
          <br><br>Assim como está, ele <b>ocupa raia nas duas provas</b>.`,
        resolver: () => escolherProvasDoAtleta(pendentes(estado.naipes), null, "naipe"),
      },
      {
        id: "classesDivergentes",
        titulo: "Atleta com classe diferente entre as provas",
        nivel: "critico", itens: estado.classes.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.provas.join(" · "),
        })),
        explica: `A classe do atleta é uma só, e ela decide se ele pode nadar
          cada prova. Com duas classes escritas na planilha, o app acredita em
          cada uma na sua prova, e pode <b>cortar o atleta numa e aceitar na
          outra</b>.
          <br><br>Escolha a classe certa e ela vale para todas as provas dele.`,
        resolver: () => resolverClasses(estado.classes),
      },
      {
        id: "nascimentos", titulo: "Atleta com duas datas de nascimento",
        nivel: "critico", itens: estado.nascimentos.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.provas.join(" · "),
        })),
        explica: `A mesma pessoa aparece com anos de nascimento diferentes em
          provas diferentes. Uma das linhas está com a data errada, e é a data
          que diz se ele está na categoria certa.
          <br><br>Isso se resolve na planilha: o app não tem como saber qual
          das duas é a verdadeira.`,
      },
      {
        id: "porEquipe", titulo: "Equipe acima do limite de atletas na prova",
        nivel: "critico", itens: estado.porEquipe.map((a) => ({
          prova: a.prova, titulo: a.titulo, nome: "", equipe: a.equipe,
          detalhe: a.detalhe,
        })),
        explica: `Pelo limite que você marcou na tela da competição, esta
          instituição inscreveu mais atletas nesta prova do que o regulamento
          deixa. Todos <b>continuam ocupando raia</b>.
          <br><br>Quem escolhe quem fica é a instituição, não o app.`,
      },
      {
        id: "regulamento", titulo: "Inscrições contra o regulamento",
        nivel: "critico", itens: cortes.filter((c) => c.gravidade === "critico"),
        explica: `A classe funcional destes atletas não disputa esta prova, pelo
          mapa de provas paralímpico. Eles <b>não ocupam raia</b>: saem numa
          faixa vermelha "NÃO PARTICIPAM DESTA PROVA" abaixo da prova, com o
          motivo escrito.
          <br><br>Se a classe está errada na planilha, corrija e envie de novo.
          Se está certa, a inscrição é que não podia ter sido feita, e o
          balizamento já está tratando disso.`,
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
        id: "semClasse", titulo: "Atletas sem classe definida",
        nivel: "info", itens: cortes.filter((c) => c.gravidade === "info"),
        explica: `A classe destes atletas veio em branco ou ilegível, então o
          app não tem como conferir se eles podem nadar a prova. Eles saem numa
          faixa azul abaixo da prova e <b>não ocupam raia</b>.
          <br><br>Preencha a classe na planilha e envie de novo. Sem ela o app
          prefere não colocar o atleta numa raia por engano.`,
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
          impresso já está na mão de todo mundo.
          <br><br>Não há o que consertar: é assim que tem de sair.`,
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
        id: "juntadas", titulo: "Categorias que o programa mandou juntar",
        nivel: "info",
        itens: estado.provas.filter((p) => (p.casadas || []).length).map((p) => ({
          prova: p.numero, titulo: p.titulo, nome: "", equipe: "",
          detalhe: "recebeu " + p.casadas.map((c) =>
            `${c.categoria} (${c.quantos})`).join(" e "),
        })),
        explica: `O nome destas provas no programa traz um <b>+</b>, e é isso
          que diz que as categorias nadam juntas. Os inscritos vieram
          separados, e o app já os colocou na prova certa.
          <br><br>A letra tem de ser a mesma, sempre: A nunca vira B. O que
          ele releva é a palavra abreviada, <i>PARAL</i> por <i>PARALÍMPICO</i>.
          <br><br>Se quiser conferir um por um em vez disso, volte ao passo 1 e
          diga que prefere conferir.`,
      },
      {
        id: "autorizados", titulo: "Exceções que você autorizou",
        nivel: "info", itens: autorizados.map(({ x, oque }) => ({
          prova: "", titulo: "", nome: x.nome, equipe: x.equipe,
          detalhe: oque + ", e você escolheu as provas dele na mão",
        })),
        explica: `Você abriu o caso, marcou as provas que estes atletas nadam
          e aplicou. O que ficou continua fora do previsto pelo regulamento, e
          está assim porque <b>você decidiu</b>.
          <br><br>Eles <b>não saem em vermelho</b> no balizamento nem nas
          papeletas, e não travam mais a geração.
          <br><br>Se foi engano, dá para voltar a apontar o caso.`,
        resolver: () => desfazerAutorizacoes(autorizados),
      },
      {
        id: "idades", titulo: "Idade que não bate com a categoria",
        nivel: "info", itens: estado.idades.map((a) => ({
          prova: "", titulo: a.categoria, nome: a.nome, equipe: a.equipe,
          detalhe: `nasceu em ${a.ano}; nesta categoria a maioria é de ${a.faixa}`,
        })),
        explica: `O app não tem o regulamento da competição, então ele não sabe
          de cor que ano nasce quem é mirim. O que ele faz é olhar a própria
          planilha: se numa categoria quase todo mundo nasceu em dois anos
          seguidos, quem está três anos fora chama atenção.
          <br><br>Pode ser inscrição na categoria errada, pode ser data digitada
          errada, e pode ser que o regulamento permita mesmo. <b>O balizamento
          sai normalmente</b>: isto é só para você olhar.`,
      },
      {
        id: "mesmoNome", titulo: "Mesmo nome em duas instituições",
        nivel: "info", itens: estado.mesmoNome.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.provas.join(" · "),
        })),
        explica: `Pode ser xará, e aí não há nada a fazer. Se for a mesma
          pessoa inscrita por duas instituições, saiba que <b>o limite de
          provas não a alcança</b>: o app conta as provas por nome mais
          instituição, então ela conta como duas pessoas.`,
      },
      {
        id: "parecidos", titulo: "Nomes quase iguais, pode ser a mesma pessoa",
        nivel: "info", itens: estado.parecidos.map((a) => ({
          prova: "", titulo: "", nome: a.nome, equipe: a.equipe,
          detalhe: a.motivo + ": " + a.provas.join(" · "),
        })),
        explica: `Duas escritas parecidas do mesmo nome, ou da mesma
          instituição. Se forem a mesma pessoa, ela conta como duas: <b>o
          limite de provas não vale</b> e a inscrição repetida não é vista.
          <br><br>Isso se conserta na planilha, escrevendo o nome do mesmo
          jeito nas duas linhas.`,
      },
      {
        id: "revezamentoAviso",
        titulo: "Duas equipes da mesma instituição no revezamento",
        nivel: "info",
        itens: estado.revezamentos.map((r) => ({
          prova: r.prova, titulo: r.titulo, nome: r.nome,
          equipe: r.equipe, detalhe: r.detalhe })),
        explica: `Cada uma ocupa a sua raia, o que é normal em muita
          competição. <b>O balizamento sai como está.</b>
          <br><br>O único cuidado é o nome: as duas saem escritas igual, no
          balizamento e na papeleta, e ninguém distingue uma da outra na borda
          da piscina. Vale escrever <i>ESCOLA X A</i> e <i>ESCOLA X B</i> na
          planilha.`,
      },
      {
        id: "provasRepetidas", titulo: "Prova escrita duas vezes na planilha",
        nivel: "info", itens: (estado.provasRepetidas || []).map((r) => ({
          prova: "", titulo: r.prova, nome: "", equipe: "",
          detalhe: `cabeçalho na linha ${r.linha}, já tinha aparecido na ${r.antes}`,
        })),
        explica: `O mesmo cabeçalho de prova apareceu duas vezes. Os dois
          blocos <b>foram juntados numa prova só</b>, o que costuma ser o
          desejado quando a lista foi montada aos pedaços.
          <br><br>Se um dos dois era para ser outra prova, e ficou o cabeçalho
          copiado sem trocar, corrija na planilha e envie de novo.`,
      },
      {
        id: "numeracaoPrograma",
        titulo: "Numeração da planilha do programa não bate com a ordem",
        nivel: "info", itens: numeracaoTrocada(),
        explica: `A coluna <b>Nº</b> do programa diz um número e a posição da
          linha diz outro. Quem manda no balizamento é <b>a ordem das
          linhas</b>, então é este número que vai sair impresso.
          <br><br>Quase sempre é prova que faltou ou que sobrou no meio do
          programa. Confira contra o programa oficial antes de gerar.`,
      },
      {
        id: "avisosClasse", titulo: "Classes deduzidas ou que não entendi",
        nivel: "info", itens: avisosDeClasse(),
        explica: `Onde a classe veio abreviada, ou faltando o SB e o SM, o app
          deduziu pelo segmento e seguiu. Onde ela veio ilegível, ele diz o que
          estava escrito.
          <br><br>Nada aqui impede o balizamento: é o registro do que ele
          entendeu, para você conferir se deduziu certo.`,
      },
      {
        id: "raias", titulo: "Avisos de organização das raias",
        nivel: "info", itens: avisos,
        explica: `Séries com menos gente que o mínimo dentro de uma prova
          grande, ou raias fora do padrão de preenchimento. O balizamento sai
          assim mesmo: é só para você conferir.
          <br><br>Não há o que consertar: é como a divisão em séries ficou.`,
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

    // resolvido é o que sumiu sozinho; aceito é o que o árbitro leu e decidiu
    // deixar como está. Os dois fecham; só os abertos travam a geração.
    const resolvidas = secoes.filter((s) =>
      estado.ajustes.jaVistos.has(s.id) && !s.itens.length);
    const aceitas = comItens.filter((s) => estado.ajustes.aceitos.has(s.id));
    const abertas = comItens.filter((s) => !estado.ajustes.aceitos.has(s.id));
    const pendentesCriticas = abertas.filter((s) => s.nivel === "critico");

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
        para liberar a geração. Onde há conserto possível aparece o botão
        <b>resolver</b>; onde não há, <b>o que acontece</b> explica o caso e
        oferece seguir assim mesmo ou enviar a planilha corrigida.</p>` : ""}
      ${abertas.map(secaoHtml).join("")}
      ${resolvidas.map((s) => secaoFechadaHtml(s, "resolvido")).join("")}
      ${aceitas.map((s) => secaoFechadaHtml(s, "seguindo assim")).join("")}
      ${!comItens.length && !resolvidas.length
        ? '<p class="ok-vazio">Nenhum problema encontrado. O balizamento está pronto para gerar.</p>'
        : ""}`;

    ligarSecoes(abertas, resolvidas.concat(aceitas));
    const botao = $("#irGerar");
    if (botao) {
      botao.disabled = pendentesCriticas.length > 0;
      botao.textContent = pendentesCriticas.length
        ? `Faltam ${pendentesCriticas.length} bloco(s) vermelho(s)`
        : "Gerar os arquivos";
    }
    liberar("gerar", !pendentesCriticas.length);
  }

  /* Um bloco fechado, verde, de uma linha só. É o que sobra depois que o
     problema foi resolvido ou depois que o árbitro leu e decidiu seguir: a
     lista inteira sumir de vez esconderia o que aconteceu, e continuar
     mostrando tudo aberto polui a tela de coisa já tratada. */
  function secaoFechadaHtml(s, motivo) {
    return `<section class="bloco resolvido" data-fechada="${s.id}">
      <h3>${s.titulo}
        <span class="contador">${motivo}</span>
        <span class="botoes-bloco">
          <button type="button" class="info" data-reabrir="${s.id}">ver de novo</button>
        </span></h3>
      <div class="itens-fechados" id="reaberto-${s.id}" hidden></div>
    </section>`;
  }

  function secaoHtml(s) {
    const temConserto = typeof s.resolver === "function";
    return `<section class="bloco ${s.nivel}" data-secao="${s.id}">
      <h3>${s.titulo} <span class="contador">${s.itens.length}</span>
        <span class="botoes-bloco">
          ${temConserto
            ? `<button type="button" class="resolver" data-resolver="${s.id}">resolver</button>`
            : ""}
          <button type="button" class="info" data-info="${s.id}">o que acontece</button>
        </span></h3>
      <div class="explicacao" id="explica-${s.id}" hidden>
        <p>${s.explica}</p>
        <div class="acoes" id="saidas-${s.id}"></div>
      </div>
      ${temConserto ? `<div class="explicacao correcao" id="corrige-${s.id}" hidden></div>` : ""}
      ${tabelaDeItens(s.itens)}</section>`;
  }

  function tabelaDeItens(itens) {
    return `<table class="tabela"><thead><tr><th>PROVA</th><th>ATLETA</th>
      <th>EQUIPE</th><th>DETALHE</th></tr></thead><tbody>${
      itens.map((e) => `<tr>
        <td>${e.prova ? e.prova + "ª " + (e.titulo || "") : (e.titulo || "")}</td>
        <td>${CX(e.nome || "")}</td>
        <td class="apagado">${CX(e.equipe || "")}</td>
        <td>${e.detalhe || ""}</td></tr>`).join("")}</tbody></table>`;
  }

  function ligarSecoes(abertas, fechadas) {
    for (const s of fechadas) {
      const b = $(`[data-reabrir="${s.id}"]`);
      const alvo = $("#reaberto-" + s.id);
      if (!b || !alvo) continue;
      b.onclick = () => {
        const abrindo = alvo.hidden;
        alvo.hidden = !abrindo;
        b.textContent = abrindo ? "esconder" : "ver de novo";
        if (!abrindo) return;
        alvo.innerHTML = tabelaDeItens(s.itens) +
          '<div class="acoes"></div>';
        const acoes = $(".acoes", alvo);
        acoes.innerHTML = `<button type="button" class="mini claro">
          voltar a marcar como pendente</button>`;
        $("button", acoes).onclick = () => {
          estado.ajustes.aceitos.delete(s.id);
          montar();
          renderConferencia();
          aviso("Bloco voltou para pendente e volta a sair em vermelho.");
        };
      };
    }

    for (const s of abertas) {
      const bInfo = $(`[data-info="${s.id}"]`);
      const pInfo = $("#explica-" + s.id);
      if (bInfo && pInfo) {
        bInfo.onclick = () => {
          const abrindo = pInfo.hidden;
          pInfo.hidden = !abrindo;
          bInfo.textContent = abrindo ? "fechar" : "o que acontece";
          if (abrindo) preencherSaidas(s);
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
        pFix.appendChild(s.resolver());
      };
    }
  }

  /* As duas saídas que valem para qualquer bloco: seguir do jeito que está,
     ou mandar a planilha corrigida e recomeçar a leitura. */
  function preencherSaidas(s) {
    const alvo = $("#saidas-" + s.id);
    if (!alvo || alvo.dataset.pronto) return;
    alvo.dataset.pronto = "1";
    if (s.nivel === "critico") {
      const seguir = document.createElement("button");
      seguir.type = "button";
      seguir.className = "botao claro";
      seguir.textContent = "li e vou seguir assim mesmo";
      seguir.onclick = () => {
        estado.ajustes.aceitos.add(s.id);
        // remonta: bloco aceito também deixa de sair em vermelho nos arquivos
        montar();
        renderConferencia();
        aviso("Anotado. Este bloco não trava a geração nem sai em vermelho.");
      };
      alvo.appendChild(seguir);
    }
    const outra = document.createElement("button");
    outra.type = "button";
    outra.className = "mini claro";
    outra.textContent = "enviar a planilha corrigida";
    outra.onclick = () => {
      irPara("inscritos");
      mostrarPainel("envio");
      aviso("Envie a planilha corrigida; a leitura começa de novo.");
    };
    alvo.appendChild(outra);
  }

  /* Todo bloco pode ser encerrado por decisão do árbitro. É o que destranca a
     geração quando o problema não tem conserto dentro do app. */
  /* --- resolver: tirar do balizamento a prova que não está no programa --- */
  /* As categorias que o próprio programa manda juntar: as que trazem "+" no
     nome. É daqui que sai a pergunta do passo 1 e o que o app faz sozinho ao
     montar, sem esperar o árbitro descobrir a tela dos agrupamentos. */
  function juncoesDoPrograma(provas) {
    const mapa = new Map();
    (provas || []).forEach((p, i) => {
      const partes = D.partesDaCategoria(p.categoria);
      if (partes.length < 2) return;
      const k = D.chaveCategoria(p.categoria);
      if (!mapa.has(k)) {
        mapa.set(k, { categoria: p.rotulo || p.categoria, partes,
                      provas: [], distancias: [] });
      }
      const v = mapa.get(k);
      v.provas.push(i + 1);
      if (!v.distancias.includes(p.distancia)) v.distancias.push(p.distancia);
    });
    return [...mapa.values()];
  }

  /* A coluna Nº do programa contra a posição da linha. Quem manda é a ordem
     das linhas; este bloco existe para o árbitro conferir contra o programa
     oficial impresso, onde uma prova a menos desloca todas as seguintes. */
  function numeracaoTrocada() {
    const prog = (estado.perfil.programa || []);
    const saida = [];
    prog.forEach((p, i) => {
      if (p.numero == null || p.numero === i + 1) return;
      saida.push({
        prova: i + 1,
        titulo: D.tituloProva(p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe),
        nome: "", equipe: "",
        detalhe: `a planilha do programa chama esta prova de ${p.numero}ª`,
      });
    });
    return saida;
  }

  /* O que o leitor de classe deduziu ou não entendeu. Ficava só na memória. */
  function avisosDeClasse() {
    const saida = [];
    const põe = (p, it) => {
      const d = it.diagnostico;
      if (!d || !d.avisos || !d.avisos.length) return;
      saida.push({
        prova: p.numero, titulo: p.titulo, nome: it.nome, equipe: it.equipe,
        detalhe: `"${it.classe || ""}": ` + d.avisos.join("; "),
      });
    };
    for (const p of estado.provas) {
      for (const s of p.series) for (const l of s.linhas) põe(p, l.item);
      for (const c of (p.cortados || [])) põe(p, c);
    }
    return saida;
  }

  /* --- resolver: voltar a apontar um caso que você autorizou --- */
  function desfazerAutorizacoes(autorizados) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    for (const { x, oque } of autorizados) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(x.nome)}</b>
          <span class="apagado">${CX(x.equipe)}</span></p>
        <p class="nota">${oque}.</p>`;
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao claro">
        Voltar a apontar este caso</button>`;
      $("button", acoes).onclick = () => {
        delete estado.ajustes.decisoes[B.chaveAtleta(x)];
        montar();
        renderConferencia();
        aviso(`${CX(x.nome)} voltou para os blocos vermelhos.`);
      };
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

  /* --- resolver: o tempo que não cabe na prova ---
     Três saídas, e nenhuma delas é o app escolher sozinho: ler de outro
     jeito, quando existe outra leitura possível; tirar o tempo, e aí o
     atleta vai para as primeiras séries junto com quem não tem tempo; ou
     deixar como está. --- */
  function resolverTempos(lista) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    for (const t of lista) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      const limite = t.tipo === "RAPIDO"
        ? `o mais rápido possível em ${t.metros}m é ${B.formatarTempo(t.piso)}`
        : `o mais lento que faz sentido em ${t.metros}m é ${B.formatarTempo(t.teto)}`;
      // em revezamento o nome da linha é a própria equipe: não repete
      const quem = B.normalizar(t.nome) === B.normalizar(t.equipe)
        ? "" : CX(t.equipe) + " · ";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(t.nome)}</b>
          <span class="apagado">${quem}${t.prova}ª ${t.titulo}</span></p>
        <p class="nota mono">na planilha&nbsp;&nbsp;${t.texto}</p>
        <p class="nota mono">o app leu &nbsp;&nbsp;${B.formatarTempo(t.tempo)}</p>
        <p class="nota">${limite}. Hoje ele está na
          <b>${t.serie}ª série, raia ${t.raia}</b>.</p>`;
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      for (const alt of t.alternativas) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "botao";
        b.textContent = `Ler como ${B.formatarTempo(alt.segundos)}`;
        b.title = alt.como;
        b.onclick = () => aplicarTempo(t, alt.segundos,
          `${CX(t.nome)} agora está com ${B.formatarTempo(alt.segundos)}.`);
        acoes.appendChild(b);
      }
      const semTempo = document.createElement("button");
      semTempo.type = "button";
      semTempo.className = "botao claro";
      semTempo.textContent = "Deixar sem tempo";
      semTempo.onclick = () => aplicarTempo(t, null,
        `${CX(t.nome)} ficou sem tempo e vai para as primeiras séries.`);
      acoes.appendChild(semTempo);
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

  function aplicarTempo(t, segundos, texto) {
    estado.ajustes.tempos[chaveDaLinha(t.item)] = segundos;
    montar();
    renderConferencia();
    aviso(texto);
  }

  /* --- resolver: a classe que vale para todas as provas do atleta --- */
  function resolverClasses(lista) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";
    for (const a of lista) {
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      const rotulo = a.campo === "classe" ? "classe" : "segmento";
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(a.nome)}</b>
          <span class="apagado">${CX(a.equipe)}</span></p>
        <p class="nota">Qual ${rotulo} vale para todas as provas dele?</p>
        <div class="provas-do-atleta"></div>`;
      const onde = $(".provas-do-atleta", bloco);
      const nomeGrupo = "cl" + Math.random().toString(36).slice(2);
      a.valores.forEach((v, k) => {
        const rot = document.createElement("label");
        rot.className = "marcavel";
        rot.innerHTML = `<input type="radio" name="${nomeGrupo}">
          <span><b>${CX(v)}</b>
          <span class="apagado">${(a.provasPorValor || a.provas)[k] || ""}</span></span>`;
        onde.appendChild(rot);
      });
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao">
        Aplicar em todas as provas dele</button>`;
      $("button", acoes).onclick = () => {
        const marcados = $$("input", onde);
        const k = marcados.findIndex((x) => x.checked);
        if (k < 0) { aviso(`Escolha a ${rotulo} certa antes de aplicar.`); return; }
        const chave = B.normalizar(a.nome) + "|" + B.normalizar(a.equipe);
        const antes = estado.ajustes.classes[chave] || {};
        antes[a.campo] = a.valores[k];
        estado.ajustes.classes[chave] = antes;
        montar();
        renderConferencia();
        aviso(`${CX(a.nome)} agora é ${CX(a.valores[k])} em todas as provas.`);
      };
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

  /* --- resolver: casar as provas com as do programa ---
     O palpite fica todo à vista antes de virar decisão: de um lado o que o
     programa escreveu, do outro o que veio nos inscritos, com a conta de
     atletas de cada um. O casamento vira linha de "categorias que nadam
     juntas" na tela da competição, onde dá para conferir e desfazer. --- */
  function casarComPrograma(propostas) {
    const caixa = document.createElement("div");
    caixa.className = "correcao-lista";

    const aplicar = (lista, texto) => {
      for (const g of D.gruposDePropostas(lista)) {
        const igual = estado.perfil.grupos.find((x) =>
          D.chaveCategoria(x.rotulo) === D.chaveCategoria(g.rotulo) &&
          (x.distancias || []).join() === g.distancias.join());
        if (!igual) { estado.perfil.grupos.push(g); continue; }
        // mesma prova de destino já casada antes: só acrescenta o que falta
        igual.categorias = igual.categorias || [];
        igual.estilos = igual.estilos || [];
        for (const c of g.categorias)
          if (!igual.categorias.includes(c)) igual.categorias.push(c);
        for (const e of g.estilos)
          if (!igual.estilos.includes(e)) igual.estilos.push(e);
      }
      renderGrupos();
      montar();
      renderConferencia();
      aviso(texto);
    };

    const porDestino = new Map();
    for (const pr of propostas) {
      if (!porDestino.has(pr.destino.chave)) porDestino.set(pr.destino.chave, []);
      porDestino.get(pr.destino.chave).push(pr);
    }

    if (porDestino.size > 1) {
      const topo = document.createElement("div");
      topo.className = "acoes";
      topo.innerHTML = `<button type="button" class="botao">
        Juntar as ${propostas.length} provas de uma vez</button>`;
      $("button", topo).onclick = () => aplicar(propostas,
        `${propostas.length} provas foram para o lugar delas no programa.`);
      caixa.appendChild(topo);
    }

    for (const [, lista] of porDestino) {
      const destino = lista[0].destino;
      const total = lista.reduce((t, pr) => t + pr.origem.total, 0);
      const bloco = document.createElement("div");
      bloco.className = "correcao-atleta";
      const origens = lista.map((pr) =>
        `${pr.origem.categoria}, ${pr.origem.total} atleta(s)`).join("  ·  ");
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${destino.numero}ª ${destino.titulo}</b>
          <span class="apagado">ficaria com ${total} atleta(s)</span></p>
        <p class="nota mono">no programa &nbsp;&nbsp;${destino.categoria}</p>
        <p class="nota mono">nos inscritos&nbsp;&nbsp;${origens}</p>`;
      const acoes = document.createElement("div");
      acoes.className = "acoes";
      acoes.innerHTML = `<button type="button" class="botao">
        Juntar nesta prova</button>`;
      $("button", acoes).onclick = () => aplicar(lista,
        `${destino.numero}ª ${destino.titulo} agora tem ${total} atleta(s).`);
      bloco.appendChild(acoes);
      caixa.appendChild(bloco);
    }
    return caixa;
  }

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
  function escolherProvasDoAtleta(achados, limite, fecharPor) {
    // fecharPor: "categoria" ou "naipe". Marcar a primeira prova fecha o
    // resto: ninguém nada mirim e infantil, nem feminino e masculino.
    const fecho = (i) => fecharPor === "naipe" ? (i.naipe || "")
      : fecharPor === "categoria" ? D.chaveCategoria(i.categoria) : null;
    const nomeDoFecho = fecharPor === "naipe" ? "naipe" : "categoria";
    const doMesmo = fecharPor === "naipe" ? "do mesmo naipe" : "da mesma categoria";
    const maisDeUm = fecharPor === "naipe" ? "mais de um naipe"
                                           : "mais de uma categoria";
    const rotuloFecho = (i) => fecharPor === "naipe"
      ? (NAIPE_LONGO[i.naipe] || i.naipe || "") : CX(i.categoria || "");
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
      /* Nada aqui fica travado. O limite e a categoria única são o que o
         regulamento costuma dizer, e o app diz quando você passa deles, mas
         quem conhece a competição é você: pode marcar todas se for o caso. */
      bloco.innerHTML = `
        <p class="correcao-titulo"><b>${CX(a.nome)}</b>
          <span class="apagado">${CX(a.equipe)}</span></p>
        <p class="nota">Marque as provas que ele vai nadar de verdade.
          O previsto é até <b>${teto}</b>${fecharPor
            ? `, todas <b>${doMesmo}</b>` : ""}, mas a escolha
          é sua: dá para marcar todas.</p>
        <div class="provas-do-atleta"></div>
        <p class="nota contagem"></p>
        <p class="acoes-marcar">
          <button type="button" class="link" data-todas>marcar todas</button>
          <button type="button" class="link" data-nenhuma>limpar</button>
        </p>`;
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
        const fechos = new Set([...escolhidas].map(fecho));
        minhas.forEach((i, k) => {
          $("input", rotulos[k]).checked = escolhidas.has(i);
        });
        const alvo = $(".contagem", bloco);
        const partes = [];
        if (!escolhidas.size) partes.push("nenhuma marcada ainda");
        else partes.push(`${escolhidas.size} de ${minhas.length} marcadas`);
        // avisa, não impede
        if (escolhidas.size > teto)
          partes.push(`acima do previsto, que é ${teto}`);
        if (fecharPor && fechos.size > 1) partes.push("de " + maisDeUm);
        else if (fecharPor && fechos.size === 1)
          partes.push(`${nomeDoFecho} ${rotuloFecho([...escolhidas][0])}`);
        alvo.textContent = partes.join(", ");
        alvo.classList.toggle("alerta-inline",
          !escolhidas.size || escolhidas.size > teto ||
          (fecharPor && fechos.size > 1));
      };

      minhas.forEach((i, k) => {
        $("input", rotulos[k]).onchange = (ev) => {
          if (ev.target.checked) escolhidas.add(i);
          else escolhidas.delete(i);
          atualizar();
        };
      });
      $("[data-todas]", bloco).onclick = () => {
        minhas.forEach((i) => escolhidas.add(i));
        atualizar();
      };
      $("[data-nenhuma]", bloco).onclick = () => {
        escolhidas.clear();
        atualizar();
      };
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
        /* Escolher as provas na mão é decisão tomada, mesmo quando você marca
           todas e nada é removido. Se o que sobrou continua acima do limite ou
           em duas categorias, é exceção que você autorizou: o caso sai dos
           blocos vermelhos, entra na lista das exceções e não sai marcado
           em vermelho no balizamento. */
        estado.ajustes.decisoes[B.chaveAtleta(a)] = {
          nome: a.nome, equipe: a.equipe, quantas: escolhidas.size,
        };
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

  /* --- prévia dos documentos ---
     O PDF vai para um iframe pelo próprio visualizador do navegador, e a
     planilha vira uma tabela HTML. Nenhum dos dois precisa de biblioteca
     nova, então a prévia funciona igual com o arquivo aberto por duplo
     clique, sem internet. */
  function montarSaida(qual) {
    montar();
    if (qual === "xlsx") {
      const wb = S.gerarXlsx(estado.provas, estado.perfil,
                             { erros: estado.erros, limites: estado.limites });
      return { tipo: "planilha", wb };
    }
    if (qual === "pdf") {
      return { tipo: "pdf", doc: S.gerarPdfBalizamento(estado.provas, estado.perfil),
               nome: baseNome() + " - BALIZAMENTO.pdf" };
    }
    const { doc } = S.gerarPapeletas(estado.provas, estado.perfil);
    return { tipo: "pdf", doc, nome: baseNome() + " - PAPELETAS.pdf" };
  }

  const ROTULO_SAIDA = {
    xlsx: "Planilha do balizamento",
    pdf: "PDF do balizamento",
    papeletas: "Papeletas de raia",
  };

  function verPrevia(qual) {
    const alvo = $("#previa");
    if (!alvo) return;
    if (alvo.dataset.qual === qual && !alvo.hidden) {
      alvo.hidden = true;
      alvo.dataset.qual = "";
      marcarPrevia(null);
      return;
    }
    alvo.dataset.qual = qual;
    alvo.hidden = false;
    marcarPrevia(qual);
    alvo.innerHTML = `<div class="previa-topo">
      <b>Prévia: ${ROTULO_SAIDA[qual]}</b>
      <span class="apagado">é exatamente o que vai no arquivo</span>
      <button type="button" class="mini claro" id="fecharPrevia">fechar</button>
    </div><div class="previa-corpo"><p class="nota">Montando...</p></div>`;
    ao("fecharPrevia", "click", () => {
      alvo.hidden = true; alvo.dataset.qual = ""; marcarPrevia(null);
    });

    // deixa o navegador pintar o "montando" antes de travar no gerador
    setTimeout(() => {
      const corpo = $(".previa-corpo", alvo);
      try {
        const saida = montarSaida(qual);
        if (saida.tipo === "pdf") {
          // blob, e não data:. O Chrome recusa PDF em data: dentro de iframe,
          // e um PDF de 100 KB viraria um atributo src gigante na página.
          if (estado.urlPrevia) URL.revokeObjectURL(estado.urlPrevia);
          estado.urlPrevia = URL.createObjectURL(saida.doc.output("blob"));
          corpo.innerHTML = `<iframe title="prévia do ${ROTULO_SAIDA[qual]}"
            src="${estado.urlPrevia}"></iframe>`;
        } else {
          const aba = saida.wb.SheetNames[0];
          corpo.innerHTML = `<div class="scroll-x">${
            XLSX.utils.sheet_to_html(saida.wb.Sheets[aba], { id: "previaPlanilha" })
          }</div><p class="nota">Aba <b>${aba}</b>. O arquivo baixado traz
            também ${saida.wb.SheetNames.slice(1).join(", ")}.</p>`;
        }
      } catch (e) {
        corpo.innerHTML = `<p class="alerta">Não consegui montar a prévia:
          ${(e && e.message) || e}</p>`;
      }
      mostrarResultado("previa");
    }, 30);
  }

  function marcarPrevia(qual) {
    $$("[data-previa]").forEach((b) => {
      const ativo = b.dataset.previa === qual;
      b.classList.toggle("ativo", ativo);
      b.textContent = ativo ? "fechar prévia" : "Ver prévia";
    });
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
    ao("btnEntendi", "click", () => mostrarPainel("envio"));
    ao("btnEntendi2", "click", () => mostrarPainel("envio"));
    // o explicativo longo abre só para quem tem dúvida
    ao("btnDuvidas", "click", () => {
      const alvo = $("#detalheFormato");
      const botao = $("#btnDuvidas");
      alvo.hidden = !alvo.hidden;
      botao.textContent = alvo.hidden
        ? "Tem dúvida de como o arquivo deve ser?"
        : "fechar a explicação";
      if (!alvo.hidden) alvo.scrollIntoView({ block: "nearest" });
    });
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

    $$("[data-previa]").forEach((b) =>
      (b.onclick = () => verPrevia(b.dataset.previa)));
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
