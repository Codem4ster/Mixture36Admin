// ─── In-memory store ───────────────────────────────────────────────────────
// Lives only while this isolate is active. No KV, no Durable Objects.
// Submissions disappear if Cloudflare spins down the isolate — intentional.
let submissions = [];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Receive a quiz submission
    if (req.method === 'POST' && pathname === '/submit') {
      try {
        const body = await req.json();
        submissions.unshift({ ...body, receivedAt: new Date().toISOString() });
        if (submissions.length > 500) submissions.length = 500;
        return new Response('{"ok":true}', {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response('{"ok":false}', {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // Polled by the admin UI every 3 seconds
    if (pathname === '/data') {
      return new Response(JSON.stringify(submissions), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Serve the admin dashboard
    return new Response(ADMIN_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quiz Admin</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
header {
  background: #1e293b; border-bottom: 1px solid #334155;
  padding: 14px 24px; display: flex; align-items: center; gap: 10px;
  position: sticky; top: 0; z-index: 10;
}
header h1 { font-size: 1.1rem; color: #f1f5f9; font-weight: 600; }
.live-wrap { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 0.83rem; color: #94a3b8; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.dot.live { animation: blink 2s infinite; }
.dot.err  { background: #ef4444; animation: none; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
main { padding: 20px 16px 40px; max-width: 900px; margin: 0 auto; }
.stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 20px; }
.stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 14px; text-align: center; }
.stat .n { font-size: 1.9rem; font-weight: 700; color: #818cf8; line-height: 1; }
.stat .l { font-size: 0.75rem; color: #64748b; margin-top: 4px; }
.cards { display: flex; flex-direction: column; gap: 12px; }
.card { background: #1e293b; border: 1px solid #334155; border-radius: 13px; padding: 16px; }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.uname { font-weight: 600; color: #f1f5f9; font-size: 1rem; }
.badge { padding: 4px 10px; border-radius: 99px; font-size: 0.82rem; font-weight: 600; }
.badge.hi  { background: #14532d; color: #86efac; }
.badge.mid { background: #422006; color: #fcd34d; }
.badge.lo  { background: #450a0a; color: #fca5a5; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 0.8rem; color: #64748b; }
.meta span { color: #94a3b8; }
.toggle { margin-top: 11px; font-size: 0.8rem; color: #818cf8; cursor: pointer; user-select: none; }
.answers { display: none; margin-top: 8px; border-top: 1px solid #0f172a; padding-top: 4px; }
.arow { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid #0f172a; font-size: 0.78rem; }
.arow:last-child { border-bottom: none; }
.arow .ico { flex-shrink: 0; }
.aq { color: #94a3b8; margin-bottom: 2px; }
.aa { color: #e2e8f0; }
.aa.wrong { color: #fca5a5; }
.correct { color: #86efac; }
.empty { text-align: center; padding: 60px 20px; color: #475569; font-size: 0.95rem; }
</style>
</head>
<body>
<header>
  <span>📊</span>
  <h1>Quiz Admin</h1>
  <div class="live-wrap">
    <div class="dot live" id="dot"></div>
    <span id="liveLabel">Live</span>
  </div>
</header>
<main>
  <div class="stats">
    <div class="stat"><div class="n" id="sTotal">0</div><div class="l">Submissions</div></div>
    <div class="stat"><div class="n" id="sAvg">—</div><div class="l">Avg Score</div></div>
    <div class="stat"><div class="n" id="sLast">—</div><div class="l">Last Received</div></div>
  </div>
  <div class="cards" id="cardList">
    <div class="empty">⏳ Waiting for quiz submissions…</div>
  </div>
</main>
<script>
function fmt(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})
    + ' ' + d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function badgeCls(pct) { return pct >= 70 ? 'hi' : pct >= 40 ? 'mid' : 'lo'; }

function render(data) {
  document.getElementById('sTotal').textContent = data.length;
  if (!data.length) {
    document.getElementById('sAvg').textContent = '—';
    document.getElementById('sLast').textContent = '—';
    document.getElementById('cardList').innerHTML = '<div class="empty">⏳ Waiting for quiz submissions…</div>';
    return;
  }
  var avg = data.reduce(function(s,d){ return s+(d.score||0); }, 0) / data.length;
  document.getElementById('sAvg').textContent = avg.toFixed(1)+'/10';
  document.getElementById('sLast').textContent = fmt(data[0].receivedAt).split(' ').slice(-1)[0];

  var html = '';
  data.forEach(function(sub, i) {
    var pct = sub.percentage != null ? sub.percentage : Math.round(sub.score/sub.total*100);
    var bc = badgeCls(pct);
    var ans = '';
    if (sub.answers && sub.answers.length) {
      var rows = sub.answers.map(function(a) {
        var wrongCls = a.isCorrect ? '' : ' wrong';
        var arrow = a.isCorrect ? '' : ' &rarr; <span class="correct">'+a.correct+'</span>';
        return '<div class="arow">'
          +'<span class="ico">'+(a.isCorrect?'✅':'❌')+'</span>'
          +'<div><div class="aq">'+a.question+'</div>'
          +'<div class="aa'+wrongCls+'">'+(a.selected||'No answer')+arrow+'</div>'
          +'</div></div>';
      }).join('');
      ans = '<div class="toggle" onclick="tog('+i+')">&#9654; Show answers</div>'
          + '<div class="answers" id="a'+i+'">'+rows+'</div>';
    }
    html += '<div class="card">'
      +'<div class="card-top">'
        +'<span class="uname">'+sub.name+'</span>'
        +'<span class="badge '+bc+'">'+sub.score+'/'+sub.total+' &middot; '+Math.round(pct)+'%</span>'
      +'</div>'
      +'<div class="meta">'
        +'<div>&#128336; Start: <span>'+fmt(sub.startTime)+'</span></div>'
        +'<div>&#127937; Submit: <span>'+fmt(sub.submitTime)+'</span></div>'
        +'<div>&#9203; Duration: <span>'+sub.durationSeconds+'s</span></div>'
        +'<div>&#128229; Received: <span>'+fmt(sub.receivedAt)+'</span></div>'
      +'</div>'
      +ans
    +'</div>';
  });
  document.getElementById('cardList').innerHTML = html;
}

function tog(i) {
  var el = document.getElementById('a'+i);
  var btn = el.previousElementSibling;
  var open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  btn.innerHTML = (open ? '&#9654;' : '&#9660;') + (open ? ' Show answers' : ' Hide answers');
}

function poll() {
  fetch('/data')
    .then(function(r){ return r.json(); })
    .then(function(d){
      render(d);
      document.getElementById('dot').className = 'dot live';
      document.getElementById('liveLabel').textContent = 'Live';
    })
    .catch(function(){
      document.getElementById('dot').className = 'dot err';
      document.getElementById('liveLabel').textContent = 'Error';
    });
}
poll();
setInterval(poll, 3000);
</script>
</body>
</html>`;
