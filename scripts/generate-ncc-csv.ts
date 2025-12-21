import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { DOMParser } from 'linkedom';

type Args = {
  input: string;
  out: string;
  doc_id: string;
  volume: string;
  state_variation: string;
  version_date: string;
};

function parseArgs(argv: string[]): Args {
  const get = (k: string, def = '') => {
    const idx = argv.indexOf(`--${k}`);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
    return def;
  };

  const input = get('input');
  if (!input) throw new Error('Missing --input <path-to-docx>');

  return {
    input,
    out: get('out', path.join(process.cwd(), 'ncc_units.csv')),
    doc_id: get('doc_id', 'ncc'),
    volume: get('volume', 'NCC'),
    state_variation: get('state_variation', ''),
    version_date: get('version_date', ''),
  };
}

async function main() {
  // Provide DOMParser globally so lib/ncc-units.ts can parse HTML in Node.
  (globalThis as any).DOMParser = DOMParser;

  // Import TS modules AFTER setting globals (ESM import order is hoisted).
  const { repairFormat } = await import('../lib/format-repair');
  const { buildNccUnitsFromHtml, rowsToNccUnitsCsv } = await import('../lib/ncc-units');

  const args = parseArgs(process.argv.slice(2));
  const absIn = path.isAbsolute(args.input) ? args.input : path.join(process.cwd(), args.input);
  const absOut = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);

  const buffer = fs.readFileSync(absIn);

  const mammothResult = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
      ],
    }
  );

  const htmlRaw = mammothResult.value;
  const textRaw = mammothResult.value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const { html_clean } = await repairFormat(htmlRaw, textRaw);

  const { rows, warnings } = await buildNccUnitsFromHtml(html_clean, {
    doc_id: args.doc_id,
    volume: args.volume,
    state_variation: args.state_variation,
    version_date: args.version_date,
    source_file: path.basename(absIn),
  });

  const summary = (warnings || []).filter(w =>
    w.startsWith('STATE_VARIATION_EXTRACTED_BLOCKS:') ||
    w.startsWith('STATE_VARIATION_UNBOUNDED_BLOCKS:')
  );
  if (summary.length) {
    // eslint-disable-next-line no-console
    console.log('Post-pass summary:', summary.join(' | '));
  }

  // Quality gate: no empty rag_text
  const empty = rows.filter(r => !String(r.rag_text || '').trim()).length;
  if (empty > 0) {
    throw new Error(`Quality gate failed: ${empty} row(s) have empty rag_text.`);
  }

  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, rowsToNccUnitsCsv(rows), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${rows.length} rows -> ${absOut}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


