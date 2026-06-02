import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(rootDir, "feeds.config.json");
const outputPath = resolve(rootDir, "generated-news.js");
const dailyOutputPath = resolve(rootDir, "generated-daily.js");

const config = JSON.parse(await readFile(configPath, "utf8"));
const nowDate = new Date();
const now = nowDate.toISOString();
const runDate = toLocalIsoDate(nowDate);
const updateWindowStart = toLocalIsoDate(addLocalDays(nowDate, -1));
const [rssItems, newsNowItems, coolapkUserItems, socialItems] = await Promise.all([
  mapWithConcurrency(config.feeds || [], config.concurrency || 6, fetchFeed).then((items) => items.flat()),
  fetchNewsNowSources(),
  fetchCoolapkUserSources(),
  fetchSocialSources()
]);
const collected = [...rssItems, ...newsNowItems, ...coolapkUserItems, ...socialItems];

const uniqueItems = dedupe(collected)
  .filter(isInUpdateWindow)
  .filter(isRelevant)
  .sort(compareByPublishedAt)
  .slice(0, config.maxItems || 120);

if (!collected.length) {
  console.warn("no feed items fetched; keeping existing generated files");
  process.exitCode = 1;
} else if (!uniqueItems.length) {
  console.log(`no items from ${updateWindowStart} to ${runDate}; keeping existing generated files`);
} else {
  const output = `window.phoneRadarAuto = ${JSON.stringify({ updatedAt: now, news: uniqueItems }, null, 2)};\n`;
  const dailyOutput = `window.phoneRadarDaily = ${JSON.stringify(buildDailyReport(uniqueItems), null, 2)};\n`;
  await writeFile(outputPath, output, "utf8");
  await writeFile(dailyOutputPath, dailyOutput, "utf8");

  console.log(`updated ${uniqueItems.length} items -> ${outputPath}`);
  console.log(`daily report -> ${dailyOutputPath}`);
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 8000);

  try {
    const response = await fetch(feed.url, {
      headers: {
        "user-agent": "PhoneRadar/1.0 (+local personal news reader)"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`skip ${feed.name}: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseFeed(xml, feed.url).map((item) => normalizeItem(item, feed));
  } catch (error) {
    const reason = error.name === "AbortError" ? "timeout" : error.message;
    console.warn(`skip ${feed.name}: ${reason}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNewsNowSources() {
  const sources = Array.isArray(config.newsNowSources) ? config.newsNowSources : [];
  if (!sources.length) return [];

  return (await mapWithConcurrency(sources, config.newsNowConcurrency || config.concurrency || 6, fetchNewsNowSource)).flat();
}

async function fetchNewsNowSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 8000);

  try {
    const response = await fetch(newsNowApiUrl(source.id), {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "referer": "https://newsnow.busiyi.world/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`skip ${source.name}: HTTP ${response.status}`);
      return [];
    }

    const payload = await response.json();
    if (!Array.isArray(payload.items)) {
      console.warn(`skip ${source.name}: invalid NewsNow response`);
      return [];
    }

    if (!["success", "cache"].includes(payload.status)) {
      console.warn(`skip ${source.name}: NewsNow status ${payload.status || "unknown"}`);
      return [];
    }

    return payload.items.map((item) => normalizeNewsNowItem(item, source)).filter(Boolean);
  } catch (error) {
    const reason = error.name === "AbortError" ? "timeout" : error.message;
    console.warn(`skip ${source.name}: ${reason}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function newsNowApiUrl(sourceId) {
  const base = String(config.newsNowApiBase || "https://newsnow.busiyi.world").replace(/\/+$/, "");
  const url = new URL(`${base}/api/s`);
  url.searchParams.set("id", sourceId);
  url.searchParams.set("latest", "");
  return url.href;
}

async function fetchCoolapkUserSources() {
  const sources = Array.isArray(config.coolapkUserSources) ? config.coolapkUserSources : [];
  if (!sources.length) return [];

  return (await mapWithConcurrency(sources, config.coolapkConcurrency || 2, fetchCoolapkUserSource)).flat();
}

async function fetchCoolapkUserSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 8000);

  try {
    const response = await fetch(coolapkUserFeedUrl(source.uid), {
      headers: coolapkHeaders(),
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`skip ${source.name}: HTTP ${response.status}`);
      return [];
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
      console.warn(`skip ${source.name}: invalid Coolapk response`);
      return [];
    }

    return payload.data
      .slice(0, source.maxItems || 10)
      .map((item) => normalizeCoolapkUserItem(item, source))
      .filter(Boolean);
  } catch (error) {
    const reason = error.name === "AbortError" ? "timeout" : error.message;
    console.warn(`skip ${source.name}: ${reason}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function coolapkUserFeedUrl(uid) {
  const url = new URL("https://api.coolapk.com/v6/user/feedList");
  url.searchParams.set("uid", uid);
  url.searchParams.set("page", "1");
  return url.href;
}

function coolapkHeaders() {
  return {
    "X-Requested-With": "XMLHttpRequest",
    "X-App-Id": "com.coolapk.market",
    "X-App-Token": coolapkAppToken(),
    "X-Sdk-Int": "29",
    "X-Sdk-Locale": "zh-CN",
    "X-App-Version": "11.0",
    "X-Api-Version": "11",
    "X-App-Code": "2101202",
    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; Redmi K30 5G MIUI/V12.0.3.0.QGICMXM) (#Build; Redmi; Redmi K30 5G; QKQ1.191222.002 test-keys; 10) +CoolMarket/11.0-2101202"
  };
}

function coolapkAppToken() {
  const deviceId = [10, 6, 6, 6, 14].map((length) => Math.random().toString(36).substring(2, length)).join("-");
  const nowSeconds = Math.round(Date.now() / 1000);
  const source = `token://com.coolapk.market/c67ef5943784d09750dcfbb31020f0ab?${md5(String(nowSeconds))}$${deviceId}&com.coolapk.market`;
  return `${md5(Buffer.from(source).toString("base64"))}${deviceId}0x${nowSeconds.toString(16)}`;
}

async function fetchSocialSources() {
  const weiboSources = Array.isArray(config.weiboSources) ? config.weiboSources : [];
  const xSources = Array.isArray(config.xSources) ? config.xSources : [];
  if (!weiboSources.length && !xSources.length) return [];

  const weiboResults = await mapWithConcurrency(weiboSources, 1, (source) => fetchSocialFeedSource(source, "weibo", normalizeWeiboPost));
  const xResults = await mapWithConcurrency(xSources, 1, (source) => fetchSocialFeedSource(source, "x", normalizeXPost));
  const feedItems = [...weiboResults.flat(), ...xResults.flat()];

  if (!config.browserFallbackEnabled) return feedItems;

  const weiboFallbackItems = (await mapWithConcurrency(
    weiboSources.filter((_, index) => !weiboResults[index]?.length),
    1,
    fetchWeiboSource
  )).flat();
  const xFallbackItems = (await mapWithConcurrency(
    xSources.filter((_, index) => !xResults[index]?.length),
    1,
    fetchXSource
  )).flat();

  return [...feedItems, ...weiboFallbackItems, ...xFallbackItems];
}

async function fetchSocialFeedSource(source, kind, normalizePost) {
  const url = socialFeedUrl(source, kind);
  if (!url) {
    console.warn(`skip ${source.name}: no ${kind} RSS URL`);
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 8000);

  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/rss+xml,application/xml,text/xml,*/*",
        "user-agent": "PhoneRadar/1.0 (+local personal news reader)"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`skip ${source.name}: RSS HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const posts = parseFeed(xml)
      .slice(0, source.maxItems || 10)
      .map(feedItemToSocialPost)
      .map((post) => normalizePost(post, source))
      .filter(Boolean);

    if (!posts.length) {
      console.warn(`skip ${source.name}: no ${kind} RSS posts`);
    }

    return posts;
  } catch (error) {
    const reason = error.name === "AbortError" ? "timeout" : error.message;
    console.warn(`skip ${source.name}: RSS ${reason}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function socialFeedUrl(source, kind) {
  if (source.rssUrl) return source.rssUrl;

  const base = String(config.socialRssBase || "").replace(/\/+$/, "");
  if (!base) return "";

  if (kind === "weibo" && source.uid) {
    return `${base}/weibo/user/${encodeURIComponent(source.uid)}?format=rss`;
  }

  if (kind === "x" && source.handle) {
    const url = new URL(`${base}/twitter/user/${encodeURIComponent(source.handle)}`);
    url.searchParams.set("format", "rss");
    url.searchParams.set("count", String(source.maxItems || 8));
    return url.href;
  }

  return "";
}

function feedItemToSocialPost(item) {
  return {
    url: item.url,
    time: item.date,
    text: item.summary || item.title,
    image: item.image
  };
}

async function fetchWeiboSource(source) {
  let targetId = "";

  try {
    const created = await cdpPost("/new", source.url);
    targetId = created.targetId;
    if (!targetId) throw new Error("no browser target");

    await refreshAndScrollSource(targetId, source, {
      loadDelayMs: 4000,
      scrollDelayMs: 1500,
      scrollPasses: 2,
      scrollY: 2200
    });

    let posts = await extractBrowserPosts(targetId, source, buildWeiboExtractor, normalizeWeiboPost);
    if (!posts.length) {
      await refreshAndScrollSource(targetId, source, {
        loadDelayMs: 4000,
        scrollDelayMs: 1500,
        scrollPasses: 2,
        scrollY: 2200
      });
      posts = await extractBrowserPosts(targetId, source, buildWeiboExtractor, normalizeWeiboPost);
    }

    if (!posts.length) {
      console.warn(`skip ${source.name}: no weibo posts, check Chrome login`);
    }

    return posts;
  } catch (error) {
    console.warn(`skip ${source.name}: ${error.message}`);
    return [];
  } finally {
    if (targetId) {
      await cdpGet(`/close?target=${encodeURIComponent(targetId)}`).catch(() => null);
    }
  }
}

function buildWeiboExtractor(source) {
  return `(() => {
    const uid = ${JSON.stringify(source.uid)};
    const sourceName = ${JSON.stringify(source.name)};
    const maxItems = ${Number(source.maxItems || 10)};
    const cards = [...document.querySelectorAll("article")];
    const seen = new Set();
    const posts = [];

    function clean(value) {
      return String(value || "")
        .replace(/[\\u200b\\u200c\\u200d\\ufeff]/g, "")
        .replace(/\\s+\\.\\.\\.展开$/g, "")
        .trim();
    }

    function usefulImage(src) {
      return /^https?:\\/\\//i.test(src)
        && /sinaimg\\.cn/i.test(src)
        && !/(tvax|tva|face|h5\\.sinaimg|avatar|vvip|icon)/i.test(src);
    }

    for (const card of cards) {
      const link = [...card.querySelectorAll("a")]
        .find((anchor) => anchor.href.includes("/" + uid + "/"));
      if (!link) continue;

      const url = link.href.split("?")[0];
      if (seen.has(url)) continue;
      seen.add(url);

      const lines = clean(card.innerText).split(/\\n+/).map(clean).filter(Boolean);
      const nameIndex = lines.findIndex((line) => line === sourceName);
      if (nameIndex < 0) continue;

      const time = lines[nameIndex + 1] || link.innerText || "";
      const contentLines = lines.slice(nameIndex + 2)
        .filter((line) => line !== "已编辑")
        .filter((line) => !/^来自\\s/.test(line))
        .filter((line) => !/^\\d+$/.test(line));
      const text = clean(contentLines.join("\\n"));
      if (!text || text.length < 8) continue;

      const image = [...card.querySelectorAll("img")]
        .map((img) => img.currentSrc || img.src)
        .find(usefulImage) || "";

      posts.push({ url, time, text, image });
      if (posts.length >= maxItems) break;
    }

    return JSON.stringify(posts);
  })()`;
}

function normalizeWeiboPost(post, source) {
  const summary = trimSummary(cleanText(post.text), config.summaryLimit || 360);
  if (!summary) return null;

  const inferredBrand = inferBrand(summary) || source.brand || "行业";
  const published = socialDateParts(post.time);
  const date = published.date;

  return {
    id: `weibo-${hash(post.url || `${source.name}-${post.time}-${summary}`)}`,
    title: makeWeiboTitle(summary, source.name),
    source: source.name,
    brand: inferredBrand,
    model: inferredBrand === "行业" ? "智能手机市场" : `${inferredBrand} 相关机型`,
    type: source.type || "爆料",
    trust: source.trust || "高关注爆料源",
    date,
    time: published.time,
    publishedAt: published.publishedAt,
    url: cleanText(post.url),
    image: firstImageUrl(post.image),
    summary,
    tags: [inferredBrand, source.type || "爆料", "微博"]
  };
}

async function fetchXSource(source) {
  let targetId = "";

  try {
    const created = await cdpPost("/new", source.url);
    targetId = created.targetId;
    if (!targetId) throw new Error("no browser target");

    await refreshAndScrollSource(targetId, source, {
      loadDelayMs: 6000,
      scrollDelayMs: 1200,
      scrollPasses: 2,
      scrollY: 1600
    });

    let posts = await extractBrowserPosts(targetId, source, buildXExtractor, normalizeXPost);
    if (!posts.length) {
      await refreshAndScrollSource(targetId, source, {
        loadDelayMs: 6000,
        scrollDelayMs: 1200,
        scrollPasses: 2,
        scrollY: 1600
      });
      posts = await extractBrowserPosts(targetId, source, buildXExtractor, normalizeXPost);
    }

    if (!posts.length) {
      console.warn(`skip ${source.name}: no X posts, check Chrome login or source relevance`);
    }

    return posts;
  } catch (error) {
    console.warn(`skip ${source.name}: ${error.message}`);
    return [];
  } finally {
    if (targetId) {
      await cdpGet(`/close?target=${encodeURIComponent(targetId)}`).catch(() => null);
    }
  }
}

async function extractBrowserPosts(targetId, source, buildExtractor, normalizePost) {
  const extracted = await cdpEval(targetId, buildExtractor(source));
  return parseCdpValue(extracted)
    .map((post) => normalizePost(post, source))
    .filter(Boolean);
}

async function refreshAndScrollSource(targetId, source, defaults) {
  const loadDelayMs = Number(source.loadDelayMs || defaults.loadDelayMs || 4000);
  const refreshDelayMs = Number(source.refreshDelayMs || loadDelayMs);
  const scrollDelayMs = Number(source.scrollDelayMs || defaults.scrollDelayMs || 1200);
  const scrollPasses = Math.max(1, Number(source.scrollPasses || defaults.scrollPasses || 1));
  const scrollY = Number(source.scrollY || defaults.scrollY || 1600);

  await delay(loadDelayMs);
  await cdpPost(`/navigate?target=${encodeURIComponent(targetId)}`, source.url).catch(() => null);
  await delay(refreshDelayMs);

  for (let index = 0; index < scrollPasses; index += 1) {
    await cdpGet(`/scroll?target=${encodeURIComponent(targetId)}&y=${encodeURIComponent(scrollY)}`).catch(() => null);
    await delay(scrollDelayMs);
  }
}

function buildXExtractor(source) {
  return `(() => {
    const handle = ${JSON.stringify(source.handle)};
    const sourceName = ${JSON.stringify(source.name)};
    const maxItems = ${Number(source.maxItems || 8)};
    const cards = [...document.querySelectorAll("article")];
    const seen = new Set();
    const posts = [];

    function clean(value) {
      return String(value || "")
        .replace(/[\\u200b\\u200c\\u200d\\ufeff]/g, "")
        .trim();
    }

    function isTimeLine(line) {
      return /(秒|分钟|小时|昨天|前天|月|日|s$|m$|h$|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line);
    }

    function isMetric(line) {
      return /^[\\d,.万千Kk]+$/.test(line);
    }

    function usefulImage(src) {
      return /^https?:\\/\\//i.test(src)
        && /pbs\\.twimg\\.com\\/media/i.test(src)
        && !/(profile_images|emoji|abs\\.twimg)/i.test(src);
    }

    for (const card of cards) {
      const link = [...card.querySelectorAll("a")]
        .find((anchor) => anchor.href.includes("/" + handle + "/status/") && !/\\/(photo|analytics)\\b/.test(anchor.href));
      if (!link) continue;

      const url = link.href.split("?")[0];
      if (seen.has(url)) continue;
      seen.add(url);

      const lines = clean(card.innerText).split(/\\n+/).map(clean).filter(Boolean);
      const time = lines.find(isTimeLine) || link.innerText || "";
      const contentLines = lines
        .filter((line) => line !== sourceName)
        .filter((line) => line !== "@" + handle)
        .filter((line) => line !== "·")
        .filter((line) => line !== "翻译自 英语")
        .filter((line) => line !== "显示原文")
        .filter((line) => line !== "Translate post")
        .filter((line) => line !== "Show original")
        .filter((line) => line !== time)
        .filter((line) => !isMetric(line))
        .map((line) => clean(line.replace(/^\\d+\\s*(?:秒|分钟|小时|s|m|h)\\s*/i, "")))
        .filter(Boolean);
      const text = clean(contentLines.join("\\n"));
      if (!text || text.length < 8) continue;

      const image = [...card.querySelectorAll("img")]
        .map((img) => img.currentSrc || img.src)
        .find(usefulImage) || "";

      posts.push({ url, time, text, image });
      if (posts.length >= maxItems) break;
    }

    return JSON.stringify(posts);
  })()`;
}

function normalizeXPost(post, source) {
  const summary = trimSummary(cleanText(post.text).replace(/^\d+\s*(?:秒|分钟|小时|s|m|h)\s*/i, ""), config.summaryLimit || 360);
  if (!summary || !isUsefulXPost(summary)) return null;

  const inferredBrand = inferBrand(summary) || source.brand || "iPhone";
  const published = socialDateParts(post.time);
  const date = published.date;

  return {
    id: `x-${hash(post.url || `${source.name}-${post.time}-${summary}`)}`,
    title: makeSocialTitle(summary, source.name),
    source: source.name,
    brand: inferredBrand,
    model: inferredBrand === "行业" ? "智能手机市场" : `${inferredBrand} 相关机型`,
    type: source.type || "爆料",
    trust: source.trust || "高关注爆料源",
    date,
    time: published.time,
    publishedAt: published.publishedAt,
    url: cleanText(post.url),
    image: firstImageUrl(post.image),
    summary,
    tags: [inferredBrand, source.type || "爆料", "X"]
  };
}

function isUsefulXPost(text) {
  if (/(apple music|facetime|google meet|音乐|订阅|视频会议|听筒扬声器.*进步|经历了.*演变)/i.test(text)) {
    return false;
  }

  return /(iphone|galaxy|pixel|fold|ultra|camera|display|screen|battery|chip|launch|price|rumou?r|reported|leak|传闻|报道|爆料|折痕|折叠|屏幕|相机|影像|电池|芯片|发布|价格|机模|配色)/i.test(text);
}

function makeSocialTitle(text, sourceName) {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || text;
  return trimSummary(`${sourceName}：${firstLine}`, 46);
}

function makeWeiboTitle(text, sourceName) {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || text;
  const title = firstLine.replace(/^独家信息[，,:：]?\s*/i, "独家信息：");
  return trimSummary(`${sourceName}：${title}`, 46);
}

function weiboDateToIso(value) {
  return socialDateToIso(value);
}

function socialDateToIso(value) {
  const text = String(value || "").trim();
  const date = new Date(nowDate);
  const hourMatch = text.match(/(\d+)\s*(?:小时前|h)/i);
  if (hourMatch) {
    date.setHours(date.getHours() - Number(hourMatch[1]));
    return toLocalIsoDate(date);
  }

  const minuteMatch = text.match(/(\d+)\s*(?:分钟前|m)/i);
  if (minuteMatch) {
    date.setMinutes(date.getMinutes() - Number(minuteMatch[1]));
    return toLocalIsoDate(date);
  }

  const secondMatch = text.match(/(\d+)\s*(?:秒前|s)/i);
  if (secondMatch) return runDate;

  const yesterdayMatch = text.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    date.setDate(date.getDate() - 1);
    date.setHours(Number(yesterdayMatch[1]), Number(yesterdayMatch[2]), 0, 0);
    return toLocalIsoDate(date);
  }

  const chineseMonthDayMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (chineseMonthDayMatch) {
    date.setMonth(Number(chineseMonthDayMatch[1]) - 1, Number(chineseMonthDayMatch[2]));
    return toLocalIsoDate(date);
  }

  const monthDayMatch = text.match(/(\d{1,2})-(\d{1,2})/);
  if (monthDayMatch) {
    date.setMonth(Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]));
    return toLocalIsoDate(date);
  }

  return runDate;
}

async function cdpGet(path) {
  const response = await fetchWithTimeout(`${cdpBase()}${path}`);
  return response.json();
}

async function cdpPost(path, body) {
  const response = await fetchWithTimeout(`${cdpBase()}${path}`, {
    method: "POST",
    body
  });
  return response.json();
}

function cdpEval(targetId, code) {
  return cdpPost(`/eval?target=${encodeURIComponent(targetId)}`, code);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.browserSourceTimeoutMs || 12000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCdpValue(payload) {
  if (payload?.error) throw new Error(payload.error);
  const value = payload?.value;
  if (!value) return [];
  return typeof value === "string" ? JSON.parse(value) : value;
}

function cdpBase() {
  return config.cdpProxyUrl || "http://localhost:3456";
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

function parseFeed(xml, baseUrl = "") {
  const blocks = blocksBetween(xml, "item");
  const entries = blocks.length ? blocks : blocksBetween(xml, "entry");

  return entries.map((block) => ({
    title: textFromTag(block, "title"),
    url: linkFromBlock(block),
    date: textFromTag(block, "pubDate") || textFromTag(block, "updated") || textFromTag(block, "published"),
    summary: textFromTag(block, "description") || textFromTag(block, "summary") || textFromTag(block, "content"),
    image: imageFromBlock(block, baseUrl)
  }));
}

function normalizeItem(item, feed) {
  const title = cleanText(item.title);
  const url = normalizeFeedUrl(cleanText(item.url), feed.url);
  const summary = trimSummary(cleanText(item.summary), config.summaryLimit || 360);
  const published = dateParts(item.date);
  const date = published.date;
  const inferredBrand = inferBrand(`${title} ${summary}`) || feed.brand;

  return {
    id: `auto-${hash(url || `${feed.name}-${title}-${date}`)}`,
    title,
    source: feed.name,
    brand: inferredBrand,
    model: inferredBrand === "行业" ? "智能手机市场" : `${inferredBrand} 相关机型`,
    type: feed.type,
    trust: feed.trust,
    date,
    time: published.time,
    publishedAt: published.publishedAt,
    url,
    image: firstImageUrl(item.image),
    summary: summary || "自动抓取的资讯，建议打开来源阅读全文后再做判断。",
    tags: [inferredBrand, feed.type, "自动抓取"]
  };
}

function normalizeNewsNowItem(item, source) {
  const title = cleanText(item.title);
  const url = cleanText(item.url || item.mobileUrl || item.id);
  if (!title || !url) return null;

  const summary = trimSummary(cleanText(item.desc || item.summary || title), config.summaryLimit || 360);
  const published = dateParts(item.pubDate || item.date || item.updatedTime);
  const date = published.date;
  const inferredBrand = inferBrand(`${title} ${summary}`) || source.brand || "行业";

  return {
    id: `newsnow-${hash(`${source.id}-${url || title}-${date}`)}`,
    title,
    source: source.name,
    brand: inferredBrand,
    model: inferredBrand === "行业" ? "智能手机市场" : `${inferredBrand} 相关机型`,
    type: source.type || "爆料",
    trust: source.trust || "媒体汇总",
    date,
    time: published.time,
    publishedAt: published.publishedAt,
    url,
    image: firstImageUrl(item.cover, item.image, item.thumbnail, item.icon, item.extra?.cover, item.extra?.image),
    summary: summary || "NewsNow 聚合热榜，建议打开来源阅读全文后再做判断。",
    tags: [inferredBrand, source.type || "爆料", "NewsNow"]
  };
}

function normalizeCoolapkUserItem(item, source) {
  const summary = trimSummary(cleanText(item.message || item.editor_title || item.message_title), config.summaryLimit || 360);
  if (!summary) return null;

  const title = trimSummary(cleanText(item.message_title || item.editor_title || summary), 58);
  const inferredBrand = inferBrand(`${title} ${summary} ${item.ttitle || ""}`) || source.brand || "行业";
  const published = Number(item.dateline) ? dateParts(new Date(Number(item.dateline) * 1000)) : dateParts(item.pubDate);
  const date = published.date;
  const url = normalizeCoolapkUrl(item.url || (item.id ? `/feed/${item.id}` : source.url));

  return {
    id: `coolapk-user-${hash(`${source.uid}-${item.id || url}-${date}`)}`,
    title: `${source.name}：${title}`,
    source: source.name,
    brand: inferredBrand,
    model: inferredBrand === "行业" ? "智能手机市场" : `${inferredBrand} 相关机型`,
    type: source.type || "爆料",
    trust: source.trust || "高可信爆料",
    date,
    time: published.time,
    publishedAt: published.publishedAt,
    url,
    image: firstImageUrl(item.pic, item.message_cover, item.media_pic, item.media, item.media_info),
    summary,
    tags: [inferredBrand, source.type || "爆料", "酷安博主"]
  };
}

function normalizeCoolapkUrl(value) {
  const url = cleanText(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://www.coolapk.com${url.startsWith("/") ? "" : "/"}${url}`;
}

function blocksBetween(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  return xml.match(pattern) || [];
}

function textFromTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? decodeXml(match[1]) : "";
}

function linkFromBlock(block) {
  const hrefMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (hrefMatch) return decodeXml(hrefMatch[1]);
  return textFromTag(block, "link");
}

function imageFromBlock(block, baseUrl = "") {
  const raw = decodeXml(block);
  const candidates = [
    ...attributeMatches(raw, /<(?:media:content|media:thumbnail)\b[^>]*(?:url)=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*>/gi),
    ...attributeMatches(raw, /<enclosure\b[^>]*type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /<itunes:image\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi),
    ...attributeMatches(raw, /<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /<source\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi),
    ...attributeMatches(raw, /["'](?:image|thumbnail|thumbnailUrl)["']\s*:\s*["']([^"']+)["']/gi),
    ...attributeMatches(raw, /<(?:img|source)\b[^>]*(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi).flatMap(imageUrlsFromSrcset)
  ];

  return firstImageUrl(...candidates.map((candidate) => normalizeImageUrl(candidate, baseUrl)));
}

function attributeMatches(value, pattern) {
  return Array.from(value.matchAll(pattern), (match) => match[1]);
}

function firstImageUrl(...values) {
  for (const value of values.flatMap(expandImageValue)) {
    const url = cleanImageUrl(value);
    if (url) return url;
  }
  return "";
}

function expandImageValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(expandImageValue);
  if (typeof value === "object") return Object.values(value).flatMap(expandImageValue);
  return [value];
}

function normalizeImageUrl(value, baseUrl) {
  const url = cleanText(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("//")) return url;

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function imageUrlsFromSrcset(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .reverse();
}

function cleanImageUrl(value) {
  let url = cleanText(value);
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return "";
  if (/(spacer|tracking|pixel|avatar|logo|icon|sprite|blank|placeholder)/i.test(url)) return "";
  return url;
}

function normalizeFeedUrl(value, baseUrl) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(value)) return `https://${value}`;

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function cleanText(value) {
  return decodeXml(String(value || ""))
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/#欢迎关注[^。]+。?/g, " ")
    .replace(/查看全文/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function trimSummary(value, limit) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trim()}…`;
}

function toIsoDate(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function dateParts(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return {
      date: value.trim(),
      time: "",
      publishedAt: ""
    };
  }

  const parsed = value instanceof Date ? new Date(value) : value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return {
      date: runDate,
      time: "",
      publishedAt: ""
    };
  }

  const date = parsed;
  return {
    date: toLocalIsoDate(date),
    time: toLocalTime(date),
    publishedAt: date.toISOString()
  };
}

function socialDateParts(value) {
  return dateParts(socialDateTime(value));
}

function socialDateTime(value) {
  const text = String(value || "").trim();
  const date = new Date(nowDate);
  const hourMatch = text.match(/(\d+)\s*(?:小时前|小时|h)/i);
  if (hourMatch) {
    date.setHours(date.getHours() - Number(hourMatch[1]));
    return date;
  }

  const minuteMatch = text.match(/(\d+)\s*(?:分钟前|分钟|m)/i);
  if (minuteMatch) {
    date.setMinutes(date.getMinutes() - Number(minuteMatch[1]));
    return date;
  }

  const secondMatch = text.match(/(\d+)\s*(?:秒前|秒|s)|刚刚/i);
  if (secondMatch) return date;

  const yesterdayMatch = text.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    date.setDate(date.getDate() - 1);
    date.setHours(Number(yesterdayMatch[1]), Number(yesterdayMatch[2]), 0, 0);
    return date;
  }

  const chineseMonthDayMatch = text.match(/(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/);
  if (chineseMonthDayMatch) {
    date.setMonth(Number(chineseMonthDayMatch[1]) - 1, Number(chineseMonthDayMatch[2]));
    if (chineseMonthDayMatch[3]) date.setHours(Number(chineseMonthDayMatch[3]), Number(chineseMonthDayMatch[4]), 0, 0);
    return date;
  }

  const monthDayMatch = text.match(/(\d{1,2})-(\d{1,2})(?:\s*(\d{1,2}):(\d{2}))?/);
  if (monthDayMatch) {
    date.setMonth(Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]));
    if (monthDayMatch[3]) date.setHours(Number(monthDayMatch[3]), Number(monthDayMatch[4]), 0, 0);
    return date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? date : parsed;
}

function toLocalTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function compareByPublishedAt(a, b) {
  const left = Date.parse(a.publishedAt || a.date || "");
  const right = Date.parse(b.publishedAt || b.date || "");
  if (!Number.isNaN(left) && !Number.isNaN(right) && left !== right) return right - left;
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function hash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function dedupe(items) {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    if (!item.title || !item.url) continue;
    const key = item.url || item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }

  return results;
}

function inferBrand(text) {
  const normalized = text.toLowerCase();
  const directBrand = inferDirectBrand(text);
  if (directBrand) return directBrand;

  for (const [brand, keywords] of Object.entries(config.keywords || {})) {
    if (keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return brand;
    }
  }

  return "";
}

function inferDirectBrand(text) {
  if (/(荣耀|honor|magic\b)/i.test(text)) return "HONOR";
  if (/(华为|huawei|鸿蒙|harmonyos)/i.test(text)) return "Huawei";
  if (/(三星|samsung|galaxy)/i.test(text)) return "Samsung";
  if (/(小米|redmi|xiaomi|hyperos)/i.test(text)) return "Xiaomi";
  if (/(oppo|一加|oneplus|coloros)/i.test(text)) return "OPPO";
  if (/(vivo|iqoo|originos)/i.test(text)) return "vivo";
  if (/(pixel|tensor)/i.test(text)) return "Pixel";
  if (/(苹果|iphone|ios\b|apple intelligence|apple modem)/i.test(text)) return "iPhone";
  return "";
}

function isRelevant(item) {
  return isPhoneOnlyItem(item) || isTrustedCoolapkUserItem(item);
}

function isInUpdateWindow(item) {
  const date = String(item.date || "");
  return date >= updateWindowStart && date <= runDate;
}

function buildDailyReport(items) {
  const sortedItems = items
    .map((item) => ({ item, score: scoreNews(item) }))
    .filter(({ item, score }) => isUsefulDailyItem(item, score))
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .filter(uniqueDailyStory())
    .slice(0, 24);
  const issueDate = runDate;
  const sections = dailySections().map((section) => {
    const sectionItems = sortedItems
      .filter(({ item }) => classifySection(item) === section.id)
      .slice(0, section.id === "leaks" ? 8 : 6)
      .map(({ item, score }) => ({
        id: item.id,
        title: makeDisplayTitle(item),
        originalTitle: makeDisplayOriginalTitle(item),
        source: item.source,
        brand: item.brand,
        type: item.type,
        trust: item.trust,
        date: item.date,
        time: item.time,
        publishedAt: item.publishedAt,
        url: item.url,
        image: item.image,
        verdict: verdictFor(score),
        takeaway: makeTakeaway(item),
        detail: makeStoryDetail(item),
        keyPoints: makeKeyPoints(item),
        confidence: makeConfidenceNote(item),
        impact: makeImpact(item),
        action: makeAction(item)
      }));

    return { ...section, items: sectionItems };
  }).filter((section) => section.items.length);

  const reportItems = sections.flatMap((section) => section.items);
  const stats = {
    total: reportItems.length,
    iphone: reportItems.filter((item) => item.brand === "iPhone").length,
    leaks: sections.find((section) => section.id === "leaks")?.items.length || 0,
    official: reportItems.filter((item) => item.trust === "官方确认").length,
    specs: sections.find((section) => section.id === "specs")?.items.length || 0
  };

  return {
    updatedAt: now,
    issueDate,
    issue: `VOL.${issueDate.replaceAll("-", "").slice(2)}`,
    title: "手机情报日报",
    intro: makeDailyIntro(stats),
    stats,
    sections
  };
}

function uniqueDailyStory() {
  const seen = new Set();
  return ({ item }) => {
    const key = dailyStoryKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function dailyStoryKey(item) {
  return makeDisplayTitle(item)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function dailySections() {
  return [
    { id: "leaks", title: "重点爆料", hint: "机模、配色、影像、屏幕、电池和芯片线索先看。" },
    { id: "iphone", title: "iPhone 重点", hint: "不是硬件爆料，但和 iPhone 体验或路线有关。" },
    { id: "launch", title: "新机与官方发布", hint: "能直接更新到参数库。" },
    { id: "specs", title: "参数、跑分、认证", hint: "适合验证芯片、屏幕、影像和电池。" },
    { id: "review", title: "评测与体验", hint: "买前再细看，平时扫一眼即可。" },
    { id: "market", title: "行业趋势", hint: "看方向，不急着当购买依据。" }
  ];
}

function scoreNews(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  let score = 0;

  if (["IT之家", "爱范儿", "少数派"].includes(item.source)) score += 5;
  if (item.brand === "iPhone") score += 3;
  if (["Samsung", "Pixel", "Xiaomi", "OPPO", "vivo", "Huawei", "HONOR"].includes(item.brand)) score += 2;
  if (item.trust === "官方确认") score += isPhoneOnlyItem(item) ? 3 : 0;
  if (item.trust === "高关注爆料源") score += 4;
  if (item.trust === "高可信爆料") score += 3;
  if (item.trust === "监管/跑分") score += 2;
  if (item.type === "参数") score += 2;
  if (item.type === "市场报告") score += 1;
  if (isLeakPriority(item)) score += 7;
  if (isLeakPriority(item) && item.brand === "iPhone") score += 6;
  if (/(iphone\s?\d+.*(dummy|color|camera)|机模|配色|相机升级|color options|dummy models)/i.test(text)) score += 3;
  if (/(iphone|ios|a-series|apple intelligence|galaxy|pixel|tensor|camera|battery|display|price|launch|release|rumor|leak|手机|新机|旗舰|折叠屏|芯片|处理器|相机|影像|电池|续航|屏幕|价格|发布|爆料|认证|跑分|散热|系统更新)/i.test(text)) {
    score += 2;
  }
  if (hasDailyNoiseSignal(item)) score -= 6;
  if (/(apple tv|apple arcade|app store|sports|formula|pride|academy|developer academy|filmmaker|financial|earnings|fraudulent transactions|watch update|glp-1|音乐键盘|平板|汽车|钱包|carplay)/i.test(text)) {
    score -= 5;
  }

  return score;
}

function isUsefulDailyItem(item, score) {
  if (score < 4) return false;
  if (!isPhoneOnlyItem(item) && !isTrustedCoolapkUserItem(item)) return false;
  if (hasOffTopicSignal(item)) return false;
  if (hasDailyNoiseSignal(item)) return false;
  return hasTitlePhoneSignal(item);
}

function hasTitlePhoneSignal(item) {
  if (isTrustedCoolapkUserItem(item)) return true;
  if (hasStrongNonPhoneSignal(item)) return false;
  if (hasDailyNoiseSignal(item)) return false;
  if (item.source === "数码闲聊站") {
    return /(iphone|galaxy|pixel|mate|pura|xiaomi|redmi|oppo|oneplus|vivo|iqoo|honor|magic|huawei|手机|新机|旗舰|直屏|曲屏|折叠屏|长焦|影像|相机|电池|续航|芯片|处理器|入网|认证|跑分)/i.test(`${item.title} ${item.summary}`);
  }
  return /(iphone|ios\b|galaxy\s?s\d|galaxy\s?z|pixel\s?\d|mate\s?\d|pura|xiaomi\s?\d|redmi|oppo\s?reno|oppo\s?find|oneplus|reno\s?\d|find\s?x|vivo\s?s\d|vivo\s?x\d|iqoo|honor\s?\d|magic\s?\d|edge\s?\d|三星.*手机|小米.*手机|红米.*手机|荣耀.*手机|华为.*手机|一加.*手机|手机|新机|旗舰|折叠屏|直屏|曲屏|长焦|影像套装)/i.test(item.title);
}

function isPhoneOnlyItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (hasStrongNonPhoneSignal(item)) return false;
  if (hasOffTopicSignal(item)) return false;
  return /(iphone|ios\b|galaxy\s?s\d|galaxy\s?z|pixel\s?\d|mate\s?\d|pura|xiaomi\s?\d|redmi|oppo\s?reno|oppo\s?find|oneplus|reno\s?\d|find\s?x|vivo\s?s\d|vivo\s?x\d|iqoo|honor\s?\d|magic\s?\d|edge\s?\d|三星.*手机|小米.*手机|红米.*手机|荣耀.*手机|华为.*手机|一加.*手机|手机|新机|旗舰机|折叠屏|直屏|曲屏|长焦|影像套装)/i.test(text);
}

function isTrustedCoolapkUserItem(item) {
  if (!Array.isArray(item.tags) || !item.tags.includes("酷安博主")) return false;
  if (hasStrongNonPhoneSignal(item) || hasOffTopicSignal(item) || hasDailyNoiseSignal(item)) return false;
  if (item.brand && item.brand !== "行业") return true;

  const text = `${item.title} ${item.summary}`.toLowerCase();
  return /(手机|新机|旗舰|折叠屏|直屏|曲屏|长焦|影像|相机|电池|续航|充电|芯片|处理器|跑分|认证)/i.test(text);
}

function hasOffTopicSignal(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (hasProductNoise(text)) return true;
  return /(openai|chatgpt|anthropic|deepseek|黄仁勋|nvidia|token|\bai\b|ai 热情|烧掉|ai 基金|手机 ai|ai 器物志|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|halide|pro camera app|\bapp\b|care\+|summer holiday companion|apple tv|apple arcade|app store|sports|formula|mlb|baseball|the show|pride|academy|developer academy|filmmaker|financial|earnings|fraudulent transactions|driver'?s license|digital id|wallet|anti-snatching|stolen device|watch|galaxy watch|手表|apple watch|glp-1|dex|computer|音乐键盘|平板|ipad|macbook|mac\b|电脑|笔记本|酷睿|lenovo|联想|air14|汽车|蔚来|特斯拉|问界|启境|gt7|钱包|carplay|游戏|影视|开发者学院|mcn|致歉|雷军|repair|support|returned their phone|worse than dead|618|秒杀|国补|优惠|直降|低至|免息|领券|到手|京东|天猫|淘宝|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|耳机|支架|钢化膜|保护壳|空调|家电|钠离子|锂空气|宁德时代|世界杯|观赛)/i.test(text);
}

function hasStrongNonPhoneSignal(item) {
  const title = item.title.toLowerCase();
  if (hasProductNoise(title)) return true;
  return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|halide|pro camera app|\bapp\b|care\+|summer holiday companion|driver'?s license|digital id|wallet|anti-snatching|stolen device|mlb|baseball|the show|watch|galaxy watch|手表|apple watch|dex|computer|小组件|app\s*(获|更新|上架|适配)|应用市场|微信鸿蒙版|平板|ipad|macbook|mac\b|电脑|笔记本|汽车|蔚来|特斯拉|问界|启境|gt7|repair|support|returned their phone|worse than dead|国补|优惠|直降|低至|免息|领券|到手|京东|天猫|淘宝|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|耳机|支架|钢化膜|保护壳|空调|家电|音乐键盘|钠离子|锂空气|宁德时代|世界杯|观赛)/i.test(title);
}

function hasDailyNoiseSignal(item) {
  const title = item.title.toLowerCase();
  if (hasProductNoise(title)) return true;
  return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|halide|pro camera app|\bapp\b|care\+|summer holiday companion|mlb|baseball|the show|dex|computer|repair|support|returned their phone|worse than dead|anti-snatching|stolen device|国补|优惠|直降|低至|免息|京东|天猫|淘宝|618|促销|领券|到手|秒杀|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|手表|apple watch|耳机|支架|钢化膜|保护壳|小组件|app\s*(获|更新|上架|适配)|应用市场|driver'?s license|digital id|wallet|macbook)/i.test(title);
}

function hasProductNoise(text) {
  return /(卫星互联网|卫星发射|发射.*卫星|长征.*火箭|天地网络融合|西昌|apple music|facetime|google meet|youtube music|google icon|icon redesign|gradient google|headphones?|earbuds?|buds\b|tws\b|\bpad\b|tablet|tab s\d|giztop|available on giztop|now available on|starting at \$)/i.test(text);
}

function isLeakPriority(item) {
  if (hasStrongNonPhoneSignal(item) || hasDailyNoiseSignal(item)) return false;
  const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
  return /(first look|dummy model|dummy unit|color options|case leak|render|renders|rumou?r|leak|reported|exclusive|消息称|报道|传闻|爆料|开案|机模|配色|渲染|外观|尺寸|相机|影像|长焦|潜望|电池|续航|充电|屏幕|直屏|曲屏|折叠|折痕|芯片|处理器|跑分|认证|散热|发热|成本|升级|量产|供应链|数码闲聊站|apple club|applesclubs|digital chat station|ming-chi kuo|kuo|mark gurman|onleaks|ice universe|evleaks)/i.test(text);
}

function classifySection(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (isLeakPriority(item)) return "leaks";
  if (item.brand === "iPhone") return "iphone";
  if (item.trust === "官方确认" || /(launch|release|发布|上市|official|newsroom)/i.test(text)) return "launch";
  if (item.type === "参数" || /(benchmark|geekbench|fcc|tenaa|认证|跑分|芯片|屏幕|电池|影像|相机|参数)/i.test(text)) {
    return "specs";
  }
  if (item.type === "评测" || /(review|hands-on|teardown|ifixit|dxomark|评测|体验|拆解)/i.test(text)) return "review";
  return "market";
}

function verdictFor(score) {
  if (score >= 8) return "先看";
  if (score >= 5) return "扫一眼";
  return "可略过";
}

function makeDisplayTitle(item) {
  if (hasCjk(item.title)) return item.title;
  return translateEnglishTitle(item.title, item.brand);
}

function translateEnglishTitle(title, brand) {
  const cleanTitle = decodeXml(title);
  const lower = cleanTitle.toLowerCase();
  const subject = brand === "行业" ? "手机行业" : brand;
  const comparisonTitle = comparisonDisplayTitle(cleanTitle);
  const iphoneModel = cleanTitle.match(/iPhone\s?\d+(?:\s?(?:Pro|Air|Plus|Fold|Ultra|e|Mini|Max))*/i)?.[0];
  const galaxyModel = cleanTitle.match(/Galaxy\s?[A-Z]?\d+(?:\s?(?:Ultra|Plus|FE|Edge|Fold|Flip))*/i)?.[0];
  const pixelModel = cleanTitle.match(/Pixel\s?\d+(?:\s?(?:Pro|Fold|a|XL))*/i)?.[0];
  const model = iphoneModel || galaxyModel || pixelModel || subject;

  if (comparisonTitle && /(vs\.?|versus|difference|differences|comparison|compared)/i.test(lower)) {
    return `${comparisonTitle}：差异整理`;
  }
  if (/openai.*iphone rival|iphone rival/i.test(lower)) return `OpenAI 计划打造 iPhone 竞品的最新整理`;
  if (/camera upgrade.*cost apple.*50/i.test(lower)) return `${model} 相机升级成本或提高 50%`;
  if (/driver'?s license|driving license|wallet id|digital id/i.test(lower)) return `${model} 钱包证件功能有新进展`;
  if (/first look|dummy model|dummy unit|color options|colou?r/i.test(lower)) return `${model} 机模 / 配色信息曝光`;
  if (/case leak|case maker|render|renders|design/i.test(lower)) return `${model} 外观设计线索曝光`;
  if (/fold|foldable/i.test(lower)) return `${model} 折叠屏相关消息`;
  if (/camera|filmed|shot on|photo|video|telephoto|ultra wide/i.test(lower)) return `${model} 影像能力相关消息`;
  if (/battery|charging|magsafe|qi2/i.test(lower)) return `${model} 电池 / 充电相关消息`;
  if (/display|screen|oled|brightness|refresh rate/i.test(lower)) return `${model} 屏幕规格相关消息`;
  if (/chip|processor|modem|tensor|a-series|snapdragon|exynos|ram/i.test(lower)) return `${model} 芯片 / 性能相关消息`;
  if (/ios|one ui|android|feature drop|siri|apple intelligence|ai/i.test(lower)) return `${model} 系统功能 / AI 体验相关消息`;
  if (/launch|release|unveil|introduce|announce|debut/i.test(lower)) return `${model} 发布 / 上市相关消息`;
  if (/price|pricing|subscription|tier|cost/i.test(lower)) return `${model} 价格 / 成本相关消息`;
  if (/benchmark|geekbench|fcc|certification/i.test(lower)) return `${model} 跑分 / 认证信息出现`;
  if (/update|expand|roll out|rolling out/i.test(lower)) return `${model} 功能更新或覆盖范围扩大`;

  return `${subject} 相关消息`;
}

function comparisonDisplayTitle(title) {
  const modelPattern = [
    "iPhone\\s?\\d+(?:\\s?(?:Pro|Air|Plus|Fold|Ultra|e|Mini|Max))*",
    "iPhone\\s?Ultra",
    "Galaxy\\s?[A-Z]?\\d+(?:\\s?(?:Ultra|Plus|FE|Edge|Fold|Flip))*",
    "Pixel\\s?\\d+(?:\\s?(?:Pro|Fold|a|XL))*",
    "OnePlus\\s?[A-Za-z0-9\\s]+",
    "Moto\\s?[A-Za-z0-9\\s]+",
    "Realme\\s?[A-Za-z0-9\\s]+",
    "Redmi\\s?[A-Za-z0-9\\s]+",
    "Honor\\s?[A-Za-z0-9\\s]+",
    "Huawei\\s?[A-Za-z0-9\\s]+",
    "OPPO\\s?[A-Za-z0-9\\s]+",
    "vivo\\s?[A-Za-z0-9\\s]+",
    "Xiaomi\\s?[A-Za-z0-9\\s]+"
  ].join("|");
  const match = title.match(new RegExp(`(${modelPattern})\\s+vs\\.?\\s+(${modelPattern})`, "i"));
  if (!match) return "";
  return `${match[1]} 对比 ${match[2]}`;
}

function makeDisplayOriginalTitle(item) {
  return "";
}

function makeTakeaway(item) {
  if (hasCjk(item.title)) {
    return trimSummary(item.summary && item.summary !== item.title ? item.summary : item.title, 180);
  }
  return englishTakeaway(item);
}

function makeStoryDetail(item) {
  if (!hasCjk(item.title)) return englishDetail(item);
  const summary = item.summary && item.summary !== item.title ? item.summary : item.title;
  return trimSummary(summary, 220);
}

function englishDetail(item) {
  const title = item.title.toLowerCase();
  const translatedTitle = translateEnglishTitle(item.title, item.brand);
  const comparisonTitle = comparisonDisplayTitle(decodeXml(item.title));

  if (comparisonTitle) {
    return `${comparisonTitle} 的差异整理。重点看两款机型的定位、影像规格、屏幕尺寸、价格区间和发布时间是否拉开差距。`;
  }
  if (/first look|dummy model|dummy unit|color options|colou?r/i.test(title)) {
    return `${translatedTitle}。来源提到未发布机型的机模/配色图，适合先判断外观方向、颜色变化和机身轮廓，但最终量产版本仍可能调整。`;
  }
  if (/camera upgrade.*cost apple.*50|camera roadmap|variable aperture/i.test(title)) {
    return `${translatedTitle}。这类消息通常来自供应链或分析师线索，重点关注是否意味着镜头、光圈、长焦或成本结构发生变化。`;
  }
  if (/render|design|case leak/i.test(title)) {
    return `${translatedTitle}。这类内容主要看外观设计、按键布局、相机模组和尺寸变化，后续最好等更多渲染图或保护壳线索互相验证。`;
  }
  if (/fold|foldable|crease/i.test(title)) {
    return `${translatedTitle}。重点看折痕、铰链、厚度、屏幕可靠性和重量是否有实质改善。`;
  }
  if (/shot on iphone|filmed on iphone|camera|photo|video|cinematic/i.test(title)) {
    return `${translatedTitle}。重点看影像功能是否和新机硬件有关，如果只是拍摄案例或营销内容，参考价值会低一些。`;
  }

  return `${translatedTitle}。这条来自英文来源，已先转成中文结论；需要更细节时再打开原文核对。`;
}

function makeKeyPoints(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const points = [];

  if (/(first look|dummy|color|配色|机模|外观|render|design|渲染|尺寸)/i.test(text)) points.push("外观 / 配色 / 尺寸");
  if (/(camera|photo|video|telephoto|aperture|相机|影像|长焦|潜望|光圈)/i.test(text)) points.push("影像硬件");
  if (/(display|screen|oled|brightness|refresh|屏幕|直屏|曲屏|折叠屏|折痕)/i.test(text)) points.push("屏幕形态");
  if (/(battery|charging|magsafe|qi2|电池|续航|充电|万级大电池)/i.test(text)) points.push("电池 / 充电");
  if (/(chip|processor|modem|a-series|snapdragon|tensor|exynos|芯片|处理器|跑分|认证)/i.test(text)) points.push("芯片 / 性能");
  if (/(price|pricing|cost|价格|售价|成本)/i.test(text)) points.push("成本 / 价格");
  if (/(kuo|gurman|数码闲聊站|digital chat station|onleaks|ice universe|供应链|量产|爆料|消息称|leak|rumor)/i.test(text)) points.push("爆料来源");

  if (!points.length) points.push(item.type || "手机资讯");
  return [...new Set(points)].slice(0, 4);
}

function makeConfidenceNote(item) {
  if (item.trust === "官方确认") return "官方内容，可直接作为已确认信息记录。";
  if (item.trust === "监管/跑分") return "比普通爆料更接近硬件事实，但型号对应关系仍要核对。";
  if (/kuo|gurman|数码闲聊站|digital chat station|onleaks|ice universe/i.test(`${item.title} ${item.summary} ${item.source}`)) {
    return "来自常见高关注爆料源，适合重点看，但仍需等第二来源或发布会确认。";
  }
  if (item.trust === "高可信爆料") return "可信度较高，但仍属于发布前线索。";
  return "媒体汇总或普通传闻，适合先收藏观察，不当作最终参数。";
}

function englishTakeaway(item) {
  const title = item.title.toLowerCase();
  const subject = item.brand === "行业" ? "手机行业" : item.brand;
  const translatedTitle = translateEnglishTitle(item.title, item.brand);
  const originalTitle = decodeXml(item.title);
  const comparisonTitle = comparisonDisplayTitle(originalTitle);

  if (comparisonTitle) {
    return `${comparisonTitle}：重点看定位、配置差异和价格差，判断是否值得等更高端型号。`;
  }
  if (/openai.*iphone rival|iphone rival/i.test(title)) {
    return "这条是在整理 OpenAI 可能做硬件手机/AI 设备的传闻，适合当行业趋势看，不是 iPhone 参数消息。";
  }
  if (/camera upgrade.*cost apple.*50/i.test(title)) {
    return "传闻 iPhone 18 Pro 相机升级会让苹果零部件成本明显上升，后续要关注是否带来更强影像或价格变化。";
  }
  if (/driver'?s license|wallet id|digital id/i.test(title)) {
    return `${translatedTitle}。这类消息主要影响海外用户的钱包/证件体验，和硬件选购关系不大。`;
  }
  if (/first look|dummy model|color options|render|design/i.test(title)) {
    return `${translatedTitle}。重点看外观、颜色、尺寸是否和上一代有明显变化。`;
  }
  if (/accessibility|apple intelligence|ai/i.test(title)) return `${subject} 有系统功能或 AI 体验更新，适合关注后续是否影响日常使用。`;
  if (/shot on iphone|filmed on iphone|camera|photo|video/i.test(title)) return `${subject} 影像能力相关宣传或案例，主要看是否透露拍摄能力变化。`;
  if (/price|pricing|subscription|tier|cost/i.test(title)) {
    return `${translatedTitle}。如果涉及订阅、售价或硬件成本，才需要进一步看细节。`;
  }
  if (/launch|release|unveil|introduce/i.test(title)) return `${subject} 有发布或新功能消息，适合确认是否和新机有关。`;
  if (/chip|processor|modem|tensor|a-series/i.test(title)) return `${subject} 芯片或连接能力相关线索，可能影响性能和续航判断。`;
  return `${translatedTitle}。已转成中文摘要展示，详细内容可打开原文核对。`;
}

function makeImpact(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (isLeakPriority(item)) return "这是提前爆料，能决定你要不要继续等某款机型，但还要交叉验证。";
  if (item.type === "评测") return "这是实际体验内容，买前适合重点看缺点和取舍。";
  if (/(价格|price|涨价|降价|起售价)/i.test(text)) return "影响购买预算，值得先看。";
  if (/(芯片|处理器|tensor|a-series|snapdragon|exynos|性能|跑分)/i.test(text)) return "影响性能和寿命判断，适合放进参数库。";
  if (/(电池|续航|充电|battery|charging|散热|发热)/i.test(text)) return "影响日常体验，尤其是游戏、拍照和长时间使用。";
  if (/(相机|影像|长焦|camera|photo|video)/i.test(text)) return "影响拍照体验，买旗舰机时值得关注。";
  if (/(屏幕|直屏|曲屏|折叠屏|display|screen)/i.test(text)) return "影响手感和显示体验，适合和其他机型对比。";
  if (item.trust === "官方确认") return "可信度高，但如果不是配置/价格消息，只需要扫一眼。";
  if (item.type === "爆料") return "当作提前信号，别急着下结论，等第二个来源验证。";
  return "目前更像背景信息，对买手机影响不大。";
}

function makeAction(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (isLeakPriority(item)) return "先收藏到重点爆料；等第二个可靠来源、认证或发布会再确认。";
  if (/(价格|芯片|处理器|屏幕|电池|续航|充电|相机|影像|跑分|认证|price|chip|display|battery|camera|benchmark)/i.test(text)) {
    return "有具体参数就记录到参数库；没有参数就先收藏。";
  }
  if (item.source === "IT之家" || item.source === "爱范儿" || item.source === "少数派") {
    return "中文源可以直接点开快读；看完只保留和购机有关的点。";
  }
  return "英文源先别打开，除非你要我帮你翻译/判断。";
}

function makeDailyIntro(stats) {
  return `今日筛出 ${stats.total} 条重点，其中 ${stats.leaks} 条是重点爆料，包含 ${stats.iphone} 条 iPhone 相关、${stats.official} 条官方确认、${stats.specs} 条参数线索。`;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function toLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
