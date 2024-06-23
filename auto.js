import { readFile, writeFile } from 'node:fs/promises';

function extractFirstGroup(re, text) {
  const m = re.exec(text);
  return m?.[1]?.trim() ?? null;
}

function htmlToPlaintextPreserveBreaks(html) {
  if (!html) return '';
  const withNewlines = html
    .replaceAll(/<br\s*\/?\s*>/gi, '\n')
    .replaceAll(/<[^>]+>/g, '');
  return withNewlines.replaceAll(/\n{3,}/g, '\n\n').trim();
}

function plaintextToHtmlPreserveBreaks(text) {
  if (!text) return '';
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map(escapeHtml).join('\n');
}

function parseMiningComboHamster(html) {
  const dailyComboDate = extractFirstGroup(
    /<p[^>]*class=["']daily-combo-date["'][^>]*>\s*([^<]*)\s*<\/p>/i,
    html,
  );

  const dailyComboImage =
    extractFirstGroup(
      /<img[^>]*class=["'][^"']*daily-combo-image[^"']*["'][^>]*data-lazy-src=["']([^"']+)["'][^>]*>/i,
      html,
    ) ||
    extractFirstGroup(
      /<noscript>\s*<img[^>]*class=["'][^"']*daily-combo-image[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>\s*<\/noscript>/i,
      html,
    );

  const cipherWord = extractFirstGroup(
    /<strong>\s*Word:\s*<\/strong>\s*([^<\n\r]+)\s*<\/p>/i,
    html,
  );

  const cipherMorseRawHtml = extractFirstGroup(
    /<p[^>]*>\s*([A-Z]\s*[—\-]\s*[•\.][\s\S]*?)\s*<\/p>/i,
    html,
  );

  const cipherMorseText = cipherMorseRawHtml
    ? htmlToPlaintextPreserveBreaks(cipherMorseRawHtml)
    : null;

  return {
    dailyComboDate,
    dailyComboImage,
    cipherWord,
    cipherMorseText,
  };
}

function buildComboPartial({ dailyComboDate, dailyComboImage, cipherWord }) {
  const lines = [];

  if (dailyComboImage) {
    lines.push(
      `<div><img loading="lazy" src="${escapeAttr(dailyComboImage)}" alt="Daily Combo" /></div>`,
    );
  }

  return `\n${lines.join('\n')}\n`;
}

function buildCipherPartial({ cipherWord }) {
  if (!cipherWord) return `\n`;
  return `\n${escapeHtml(cipherWord)}\n`;
}

function buildMorsePartial({ cipherMorseText }) {
  if (!cipherMorseText) return `\n`;
  return `\n${plaintextToHtmlPreserveBreaks(cipherMorseText)}\n`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function parseArgs(argv) {
  const args = {
    url: 'https://miningcombo.com/hamster/',
    output: './themes/hamster/layouts/partials/combo.html',
    cipherOutput: './themes/hamster/layouts/partials/cipher.html',
    morseOutput: './themes/hamster/layouts/partials/morse.html',
    input: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--cipher-output') args.cipherOutput = argv[++i];
    else if (a === '--morse-output') args.morseOutput = argv[++i];
    else if (a === '--input') args.input = argv[++i];
  }

  return args;
}

async function loadHtml({ input, url }) {
  if (input) {
    return readFile(input, 'utf8');
  }

  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

async function main() {
  const args = parseArgs(process.argv);
  const html = await loadHtml(args);

  const parsed = parseMiningComboHamster(html);

  if (!parsed.dailyComboDate && !parsed.dailyComboImage && !parsed.cipherWord) {
    throw new Error('Failed to parse: no expected fields found in HTML');
  }

  const partial = buildComboPartial(parsed);
  await writeFile(args.output, partial, 'utf8');

  const cipherPartial = buildCipherPartial(parsed);
  await writeFile(args.cipherOutput, cipherPartial, 'utf8');

  const morsePartial = buildMorsePartial(parsed);
  await writeFile(args.morseOutput, morsePartial, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Updated ${args.output}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
