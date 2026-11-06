// `npm run doctor`: proves the hook is INSTALLED and actually BLOCKS, because a missing hook fails open.
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function doctor({ settingsFiles, hookScript, guardScript, reinUrl, nodeBin = process.execPath }) {
  const hn = new RegExp(esc(basename(hookScript))), gn = new RegExp(esc(basename(guardScript)));
  const out = []; const add = (ok, name, fix) => out.push({ ok, name, ...(ok ? {} : { fix }) });
  const hooks = [];
  for (const f of settingsFiles) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      for (const [ev, arr] of Object.entries(j.hooks ?? {})) for (const g of arr) for (const h of g.hooks ?? []) hooks.push({ ev, matcher: g.matcher ?? '', cmd: String(h.command ?? ''), file: f });
    } catch { /* unreadable settings file: the checks below will fail */ }
  }
  const pre = hooks.filter((h) => h.ev === 'PreToolUse');
  const rein = pre.find((h) => hn.test(h.cmd) && /paypal/i.test(h.matcher));
  add(!!rein, 'PreToolUse hook for the PayPal MCP tools is configured', 'Add the hook block from docs/Backend/CLAUDE_CODE_INTEGRATION.md to .claude/settings.json');
  add(!!rein && /mcp__plugin_paypal_paypal-sandbox__|mcp__.*paypal/i.test(rein.matcher), 'Hook matcher covers the PayPal MCP tools', 'Use matcher mcp__plugin_paypal_paypal-sandbox__.* (confirm with your live tool list)');
  add(!!rein && /[A-Za-z]:[\\/]|["' ]\//.test(rein.cmd), 'Hook command uses an absolute path', 'A relative path breaks when the working directory changes and then fails OPEN');
  add(existsSync(hookScript), 'Hook script exists', `Missing ${hookScript}: Claude Code would proceed without any check (fails open)`);
  add(pre.some((h) => gn.test(h.cmd)), 'Bypass guard hook (Bash/Write/Edit) is configured', 'Add the guard hook block from docs/Backend/CLAUDE_CODE_INTEGRATION.md');
  const sample = spawnSync(nodeBin, [hookScript], {
    input: JSON.stringify({ session_id: 'doctor', tool_name: 'mcp__plugin_paypal_paypal-sandbox__create_refund', tool_use_id: `doctor_${Date.now()}`, tool_input: { capture_id: 'DOCTOR-UNKNOWN', amount: { currency_code: 'USD', value: '900000.00' } } }),
    env: { ...process.env, REIN_URL: reinUrl, LEASH_URL: reinUrl }, timeout: 8000,
  });
  add(sample.status === 2, 'A deliberately over-cap sample refund is BLOCKED end to end (exit 2)', `Sample exited ${sample.status}; start the service (npm run demo) and re-run`);

  // Check mandate expiry (must not expire within 60 days of judging end: Dec 15, 2026)
  try {
    const mandatePath = process.env.REIN_MANDATE ?? process.env.LEASH_MANDATE ?? 'mandate.json';
    if (existsSync(mandatePath)) {
      const mandate = JSON.parse(readFileSync(mandatePath, 'utf8'));
      const expiresAt = new Date(mandate.expiresAt).getTime();
      const judgingEnd = new Date('2026-12-15T08:00:00-08:00').getTime(); // Dec 15, 2026 8am PT
      const sixtyDays = 60 * 24 * 60 * 60 * 1000;
      const buffer = expiresAt - judgingEnd;
      add(buffer >= sixtyDays, 'Mandate expires at least 60 days after judging ends (Dec 15, 2026)', `Set expiresAt to at least 2027-02-13 in ${mandatePath}; currently expires ${mandate.expiresAt}`);
    }
  } catch (e) {
    add(false, 'Mandate expiry check', `Failed to read mandate.json: ${e.message}`);
  }

  return { ok: out.every((c) => c.ok), checks: out };
}
