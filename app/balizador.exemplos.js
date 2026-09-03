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
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorExemplos = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
