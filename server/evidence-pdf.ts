// Pure TypeScript generator for auditor PDF evidence pack
// Generates standard PDF 1.4 without third-party dependencies

export interface EvidencePackData {
  generatedAt: string;
  mode: 'SIMULATED' | 'LIVE-FIRE';
  chain: { ok: boolean; rows?: number; head?: string; brokenAt?: number };
  checkpoint: {
    seq: number;
    head: string;
    timestamp: number;
    signature: string;
    publicKey: string;
  } | null;
  mandate: {
    version?: string;
    perActionCapCents: number;
    hardMaxCents: number;
    dailyCapCents: number;
    hardDailyCapCents: number;
    rulesCount?: number;
  };
  mandateVersions?: Array<{
    id: string;
    version_hash: string;
    created_at: number;
    created_by: string;
    description: string;
    is_active: number;
  }>;
  rows: Array<{
    seq: number;
    created_at: number;
    event: string;
    action_id: string;
    rule_id?: string;
    amount_cents?: number;
    hash: string;
    prev_hash?: string;
    mandate_version?: string;
    agent_id?: string;
  }>;
}

function escapePdfText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function generateEvidencePackPdf(data: EvidencePackData): Buffer {
  const lines: string[] = [];

  lines.push('================================================================================');
  lines.push('                             REIN AUDIT EVIDENCE PACK                           ');
  lines.push('================================================================================');
  lines.push('');
  lines.push(`Generated: ${data.generatedAt} UTC`);
  lines.push(`System Mode: ${data.mode}`);
  lines.push(`Ledger Rows Total: ${data.chain.rows}`);
  lines.push(`Hash Chain Head:   ${data.chain.head}`);
  lines.push(`Hash Chain Status: ${data.chain.ok ? 'VERIFIED UNBROKEN' : `BROKEN at row ${data.chain.brokenAt}`}`);
  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('1. LATEST SIGNED CHECKPOINT (Ed25519)');
  lines.push('--------------------------------------------------------------------------------');
  if (data.checkpoint) {
    lines.push(`Sequence Number: ${data.checkpoint.seq}`);
    lines.push(`Head Hash:       ${data.checkpoint.head}`);
    lines.push(`Signed At:       ${new Date(data.checkpoint.timestamp).toISOString()}`);
    lines.push(`Public Key:      ${data.checkpoint.publicKey}`);
    lines.push(`Signature:       ${data.checkpoint.signature}`);
  } else {
    lines.push('No signed checkpoint available for this ledger instance.');
  }
  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('2. MANDATE POLICY IN FORCE');
  lines.push('--------------------------------------------------------------------------------');
  if (data.mandate.version) {
    lines.push(`Active Version Hash: ${data.mandate.version}`);
  }
  lines.push(`Per-Action Cap:     $${(data.mandate.perActionCapCents / 100).toFixed(2)}`);
  lines.push(`Hard Max Cap:       $${(data.mandate.hardMaxCents / 100).toFixed(2)}`);
  lines.push(`Daily Spend Cap:    $${(data.mandate.dailyCapCents / 100).toFixed(2)}`);
  lines.push(`Hard Daily Cap:     $${(data.mandate.hardDailyCapCents / 100).toFixed(2)}`);
  lines.push('');
  if (data.mandateVersions && data.mandateVersions.length > 0) {
    lines.push('Mandate Version History:');
    for (const mv of data.mandateVersions.slice(0, 5)) {
      lines.push(`  - Hash: ${mv.version_hash.slice(0, 16)}... | Active: ${mv.is_active ? 'YES' : 'NO'} | Author: ${mv.created_by}`);
    }
    lines.push('');
  }
  lines.push('--------------------------------------------------------------------------------');
  lines.push('3. LEDGER RECORD SUMMARY');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('Seq | Event            | Amount   | Action ID       | Rule ID      | Head Hash (Prefix)');
  lines.push('----+------------------+----------+-----------------+--------------+--------------------');

  for (const r of data.rows.slice(0, 120)) {
    const seqStr = String(r.seq).padEnd(3);
    const evStr = (r.event || '').slice(0, 16).padEnd(16);
    const amtStr = r.amount_cents != null ? (`$${(r.amount_cents / 100).toFixed(2)}`).padEnd(8) : '-       ';
    const actStr = (r.action_id || '').slice(0, 15).padEnd(15);
    const ruleStr = (r.rule_id || '-').slice(0, 12).padEnd(12);
    const hashStr = (r.hash || '').slice(0, 18);
    lines.push(`${seqStr} | ${evStr} | ${amtStr} | ${actStr} | ${ruleStr} | ${hashStr}`);
  }
  if (data.rows.length > 120) {
    lines.push(`... and ${data.rows.length - 120} more rows (see full CSV export)`);
  }
  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('4. HONEST SECURITY BOUNDARY & AUDIT NOTICE');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('This evidence pack demonstrates tamper-evidence using Ed25519 digital signatures');
  lines.push('and cryptographic hash chaining. Checkpoints detect modifications made after');
  lines.push('publication. They do not prevent an operator who possesses full database access');
  lines.push('and signing keys from rewriting historical state prior to signing and publication.');
  lines.push('================================================================================');

  // Split lines into pages (approx 55 lines per letter page)
  const LINES_PER_PAGE = 52;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }

  // Construct PDF objects
  let body = '%PDF-1.4\n';
  const objects: string[] = [];

  const catalogObjNum = 1;
  const pagesObjNum = 2;
  const fontObjNum = 3;
  let nextObjNum = 4;

  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  for (let p = 0; p < pages.length; p++) {
    pageObjNums.push(nextObjNum++);
    contentObjNums.push(nextObjNum++);
  }

  // 1: Catalog
  objects.push(`${catalogObjNum} 0 obj\n<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj\n`);

  // 2: Pages
  const kidsStr = pageObjNums.map((n) => `${n} 0 R`).join(' ');
  objects.push(`${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pages.length} >>\nendobj\n`);

  // 3: Font (Courier fixed width)
  objects.push(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

  // Page and Content objects
  for (let p = 0; p < pages.length; p++) {
    const pageLines = pages[p] || [];
    let streamText = 'BT\n/F1 9 Tf\n40 760 Td\n13.5 TL\n';
    for (let i = 0; i < pageLines.length; i++) {
      const line = escapePdfText(pageLines[i] || '');
      if (i === 0) {
        streamText += `(${line}) Tj\n`;
      } else {
        streamText += `T* (${line}) Tj\n`;
      }
    }
    streamText += 'ET\n';

    const contentObjNum = contentObjNums[p];
    const pageObjNum = pageObjNums[p];

    const streamLen = Buffer.byteLength(streamText, 'utf8');
    objects.push(`${pageObjNum} 0 obj\n<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj\n`);
    objects.push(`${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamText}endstream\nendobj\n`);
  }

  // Build xref
  const xref: string[] = ['xref', `0 ${nextObjNum}`, '0000000000 65535 f '];
  for (let i = 0; i < objects.length; i++) {
    xref.push(String(body.length).padStart(10, '0') + ' 00000 n ');
    body += objects[i];
  }

  const xrefOffset = body.length;
  body += xref.join('\n') + '\n';
  body += `trailer\n<< /Size ${nextObjNum} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'utf8');
}
