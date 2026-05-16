// Cloudflare Worker — Quiz Result Receiver
// KV Binding required: QUIZ_KV

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    // ── POST /  — receive quiz result ───────────────────
    if (request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return cors(new Response("Invalid JSON", { status: 400 }));
      }

      const required = ["name", "score", "total", "startTime", "submitTime"];
      for (const f of required) {
        if (data[f] === undefined) {
          return cors(new Response(`Missing field: ${f}`, { status: 400 }));
        }
      }

      const id = `result_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await env.QUIZ_KV.put(id, JSON.stringify({ id, receivedAt: new Date().toISOString(), ...data }));

      return cors(new Response(JSON.stringify({ ok: true, id }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }

    // ── GET /  — display all results ────────────────────
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      const list = await env.QUIZ_KV.list({ prefix: "result_" });
      const records = await Promise.all(
        list.keys.map(k => env.QUIZ_KV.get(k.name, "json"))
      );
      records.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));

      return new Response(renderHTML(records), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // ── GET /data  — raw JSON dump ───────────────────────
    if (request.method === "GET" && url.pathname === "/data") {
      const list = await env.QUIZ_KV.list({ prefix: "result_" });
      const records = await Promise.all(
        list.keys.map(k => env.QUIZ_KV.get(k.name, "json"))
      );
      records.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));
      return cors(new Response(JSON.stringify(records, null, 2), {
        headers: { "Content-Type": "application/json" }
      }));
    }

    return new Response("Not found", { status: 404 });
  }
};

// ── CORS wrapper ─────────────────────────────────────────
function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

// ── HTML renderer ─────────────────────────────────────────
function renderHTML(records) {
  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  }

  function dur(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const rows = records.map(r => {
    const pct = Math.round((r.score / r.total) * 100);
    const colour = pct === 100 ? "#38a169" : pct >= 70 ? "#4f46e5" : pct >= 50 ? "#d69e2e" : "#e53e3e";

    const answerRows = (r.answers || []).map(a =>
      `<tr>
        <td>${a.question}</td>
        <td style="color:${a.correct ? "#38a169" : "#e53e3e"}">${a.chosen}</td>
        <td style="color:#38a169">${a.correctAnswer}</td>
        <td style="text-align:center">${a.correct ? "✅" : "❌"}</td>
      </tr>`
    ).join("");

    return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="name">${esc(r.name)}</div>
          <div class="times">
            Start: ${fmt(r.startTime)}<br>
            Submit: ${fmt(r.submitTime)}<br>
            Duration: ${dur(r.durationSeconds || 0)}<br>
            Received: ${fmt(r.receivedAt)}
          </div>
        </div>
        <div class="score-circle" style="border-color:${colour};color:${colour}">
          ${r.score}/${r.total}
          <small>${pct}%</small>
        </div>
      </div>
      ${r.answers && r.answers.length ? `
      <details>
        <summary>View answers (${r.answers.length})</summary>
        <table>
          <thead><tr><th>Question</th><th>Chosen</th><th>Correct</th><th>✓</th></tr></thead>
          <tbody>${answerRows}</tbody>
        </table>
      </details>` : ""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quiz Results</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f0f4f8; color: #2d3748; padding: 24px 16px 48px; }
  h1 { font-size: 1.5rem; font-weight: 800; color: #1a202c; margin-bottom: 4px; }
  .subtitle { color: #718096; font-size: 0.9rem; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.07);
    margin-bottom: 16px; padding: 20px; max-width: 720px; margin-left: auto; margin-right: auto; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .name { font-size: 1.15rem; font-weight: 700; color: #1a202c; margin-bottom: 6px; }
  .times { font-size: 0.8rem; color: #718096; line-height: 1.7; }
  .score-circle {
    width: 72px; height: 72px; border-radius: 50%;
    border: 4px solid; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-size: 1.1rem; font-weight: 800; flex-shrink: 0;
  }
  .score-circle small { font-size: 0.7rem; font-weight: 500; }
  details { margin-top: 16px; }
  summary { cursor: pointer; color: #4f46e5; font-size: 0.88rem; font-weight: 600;
    padding: 8px 0; user-select: none; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.83rem; }
  th { text-align: left; padding: 8px 10px; background: #f7fafc; color: #718096;
    border-bottom: 1px solid #e2e8f0; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f4f8; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .empty { text-align: center; color: #a0aec0; padding: 48px 0; font-size: 1rem; }
  .json-link { display: inline-block; margin-bottom: 20px; font-size: 0.85rem;
    color: #4f46e5; text-decoration: none; }
  @media(max-width:480px) {
    .card-header { flex-direction: column-reverse; }
    .score-circle { align-self: flex-end; }
  }
</style>
</head>
<body>
<h1>📊 Quiz Results</h1>
<p class="subtitle">${records.length} submission${records.length !== 1 ? "s" : ""} — newest first</p>
<a class="json-link" href="/data">↓ Raw JSON</a>
${records.length === 0
  ? `<div class="empty">No submissions yet.</div>`
  : rows}
</body>
</html>`;
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
