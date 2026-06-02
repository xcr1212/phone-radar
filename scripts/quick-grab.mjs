import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CATEGORY_ORDER = [
  "型号",
  "外观",
  "处理器",
  "屏幕",
  "影像",
  "续航",
  "机身",
  "存储",
  "网络",
  "系统",
  "其他",
  "价格",
  "未分类参数"
];

const SPEC_PREFIXES = [
  "CPU 型号",
  "CPU型号",
  "处理器",
  "移动平台",
  "芯片",
  "屏幕尺寸",
  "显示屏",
  "屏幕",
  "分辨率",
  "刷新率",
  "触控采样率",
  "峰值亮度",
  "前置摄像头",
  "后置摄像头",
  "前置相机",
  "后置相机",
  "后置影像",
  "摄像头",
  "影像",
  "电池容量",
  "电池",
  "有线充电",
  "无线充电",
  "充电",
  "机身尺寸",
  "尺寸",
  "长度",
  "宽度",
  "厚度",
  "重量",
  "颜色",
  "配色",
  "型号",
  "产品名称",
  "名称",
  "操作系统",
  "系统",
  "运行内存",
  "机身存储",
  "存储",
  "SIM卡",
  "网络制式",
  "网络频段",
  "蓝牙",
  "Wi-Fi",
  "NFC",
  "USB",
  "防尘防水",
  "扬声器",
  "马达",
  "指纹",
  "传感器",
  "包装清单",
  "价格",
  "售价"
].sort((a, b) => b.length - a.length);

const args = parseArgs(process.argv.slice(2));

if (!args.urls.length && !args.file) {
  printHelp();
  process.exit(1);
}

const urls = unique([...args.urls, ...(args.file ? await urlsFromFile(args.file) : [])]).filter(Boolean);
const outputDir = resolve(rootDir, args.out || "grabbed-specs");
if (!args.stdout) await mkdir(outputDir, { recursive: true });

const results = [];
for (const url of urls) {
  const result = await grabSpecs(url, args);
  results.push(result);
  if (!args.stdout) await writeResultFiles(result, outputDir);
  printSummary(result);
}

if (args.stdout) {
  console.log(JSON.stringify(results, null, 2));
}

function parseArgs(values) {
  const result = {
    urls: [],
    file: "",
    out: "",
    stdout: false,
    timeoutMs: 18000
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--file") {
      result.file = values[++index] || "";
    } else if (value === "--out") {
      result.out = values[++index] || "";
    } else if (value === "--stdout") {
      result.stdout = true;
    } else if (value === "--timeout") {
      result.timeoutMs = Number(values[++index] || result.timeoutMs);
    } else if (/^https?:\/\//i.test(value)) {
      result.urls.push(value);
    }
  }

  return result;
}

async function urlsFromFile(path) {
  const text = await readFile(resolve(rootDir, path), "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function grabSpecs(url, options) {
  const grabbedAt = new Date().toISOString();
  try {
    const html = await fetchHtml(url, options.timeoutMs);
    const title = extractTitle(html);
    const canonical = extractCanonical(html, url);
    const description = extractMeta(html, "description");
    const lines = htmlToLines(html);
    const entries = collectEntries(html, lines);
    const categories = categorizeEntries(entries);
    const model = detectModel(title, lines, categories);
    const images = extractImages(html, url).slice(0, 16);

    return {
      ok: true,
      url,
      canonical,
      grabbedAt,
      title,
      model,
      description,
      entryCount: entries.length,
      categories,
      entries,
      images
    };
  } catch (error) {
    return {
      ok: false,
      url,
      grabbedAt,
      error: error.message
    };
  }
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
        "user-agent": "Mozilla/5.0 PhoneRadarSpecGrab/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function collectEntries(html, lines) {
  const textEntries = [
    ...extractTableEntries(html),
    ...extractDefinitionEntries(html),
    ...extractLineEntries(lines)
  ];

  const entries = textEntries.length >= 20
    ? textEntries
    : [
        ...textEntries,
        ...extractAttributeEntries(html),
        ...extractScriptEntries(html),
        ...extractPatternEntries([...lines, ...attributeTokens(html), ...scriptTextBlocks(html)].join("\n"))
      ];

  return uniqueEntries(entries)
    .map((entry, index) => ({ ...entry, id: index + 1 }))
    .filter((entry) => entry.name && entry.value && !isNoise(`${entry.name} ${entry.value}`));
}

function extractTableEntries(html) {
  const entries = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi), (match) => tagText(match[1]));
    if (cells.length >= 2) {
      addEntry(entries, cells[0], cells.slice(1).join(" / "), "table");
    }
  }
  return entries;
}

function extractDefinitionEntries(html) {
  const entries = [];
  for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    addEntry(entries, tagText(match[1]), tagText(match[2]), "definition");
  }
  return entries;
}

function extractAttributeEntries(html) {
  const tokens = attributeTokens(html);
  return [...extractInlineEntries(tokens, "attribute"), ...extractAdjacentEntries(tokens, "attribute")];
}

function extractScriptEntries(html) {
  const entries = [];
  const scripts = scriptTextBlocks(html);
  const nameKeys = "name|label|title|key|paramName|specName|itemName";
  const valueKeys = "value|text|desc|description|content|paramValue|specValue";
  const pairPatterns = [
    new RegExp(`["'](?:${nameKeys})["']\\s*:\\s*["']([^"']{1,80})["'][\\s\\S]{0,360}?["'](?:${valueKeys})["']\\s*:\\s*["']([^"']{1,900})["']`, "gi"),
    new RegExp(`["'](?:${valueKeys})["']\\s*:\\s*["']([^"']{1,900})["'][\\s\\S]{0,360}?["'](?:${nameKeys})["']\\s*:\\s*["']([^"']{1,80})["']`, "gi")
  ];

  for (const script of scripts) {
    for (const pattern of pairPatterns) {
      for (const match of script.matchAll(pattern)) {
        const first = cleanLine(decodeJsString(match[1]));
        const second = cleanLine(decodeJsString(match[2]));
        const [name, value] = isSpecLabel(first) || looksLikeLabel(first) ? [first, second] : [second, first];
        addEntry(entries, name, value, "script");
      }
    }
  }

  return entries;
}

function extractLineEntries(lines) {
  return [...extractInlineEntries(lines, "text"), ...extractAdjacentEntries(lines, "text")];
}

function extractInlineEntries(lines, source) {
  const entries = [];
  for (const line of lines) {
    const pair = splitInlinePair(line);
    if (pair) addEntry(entries, pair.name, pair.value, source);
  }
  return entries;
}

function extractAdjacentEntries(lines, source) {
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index];
    if (!isStandaloneSpecLabel(label)) continue;

    const values = [];
    for (let next = index + 1; next < Math.min(lines.length, index + 9); next += 1) {
      const value = lines[next];
      if (isStandaloneSpecLabel(value)) break;
      if (splitInlinePair(value) && values.length) break;
      if (isGoodValue(value)) values.push(value);
    }

    if (values.length) addEntry(entries, label, values.join("；"), source);
  }
  return entries;
}

function extractPatternEntries(text) {
  const normalized = cleanLine(decodeJsString(text));
  const entries = [];
  const patternGroups = [
    ["处理器", /(?:骁龙|天玑|麒麟|Kirin|Snapdragon|Dimensity|Apple\s*A\d{2}|A\d{2}\s*Pro)[^。；\n]{0,160}/gi],
    ["屏幕", /\d(?:\.\d)?\s*(?:英寸|inch|")\s*[^。；\n]{0,180}(?:OLED|AMOLED|LTPO|LCD|刷新率|Hz|分辨率|护眼|PWM|Display)[^。；\n]{0,160}/gi],
    ["影像", /(?:\d{2,4}\s*万像素|\d{2,3}\s*MP)[^。；\n]{0,220}(?:主摄|长焦|潜望|超广角|前置|后置|OIS|镜头|Camera)[^。；\n]{0,180}/gi],
    ["续航", /\d{4,5}\s*mAh[^。；\n]{0,220}/gi],
    ["续航", /\d{2,3}\s*W[^。；\n]{0,160}(?:有线|无线|充电|快充|闪充)[^。；\n]{0,120}/gi],
    ["机身", /\d{2,3}(?:\.\d+)?\s*[x×]\s*\d{2,3}(?:\.\d+)?\s*[x×]\s*\d{1,2}(?:\.\d+)?\s*(?:mm|毫米)[^。；\n]{0,160}/gi],
    ["机身", /\d{2,3}(?:\.\d+)?\s*g(?:\s|$|，|。|；)[^。；\n]{0,120}/gi],
    ["其他", /(?:IP6[5689]K?|Wi-?Fi\s*\d|NFC|USB\s*[23]\.0|红外|蓝牙|北斗|GPS|X轴线性马达|超声波屏幕指纹)[^。；\n]{0,180}/gi],
    ["价格", /(?:¥|￥)\s*\d{3,6}[^。；\n]{0,100}/gi]
  ];

  for (const [name, pattern] of patternGroups) {
    for (const match of normalized.matchAll(pattern)) {
      addEntry(entries, name, match[0], "pattern");
    }
  }

  return entries;
}

function categorizeEntries(entries) {
  const categories = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, []]));
  for (const entry of entries) {
    const category = detectCategory(entry);
    categories[category].push(entry);
  }

  for (const name of CATEGORY_ORDER) {
    categories[name] = uniqueEntries(categories[name]).slice(0, name === "未分类参数" ? 160 : 60);
  }

  return Object.fromEntries(Object.entries(categories).filter(([, values]) => values.length));
}

function detectCategory(entry) {
  const hay = `${entry.name} ${entry.value}`;
  if (/(价格|售价|起售价|到手价|首销价|¥|￥|\bRMB\b)/i.test(hay)) return "价格";
  if (/(处理器|CPU|芯片|SoC|移动平台|骁龙|天玑|麒麟|Kirin|Snapdragon|Dimensity|Apple\s*A\d{2}|A\d{2}\s*Pro)/i.test(hay)) return "处理器";
  if (/^(型号|机型|产品名称|名称|版本|设备型号|Model)$/i.test(entry.name) || /(容量版本|存储版本)/i.test(entry.name)) return "型号";
  if (/(屏幕|显示|分辨率|刷新率|触控|亮度|PWM|LTPO|OLED|AMOLED|LCD|Display|英寸|(?<!M)Hz|nit|护眼|调光|屏占比|对比度|HDR)/i.test(hay)) return "屏幕";
  if (/(影像|相机|摄像|镜头|主摄|长焦|潜望|超广角|前置|后置|OIS|防抖|光圈|传感器|Camera|MP|万像素)/i.test(hay)) return "影像";
  if (/(续航|电池|mAh|充电|快充|闪充|无线充|有线充|W\b|旁路充电)/i.test(hay)) return "续航";
  if (/(内存|存储|RAM|ROM|GB|TB|LPDDR|UFS)/i.test(hay)) return "存储";
  if (/(物理规格|尺寸|高度|长度|宽度|厚度|重量|机身|mm|毫米|\d{2,3}(?:\.\d+)?\s*g\b)/i.test(hay)) return "机身";
  if (/(网络|频段|(?:^|[^A-Z0-9])[2345]G(?:[^A-Z0-9]|$)|SIM|eSIM|Wi-?Fi|WLAN|蓝牙|Bluetooth|NFC|USB|GPS|北斗|红外|MHz|\bn\d{1,3}\b|\bB\d{1,3}\b)/i.test(hay)) return "网络";
  if (/(系统|操作系统|OS|Android|HarmonyOS|iOS|ColorOS|OriginOS|MagicOS|HyperOS|软件)/i.test(hay)) return "系统";
  if (/(外观|颜色|配色|材质|边框|背板|玻璃|素皮|陶瓷|金属)/i.test(hay)) return "外观";
  if (/(上市时间|防水|防尘|IP6[5689]K?|扬声器|音响|播放器|录音|马达|指纹|面容|面部|传感器|包装|配件|散热|VC|接口|应用|进网|证书|许可|Jovi|云服务|查看方式|真伪)/i.test(hay)) return "其他";
  return "未分类参数";
}

function detectModel(title, lines, categories) {
  const titleModel = cleanLine(String(title).replace(/[-_丨|].*$/, ""));
  if (titleModel && !/参数|规格|技术|官网|官方网站/i.test(titleModel)) return shorten(titleModel, 80);
  const modelEntry = categories["型号"]?.find((entry) => /型号|机型|产品名称|名称|model/i.test(entry.name));
  if (modelEntry?.value) return shorten(modelEntry.value, 80);
  if (titleModel) return shorten(titleModel, 80);
  return shorten(lines.find((line) => /(?:iPhone|小米|Xiaomi|HUAWEI|Mate|OPPO|vivo|iQOO|一加|OnePlus|荣耀|HONOR|Magic|Find|Reno)/i.test(line)) || "未命名机型", 80);
}

function addEntry(entries, name, value, source) {
  const cleanName = normalizeName(name);
  const cleanValue = normalizeValue(value);
  if (!cleanName || !cleanValue) return;
  if (!isSpecCandidate(cleanName, cleanValue)) return;
  entries.push({ name: cleanName, value: cleanValue, source });
}

function splitInlinePair(line) {
  const clean = cleanLine(line);
  if (!clean || isNoise(clean)) return null;

  const colon = clean.match(/^([^:：]{2,36})[:：]\s*(.{1,900})$/);
  if (colon && looksLikeLabel(colon[1]) && isGoodValue(colon[2])) {
    return { name: colon[1], value: colon[2] };
  }

  for (const label of SPEC_PREFIXES) {
    if (clean === label) continue;
    if (clean.startsWith(label)) {
      const tail = clean.slice(label.length);
      if (!/^[:：\s\-—|]/.test(tail)) continue;
      const value = tail.replace(/^[:：\s\-—|]+/, "");
      if (value && isGoodValue(value)) return { name: label, value };
    }
  }

  return null;
}

function isStandaloneSpecLabel(line) {
  const clean = cleanLine(line);
  if (!clean || clean.length > 28 || isNoise(clean)) return false;
  if (/[。；，、,.]/.test(clean)) return false;
  if (/\d{3,}|mAh|Hz|W|MP|万像素|英寸|mm|g\b/i.test(clean)) return false;
  return isSpecLabel(clean) || SPEC_PREFIXES.includes(clean);
}

function isSpecLabel(line) {
  const clean = cleanLine(line);
  if (/^(型号|机型|产品名称|名称|版本|外观|颜色|配色|处理器|CPU|芯片|屏幕|显示|分辨率|刷新率|亮度|影像|相机|摄像头|前置|后置|电池|续航|充电|机身|尺寸|长|宽|厚|重量|内存|存储|网络|频段|系统|防水|NFC|蓝牙|USB|扬声器|马达|指纹|传感器|包装|价格|售价)$/i.test(clean)) return true;
  return /(产品颜色|物理规格|高度|长度|宽度|厚度|重量|建议零售价|上市时间|CPU|GPU|运行内存|机身存储|RAM|ROM|扩展存储|电池信息|电池容量|充电规格|电池类型|反向充电|屏幕显示|尺寸（英寸）|屏幕比例|屏占比|屏幕色彩|HDR技术|对比度|屏幕材质|触摸屏|拍摄功能|摄像头像素|摄像头数量|摄像头光圈|闪光灯|防抖类型|变焦模式|拍摄模式|视频录制格式|视频录制|网络参数|网络类型|网络频段|SIM卡|双卡|音乐|音响|播放器|录音|指纹识别|面部识别|操作系统|Jovi|数据连接|WLAN|蓝牙|OTG|USB|耳机接口|导航|云服务|其他传感器|内置应用|进网|查看方式|真伪|证书信息|许可证)/i.test(clean);
}

function looksLikeLabel(line) {
  const clean = cleanLine(line);
  if (!clean || clean.length > 36 || isNoise(clean)) return false;
  return /(型号|机型|名称|版本|外观|颜色|规格|高度|宽度|厚度|重量|处理器|CPU|GPU|芯片|屏幕|显示|分辨率|刷新率|亮度|比例|屏占比|相机|摄像|影像|前置|后置|电池|续航|充电|尺寸|内存|存储|RAM|ROM|网络|频段|SIM|系统|防水|NFC|蓝牙|WLAN|USB|耳机|导航|扬声器|音响|马达|指纹|面部|传感器|包装|价格|售价|时间|进网|证书|许可|model|display|camera|battery|storage)/i.test(clean);
}

function isSpecCandidate(name, value) {
  const hay = `${name} ${value}`;
  if (isNoise(hay)) return false;
  if (name.length > 46 || value.length > 900) return false;
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(name) || !/[A-Za-z0-9\u4e00-\u9fff]/.test(value)) return false;
  return looksLikeLabel(name) || hasSpecValueSignal(hay);
}

function hasSpecValueSignal(value) {
  return /(骁龙|天玑|麒麟|Kirin|Snapdragon|Dimensity|OLED|LTPO|AMOLED|LCD|mAh|万像素|MP|OIS|Hz|PWM|nit|mm|毫米|\d{2,3}(?:\.\d+)?\s*g\b|Wi-?Fi|NFC|USB|IP6[5689]K?|¥|￥|GB|TB|LPDDR|UFS)/i.test(value);
}

function isGoodValue(value) {
  const clean = cleanLine(value);
  if (!clean || clean.length < 2 || clean.length > 900) return false;
  if (isNoise(clean)) return false;
  return true;
}

function isNoise(value) {
  return /(?:javascript:|function\s*\(|window\.|document\.|createElement|onreadystatechange|cookie|隐私|协议|法律声明|服务支持|售后|门店|购物车|登录|注册|Select Location|更多产品|下载APP|在线客服|服务热线|服务监督|Copyright|版权所有|备案|导航|菜单|分享|收藏|查看全部|了解更多|立即购买|加入购物车|以旧换新|返回顶部|扫码|官网商城|官方商城|关注vivo|vivo@|vivo智能手机|资质主体|蓝河操作系统|视频播放|暂停播放|头戴降噪耳机|TWS|WATCH|Vision|Pad6)/i.test(
    String(value || "")
  );
}

function tagText(html) {
  return cleanLine(
    decodeHtml(decodeJsString(String(html || "")))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function htmlToLines(html) {
  return unique(
    decodeHtml(decodeJsString(String(html || "")))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(?:br|\/p|\/li|\/div|\/section|\/article|\/tr|\/td|\/th|\/h[1-6]|\/dt|\/dd)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map(cleanLine)
      .filter((line) => line && !isNoise(line) && line.length <= 900)
  );
}

function attributeTokens(html) {
  return unique(
    Array.from(
      String(html || "").matchAll(/\b(?:data-(?:value|title|name|label|text|desc|spec|model)|aria-label|alt|title)=("([^"]*)"|'([^']*)')/gi),
      (match) => cleanLine(decodeHtml(decodeJsString(match[2] || match[3] || "")))
    ).filter((line) => line && line.length <= 900 && !isNoise(line))
  );
}

function scriptTextBlocks(html) {
  return Array.from(String(html || "").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) => {
    return cleanLine(decodeHtml(decodeJsString(match[1] || "")));
  })
    .filter((script) => script && script.length < 600000)
    .slice(0, 30);
}

function extractTitle(html) {
  return cleanLine(decodeHtml(decodeJsString(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")));
}

function extractMeta(html, name) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escapeRegExp(name)}["'])[^>]*content=["']([^"']*)["'][^>]*>`, "i");
  return cleanLine(decodeHtml(decodeJsString(html.match(pattern)?.[1] || "")));
}

function extractCanonical(html, baseUrl) {
  const href = decodeHtml(html.match(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*href=["']([^"']*)["'][^>]*>/i)?.[1] || "");
  return absoluteUrl(href, baseUrl) || baseUrl;
}

function extractImages(html, baseUrl) {
  return unique(
    Array.from(String(html || "").matchAll(/<img\b[^>]*(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi), (match) => absoluteUrl(decodeHtml(match[1]), baseUrl))
      .filter((url) => /^https?:\/\//i.test(url))
      .filter((url) => !/(spacer|tracking|pixel|avatar|logo|icon|sprite|blank)/i.test(url))
  );
}

async function writeResultFiles(result, dir) {
  const stamp = result.grabbedAt.replace(/[-:]/g, "").replace(/\..+/, "");
  const slug = slugify(result.model || result.title || new URL(result.url).hostname);
  const base = resolve(dir, `${stamp}-${slug}`);
  await writeFile(`${base}.json`, JSON.stringify(result, null, 2), "utf8");
  await writeFile(`${base}.md`, renderMarkdown(result), "utf8");
}

function renderMarkdown(result) {
  if (!result.ok) {
    return ["# 抓取失败", "", `- URL: ${result.url}`, `- 错误: ${result.error}`].join("\n");
  }

  const spec = buildGraphicSpec(result);
  const sections = [
    renderSection("处理器", spec.processor),
    renderSection("屏幕", spec.screen),
    renderSection("影像", spec.camera),
    renderSection("续航", spec.battery),
    renderSection("机身", spec.body),
    renderSection("其他", spec.other),
    renderSection("价格", spec.price)
  ].flat();

  const lines = [
    "# 单机型精简版",
    "",
    `## ${spec.model}`,
    "",
    ...sections,
    "---",
    "",
    "# 表格汇总版",
    "",
    "| 机型 | 处理器 | 屏幕 | 影像 | 电池/快充 | 机身 | 其他 | 价格 |",
    "|---|---|---|---|---|---|---|---|",
    `| ${escapeTableCell(spec.model)} | ${escapeTableCell(spec.table.processor)} | ${escapeTableCell(spec.table.screen)} | ${escapeTableCell(spec.table.camera)} | ${escapeTableCell(spec.table.battery)} | ${escapeTableCell(spec.table.body)} | ${escapeTableCell(spec.table.other)} | ${escapeTableCell(spec.table.price)} |`
  ];
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function renderSection(title, lines) {
  if (!lines.length) return [];
  return [`**${title}**`, ...lines, ""];
}

function buildGraphicSpec(result) {
  const entries = result.entries || [];
  const byName = (pattern) => entries.find((entry) => pattern.test(entry.name))?.value || "";
  const byAny = (pattern) => entries.find((entry) => pattern.test(`${entry.name} ${entry.value}`))?.value || "";
  const allText = entries.map((entry) => `${entry.name}：${entry.value}`).join("；");

  const processor = firstValue([
    byName(/CPU型号|处理器|移动平台|芯片/i),
    extractMatch(allText, /(骁龙[^；。]+|天玑[^；。]+|麒麟[^；。]+|Kirin\s?\d+[^；。]*|Snapdragon[^；。]+|Dimensity[^；。]+|A\d{2}\s?Pro[^；。]*)/i)
  ]);

  const screenSize = firstValue([extractMatch(allText, /(\d(?:\.\d{1,2})?\s*英寸)/i), byName(/屏幕尺寸|尺寸（英寸）/i)]);
  const screenMaterial = firstValue([byName(/屏幕材质|显示屏|屏幕类型/i), extractMatch(allText, /(OLED|AMOLED|LTPO OLED|LCD)/i)]);
  const refresh = normalizeHz(firstValue([byName(/刷新率/i), extractMatch(allText, /最高支持\s*\d{2,3}\s*Hz|\d{2,3}\s*Hz\s*刷新率/i)]));
  const resolution = normalizeResolution(firstValue([byName(/分辨率/i), extractMatch(allText, /\d{3,4}\s*[x×]\s*\d{3,4}/i)]));
  const pwm = normalizeHz(firstValue([byName(/PWM|调光/i), extractMatch(allText, /\d{3,5}\s*Hz[^；。]*(?:PWM|调光)/i)]));
  const touch = normalizeHz(firstValue([byName(/触控采样率|触控/i), extractMatch(allText, /\d{2,4}\s*Hz[^；。]*(?:触控|采样)/i)]));
  const ltpo = /LTPO/i.test(allText) ? "LTPO" : "";

  const camera = buildCamera(entries, allText);
  const battery = buildBattery(entries, allText);
  const body = buildBody(entries, allText);
  const other = buildOther(entries, allText);
  const price = buildPrice(entries, allText);

  const screenLines = compactLines([
    joinParts([screenSize, screenMaterial ? `${screenMaterial} 屏` : ""]),
    joinParts([refresh ? `${refresh} 刷新率` : "", ltpo], " / "),
    resolution ? `${resolution} 分辨率` : "",
    pwm ? `${pwm} 高频 PWM 调光` : "",
    touch ? `${touch} 触控采样率` : ""
  ]);

  return {
    model: result.model || result.title || "未命名机型",
    processor: processor ? [processor] : [],
    screen: screenLines,
    camera,
    battery,
    body,
    other,
    price,
    table: {
      processor: processor || "",
      screen: joinParts([joinParts([screenSize, screenMaterial], " "), refresh ? `${refresh}刷新率` : "", resolution, pwm], "<br>"),
      camera: camera.slice(0, 3).join("<br>"),
      battery: battery.join("<br>"),
      body: body.join("<br>"),
      other: other.slice(0, 4).join("<br>"),
      price: price.join("<br>")
    }
  };
}

function buildCamera(entries, allText) {
  const front = firstValue([entryValue(entries, /前置摄像头像素|前置像素/i), extractLens(allText, /前置[^；。]*(\d{2,4}\s*万像素)/i)]);
  const rearPixels = firstValue([entryValue(entries, /后置摄像头像素|后置像素|后置相机/i), ""]);
  const aperture = firstValue([entryValue(entries, /后置摄像头光圈|后置.*光圈/i), entryValue(entries, /光圈/i)]);
  const stabilizer = entryValue(entries, /防抖/i);
  const zoom = entryValue(entries, /光学变焦|变焦/i);
  const special = extractMatch(allText, /(红枫原色镜头|原色镜头|光谱镜头|ToF镜头|激光对焦)/i);

  const main = buildRearLens("主摄", rearPixels, aperture, stabilizer, zoom, /主摄|主摄像头/i);
  const tele = buildRearLens("长焦", rearPixels, aperture, stabilizer, zoom, /长焦|潜望/i);
  const wide = buildRearLens("超广角/微距", rearPixels, aperture, stabilizer, zoom, /超广角|广角|微距/i);

  return compactLines([
    front ? `前置：${normalizePixel(front)}` : "",
    main,
    tele,
    wide,
    special ? `其他：${special}` : ""
  ]);
}

function buildRearLens(label, pixelsText, apertureText, stabilizerText, zoomText, keyword) {
  const pixel = lensPixel(pixelsText, keyword);
  if (!pixel) return "";
  const aperture = lensAperture(apertureText, keyword);
  const ois = keyword.test(stabilizerText) && /OIS|光学防抖|防抖/i.test(stabilizerText) ? "OIS" : "";
  const optical = lensOpticalZoom(zoomText, keyword);
  return `${label}：${[normalizePixel(pixel), aperture, ois, optical].filter(Boolean).join("，")}`;
}

function buildBattery(entries, allText) {
  const batteryText = entryValue(entries, /电池容量|电池/i);
  const chargeText = entryValue(entries, /充电规格|充电|快充|闪充/i);
  const capacity = firstValue([
    extractMatch(batteryText, /典型容量[:：]?\s*(\d{4,5}\s*mAh)/i, 1),
    extractMatch(allText, /典型容量[:：]?\s*(\d{4,5}\s*mAh)/i, 1),
    extractMatch(batteryText, /(\d{4,5}\s*mAh)/i, 1),
    extractMatch(allText, /(\d{4,5}\s*mAh)/i, 1)
  ]);
  const rated = extractMatch(batteryText, /额定容量[:：]?\s*(\d{4,5}\s*mAh)/i, 1);
  const wired = normalizeCharge(firstValue([extractMatch(chargeText, /(\d{2,3}\s*W)[^；。]*(?:有线|快充|闪充|超快)/i, 1), extractMatch(chargeText, /(\d{2,3}\s*W)/i, 1)]), "有线快充");
  const wireless = normalizeCharge(extractMatch(chargeText, /(\d{2,3}\s*W)[^；。]*无线/i, 1), "无线快充");
  const reverse = /反向充电/.test(`${batteryText} ${chargeText}`) ? "支持反向充电" : "";

  return compactLines([
    capacity ? `${capacity.replace(/\s+/g, "")} 电池${rated ? `（额定 ${rated.replace(/\s+/g, "")}）` : ""}` : "",
    wired,
    wireless,
    reverse
  ]);
}

function buildBody(entries, allText) {
  const thickness = entryValue(entries, /厚度/i);
  const weight = entryValue(entries, /重量/i);
  const glass = firstValue([entryValue(entries, /玻璃/i), extractMatch(allText, /(昆仑玻璃|超瓷晶玻璃|大猩猩玻璃|晶盾玻璃)/i)]);
  const back = firstValue([entryValue(entries, /后盖|背板/i), extractMatch(allText, /(玻璃背板|素皮后盖|陶瓷后盖|玻纤背板)/i)]);
  const frame = firstValue([entryValue(entries, /边框/i), extractMatch(allText, /(金属边框|铝合金边框|钛金属边框)/i)]);
  const ip = extractMatch(allText, /(IP(?:68|69K?|65|64)[^；。]*)/i);

  return compactLines([
    thickness ? `厚度：${normalizeMm(thickness)}` : "",
    weight ? `重量：${normalizeWeight(weight)}` : "",
    glass ? `玻璃材质：${shorten(cleanLine(glass), 38)}` : "",
    back ? `后盖：${shorten(cleanLine(back), 38)}` : "",
    frame ? `边框：${shorten(cleanLine(frame), 38)}` : "",
    ip ? `防护：${shorten(cleanLine(ip), 38)}` : ""
  ]);
}

function buildOther(entries, allText) {
  const system = entryValue(entries, /操作系统|系统/i);
  const fingerprint = firstValue([entryValue(entries, /指纹/i), extractMatch(allText, /(侧边指纹|屏幕指纹|超声波[^；。]*指纹)/i)]);
  const usb = firstValue([entryValue(entries, /USB版本/i), entryValue(entries, /USB接口类型/i), extractMatch(allText, /USB\s*(?:2\.0|3\.\d|Type-C)/i)]);
  const bluetooth = firstValue([
    entryValue(entries, /蓝牙传输|蓝牙协议/i),
    extractMatch(allText, /蓝牙协议支持\s*\d(?:\.\d)?/i),
    extractMatch(allText, /蓝牙\s*\d(?:\.\d)?/i)
  ]);
  const wifi = extractMatch(allText, /Wi-?Fi\s*\d/i);
  const nfc = /NFC/.test(allText) ? "NFC" : "";
  const infrared = /红外/.test(allText) ? "红外" : "";
  const satellite = extractMatch(allText, /[^；。]*(?:卫星通信|卫星消息|北斗卫星)[^；。]*/i);

  return compactLines([
    system ? shorten(cleanLine(system), 42) : "",
    fingerprint ? shorten(cleanLine(fingerprint), 28) : "",
    joinParts([nfc, infrared, wifi, bluetooth ? normalizeBluetooth(bluetooth) : ""], " / "),
    satellite ? shorten(cleanLine(satellite), 42) : "",
    usb ? normalizeUsb(usb) : ""
  ]);
}

function buildPrice(entries, allText) {
  const priceText = entries.filter((entry) => /价格|售价|零售价|¥|￥|元/.test(`${entry.name} ${entry.value}`)).map((entry) => entry.value).join("；") || allText;
  const found = [];
  const pattern = /((?:\d{1,2}GB\+)?(?:256GB|512GB|1TB|2TB))\s*[:：]\s*(\d[\d\s.]{2,8})\s*元/g;
  for (const match of priceText.matchAll(pattern)) {
    found.push(`${match[1]}：${normalizePrice(match[2])} 元`);
  }
  const start = found.length ? `${Math.min(...found.map((item) => Number(item.match(/(\d+)\s*元/)?.[1] || 999999)))} 元起` : "";
  return compactLines([...unique(found), start]);
}

function entryValue(entries, pattern) {
  return entries.find((entry) => pattern.test(entry.name))?.value || "";
}

function firstValue(values) {
  return values.map((value) => cleanLine(value)).find(Boolean) || "";
}

function compactLines(lines) {
  return unique(lines.map((line) => cleanLine(line)).filter(Boolean));
}

function joinParts(parts, separator = " ") {
  return parts.map((part) => cleanLine(part)).filter(Boolean).join(separator);
}

function stripLabel(value) {
  return String(value || "").replace(/^[^：:]+[:：]\s*/, "");
}

function extractMatch(text, pattern, group = 0) {
  const match = cleanLine(text).match(pattern);
  return cleanLine(match?.[group] || "");
}

function extractLens(text, pattern) {
  return extractMatch(text, pattern, 1);
}

function lensPixel(text, keyword) {
  const chunks = String(text || "").split(/[+；;]/).map(cleanLine);
  const hit = chunks.find((chunk) => keyword.test(chunk)) || "";
  return extractMatch(hit, /(\d{2,4}\s*万像素|\d{2,3}\s*MP)/i, 1);
}

function lensAperture(text, keyword) {
  const chunks = String(text || "").split(/[，,；;]/).map(cleanLine);
  const hit = chunks.find((chunk) => keyword.test(chunk)) || "";
  const value = extractMatch(hit, /f\/?\s?(\d(?:\.\d+)?)/i, 1);
  return value ? `F${value}` : "";
}

function lensOpticalZoom(text, keyword) {
  if (!/光学/.test(text) || !keyword.test(text)) return "";
  const value = extractMatch(text, /(\d(?:\.\d+)?)\s*[xX倍]\s*光学/i, 1);
  return value ? `${value}X 光学变焦` : "";
}

function normalizePixel(value) {
  return cleanLine(value).replace(/\s+/g, "");
}

function normalizeHz(value) {
  const match = cleanLine(value).match(/(\d{2,5})\s*Hz/i);
  return match ? `${match[1]}Hz` : "";
}

function normalizeResolution(value) {
  const match = cleanLine(value).match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
  return match ? `${match[1]} × ${match[2]}` : "";
}

function normalizeCharge(value, label) {
  const match = cleanLine(value).match(/(\d{2,3})\s*W/i);
  return match ? `${match[1]}W ${label}` : "";
}

function normalizeMm(value) {
  const clean = cleanLine(value).replace(/毫米/g, "mm");
  if (/[:：；;]/.test(clean)) return clean.replace(/\s+/g, "");
  const match = clean.match(/(\d(?:\.\d+)?)\s*mm/i);
  return match ? `${match[1]}mm` : clean;
}

function normalizeWeight(value) {
  const clean = cleanLine(value);
  if (/[:：；;]/.test(clean)) return clean.replace(/\s+/g, "");
  const match = clean.match(/(?:约)?\s*(\d{2,3}(?:\.\d+)?)\s*g/i);
  return match ? `约${match[1]}g` : clean;
}

function normalizeBluetooth(value) {
  const match = cleanLine(value).match(/(?:蓝牙)?\s*(\d(?:\.\d)?)/i);
  return match ? `蓝牙 ${match[1]}` : "";
}

function normalizeUsb(value) {
  const clean = cleanLine(value);
  const version = extractMatch(clean, /(USB\s*(?:2\.0|3\.\d(?:\s*Gen\d)?|Type-C))/i);
  return version || clean;
}

function normalizePrice(value) {
  const number = cleanLine(value).replace(/\s+/g, "").replace(/\.00$/, "");
  return String(Number.parseInt(number, 10) || number);
}

function printSummary(result) {
  if (!result.ok) {
    console.warn(`grab failed: ${result.url} (${result.error})`);
    return;
  }

  const categoryNames = Object.keys(result.categories).join(" / ");
  console.log(`grabbed specs: ${result.model || result.title || result.url}`);
  console.log(`  entries: ${result.entryCount}`);
  console.log(`  categories: ${categoryNames}`);
  if (!args.stdout) console.log(`  output: ${outputDir}`);
}

function printHelp() {
  console.log(`Usage:
  npm run grab -- https://example.com/phone/specs
  npm run grab -- https://example.com/phone/specs --out grabbed-specs
  npm run grab -- --file urls.txt
  npm run grab -- https://example.com/phone/specs --stdout
`);
}

function normalizeName(value) {
  return cleanLine(value)
    .replace(/^[-:：|/\\]+|[-:：|/\\]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 46);
}

function normalizeValue(value) {
  return cleanLine(value)
    .replace(/^[-:：|/\\]+|[-:：|/\\]+$/g, "")
    .replace(/\s*([；;])\s*/g, "；")
    .slice(0, 900);
}

function cleanLine(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ");
}

function decodeJsString(value) {
  return String(value || "")
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function safeCodePoint(code) {
  if (!Number.isFinite(code)) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function absoluteUrl(value, baseUrl) {
  if (!value || value.startsWith("#") || /^javascript:/i.test(value)) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function uniqueEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = `${entry.name.toLowerCase()}::${entry.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function unique(values, keyFn = (value) => String(value)) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slugify(value) {
  return String(value || "phone")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "phone";
}

function escapeTableCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shorten(value, max) {
  const clean = cleanLine(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
