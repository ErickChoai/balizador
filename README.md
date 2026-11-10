# Balizador

Aplicativo para montar o balizamento de competições de natação: distribui os
atletas em séries e raias, gera as papeletas e aponta erros de inscrição.

Roda no navegador. A planilha é lida e os arquivos são gerados na máquina de
quem usa, e **nenhum dado sai dela**, com uma exceção só: quando o app é aberto
pelo link do claude.ai, a etapa opcional **Organizar com IA** e a **conversa
com o Claude** mandam para o Claude o que você pede, com os nomes dos atletas
trocados por código, pela sua própria conta Claude. As duas estão explicadas
logo abaixo.

## O que faz

- Monta séries e raias com a ordem de preenchimento do centro para fora
  (6 raias: 3, 4, 2, 5, 1, 6; 8 raias: 4, 5, 3, 6, 2, 7, 1, 8)
- Baliza por tempo de inscrição quando ele existe: o melhor tempo vai para a
  raia central da última série
- Confere raia duplicada, atleta repetido na mesma prova, atleta acima do
  limite de provas e inscrição contra o regulamento
- Valida a classe funcional do paradesporto contra o mapa de provas
- Gera a planilha do balizamento, o PDF e as papeletas de raia

## Como usar

Há dois jeitos de abrir, com o mesmo app:

- **Pelo link do claude.ai**
  (https://claude.ai/artifact/2GoSak7GpAhsDbZLT6KLU6): quem abre entra com a
  própria conta Claude, e aí
  aparecem a conversa com o Claude e a etapa Organizar com IA. O uso da IA sai
  da conta de quem está usando, sem chave nenhuma.
- **Pelo site do GitHub Pages**, ou baixando o `index.html` e abrindo com duplo
  clique: funciona igual, inclusive sem internet, só que sem a IA e sem a
  conversa.

A versão de antes da IA continua no ar, sem nenhuma mudança, em
https://erickchoai.github.io/balizador/anterior/, e guardada no git na
etiqueta `site-antes-da-ia`.

## A conversa com o Claude

No claude.ai, um painel ao lado dos cinco passos conversa com você. Ele diz por
onde começar, o que falta para gerar os arquivos e o que cada bloco da
conferência quer dizer. Quando você pede, ele preenche a tela da competição
(raias, limites, datas, se tem tempo, revezamento ou paradesporto) e leva você
ao passo certo.

Ele não monta séries nem raias, não gera arquivo e não manda planilha para a
IA por conta própria: essas coisas continuam com o app e com você. Cada
mensagem leva um resumo da tela, com os nomes dos atletas trocados por código,
e o nome volta só na sua tela. Os cinco passos funcionam do mesmo jeito sem
abrir a conversa.

## Organizar com IA

### O problema

A planilha de inscritos chega do jeito de cada escola: uma ficha por escola
com as provas marcadas com X, uma lista corrida com os cabeçalhos que cada
coordenação inventa, uma ficha única com o título de cada prova mesclado em
cima dos atletas. O app é exigente de propósito: se a planilha não está no
formato que ele entende, ele recusa e explica, porque um balizamento errado
sem ninguém perceber é pior do que nenhum. Até aqui, sobrava para o árbitro
redigitar tudo.

### Por que IA

Entender a **estrutura** de uma planilha desconhecida (onde está o nome, onde
está a prova, que linha é título, que linha é o total) é o tipo de coisa que
regra fixa não dá conta, porque cada planilha é de um jeito. Um modelo de
linguagem lê isso como uma pessoa leria. O resto do trabalho continua com
regra fixa, que é onde ela é melhor.

### Onde ela entra e onde não entra

```
planilha recusada
   │
   ├─ 1. leitura local: todas as abas, mesclas desfeitas, linhas vazias fora
   ├─ 2. amostra mascarada (começo, meio e fim de cada aba), mostrada antes
   ├─ 3. IA: devolve um MAPA, em JSON de esquema fixo        ◄── IA
   ├─ 4. o mapa é aplicado aqui, em todas as linhas
   ├─ 5. IA: casa os nomes de prova que sobraram com o programa  ◄── IA
   │       (só os nomes de prova, nenhum dado de atleta)
   ├─ 6. revisão humana, linha original ao lado da interpretada
   │
   └─ formato canônico ─► conferências ─► séries e raias ─► PDF e papeletas
                          (as de sempre, sem IA nenhuma)
```

- **A IA só transcreve e organiza.** Séries e raias continuam sendo montadas
  pelas regras do app.
- **Toda saída passa pelas mesmas conferências**: atleta repetido, limite de
  provas, tempo impossível, classe, regulamento. A inscrição organizada pela
  IA entra pela mesma porta da planilha lida do jeito normal.
- **Revisão humana obrigatória.** Antes de balizar, uma tela mostra cada linha
  da planilha original ao lado de como ela vai entrar. O que a IA marcou como
  incerto sai em amarelo; o que não pode entrar sai em vermelho e tranca o
  botão de seguir. Dá para corrigir, tirar uma linha, ou transformar em
  inscrição uma linha que a IA deixou de fora.
- **Rastreabilidade.** Cada inscrição guarda a aba e a linha de onde veio, e é
  esse endereço que aparece na conferência.
- **Resposta que não serve não avança.** O pedido exige JSON de esquema fixo,
  e a resposta é conferida de novo no app por um validador escrito à mão
  antes de ser usada. Também se confere se as abas, colunas e linhas citadas
  existem. Resposta inválida, recusada pelo modelo ou cortada no meio aparece
  como erro, com o motivo, e nada do que veio é usado.

### Cuidados com os dados

Competição escolar tem dados de menores. Por isso:

- **Desligada por padrão.** O botão só aparece quando a planilha é recusada,
  e nada sai sem você ver o texto exato que vai e clicar em enviar. Na
  primeira vez, o próprio claude.ai também pede a sua licença.
- **Vai uma amostra, não a planilha.** Umas vinte linhas por aba. A IA devolve
  um mapa, e o app aplica o mapa localmente no resto. A aba inteira só vai se
  o mapa não der conta dela, e só depois de um aviso com o que vai.
- **Nomes trocados por código em qualquer envio.** Todo texto que não é prova,
  tempo, número curto, cabeçalho conhecido, categoria, classe ou nome de
  instituição vira `PESSOA 1`, `PESSOA 2`. Datas viram `DATA 1`; números
  longos, como registro e telefone, viram `NUMERO 1`. A tabela de troca fica
  só na memória da página: fechou, sumiu. O nome volta só na sua tela.
- **A segunda chamada não leva atleta nenhum**: só os nomes de prova que o app
  não reconheceu sozinho e o programa oficial.
- **Sem servidor no meio e sem chave.** A página fala com o Claude pelo próprio
  claude.ai, na conta de quem está usando. O site do Balizador não recebe
  nada, e não existe chave para guardar ou vazar.

### Como usar

1. Abra o Balizador pelo link do claude.ai, com a sua conta Claude.
2. Envie a planilha de inscritos. Se ela for recusada, aparece
   **Organizar com IA**.
3. Veja a amostra, com os códigos destacados, e o texto exato do pedido.
   Clique em **Enviar a amostra para a IA**. Na primeira vez, o claude.ai pede
   a sua licença para o app usar o Claude.
4. Se sobrarem provas que o app não casou com o programa, ele mostra quais e
   pede para mandar só os nomes delas.
5. Revise, corrija o que precisar e clique em **Confirmar e seguir para a
   conferência**. Dali em diante é o app de sempre.
6. Se quiser, baixe a **planilha organizada**: ela já está no formato do app e,
   da próxima vez, entra direto, sem IA.

Para ver funcionando sem planilha própria, o passo 1 do app oferece o
programa do JEPB 2026 de exemplo e três planilhas fora do formato, com dados
inventados.

### Detalhes técnicos

- O app é publicado como Artifact no claude.ai e chama o Claude pela função
  `sample` que a plataforma entrega à página (`claude.use("sample")`). Pede o
  modelo `claude-opus-5-5`, com esforço `medium` e sem guardar resposta; se a
  conta de quem usa não tiver esse modelo, responde o mais capaz que ela
  tiver. Como essa função não aceita esquema nem instrução de sistema, os dois
  vão no texto do pedido, e a resposta é conferida pelo validador do app.
- Lá dentro a página não baixa arquivo sozinha: o PDF, a planilha e as
  papeletas saem pela função `downloads` da plataforma, que mostra o nome do
  arquivo e pergunta antes de salvar.
- A conversa usa a mesma função `sample`, com três funções da página que o
  Claude pode chamar: preencher a competição, ir para um passo e abrir a tela
  de organizar com IA.
- `node app/montar.js` gera o `index.html` do site e, na pasta do projeto, o
  `BALIZADOR.html` (offline) e o `BALIZADOR-CLAUDE.html`, que é o que vai para
  o claude.ai.
- Código em `app/balizador.ia.js` (máscara, amostra, esquemas, validação,
  aplicação do mapa e chamadas) e a tela em `app/balizador.app.js`. O destino
  de tudo é o formato canônico de `app/balizador.dados.js`
  (`inscricaoCanonica`), o mesmo de quem monta a planilha à mão nesse formato.
- Testado com respostas simuladas nas três planilhas de exemplo: o resultado
  é comparado com o gabarito de cada uma, e o texto enviado é conferido para
  não ter nenhum nome nem data de nascimento.
