/* =====================================================================
   O Mars pelo servidor do Balizador

   No claude.ai, o Mars usa a conta de quem publicou o Balizador (a função
   "sample" do claude.ai). Em 13/11/2026 o dono viu que outra conta, mesmo
   convidada, fica sem o Mars; e a banca não ia ter como usar. Fora do
   claude.ai, no site do GitHub, o Mars passa a falar com o Claude por um
   servidor pequeno (servidor/mars-worker.js, no Cloudflare), que guarda a
   chave da API do dono. A chave nunca chega ao navegador.

   Esta peça imita o jeito de chamar do claude.ai (sample, sample.json e
   sample.limits), para o resto do app não mudar: as mesmas travas, os
   mesmos cartões, os nomes dos atletas trocados por código antes de sair.
   ===================================================================== */
(function () {
  "use strict";

  // o endereço do servidor publicado no Cloudflare; vazio, o app fica sem o Mars fora do claude.ai
  const ENDERECO = "";
  const CHAVE_SENHA = "balizador.senhaMars";
  const MAX_RODADAS = 10;

  const lerSenha = () => { try { return localStorage.getItem(CHAVE_SENHA) || ""; } catch (e) { return ""; } };
  const gravarSenha = (s) => { try { localStorage.setItem(CHAVE_SENHA, s); } catch (e) { /* sem memória */ } };

  function criar(url) {
    async function enviar(corpo, signal, deNovo) {
      const cab = { "Content-Type": "application/json" };
      const senha = lerSenha();
      if (senha) cab["X-Senha-Mars"] = senha;
      let r;
      try {
        r = await fetch(url, { method: "POST", headers: cab, body: JSON.stringify(corpo), signal });
      } catch (e) {
        if (e && e.name === "AbortError") throw { code: "cancelled", message: "Parado." };
        throw { code: "network_error", message: "Não consegui falar com o servidor do Mars." };
      }
      const texto = await r.text();
      let d = null;
      try { d = JSON.parse(texto); } catch (e) { /* resposta sem JSON */ }
      if (r.ok && d) return d;
      // a senha da banca: pedida uma vez, guardada neste navegador
      if (r.status === 401 && d && d.code === "senha" && !deNovo) {
        const s = window.prompt("Senha do Mars:");
        if (s) { gravarSenha(s.trim()); return enviar(corpo, signal, true); }
      }
      const tipo = d && d.error && d.error.type;
      const code = (d && d.code) ||
        (r.status === 429 || tipo === "rate_limit_error" ? "rate_limited"
          : r.status === 529 || tipo === "overloaded_error" ? "overloaded"
          : r.status === 413 ? "prompt_too_large"
          : r.status === 400 || tipo === "invalid_request_error" ? "invalid_request"
          : "servidor_falhou");
      throw { code, message: (d && (d.message || (d.error && d.error.message))) || ("HTTP " + r.status) };
    }

    const mensagens = (input) => (typeof input === "string"
      ? [{ role: "user", content: input }]
      : (input || []).map((m) => ({ role: m.role, content: m.content })));

    /* sample(input, opcoes): a conversa, com as ferramentas do app.
       Cada rodada vai inteira ao servidor; quando o Claude pede uma
       ferramenta, o app executa aqui mesmo e devolve o resultado, como o
       claude.ai faz. O texto é o da última rodada que escreveu. */
    async function sample(input, opcoes) {
      const o = opcoes || {};
      const msgs = mensagens(input);
      // as instruções vêm iguais em toda chamada: ficam no cache da API, mais rápido e mais barato
      const primeira = msgs[0];
      if (primeira && typeof primeira.content === "string" && primeira.content.length > 3000) {
        msgs[0] = { role: primeira.role, content: [{ type: "text", text: primeira.content, cache_control: { type: "ephemeral" } }] };
      }
      const ferramentas = o.tools || [];
      const tools = ferramentas.map((t) => ({
        name: t.name, description: t.description || "",
        input_schema: t.inputSchema || { type: "object", properties: {} },
      }));
      const modelo = o.model || (o.modelTier === "quick" ? "claude-haiku-5-5" : undefined);
      let ultimo = "";
      for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
        const d = await enviar({
          model: modelo, max_tokens: o.maxTokens || 16000, effort: o.effort,
          messages: msgs, tools: tools.length ? tools : undefined,
        }, o.signal);
        if (d.stop_reason === "refusal") throw { code: "refused", message: "O Claude recusou o pedido." };
        const blocos = Array.isArray(d.content) ? d.content : [];
        const texto = blocos.filter((b) => b.type === "text").map((b) => b.text).join("");
        if (texto) {
          ultimo = texto;
          if (o.onText) o.onText({ text: texto, delta: texto });
        }
        const pedidos = blocos.filter((b) => b.type === "tool_use");
        if (d.stop_reason !== "tool_use" || !pedidos.length) {
          if (!ultimo) throw { code: "empty_completion", message: "Sem resposta." };
          return { text: ultimo, truncated: d.stop_reason === "max_tokens" };
        }
        // a resposta do Claude volta inteira, como veio, e as ferramentas respondem logo depois
        msgs.push({ role: "assistant", content: blocos });
        const resultados = [];
        for (const p of pedidos) {
          const f = ferramentas.find((t) => t.name === p.name);
          let conteudo = "", erro = false;
          try {
            if (!f) throw new Error("Ferramenta desconhecida: " + p.name);
            const v = await f.execute(p.input || {}, { signal: o.signal });
            conteudo = typeof v === "string" ? v : JSON.stringify(v == null ? null : v);
          } catch (e) {
            erro = true;
            conteudo = String((e && e.message) || e || "erro");
          }
          const r = { type: "tool_result", tool_use_id: p.id, content: conteudo || "(vazio)" };
          if (erro) r.is_error = true;
          resultados.push(r);
        }
        msgs.push({ role: "user", content: resultados });
      }
      throw { code: "invalid_request", message: "O Mars usou ferramentas demais numa resposta só." };
    }

    // sample.json: a resposta em JSON, sem ferramentas, com mais espaço para a planilha reescrita
    sample.json = async function (input, opcoes) {
      const r = await sample(input, Object.assign({}, opcoes, { tools: undefined, maxTokens: 32000 }));
      let t = String(r.text || "").trim();
      const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (cerca) t = cerca[1].trim();
      const ini = t.search(/[[{]/);
      if (ini > 0) t = t.slice(ini);
      try { return JSON.parse(t); } catch (e) {
        throw { code: "invalid_json", message: "A resposta não veio em JSON.", text: r.text };
      }
    };

    sample.limits = async () => ({ tools: { maxCount: 30 }, images: false, modelTiers: ["quick", "default", "complex"] });
    return sample;
  }

  window.BalizadorServidor = { ENDERECO, criar };
})();
