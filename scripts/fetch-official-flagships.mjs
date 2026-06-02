import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(rootDir, "official-flagships.config.json");
const outputPath = resolve(rootDir, "generated-flagships.js");
const config = JSON.parse(await readFile(configPath, "utf8"));
const sources = Array.isArray(config.sources) ? config.sources : [];
const devices = [];

for (const source of sources) {
  const device = await fetchOfficialDevice(source);
  if (device) devices.push(device);
}

await writeFile(
  outputPath,
  `window.phoneRadarOfficialFlagships = ${JSON.stringify({ updatedAt: new Date().toISOString(), devices }, null, 2)};\n`,
  "utf8"
);

console.log(`updated ${devices.length} official flagships -> ${outputPath}`);

async function fetchOfficialDevice(source) {
  try {
    const html = await fetchHtml(source.url);
    const text = pageText(html);
    const rawText = pageText(html, { keepScripts: true });
    const title = pageTitle(html);
    const specs = extractSpecs(text, rawText, html, source);
    const extractedCount = Object.values(specs).filter((value) => value && value !== "待补充" && value !== "以官网为准").length;
    if (extractedCount < 2) {
      console.warn(`skip ${source.model}: official page did not expose enough specs`);
      return null;
    }

    return {
      id: `official-${slug(`${source.brand}-${source.model}`)}`,
      brand: source.brand,
      model: source.model,
      status: "官方参数",
      release: title || source.source,
      chip: specs["处理器"],
      display: specs["屏幕"],
      camera: specs["影像"],
      battery: specs["续航"],
      price: specs["价格"],
      source: source.source,
      sourceUrl: source.url,
      specs
    };
  } catch (error) {
    console.warn(`skip ${source.model}: ${error.message}`);
    return null;
  }
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(url, {
      headers: {
        "accept": "text/html,*/*",
        "user-agent": "Mozilla/5.0 PhoneRadar/1.0 (+local official spec reader)"
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractSpecs(text, rawText, html, source) {
  const brandSpecific = extractBrandSpecificSpecs(html, source);
  const chip = cleanSnippet(firstCleanMatch([text, rawText], [
    /(?:A\d{2}\s?Pro|A\d{2}\s?Bionic|Apple\s?A\d{2}\s?Pro)[^。；\n]{0,80}/i,
    /(?:第五代骁龙8至尊版|骁龙\s?8\s?至尊版|骁龙8至尊版|Snapdragon\s?8[^。；\n]{0,80})/i,
    /(?:麒麟|Kirin)\s?\d{4}[^。；\n]{0,80}/i,
    /(?:天玑|Dimensity)\s?\d{4}[^。；\n]{0,80}/i
  ]));

  const display = cleanSnippet(firstCleanMatch([text, rawText], [
    /\d(?:\.\d)?\s?(?:英寸|inch|")\s?[^。；\n]{0,140}(?:OLED|AMOLED|LTPO|XDR|屏|Display)[^。；\n]{0,80}/i,
    /(?:屏幕尺寸|屏幕规格|Display)[^。；\n]{0,180}/i
  ]));

  const camera = cleanSnippet(firstCleanMatch([text, rawText], [
    /(?:后置摄像头|后置相机|摄像头|影像|Camera)[^。；\n]{0,220}(?:MP|万像素|主摄|OIS|长焦|潜望)[^。；\n]{0,160}/i,
    /(?:\d{2,4}\s?万像素|\d{2,3}MP)[^。；\n]{0,200}(?:摄像头|相机|主摄|长焦|潜望|Camera)[^。；\n]{0,160}/i
  ]));

  const battery = cleanSnippet(firstCleanMatch([text, rawText], [
    /\d{4,5}\s?mAh[^。；\n]{0,180}(?:W|快充|充电|无线|Battery)?[^。；\n]{0,80}/i,
    /(?:电池容量|续航|Battery)[^。；\n]{0,220}/i,
    /视频播放最长[^。；\n]{0,120}/i
  ]));

  const body = cleanSnippet(firstCleanMatch([text, rawText], [
    /\d{2,3}(?:\.\d+)?\s?[x×]\s?\d{2,3}(?:\.\d+)?\s?[x×]\s?\d{1,2}(?:\.\d+)?\s?(?:mm|毫米)[^。；\n]{0,100}/i,
    /(?:尺寸与重量|长度|宽度|厚度|重量)[^。；\n]{0,220}/i
  ]));

  const extra = cleanSnippet(firstCleanMatch([text, rawText], [
    /(?:操作系统|系统|OS)[^。；\n]{0,120}/i,
    /(?:防尘抗水|IP68|IP69|NFC|Wi-?Fi|蓝牙)[^。；\n]{0,180}/i
  ]));

  return {
    外观: brandSpecific.body || body || "待补充",
    处理器: brandSpecific.chip || chip || "待补充",
    屏幕: brandSpecific.display || display || "待补充",
    影像: brandSpecific.camera || camera || "待补充",
    续航: brandSpecific.battery || battery || "待补充",
    机身: brandSpecific.body || body || "待补充",
    其他: brandSpecific.extra || extra || source.source,
    价格: "以官网为准"
  };
}

function extractBrandSpecificSpecs(html, source) {
  if (source.brand !== "HONOR") return {};

  const cpuValues = valuesAfterLabel(html, "CPU型号", 5);
  const screenValues = valuesAfterLabel(html, "屏幕尺寸", 6);
  const rearCameraValues = valuesAfterLabel(html, "后置摄像头", 2);
  const batteryValues = valuesAfterLabel(html, "电池容量", 6);
  const sizeValues = valuesAfterLabel(html, "长度", 4);

  return {
    chip: cleanSnippet(joinSpec(cpuValues.slice(0, 3))),
    display: cleanSnippet(joinSpec(screenValues.slice(0, 4))),
    camera: cleanSnippet(joinSpec(rearCameraValues.slice(0, 1))),
    battery: cleanSnippet(joinSpec(batteryValues.slice(0, 4))),
    body: cleanSnippet(joinSpec(sizeValues.slice(0, 4)))
  };
}

function valuesAfterLabel(html, label, limit) {
  const index = html.indexOf(label);
  if (index < 0) return [];
  return Array.from(html.slice(index, index + 5000).matchAll(/\bdata-value=(["'])([\s\S]*?)\1/gi), (match) => {
    return decodeHtml(match[2]).replace(/\s+/g, " ").trim();
  })
    .filter(Boolean)
    .slice(0, limit);
}

function joinSpec(values) {
  return values.filter(Boolean).join("；");
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return "";
}

function firstCleanMatch(texts, patterns) {
  for (const text of texts) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[0] && !isBadSnippet(match[0])) return match[0];
    }
  }
  return "";
}

function isBadSnippet(value) {
  return /(?:var |function|script|quickLink|CmpProductParams|seo_|link https|createElement|onreadystatechange|document\.|window\.|更多产品|服务支持|在线客服|荣耀俱乐部|智慧屏|路由|<|>)/i.test(
    value
  );
}

function pageText(html, options = {}) {
  return decodeHtml(String(html || ""))
    .replace(/\bdata-value=(["'])([\s\S]*?)\1/gi, " $2 ")
    .replace(/\bdata-title=(["'])([\s\S]*?)\1/gi, " $2 ")
    .replace(options.keepScripts ? /\u0000/g : /<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(?:p|li|div|section|tr|td|th|h1|h2|h3|h4)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\u002F/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html) {
  return cleanSnippet(decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ");
}

function cleanSnippet(value) {
  return String(value || "")
    .replace(/[{}[\]"':,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80) || "unknown";
}
