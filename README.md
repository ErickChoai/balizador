# Balizador

Balizamento de natação feito por um árbitro: séries e raias, conferência das
inscrições, PDF e papeletas. O Mars, assistente de inteligência artificial,
conduz cada etapa e arruma as planilhas que chegam fora do formato.

Criado por Erick Choai.

| | |
|---|---|
| Página de entrada | https://erickchoai.github.io/balizador/ |
| Balizador no claude.ai, com o Mars | https://claude.ai/artifact/2GoSak7GpAhsDbZLT6KLU6 |
| Versão offline, sem IA | https://erickchoai.github.io/balizador/anterior/ (etiqueta `site-antes-da-ia`) |

## Como usar no seu claude.ai

1. Abra o link do Balizador com a sua conta do claude.ai. Ali você vê uma
   prévia da demonstração, com respostas já preparadas do Mars.
2. No alto da página, toque em **Balizador** e depois em **Duplicar**.
3. Na sua cópia, o Mars conversa ao vivo e lê as suas planilhas. Na primeira
   fala, o claude.ai pede para você continuar, e o uso conta nos limites da
   sua conta.

O claude.ai só deixa a página usar o Claude na conta de quem a tem. Na cópia,
a conta é a sua, e as suas planilhas ficam com você.

## O que ele faz

1. **Programa.** Lê a lista de provas, com etapas e numeração por etapa. O Mars
   corrige as linhas que o app não entende, e você confere uma por uma.
2. **Competição.** Raias, provas por atleta, tempo de inscrição, revezamento e
   paradesporto.
3. **Inscritos.** Uma planilha ou as fichas de várias equipes de uma vez. As
   que chegam fora do formato, o Mars reescreve no modelo do app.
4. **Conferência.** Nove checagens em cada inscrição: atleta repetido na prova,
   atleta em provas demais, tempo impossível, atleta em duas idades, meninos e
   meninas juntos, prova que não está na lista, inscrição contra as regras,
   duas datas de nascimento e a mesma pessoa em duas escolas. Cada problema
   vem com a correção proposta, e nada muda sem o seu Sim.
5. **Arquivos.** O PDF das séries e raias, as papeletas de raia e a planilha
   em XLSX.

As séries seguem a regra da natação: o mais rápido nada no meio da última
série, e as raias se enchem do centro para fora (com 6 raias: 3, 4, 2, 5, 1,
6; com 8 raias: 4, 5, 3, 6, 2, 7, 1, 8).

## O Mars

- Conduz a conversa, um cartão de cada vez, com o cronômetro e o placar das
  decisões no fim.
- Reescreve planilhas de qualquer formato, corrige o programa de provas e
  explica cada problema da conferência.
- Responde dúvidas sobre as regras oficiais da natação (World Aquatics, na
  tradução da CBDA) e da natação paralímpica (manual de oficiais do IPC),
  sempre citando a regra.

O que ele não faz:

- **Não muda nada sozinho.** Toda mudança chega num cartão com Sim e Não.
- **Não monta séries nem raias.** Isso é regra do app, igual para todos.
- **Não vê o nome dos atletas.** Cada nome vai ao Mars trocado por um código,
  como PESSOA 1, e volta só na tela de quem usa.
- **Não passa resposta sem conferir.** Tudo o que o Mars devolve passa por um
  validador antes de ser usado.

## Os seus dados

- O Balizador roda no navegador. O site não recebe planilha nenhuma.
- No claude.ai, só vai ao Claude o que você pede, pela sua conta e com os
  nomes trocados por código.
- Este repositório não guarda planilhas nem balizamentos (veja o
  `.gitignore`), porque eles têm dados de atletas, muitas vezes menores de
  idade.

## Como o código está organizado

| Arquivo | O que faz |
|---|---|
| `index.html` | a página de entrada |
| `app/balizador.core.js` | séries e raias, leitura de tempos e as conferências |
| `app/balizador.dados.js` | leitura das planilhas e do programa de provas |
| `app/balizador.saida.js` | o PDF, as papeletas e a planilha do balizamento |
| `app/balizador.ia.js` | os pedidos ao Mars, a troca de nomes por código e o validador |
| `app/balizador.regras.js` | os trechos das regras oficiais e a busca neles |
| `app/balizador.exemplos.js` | o campeonato da demonstração e as respostas preparadas |
| `app/balizador.app.js` | os cinco passos da tela completa |
| `app/balizador.conversa.js` | a conversa com o Mars |
| `app/corpo.html` e `app/estilo.css` | a estrutura e a aparência |
| `app/montar.js` | junta tudo num arquivo só |
| `anterior/` | a versão de antes da IA |

## Como montar

```bash
cd app
npm install
node montar.js
```

O `montar.js` gera o `app/index.html`, que é o publicado no GitHub Pages, e,
na pasta acima do repositório, o `BALIZADOR.html` (um arquivo só, para abrir
com duplo clique, sem internet) e o `BALIZADOR-CLAUDE.html`, que é o publicado
no claude.ai.

## Testes

O Balizador foi comparado com duas competições reais e três planilhas de
gabarito:

| Comparação | Casos | Resultado |
|---|---|---|
| ParaJASC, classificação | 942 | idêntico |
| ParaJASC, cortes | 78 | idêntico |
| JEPB, provas remontadas | 72 | idêntico |
| JEPB, atletas | 703 | idêntico |
| IA simulada, inscrições do gabarito | 124 | 124 de 124 |
| IA, nomes de atleta enviados | 0 | nenhum |

No claude.ai, o Mars foi testado com planilhas cheias de erros plantados: uma
ficha de cinco escolas com 67 erros, e 13 fichas de equipes diferentes
enviadas de uma vez.
