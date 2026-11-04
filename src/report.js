import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function writeReport(outDir, run) {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(run, null, 2));
  const total = run.receipts.reduce((a, r) => a + r.usd, 0);
  const rows = run.results.map((r) => `
  <section class="task ${r.status}">
    <h2><span class="badge">${r.status.toUpperCase()}</span> ${esc(r.name)}</h2>
    <p class="meta">${esc(r.startUrl)} → ${esc(r.final?.url || '')}</p>
    ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
    <ul>${r.checks.map((c) => `<li class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '✓' : '✗'} ${esc(c.type)}: ${esc(c.value)}${c.reason ? ` <em>— ${esc(c.reason)}</em>` : ''}</li>`).join('')}</ul>
    <div class="shots">${r.screenshots.map((s) => `<img src="${esc(r.id)}/${esc(s)}" alt="${esc(s)}">`).join('')}</div>
  </section>`).join('');
  const rec = run.receipts.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.provider || '')}</td><td>$${r.usd.toFixed(6)}</td><td>${esc(r.network)}</td><td>${r.explorer ? `<a href="${esc(r.explorer)}">${esc(r.txHash.slice(0, 12))}…</a>` : '—'}</td></tr>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReplayCheck report</title>
<style>
:root{--bg:#0f1115;--fg:#e8e6e1;--mut:#8b8f98;--ok:#4fbf7a;--bad:#e5604f;--line:#262a33}
body{background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:24px 16px;max-width:1080px;margin:auto}
h1{font-size:22px;margin:0 0 4px}.meta{color:var(--mut);font-size:13px;word-break:break-all}
.task{border-top:1px solid var(--line);padding:16px 0}.task h2{font-size:17px;margin:0}
.badge{font-size:12px;padding:2px 8px;border-radius:4px;background:var(--line);margin-right:6px}
.pass .badge{background:var(--ok);color:#06210f}.fail .badge,.error .badge{background:var(--bad);color:#2a0905}
li.ok{color:var(--ok)}li.bad{color:var(--bad)}.err{color:var(--bad)}
.shots{display:flex;gap:8px;flex-wrap:wrap}.shots img{max-width:320px;width:100%;border:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left}a{color:#8fb8ff}
</style>
<h1>ReplayCheck · ${run.results.filter((r) => r.status === 'pass').length}/${run.results.length} tasks passed</h1>
<p class="meta">Run ${esc(run.runId)} · ${esc(run.network)} · agent ${esc(run.agent)} · ERC-8004 ${esc(run.agentId || 'unregistered')} · attribution ${esc(run.attributionCode)}</p>
${rows}
<h2 style="margin-top:28px;font-size:17px">Paid calls (x402 on Celo) · total $${total.toFixed(6)}</h2>
<table><tr><th>What</th><th>Provider</th><th>Price</th><th>Network</th><th>Settlement tx</th></tr>${rec}</table>`;
  writeFileSync(join(outDir, 'index.html'), html);
  return join(outDir, 'index.html');
}
