// Judgement step: when a check is written in plain language ("the cart shows 1 item"),
// ReplayCheck buys one inference call from Cencori through the buy gateway ($0.01 per call).
import { paidJson } from './pay.js';
import { GATEWAY } from './config.js';

export async function judge({ expectation, pageText, url, title }) {
  const prompt = [
    'You check whether a web page satisfies an expectation after an automated user flow.',
    'Answer with JSON only: {"pass": true|false, "reason": "<one sentence>"}.',
    `Expectation: ${expectation}`,
    `URL: ${url}`,
    `Title: ${title}`,
    'Visible page text (truncated):',
    String(pageText || '').slice(0, 6000),
  ].join('\n');
  const res = await paidJson(`${GATEWAY}/cencori/v1/chat/completions`, {
    model: 'maximo-atlas-1.3',
    max_tokens: 256,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  }, { label: 'cencori judge' });
  const text = res.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  try { const j = JSON.parse(m ? m[0] : text); return { pass: !!j.pass, reason: String(j.reason || '').slice(0, 300), raw: text }; }
  catch { return { pass: /"?pass"?\s*:\s*true/i.test(text), reason: text.slice(0, 300), raw: text }; }
}
