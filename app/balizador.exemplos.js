/* =====================================================================
   BALIZADOR: competições de exemplo, prontas para baixar

   Quatro competições inventadas, cada uma com o seu programa de provas e a
   sua planilha de inscritos, batendo uma com a outra. Servem para ver o app
   funcionando de ponta a ponta sem precisar montar nada.

   Os nomes, escolas e cidades são inventados. Os números são gerados por um
   sorteio de semente fixa: a mesma competição baixada duas vezes sai igual,
   o que importa quando alguém compara dois arquivos.
   ===================================================================== */
(function (raiz) {
  "use strict";

  /* Sorteio determinístico (xorshift de 32 bits). Semente fixa por
     competição, então o exemplo é sempre o mesmo. */
  function sorteio(semente) {
    let x = semente >>> 0 || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  const NOMES_F = [
    "MARIA EDUARDA", "ANA CLARA", "JULIA", "SOFIA", "HELENA", "VALENTINA",
    "LAURA", "ISABELA", "MANUELA", "BEATRIZ", "LARA", "CECILIA", "GIOVANNA",
    "ALICE", "CATARINA", "ELOA", "ANTONELLA", "REBECA", "MARINA", "BIANCA",
    "AMANDA", "CAROLINA", "LIVIA", "NICOLE", "STELLA", "YASMIN", "AGATHA",
  ];
  const NOMES_M = [
    "MIGUEL", "ARTHUR", "GAEL", "THEO", "HEITOR", "RAVI", "DAVI", "BERNARDO",
    "GABRIEL", "SAMUEL", "PEDRO", "LORENZO", "MATEUS", "BENICIO", "ISAAC",
    "ENZO", "NICOLAS", "GUSTAVO", "MURILO", "VINICIUS", "CAIO", "FELIPE",
    "RAFAEL", "LUCAS", "OTAVIO", "ANTONIO", "JOAQUIM",
  ];
  const SOBRENOMES = [
    "SOUZA MARTINS", "OLIVEIRA LIMA", "PEREIRA DA COSTA", "SANTOS ANDRADE",
    "RODRIGUES ALVES", "FERREIRA GOMES", "CARVALHO PINTO", "ALMEIDA ROCHA",
    "BARBOSA NUNES", "TEIXEIRA MORAES", "CARDOSO VIEIRA", "MENDES FARIAS",
    "AZEVEDO RAMOS", "SCHNEIDER KREMER", "BITTENCOURT LUZ", "AMARAL PRATES",
    "FIGUEIREDO SALES", "MACHADO BRANDAO", "SIQUEIRA TAVARES", "DUARTE MELO",
  ];

  function fabricaDeNomes(rnd) {
    const usados = new Set();
    return function (naipe) {
      const pilha = naipe === "FEM" ? NOMES_F : NOMES_M;
      for (let tentativa = 0; tentativa < 200; tentativa++) {
        const nome = pilha[Math.floor(rnd() * pilha.length)] + " " +
                     SOBRENOMES[Math.floor(rnd() * SOBRENOMES.length)];
        if (!usados.has(nome)) { usados.add(nome); return nome; }
      }
      return "ATLETA " + (usados.size + 1);
    };
  }

  // "31.20", "1:02.35": tempo plausível para a distância e o estilo
  function tempoPlausivel(rnd, distancia, estilo) {
    const metros = parseInt(String(distancia).replace(/^\d+X/, "")
                                             .replace(/M$/, ""), 10) || 50;
    const porCem = { LIVRE: 62, COSTAS: 72, PEITO: 80, BORBOLETA: 68, MEDLEY: 76 };
    const base = (porCem[estilo] || 70) * metros / 100;
    const seg = base * (0.88 + rnd() * 0.45);
    const min = Math.floor(seg / 60);
    const resto = seg - min * 60;
    const txt = resto.toFixed(2).padStart(5, "0");
    return min ? min + ":" + txt : txt;
  }

  /* ---------------- as quatro competições ---------------- */

  const COMPETICOES = {
    PARA: {
      nome: "PARAJASC 2026, NATAÇÃO",
      arquivo: "PARADESPORTIVA",
      descricao: "Paradesportiva, com segmento e classe funcional",
      semente: 20260901,
      temTempo: false,
      colunas: ["EQUIPE", "SEGMENTO", "CLASSE"],
      equipes: ["BLUMENAU", "JOINVILLE", "CRICIÚMA", "ITAJAÍ", "CHAPECÓ",
                "FLORIANÓPOLIS", "LAGES", "JARAGUÁ DO SUL"],
      // [distância, estilo, categoria, naipe, etapa]
      programa: [
        ["50m", "LIVRE", "DF", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "DF", "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "DA", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "DA", "MASCULINO", "1ª ETAPA"],
        ["100m", "LIVRE", "DF", "FEMININO", "1ª ETAPA"],
        ["100m", "LIVRE", "DF", "MASCULINO", "1ª ETAPA"],
        ["100m", "LIVRE", "DV", "FEMININO", "1ª ETAPA"],
        ["100m", "LIVRE", "DV", "MASCULINO", "1ª ETAPA"],
        ["100m", "LIVRE", "DI", "FEMININO", "2ª ETAPA"],
        ["100m", "LIVRE", "DI", "MASCULINO", "2ª ETAPA"],
        ["50m", "COSTAS", "DF", "FEMININO", "2ª ETAPA"],
        ["50m", "COSTAS", "DF", "MASCULINO", "2ª ETAPA"],
        ["100m", "COSTAS", "DV", "FEMININO", "2ª ETAPA"],
        ["100m", "COSTAS", "DV", "MASCULINO", "2ª ETAPA"],
        ["100m", "PEITO", "DF", "FEMININO", "3ª ETAPA"],
        ["100m", "PEITO", "DF", "MASCULINO", "3ª ETAPA"],
        ["100m", "PEITO", "DI", "FEMININO", "3ª ETAPA"],
        ["100m", "PEITO", "DI", "MASCULINO", "3ª ETAPA"],
        ["50m", "BORBOLETA", "DF", "FEMININO", "3ª ETAPA"],
        ["50m", "BORBOLETA", "DF", "MASCULINO", "3ª ETAPA"],
        ["200m", "MEDLEY", "DF", "FEMININO", "3ª ETAPA"],
        ["200m", "MEDLEY", "DF", "MASCULINO", "3ª ETAPA"],
      ],
      // as classes saem do próprio mapa de provas paralímpico, para a
      // inscrição fazer sentido. Duas por competição saem erradas de
      // propósito: é assim que dá para ver o app cortando quem não pode nadar.
      classePeloRegulamento: true,
      errosPlantados: 2,
      porProva: [4, 11],
    },

    ESCOLAR: {
      nome: "JEPB 2026, NATAÇÃO ESCOLAR",
      arquivo: "ESCOLAR SEM TEMPO",
      descricao: "Escolar por categoria, sem tempo, com revezamento",
      semente: 19870412,
      temTempo: false,
      colunas: ["EQUIPE"],
      equipes: ["COLÉGIO AURORA", "ESCOLA MODELO", "GRÊMIO PONTAL",
                "INSTITUTO COREE", "COLÉGIO SÃO JORGE", "ESCOLA DO PARQUE",
                "CENTRO EDUCACIONAL NORTE"],
      programa: [
        ["25m", "LIVRE", 'PRÉ-MIRIM "B"', "FEMININO", "1ª ETAPA"],
        ["25m", "LIVRE", 'PRÉ-MIRIM "B"', "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "MIRIM", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "MIRIM", "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "INFANTIL", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "INFANTIL", "MASCULINO", "1ª ETAPA"],
        ["25m", "COSTAS", 'PRÉ-MIRIM "B"', "FEMININO", "2ª ETAPA"],
        ["25m", "COSTAS", 'PRÉ-MIRIM "B"', "MASCULINO", "2ª ETAPA"],
        ["50m", "COSTAS", "MIRIM", "FEMININO", "2ª ETAPA"],
        ["50m", "COSTAS", "MIRIM", "MASCULINO", "2ª ETAPA"],
        ["50m", "PEITO", "INFANTIL", "FEMININO", "2ª ETAPA"],
        ["50m", "PEITO", "INFANTIL", "MASCULINO", "2ª ETAPA"],
        ["4x25m", "LIVRE", 'PRÉ-MIRIM "B"', "MISTO", "3ª ETAPA"],
        ["4x50m", "LIVRE", "MIRIM", "MISTO", "3ª ETAPA"],
        ["4x50m", "LIVRE", "INFANTIL", "MISTO", "3ª ETAPA"],
      ],
      porProva: [7, 18],
    },

    TEMPO: {
      nome: "TROFÉU CIDADE DE CHAPECÓ 2026",
      arquivo: "CLUBE COM TEMPO",
      descricao: "Clube por tempo, balizamento por desempenho",
      semente: 33445566,
      temTempo: true,
      colunas: ["EQUIPE", "TEMPO"],
      equipes: ["CLUBE NÁUTICO AURORA", "GRÊMIO AQUÁTICO PONTAL",
                "ASSOCIAÇÃO ATLÉTICA MIRANTE", "CLUBE DOZE DE AGOSTO",
                "APANBLU", "ITAMIRIM NATAÇÃO", "LIRA TÊNIS CLUBE"],
      programa: [
        ["50m", "LIVRE", "INFANTIL", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "INFANTIL", "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "JUVENIL", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "JUVENIL", "MASCULINO", "1ª ETAPA"],
        ["100m", "LIVRE", "INFANTIL", "FEMININO", "1ª ETAPA"],
        ["100m", "LIVRE", "INFANTIL", "MASCULINO", "1ª ETAPA"],
        ["100m", "COSTAS", "JUVENIL", "FEMININO", "2ª ETAPA"],
        ["100m", "COSTAS", "JUVENIL", "MASCULINO", "2ª ETAPA"],
        ["100m", "PEITO", "INFANTIL", "FEMININO", "2ª ETAPA"],
        ["100m", "PEITO", "INFANTIL", "MASCULINO", "2ª ETAPA"],
        ["100m", "BORBOLETA", "JUVENIL", "FEMININO", "2ª ETAPA"],
        ["100m", "BORBOLETA", "JUVENIL", "MASCULINO", "2ª ETAPA"],
        ["200m", "MEDLEY", "JUVENIL", "FEMININO", "3ª ETAPA"],
        ["200m", "MEDLEY", "JUVENIL", "MASCULINO", "3ª ETAPA"],
        ["4x50m", "LIVRE", "INFANTIL", "MISTO", "3ª ETAPA"],
        ["4x50m", "LIVRE", "JUVENIL", "MISTO", "3ª ETAPA"],
      ],
      porProva: [9, 22],
    },

    ESCOLAR_PARA: {
      nome: "JOGOS ESCOLARES 2026, NATAÇÃO E PARANATAÇÃO",
      arquivo: "ESCOLAR COM PARADESPORTO",
      descricao: "Escolar com categorias paralímpicas na mesma competição",
      semente: 77001122,
      temTempo: false,
      colunas: ["EQUIPE", "CLASSE"],
      equipes: ["COLÉGIO AURORA", "ESCOLA MODELO", "GRÊMIO PONTAL",
                "INSTITUTO COREE", "APAE REGIONAL", "COLÉGIO SÃO JORGE"],
      programa: [
        ["25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "FEMININO", "1ª ETAPA"],
        ["25m", "LIVRE", 'PARALÍMPICO "A" + "B"', "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", 'PARALÍMPICO "C"', "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", 'PARALÍMPICO "C"', "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "MIRIM", "FEMININO", "1ª ETAPA"],
        ["50m", "LIVRE", "MIRIM", "MASCULINO", "1ª ETAPA"],
        ["50m", "LIVRE", "INFANTIL", "FEMININO", "2ª ETAPA"],
        ["50m", "LIVRE", "INFANTIL", "MASCULINO", "2ª ETAPA"],
        ["25m", "COSTAS", 'PARALÍMPICO "A" + "B"', "FEMININO", "2ª ETAPA"],
        ["25m", "COSTAS", 'PARALÍMPICO "A" + "B"', "MASCULINO", "2ª ETAPA"],
        ["50m", "COSTAS", "MIRIM", "FEMININO", "2ª ETAPA"],
        ["50m", "COSTAS", "MIRIM", "MASCULINO", "2ª ETAPA"],
        ["4x50m", "LIVRE", "MIRIM", "MISTO", "3ª ETAPA"],
        ["4x50m", "LIVRE", "INFANTIL", "MISTO", "3ª ETAPA"],
      ],
      classesPara: ["TEA", "DI", "DA", "DOWN", "DV"],
      porProva: [6, 15],
    },
  };

  /* ---------------- montagem das planilhas ---------------- */

  function ehRevezamento(distancia) {
    return /^\d+\s*X/i.test(String(distancia));
  }

  /* Uma classe funcional escrita como vem na inscrição de verdade: os três
     prefixos juntos, S para livre, costas e borboleta, SB para peito, SM para
     medley. Qual deles vale depende da prova, então em vez de adivinhar a
     gente sorteia e pergunta ao próprio regulamento se passa.

     `errada` pede o contrário: uma classe que o regulamento barra, para o
     exemplo mostrar a conferência trabalhando. */
  const FAIXA_DO_SEGMENTO = {
    DF: [1, 10], DV: [11, 13], DI: [14, 14], DA: [15, 15],
  };

  function classeFuncional(rnd, segmento, distancia, estilo, errada) {
    const B = raiz.Balizador || require("./balizador.core.js");
    // o mapa de provas usa "50 LIVRE"; a distância aqui vem como "50m"
    const evento = String(distancia).toUpperCase().replace(/^\d+X/, "")
                     .replace(/M$/, "") + " " + String(estilo).toUpperCase();
    const faixa = FAIXA_DO_SEGMENTO[segmento];
    if (!faixa) return "";
    const alvo = errada ? B.CORTE_REG : B.OK;
    let ultima = "";
    for (let tentativa = 0; tentativa < 60; tentativa++) {
      const s = faixa[0] + Math.floor(rnd() * (faixa[1] - faixa[0] + 1));
      const sb = Math.min(faixa[1], Math.max(faixa[0],
        s + (rnd() < 0.5 ? -1 : 0)));
      const sm = Math.min(faixa[1], Math.max(faixa[0],
        s + (rnd() < 0.5 ? 0 : 1)));
      ultima = "S" + s + "/SB" + sb + "/SM" + sm;
      if (B.classificar(segmento, ultima, evento).status === alvo) return ultima;
    }
    return errada ? "" : ultima;
  }

  function planilhaDoPrograma(comp) {
    const linhas = [["Nº", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE", "ETAPA"]];
    comp.programa.forEach((p, i) => linhas.push([i + 1, p[0], p[1], p[2], p[3], p[4]]));
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 13 }, { wch: 26 },
                   { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PROGRAMA");
    return wb;
  }

  function planilhaDeInscritos(comp) {
    const rnd = sorteio(comp.semente);
    const novoNome = fabricaDeNomes(rnd);
    const escolhe = (lista) => lista[Math.floor(rnd() * lista.length)];
    const linhas = [];
    let plantados = 0;

    for (const [dist, estilo, categoria, naipeLongo, etapa] of comp.programa) {
      const naipe = naipeLongo === "FEMININO" ? "FEM"
                  : naipeLongo === "MASCULINO" ? "MASC" : "MISTO";
      const revez = ehRevezamento(dist);
      const cabecalho = [dist.toUpperCase() + " " + estilo + " " +
                         categoria + " " + naipeLongo].concat(comp.colunas);
      cabecalho.push("");                 // separa o cabeçalho do lembrete
      cabecalho.push(etapa);              // o app ignora; serve para a pessoa
      linhas.push(cabecalho);

      const [min, max] = comp.porProva;
      const quantos = revez
        ? Math.max(3, Math.floor(rnd() * comp.equipes.length) + 3)
        : min + Math.floor(rnd() * (max - min + 1));

      const equipesUsadas = comp.equipes.slice();
      for (let k = 0; k < quantos; k++) {
        if (revez) {
          const equipe = equipesUsadas.splice(
            Math.floor(rnd() * equipesUsadas.length), 1)[0];
          if (!equipe) break;
          // uma equipe em cada exemplo entra sem a lista de nadadores
          const semLista = k === 1;
          const nomes = semLista ? "" : [
            novoNome("FEM"), novoNome("MASC"), novoNome("FEM"), novoNome("MASC"),
          ].join("\n");
          const linha = [nomes, equipe];
          if (comp.colunas.includes("SEGMENTO")) linha.push("");
          if (comp.colunas.includes("CLASSE")) linha.push("");
          if (comp.colunas.includes("TEMPO")) {
            linha.push(semLista ? "" : tempoPlausivel(rnd, dist, estilo));
          }
          linhas.push(linha);
          continue;
        }

        const linha = [novoNome(naipe), escolhe(comp.equipes)];
        if (comp.colunas.includes("SEGMENTO")) linha.push(categoria);
        if (comp.colunas.includes("CLASSE")) {
          if (comp.classePeloRegulamento) {
            const querErro = plantados < (comp.errosPlantados || 0) && rnd() < 0.04;
            let classe = querErro
              ? classeFuncional(rnd, categoria, dist, estilo, true) : "";
            if (classe) plantados++;
            else classe = classeFuncional(rnd, categoria, dist, estilo, false);
            linha.push(classe);
          } else {
            linha.push(/PARAL/i.test(categoria) ? escolhe(comp.classesPara) : "");
          }
        }
        if (comp.colunas.includes("TEMPO")) {
          // um em cada dez não informa tempo: o app põe esses na primeira série
          linha.push(rnd() < 0.1 ? "" : tempoPlausivel(rnd, dist, estilo));
        }
        linhas.push(linha);
      }
      linhas.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 38 }, { wch: 30 }, { wch: 12 }, { wch: 16 },
                   { wch: 4 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INSCRITOS");
    return wb;
  }

  /* ---------------- planilhas fora do formato, para a etapa de IA ----------
     Três jeitos de mandar inscrição que aparecem na vida real e que o app
     não lê sozinho: a ficha de cada escola com as provas marcadas com X, a
     lista corrida com os cabeçalhos de cada um, e a ficha única com o título
     de cada prova mesclado em cima dos atletas. As três são do programa do
     JEPB de exemplo: carregue aquele programa, envie uma destas e veja a
     etapa de IA organizando. Cada uma volta com o gabarito, o que tem de
     sair dela, para os testes conferirem. */

  const CATEGORIAS_IA = {
    PMB: { programa: 'PRÉ-MIRIM "B"', escritas: ["Pré-mirim B", "PRE MIRIM B", "PMB", "Pré-Mirim B"],
           provas: [["25m", "LIVRE"], ["25m", "COSTAS"]], anos: [2016, 2017] },
    MIRIM: { programa: "MIRIM", escritas: ["Mirim", "MIRIM", "mirim"],
             provas: [["50m", "LIVRE"], ["50m", "COSTAS"]], anos: [2014, 2015] },
    INF: { programa: "INFANTIL", escritas: ["Infantil", "INFANTIL", "Inf."],
           provas: [["50m", "LIVRE"], ["50m", "PEITO"]], anos: [2012, 2013] },
  };
  const LONGO = { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" };

  function numeroNoJEPB(dist, estilo, categoria, naipe) {
    return COMPETICOES.ESCOLAR.programa.findIndex((p) => p[0] === dist &&
      p[1] === estilo && p[2] === categoria && p[3] === LONGO[naipe]) + 1;
  }

  const emTitulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const doisDigitos = (n) => String(n).padStart(2, "0");

  // a mesma marca escrita do jeito de cada um: 35,20  00:41,30  41.3
  function tempoBaguncado(rnd, t) {
    const sorte = rnd();
    if (sorte < 0.35) return t.replace(".", ",");
    if (sorte < 0.55 && t.indexOf(":") < 0) return "00:" + t.replace(".", ",");
    if (sorte < 0.7 && /0$/.test(t)) return t.replace(/0$/, "");
    return t;
  }

  function atletasDaEscola(rnd, novoNome, equipe, quantos) {
    const lista = [];
    for (let i = 0; i < quantos; i++) {
      const naipe = rnd() < 0.5 ? "FEM" : "MASC";
      const cat = ["PMB", "MIRIM", "INF"][Math.floor(rnd() * 3)];
      const c = CATEGORIAS_IA[cat];
      const provas = c.provas.filter(() => rnd() < 0.65);
      if (!provas.length) provas.push(c.provas[Math.floor(rnd() * 2)]);
      lista.push({
        nome: novoNome(naipe), naipe, cat, equipe,
        nasc: { d: 1 + Math.floor(rnd() * 28), m: 1 + Math.floor(rnd() * 12),
                a: c.anos[Math.floor(rnd() * 2)] },
        provas: provas.map(([d, e]) => ({
          d, e, tempo: rnd() < 0.6 ? tempoPlausivel(rnd, d, e) : "" })),
      });
    }
    return lista;
  }

  function gabaritoDe(aba, linha, a, p, tempoEscrito) {
    const B = raiz.Balizador || require("./balizador.core.js");
    return { aba, linha, nome: a.nome, equipe: a.equipe,
             numero: numeroNoJEPB(p.d, p.e, CATEGORIAS_IA[a.cat].programa, a.naipe),
             tempo: tempoEscrito ? B.lerTempo(tempoEscrito) : null };
  }

  function planilhaComMesclas(wb, nome, linhas, mesclas, larguras) {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!merges"] = mesclas.map((m) => XLSX.utils.decode_range(m));
    ws["!cols"] = larguras.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }

  /* 1. Uma ficha por escola, cada uma numa aba. O nome da escola está num
     título, as provas são colunas com X ou com o tempo, o cabeçalho ocupa
     duas linhas mescladas e embaixo vêm o total e a assinatura. */
  function baguncadaMatriz(plantar) {
    const rnd = sorteio(51001);
    const plantados = [];
    const novoNome = fabricaDeNomes(rnd);
    const wb = XLSX.utils.book_new();
    const gabarito = [];
    const colunas = [["25m", "LIVRE"], ["50m", "LIVRE"], ["25m", "COSTAS"],
                     ["50m", "COSTAS"], ["50m", "PEITO"]];
    const escolas = [["COL AURORA", "COLÉGIO AURORA", "MARTA REGINA KOEHLER"],
                     ["ESC MODELO", "ESCOLA MODELO", "PAULO CESAR DUTRA"],
                     ["INST COREE", "INSTITUTO COREE", "SANDRA LUZ HOFFMANN"]];
    for (const [aba, escola, professor] of escolas) {
      const atletas = atletasDaEscola(rnd, novoNome, escola, 8 + Math.floor(rnd() * 3));
      const linhas = [
        ["JOGOS ESCOLARES 2026 - FICHA DE INSCRIÇÃO - NATAÇÃO"],
        ["ESCOLA: " + escola],
        ["Professor responsável: " + emTitulo(professor)],
        ["Nº", "NOME DO ALUNO", "SEXO", "DATA NASC.", "CATEGORIA",
         "PROVAS (marque X ou escreva o melhor tempo)"],
        ["", "", "", "", ""].concat(colunas.map(([d, e]) => d + " " + e)),
      ];
      atletas.forEach((a, k) => {
        const n = linhas.length + 1;
        const sexo = (a.naipe === "FEM" ? ["F", "f", "Fem", "FEMININO"]
                                        : ["M", "m", "Masc", "MASCULINO"])[Math.floor(rnd() * 4)];
        const nasc = [`${doisDigitos(a.nasc.d)}/${doisDigitos(a.nasc.m)}/${a.nasc.a}`,
                      String(a.nasc.a), `${a.nasc.d}/${a.nasc.m}/${a.nasc.a}`][Math.floor(rnd() * 3)];
        const escrita = CATEGORIAS_IA[a.cat].escritas;
        const linha = [k + 1, rnd() < 0.3 ? emTitulo(a.nome) : a.nome, sexo, nasc,
                       escrita[Math.floor(rnd() * escrita.length)]];
        colunas.forEach(([d, e]) => {
          const p = a.provas.find((x) => x.d === d && x.e === e);
          if (!p) { linha.push(""); return; }
          const t = p.tempo ? tempoBaguncado(rnd, p.tempo) : (rnd() < 0.5 ? "X" : "x");
          linha.push(t);
          gabarito.push(gabaritoDe(aba, n, a, p, p.tempo ? t : ""));
        });
        linhas.push(linha);
      });
      if (plantar && !plantados.length) plantarNaFicha(linhas, plantados);
      linhas.push([]);
      linhas.push([`TOTAL DE ATLETAS: ${atletas.length}`]);
      linhas.push(["Assinatura do responsável: ______________________________"]);
      const fim = linhas.length;
      planilhaComMesclas(wb, aba, linhas,
        ["A1:J1", "A2:J2", "A3:J3", "A4:A5", "B4:B5", "C4:C5", "D4:D5", "E4:E5",
         "F4:J4", `A${fim - 1}:E${fim - 1}`, `A${fim}:J${fim}`],
        [5, 34, 8, 12, 13, 11, 11, 11, 11, 11]);
    }
    return { wb, gabarito, plantados };
  }

  /* Os dois erros da demonstração, na ficha da primeira escola: um tempo de
     50 m escrito sem a vírgula ("3120", que o app leria como 52 minutos) e
     um atleta digitado duas vezes. As colunas G, I e J são as provas de 50 m. */
  function plantarNaFicha(linhas, plantados) {
    const atletas = [];
    for (let i = 5; i < linhas.length; i++) if (linhas[i][1]) atletas.push(i);
    const marcada = (l, c) => String(l[c] || "").trim() !== "";
    const comX = atletas.find((i) => [6, 8, 9].some((c) => /^x$/i.test(String(linhas[i][c]).trim())));
    if (comX != null) {
      const c = [6, 8, 9].find((x) => /^x$/i.test(String(linhas[comX][x]).trim()));
      linhas[comX][c] = "3120";
      plantados.push({ linha: comX + 1, coluna: c, nota: `"3120" sem a vírgula: seriam 52 minutos num 50 m` });
    }
    const umaProva = atletas.find((i) => i !== comX && [5, 6, 7, 8, 9].filter((c) => marcada(linhas[i], c)).length === 1);
    if (umaProva != null) {
      linhas.splice(umaProva + 1, 0, linhas[umaProva].slice());
      // a linha nova empurra para baixo o "3120", se ele vinha depois
      if (comX != null && comX > umaProva) plantados[0].linha++;
      plantados.push({ linha: umaProva + 2, coluna: 1, nota: "o mesmo atleta digitado duas vezes" });
    }
  }

  /* ---------------- a demonstração guiada ----------------
     O programa do JEPB com dois erros de propósito (o estilo escrito junto com
     a distância na 11ª prova, e uma linha de total no fim) e a ficha por escola
     com os dois erros de plantarNaFicha. Para o caso de o Claude demorar ou
     falhar, cada pedido da demonstração tem uma resposta de reserva, preparada
     aqui para estas planilhas e conferida pelo mesmo validador da resposta
     de verdade. A conversa avisa quando a reserva entra. */
  function demoPrograma() {
    const comp = COMPETICOES.ESCOLAR;
    const linhas = [["Nº", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE", "ETAPA"]];
    comp.programa.forEach((p, i) => linhas.push(i === 10
      ? [i + 1, "50m peito", "", p[2], p[3], p[4]]
      : [i + 1, p[0], p[1], p[2], p[3], p[4]]));
    linhas.push(["TOTAL: 15 provas"]);
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 15 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PROGRAMA");
    return { wb, nome: "PROGRAMA DO CAMPEONATO.xlsx", erros: [
      { linha: 12, coluna: 1, nota: "o estilo foi escrito junto com a distância" },
      { linha: 12, coluna: 2, nota: null },
      { linha: 17, coluna: 0, nota: "sobrou uma linha de total, que não é prova" }] };
  }

  function demoInscritos() {
    const r = baguncadaMatriz(true);
    return { wb: r.wb, nome: "FICHAS DAS ESCOLAS.xlsx", erros: r.plantados };
  }

  const ESCOLAS_DEMO = { "COL AURORA": "COLÉGIO AURORA", "ESC MODELO": "ESCOLA MODELO",
                         "INST COREE": "INSTITUTO COREE" };

  function reservaDoMapa(texto) {
    const abas = [...texto.matchAll(/ABA "([^"]+)"/g)].map((m) => m[1]);
    return { abas: abas.map((aba) => ({
      aba, usar: true, layout: "provas_em_colunas", linha_cabecalho: 5, primeira_linha_de_dados: 6,
      colunas: { nome: "B", equipe: null, prova: null, distancia: null, estilo: null, categoria: "E",
                 naipe: "C", tempo: null, nascimento: "D", classe: null, segmento: null },
      provas_em_colunas: ["25m LIVRE", "50m LIVRE", "25m COSTAS", "50m COSTAS", "50m PEITO"]
        .map((prova, k) => ({ coluna: "FGHIJ"[k], prova, coluna_tempo: null })),
      prova_da_aba: null, categoria_da_aba: null, naipe_da_aba: null,
      equipe_da_aba: ESCOLAS_DEMO[aba] || null,
      textos_de_lixo: ["TOTAL DE ATLETAS", "Assinatura do responsável"], incertezas: [] })) };
  }

  function reservaDasProvas(texto) {
    const B = raiz.Balizador || require("./balizador.core.js");
    const provas = [];
    for (const linha of texto.split("\n")) {
      const m = linha.match(/^(P\d+): (.*)$/);
      if (!m) continue;
      const campos = {};
      for (const x of m[2].matchAll(/(prova|distância|estilo|categoria|naipe) "([^"]*)"/g)) campos[x[1]] = x[2];
      const tudo = B.normalizar(Object.values(campos).join(" "));
      const dist = (tudo.match(/\b(\d+)\s*M?\b/) || [])[1];
      const estilo = /CRAWL|LIVRE/.test(tudo) ? "LIVRE" : /COSTA/.test(tudo) ? "COSTAS" : /PEITO/.test(tudo) ? "PEITO" : null;
      const n = B.normalizar(campos.naipe || "");
      const naipe = n.startsWith("F") ? "FEM" : n.startsWith("M") ? "MASC" : null;
      const c = B.normalizar(campos.categoria || "");
      const categoria = /PMB|PRE.?MIRIM/.test(c) ? 'PRÉ-MIRIM "B"' : /MIRIM/.test(c) ? "MIRIM" : /INF/.test(c) ? "INFANTIL" : null;
      provas.push({ id: m[1], numero_programa: null, distancia: dist ? dist + "M" : null, estilo, categoria, naipe,
                    incerto: !(dist && estilo && categoria && naipe), motivo: null });
    }
    return { provas };
  }

  function reservaDoPrograma(texto) {
    const linhas = [...texto.matchAll(/^linha (\d+): "([^"]*)"/gm)].map((m) => [Number(m[1]), m[2]]);
    return { linhas: linhas.map(([linha, t]) => /TOTAL/i.test(t)
      ? { linha, e_prova: false, distancia: null, estilo: null, categoria: null, naipe: null,
          incerto: false, motivo: "é o total de provas no fim da planilha, não uma prova" }
      : { linha, e_prova: true, distancia: "50M", estilo: "PEITO", categoria: "INFANTIL", naipe: "FEM",
          incerto: false, motivo: "o estilo estava escrito junto com a distância: 50m peito" }) };
  }

  // a resposta de reserva para um pedido da demonstração, ou null se não houver
  function reservaDaDemo(pedido, ia) {
    if (pedido.sistema === ia.SISTEMA_MAPA) return reservaDoMapa(pedido.texto);
    if (pedido.sistema === ia.SISTEMA_PROVAS) return reservaDasProvas(pedido.texto);
    if (pedido.sistema === ia.SISTEMA_PROGRAMA) return reservaDoPrograma(pedido.texto);
    return null;
  }

  /* 2. A lista corrida: uma linha por inscrição, com os cabeçalhos que cada
     coordenação inventa, a prova escrita de cinco jeitos, às vezes duas
     provas na mesma célula, e o revezamento só com a escola. */
  function baguncadaLista() {
    const rnd = sorteio(52002);
    const novoNome = fabricaDeNomes(rnd);
    const gabarito = [];
    const equipes = ["COLÉGIO AURORA", "ESCOLA MODELO", "GRÊMIO PONTAL", "COLÉGIO SÃO JORGE"];
    let atletas = [];
    equipes.forEach((eq) => { atletas = atletas.concat(atletasDaEscola(rnd, novoNome, eq, 6)); });
    const escritaProva = (d, e) => {
      const n = d.replace("m", "");
      const jeitos = {
        LIVRE: [`${n} livre`, `${n} m nado livre`, `Crawl ${n}m`, `${n}M LIVRE`],
        COSTAS: [`${n} costas`, `${n}m Costas`, `Costas ${n}`],
        PEITO: [`${n} peito`, `${n}m nado peito`, `Peito ${n}`],
      }[e];
      return jeitos[Math.floor(rnd() * jeitos.length)];
    };
    const linhas = [
      ["INSCRIÇÕES - NATAÇÃO - JEPB 2026"],
      ["Enviar para a coordenação até 30/10/2026"],
      [],
      ["Atleta (nome completo)", "Nasc.", "M/F", "Unidade escolar",
       "Modalidade / prova", "Cat.", "Melhor marca"],
    ];
    for (const a of atletas) {
      const nasc = rnd() < 0.5
        ? `${doisDigitos(a.nasc.d)}/${doisDigitos(a.nasc.m)}/${a.nasc.a}`
        : `${a.nasc.a}-${doisDigitos(a.nasc.m)}-${doisDigitos(a.nasc.d)}`;
      const escrita = CATEGORIAS_IA[a.cat].escritas;
      const cat = escrita[Math.floor(rnd() * escrita.length)];
      const base = [a.nome, nasc, a.naipe === "FEM" ? "F" : "M", a.equipe];
      // quem nada duas provas sem tempo às vezes vem numa linha só
      if (a.provas.length === 2 && !a.provas[0].tempo && !a.provas[1].tempo && rnd() < 0.6) {
        const n = linhas.length + 1;
        linhas.push(base.concat([a.provas.map((p) => escritaProva(p.d, p.e)).join(" / "), cat, ""]));
        a.provas.forEach((p) => gabarito.push(gabaritoDe("Planilha1", n, a, p, "")));
        continue;
      }
      for (const p of a.provas) {
        const n = linhas.length + 1;
        const t = p.tempo ? tempoBaguncado(rnd, p.tempo) : ["", "-", "sem tempo"][Math.floor(rnd() * 3)];
        linhas.push(base.concat([escritaProva(p.d, p.e), cat, t]));
        gabarito.push(gabaritoDe("Planilha1", n, a, p, p.tempo ? t : ""));
      }
    }
    // os revezamentos: só a escola, quem nada é escolhido no dia
    const revez = [["COLÉGIO AURORA", "Revezamento 4x50 livre misto", "Mirim", 14],
                   ["ESCOLA MODELO", "4x50 Livre Misto", "MIRIM", 14],
                   ["GRÊMIO PONTAL", "Revezamento 4x25 livre misto", "PMB", 13],
                   ["COLÉGIO SÃO JORGE", "4x50m livre misto", "Infantil", 15]];
    for (const [eq, prova, cat, numero] of revez) {
      const n = linhas.length + 1;
      linhas.push(["", "", "", eq, prova, cat, ""]);
      gabarito.push({ aba: "Planilha1", linha: n, nome: eq, equipe: eq, numero, tempo: null });
    }
    linhas.push([]);
    linhas.push([`Total de inscrições: ${gabarito.length}`]);
    linhas.push(["Professor responsável: Carla Beatriz Fontana"]);
    const wb = XLSX.utils.book_new();
    planilhaComMesclas(wb, "Planilha1", linhas, [], [34, 12, 6, 24, 28, 14, 13]);
    return { wb, gabarito };
  }

  /* 3. A ficha única por prova: o título de cada prova mesclado sobre a
     linha toda, umas com o nome completo, outras em dois andares (a
     categoria em cima, a prova embaixo), o total depois de cada bloco e a
     assinatura no fim. */
  function baguncadaBlocos() {
    const rnd = sorteio(53003);
    const novoNome = fabricaDeNomes(rnd);
    const gabarito = [];
    const aba = "Inscritos por prova";
    let atletas = [];
    COMPETICOES.ESCOLAR.equipes.slice(0, 5).forEach((eq) => {
      atletas = atletas.concat(atletasDaEscola(rnd, novoNome, eq, 5));
    });
    const linhas = [
      ["FESTIVAL ESCOLAR DE NATAÇÃO 2026 - JEPB"],
      ["Ficha única, todas as escolas"],
      [],
    ];
    const mesclas = ["A1:D1", "A2:D2"];
    const mesclada = (t) => {
      linhas.push([t]);
      mesclas.push(`A${linhas.length}:D${linhas.length}`);
    };
    const daProva = (d, e, cat, naipe) => {
      const lista = [];
      for (const a of atletas) {
        if (a.cat !== cat || a.naipe !== naipe) continue;
        const p = a.provas.find((x) => x.d === d && x.e === e);
        if (p) lista.push([a, p]);
      }
      return lista;
    };
    const atletasDoBloco = (lista) => {
      for (const [a, p] of lista) {
        const n = linhas.length + 1;
        const t = p.tempo ? tempoBaguncado(rnd, p.tempo) : (rnd() < 0.5 ? "SEM TEMPO" : "");
        linhas.push([rnd() < 0.25 ? emTitulo(a.nome) : a.nome, a.equipe,
                     `${doisDigitos(a.nasc.d)}/${doisDigitos(a.nasc.m)}/${a.nasc.a}`, t]);
        gabarito.push(gabaritoDe(aba, n, a, p, p.tempo ? t : ""));
      }
    };
    let numero = 0;
    const numerada = (k) => "PROVA " + doisDigitos(k);
    // pré-mirim e infantil: o título completo, com cabeçalho embaixo
    const completas = [["25m", "LIVRE", "PMB"], ["25m", "COSTAS", "PMB"],
                       ["50m", "LIVRE", "INF"], ["50m", "PEITO", "INF"]];
    for (const [d, e, cat] of completas) {
      for (const naipe of ["FEM", "MASC"]) {
        numero = numeroNoJEPB(d, e, CATEGORIAS_IA[cat].programa, naipe);
        const lista = daProva(d, e, cat, naipe);
        mesclada(cat === "PMB"
          ? `${numerada(numero)} - ${d.replace("m", "")} METROS ${e} - PRÉ-MIRIM B ${LONGO[naipe]}`
          : `${d.replace("m", "")} ${e} INFANTIL ${naipe === "FEM" ? "FEM" : "MASC"}`);
        linhas.push(["Nome", "Escola", "Nascimento", "Tempo"]);
        atletasDoBloco(lista);
        linhas.push([`Total: ${lista.length} atletas`]);
        linhas.push([]);
      }
    }
    // mirim: a categoria e o naipe num título, as provas em outro, sem cabeçalho
    for (const naipe of ["FEM", "MASC"]) {
      mesclada(`MIRIM - ${LONGO[naipe]}`);
      for (const [d, e] of CATEGORIAS_IA.MIRIM.provas) {
        mesclada(`${d} ${emTitulo(e)}`);
        atletasDoBloco(daProva(d, e, "MIRIM", naipe));
        linhas.push([]);
      }
    }
    // revezamentos: a escola na coluna da escola, a do nome em branco
    const revez = [[13, "PRÉ-MIRIM B", "4X25"], [14, "MIRIM", "4X50"], [15, "INFANTIL", "4X50"]];
    for (const [k, cat, dist] of revez) {
      mesclada(`${numerada(k)} - REVEZAMENTO ${dist} LIVRE MISTO - ${cat}`);
      linhas.push(["Equipe", "Escola", "", "Tempo"]);
      COMPETICOES.ESCOLAR.equipes.slice(0, 3 + (k % 2)).forEach((eq) => {
        const n = linhas.length + 1;
        linhas.push(["", eq, "", ""]);
        gabarito.push({ aba, linha: n, nome: eq, equipe: eq, numero: k, tempo: null });
      });
      linhas.push([]);
    }
    linhas.push(["Observações: as inscrições podem ser trocadas até o congresso técnico."]);
    linhas.push(["Assinatura do responsável: ______________________________"]);
    const wb = XLSX.utils.book_new();
    planilhaComMesclas(wb, aba, linhas, mesclas, [36, 28, 13, 12]);
    return { wb, gabarito };
  }

  const BAGUNCADAS = {
    MATRIZ: { nome: "Ficha por escola, provas marcadas com X",
              arquivo: "FICHA POR ESCOLA", gerar: baguncadaMatriz },
    LISTA: { nome: "Lista corrida, cada um com os seus cabeçalhos",
             arquivo: "LISTA CORRIDA", gerar: baguncadaLista },
    BLOCOS: { nome: "Ficha única, título da prova em cima dos atletas",
              arquivo: "FICHA UNICA POR PROVA", gerar: baguncadaBlocos },
  };

  function listaDeBaguncadas() {
    return Object.keys(BAGUNCADAS).map((chave) => ({ chave, nome: BAGUNCADAS[chave].nome }));
  }

  function planilhaBaguncada(chave) {
    return BAGUNCADAS[chave].gerar();
  }

  function nomeDaBaguncada(chave) {
    return "FORA DO FORMATO - " + BAGUNCADAS[chave].arquivo + ".xlsx";
  }

  function listaDeExemplos() {
    return Object.keys(COMPETICOES).map((chave) => ({
      chave,
      nome: COMPETICOES[chave].nome,
      descricao: COMPETICOES[chave].descricao,
      provas: COMPETICOES[chave].programa.length,
    }));
  }

  function nomeDoArquivo(chave, qual) {
    return "EXEMPLO " + COMPETICOES[chave].arquivo + " - " + qual + ".xlsx";
  }

  function perfilSugerido(chave) {
    const c = COMPETICOES[chave];
    return {
      nome: c.nome,
      temTempo: !!c.temTempo,
      temRevezamento: c.programa.some((p) => ehRevezamento(p[0])),
      temPara: chave === "PARA" || chave === "ESCOLAR_PARA",
      tipoClasse: chave === "PARA" ? "FUNCIONAL" : "CONDICAO",
      mostrarCategoria: chave === "ESCOLAR_PARA",
    };
  }

  const api = {
    COMPETICOES, listaDeExemplos, nomeDoArquivo, perfilSugerido,
    planilhaDoPrograma, planilhaDeInscritos,
    listaDeBaguncadas, planilhaBaguncada, nomeDaBaguncada,
    demoPrograma, demoInscritos, reservaDaDemo,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorExemplos = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
