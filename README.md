# Balizador

Aplicativo para montar o balizamento de competições de natação: distribui os
atletas em séries e raias, gera as papeletas e aponta erros de inscrição.

Roda inteiramente no navegador. **Nenhum dado é enviado para servidor nenhum** —
a planilha é lida e os arquivos são gerados na máquina de quem usa.

## O que faz

- Monta séries e raias com a ordem de preenchimento do centro para fora
  (6 raias → 3‑4‑2‑5‑1‑6; 8 raias → 4‑5‑3‑6‑2‑7‑1‑8)
- Baliza por tempo de inscrição quando ele existe: o melhor tempo vai para a
  raia central da última série
- Confere raia duplicada, atleta repetido na mesma prova, atleta acima do
  limite de provas e inscrição contra o regulamento
- Valida a classe funcional do paradesporto contra o mapa de provas
- Gera a planilha do balizamento, o PDF e as papeletas de raia

## Como usar

Abra o endereço do site, ou baixe o `index.html` e abra com duplo clique —
funciona igual, inclusive sem internet.
