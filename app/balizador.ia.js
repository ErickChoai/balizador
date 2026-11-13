/* =====================================================================
   BALIZADOR, etapa opcional "Organizar com IA"

   Quando a planilha de inscritos chega num formato que o app não lê, esta
   etapa pede ajuda ao Claude para entender a estrutura dela e devolve as
   inscrições no formato canônico, uma por linha. Daí em diante tudo segue
   pelo caminho de sempre: as mesmas conferências, as mesmas regras de série
   e raia, sem IA nenhuma.

   O que a IA faz e o que ela não faz:
   - só transcreve e organiza; séries e raias continuam sendo do app
   - não recebe nome de ninguém: nomes viram PESSOA 1, datas viram DATA 1,
     e a tabela de troca fica só no navegador
   - recebe uma amostra, não a planilha: devolve um mapa (onde estão as
     provas, os nomes, as equipes, os tempos) que o app aplica aqui mesmo em
     todas as linhas. A aba inteira só vai quando o mapa não dá conta, e só
     depois de avisar
   - toda resposta é conferida contra um esquema fixo antes de ser usada;
     resposta fora do esquema não avança
   - a chamada sai pela conta Claude de quem usa o app, quando ele é aberto
     no claude.ai; fora de lá a etapa simplesmente não aparece

   Funciona no navegador (window.BalizadorIA) e no Node, para os testes.
   ===================================================================== */
(function (raiz) {
  "use strict";
  const B = raiz.Balizador || require("./balizador.core.js");
  const D = raiz.BalizadorDados || require("./balizador.dados.js");

  // o modelo pedido; se a conta da pessoa não puder usá-lo, o claude.ai
  // responde com o mais capaz que ela tiver
  const MODELO = "claude-opus-5-5";

  const texto = (v) => String(v == null ? "" : v).trim();
  const N = B.normalizar;
  const letra = (c) => XLSX.utils.encode_col(c);

  /* ---------------- 1. leitura local, sem enviar nada ----------------
     Todas as abas viram grade de texto. Célula mesclada vira a área toda
     com o mesmo valor: é assim que o título "50M LIVRE" mesclado de A a F
     continua valendo para quem lê a coluna C. Linha vazia sai, mas o número
     das outras não muda: é ele que o árbitro procura no Excel depois. */
  function lerGrades(wb, opts) {
    opts = opts || {};
    const so = opts.abas ? new Set(opts.abas) : null;
    const ignorar = (opts.ignorar || []).map(N);
    const saida = [];
    for (const nomeAba of wb.SheetNames) {
      if (so && !so.has(nomeAba)) continue;
      if (ignorar.includes(N(nomeAba))) continue;
      const ws = wb.Sheets[nomeAba];
      if (!ws || !ws["!ref"]) continue;
      const { grade, linha0, coluna0 } = D.gradeDaAba(ws);
      const mesclas = [];
      // as células que só repetem o valor da mescla: para a IA elas saem
      // como 〃, que é mais curto e diz a mesma coisa
      const copias = new Map();
      for (const m of ws["!merges"] || []) {
        const v = (grade[m.s.r - linha0] || [])[m.s.c - coluna0];
        mesclas.push(XLSX.utils.encode_range(m));
        if (v == null || texto(v) === "") continue;
        for (let r = m.s.r; r <= m.e.r; r++) {
          const rr = r - linha0;
          if (!grade[rr]) grade[rr] = [];
          if (!copias.has(rr)) copias.set(rr, new Set());
          for (let c = m.s.c; c <= m.e.c; c++) {
            grade[rr][c - coluna0] = v;
            if (r !== m.s.r || c !== m.s.c) copias.get(rr).add(c);
          }
        }
      }
      const linhas = [];
      let colunas = 0;
      grade.forEach((l, r) => {
        // a coluna da grade passa a ser a coluna do Excel: A é 0, B é 1
        const cel = new Array(coluna0).fill("").concat((l || []).map(texto));
        while (cel.length && !cel[cel.length - 1]) cel.pop();
        if (!cel.some(Boolean)) return;
        linhas.push({ n: linha0 + r + 1, cel, copia: copias.get(r) || null });
        colunas = Math.max(colunas, cel.length);
      });
      if (linhas.length) saida.push({ aba: nomeAba, linhas, colunas, mesclas });
    }
    return saida;
  }

  /* ---------------- 2. a máscara ----------------
     Competição escolar tem dados de menores. Tudo o que vai para a IA passa
     por aqui antes: fica o que é prova, tempo, número curto, cabeçalho
     conhecido, categoria, naipe, classe e nome de instituição. O resto é
     tratado como nome de pessoa e vira PESSOA 1, PESSOA 2. Datas viram
     DATA 1, números compridos (registro, telefone) viram NUMERO 1.
     O mesmo texto ganha sempre o mesmo código, e a tabela de volta fica só
     aqui no navegador. Uma equipe com nome de cidade também vira código: a
     revisão humana é que mostra o nome de volta. */

  const PALAVRAS_QUE_FICAM = [
    // cabeçalhos
    "NOME", "NOMES", "ATLETA", "ATLETAS", "ALUNO", "ALUNA", "ALUNOS", "ALUNAS",
    "ESTUDANTE", "ESTUDANTES", "NADADOR", "NADADORA", "NADADORES", "NADADORAS",
    "PARTICIPANTE", "PARTICIPANTES", "COMPLETO", "Nº", "N°", "NO", "NUM",
    "NUMERO", "ORDEM", "SEQ", "ITEM", "RAIA", "SERIE", "SEXO", "IDADE", "ANO",
    "ANOS", "DATA", "NASC", "NASCIMENTO", "DT", "INSCRICAO", "INSCRICOES",
    "INSCRITO", "INSCRITOS", "PROVA", "PROVAS", "EVENTO", "EVENTOS", "TEMPO",
    "TEMPOS", "MARCA", "MELHOR", "CATEGORIA", "CATEGORIAS", "CAT", "NAIPE",
    "GENERO", "CLASSE", "CLASSIFICACAO", "FUNCIONAL", "SEGMENTO",
    "DEFICIENCIA", "CONDICAO", "EQUIPE", "EQUIPES", "ESCOLA", "COLEGIO",
    "CLUBE", "INSTITUICAO", "ENTIDADE", "MUNICIPIO", "CIDADE", "TIME",
    "DELEGACAO", "UNIDADE", "OBS", "OBSERVACAO", "OBSERVACOES", "DISTANCIA",
    "ESTILO", "NADO", "METROS", "METRO", "MTS", "REVEZAMENTO", "INDIVIDUAL",
    "INDIVIDUAIS", "MARCAR", "MARQUE", "PREENCHER", "PREENCHA", "SIM",
    "NAO", "ETAPA", "DIA", "PERIODO", "MANHA", "TARDE", "NOITE",
    // o que costuma estar perto das inscrições sem ser inscrição
    "TOTAL", "TOTAIS", "SUBTOTAL", "GERAL", "ASSINATURA", "RESPONSAVEL",
    "TECNICO", "TECNICA", "TREINADOR", "TREINADORA", "PROFESSOR", "PROFESSORA",
    "PROF", "DIRETOR", "DIRETORA", "COORDENADOR", "COORDENADORA", "FICHA",
    "FORMULARIO", "TELEFONE", "FONE", "CELULAR", "EMAIL", "CONTATO", "LOCAL",
    "PAGINA", "FOLHA", "REGISTRO", "CPF", "RG", "MATRICULA", "VISTO",
    "CARIMBO", "COMPETICAO", "JOGOS", "ESCOLARES", "CAMPEONATO", "TORNEIO",
    "TROFEU", "FESTIVAL", "NATACAO", "PARANATACAO", "COPA", "FASE",
    "REGIONAL", "ESTADUAL", "MUNICIPAL", "ESTADUAIS", "MUNICIPAIS",
    // provas. COSTA, MARÇO e DIAS ficam de fora de propósito: são também
    // sobrenome e nome de gente, e um "MARIA DA COSTA" vazaria pela metade
    "LIVRE", "CRAWL", "COSTAS", "PEITO", "BORBOLETA", "MEDLEY",
    "MISTO", "MISTA", "MASCULINO", "FEMININO", "MASCULINA", "FEMININA", "MASC",
    "FEM", "VINTE", "CINCO", "CINQUENTA", "CEM", "DUZENTOS", "QUATROCENTOS",
    "OITOCENTOS", "MIL", "QUINHENTOS", "PREMIRIM", "MIRIM", "PETIZ",
    "INFANTIL", "JUVENIL", "PARALIMPICO", "PARALIMPICA", "PARAL", "PRE",
    "JANEIRO", "FEVEREIRO", "ABRIL", "MAIO", "JUNHO", "JULHO",
    "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO", "ESCOLAR",
    "MODALIDADE", "MODALIDADES", "JEPB", "JASC", "PARAJASC", "JESC", "OLESC",
    "JEBS", "JUBS", "CBDA",
    // o sexo escrito por extenso e as abreviações de prova (no teste gigante, "menino" virou PESSOA 72)
    "MENINO", "MENINA", "MENINOS", "MENINAS", "HOMEM", "MULHER", "RAPAZ", "MOCA",
    "LIVR", "BORB", "BORBO", "COST", "PEIT", "JUV", "INF", "MIR", "PMB",
    // o recado de quem não vai nadar
    "DESISTIU", "DESISTENTE", "CANCELADO", "CANCELADA", "RETIRADO", "RETIRADA",
    "SUBSTITUIDO", "SUBSTITUIDA", "AUSENTE",
    "REVEZAMENTOS", "PROVAS", "INSCRITAS", "EQUIPES", "RESUMO", "LEIA",
    // palavras de instrução e de recado, que nome de gente não tem
    "OU", "ESCREVA", "ESCREVER", "INFORME", "INFORMAR", "AQUI", "ATE",
    "ENVIAR", "ENVIE", "TODAS", "TODOS", "TODA", "TODO", "UNICA", "UNICO",
    "PODEM", "PODE", "SER", "SAO", "ESTA", "ESTE", "ESSA", "ESSE",
    "CONGRESSO", "COORDENACAO", "PREENCHIMENTO", "OBRIGATORIO", "OBRIGATORIA",
    "OPCIONAL", "ALTERADAS", "ALTERADOS", "TROCADAS", "TROCADOS", "CASO",
    "QUANDO", "ONDE", "COMO", "QUAL", "MAXIMO", "MINIMO", "LIMITE", "VAGAS",
    "CADA", "FAVOR", "ATENCAO", "IMPORTANTE", "PRAZO", "ENTREGA", "ENTREGAR",
    "DEVE", "DEVEM", "MAIS", "MENOS", "APOS", "ANTES", "DEPOIS", "NOVO",
    "NOVA", "ULTIMO", "ULTIMA", "PRIMEIRO", "PRIMEIRA", "HORAS",
    "HORA", "INICIO", "FIM", "OFICIAL", "OFICIAIS", "LISTA", "RELACAO",
  ];
  // ligam as palavras de um nome sem serem nome: JOÃO DA SILVA é um nome só
  const PALAVRAS_DE_LIGACAO = ["DA", "DE", "DO", "DAS", "DOS", "E", "EM", "A",
                                "O", "AS", "OS", "POR", "PARA", "COM", "Y"];
  // a célula que tiver uma destas é nome de instituição, e fica inteira
  const PALAVRAS_DE_INSTITUICAO = [
    "ESCOLA", "ESCOLAS", "COLEGIO", "EEB", "EBM", "EEF", "EMEF", "EMEB", "EEM",
    "EEEM", "CEI", "CEU", "CIEP", "CEDUP", "CENTRO", "CLUBE", "INSTITUTO",
    "IFSC", "ASSOCIACAO", "ASSOC", "SESI", "SESC", "SENAI", "PREFEITURA",
    "SECRETARIA", "FUNDACAO", "FME", "APAE", "AABB", "GREMIO", "ACADEMIA",
    "UNIVERSIDADE", "FACULDADE", "LICEU", "ATENEU", "EDUCANDARIO", "NUCLEO",
    "PROJETO", "LIGA", "FEDERACAO", "SOCIEDADE", "ESPORTE", "ESPORTES",
    "ESPORTIVO", "ESPORTIVA", "TENIS", "NAUTICO", "NATACAO", "AQUATICO",
    "AQUATICA", "SELECAO", "DELEGACAO", "MUNICIPAL", "ESTADUAL", "FEDERAL",
    "EDUCACIONAL", "EDUCACAO", "ENSINO",
  ];
  // valores que, sozinhos na célula, são informação de prova e não nome
  const VALORES_QUE_FICAM = [
    "X", "XX", "✓", "✔", "SIM", "NAO", "OK", "-", "--", "*", "SEM INSCRITOS",
    "SEM TEMPO", "NT", "N/T", "S/T", "SEM MARCA", "TEA", "DOWN", "TEA-DOWN",
    "TEA DOWN", "DI", "DA", "DF", "DV", "T21", "PRE MIRIM", "PRE-MIRIM",
    "MIRIM", "PETIZ", "INFANTIL", "JUVENIL", "JUNIOR", "SENIOR", "MASTER",
    "ABSOLUTO", "PARALIMPICO", "PARAL", "ESCOLAR", "ADULTO",
    // as siglas de categoria que as fichas usam
    "PMA", "PMB", "PM", "MIR", "INF", "JUV", "JR", "SR", "PET",
  ];

  const RE_DATA = /\b(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/g;
  // ano de nascimento vira código; o ano da competição (2026) não precisa
  const RE_ANO = /^(19[3-9]\d|20[01]\d|202[0-2])$/;

  // a palavra como ela é comparada: maiúscula, sem acento, sem pontuação
  const chavePalavra = (p) => N(p).replace(/[^A-Z0-9º°]/g, "");

  function vocabulario(perfil) {
    perfil = perfil || {};
    const ficam = new Set(PALAVRAS_QUE_FICAM.map(chavePalavra));
    const valores = new Set(VALORES_QUE_FICAM.map(D.chaveCategoria));
    // as categorias do programa também não são nome de ninguém
    for (const p of perfil.programa || []) {
      valores.add(D.chaveCategoria(p.categoria));
      valores.add(D.chaveCategoria(p.rotulo || p.categoria));
      for (const parte of D.partesDaCategoria(p.categoria)) {
        valores.add(parte);
        for (const w of parte.split(" ")) if (w.length > 1) ficam.add(chavePalavra(w));
      }
    }
    for (const nomes of Object.values(D.COLUNAS_MODELO)) {
      for (const n of nomes) { valores.add(D.chaveCategoria(n)); }
    }
    return { ficam, valores, instituicao: new Set(PALAVRAS_DE_INSTITUICAO),
             ligacao: new Set(PALAVRAS_DE_LIGACAO) };
  }

  function novaMascara() {
    return { porTexto: new Map(), porCodigo: new Map(),
             conta: { PESSOA: 0, DATA: 0, NUMERO: 0 } };
  }

  function codigoPara(m, tipo, original) {
    const k = tipo + "|" + N(original);
    if (m.porTexto.has(k)) return m.porTexto.get(k);
    const codigo = tipo + " " + (++m.conta[tipo]);
    m.porTexto.set(k, codigo);
    m.porCodigo.set(codigo, texto(original));
    return codigo;
  }

  // categoria escrita do jeito que aparece nas fichas: SUB 12, 11 A 12 ANOS,
  // MIRIM II, INFANTIL "A"
  function pareceCategoria(chave) {
    return /^SUB \d{1,2}$/.test(chave) || /^SUB\d{1,2}$/.test(chave) ||
      /^\d{1,2}( A | E |\s?)\d{0,2} ?ANOS$/.test(chave) ||
      /^(PRE ?)?(MIRIM|PETIZ|INFANTIL|JUVENIL|JUNIOR|SENIOR|MASTER|ABSOLUTO|PARAL(IMPICO)?|ESCOLAR)( (I{1,3}|[A-D]|\d))?$/.test(chave);
  }

  function pareceClasse(chave) {
    return /^(S|SB|SM)\d{1,2}$/.test(chave.replace(/\s/g, ""));
  }

  function mascararPorPalavras(p, m, voc) {
    const partes = p.split(/(\s+)/);
    let saida = "", corrida = "", ligacoes = "";
    const fecha = () => {
      if (corrida) saida += codigoPara(m, "PESSOA", corrida);
      saida += ligacoes;
      corrida = ""; ligacoes = "";
    };
    for (const t of partes) {
      if (!t) continue;
      if (/^\s+$/.test(t)) { if (corrida) ligacoes += t; else saida += t; continue; }
      const k = chavePalavra(t);
      if (RE_ANO.test(k)) { fecha(); saida += codigoPara(m, "DATA", t); continue; }
      // número curto e distância de prova (50M, 4X50M) também não são nome
      const numero = /^\d{1,4}[º°ª]?$/.test(k) || /^(\d{1,2}X)?\d{1,4}(M|MTS|METROS?)$/.test(k);
      const fica = !k || voc.ficam.has(k) || numero;
      const liga = voc.ligacao.has(k) || /^[A-Z]$/.test(k);
      // depois do DA, do DOS de um nome, vem sobrenome, seja ele qual for
      if (fica && !liga && corrida && ligacoes && !numero) {
        corrida += ligacoes + t; ligacoes = ""; continue;
      }
      if (fica && !liga) { fecha(); saida += t; continue; }
      if (liga) { if (corrida) ligacoes += t; else saida += t; continue; }
      if (/^\d{5,}$/.test(k)) { fecha(); saida += codigoPara(m, "NUMERO", t); continue; }
      // palavra de nome: entra na corrida, levando junto o DA, o DE do meio
      corrida += ligacoes + t;
      ligacoes = "";
    }
    fecha();
    return saida;
  }

  function mascararPedaco(p, m, voc) {
    const t = texto(p);
    if (!t) return p;
    if (RE_ANO.test(t)) return p.replace(t, codigoPara(m, "DATA", t));
    // tempo e número curto ficam; número comprido é registro, CPF, telefone
    if (/^[\d\s:.,'"’”]+$/.test(t)) {
      return /\d{5,}/.test(t.replace(/\s/g, "")) && !/[:.,'"’”]/.test(t)
        ? p.replace(t, codigoPara(m, "NUMERO", t)) : p;
    }
    // prova abreviada ("50L", "100LV", "4x50M"): número com até três letras não é nome de ninguém
    // (no teste gigante, "50L" foi como PESSOA, e o Mars falou de "código de pessoa" na tela)
    if (/^\d{1,3}(x\d{2,3})?\s?[a-z]{1,3}\.?$/i.test(t)) return p;
    if (D.lerProvaPorExtenso(t)) return p;
    const palavras = N(t).split(/\s+/).map(chavePalavra);
    if (palavras.some((w) => voc.instituicao.has(w))) return p;
    const chave = D.chaveCategoria(t);
    if (voc.valores.has(chave) || pareceCategoria(chave) || pareceClasse(chave)) return p;
    return mascararPorPalavras(p, m, voc);
  }

  /** O texto de uma célula com nomes e datas trocados por código. */
  function mascararCelula(valor, m, voc) {
    const t = String(valor == null ? "" : valor);
    if (!texto(t)) return "";
    const s = t.replace(RE_DATA, (d) => codigoPara(m, "DATA", d));
    // pedaços separados por quebra de linha, barra, parêntese, dois pontos:
    // "Responsável: Ana Souza" mantém o rótulo e esconde só o nome
    return s.split(/(\r?\n|\s+[-–—]\s+|[()/;|:])/)
      .map((p, i) => (i % 2 ? p : mascararPedaco(p, m, voc))).join("");
  }

  /** Troca os códigos de volta pelo texto original. */
  function desmascarar(valor, m) {
    return String(valor == null ? "" : valor)
      .replace(/\b(PESSOA|DATA|NUMERO) (\d+)\b/g,
               (cod) => (m.porCodigo.has(cod) ? m.porCodigo.get(cod) : cod));
  }

  // códigos citados que não existem na tabela: sinal de resposta inventada
  function codigosDesconhecidos(valor, m) {
    const achados = String(valor == null ? "" : valor)
      .match(/\b(PESSOA|DATA|NUMERO) \d+\b/g) || [];
    return achados.filter((c) => !m.porCodigo.has(c));
  }

  /* ---------------- 3. a amostra ----------------
     Do começo, do meio e do fim de cada aba: o começo traz o cabeçalho, o
     meio mostra que o padrão continua, o fim pega o TOTAL e a assinatura do
     responsável. Aba pequena vai inteira, mascarada do mesmo jeito. */
  const AMOSTRA_PADRAO = { comeco: 15, meio: 5, fim: 4 };
  // muitas fichas juntas (uma por equipe): cada aba vai com menos linhas, para o pedido não ficar enorme
  const AMOSTRA_CURTA = { comeco: 10, meio: 3, fim: 3 };

  // as posições (entre as linhas com conteúdo) que vão na amostra
  function posicoesDaAmostra(total, lim) {
    const AMOSTRA = lim || AMOSTRA_PADRAO;
    const limite = AMOSTRA.comeco + AMOSTRA.meio + AMOSTRA.fim;
    if (total <= limite) return [...Array(total).keys()];
    const idx = new Set();
    for (let i = 0; i < AMOSTRA.comeco; i++) idx.add(i);
    const meio = Math.floor(total / 2) - Math.floor(AMOSTRA.meio / 2);
    for (let i = 0; i < AMOSTRA.meio; i++) idx.add(meio + i);
    for (let i = total - AMOSTRA.fim; i < total; i++) idx.add(i);
    return [...idx].sort((a, b) => a - b);
  }

  function montarAmostra(grades, m, voc, opts) {
    opts = opts || {};
    const lim = grades.length > 6 ? AMOSTRA_CURTA : AMOSTRA_PADRAO;
    return grades.map((g) => {
      const pos = opts.inteira ? [...g.linhas.keys()] : posicoesDaAmostra(g.linhas.length, lim);
      return {
        aba: g.aba, total: g.linhas.length, colunas: g.colunas, mesclas: g.mesclas,
        primeira: g.linhas[0].n, ultima: g.linhas[g.linhas.length - 1].n,
        inteira: pos.length === g.linhas.length,
        linhas: pos.map((i) => {
          const l = g.linhas[i];
          return { i, n: l.n, cel: l.cel.map((c, k) =>
            (l.copia && l.copia.has(k) ? "〃" : mascararCelula(c, m, voc))) };
        }),
      };
    });
  }

  // "1 a 15, 30 a 34 e 59 a 62": a linha em branco no meio não quebra a faixa
  function faixas(linhas) {
    const f = [];
    for (const l of linhas) {
      const u = f[f.length - 1];
      if (u && l.i === u.i + 1) { u.ate = l.n; u.i = l.i; } else f.push({ de: l.n, ate: l.n, i: l.i });
    }
    const t = f.map((x) => (x.de === x.ate ? String(x.de) : x.de + " a " + x.ate));
    return t.length > 1 ? t.slice(0, -1).join(", ") + " e " + t[t.length - 1] : t[0] || "";
  }

  const celulaTexto = (c) => String(c || "").replace(/\r?\n/g, " ¶ ").replace(/\|/g, "¦");

  /** A amostra como texto, exatamente como ela vai para a IA. */
  function textoDaAmostra(amostra) {
    const blocos = [];
    for (const a of amostra) {
      const ult = a.colunas ? letra(a.colunas - 1) : "A";
      const cab = [`ABA "${a.aba}"`,
        `${a.total} linhas com conteúdo, da linha ${a.primeira} até a ${a.ultima}; colunas A até ${ult}.`];
      if (a.mesclas.length) {
        cab.push("Áreas mescladas: " + a.mesclas.slice(0, 40).join(", ") +
                 (a.mesclas.length > 40 ? "..." : ""));
      }
      cab.push(a.inteira ? "Vai a aba inteira." : "Amostra: linhas " + faixas(a.linhas) + ".");
      const colunas = [];
      for (let c = 0; c < a.colunas; c++) colunas.push(letra(c));
      const tabela = ["linha | " + colunas.join(" | ")];
      let anterior = null;
      for (const l of a.linhas) {
        if (anterior != null && l.i > anterior + 1) {
          const quantas = l.i - anterior - 1;
          tabela.push(`(${quantas} ${quantas > 1 ? "linhas" : "linha"} com conteúdo não ${quantas > 1 ? "enviadas" : "enviada"})`);
        }
        const cel = [];
        for (let c = 0; c < a.colunas; c++) cel.push(celulaTexto(l.cel[c]));
        tabela.push(l.n + " | " + cel.join(" | "));
        anterior = l.i;
      }
      blocos.push(cab.join("\n") + "\n\n" + tabela.join("\n"));
    }
    return blocos.join("\n\n\n");
  }

  /* ---------------- 4. os esquemas da resposta ----------------
     A IA responde num JSON de formato fixo, pedido ao próprio modelo e
     conferido de novo aqui, à mão, antes de qualquer uso. */
  const NULO = { type: "null" };
  const TEXTO_OU_NULO = { anyOf: [{ type: "string" }, NULO] };
  const INTEIRO_OU_NULO = { anyOf: [{ type: "integer" }, NULO] };
  const CAMPOS = ["nome", "equipe", "prova", "distancia", "estilo", "categoria",
                  "naipe", "tempo", "nascimento", "classe", "segmento"];
  const LAYOUTS = ["uma_inscricao_por_linha", "prova_como_titulo",
                   "provas_em_colunas", "outro"];

  function objeto(propriedades) {
    return { type: "object", additionalProperties: false,
             required: Object.keys(propriedades), properties: propriedades };
  }

  const ESQUEMA_MAPA = objeto({
    abas: { type: "array", items: objeto({
      aba: { type: "string" },
      usar: { type: "boolean" },
      layout: { type: "string", enum: LAYOUTS },
      linha_cabecalho: INTEIRO_OU_NULO,
      primeira_linha_de_dados: INTEIRO_OU_NULO,
      colunas: objeto(Object.fromEntries(CAMPOS.map((c) => [c, TEXTO_OU_NULO]))),
      provas_em_colunas: { type: "array", items: objeto({
        coluna: { type: "string" }, prova: { type: "string" },
        coluna_tempo: TEXTO_OU_NULO,
      }) },
      prova_da_aba: TEXTO_OU_NULO,
      categoria_da_aba: TEXTO_OU_NULO,
      naipe_da_aba: TEXTO_OU_NULO,
      equipe_da_aba: TEXTO_OU_NULO,
      textos_de_lixo: { type: "array", items: { type: "string" } },
      incertezas: { type: "array", items: objeto({
        linha: INTEIRO_OU_NULO, coluna: TEXTO_OU_NULO, motivo: { type: "string" },
      }) },
    }) },
  });

  const ESQUEMA_PROVAS = objeto({
    provas: { type: "array", items: objeto({
      id: { type: "string" },
      numero_programa: INTEIRO_OU_NULO,
      distancia: TEXTO_OU_NULO,
      estilo: { anyOf: [{ type: "string",
        enum: ["LIVRE", "COSTAS", "PEITO", "BORBOLETA", "MEDLEY"] }, NULO] },
      categoria: TEXTO_OU_NULO,
      naipe: { anyOf: [{ type: "string", enum: ["FEM", "MASC", "MISTO"] }, NULO] },
      incerto: { type: "boolean" },
      motivo: TEXTO_OU_NULO,
    }) },
  });

  const ESQUEMA_TRANSCRICAO = objeto({
    inscricoes: { type: "array", items: objeto({
      linha: { type: "integer" },
      nome: TEXTO_OU_NULO, equipe: TEXTO_OU_NULO, prova: TEXTO_OU_NULO,
      categoria: TEXTO_OU_NULO, naipe: TEXTO_OU_NULO, tempo: TEXTO_OU_NULO,
      nascimento: TEXTO_OU_NULO, classe: TEXTO_OU_NULO, segmento: TEXTO_OU_NULO,
      incerto: { type: "boolean" }, motivo: TEXTO_OU_NULO,
    }) },
    linhas_ignoradas: { type: "array", items: objeto({
      linha: { type: "integer" }, motivo: { type: "string" },
    }) },
  });

  /* O validador, escrito à mão para não trazer biblioteca nova: cobre o que
     os esquemas acima usam e nada além disso. Devolve a lista de erros, com o
     caminho de cada um; lista vazia quer dizer que a resposta serve. */
  function tipoDe(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
    return typeof v;
  }

  function validarEsquema(valor, esquema, caminho) {
    caminho = caminho || "resposta";
    if (esquema.anyOf) {
      for (const alt of esquema.anyOf) {
        if (!validarEsquema(valor, alt, caminho).length) return [];
      }
      return [`${caminho}: valor fora do formato (${JSON.stringify(valor).slice(0, 60)})`];
    }
    const t = tipoDe(valor);
    if (esquema.type) {
      const ok = t === esquema.type || (esquema.type === "number" && t === "integer");
      if (!ok) return [`${caminho}: era para ser ${esquema.type} e veio ${t}`];
    }
    if (esquema.enum && !esquema.enum.includes(valor)) {
      return [`${caminho}: "${valor}" não é uma das opções (${esquema.enum.join(", ")})`];
    }
    const erros = [];
    if (esquema.type === "object") {
      for (const k of esquema.required || []) {
        if (!(k in valor)) erros.push(`${caminho}: falta o campo ${k}`);
      }
      for (const k of Object.keys(valor)) {
        if (!esquema.properties[k]) {
          if (esquema.additionalProperties === false) erros.push(`${caminho}: campo a mais, ${k}`);
          continue;
        }
        erros.push(...validarEsquema(valor[k], esquema.properties[k], caminho + "." + k));
      }
    }
    if (esquema.type === "array" && esquema.items) {
      valor.forEach((v, i) => erros.push(...validarEsquema(v, esquema.items, `${caminho}[${i}]`)));
    }
    return erros;
  }

  /* ---------------- 5. a conversa com a IA ---------------- */
  class ErroIA extends Error {
    constructor(mensagem, detalhes) {
      super(mensagem);
      this.name = "ErroIA";
      this.detalhes = detalhes || [];
    }
  }

  /* Uma chamada pela conta Claude de quem está usando o app. `sample` é a
     função que o claude.ai entrega à página (claude.use("sample")): o uso sai
     da conta da pessoa, e na primeira vez o próprio Claude pede licença.
     Ela não aceita esquema nem instrução de sistema, então as duas coisas
     vão no texto, e a resposta é conferida aqui contra o esquema antes de
     qualquer uso. Sem guardar resposta: "tentar de novo" pergunta de novo. */
  async function chamar(sample, pedido) {
    const entrada = pedido.sistema +
      "\n\nResponda só com um objeto JSON que siga exatamente este esquema " +
      "(JSON Schema), sem texto antes nem depois:\n" + JSON.stringify(pedido.esquema) +
      "\n\n" + pedido.texto;
    let chars = 0;
    const dados = await sample.json(entrada, {
      model: MODELO, modelTier: "complex", effort: "medium", cache: false,
      signal: pedido.sinal,
      onText: pedido.aoAvancar ? ({ text }) => {
        chars = text.length; pedido.aoAvancar(chars);
      } : undefined,
    });
    return conferirResposta(dados, pedido.esquema);
  }

  /** Confere a resposta antes de qualquer uso. Fora do esquema, não avança. */
  function conferirResposta(dados, esquema) {
    const erros = validarEsquema(dados, esquema);
    if (erros.length) {
      throw new ErroIA("A resposta da IA não segue o formato combinado. Nada foi usado.",
                       erros.slice(0, 12));
    }
    return { dados };
  }

  /* O erro explicado para quem está usando o app. Os códigos são os da
     função sample do claude.ai; o app nunca tenta de novo sozinho. */
  const ERROS_CLAUDE = {
    cancelled: "Envio cancelado. Nada foi usado.",
    not_granted: "O app não recebeu licença para usar a IA do claude.ai nesta página. A etapa de IA fica de fora; o resto funciona igual.",
    sampling_disabled: "A IA do claude.ai não está liberada para esta conta. A etapa de IA fica de fora; o resto funciona igual.",
    session_expired: "A sua sessão no claude.ai expirou. Entre de novo e tente outra vez.",
    rate_limited: "A sua conta do claude.ai chegou no limite de uso, ou foram muitos pedidos seguidos. Espere um pouco e tente de novo.",
    refused: "O Mars recusou este pedido. Nada foi usado.",
    invalid_json: "A resposta da IA não é um JSON válido. Nada foi usado.",
    empty_completion: "A IA não respondeu nada. Nada foi usado. Tente de novo.",
    prompt_too_large: "Esta parte da planilha é grande demais para mandar de uma vez.",
    not_declared: "A etapa de IA não está disponível nesta página.",
    capability_disabled: "A etapa de IA não está disponível nesta página.",
    capability_removed: "A etapa de IA não está disponível nesta versão do claude.ai.",
  };

  function explicarErro(err) {
    if (err instanceof ErroIA) return { titulo: err.message, detalhes: err.detalhes };
    const codigo = err && err.code;
    if (codigo && ERROS_CLAUDE[codigo]) {
      const detalhes = codigo === "invalid_json" && err.text ? [String(err.text).slice(0, 300)] : [];
      return { titulo: ERROS_CLAUDE[codigo], detalhes, codigo };
    }
    return { titulo: "Algo deu errado na conversa com a IA. Nada foi usado. Tente de novo.",
             detalhes: [String((err && err.message) || err)], codigo: codigo || "" };
  }

  /* ---------------- 6. o pedido do mapa ---------------- */
  const SISTEMA_MAPA = `Você ajuda um aplicativo de balizamento de natação a ler planilhas de inscrição que chegaram fora do formato. Você não monta séries nem raias, não corrige dado nenhum e não inventa nada. Você só descreve onde está cada informação, e o aplicativo aplica essa descrição sozinho em todas as linhas.

O que você recebe: uma amostra de cada aba (começo, meio e fim), com o número da linha e a letra da coluna como no Excel. Para proteger os atletas, que muitas vezes são menores de idade, nomes de pessoas foram trocados por códigos como PESSOA 12, datas por DATA 3 e números longos por NUMERO 2. Trate cada código como o valor que ele esconde: uma coluna cheia de PESSOA é uma coluna de nomes. Nomes de instituição, provas, tempos e cabeçalhos vêm como estão. Numa área mesclada, o valor aparece na primeira célula e as outras células da área trazem o sinal 〃; para o aplicativo, todas elas valem aquele valor. O sinal ¶ marca uma quebra de linha dentro da célula.

Para cada aba, devolva:
- aba: o nome exato da aba.
- usar: false quando a aba não traz inscrições (instruções, legenda, resumo, lista de escolas).
- layout, um destes:
  - uma_inscricao_por_linha: cada linha é uma inscrição, com atleta e prova na mesma linha. Se uma célula lista várias provas do mesmo atleta, também é este layout.
  - prova_como_titulo: uma linha traz o nome da prova, às vezes numa célula mesclada, e os atletas daquela prova vêm nas linhas de baixo, até a próxima prova.
  - provas_em_colunas: cada linha é um atleta e cada prova tem a sua coluna; uma célula preenchida (X, um tempo ou outro sinal) quer dizer que ele nada aquela prova.
  - outro: nenhum dos três descreve a aba com segurança.
- linha_cabecalho: a linha com os nomes das colunas, ou null.
- primeira_linha_de_dados: a primeira linha com atleta, ou null.
- colunas: a letra da coluna de cada informação, ou null quando ela não existe. nome é o atleta; no revezamento a linha pode ter só a equipe. Em prova_como_titulo, prova é a coluna onde aparece o título da prova.
- provas_em_colunas: só no layout provas_em_colunas. Para cada coluna de prova, a letra, a prova escrita por extenso como está no cabeçalho (junte as partes quando o cabeçalho ocupar duas linhas, como "50M" em cima e "LIVRE" embaixo) e a letra da coluna de tempo daquela prova, quando houver uma separada. Nos outros layouts, lista vazia.
- prova_da_aba, categoria_da_aba, naipe_da_aba, equipe_da_aba: quando a aba inteira é de uma prova, de uma categoria, de um naipe ou de uma equipe, dito no nome da aba ou num título. Copie como está escrito, inclusive os códigos. null quando não for o caso.
- textos_de_lixo: textos que marcam linhas que não são inscrição nem título, como TOTAL, assinatura do responsável, observações. Copie como aparecem na amostra.
- incertezas: tudo de que você não tem certeza, com a linha e a coluna quando fizer sentido e o motivo numa frase curta, em português. A coluna diz de qual prova é a dúvida, numa ficha com uma coluna por prova. O motivo aparece na tela para a pessoa: escreva para ela, sem falar de código, de PESSOA, de máscara nem de texto escondido. Não ponha em incertezas o que o app lê sozinho: o sexo escrito por extenso ou abreviado (Fem, Masc, menina, menino), o tempo com ponto, vírgula ou unidade (38.5, 41 seg), a data em outro formato (2014-05-12), o nome todo em minúsculas e a prova marcada só com X (é inscrição sem tempo).

Não chute. Na dúvida, deixe null e explique em incertezas.`;

  function contextoDaCompeticao(perfil) {
    perfil = perfil || {};
    const linhas = [];
    if (perfil.temPara) {
      linhas.push(perfil.tipoClasse === "CONDICAO"
        ? "A competição tem paradesporto, com a condição do atleta escrita (TEA, DI, DA, DOWN)."
        : "A competição tem paradesporto, com classe funcional (S6, SB5, SM6) e segmento (DF, DV, DI, DA, TEA).");
    }
    if (perfil.temTempo) linhas.push("A competição usa tempo de inscrição.");
    const cats = [];
    for (const p of perfil.programa || []) {
      const c = p.rotulo || p.categoria;
      if (c && !cats.includes(c)) cats.push(c);
    }
    if (cats.length) linhas.push("Categorias do programa: " + cats.join(", ") + ".");
    return linhas.join("\n");
  }

  function pedidoDoMapa(amostra, perfil) {
    const ctx = contextoDaCompeticao(perfil);
    return {
      sistema: SISTEMA_MAPA,
      esquema: ESQUEMA_MAPA,
      texto: (ctx ? ctx + "\n\n" : "") +
        "Descreva estas abas da planilha de inscritos.\n\n" + textoDaAmostra(amostra),
    };
  }

  /* ---------------- 7. conferência do mapa ----------------
     O esquema garante a forma; aqui se confere se o mapa faz sentido para a
     planilha de verdade: aba que existe, letra de coluna que existe, linha
     dentro da aba. Problema numa aba deixa só aquela aba de fora. */
  function colunaValida(c, g) {
    if (c == null) return true;
    if (!/^[A-Z]{1,3}$/.test(c)) return false;
    return XLSX.utils.decode_col(c) < Math.max(g.colunas, 1) + 2;
  }

  function conferirMapa(mapa, grades) {
    const porAba = new Map(grades.map((g) => [g.aba, g]));
    const erros = [], problemas = {};
    const vistas = new Set();
    for (const a of mapa.abas) {
      let g = porAba.get(a.aba);
      if (!g) {
        // a IA às vezes devolve o nome com outra caixa ou sem acento
        const parecida = grades.find((x) => N(x.aba) === N(a.aba));
        if (parecida) { a.aba = parecida.aba; g = parecida; }
      }
      if (!g) { erros.push(`a IA citou a aba "${a.aba}", que não existe nesta planilha`); continue; }
      if (vistas.has(a.aba)) { erros.push(`a aba "${a.aba}" veio duas vezes na resposta`); continue; }
      vistas.add(a.aba);
      const p = [];
      const maiusc = (c) => (c == null ? null : texto(c).toUpperCase());
      for (const k of CAMPOS) a.colunas[k] = maiusc(a.colunas[k]);
      for (const pc of a.provas_em_colunas) {
        pc.coluna = maiusc(pc.coluna); pc.coluna_tempo = maiusc(pc.coluna_tempo);
      }
      for (const k of CAMPOS) {
        if (!colunaValida(a.colunas[k], g)) p.push(`coluna de ${k} inválida: ${a.colunas[k]}`);
      }
      for (const pc of a.provas_em_colunas) {
        if (!colunaValida(pc.coluna, g) || !colunaValida(pc.coluna_tempo, g)) {
          p.push(`coluna de prova inválida: ${pc.coluna}`);
        }
      }
      const ultima = g.linhas[g.linhas.length - 1].n;
      for (const k of ["linha_cabecalho", "primeira_linha_de_dados"]) {
        if (a[k] != null && (a[k] < 1 || a[k] > ultima)) p.push(`${k} fora da aba: ${a[k]}`);
      }
      if (a.usar) {
        const c = a.colunas;
        const quem = c.nome || c.equipe;
        if (a.layout === "outro") p.push("a IA não reconheceu um formato seguro nesta aba");
        if (a.layout === "uma_inscricao_por_linha" &&
            (!quem || !(c.prova || (c.distancia && c.estilo) || a.prova_da_aba))) {
          p.push("o mapa não diz onde estão o atleta e a prova");
        }
        if (a.layout === "prova_como_titulo" && (!c.prova || !quem)) {
          p.push("o mapa não diz onde estão o título da prova e o atleta");
        }
        if (a.layout === "provas_em_colunas" && (!a.provas_em_colunas.length || !c.nome)) {
          p.push("o mapa não diz quais colunas são provas, ou onde está o nome");
        }
      }
      if (p.length) problemas[a.aba] = p;
    }
    for (const g of grades) {
      if (!vistas.has(g.aba) && !erros.length) {
        problemas[g.aba] = ["a IA não disse nada sobre esta aba"];
      }
    }
    return { erros, problemas };
  }

  /* ---------------- 8. o mapa aplicado aqui, em todas as linhas ----------
     Daqui para baixo nada sai do computador. Os valores vêm da planilha
     original, não da amostra mascarada: a IA só disse onde olhar. */

  // linhas que não são inscrição, reconhecidas pela primeira célula
  const RE_LIXO = /^(TOTAL|SUBTOTAL|ASSINATURA|RESPONSAVEL|TECNIC[OA]|TREINADOR|PROFESSOR|OBS\b|OBSERVAC|DATA\s*:|LOCAL\s*:|TELEFONE|E-?MAIL|CONTATO|VISTO|CARIMBO|DIRETOR|COORDENADOR)/;

  function pareceTitulo(t) {
    const u = N(t);
    return /\b\d+\s*(M|MTS?|METROS)\b|\b\d+\s*X\s*\d+/.test(u) ||
      /\b(LIVRE|CRAWL|COSTAS?|PEITO|BORBOLETA|MEDLEY|PROVA|REVEZAMENTO|MASCULINO|FEMININO|MISTO|MIRIM|INFANTIL|JUVENIL|PETIZ|CATEGORIA|PARAL\w*)\b/.test(u);
  }

  function pareceCabecalho(cel) {
    let n = 0;
    for (const c of cel) {
      const u = N(c).replace(/[.:]+$/, "");
      if (!u) continue;
      if (Object.values(D.COLUNAS_MODELO).some((nomes) => nomes.includes(u)) ||
          ["ALUNO", "ALUNA", "ATLETA", "NOME COMPLETO", "SEXO", "N", "Nº", "N°",
           "ORDEM", "DATA NASC", "DT NASC", "IDADE"].includes(u)) n++;
    }
    return n >= 2;
  }

  const MARCA_VAZIA = /^(-+|–|—|0|N|NAO|NÃO|NO|NENHUM|NENHUMA)$/i;

  // "50 livre, 100 peito" numa célula só: uma inscrição para cada prova
  function provasDaCelula(t) {
    const pedacos = texto(t).split(/\s*[,;\n]\s*|\s+[eE]\s+|\s*\/\s*|\s+\+\s+/)
      .map(texto).filter(Boolean);
    if (pedacos.length > 1 && pedacos.every((p) => /^\d/.test(p))) return pedacos;
    return [texto(t)];
  }

  function aplicarMapa(mapa, grades, m, perfil) {
    const porAba = new Map(grades.map((g) => [g.aba, g]));
    const { problemas } = conferirMapa(mapa, grades);
    const linhas = [], ignoradas = [], abas = [];

    for (const a of mapa.abas) {
      const g = porAba.get(a.aba);
      if (!g) continue;
      const resumo = { aba: a.aba, layout: a.layout, usada: a.usar, inscricoes: 0,
                       problemas: problemas[a.aba] || [], deuConta: true,
                       notas: [] };
      abas.push(resumo);
      if (!a.usar) {
        resumo.notas.push("a IA disse que esta aba não traz inscrições");
        continue;
      }
      if (resumo.problemas.length) { resumo.deuConta = false; continue; }

      const col = (c) => (c == null ? -1 : XLSX.utils.decode_col(c));
      const idx = Object.fromEntries(CAMPOS.map((k) => [k, col(a.colunas[k])]));
      const fixo = (v) => (v == null ? "" : desmascarar(texto(v), m));
      const daAba = { prova: fixo(a.prova_da_aba), categoria: fixo(a.categoria_da_aba),
                      naipe: fixo(a.naipe_da_aba), equipe: fixo(a.equipe_da_aba) };
      // texto de lixo curto demais (um X, um traço) pegaria linha de atleta
      const lixos = a.textos_de_lixo.map((t) => N(desmascarar(t, m)))
        .filter((t) => t.length >= 3);
      const temLixo = (l) => {
        const tudo = " " + N(l.cel.filter(Boolean).join(" ")) + " ";
        return lixos.some((x) => tudo.includes(" " + x + " ") || tudo.includes(" " + x + ":"));
      };
      const inicio = a.primeira_linha_de_dados ||
                     (a.linha_cabecalho ? a.linha_cabecalho + 1 : 1);

      // as incertezas com linha vão para a linha; as outras ficam na aba
      // com a coluna: numa ficha com uma coluna por prova, a dúvida de uma coluna fica só
      // na inscrição dela (no teste grande, a dúvida do tempo de NICOLAS aparecia nas duas provas)
      const incertasPorLinha = new Map();
      const letra = (c) => String(c || "").trim().toUpperCase();
      const colunasDeProva = new Set((a.provas_em_colunas || [])
        .flatMap((pc) => [pc.coluna, pc.coluna_tempo]).filter(Boolean).map(letra));
      for (const inc of a.incertezas) {
        const motivo = desmascarar(inc.motivo, m);
        if (inc.linha != null) {
          if (!incertasPorLinha.has(inc.linha)) incertasPorLinha.set(inc.linha, []);
          incertasPorLinha.get(inc.linha).push({ motivo, coluna: letra(inc.coluna) });
        } else resumo.notas.push(motivo);
      }
      // a prova marcada só com X é inscrição sem tempo, e o app lê isso sozinho: não vira dúvida
      // (no teste das várias fichas, cada X de 4 escolas virou um cartão "está certa assim?")
      const soOX = (m) => /(^|[^a-z])x([^a-z]|$)/i.test(m) && /sem tempo|s[oó] com|marcad/i.test(m) &&
        !/repet|duplic|outra|duas vezes|nome|sexo|naipe|categoria|idade|nasc/i.test(m);
      const incertezasDa = (n, suas) => (incertasPorLinha.get(n) || [])
        .filter((x) => !suas || !x.coluna || !colunasDeProva.has(x.coluna) || suas.includes(x.coluna))
        .filter((x) => !soOX(x.motivo))
        .map((x) => x.motivo);

      let tituloAtual = "", contexto = "";
      const ignora = (l, motivo, tipo) => ignoradas.push({
        aba: a.aba, linha: l.n, motivo, tipo: tipo || "ignorada", original: l.cel });
      const novaLinha = (l, campos, sub, suas) => {
        linhas.push({
          id: a.aba + "|" + l.n + (sub != null ? "|" + sub : ""),
          origem: { aba: a.aba, linha: l.n, sub: sub != null ? sub : undefined },
          original: l.cel, campos,
          incertezas: incertezasDa(l.n, suas),
          via: "mapa", excluida: false,
        });
        resumo.inscricoes++;
      };
      const valor = (l, k) => (idx[k] >= 0 ? texto(l.cel[idx[k]]) : "");
      const camposDe = (l) => ({
        nome: valor(l, "nome"),
        equipe: valor(l, "equipe") || daAba.equipe,
        prova: valor(l, "prova") || daAba.prova,
        distancia: valor(l, "distancia"), estilo: valor(l, "estilo"),
        categoria: valor(l, "categoria") || daAba.categoria,
        naipe: valor(l, "naipe") || daAba.naipe,
        tempo: valor(l, "tempo"), nascimento: valor(l, "nascimento"),
        classe: valor(l, "classe"), segmento: valor(l, "segmento"),
      });

      /* Em prova_como_titulo, o título é a linha com o texto na coluna da
         prova e mais nada (ou o mesmo texto mesclado na linha toda), ou uma
         prova que o app já sabe ler sozinho. Título sem distância nem estilo
         é de categoria ou naipe: vale para as provas que vierem embaixo. */
      const titulo = (l) => {
        if (a.layout !== "prova_como_titulo") return false;
        const pc = valor(l, "prova");
        const distintos = new Set(l.cel.filter(Boolean).map(N));
        if (!pc || !(D.lerProvaPorExtenso(pc) || (distintos.size === 1 && pareceTitulo(pc)))) {
          return false;
        }
        if (/\d/.test(pc) && /(LIVRE|CRAWL|COSTA|PEITO|BORBOLETA|MEDLEY|DORSO|GOLFINHO)/.test(N(pc))) {
          tituloAtual = pc;
          // a prova que já traz categoria ou naipe não herda o título de cima
          const p = D.lerProvaPorExtenso(pc);
          if (p && (p.naipe || p.categoria)) contexto = "";
        } else { contexto = pc; tituloAtual = ""; }
        ignora(l, "título: " + pc, "titulo");
        return true;
      };

      let semDono = 0, dados = 0;
      for (const l of g.linhas) {
        if (l.n < inicio) {
          if (!titulo(l)) ignora(l, "antes da primeira linha de dados", "cabecalho");
          continue;
        }
        if (l.n === a.linha_cabecalho) { ignora(l, "cabeçalho", "cabecalho"); continue; }
        const primeira = l.cel.find(Boolean) || "";
        if (RE_LIXO.test(N(primeira)) || temLixo(l)) {
          ignora(l, "não é inscrição: " + primeira, "lixo"); continue;
        }

        if (a.layout === "prova_como_titulo") {
          if (titulo(l)) continue;
          if (pareceCabecalho(l.cel)) { ignora(l, "cabeçalho repetido", "cabecalho"); continue; }
          const c = camposDe(l);
          if (!c.nome && !c.equipe) { ignora(l, "linha sem nome nem equipe"); semDono++; continue; }
          dados++;
          if (!tituloAtual) { ignora(l, "atleta antes do primeiro título de prova"); semDono++; continue; }
          // o título dá a prova; o contexto, quando houver, a categoria e o naipe
          c.prova = [tituloAtual, contexto].filter(Boolean).join(" ");
          novaLinha(l, c);
          continue;
        }

        if (pareceCabecalho(l.cel)) { ignora(l, "cabeçalho repetido", "cabecalho"); continue; }

        if (a.layout === "provas_em_colunas") {
          const c = camposDe(l);
          if (!c.nome) { ignora(l, "linha sem nome de atleta"); semDono++; continue; }
          dados++;
          let achou = 0;
          a.provas_em_colunas.forEach((pc, k) => {
            const marca = texto(l.cel[col(pc.coluna)]);
            if (!marca || MARCA_VAZIA.test(marca)) return;
            const tempoSep = pc.coluna_tempo ? texto(l.cel[col(pc.coluna_tempo)]) : "";
            // a célula da prova com um número dentro é o próprio tempo
            const tempo = tempoSep || (/\d/.test(marca) && B.lerTempo(marca) != null ? marca : "");
            novaLinha(l, Object.assign({}, c, { prova: fixo(pc.prova), tempo: tempo || c.tempo }), k,
              [pc.coluna, pc.coluna_tempo].filter(Boolean).map(letra));
            achou++;
          });
          if (!achou) ignora(l, "atleta sem nenhuma prova marcada");
          continue;
        }

        // uma inscrição por linha, ou mais de uma quando a célula lista provas
        const c = camposDe(l);
        if (!c.nome && !c.equipe) { ignora(l, "linha sem nome nem equipe"); semDono++; continue; }
        dados++;
        const provas = provasDaCelula(c.prova);
        if (provas.length > 1) {
          provas.forEach((p, k) => novaLinha(l, Object.assign({}, c, { prova: p }), k));
        } else novaLinha(l, c);
      }

      // o mapa não deu conta quando sobra muito atleta sem prova, ou nada sai
      if (!resumo.inscricoes || semDono > Math.max(2, 0.2 * (dados + semDono))) {
        resumo.deuConta = false;
        resumo.problemas.push(resumo.inscricoes
          ? `${semDono} linhas ficaram sem prova ou sem atleta aplicando o mapa`
          : "aplicando o mapa, nenhuma inscrição saiu desta aba");
      }
    }
    return { linhas, ignoradas, abas };
  }

  /* ---------------- 9. a interpretação de cada linha ----------------
     A mesma porta da planilha canônica feita à mão: D.inscricaoCanonica.
     Por cima dela, só a conferência contra o programa de provas. */
  function provaNoPrograma(i, programa) {
    const kc = D.chaveCategoria(i.categoria);
    const naipe = i.misto ? "MISTO" : i.naipe;
    let semelhante = 0;
    for (let k = 0; k < programa.length; k++) {
      const p = programa[k];
      if (p.distancia !== i.distancia || p.estilo !== i.estilo || p.naipe !== naipe) continue;
      if (D.chaveCategoria(p.categoria) === kc) return k + 1;
      for (const parte of D.partesDaCategoria(p.categoria)) {
        const tipo = D.casaCategoria(kc, parte);
        if (tipo === "exato") return k + 1;
        if (tipo && !semelhante) semelhante = k + 1;
      }
    }
    return semelhante;
  }

  function camposInterpretados(l, programa) {
    const c = Object.assign({}, l.campos);
    if (l.escolhida != null && programa[l.escolhida]) {
      const p = programa[l.escolhida];
      return Object.assign(c, { prova: "", distancia: p.distancia, estilo: p.estilo,
                                categoria: p.rotulo || p.categoria, naipe: p.naipe });
    }
    if (l.resolvida) {
      const r = l.resolvida;
      return Object.assign(c, { prova: "", distancia: r.distancia || "",
        estilo: r.estilo || "", naipe: r.naipe || "",
        categoria: r.categoria != null ? r.categoria : c.categoria });
    }
    return c;
  }

  /**
   * Como a linha vai entrar no balizamento.
   * Devolve { inscricao, estado: "ok" | "incerto" | "erro", motivos, numero }.
   */
  const RE_DESISTIU = /\b(DESISTIU|DESISTENTE|DESISTENCIA|CANCELAD[OA]|CANCELOU|NAO VAI|RETIRAD[OA]|SUBSTITUID[OA])\b/;
  function interpretar(l, programa) {
    programa = programa || [];
    const campos = camposInterpretados(l, programa);
    const lida = D.inscricaoCanonica(campos, l.origem);
    // linha que a pessoa conferiu ou corrigiu já não carrega a dúvida da IA;
    // o que o app mesmo aponta (tempo ilegível, prova fora do programa) fica
    const motivos = (l.conferida ? [] : l.incertezas.slice()).concat(lida.avisos);
    // "DESISTIU" ou "CANCELADO" escrito na linha: o app pergunta, mesmo que o Mars não tenha visto
    const desistiu = l.conferida ? null : (l.original || []).map((x) => String(x == null ? "" : x).trim())
      .find((x) => RE_DESISTIU.test(N(x)));
    if (desistiu && !motivos.some((m) => RE_DESISTIU.test(N(m)))) motivos.push(`a planilha diz "${desistiu}" nesta linha`);
    if (l.resolvida && l.resolvida.incerto && l.escolhida == null && !l.conferida) {
      motivos.push("a prova: " + (l.resolvida.motivo || "a IA não teve certeza"));
    }
    if (!lida.inscricao) {
      return { inscricao: null, estado: "erro", motivos: lida.problemas.concat(motivos), numero: 0 };
    }
    let numero = 0;
    if (programa.length) {
      numero = provaNoPrograma(lida.inscricao, programa);
      if (!numero) motivos.push("esta prova não está no programa; ela vai aparecer na conferência como fora do programa");
      else if (l.resolvida && l.resolvida.numero && l.resolvida.numero !== numero && l.escolhida == null) {
        motivos.push(`a IA indicou a prova ${l.resolvida.numero} do programa, mas os dados levam à ${numero}`);
      }
    }
    lida.inscricao.viaIA = true;
    // "está certo" é a pessoa dizendo que olhou: a linha fica verde, e o que o
    // app estranhou continua escrito ao lado, para quem quiser ler
    return { inscricao: lida.inscricao,
             estado: motivos.length && !l.conferida ? "incerto" : "ok", motivos, numero };
  }

  /* ---------------- 10. as provas que o app não reconheceu ----------------
     Segunda chamada, só com os nomes das provas que sobraram e o programa
     oficial. Nenhum dado de atleta vai junto. */
  // `troca` mascara cada valor antes de ele entrar na descrição que vai para
  // a IA; sem ela, a descrição é a que aparece na tela
  function descricaoDaProva(c, troca) {
    troca = troca || ((v) => v);
    const partes = [];
    if (c.prova) partes.push(`prova "${troca(c.prova)}"`);
    if (c.distancia) partes.push(`distância "${troca(c.distancia)}"`);
    if (c.estilo) partes.push(`estilo "${troca(c.estilo)}"`);
    if (c.categoria) partes.push(`categoria "${troca(c.categoria)}"`);
    if (c.naipe) partes.push(`naipe "${troca(c.naipe)}"`);
    return partes.join(" · ");
  }

  function provasPendentes(linhas, programa) {
    const mapa = new Map();
    for (const l of linhas) {
      if (l.excluida || l.escolhida != null || l.resolvida) continue;
      const r = interpretar(l, programa);
      const semProva = !r.inscricao &&
        r.motivos.some((x) => /prova|distância|estilo|naipe/.test(x));
      const fora = r.inscricao && programa.length && !r.numero;
      if (!semProva && !fora) continue;
      const d = descricaoDaProva(l.campos);
      if (!d) continue;
      const k = N(d);
      if (!mapa.has(k)) mapa.set(k, { descricao: d, campos: l.campos, linhas: [] });
      mapa.get(k).linhas.push(l);
    }
    return [...mapa.values()].map((p, i) => Object.assign(p, { id: "P" + (i + 1) }));
  }

  const SISTEMA_PROVAS = `Você casa descrições de provas de natação, escritas de qualquer jeito numa planilha de inscrição, com as provas oficiais do programa da competição. Você não recebe nenhum dado de atleta. Códigos como PESSOA 3 escondem palavras que não puderam ser enviadas.

Para cada descrição, devolva:
- id: o mesmo id recebido.
- distancia: 25M, 50M, 100M, 200M, 400M, 800M ou 1500M; revezamento como 4X25M, 4X50M, 4X100M.
- estilo: LIVRE, COSTAS, PEITO, BORBOLETA ou MEDLEY. Crawl é LIVRE.
- categoria: como está escrita no programa. Quando a prova do programa junta categorias com +, devolva só a parte que corresponde a esta descrição, como PARALÍMPICO "A".
- naipe: FEM, MASC ou MISTO.
- numero_programa: o número da prova do programa que corresponde, ou null quando não houver programa ou nenhuma prova bater.
- incerto e motivo: marque incerto quando a descrição permitir mais de uma leitura, e explique numa frase curta, em português. O motivo aparece na tela para a pessoa: escreva para ela, sem falar de código, de PESSOA, de máscara nem de texto escondido.

Não invente o que a descrição não diz. Sem naipe na descrição, naipe null e incerto true, mesmo que o programa só tenha uma prova parecida.`;

  function pedidoDasProvas(pendentes, programa, m, voc) {
    const linhas = [];
    if (programa.length) {
      linhas.push("Programa oficial da competição, na ordem:");
      programa.forEach((p, k) => linhas.push(
        `${k + 1}. ${D.tituloProva(p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe)}`));
    } else {
      linhas.push("Esta competição não tem programa de provas carregado: devolva numero_programa null.");
    }
    linhas.push("", "Descrições encontradas na planilha de inscritos:");
    for (const p of pendentes) {
      linhas.push(`${p.id}: ${descricaoDaProva(p.campos, (v) => mascararCelula(v, m, voc))}`);
    }
    return { sistema: SISTEMA_PROVAS, esquema: ESQUEMA_PROVAS,
             texto: linhas.join("\n") };
  }

  function aplicarProvas(resposta, pendentes, m) {
    const porId = new Map(pendentes.map((p) => [p.id, p]));
    const sem = [];
    for (const r of resposta.provas) {
      const p = porId.get(r.id);
      if (!p) continue;
      porId.delete(r.id);
      const resolvida = {
        distancia: D.normalizarDistancia(r.distancia || ""),
        estilo: r.estilo || "", naipe: r.naipe || "",
        categoria: r.categoria == null ? null : desmascarar(r.categoria, m),
        numero: r.numero_programa || 0, incerto: !!r.incerto,
        motivo: r.motivo ? desmascarar(r.motivo, m) : "",
      };
      for (const l of p.linhas) l.resolvida = resolvida;
    }
    for (const p of porId.values()) sem.push(p.descricao);
    return { semResposta: sem };
  }

  /* ---------------- 11. plano B: a aba inteira ----------------
     Só quando o mapa não dá conta, e só depois de o usuário ver o aviso. A aba
     vai inteira, mas mascarada do mesmo jeito, e a IA transcreve linha a
     linha no formato canônico. Tudo cai na mesma revisão. */
  const SISTEMA_TRANSCRICAO = `Você ajuda um aplicativo de balizamento de natação a ler uma planilha de inscrição que chegou fora do formato. Você não monta séries nem raias e não corrige nem inventa nada: só transcreve as inscrições que estão escritas.

Você recebe a aba inteira, com o número da linha e a letra da coluna como no Excel. Para proteger os atletas, que muitas vezes são menores de idade, nomes de pessoas foram trocados por códigos como PESSOA 12, datas por DATA 3 e números longos por NUMERO 2. Copie os códigos exatamente como estão, sem tentar adivinhar o que escondem. Numa área mesclada, o valor aparece na primeira célula e as outras células da área trazem o sinal 〃; para o aplicativo, todas elas valem aquele valor. O sinal ¶ marca uma quebra de linha dentro da célula.

Devolva uma inscrição para cada atleta em cada prova:
- linha: o número da linha onde está o atleta (no revezamento, a linha da equipe).
- nome, equipe, tempo, nascimento, classe, segmento: como estão escritos, ou null.
- prova: a prova por extenso, juntando o que a planilha diz em títulos, cabeçalhos ou colunas, como "50M LIVRE".
- categoria e naipe: como estão escritos, venham da linha, de um título ou do nome da aba, ou null.
- incerto e motivo: marque incerto quando tiver dúvida e explique numa frase curta, em português. O motivo aparece na tela para a pessoa: escreva para ela, sem falar de código, de PESSOA, de máscara nem de texto escondido.

Em linhas_ignoradas, liste as linhas com conteúdo que não viraram inscrição (títulos, cabeçalhos, totais, assinaturas), com o motivo.`;

  function pedidoDaAbaInteira(grade, m, voc, perfil) {
    const amostra = montarAmostra([grade], m, voc, { inteira: true });
    const ctx = contextoDaCompeticao(perfil);
    return {
      sistema: SISTEMA_TRANSCRICAO, esquema: ESQUEMA_TRANSCRICAO,
      texto: (ctx ? ctx + "\n\n" : "") + "Transcreva as inscrições desta aba.\n\n" +
             textoDaAmostra(amostra),
      amostra,
    };
  }

  function aplicarTranscricao(resposta, grade, m) {
    const porN = new Map(grade.linhas.map((l) => [l.n, l]));
    const linhas = [], ignoradas = [], problemas = [];
    const contagem = new Map();
    for (const r of resposta.inscricoes) {
      contagem.set(r.linha, (contagem.get(r.linha) || 0) + 1);
    }
    const subs = new Map();
    for (const r of resposta.inscricoes) {
      const l = porN.get(r.linha);
      if (!l) { problemas.push(`a IA citou a linha ${r.linha}, que não tem conteúdo nesta aba`); continue; }
      const incertezas = [];
      const campos = {};
      for (const k of ["nome", "equipe", "prova", "categoria", "naipe", "tempo",
                       "nascimento", "classe", "segmento"]) {
        const bruto = r[k] == null ? "" : String(r[k]);
        const falsos = codigosDesconhecidos(bruto, m);
        if (falsos.length) incertezas.push(`a IA escreveu ${falsos.join(", ")}, que não existe na planilha`);
        campos[k] = texto(desmascarar(bruto, m));
      }
      campos.distancia = ""; campos.estilo = "";
      // quem confere a transcrição é a própria planilha: o nome e o tempo
      // têm de estar escritos na linha citada
      const linhaToda = N(l.cel.join(" "));
      if (campos.nome && !linhaToda.includes(N(campos.nome.split(/\r?\n/)[0]))) {
        incertezas.push(`o nome não está escrito na linha ${r.linha} da planilha`);
      }
      if (campos.tempo && !linhaToda.includes(N(campos.tempo))) {
        incertezas.push(`o tempo não está escrito na linha ${r.linha} da planilha`);
      }
      if (r.incerto) incertezas.push(r.motivo ? desmascarar(r.motivo, m) : "a IA não teve certeza");
      let sub;
      if (contagem.get(r.linha) > 1) {
        sub = subs.get(r.linha) || 0;
        subs.set(r.linha, sub + 1);
      }
      linhas.push({
        id: grade.aba + "|" + r.linha + (sub != null ? "|" + sub : ""),
        origem: { aba: grade.aba, linha: r.linha, sub },
        original: l.cel, campos, incertezas, via: "transcricao", excluida: false,
      });
    }
    for (const x of resposta.linhas_ignoradas) {
      const l = porN.get(x.linha);
      ignoradas.push({ aba: grade.aba, linha: x.linha, motivo: desmascarar(x.motivo, m),
                       tipo: "ignorada", original: l ? l.cel : [] });
    }
    // linha com conteúdo de que a IA não falou nada: aparece, não some
    const citadas = new Set(resposta.inscricoes.map((r) => r.linha)
      .concat(resposta.linhas_ignoradas.map((x) => x.linha)));
    for (const l of grade.linhas) {
      if (!citadas.has(l.n)) {
        ignoradas.push({ aba: grade.aba, linha: l.n, tipo: "esquecida",
                         motivo: "a IA não disse nada sobre esta linha", original: l.cel });
      }
    }
    return { linhas, ignoradas, problemas };
  }

  /* ---------------- 12. da revisão para o balizamento ---------------- */
  function inscricoesDaRevisao(linhas, programa) {
    const saida = [], pendentes = [];
    for (const l of linhas) {
      if (l.excluida) continue;
      const r = interpretar(l, programa);
      if (!r.inscricao) { pendentes.push(l); continue; }
      saida.push(r.inscricao);
    }
    return { inscricoes: saida, pendentes };
  }

  /* A planilha organizada, para guardar: da próxima vez ela entra direto,
     sem IA nenhuma, porque já está no formato canônico. A coluna ORIGEM diz
     de que aba e linha da planilha original cada inscrição veio. */
  function planilhaOrganizada(linhas, programa) {
    const cab = ["NOME", "EQUIPE", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE",
                 "TEMPO", "NASCIMENTO", "CLASSE", "SEGMENTO", "ORIGEM"];
    const dados = [cab];
    for (const l of linhas) {
      if (l.excluida) continue;
      const r = interpretar(l, programa);
      if (!r.inscricao) continue;
      const i = r.inscricao;
      const nome = i.revezamento ? (i.atletas || []).join("\n") : i.nome;
      dados.push([nome, i.equipe, i.distancia.toLowerCase(),
        i.estilo, i.categoria, { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[i.naipe] || i.naipe,
        i.tempoTexto, i.nascimento, i.classe, i.segmento,
        `aba ${l.origem.aba}, linha ${l.origem.linha}`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws["!cols"] = [{ wch: 34 }, { wch: 28 }, { wch: 10 }, { wch: 11 }, { wch: 20 },
                   { wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 26 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INSCRIÇÕES");
    return wb;
  }

  /* ---------------- 13. as linhas do programa que o app não entendeu --------
     O programa não tem dado de atleta: as linhas vão como estão, junto com as
     provas que o app já leu, para a IA ver o jeito deste programa escrever. A
     IA devolve cada linha corrigida, ou diz que ela não é prova (um recado,
     um total). O app confere a correção com os mesmos normalizadores do
     programa, e a pessoa aceita linha por linha. */
  const ESQUEMA_PROGRAMA = objeto({
    linhas: { type: "array", items: objeto({
      linha: { type: "integer" },
      e_prova: { type: "boolean" },
      distancia: TEXTO_OU_NULO,
      estilo: { anyOf: [{ type: "string",
        enum: ["LIVRE", "COSTAS", "PEITO", "BORBOLETA", "MEDLEY"] }, NULO] },
      categoria: TEXTO_OU_NULO,
      naipe: { anyOf: [{ type: "string", enum: ["FEM", "MASC", "MISTO"] }, NULO] },
      incerto: { type: "boolean" },
      motivo: TEXTO_OU_NULO,
    }) },
  });

  const SISTEMA_PROGRAMA = `Você corrige linhas de um programa de provas de natação que o aplicativo não conseguiu ler. Cada linha do programa é uma prova: distância, estilo, categoria e naipe. Você não inventa prova nenhuma: só reescreve o que está na linha.

Para cada linha recebida, devolva:
- linha: o número recebido.
- e_prova: false quando a linha não é prova (recado, total, título, linha sobrando).
- distancia: 25M, 50M, 100M, 200M, 400M, 800M ou 1500M; revezamento como 4X25M, 4X50M, 4X100M.
- estilo: LIVRE, COSTAS, PEITO, BORBOLETA ou MEDLEY. Crawl é LIVRE.
- categoria: escrita como nas outras provas deste programa.
- naipe: FEM, MASC ou MISTO.
- incerto e motivo: marque incerto quando faltar informação na linha ou ela permitir mais de uma leitura, e explique numa frase curta, em português. Quando a linha não diz o naipe ou a categoria, deixe null e marque incerto: não copie de outra linha.`;

  function pedidoDoPrograma(ruins, provasOk) {
    const L = ["Provas que o aplicativo já leu neste programa, para você ver o jeito dele escrever:"];
    provasOk.slice(0, 40).forEach((p, k) => L.push(
      `${k + 1}. ${D.tituloProva(p.distancia, p.estilo, p.rotulo || p.categoria, p.naipe)}`));
    L.push("", "Linhas que o aplicativo não entendeu (número da linha na planilha, texto e o motivo):");
    for (const l of ruins) L.push(`linha ${l.linha}: "${l.texto}" (${l.motivo})`);
    return { sistema: SISTEMA_PROGRAMA, esquema: ESQUEMA_PROGRAMA, texto: L.join("\n") };
  }

  /** As correções, conferidas: cada uma vira { linha, original, prova | null,
      naoEProva, incerto, motivo, problema }. */
  function correcoesDoPrograma(resposta, ruins) {
    const porLinha = new Map(ruins.map((l) => [l.linha, l]));
    const saida = [];
    for (const c of resposta.linhas) {
      const l = porLinha.get(c.linha);
      if (!l) continue;
      porLinha.delete(c.linha);
      const item = { linha: c.linha, original: l.texto, prova: null, naoEProva: !c.e_prova,
                     incerto: !!c.incerto, motivo: c.motivo || "", problema: "" };
      if (c.e_prova) {
        const distancia = D.normalizarDistancia(c.distancia || "");
        const estilo = D.normalizarEstilo(c.estilo || "");
        const naipe = D.normalizarNaipe(c.naipe || "");
        const categoria = texto(c.categoria);
        if (!distancia || !estilo || !naipe || !categoria) {
          item.problema = "a correção não diz " + [!distancia && "a distância", !estilo && "o estilo",
            !categoria && "a categoria", !naipe && "o naipe"].filter(Boolean).join(", ");
        } else {
          item.prova = { distancia, estilo, categoria, naipe, rotulo: categoria, numero: null,
                         etapa: "", dia: "", periodo: "" };
        }
      }
      saida.push(item);
    }
    // linha de que a IA não falou: continua como estava, e aparece
    for (const l of porLinha.values()) {
      saida.push({ linha: l.linha, original: l.texto, prova: null, naoEProva: false,
                   incerto: true, motivo: "", problema: "a IA não disse nada sobre esta linha" });
    }
    return saida.sort((a, b) => a.linha - b.linha);
  }

  /* O programa refeito com as correções aceitas: a linha corrigida entra na
     posição dela, herdando a etapa da prova de cima; a que não é prova sai. */
  function programaCorrigido(r, aceitas) {
    const porLinha = new Map(aceitas.map((c) => [c.linha, c]));
    const linhas = [];
    let anterior = null;
    for (const l of r.linhas) {
      const c = porLinha.get(l.linha);
      if (c && c.naoEProva) continue;
      if (c && c.prova) {
        const p = Object.assign({}, c.prova, anterior
          ? { etapa: anterior.etapa, dia: anterior.dia, periodo: anterior.periodo } : {});
        linhas.push({ linha: l.linha, texto: l.texto, ok: true, prova: p, corrigida: true });
        anterior = p;
        continue;
      }
      linhas.push(l);
      if (l.ok) anterior = l.prova;
    }
    // prova repetida colocaria os mesmos atletas em duas provas
    const vistas = new Map();
    for (const l of linhas) {
      if (!l.ok) continue;
      const k = D.chaveProva(l.prova.distancia, l.prova.estilo, l.prova.categoria, l.prova.naipe);
      if (vistas.has(k)) {
        l.ok = false;
        l.motivo = "esta prova já aparece na linha " + vistas.get(k);
      } else vistas.set(k, l.linha);
    }
    const provas = linhas.filter((l) => l.ok).map((l) => l.prova);
    return Object.assign({}, r, { linhas, provas, problemas: [],
      ok: provas.length > 0 && linhas.every((l) => l.ok) });
  }

  // o programa no modelo do app, para guardar e usar de novo sem IA
  function planilhaDoPrograma(provas) {
    const dados = [["Nº", "DISTÂNCIA", "ESTILO", "CATEGORIA", "NAIPE", "ETAPA", "DIA", "PERÍODO"]];
    provas.forEach((p, k) => dados.push([k + 1, String(p.distancia).toLowerCase(), p.estilo,
      p.rotulo || p.categoria, { FEM: "FEMININO", MASC: "MASCULINO", MISTO: "MISTO" }[p.naipe] || p.naipe,
      p.etapa || "", p.dia || "", p.periodo || ""]));
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws["!cols"] = [{ wch: 5 }, { wch: 11 }, { wch: 12 }, { wch: 26 }, { wch: 12 },
                   { wch: 14 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PROGRAMA");
    return wb;
  }

  const api = {
    MODELO, CAMPOS, LAYOUTS,
    ESQUEMA_PROGRAMA, SISTEMA_PROGRAMA, pedidoDoPrograma, correcoesDoPrograma,
    programaCorrigido, planilhaDoPrograma,
    lerGrades, vocabulario, novaMascara, mascararCelula, desmascarar,
    codigosDesconhecidos, montarAmostra, textoDaAmostra,
    ESQUEMA_MAPA, ESQUEMA_PROVAS, ESQUEMA_TRANSCRICAO, validarEsquema,
    ErroIA, chamar, conferirResposta, explicarErro,
    SISTEMA_MAPA, SISTEMA_PROVAS, SISTEMA_TRANSCRICAO,
    pedidoDoMapa, conferirMapa, aplicarMapa,
    interpretar, provaNoPrograma, descricaoDaProva, provasPendentes,
    pedidoDasProvas, aplicarProvas,
    pedidoDaAbaInteira, aplicarTranscricao,
    inscricoesDaRevisao, planilhaOrganizada,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BalizadorIA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
