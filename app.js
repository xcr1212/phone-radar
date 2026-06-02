(function () {
  const seed = window.phoneRadarSeed;
  const storageKeys = {
    news: "phoneRadar.customNews",
    devices: "phoneRadar.customDevices",
    itemState: "phoneRadar.itemState",
    notificationsEnabled: "phoneRadar.notificationsEnabled",
    alertItemIds: "phoneRadar.alertItemIds",
    lastRefreshAt: "phoneRadar.lastRefreshAt"
  };

  const state = {
    view: "digest",
    query: "",
    deviceStatus: "全部",
    compareIds: new Set(),
    redbook: {
      item: null,
      title: "",
      body: "",
      insight: "",
      prompt: ""
    }
  };

  let autoUpdateTimer = null;
  let autoUpdateStartedAt = 0;
  let backgroundUpdateInProgress = false;

  const elements = {
    searchInput: document.querySelector("#searchInput"),
    digestList: document.querySelector("#digestList"),
    emptyDigest: document.querySelector("#emptyDigest"),
    heroStats: document.querySelector("#heroStats"),
    priorityDigestCount: document.querySelector("#priorityDigestCount"),
    digestCount: document.querySelector("#digestCount"),
    digestUpdatedAt: document.querySelector("#digestUpdatedAt"),
    lastRefreshTime: document.querySelector("#lastRefreshTime"),
    newsList: document.querySelector("#newsList"),
    emptyFeed: document.querySelector("#emptyFeed"),
    totalCount: document.querySelector("#totalCount"),
    officialCount: document.querySelector("#officialCount"),
    savedCount: document.querySelector("#savedCount"),
    deviceStatusFilter: document.querySelector("#deviceStatusFilter"),
    deviceTable: document.querySelector("#deviceTable"),
    compareShelf: document.querySelector("#compareShelf"),
    sourceGrid: document.querySelector("#sourceGrid"),
    notifyButton: document.querySelector("#notifyButton"),
    notifyStatus: document.querySelector("#notifyStatus"),
    redbookOverlay: document.querySelector("#redbookOverlay"),
    redbookCloseButton: document.querySelector("#redbookCloseButton"),
    redbookReference: document.querySelector("#redbookReference"),
    redbookPostTitle: document.querySelector("#redbookPostTitle"),
    redbookBody: document.querySelector("#redbookBody"),
    redbookInsight: document.querySelector("#redbookInsight"),
    redbookPrompt: document.querySelector("#redbookPrompt"),
    redbookCopyTitleButton: document.querySelector("#redbookCopyTitleButton"),
    redbookCopyBodyButton: document.querySelector("#redbookCopyBodyButton"),
    redbookCopyPromptButton: document.querySelector("#redbookCopyPromptButton"),
    redbookStatus: document.querySelector("#redbookStatus")
  };

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function canUseLocalUpdateApi() {
    const localHosts = ["127.0.0.1", "localhost"];
    return window.location.protocol === "http:" && window.location.port === "8765" && localHosts.includes(window.location.hostname);
  }

  function canPollStaticData() {
    return ["http:", "https:"].includes(window.location.protocol);
  }

  function latestDataUpdatedAt(autoData = window.phoneRadarAuto, report = window.phoneRadarDaily) {
    const values = [autoData?.updatedAt, report?.updatedAt].filter(Boolean).sort();
    return values[values.length - 1] || "";
  }

  function maybeAutoUpdateFromLocalServer() {
    if (!canUseLocalUpdateApi()) return;
    const updatedKey = "phoneRadar.justAutoUpdatedAt";
    const justUpdatedAt = Number(sessionStorage.getItem(updatedKey) || 0);
    const reloadGuard = 8 * 1000;

    if (Date.now() - justUpdatedAt < reloadGuard) {
      const lastDuration = sessionStorage.getItem("phoneRadar.lastUpdateDuration");
      const durationText = lastDuration ? `，用时 ${lastDuration} 秒` : "";
      setAutoUpdateStatus(`已完成${durationText}。以后刷新这个网页，就会重新抓取并整理一次。`);
      maybeNotifyTopStories("打开后已更新");
      return;
    }

    startAutoUpdateTimer("正在自动更新日报");

    fetch("/api/update", { method: "POST" })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) {
          const seconds = stopAutoUpdateTimer();
          setAutoUpdateStatus(`自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
          return;
        }
        const seconds = stopAutoUpdateTimer();
        sessionStorage.setItem("phoneRadar.lastUpdateDuration", String(seconds));
        localStorage.setItem(storageKeys.lastRefreshAt, result.updatedAt || new Date().toISOString());
        sessionStorage.setItem(updatedKey, String(Date.now()));
        setAutoUpdateStatus(`已完成，用时 ${seconds} 秒，正在刷新日报。`);
        window.location.reload();
      })
      .catch(() => {
        const seconds = stopAutoUpdateTimer();
        setAutoUpdateStatus(`自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
      });
  }

  function setAutoUpdateStatus(message) {
    const intro = document.querySelector("#dailyIntro");
    if (intro) intro.textContent = message;
  }

  function startAutoUpdateTimer(prefix) {
    stopAutoUpdateTimer();
    autoUpdateStartedAt = Date.now();
    setAutoUpdateStatus(`${prefix}，已等待 0 秒。`);
    autoUpdateTimer = window.setInterval(() => {
      const seconds = elapsedAutoUpdateSeconds();
      setAutoUpdateStatus(`${prefix}，已等待 ${seconds} 秒。`);
    }, 1000);
  }

  function stopAutoUpdateTimer() {
    if (autoUpdateTimer) {
      window.clearInterval(autoUpdateTimer);
      autoUpdateTimer = null;
    }
    const seconds = elapsedAutoUpdateSeconds();
    autoUpdateStartedAt = 0;
    return seconds;
  }

  function elapsedAutoUpdateSeconds() {
    if (!autoUpdateStartedAt) return 0;
    return Math.max(1, Math.round((Date.now() - autoUpdateStartedAt) / 1000));
  }

  function notificationSupported() {
    return "Notification" in window;
  }

  function notificationsEnabled() {
    return localStorage.getItem(storageKeys.notificationsEnabled) === "true";
  }

  function setNotificationsEnabled(enabled) {
    localStorage.setItem(storageKeys.notificationsEnabled, enabled ? "true" : "false");
  }

  function updateNotificationUi() {
    if (!elements.notifyButton || !elements.notifyStatus) return;
    if (!notificationSupported()) {
      elements.notifyButton.disabled = true;
      elements.notifyStatus.textContent = "当前浏览器不支持提醒";
      return;
    }

    const enabled = notificationsEnabled() && Notification.permission === "granted";
    elements.notifyButton.classList.toggle("is-enabled", enabled);
    elements.notifyButton.textContent = enabled ? "提醒已开启" : "开启提醒";
    if (enabled) {
      elements.notifyStatus.textContent = "只提醒新增重点爆料";
      return;
    }
    if (Notification.permission === "denied") {
      elements.notifyStatus.textContent = "浏览器已拦截提醒，请在地址栏权限里放开";
      return;
    }
    elements.notifyStatus.textContent = "授权后只提醒新增重点爆料";
  }

  async function requestNotifications() {
    if (!notificationSupported()) {
      updateNotificationUi();
      return;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationsEnabled(false);
        updateNotificationUi();
        return;
      }
    }

    setNotificationsEnabled(true);
    rememberAlertItems(getDailyReport());
    updateNotificationUi();
    if (elements.notifyStatus) elements.notifyStatus.textContent = "提醒已开启，刷新不会重复弹";
    startBackgroundAlertScan();
  }

  function maybeNotifyTopStories(reason) {
    if (!notificationsEnabled() || !notificationSupported() || Notification.permission !== "granted") {
      updateNotificationUi();
      return false;
    }

    const report = getDailyReport();
    if (!report) return false;
    return notifyTopStories(report, reason);
  }

  function notifyTopStories(report, reason) {
    const items = topAlertItems(report);
    if (!items.length) return false;

    const knownIds = readAlertItemIds();
    const freshItems = items.filter((item) => !isAlertItemSeen(item, knownIds));
    rememberAlertItems(report);
    if (!freshItems.length) return false;

    const firstItem = freshItems[0];
    const title = freshItems.length === 1 ? `重点爆料：${firstItem.title}` : `发现 ${freshItems.length} 条新重点爆料`;
    const body = freshItems.length === 1 ? alertBody(firstItem) : alertListBody(freshItems);
    const notification = new Notification(title, {
      body: `${reason}\n${body}`,
      tag: "phone-radar-digest",
      renotify: true
    });

    notification.onclick = () => {
      window.focus();
      window.location.reload();
    };
    return true;
  }

  function topAlertItems(report) {
    const prioritySection = (report.sections || []).find((section) => section.id === "leaks");
    return (prioritySection?.items || []).slice(0, 8);
  }

  function alertItemId(item) {
    return String(item.id || item.url || item.title || "");
  }

  function alertItemKeys(item) {
    const keys = [];
    const id = alertItemId(item);
    const url = normalizedAlertUrl(item?.url);
    const story = alertStoryKey(item);
    if (id) keys.push(id, `id:${id}`);
    if (url) keys.push(`url:${url}`);
    if (story) keys.push(`story:${story}`);
    return keys;
  }

  function alertStoryKey(item) {
    const title = compactStoryText(item?.originalTitle || item?.title || "");
    const source = normalize(item?.source || "");
    const date = String(item?.date || "").trim();
    if (!title || title.length < 8) return "";
    return `${source}:${date}:${title.slice(0, 80)}`;
  }

  function normalizedAlertUrl(value) {
    try {
      const url = new URL(String(value || ""));
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
      url.hash = "";
      return url.href;
    } catch {
      return normalize(value);
    }
  }

  function isAlertItemSeen(item, knownIds = readAlertItemIds()) {
    return alertItemKeys(item).some((key) => knownIds.has(key));
  }

  function readAlertItemIds() {
    const raw = localStorage.getItem(storageKeys.alertItemIds) || localStorage.getItem("phoneRadar.lastNotifiedDigest");
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return new Set(raw.split("|").slice(1).filter(Boolean));
    }
  }

  function rememberAlertItems(report) {
    const items = Array.isArray(report) ? report : report ? topAlertItems(report) : [];
    const ids = items.flatMap(alertItemKeys).filter(Boolean);
    const knownIds = readAlertItemIds();
    ids.forEach((id) => knownIds.add(id));
    localStorage.setItem(storageKeys.alertItemIds, JSON.stringify(Array.from(knownIds).slice(-500)));
  }

  function markContentItemSeen(item) {
    if (!item) return;
    rememberAlertItems([item]);
    if (item.id) updateItemState(item.id, { read: true });
  }

  function alertBody(item) {
    const meta = [item.source, itemDateTimeLabel(item)].filter(Boolean).join(" · ");
    const line = item.impact || item.takeaway || "打开日报查看详情。";
    return `${meta}\n${line}`;
  }

  function alertListBody(items) {
    return items
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title}（${item.source || "来源未知"}）`)
      .join("\n");
  }

  function startBackgroundAlertScan() {
    startBackgroundAutoUpdate();
  }

  function startBackgroundAutoUpdate() {
    if (!canPollStaticData()) return;
    if (window.phoneRadarBackgroundTimer) return;
    const interval = 15 * 60 * 1000;
    window.phoneRadarBackgroundTimer = window.setInterval(() => {
      if (canUseLocalUpdateApi()) {
        runBackgroundUpdate();
        return;
      }
      refreshFromDeployedFiles("后台自动检查发现新部署");
    }, interval);
  }

  async function runBackgroundUpdate() {
    if (!canUseLocalUpdateApi()) {
      await refreshFromDeployedFiles("后台自动检查发现新部署");
      return;
    }

    if (backgroundUpdateInProgress) return;
    backgroundUpdateInProgress = true;
    const startedAt = Date.now();

    try {
      setAutoUpdateStatus("正在进行 15 分钟自动更新，完成后会刷新页面内容。");
      if (elements.notifyStatus) elements.notifyStatus.textContent = "正在自动更新资讯";

      const response = await fetch("/api/update", { method: "POST" });
      const result = await response.json();
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

      if (!result.ok) {
        setAutoUpdateStatus(`15 分钟自动更新失败，已等待 ${seconds} 秒，保留上次日报。`);
        if (elements.notifyStatus) elements.notifyStatus.textContent = "自动更新失败，保留上次日报";
        return;
      }

      const [autoData, report] = await Promise.all([fetchLatestAutoNews(), fetchLatestDailyReport()]);
      if (autoData) window.phoneRadarAuto = autoData;
      if (report) window.phoneRadarDaily = report;

      const refreshAt = result.updatedAt || report?.updatedAt || autoData?.updatedAt || new Date().toISOString();
      localStorage.setItem(storageKeys.lastRefreshAt, refreshAt);
      renderAll();
      updateLastRefreshTime(refreshAt);
      setAutoUpdateStatus(`已自动更新，用时 ${seconds} 秒。下次会在 15 分钟后继续检查。`);

      const didNotify = report && notificationsEnabled() && notificationSupported() && Notification.permission === "granted"
        ? notifyTopStories(report, "后台自动更新发现新增")
        : false;
      if (elements.notifyStatus) {
        elements.notifyStatus.textContent = didNotify ? "已推送新增重点爆料" : "已自动更新，暂无新增重点爆料";
      }
    } catch (error) {
      setAutoUpdateStatus("15 分钟自动更新失败，稍后会再试。");
      if (elements.notifyStatus) elements.notifyStatus.textContent = "自动更新失败，稍后再试";
    } finally {
      backgroundUpdateInProgress = false;
    }
  }

  async function scanForAlerts() {
    if (!notificationSupported() || !notificationsEnabled() || Notification.permission !== "granted") return;
    if (!canUseLocalUpdateApi()) {
      const didRefresh = await refreshFromDeployedFiles("后台扫描发现新部署");
      if (!didRefresh && elements.notifyStatus) elements.notifyStatus.textContent = "暂时没有新的已部署日报";
      return;
    }

    try {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "正在后台扫描重点爆料";
      const response = await fetch("/api/update", { method: "POST" });
      const result = await response.json();
      if (!result.ok) {
        if (elements.notifyStatus) elements.notifyStatus.textContent = "后台扫描失败，保留上次日报";
        return;
      }

      const report = await fetchLatestDailyReport();
      const didNotify = report ? notifyTopStories(report, "后台扫描发现新增") : false;
      if (elements.notifyStatus) elements.notifyStatus.textContent = didNotify ? "已推送新增重点爆料" : "暂无新增重点爆料";
    } catch (error) {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "后台扫描失败，稍后再试";
    }
  }

  async function refreshFromDeployedFiles(reason) {
    if (!canPollStaticData()) return false;

    try {
      const [autoData, report] = await Promise.all([fetchLatestAutoNews(), fetchLatestDailyReport()]);
      const nextUpdatedAt = latestDataUpdatedAt(autoData, report);
      const currentUpdatedAt = latestDataUpdatedAt();
      if (!nextUpdatedAt || (currentUpdatedAt && nextUpdatedAt <= currentUpdatedAt)) return false;

      if (autoData) window.phoneRadarAuto = autoData;
      if (report) window.phoneRadarDaily = report;
      localStorage.setItem(storageKeys.lastRefreshAt, nextUpdatedAt);
      renderAll();
      updateLastRefreshTime(nextUpdatedAt);

      const didNotify = report && notificationsEnabled() && notificationSupported() && Notification.permission === "granted"
        ? notifyTopStories(report, reason)
        : false;
      if (elements.notifyStatus) {
        elements.notifyStatus.textContent = didNotify ? "已提醒新部署的重点爆料" : "已加载最新部署的日报";
      }
      return true;
    } catch (error) {
      if (elements.notifyStatus) elements.notifyStatus.textContent = "检查已部署日报失败，稍后再试";
      return false;
    }
  }

  async function fetchLatestDailyReport() {
    const response = await fetch(`./generated-daily.js?t=${Date.now()}`);
    if (!response.ok) return null;
    const script = await response.text();
    const json = script.replace(/^window\.phoneRadarDaily\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  }

  async function fetchLatestAutoNews() {
    const response = await fetch(`./generated-news.js?t=${Date.now()}`);
    if (!response.ok) return null;
    const script = await response.text();
    const json = script.replace(/^window\.phoneRadarAuto\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  }

  function getCustomNews() {
    return readJson(storageKeys.news, []);
  }

  function getCustomDevices() {
    return readJson(storageKeys.devices, []);
  }

  function getItemState() {
    return readJson(storageKeys.itemState, {});
  }

  function allNews() {
    return [...getAutoNews(), ...getCustomNews()].map((item) => {
      const savedState = getItemState()[item.id] || {};
      return { ...item, ...savedState };
    });
  }

  function autoNewsWithState() {
    return getAutoNews().map((item) => {
      const savedState = getItemState()[item.id] || {};
      return { ...item, ...savedState };
    });
  }

  function getAutoNews() {
    return Array.isArray(window.phoneRadarAuto?.news) ? window.phoneRadarAuto.news : [];
  }

  function getDailyReport() {
    return window.phoneRadarDaily && Array.isArray(window.phoneRadarDaily.sections) ? window.phoneRadarDaily : null;
  }

  function allDevices() {
    return uniqueDevicesByModel([...(seed.devices || []), ...getGeneratedFlagships(), ...getCustomDevices()]);
  }

  function getGeneratedFlagships() {
    return Array.isArray(window.phoneRadarOfficialFlagships?.devices) ? window.phoneRadarOfficialFlagships.devices : [];
  }

  function uniqueDevicesByModel(devices) {
    const seen = new Set();
    return devices.filter((device) => {
      const key = normalize(`${device.brand || ""} ${device.model || ""}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function matchesQuery(item) {
    if (!state.query) return true;
    const haystack = [
      item.title,
      item.source,
      item.brand,
      item.model,
      item.type,
      item.trust,
      item.summary,
      ...(item.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query) || compactSearchText(haystack).includes(compactSearchText(state.query));
  }

  function compactSearchText(value) {
    return normalize(value).replace(/[\s\-_·/]+/g, "");
  }

  function uniqueDigestStory() {
    const seen = [];
    return (item) => {
      const title = compactStoryText(feedDisplayTitle(item));
      const summary = compactStoryText(feedDisplaySummary(item, feedDisplayTitle(item)));
      const key = title.length >= 18 ? title.slice(0, 32) : `${title}${summary}`.slice(0, 32);
      if (!key) return true;
      if (seen.some((oldKey) => isSameStoryKey(oldKey, key))) return false;
      seen.push(key);
      return true;
    };
  }

  function isSameStoryKey(a, b) {
    if (!a || !b) return false;
    const commonLength = Math.min(a.length, b.length);
    if (commonLength < 16) return false;
    return a.slice(0, commonLength) === b.slice(0, commonLength) || a.includes(b.slice(0, 22)) || b.includes(a.slice(0, 22));
  }

  function compactStoryText(value) {
    return normalize(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .replace(/(消息称|报道称|曝料|爆料|传闻|据称|独家|官方|发布|宣布|博主|称)/g, "");
  }

  function compareNewsByDateAndPriority(a, b) {
    const scoreOrder = priorityScore(b) - priorityScore(a);
    if (scoreOrder) return scoreOrder;
    const timeOrder = itemTimestamp(b) - itemTimestamp(a);
    if (timeOrder) return timeOrder;
    const dateOrder = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateOrder) return dateOrder;
    return scoreNews(b) - scoreNews(a);
  }

  function itemTimestamp(item) {
    const value = item?.publishedAt || (item?.date && item?.time ? `${item.date}T${item.time}:00` : item?.date);
    const timestamp = Date.parse(value || "");
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function hasUsefulDisplayText(item) {
    if (!item || hasStrongNonPhoneSignal(item)) return false;
    const title = feedDisplayTitle(item).trim();
    if (!title || isMostlyEnglish(title) || isGenericDisplayTitle(title)) return false;
    const summary = feedDisplaySummary(item, title).trim();
    if (!summary || isMostlyEnglish(summary)) return false;
    const cjkCount = (summary.match(/[\u3400-\u9fff]/g) || []).length + (title.match(/[\u3400-\u9fff]/g) || []).length;
    if (cjkCount < 4) return false;
    return true;
  }

  function isGenericDisplayTitle(title) {
    return /相关消息$/.test(String(title || "").trim());
  }

  function filteredNews() {
    return allNews()
      .filter(hasUsefulDisplayText)
      .filter(matchesQuery)
      .sort(compareNewsByDateAndPriority)
      .filter(uniqueDigestStory());
  }

  function filteredDigestNews() {
    return autoNewsWithState()
      .filter(hasUsefulDisplayText)
      .filter(matchesQuery)
      .sort(compareNewsByDateAndPriority)
      .filter(uniqueDigestStory());
  }

  function trustClass(trust) {
    if (trust === "官方确认") return "tag-green";
    if (trust === "监管/跑分") return "tag-blue";
    if (trust === "高关注爆料源") return "tag-amber";
    if (trust === "高可信爆料") return "tag-amber";
    if (trust === "媒体汇总") return "tag-gray";
    return "tag-red";
  }

  function renderDigest() {
    const items = filteredDigestNews();
    const scoredItems = items.map((item) => ({ item, score: priorityScore(item) }));

    elements.digestList.innerHTML = renderPriorityQueue(scoredItems);
    elements.emptyDigest.hidden = scoredItems.length > 0;
    elements.priorityDigestCount.textContent = scoredItems.length;
    elements.digestCount.textContent = items.length;
    const issueDate = getIssueDate(items);
    elements.digestUpdatedAt.textContent = issueDate;
    updateLastRefreshTime(window.phoneRadarAuto?.updatedAt);
    updateHeroStats(statsFromItems(items));
    document.querySelector("#dailyIssue").textContent = `VOL.${issueDate.replaceAll("-", "").slice(2)}`;
    document.querySelector("#dailyIntro").textContent = makeDailyIntro(items);
  }

  function updateHeroStats(stats) {
    if (!elements.heroStats) return;
    const tiles = [
      ["重点", stats.total],
      ["爆料", stats.leaks],
      ["iPhone", stats.iphone],
      ["官方", stats.official]
    ];
    elements.heroStats.innerHTML = tiles
      .map(([label, value]) => `<span><strong>${Number(value || 0)}</strong>${label}</span>`)
      .join("");
  }

  function statsFromItems(items, sections = [], savedStats = {}) {
    return {
      total: savedStats.total || items.length,
      leaks: savedStats.leaks || sections.find((section) => section.id === "leaks")?.items.length || items.filter((item) => classifySection(item) === "leaks").length,
      iphone: savedStats.iphone || items.filter((item) => item.brand === "iPhone").length,
      official: savedStats.official || items.filter((item) => item.trust === "官方确认").length
    };
  }

  function updateLastRefreshTime(value) {
    if (!elements.lastRefreshTime) return;
    const refreshAt = value || localStorage.getItem(storageKeys.lastRefreshAt);
    elements.lastRefreshTime.textContent = refreshAt ? `上次刷新：${localDateTime(refreshAt)}` : "上次刷新：--";
  }

  function cleanDailySections(sections) {
    return sections
      .map((section) => ({
        ...section,
        items: (section.items || []).filter(isUsefulDisplayItem).map(cleanDailyItem)
      }))
      .filter((section) => section.items.length);
  }

  function isUsefulDisplayItem(item) {
    const text = `${item.title || ""} ${item.originalTitle || ""} ${item.detail || ""} ${item.takeaway || ""}`.toLowerCase();
    return !/(卫星互联网|卫星发射|发射.*卫星|长征.*火箭|天地网络融合|西昌|youtube music|google icon|icon redesign|gradient google|headphones?|earbuds?|buds\b|tws\b|\bpad\b|tablet|tab s\d|giztop|available on giztop|now available on|starting at \$)/i.test(text);
  }

  function cleanDailyItem(item) {
    const title = cleanDailyTitle(item);
    return {
      ...item,
      title,
      originalTitle: "",
      detail: cleanDailyText(item.detail || item.takeaway || item.summary || title, title),
      takeaway: cleanDailyText(item.takeaway || item.summary || title, title)
    };
  }

  function cleanDailyTitle(item) {
    const rawTitle = String(item.title || "");
    const original = String(item.originalTitle || rawTitle);
    if (!rawTitle.includes("英文资讯：") && /[\u3400-\u9fff]/.test(rawTitle)) return rawTitle;
    if (!rawTitle.includes("英文资讯：") && !/^[A-Za-z0-9]/.test(rawTitle)) return rawTitle;
    const comparisonTitle = localComparisonTitle(original);
    if (comparisonTitle) return `${comparisonTitle}：差异整理`;
    if (/fold|foldable|crease/i.test(original)) return `${item.brand || "手机"} 折叠屏相关消息`;
    if (/camera|photo|video|telephoto|aperture/i.test(original)) return `${item.brand || "手机"} 影像相关消息`;
    if (/battery|charging|magsafe|qi2/i.test(original)) return `${item.brand || "手机"} 电池 / 充电相关消息`;
    if (/display|screen|oled|brightness|refresh/i.test(original)) return `${item.brand || "手机"} 屏幕相关消息`;
    if (/chip|processor|modem|tensor|snapdragon|exynos|ram/i.test(original)) return `${item.brand || "手机"} 芯片 / 性能相关消息`;
    if (/price|pricing|cost|money/i.test(original)) return `${item.brand || "手机"} 价格 / 成本相关消息`;
    return `${item.brand || "手机"} 相关消息`;
  }

  function localComparisonTitle(title) {
    const match = String(title || "").match(/([A-Za-z0-9][A-Za-z0-9+.\-\s]*(?:\d|Pro|Ultra|Lite|Power|Fold|Flip|Max|Air))\s+vs\.?\s+([A-Za-z0-9][A-Za-z0-9+.\-\s]*(?:\d|Pro|Ultra|Lite|Power|Fold|Flip|Max|Air))/i);
    if (!match) return "";
    return `${match[1].trim()} 对比 ${match[2].trim()}`;
  }

  function cleanDailyText(value, title) {
    const text = String(value || title);
    if (!text.includes("英文资讯：") && !isMostlyEnglish(text)) return text;
    return `${title}。已转成中文摘要展示，详细内容可打开原文核对。`;
  }

  function isMostlyEnglish(value) {
    const letters = (String(value).match(/[A-Za-z]/g) || []).length;
    const cjk = (String(value).match(/[\u3400-\u9fff]/g) || []).length;
    return letters > 20 && letters > cjk * 1.5;
  }

  function localIsoDate(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function localDateTime(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const datePart = localIsoDate(date);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${datePart} ${hours}:${minutes}:${seconds}`;
  }

  function itemDateTimeLabel(item) {
    const date = item?.date || "";
    const time = item?.time || localTimeFromIso(item?.publishedAt);
    return [date, time].filter(Boolean).join(" ");
  }

  function localTimeFromIso(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function renderDigestMedia(item, title = item?.title) {
    if (!item.image) return "";
    return `
      <a class="digest-media" href="${escapeHtml(item.url || item.image)}" target="_blank" rel="noreferrer" data-action="open-source" data-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.closest('.digest-card').classList.remove('has-media'); this.closest('.digest-media').remove()" />
      </a>
    `;
  }

  function renderNewsMedia(item, title = item?.title) {
    if (!item.image) return "";
    return `
      <a class="news-media" href="${escapeHtml(item.url || item.image)}" target="_blank" rel="noreferrer" data-action="open-source" data-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.closest('.news-card').classList.remove('has-media'); this.closest('.news-media').remove()" />
      </a>
    `;
  }

  function renderOriginalNote(item, displayTitle) {
    const originalTitle = String(item.title || "").trim();
    const originalSummary = String(item.summary || "").trim();
    const titleChanged = originalTitle && originalTitle !== displayTitle;
    const summaryIsRawEnglish = originalSummary && isMostlyEnglish(originalSummary);
    if (!titleChanged && !summaryIsRawEnglish) return "";
    return `
      <div class="original-note">
        ${titleChanged ? `<p><strong>原题</strong>${escapeHtml(originalTitle)}</p>` : ""}
        ${summaryIsRawEnglish ? `<p><strong>原文摘要</strong>${escapeHtml(limitText(originalSummary, 220))}</p>` : ""}
      </div>
    `;
  }

  function renderKeyPoints(points) {
    if (!Array.isArray(points) || !points.length) return "";
    return `
      <div class="digest-points">
        ${points.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}
      </div>
    `;
  }

  function renderRedbookButton(id) {
    if (!id) return "";
    return `<button type="button" data-action="redbook-image" data-id="${escapeHtml(id)}">一键写文案</button>`;
  }

  function findContentItemById(id) {
    const normalizedId = String(id || "");
    const dailyItems = getDailyReport()
      ? cleanDailySections(getDailyReport().sections || []).flatMap((section) =>
          section.items.map((item) => ({
            ...item,
            sectionId: section.id,
            sectionTitle: section.title
          }))
        )
      : [];
    return dailyItems.find((item) => String(item.id || "") === normalizedId) || allNews().find((item) => String(item.id || "") === normalizedId) || null;
  }

  function redbookDisplayTitle(item) {
    return String(item?.title || item?.originalTitle || item?.model || "数码资讯").trim();
  }

  function redbookSummaryText(item) {
    return String(item?.detail || item?.takeaway || item?.summary || item?.impact || item?.title || "").replace(/\s+/g, " ").trim();
  }

  function limitText(value, maxLength = 120) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  }

  function redbookPoints(item) {
    const points = Array.isArray(item?.keyPoints) && item.keyPoints.length ? item.keyPoints : makeCardKeyPoints(item || {});
    return [...new Set(points.filter(Boolean))].slice(0, 4);
  }

  function redbookSourceLine() {
    return "内容来源于网络";
  }

  function redbookPromptText(value, maxLength = 60) {
    return limitText(value, maxLength)
      .replace(/[^，。；]*来源[^，。；]*/g, "")
      .replace(/[^，。；]*汇总[^，。；]*/g, "")
      .replace(/[^，。；]*可信[^，。；]*/g, "")
      .replace(/[^，。；]*官方[^，。；]*准[^，。；]*/g, "")
      .replace(/[^，。；]*待[^，。；]*认[^，。；]*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function redbookVisualTitle(item) {
    return redbookPromptText(redbookDisplayTitle(item), 26) || redbookDisplayTitle(item);
  }

  function makeInsightCopy(item) {
    const title = redbookDisplayTitle(item);
    const points = redbookPoints(item).join("、") || item.type || "数码信息";
    const summary = limitText(redbookSummaryText(item), 160);
    return `这条可以理解为：${title}。核心信息是：${summary || "围绕产品外观、配色、发布时间或规格变化的一条数码资讯。"} 适合作为一张简洁的数码资讯封面，画面只保留标题、产品视觉和少量关键信息，更多判断放在正文里。可提炼的重点：${points}。${redbookSourceLine()}。`;
  }

  function makeRedbookPostTitle(item) {
    const subject = redbookPostSubject(item);
    const points = redbookVisualPoints(item);
    const point = points[0]?.replace(/\s*\/\s*/g, "、");
    if (point) return `${subject}：${point}先看`;
    return `${subject}：这几个点值得看`;
  }

  function redbookPostSubject(item) {
    const title = redbookDisplayTitle(item);
    const model = title.match(/iPhone\s?\d+(?:\s?(?:Pro|Air|Plus|Fold|Ultra|e|Mini|Max))*|Galaxy\s?Z\s?(?:Fold|Flip)\s?\d+(?:\s?(?:Ultra|Plus|FE|Edge))*|Galaxy\s?[A-Z]?\d+(?:\s?(?:Ultra|Plus|FE|Edge|Fold|Flip))*|Pixel\s?\d+(?:\s?(?:Pro|Fold|a|XL))*|OnePlus\s?[A-Za-z0-9 ]+|OPPO\s?[A-Za-z0-9 ]+|vivo\s?[A-Za-z0-9 ]+|Xiaomi\s?[A-Za-z0-9 ]+|Redmi\s?[A-Za-z0-9 ]+|Honor\s?[A-Za-z0-9 ]+|华为\s?[A-Za-z0-9 ]+|荣耀\s?[A-Za-z0-9 ]+/i)?.[0];
    if (model) return model.trim();
    return redbookPromptText(title.split(/[，,：:。]/)[0], 21).replace(/\.{3}|…/g, "").trim() || "这条手机消息";
  }

  function makeRedbookPostBody(item) {
    const title = redbookDisplayTitle(item);
    const summary = limitText(redbookSummaryText(item), 180);
    const points = redbookPoints(item)
      .map((point) => redbookPromptText(point, 24))
      .filter(Boolean)
      .slice(0, 4);
    const pointLines = points.length
      ? points.map((point) => `- ${point}`)
      : ["- 外观和配色有没有明显变化", "- 屏幕、影像、电池或芯片是否有实质升级", "- 后续是否有更多来源确认"];
    const trustLine = item.trust === "官方确认"
      ? "这条属于官方信息，可以直接当确认信息看。"
      : "发布前信息先当线索看，等更多来源或正式发布再下结论。";

    return [
      `${title}`,
      "",
      summary || "这是一条和新机外观、配置或发布节奏有关的数码资讯，适合先收藏观察。",
      "",
      "我会重点看：",
      ...pointLines,
      "",
      trustLine,
      "",
      "#数码资讯 #手机爆料 #新机情报"
    ].join("\n");
  }

  function redbookVisualPoints(item) {
    return redbookPoints(item)
      .map((point) => redbookPromptText(point, 18))
      .filter((point) => point && !/(来源|可信|确认|传闻|汇总|量产|发布前|已现身)/.test(point))
      .slice(0, 3);
  }

  function redbookSubtitle(item) {
    const title = redbookVisualTitle(item);
    const summary = redbookPromptText(redbookSummaryText(item), 34);
    const points = redbookVisualPoints(item);
    const normalizedTitle = title.replace(/[。！？\s]/g, "");
    const normalizedSummary = summary.replace(/[。！？\s]/g, "");
    if (summary && normalizedSummary !== normalizedTitle && !normalizedSummary.includes(normalizedTitle)) return summary;
    return points.length ? points.join(" / ") : "外观、配色与产品看点整理";
  }

  function makeImagePrompt(item) {
    const title = redbookVisualTitle(item);
    const subtitle = redbookSubtitle(item);
    const points = redbookVisualPoints(item);
    const cardHints = points.length ? points.join(" / ") : "外观变化 / 配色信息 / 用户关注点";
    const visualSource = item.image ? "可参考随附资讯图的产品方向和颜色气质，但重新设计版式，不复刻原图。" : "没有参考图时，用正常比例的手机背面或产品轮廓作为主视觉。";
    return [
      "小红书数码资讯竖版海报，比例 3:4。风格高级干净、少字、留白充足，像一张可直接发布的数码资讯封面。",
      `主标题：${title}`,
      `副标题：${subtitle}`,
      "正文只作为信息理解，不要整段放进画面。",
      `参考图规则：${visualSource}`,
      `版式：顶部大标题，中部放手机或产品主视觉，底部放 2-3 个简洁信息卡。信息卡只写适合上图的短词，可从这些内容里提炼：${cardHints}。`,
      "手机视觉：机身必须是正常手机比例，不拉伸、不压扁、不变形；边框、圆角、屏幕/背板、摄像头模组要符合真实手机结构；多台手机并排时保持同等比例和自然透视。",
      `画面文字：只保留主标题、副标题、信息卡短词和底部小字“${redbookSourceLine()}”。不要添加额外角标、来源卡、长段说明或免责声明。`,
      "美术风格：浅色干净背景，标题强对比，信息卡轻描边或浅阴影，配色与产品颜色呼应；整体更像精致数码杂志封面，不要做成拥挤的参数表。不要编造价格、参数、发布时间。"
    ].join("\n");
  }

  function renderRedbookReference(item) {
    if (item.image) {
      return `
        <a href="${escapeHtml(item.url || item.image)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(redbookDisplayTitle(item))}" loading="lazy" />
        </a>
      `;
    }
    return `
      <div class="redbook-reference-empty">
        <strong>暂无参考图</strong>
        <span>会按资讯主题生成信息卡式视觉。</span>
      </div>
    `;
  }

  function openRedbookPanel(item) {
    if (!elements.redbookOverlay) return;
    const title = makeRedbookPostTitle(item);
    const body = makeRedbookPostBody(item);
    const insight = makeInsightCopy(item);
    const prompt = makeImagePrompt(item);
    state.redbook = {
      item,
      title,
      body,
      insight,
      prompt
    };

    elements.redbookReference.innerHTML = renderRedbookReference(item);
    elements.redbookPostTitle.value = title;
    elements.redbookBody.value = body;
    elements.redbookInsight.textContent = insight;
    elements.redbookPrompt.value = prompt;
    elements.redbookStatus.textContent = "已生成标题、正文和图片提示词。";
    elements.redbookOverlay.hidden = false;
    document.body.classList.add("redbook-open");
  }

  function closeRedbookPanel() {
    if (!elements.redbookOverlay) return;
    elements.redbookOverlay.hidden = true;
    document.body.classList.remove("redbook-open");
  }

  async function copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      elements.redbookStatus.textContent = successMessage;
    } catch (error) {
      elements.redbookStatus.textContent = "当前浏览器暂时不能复制，请手动选中文本。";
    }
  }

  function handleRedbookAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || button.dataset.action !== "redbook-image") return false;
    const item = findContentItemById(button.dataset.id);
    if (item) {
      markContentItemSeen(item);
      openRedbookPanel(item);
    }
    return true;
  }

  function hasDigestImage(item) {
    return Boolean(item?.image);
  }

  function isVisualDigestItem(item) {
    return hasDigestImage(item) && !isSocialTextItem(item);
  }

  function isSocialTextItem(item) {
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    return (
      item?.trust === "高关注爆料源" ||
        item?.source === "数码闲聊站" ||
        item?.source === "Apple Club" ||
        tags.includes("微博") ||
        tags.includes("X")
    );
  }

  function renderPriorityQueue(scoredItems) {
    const groups = groupByDate(scoredItems);
    let index = 0;

    return `
      <div class="priority-timeline">
        ${groups
          .map(
            ([date, entries]) => `
              <section class="priority-day">
                <div class="priority-day-head">
                  <span class="priority-day-date">${escapeHtml(date)}</span>
                  <span class="priority-day-count">${entries.length} 条</span>
                </div>
                <div class="priority-day-items">
                  ${entries
                    .map(({ item, score }) => {
                      index += 1;
                      return renderDigestItem(item, score, index);
                    })
                    .join("")}
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    `;
  }

  function groupByDate(scoredItems) {
    const groups = new Map();
    scoredItems.forEach((entry) => {
      const date = entry.item.date || "未标日期";
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(entry);
    });
    return [...groups.entries()];
  }

  function renderDigestItem(item, score, index) {
    const reasons = priorityReasons(item);
    const displayTitle = feedDisplayTitle(item);
    const displaySummary = feedDisplaySummary(item, displayTitle);
    const reasonText = priorityReasonSentence(item, reasons);
    const link = item.url
      ? `<a class="link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" data-action="open-source" data-id="${escapeHtml(item.id)}">打开原文</a>`
      : "";
    const readLabel = item.read ? "已读" : "标为已读";

    return `
      <div class="priority-item" data-level="${escapeHtml(priorityLevel(score))}">
        <div class="priority-rank">#${String(index).padStart(2, "0")}</div>
        <div class="priority-rail" aria-hidden="true"><span class="priority-dot"></span></div>
        <details class="digest-card ${item.image ? "has-media" : ""} ${item.read ? "is-read" : ""}" data-id="${escapeHtml(item.id)}">
          <summary class="digest-card-summary">
            <div class="digest-summary-main">
              <div class="digest-card-head">
                <p class="card-kicker">${escapeHtml(item.source)} · ${escapeHtml(itemDateTimeLabel(item))}</p>
              </div>
              <h3 title="${escapeHtml(displayTitle)}">${escapeHtml(limitText(displayTitle, 58))}</h3>
              <p class="digest-preview">${escapeHtml(limitText(displaySummary, 118))}</p>
              <div class="priority-reasons">
                ${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}
              </div>
              <p class="priority-reason-text"><strong>推荐理由：</strong>${escapeHtml(reasonText)}</p>
            </div>
            <span class="expand-hint">展开</span>
          </summary>
          <div class="digest-card-grid">
            ${renderDigestMedia(item, displayTitle)}
            <div class="digest-card-main">
              <div class="news-card-top digest-expanded-head">
                <div>
                  <p class="card-kicker">${escapeHtml(item.source)} · ${escapeHtml(itemDateTimeLabel(item))}</p>
                  <h3>${escapeHtml(displayTitle)}</h3>
                </div>
              </div>
              <p class="digest-line">${escapeHtml(displaySummary)}</p>
              ${renderOriginalNote(item, displayTitle)}
              ${renderKeyPoints(makeCardKeyPoints(item))}
              <p class="digest-confidence">${escapeHtml(makeCardConfidence(item))}</p>
              <div class="meta-row">
                <span>${escapeHtml(item.brand)}</span>
                <span>${escapeHtml(item.type)}</span>
                <span>${escapeHtml(item.trust)}</span>
              </div>
              <div class="card-actions">
                <button type="button" data-action="read" data-id="${escapeHtml(item.id)}">${readLabel}</button>
                ${renderRedbookButton(item.id)}
                ${link}
              </div>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  function classifySection(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (isSpecPriority(item)) return "specs";
    if (/(counterpoint|shipments?|market share|出货|市场|份额|增长)/i.test(text)) return "market";
    if (item.trust === "官方确认" || /(launch|release|发布|上市|official|newsroom)/i.test(text)) return "launch";
    if (isLeakPriority(item)) return "leaks";
    if (item.brand === "iPhone") return "iphone";
    if (item.type === "评测" || /(review|hands-on|teardown|ifixit|dxomark|评测|体验|拆解)/i.test(text)) return "review";
    return "market";
  }

  function hasDailyNoiseSignal(item) {
    const title = String(item.title || "").toLowerCase();
    return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|keyboard sound|halide|pro camera app|\bapp\b|care\+|summer holiday companion|mlb|baseball|the show|dex|computer|repair|support|returned their phone|worse than dead|anti-snatching|stolen device|一日一技|键盘声音|国补|优惠|直降|低至|免息|京东|天猫|淘宝|618|促销|领券|到手|秒杀|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|手表|apple watch|耳机|支架|钢化膜|保护壳|小组件|app\s*(获|更新|上架|适配)|应用市场|driver'?s license|digital id|wallet|macbook)/i.test(title);
  }

  function hasStrongNonPhoneSignal(item) {
    const title = String(item.title || "");
    return /(\bai\b|apple intelligence|audio eraser|siri|gemini|\bios\s?\d|\bandroid\s?\d|one ui|public beta|developer beta|messages app|rcs|spotify|airpods|google cast|contacts|phone app|settings ui|call features?|keyboard sound|halide|pro camera app|\bapp\b|care\+|summer holiday companion|driver'?s license|digital id|wallet|airtag|bluetooth tracker|find my network|anti-snatching|stolen device|mlb|baseball|the show|watch|galaxy watch|手表|apple watch|dex|computer|小组件|app\s*(获|更新|上架|适配)|应用市场|微信鸿蒙版|一日一技|键盘声音|平板|ipad|macbook|mac\b|电脑|笔记本|汽车|蔚来|特斯拉|问界|启境|gt7|repair|support|returned their phone|worse than dead|国补|优惠|直降|低至|免息|领券|到手|京东|天猫|淘宝|anker|安克|maggo|充电器|无线充|磁吸|充电头|快充头|充电宝|移动电源|数据线|耳机|支架|钢化膜|保护壳|空调|家电|音乐键盘|钠离子|锂空气|宁德时代|世界杯|观赛)/i.test(title);
  }

  function isLeakPriority(item) {
    if (hasStrongNonPhoneSignal(item) || hasDailyNoiseSignal(item)) return false;
    const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`.toLowerCase();
    return /(first look|dummy model|dummy unit|color options|case leak|render|renders|rumou?r|leak|exclusive|消息称|爆料|开案|机模|配色|渲染|外观|尺寸|相机|影像|长焦|潜望|电池|续航|充电|屏幕|直屏|曲屏|芯片|处理器|跑分|认证|散热|发热|成本|升级|量产|供应链|数码闲聊站|digital chat station|ming-chi kuo|kuo|mark gurman|onleaks|ice universe|evleaks)/i.test(text);
  }

  function isSpecPriority(item) {
    if (hasStrongNonPhoneSignal(item) || hasDailyNoiseSignal(item)) return false;
    const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
    return (
      item.type === "参数" ||
      /(benchmark|geekbench|fcc|tenaa|bluetooth sig|certification|认证|跑分|芯片|处理器|snapdragon|tensor|exynos|a-series|屏幕|display|screen|oled|refresh|hz|电池|battery|mah|charging|充电|影像|相机|camera|telephoto|periscope|潜望|长焦|光圈|sensor|cmos|200mp|48mp|散热|vapor chamber|cooling|vc\b|均热板|参数)/i.test(text)
    );
  }

  function priorityScore(item) {
    const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
    let score = 22;
    if (isSpecPriority(item)) score += 28;
    if (isLeakPriority(item)) score += 18;
    if (item.trust === "官方确认") score += 18;
    if (item.trust === "监管/跑分") score += 16;
    if (item.trust === "高可信爆料") score += 14;
    if (item.trust === "高关注爆料源") score += 11;
    if (item.brand === "iPhone") score += 8;
    if (["Xiaomi", "Samsung", "Huawei", "OPPO", "vivo"].includes(item.brand)) score += 5;
    if (hasDigestImage(item)) score += 4;
    if (/(电池|battery|mah|影像|相机|camera|芯片|处理器|屏幕|display|认证|跑分|散热|vapor chamber|价格|售价|price)/i.test(text)) score += 8;
    if (/(counterpoint|shipments?|market share|出货|市场|份额)/i.test(text)) score -= 12;
    if (hasDailyNoiseSignal(item)) score -= 30;
    if (item.date === latestAutoNewsDate()) score += 4;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function latestAutoNewsDate() {
    return autoNewsWithState()
      .map((item) => item.date)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0];
  }

  function priorityLevel(score) {
    if (score >= 82) return "必看";
    if (score >= 68) return "高";
    if (score >= 54) return "中";
    return "低";
  }

  function priorityReasons(item) {
    const reasons = [];
    if (isSpecPriority(item)) reasons.push("参数/硬件");
    if (isLeakPriority(item)) reasons.push("发布前线索");
    if (item.trust === "官方确认") reasons.push("官方确认");
    if (item.trust === "监管/跑分") reasons.push("认证/跑分");
    if (item.trust === "高可信爆料") reasons.push("高可信来源");
    if (item.trust === "高关注爆料源") reasons.push("高关注来源");
    if (/(电池|battery|mah)/i.test(`${item.title} ${item.summary}`)) reasons.push("电池");
    if (/(影像|相机|camera|潜望|长焦|cmos|sensor)/i.test(`${item.title} ${item.summary}`)) reasons.push("影像");
    if (/(芯片|处理器|snapdragon|tensor|exynos|a-series)/i.test(`${item.title} ${item.summary}`)) reasons.push("芯片");
    if (/(屏幕|display|screen|oled|refresh|hz)/i.test(`${item.title} ${item.summary}`)) reasons.push("屏幕");
    if (!reasons.length) reasons.push(item.type || "资讯");
    return [...new Set(reasons)].slice(0, 4);
  }

  function priorityReasonSentence(item, reasons) {
    const title = feedDisplayTitle(item);
    const summary = feedDisplaySummary(item, title);
    const text = `${title} ${summary}`;
    const lower = text.toLowerCase();
    const subject = reasonSubject(title);
    const specs = extractReasonSpecs(text);

    if (/(鼓包|售后|维修|返修|故障|召回|质量|投诉|客服|自费|爆出来)/i.test(text)) {
      return `${subject}更像用户侧风险信号：重点看是否是个案、批量问题，还是售后口径变化。`;
    }
    if (/(电池|续航|mah|battery|charging|快充|充电|鼓包)/i.test(lower)) {
      return `${subject}的核心在电池和续航预期${specs ? `（${specs}）` : ""}，会直接影响版本选择和购买判断。`;
    }
    if (/(影像|相机|镜头|长焦|潜望|徕卡|光学|cmos|sensor|camera|telephoto|aperture|video)/i.test(lower)) {
      return `${subject}把卖点落在影像硬件${specs ? `（${specs}）` : ""}，适合放到发布前参数线索里重点跟。`;
    }
    if (/(芯片|处理器|跑分|性能|snapdragon|tensor|exynos|a-series|geekbench|benchmark|soc)/i.test(lower)) {
      return `${subject}涉及性能平台或跑分线索${specs ? `（${specs}）` : ""}，能提前判断新机定位和代际提升。`;
    }
    if (/(屏幕|直屏|曲屏|oled|display|screen|刷新率|hz|亮度|护眼)/i.test(lower)) {
      return `${subject}的看点在屏幕形态和显示规格${specs ? `（${specs}）` : ""}，会影响手感、功耗和产品分档。`;
    }
    if (/(认证|备案|fcc|tenaa|3c|bluetooth sig|入网|监管)/i.test(lower)) {
      return `${subject}属于认证/监管线索，可信度通常高于普通传闻，可用来校验发布时间和硬件版本。`;
    }
    if (/(价格|售价|起售|定价|成本|price|pricing|元起)/i.test(lower)) {
      return `${subject}直接关系到定价和购买窗口，适合和同档竞品、上一代价格一起对比。`;
    }
    if (/(发布|上市|预热|官宣|official|launch|release|将于|定档)/i.test(lower) || item.trust === "官方确认") {
      return `${subject}已经接近发布节奏，适合先记录官方口径，再等完整参数和售价补齐。`;
    }
    if (/(市场|份额|出货|增长|counterpoint|shipments|market share)/i.test(lower)) {
      return `${subject}不是单机购买线索，但能反映品牌走势，适合做行业背景和选题判断。`;
    }
    if (/(系统|ui|coloros|hyperos|one ui|ios|android|适配|功能)/i.test(lower)) {
      return `${subject}主要是系统体验变化，适合关注是否会影响日常交互、兼容性和老机型升级。`;
    }
    if (item.trust === "高关注爆料源" || item.trust === "高可信爆料") {
      return `${subject}来自较活跃的爆料源，先当发布前方向看，后续需要认证信息或第二来源确认。`;
    }
    return `${subject}保留在列表里作背景信息，重点看它是否能补充发布时间、配置或用户反馈。`;
  }

  function reasonSubject(title) {
    let subject = String(title || "这条消息")
      .replace(/^[^：:]{1,14}[：:]\s*/, "")
      .trim();
    const bracket = subject.match(/【([^】]{4,80})】/);
    if (bracket) subject = bracket[1];
    subject = subject
      .replace(/^(消息称|报道称|博主称|曝料|爆料|曝|传闻|据称|官方|宣布|发布)\s*/g, "")
      .split(/[，,。；;]/)[0]
      .trim();
    return limitText(subject || "这条消息", 34);
  }

  function extractReasonSpecs(text) {
    const patterns = [
      /\b\d{3,5}\s?mAh\b/gi,
      /\b\d{1,3}\s?W\b/g,
      /\b\d{2,4}\s?Hz\b/gi,
      /\b\d{1,4}\s?MP\b/gi,
      /\b\d(?:\.\d)?\s?K\b/gi,
      /\b\d+(?:\.\d+)?\s?英寸\b/g,
      /\b(?:A\d+|骁龙\s?\w+|Snapdragon\s?\w+|Tensor\s?\w+|Exynos\s?\w+)\b/gi,
      /徕卡光学|潜望长焦|直屏|曲屏|OLED|CMOS/gi
    ];
    const hits = [];
    patterns.forEach((pattern) => {
      const matches = text.match(pattern) || [];
      matches.forEach((match) => {
        const clean = match.trim();
        if (clean && !hits.includes(clean)) hits.push(clean);
      });
    });
    return hits.slice(0, 3).join(" / ");
  }

  function getIssueDate(items) {
    const firstDate = items.map((item) => item.date).sort((a, b) => b.localeCompare(a))[0];
    return firstDate || new Date().toISOString().slice(0, 10);
  }

  function makeDailyIntro(items) {
    if (!items.length) return "更新资讯后，这里会把值得看的内容整理成日报。";
    const leakCount = items.filter((item) => classifySection(item) === "leaks").length;
    const iphoneCount = items.filter((item) => item.brand === "iPhone").length;
    const officialCount = items.filter((item) => item.trust === "官方确认").length;
    const specCount = items.filter((item) => classifySection(item) === "specs").length;
    return `今日筛出 ${items.length} 条重点，其中 ${leakCount} 条是重点爆料，包含 ${iphoneCount} 条 iPhone 相关、${officialCount} 条官方确认、${specCount} 条参数线索。`;
  }

  function scoreNews(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    let score = 0;

    if (item.brand === "iPhone") score += 4;
    if (["Samsung", "Pixel"].includes(item.brand)) score += 2;
    if (item.trust === "官方确认") score += 4;
    if (item.trust === "高关注爆料源") score += 4;
    if (item.trust === "高可信爆料") score += 3;
    if (item.trust === "监管/跑分") score += 2;
    if (item.type === "参数") score += 2;
    if (item.type === "市场报告") score += 1;
    if (isSpecPriority(item)) score += 6;
    if (isLeakPriority(item)) score += 7;
    if (isLeakPriority(item) && item.brand === "iPhone") score += 6;
    if (/(iphone\s?\d+.*(dummy|color|camera)|机模|配色|相机升级|color options|dummy models)/i.test(text)) score += 3;
    if (/(iphone|ios|a-series|apple intelligence|galaxy|pixel|tensor|camera|battery|display|price|launch|release|rumor|leak|芯片|相机|影像|电池|屏幕|价格|发布|爆料|认证|跑分)/i.test(text)) {
      score += 2;
    }
    if (/(counterpoint|shipments?|market share|出货|市场|份额)/i.test(text)) score -= 4;
    if (hasDailyNoiseSignal(item)) score -= 6;

    return score;
  }

  function makePlainSummary(item) {
    const title = feedDisplayTitle(item);
    const summary = feedDisplaySummary(item, title);
    if (summary && summary !== title) return summary;
    return title;
  }

  function makeCardKeyPoints(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const points = [];
    if (/(first look|dummy|color|配色|机模|外观|render|design|渲染|尺寸)/i.test(text)) points.push("外观 / 配色 / 尺寸");
    if (/(camera|photo|video|telephoto|aperture|相机|影像|长焦|潜望|光圈)/i.test(text)) points.push("影像硬件");
    if (/(display|screen|oled|brightness|refresh|屏幕|直屏|曲屏|折叠屏|折痕)/i.test(text)) points.push("屏幕形态");
    if (/(battery|charging|magsafe|qi2|电池|续航|充电|万级大电池)/i.test(text)) points.push("电池 / 充电");
    if (/(chip|processor|modem|a-series|snapdragon|tensor|exynos|芯片|处理器|跑分|认证)/i.test(text)) points.push("芯片 / 性能");
    if (/(price|pricing|cost|价格|售价|成本)/i.test(text)) points.push("成本 / 价格");
    if (!points.length) points.push(item.type || "手机资讯");
    return [...new Set(points)].slice(0, 4);
  }

  function makeCardConfidence(item) {
    if (item.trust === "官方确认") return "官方内容，可直接作为已确认信息记录。";
    if (item.trust === "监管/跑分") return "比普通爆料更接近硬件事实，但型号对应关系仍要核对。";
    if (item.trust === "高关注爆料源") return "来自常见高关注爆料源，适合重点看，但仍需等第二来源或发布会确认。";
    if (item.trust === "高可信爆料") return "可信度较高，但仍属于发布前线索。";
    return "媒体汇总或普通传闻，适合先收藏观察，不当作最终参数。";
  }

  function explainImportance(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (isLeakPriority(item)) return "这是提前爆料，能决定你要不要继续等某款机型，但还要交叉验证。";
    if (item.trust === "官方确认") return "官方确认，能直接作为事实记录。";
    if (item.trust === "高关注爆料源") return "高关注爆料源的发布前线索，适合重点看，但还要交叉验证。";
    if (item.trust === "高可信爆料") return "可能提前透露发布时间、配置或产品方向。";
    if (item.trust === "监管/跑分") return "适合验证芯片、内存、型号或频段线索。";
    if (item.type === "市场报告") return "适合看品牌走势，不急着当购买依据。";
    if (/(camera|影像|相机|battery|电池|display|屏幕|price|价格|chip|芯片)/i.test(text)) {
      return "涉及配置或价格，可能影响买不买、等不等。";
    }
    return "先当普通线索，等更多来源验证。";
  }

  function nextAction(item) {
    if (isLeakPriority(item)) return "先收藏到重点爆料；等第二个可靠来源、认证或发布会再确认。";
    if (item.trust === "官方确认" || item.type === "参数") return "把关键信息补进参数库。";
    if (item.brand === "iPhone" && item.type === "爆料") return "收藏，等第二个可靠来源交叉验证。";
    if (item.type === "评测") return "买前再打开看体验和缺点。";
    return "不用急着打开，先扫标题即可。";
  }

  function renderFeed() {
    const list = filteredNews();
    const all = allNews();
    elements.newsList.innerHTML = list.map(renderNewsItem).join("");
    elements.emptyFeed.hidden = list.length > 0;
    elements.totalCount.textContent = list.length;
    elements.officialCount.textContent = all.filter((item) => item.trust === "官方确认").length;
    elements.savedCount.textContent = all.filter((item) => item.favorite).length;
  }

  function renderNewsItem(item) {
    const link = item.url
      ? `<a class="link-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" data-action="open-source" data-id="${escapeHtml(item.id)}">打开来源</a>`
      : "";
    const readLabel = item.read ? "已读" : "标为已读";
    const favoriteLabel = item.favorite ? "已收藏" : "收藏";
    const displayTitle = feedDisplayTitle(item);
    const displaySummary = feedDisplaySummary(item, displayTitle);
    return `
      <article class="news-card ${item.image ? "has-media" : ""} ${item.read ? "is-read" : ""}">
        ${renderNewsMedia(item, displayTitle)}
        <div class="news-card-body">
          <div class="news-card-top">
            <div>
              <p class="card-kicker">${escapeHtml(item.source)} · ${escapeHtml(itemDateTimeLabel(item))}</p>
              <h3>${escapeHtml(displayTitle)}</h3>
            </div>
            <span class="trust-tag ${trustClass(item.trust)}">${escapeHtml(item.trust)}</span>
          </div>
          <p>${escapeHtml(displaySummary)}</p>
          <div class="meta-row">
            <span>${escapeHtml(item.brand)}</span>
            <span>${escapeHtml(item.model)}</span>
            <span>${escapeHtml(item.type)}</span>
          </div>
          <div class="card-actions">
            <button type="button" data-action="favorite" data-id="${escapeHtml(item.id)}">${favoriteLabel}</button>
            <button type="button" data-action="read" data-id="${escapeHtml(item.id)}">${readLabel}</button>
            ${renderRedbookButton(item.id)}
            ${link}
          </div>
        </div>
      </article>
    `;
  }

  function feedDisplayTitle(item) {
    const originalTitle = String(item.title || "");
    const translatedTitle = translatedEnglishTitle(item);
    if (translatedTitle) return translatedTitle;
    const comparisonTitle = localComparisonTitle(originalTitle);
    if (comparisonTitle && isMostlyEnglish(comparisonTitle)) return `${item.brand || "手机"} 机型对比：差异整理`;
    const normalizedTitle = originalTitle.replace(/^[^A-Za-z0-9\u3400-\u9fff]+/, "");
    const title = cleanDailyTitle({ ...item, title: normalizedTitle || originalTitle, originalTitle });
    return isMostlyEnglish(title) ? `${item.brand || "手机"} 相关消息` : title;
  }

  function feedDisplaySummary(item, title) {
    const summary = String(item.summary || "").trim();
    if (summary && !isMostlyEnglish(summary)) return summary;
    const translatedSummary = translatedEnglishSummary(item, title);
    if (translatedSummary) return translatedSummary;
    return `${title}。${explainImportance(item)}`;
  }

  function translatedEnglishTitle(item) {
    const text = `${item.title || ""} ${item.summary || ""}`;
    if (!isMostlyEnglish(text)) return "";
    if (/airtag|bluetooth tracker|find my network/i.test(text)) return "";
    if (/counterpoint|shipments?|market share|latin america|q1/i.test(text) && /iphone/i.test(text)) {
      return "iPhone 拉美出货量报告：Q1 同比增长 8%";
    }
    if (/redmi k\d+\s*pro/i.test(text) && /camera|battery|key details|specs/i.test(text)) {
      return "Redmi K100 Pro 参数爆料：相机、电池和核心配置曝光";
    }
    if (/iphone\s*18\s*pro/i.test(text) && /batter/i.test(text)) return "iPhone 18 Pro 电池容量或按市场区分";
    if (/iphone ultra/i.test(text) && /release timing|new feature/i.test(item.title || "")) return "iPhone Ultra 新功能与发布时间爆料";
    if (/iphone ultra/i.test(text) && /color|leaked image|white|dummy model/i.test(text)) return "iPhone Ultra 外观与配色泄露";
    if (/(foldable|iphone ultra)/i.test(text) && /vapor chamber|cooling/i.test(text)) {
      return "iPhone Ultra 折叠屏传闻：薄机身仍配 VC 散热";
    }
    if (/galaxy z fold\s*8 ultra/i.test(text) && /bluetooth sig|certification|moniker/i.test(text)) {
      return "Galaxy Z Fold 8 Ultra 名称现身蓝牙认证";
    }
    if (/galaxy z fold\s*8/i.test(text) && /(wider|form factor|spied|leaked|public|wild)/i.test(text)) return "Galaxy Z Fold 8 宽机身形态曝光";
    if (/oppo find x\d+ pro max/i.test(text) && /200mp|periscope|telephoto/i.test(text)) {
      return "OPPO Find X10 Pro Max 或继续推进 2 亿像素潜望长焦";
    }
    if (/oneplus turbo\s*6x pro/i.test(text) && /oled|price|screen/i.test(text)) return "OnePlus Turbo 6x Pro 爆料：三星 OLED 屏与价格线索";
    return "";
  }

  function translatedEnglishSummary(item, title) {
    const text = `${item.title || ""} ${item.summary || ""}`;
    if (!isMostlyEnglish(text)) return "";
    const points = [];
    if (/vapor chamber|cooling/i.test(text)) points.push("重点是 VC 均热板散热");
    if (/thin|thin design/i.test(text)) points.push("仍强调薄机身设计");
    if (/battery|batteries|capacity/i.test(text)) points.push("不同市场版本的电池容量可能不同");
    if (/color|white|dummy model|leaked image/i.test(text)) points.push("有外观、配色或机模线索");
    if (/bluetooth sig|certification/i.test(text)) points.push("信息来自蓝牙认证线索");
    if (/200mp|periscope|telephoto/i.test(text)) points.push("核心看 2 亿像素潜望长焦配置");
    if (/oled|screen|display/i.test(text)) points.push("涉及屏幕硬件");
    if (/price|pricing/i.test(text)) points.push("同时出现价格线索");
    if (/shipments?|market share|counterpoint/i.test(text)) points.push("属于市场数据，不是硬件参数");
    if (!points.length) return "";
    return `${title}。${points.join("；")}。`;
  }

  function renderDevices() {
    const devices = allDevices()
      .filter((device) => matchesDeviceQuery(device))
      .filter((device) => state.deviceStatus === "全部" || device.status === state.deviceStatus);

    if (!devices.length) {
      elements.deviceTable.innerHTML = `<p class="empty-state">没有匹配的机型参数。</p>`;
      renderCompareShelf(devices);
      return;
    }

    const rows = ["外观", "处理器", "屏幕", "影像", "续航", "机身", "其他", "价格"];
    elements.deviceTable.innerHTML = groupDevicesByBrand(devices)
      .map(([brand, brandDevices]) => renderDeviceBrandGroup(brand, brandDevices, rows))
      .join("");

    renderCompareShelf(devices);
  }

  function groupDevicesByBrand(devices) {
    const order = ["iPhone", "Xiaomi", "Huawei", "OPPO", "vivo", "OnePlus", "iQOO", "HONOR"];
    const groups = new Map();
    devices.forEach((device) => {
      const brand = device.brand || "其他";
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(device);
    });

    return Array.from(groups.entries()).sort((a, b) => {
      const left = order.indexOf(a[0]);
      const right = order.indexOf(b[0]);
      if (left >= 0 && right >= 0) return left - right;
      if (left >= 0) return -1;
      if (right >= 0) return 1;
      return a[0].localeCompare(b[0]);
    });
  }

  function renderDeviceBrandGroup(brand, devices, rows) {
    return `
      <section class="brand-spec-group">
        <div class="brand-spec-head">
          <h3>${escapeHtml(brandNameForDeviceGroup(brand))}</h3>
          <span>${devices.length} 款</span>
        </div>
        <div class="spec-grid" style="--device-count: ${devices.length}">
          <div class="spec-row spec-header-row">
            <div class="spec-label">型号</div>
            ${devices.map(renderSpecHeader).join("")}
          </div>
          ${rows
            .map(
              (label) => `
              <div class="spec-row">
                <div class="spec-label">${escapeHtml(label)}</div>
                ${devices.map((device) => `<div class="spec-cell">${formatSpecValue(specFor(device, label))}</div>`).join("")}
              </div>
            `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function brandNameForDeviceGroup(brand) {
    const names = {
      iPhone: "Apple / iPhone",
      Xiaomi: "小米",
      Huawei: "华为",
      OPPO: "OPPO",
      vivo: "vivo",
      OnePlus: "一加",
      iQOO: "iQOO",
      HONOR: "荣耀"
    };
    return names[brand] || brand;
  }

  function renderSpecHeader(device) {
    const source = device.sourceUrl
      ? `<a class="spec-source" href="${escapeHtml(device.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(device.source || "查看官网")}</a>`
      : `<span>${escapeHtml(device.source || "来源待补充")}</span>`;

    return `
      <div class="spec-device">
        <strong>${escapeHtml(device.model)}</strong>
        <span>${escapeHtml(device.brand)} · ${escapeHtml(device.release || "待补充")}</span>
        <span class="trust-tag ${device.status === "官方参数" ? "tag-green" : "tag-amber"}">${escapeHtml(device.status)}</span>
        ${source}
      </div>
    `;
  }

  function specFor(device, label) {
    if (device.specs?.[label]) return device.specs[label];
    if (label === "处理器") return device.chip;
    if (label === "屏幕") return device.display;
    if (label === "影像") return device.camera;
    if (label === "续航") return device.battery;
    if (label === "价格") return device.price;
    if (label === "外观") return [device.brand, device.release].filter(Boolean).join("；") || "待补充";
    if (label === "机身") return device.body || "待补充";
    if (label === "其他") return device.extra || device.source || "待补充";
    return "待补充";
  }

  function formatSpecValue(value) {
    const text = String(value || "待补充").trim();
    const parts = text.split(/[；;]\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return escapeHtml(text);
    return parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("");
  }

  function matchesDeviceQuery(device) {
    if (!state.query) return true;
    const haystack = deviceSearchText(device).toLowerCase();
    return haystack.includes(state.query);
  }

  function deviceSearchText(device) {
    return [
      ...Object.values(device).filter((value) => typeof value !== "object"),
      ...Object.values(device.specs || {})
    ].join(" ");
  }

  function renderCompareShelf(devices = allDevices()) {
    const officialCount = devices.filter((device) => device.status === "官方参数").length;
    elements.compareShelf.innerHTML = `
      <div class="spec-note">
        <strong>只把已确认参数放进这里</strong>
        <span>当前显示 ${devices.length} 款机型，其中 ${officialCount} 款来自官网参数；发布前爆料仍放在“重点爆料”，不混进官方参数库。</span>
      </div>
    `;
  }

  function renderSources() {
    const query = state.query;
    const sources = seed.sources.filter((source) => {
      const haystack = Object.values(source).join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

    elements.sourceGrid.innerHTML = sources
      .map(
        (source) => `
        <article class="source-card">
          <div>
            <p class="card-kicker">${escapeHtml(source.group)} · ${escapeHtml(source.kind)}</p>
            <h3>${escapeHtml(source.name)}</h3>
          </div>
          <p>${escapeHtml(source.focus)}</p>
          <div class="meta-row">
            <span>${escapeHtml(source.authority)}</span>
            <span>${escapeHtml(source.cadence)}</span>
          </div>
          <a class="link-button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">打开来源</a>
        </article>
      `
      )
      .join("");
  }

  function renderAll() {
    renderDigest();
    renderFeed();
    renderDevices();
    renderSources();
  }

  function setView(nextView) {
    state.view = nextView;
    document.body.dataset.view = nextView;
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === nextView);
    });
    document.querySelectorAll(".app-view").forEach((view) => {
      view.classList.toggle("is-visible", view.id === `${nextView}View`);
    });
  }

  function updateItemState(id, patch) {
    const itemState = getItemState();
    itemState[id] = { ...(itemState[id] || {}), ...patch };
    writeJson(storageKeys.itemState, itemState);
  }

  function handleOpenSourceAction(event) {
    const link = event.target.closest("a[data-action='open-source'][data-id]");
    if (!link) return false;
    const item = findContentItemById(link.dataset.id);
    markContentItemSeen(item);
    return true;
  }

  function handleDigestAction(event) {
    if (handleRedbookAction(event)) return;
    if (handleOpenSourceAction(event)) return;

    const button = event.target.closest("button[data-action]");
    if (!button || button.dataset.action !== "read") return;
    const item = findContentItemById(button.dataset.id);
    markContentItemSeen(item);
    renderAll();
  }

  function handleDigestToggle(event) {
    const card = event.target.closest("details.digest-card[data-id]");
    if (!card || !card.open) return;
    const item = findContentItemById(card.dataset.id);
    markContentItemSeen(item);
    card.classList.add("is-read");
    const readButton = card.querySelector("button[data-action='read']");
    if (readButton) readButton.textContent = "已读";
  }

  function handleNewsAction(event) {
    if (handleRedbookAction(event)) return;
    if (handleOpenSourceAction(event)) return;

    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = allNews().find((entry) => entry.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "favorite") {
      updateItemState(item.id, { favorite: !item.favorite });
    }
    if (button.dataset.action === "read") {
      markContentItemSeen(item);
    }
    renderAll();
  }

  function wireEvents() {
    elements.searchInput?.addEventListener("input", (event) => {
      state.query = normalize(event.target.value);
      renderAll();
    });
    elements.deviceStatusFilter?.addEventListener("change", (event) => {
      state.deviceStatus = event.target.value;
      renderDevices();
    });
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    elements.digestList?.addEventListener("click", handleDigestAction);
    elements.digestList?.addEventListener("toggle", handleDigestToggle, true);
    elements.newsList?.addEventListener("click", handleNewsAction);
    elements.deviceTable?.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-compare-id]");
      if (!checkbox) return;
      if (checkbox.checked) {
        state.compareIds.add(checkbox.dataset.compareId);
      } else {
        state.compareIds.delete(checkbox.dataset.compareId);
      }
      renderCompareShelf();
    });
    elements.notifyButton?.addEventListener("click", requestNotifications);
    elements.redbookCloseButton?.addEventListener("click", closeRedbookPanel);
    elements.redbookOverlay?.addEventListener("click", (event) => {
      if (event.target === elements.redbookOverlay) closeRedbookPanel();
    });
    elements.redbookCopyTitleButton?.addEventListener("click", () => copyToClipboard(state.redbook.title, "标题已复制。"));
    elements.redbookCopyBodyButton?.addEventListener("click", () => copyToClipboard(state.redbook.body, "正文已复制。"));
    elements.redbookCopyPromptButton?.addEventListener("click", () => copyToClipboard(state.redbook.prompt, "图片提示词已复制。"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.redbookOverlay?.hidden) closeRedbookPanel();
    });
  }

  wireEvents();
  renderAll();
  updateNotificationUi();
  startBackgroundAutoUpdate();
  maybeAutoUpdateFromLocalServer();
})();
