import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';
import sharp from 'sharp';

async function cropToTargetRatioBuffer(inputUrl, topCropWidthPercent, targetAspectRatio) {
  try {
    const res = await fetch(inputUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const width = metadata.width;
    const height = metadata.height;

    const topCropPx = Math.round(width * (topCropWidthPercent / 100));
    const targetHeight = Math.round(width / targetAspectRatio);
    const bottomCropPx = height - topCropPx - targetHeight;

    if (bottomCropPx < 0) {
      console.warn(`[crop] Image too short! Needs ${Math.abs(bottomCropPx)}px more for ratio ${targetAspectRatio}. Returning original.`);
      return inputBuffer;
    }

    const extractedBuffer = await image
      .extract({
        left: 0,
        top: topCropPx,
        width: width,
        height: targetHeight
      })
      .toBuffer();

    const yPos = Math.round(targetHeight * 0.11);
    const fontSize = Math.round(targetHeight * 0.147);
    const radius = Math.round(targetHeight * 0.107);
    const strokeWidth = Math.max(2, Math.round(fontSize * 0.05));

    const offsetX = Math.round(width * 0.115);
    const x1 = Math.round(width * (1 / 6)) - offsetX + Math.round(width * 0.01);
    const x2 = Math.round(width * (3 / 6)) - offsetX;
    const x3 = Math.round(width * (5 / 6)) - offsetX;

    const svgOverlay = `
        <svg width="${width}" height="${targetHeight}">
            <style>
                .num-bg { fill: rgba(0, 0, 64, 0.45); }
                .num-text {
                    fill: #ffffff;
                    font-family: 'Arial', sans-serif;
                    font-size: ${fontSize}px;
                    font-weight: 900;
                    text-anchor: middle;
                }
                .num-stroke {
                    stroke: #000020;
                    stroke-width: ${strokeWidth}px;
                    stroke-linejoin: round;
                }
            </style>
            
            <circle cx="${x1}" cy="${yPos}" r="${radius}" class="num-bg" />
            <circle cx="${x2}" cy="${yPos}" r="${radius}" class="num-bg" />
            <circle cx="${x3}" cy="${yPos}" r="${radius}" class="num-bg" />

            <text x="${x1}" y="${yPos}" dy="0.35em" class="num-text num-stroke">1</text>
            <text x="${x2}" y="${yPos}" dy="0.35em" class="num-text num-stroke">2</text>
            <text x="${x3}" y="${yPos}" dy="0.35em" class="num-text num-stroke">3</text>
            
            <text x="${x1}" y="${yPos}" dy="0.35em" class="num-text">1</text>
            <text x="${x2}" y="${yPos}" dy="0.35em" class="num-text">2</text>
            <text x="${x3}" y="${yPos}" dy="0.35em" class="num-text">3</text>
        </svg>
    `;

    return await sharp(extractedBuffer)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

  } catch (error) {
    console.error(`[crop] Error cropping image ${inputUrl}:`, error.message);
    return null; // On error, return null so we can fallback to original URL
  }
}

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
    /<p[^>]*>\s*([A-Z][: \-—]+[•\.●━\-][\s\S]*?)\s*<\/p>/i,
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
      `<div><img loading="lazy" class="combo-image" src="${escapeAttr(dailyComboImage)}" alt="Daily Combo" width="1080" height="429" /></div>`,
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
    forceTelegram: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--cipher-output') args.cipherOutput = argv[++i];
    else if (a === '--morse-output') args.morseOutput = argv[++i];
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--force-telegram') args.forceTelegram = true;
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

async function notifyTelegram({ parsed, partial, cipherPartial, morsePartial, isComboUpdated, isCipherUpdated, forceTelegram }) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.warn('Telegram credentials not found in .env, skipping notification');
    return;
  }

  if (!forceTelegram && !isComboUpdated && !isCipherUpdated) {
    return;
  }

  let text = `<b>🐹 ¡Actualización de Hamster Kombat!</b>\n\n`;

  if (parsed.dailyComboDate) {
    let cleanDate = parsed.dailyComboDate.replace(/^Date:\s*/i, '').trim();
    try {
      const d = new Date(cleanDate);
      if (!isNaN(d.getTime())) {
        cleanDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      }
    } catch (e) { }
    text += `📅 <b>Fecha:</b> ${escapeHtml(cleanDate)}\n\n`;
  }

  if ((forceTelegram || isComboUpdated) && parsed.dailyComboImage) {
    text += `💥 <b>Cartas de Combo Diario:</b> (Ver imagen)\n\n`;
  }

  if ((forceTelegram || isCipherUpdated) && parsed.cipherWord) {
    text += `🔐 <b>Código Morse:</b> <code>${escapeHtml(parsed.cipherWord)}</code>\n`;
    if (parsed.cipherMorseText) {
      text += `<pre>${escapeHtml(parsed.cipherMorseText)}</pre>\n`;
    }
  }

  try {
    let url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };

    if (parsed.dailyComboImage && (forceTelegram || isComboUpdated)) {
      url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

      // Attempt to crop the image before sending
      const croppedBuffer = await cropToTargetRatioBuffer(parsed.dailyComboImage, 4, 4);

      if (croppedBuffer) {
        // Send as multipart/form-data
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHANNEL_ID);
        formData.append('caption', text);
        formData.append('parse_mode', 'HTML');
        formData.append('photo', new Blob([croppedBuffer]), 'combo.jpg');

        const res = await fetch(url, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          console.error('Failed to post cropped photo to Telegram:', await res.text());
        } else {
          console.log('Successfully posted cropped update to Telegram');
        }
        return; // Done
      } else {
        // Fallback to sending URL if cropping fails
        payload.photo = parsed.dailyComboImage;
        payload.caption = text;
        delete payload.text;
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('Failed to post to Telegram:', await res.text());
    } else {
      console.log('Successfully posted update to Telegram');
    }
  } catch (err) {
    console.error('Telegram API error:', err.message);
  }
}

async function readFileSafe(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const html = await loadHtml(args);

  const parsed = parseMiningComboHamster(html);

  if (!parsed.dailyComboDate && !parsed.dailyComboImage && !parsed.cipherWord) {
    throw new Error('Failed to parse: no expected fields found in HTML');
  }

  const partial = buildComboPartial(parsed);
  const existingCombo = await readFileSafe(args.output);
  await writeFile(args.output, partial, 'utf8');

  const cipherPartial = buildCipherPartial(parsed);
  const existingCipher = await readFileSafe(args.cipherOutput);
  await writeFile(args.cipherOutput, cipherPartial, 'utf8');

  const morsePartial = buildMorsePartial(parsed);
  const existingMorse = await readFileSafe(args.morseOutput);
  await writeFile(args.morseOutput, morsePartial, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Updated ${args.output}`);
  const isComboUpdated = existingCombo !== partial;
  const isCipherUpdated = existingCipher !== cipherPartial || existingMorse !== morsePartial;

  if (args.forceTelegram || isComboUpdated || isCipherUpdated) {
    await notifyTelegram({ parsed, partial, cipherPartial, morsePartial, isComboUpdated, isCipherUpdated, forceTelegram: args.forceTelegram });
  } else {
    console.log('No new updates detected, skipping Telegram post.');
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
