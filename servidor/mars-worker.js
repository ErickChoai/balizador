/* =====================================================================
   O servidor do Mars (Cloudflare Worker)

   Fora do claude.ai, o Balizador do GitHub fala com o Claude por aqui. A
   chave da API fica só neste servidor, guardada pelo Cloudflare como
   segredo (ANTHROPIC_API_KEY). Ela nunca vai para o navegador nem para o
   repositório.

   Variáveis do Worker (Settings > Variables and Secrets):
     ANTHROPIC_API_KEY  segredo, obrigatório: a chave da API da Anthropic
     SENHA              segredo, opcional: com ela, o app pede a senha antes
                        de o Mars responder (para deixar só a banca usar)
     ORIGENS            opcional: os endereços que podem usar o servidor,
                        separados por vírgula
     MODELO             opcional: o modelo quando o app não diz qual

   O servidor só repassa ao Claude o que o Balizador usa: a conversa, as
   ferramentas do app e o nível de esforço. Ele não guarda nada.
   ===================================================================== */

const ORIGENS_PADRAO = "https://erickchoai.github.io,http://localhost:8765,http://127.0.0.1:8765";
const MODELOS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
const ESFORCOS = ["low", "medium", "high"];
const MAX_TOKENS = 32000;
const MAX_CORPO = 900000;   // caracteres: a planilha reescrita é o maior pedido

export default {
  async fetch(request, env) {
    const origem = request.headers.get("Origin") || "";
    const permitidas = String(env.ORIGENS || ORIGENS_PADRAO).split(",").map((s) => s.trim()).filter(Boolean);
    const origemOk = permitidas.includes(origem);
    const cors = {
      "Access-Control-Allow-Origin": origemOk ? origem : permitidas[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Senha-Mars",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const responder = (obj, status) => new Response(JSON.stringify(obj), {
      status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors),
    });

    if (request.method === "OPTIONS") return new Response(null, { status: origemOk ? 204 : 403, headers: cors });
    // aberto no navegador: diz se está no ar, sem gastar nada
    if (request.method === "GET") {
      return responder({ ok: true, servico: "Mars do Balizador", chave: !!env.ANTHROPIC_API_KEY, senha: !!env.SENHA }, 200);
    }
    if (request.method !== "POST") return responder({ code: "invalid_request", message: "Use POST." }, 405);
    if (!origemOk) return responder({ code: "not_granted", message: "Este endereço não pode usar o Mars." }, 403);
    if (env.SENHA && request.headers.get("X-Senha-Mars") !== env.SENHA) {
      return responder({ code: "senha", message: "Senha do Mars errada ou ausente." }, 401);
    }
    if (!env.ANTHROPIC_API_KEY) return responder({ code: "sem_chave", message: "O servidor está sem a chave da API." }, 500);

    const bruto = await request.text();
    if (bruto.length > MAX_CORPO) return responder({ code: "prompt_too_large", message: "Pedido grande demais." }, 413);
    let corpo;
    try { corpo = JSON.parse(bruto); } catch (e) { return responder({ code: "invalid_request", message: "Pedido sem JSON." }, 400); }
    if (!Array.isArray(corpo.messages) || !corpo.messages.length) {
      return responder({ code: "invalid_request", message: "Pedido sem mensagens." }, 400);
    }

    const pedido = {
      model: MODELOS.includes(corpo.model) ? corpo.model : (MODELOS.includes(env.MODELO) ? env.MODELO : "claude-opus-5-5"),
      max_tokens: Math.max(256, Math.min(Number(corpo.max_tokens) || 16000, MAX_TOKENS)),
      messages: corpo.messages,
    };
    if (Array.isArray(corpo.tools) && corpo.tools.length) {
      pedido.tools = corpo.tools.slice(0, 40).map((t) => ({
        name: String(t.name || ""), description: String(t.description || ""),
        input_schema: t.input_schema && typeof t.input_schema === "object" ? t.input_schema : { type: "object", properties: {} },
      }));
    }
    if (ESFORCOS.includes(corpo.effort)) pedido.output_config = { effort: corpo.effort };

    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2026-10-21",
        },
        body: JSON.stringify(pedido),
      });
    } catch (e) {
      return responder({ code: "servidor_falhou", message: "O servidor não conseguiu falar com o Claude." }, 502);
    }
    // a resposta da API passa como veio: o app lê o texto, as ferramentas e os erros
    return new Response(await r.text(), {
      status: r.status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors),
    });
  },
};
