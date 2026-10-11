"use strict";

(() => {
  // A fresh namespace preserves both previous trips and their receipts.
  const DATA_PREFIX = "trip3-";
  const STORAGE_KEY = "trip-hongkong-hub-v4";
  const DB_NAME = "trip-hongkong-media-v1";
  const DB_STORE = "receipts";
  const THEME_KEY = "trip-hongkong-theme";
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
  const TIMEZONE = "Asia/Hong_Kong";
  const PAGE = document.body.dataset.page || "home";
  const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
  const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
  const DEFAULT_WEATHER_LOCATION = { name: "홍콩", country: "홍콩", admin1: "", latitude: 22.3193, longitude: 114.1694, timezone: "Asia/Hong_Kong" };
  // Meteocons by Bas Milius (MIT): https://github.com/basmilius/meteocons
  const WEATHER_ICON_BASE = "https://cdn.jsdelivr.net/npm/@bybas/weather-icons@2.0.0/production/fill/all/";
  const RATE_URL = "https://api.frankfurter.dev/v2/rate/HKD/KRW";
  const VALID_PLAN_STATUSES = new Set(["confirmed", "recommended", "flexible", "custom"]);
  const COMMON_CHECK_CATEGORIES = ["예약·티켓", "교통·이동", "함께 준비"];
  const PERSONAL_CHECK_CATEGORIES = ["개인 준비", "위탁 수하물", "기내 수하물"];
  const CHECK_CATEGORIES = [...COMMON_CHECK_CATEGORIES, ...PERSONAL_CHECK_CATEGORIES];
  const COMMON_CHECKLIST_TEMPLATES = [
    { id: "flight", category: "예약·티켓", text: "항공편 예약·수하물 규정 확인", done: false },
    { id: "hotel", category: "예약·티켓", text: "숙소 예약·체크인 시간 확인", done: false },
    { id: "tickets", category: "예약·티켓", text: "관광지·식당 예약하기", done: false },
    { id: "transport", category: "교통·이동", text: "공항·도시 간 이동 방법 정하기", done: false },
    { id: "map", category: "함께 준비", text: "갈 곳을 지도에 저장하기", done: false },
    { id: "documents", category: "함께 준비", text: "예약 확인서·QR 공유하기", done: false }
  ];
  const PERSONAL_CHECKLIST_TEMPLATES = [
    { key: "passport", category: "개인 준비", text: "여권 유효기간·영문 이름 확인" },
    { key: "insurance", category: "개인 준비", text: "여행자보험 가입" },
    { key: "esim", category: "개인 준비", text: "eSIM 또는 로밍 준비" },
    { key: "payment", category: "개인 준비", text: "해외결제 카드·현금 준비" },
    { key: "clothes", category: "위탁 수하물", text: "여벌 옷 · 속옷 · 양말" },
    { key: "toiletries", category: "위탁 수하물", text: "세면도구 · 100ml 초과 액체" },
    { key: "shoes", category: "위탁 수하물", text: "여벌 신발 · 개인용품" },
    { key: "essentials", category: "기내 수하물", text: "여권 · 지갑 · 휴대폰" },
    { key: "documents", category: "기내 수하물", text: "탑승권 · 예약 QR 오프라인 저장" },
    { key: "charger", category: "기내 수하물", text: "충전기 · 여행지 규격 어댑터" },
    { key: "battery", category: "기내 수하물", text: "보조배터리 규정 확인 · 기내 휴대" },
    { key: "medicine", category: "기내 수하물", text: "상비약 · 개인 약" },
    { key: "liquids", category: "기내 수하물", text: "100ml 이하 액체 · 지퍼백" },
    { key: "rain", category: "기내 수하물", text: "접이식 우산 · 우비" }
  ];
  const VALID_CURRENCIES = new Set(["HKD", "KRW"]);
  const VALID_CATEGORIES = new Set(["식비", "교통", "숙소", "관광", "쇼핑", "기타"]);
  const SECTIONS = new Set(["prepare", "trip", "settle"]);

  let state = loadState();
  let cloudSync = null;
  let sharedStateFingerprint = "";
  let toastTimer = 0;
  let weatherRequest = null;
  let weatherError = "";
  let locationSearchRequest = null;
  let locationResults = [];
  let rateRequest = null;
  let pendingReceiptFile = null;
  let pendingReceiptUrl = "";
  let receiptDialogUrl = "";
  let converterSource = "HKD";
  const thumbUrls = new Set();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function themePreference() {
    const preference = document.documentElement.dataset.themePreference;
    return preference === "light" || preference === "dark" ? preference : "system";
  }

  function applyTheme(preference = "system", persist = false) {
    const normalized = preference === "light" || preference === "dark" ? preference : "system";
    const isDark = normalized === "dark" || (normalized === "system" && THEME_MEDIA.matches);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.dataset.themePreference = normalized;
    const toggle = $(".theme-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
      toggle.title = isDark ? "라이트 모드" : "다크 모드";
      const icon = $(".theme-toggle-icon", toggle);
      const label = $(".theme-toggle-label", toggle);
      if (icon) icon.textContent = isDark ? "☀" : "☾";
      if (label) label.textContent = isDark ? "라이트" : "다크";
    }
    const themeColor = $('meta[name="theme-color"]');
    if (themeColor) themeColor.content = isDark ? "#000000" : "#f5f5f7";
    if (persist) {
      try { localStorage.setItem(THEME_KEY, normalized); } catch (error) {}
    }
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  }

  function defaultTrip() {
    return { name: "My trip", startDate: "", endDate: "", mapUrl: "", weatherLocation: { ...DEFAULT_WEATHER_LOCATION } };
  }

  function defaultParticipants() {
    return [
      { id: DATA_PREFIX + "person-1", name: "사람1", active: true, createdAt: "2026-10-11T00:00:00.000Z" },
      { id: DATA_PREFIX + "person-2", name: "사람2", active: true, createdAt: "2026-10-11T00:00:00.000Z" }
    ];
  }

  function defaultState() {
    const participants = defaultParticipants();
    return {
      schemaVersion: 8,
      meta: { generation: DATA_PREFIX },
      trip: defaultTrip(),
      stays: [],
      checklist: checklistSeeds(participants),
      itinerary: [],
      participants,
      expenses: [],
      weatherCache: null,
      rateCache: null,
      ui: { activeDate: "", weatherDate: "", weatherMode: "trip", hideCompleted: false, activeChecklistOwner: "common" }
    };
  }

  function checklistOwners(participants = state.participants) {
    return [{ id: "common", label: "전체" }, ...participants.filter((person) => person.active).map((person) => ({ id: person.id, label: person.name }))];
  }

  function commonChecklistSeeds() {
    return COMMON_CHECKLIST_TEMPLATES.map((item) => ({ ...item, id: DATA_PREFIX + "check-" + item.id, ownerId: "common" }));
  }

  function personalChecklistId(ownerId, item) {
    return `${DATA_PREFIX}check-${ownerId.slice(DATA_PREFIX.length)}-${item.key}`;
  }

  function personalChecklistSeeds(participants) {
    return participants.filter((person) => person.active).flatMap((person) => PERSONAL_CHECKLIST_TEMPLATES.map((item) => ({
      id: personalChecklistId(person.id, item), ownerId: person.id, category: item.category, text: item.text, done: false
    })));
  }

  function checklistSeeds(participants = defaultParticipants()) {
    return [...commonChecklistSeeds(), ...personalChecklistSeeds(participants)];
  }

  function makeId(prefix) {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${DATA_PREFIX}${prefix}-${unique}`;
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T12:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= "2100-12-31";
  }

  function sanitizeWeatherLocation(input) {
    if (!input || typeof input !== "object" || !cleanText(input.name, 60)) return null;
    if (input.latitude == null || input.longitude == null) return null;
    const latitude = Number(input.latitude), longitude = Number(input.longitude);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
    const timezone = cleanText(input.timezone, 60);
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch (error) { return null; }
    if (!timezone) return null;
    return { name: cleanText(input.name, 60), country: cleanText(input.country, 40), admin1: cleanText(input.admin1, 40), latitude, longitude, timezone };
  }

  function weatherLocationKey(location = state.trip.weatherLocation) {
    return `${location.latitude}:${location.longitude}:${location.timezone}`;
  }

  function cachedWeather() {
    return state.weatherCache?.locationKey === weatherLocationKey() ? state.weatherCache.data : null;
  }

  function weatherNumber(value) {
    return value === null || value === undefined || value === "" ? NaN : Number(value);
  }

  function weatherValue(value, suffix = "") {
    const number = weatherNumber(value);
    return Number.isFinite(number) ? Math.round(number) + suffix : "—";
  }

  function todayAtWeatherLocation() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: state.trip.weatherLocation.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function weatherDates() {
    const planned = tripDays();
    if (state.ui.weatherMode !== "week" && planned.length) return planned.map((day) => day.date);
    const today = todayAtWeatherLocation();
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today + "T12:00:00Z");
      day.setUTCDate(day.getUTCDate() + index);
      return day.toISOString().slice(0, 10);
    });
  }

  function selectedWeatherDate() {
    const dates = weatherDates();
    return [state.ui.weatherDate, state.ui.activeDate].find((date) => dates.includes(date)) || dates[0];
  }

  function selectWeatherDate(date) {
    if (!weatherDates().includes(date)) return;
    state.ui.weatherDate = date;
    if (tripDays().some((day) => day.date === date)) {
      state.ui.activeDate = date;
      renderDaySwitcher(); renderTimeline(); renderStayCard();
    }
    saveState(false);
    renderTripWeather(cachedWeather());
    $(`.weather-day[data-date="${date}"]`)?.focus({ preventScroll: true });
  }

  function sanitizeTrip(input) {
    const base = defaultTrip();
    if (!input || typeof input !== "object") return base;
    const startDate = isValidDate(input.startDate) ? input.startDate : "";
    const endDate = isValidDate(input.endDate) && startDate && input.endDate >= startDate ? input.endDate : "";
    return { name: cleanText(input.name, 60) || base.name, startDate, endDate, mapUrl: cleanChecklistUrl(input.mapUrl), weatherLocation: sanitizeWeatherLocation(input.weatherLocation) || { ...DEFAULT_WEATHER_LOCATION } };
  }

  function sanitizeStays(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 50).filter((item) => item && cleanText(item.name, 80)).map((item) => ({
      id: cleanText(item.id, 100) || makeId("hotel"),
      name: cleanText(item.name, 80),
      address: cleanText(item.address, 200),
      checkInDate: isValidDate(item.checkInDate) ? item.checkInDate : "",
      checkOutDate: isValidDate(item.checkOutDate) && (!item.checkInDate || item.checkOutDate >= item.checkInDate) ? item.checkOutDate : "",
      checkInTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.checkInTime) ? item.checkInTime : "",
      checkOutTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.checkOutTime) ? item.checkOutTime : "",
      room: cleanText(item.room, 60),
      rooms: Number.isInteger(Number(item.rooms)) && Number(item.rooms) >= 1 && Number(item.rooms) <= 50 ? Number(item.rooms) : 1,
      breakfast: ["included", "excluded"].includes(item.breakfast) ? item.breakfast : "",
      note: cleanText(item.note, 160)
    }));
  }

  function tripDays() {
    const dates = new Set(state.itinerary.map((item) => item.date).filter(isValidDate));
    if (state.trip.startDate && state.trip.endDate) {
      const count = daysBetween(state.trip.startDate, state.trip.endDate) + 1;
      for (let index = 0; index < Math.min(count, 366); index += 1) {
        dates.add(new Date(dateValue(state.trip.startDate) + index * 86400000).toISOString().slice(0, 10));
      }
    } else if (state.trip.startDate) dates.add(state.trip.startDate);
    if (isValidDate(state.ui.activeDate)) dates.add(state.ui.activeDate);
    const koWeekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const enWeekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    return [...dates].sort().map((date, index) => {
      const weekday = new Date(dateValue(date)).getUTCDay();
      return { date, day: index + 1, month: Number(date.slice(5, 7)), number: String(Number(date.slice(8))), weekday: koWeekdays[weekday], weekdayLong: enWeekdays[weekday] };
    });
  }

  function shortDate(date) {
    return isValidDate(date) ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일` : "날짜 미정";
  }

  function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
  }

  function cleanChecklistUrl(value) {
    const text = cleanText(value, 600);
    if (!text) return "";
    try {
      const url = new URL(text);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function checklistCategoriesForOwner(ownerId) {
    return ownerId === "common" ? COMMON_CHECK_CATEGORIES : PERSONAL_CHECK_CATEGORIES;
  }

  function normalizeCheckCategory(category, id = "", ownerId = "common") {
    if (CHECK_CATEGORIES.includes(category)) return category;
    if (category === "가방 속") {
      return id === "before-shoes" ? "위탁 수하물" : "기내 수하물";
    }
    if (category === "예약·서류") {
      if (ownerId !== "common" || ["before-passport", "before-insurance"].includes(id)) return "개인 준비";
      return "예약·티켓";
    }
    if (category === "통신·결제") {
      if (ownerId !== "common" || ["before-esim", "before-payment"].includes(id)) return "개인 준비";
      return "함께 준비";
    }
    return ownerId === "common" ? "함께 준비" : "개인 준비";
  }

  function sanitizeChecklist(items, fallback, participants) {
    if (!Array.isArray(items)) return fallback;
    if (!items.length) return [];
    const ids = new Set();
    const cleaned = items.slice(0, 500).map((item) => {
      if (!item || typeof item !== "object" || (item.phase && item.phase !== "before")) return null;
      if (item.ownerId && item.ownerId !== "common" && !participants.some((person) => person.id === item.ownerId)) return null;
      const text = cleanText(item.text, 100);
      if (!text) return null;
      let id = cleanText(item.id, 100) || makeId("check");
      while (ids.has(id)) id = makeId("check");
      ids.add(id);
      const ownerId = item.ownerId || "common";
      return {
        id,
        ownerId,
        category: normalizeCheckCategory(item.category, id, ownerId),
        text,
        url: cleanChecklistUrl(item.url || item.link),
        linkLabel: cleanText(item.linkLabel, 12),
        done: item.done === true
      };
    }).filter(Boolean);
    return cleaned;
  }

  function sanitizeItinerary(items, fallback) {
    if (!Array.isArray(items)) return fallback;
    const cleaned = items.slice(0, 300).map((item) => {
      if (!item || typeof item !== "object" || !isValidDate(item.date)) return null;
      const title = cleanText(item.title, 100);
      if (!title) return null;
      return {
        id: cleanText(item.id, 100) || makeId("plan"),
        date: item.date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : "",
        status: VALID_PLAN_STATUSES.has(item.status) ? item.status : "custom",
        title,
        place: cleanText(item.place, 120),
        note: cleanText(item.note, 220)
      };
    }).filter(Boolean);
    return cleaned;
  }

  function sanitizeParticipants(items, fallback) {
    if (!Array.isArray(items)) return fallback;
    const ids = new Set();
    const names = new Set();
    const cleaned = items.slice(0, 30).map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = cleanText(item.name, 30);
      if (!name || names.has(name.toLocaleLowerCase())) return null;
      let id = cleanText(item.id, 100) || makeId("person");
      if (ids.has(id)) id = makeId("person");
      ids.add(id);
      names.add(name.toLocaleLowerCase());
      return { id, name, active: item.active !== false, createdAt: cleanText(item.createdAt, 40) || new Date().toISOString() };
    }).filter(Boolean);
    return cleaned.length ? cleaned : fallback;
  }

  function sanitizeCache(cache, type) {
    if (!cache || typeof cache !== "object") return null;
    if (type === "weather" && cache.data?.current && Array.isArray(cache.data?.daily?.time) && Array.isArray(cache.data?.hourly?.time) && Number.isFinite(Date.parse(cache.fetchedAt))) {
      return { data: cache.data, fetchedAt: cache.fetchedAt, locationKey: cleanText(cache.locationKey, 150) };
    }
    if (type === "rate") {
      const rate = Number(cache.rate);
      if (Number.isFinite(rate) && rate > 0 && typeof cache.date === "string" && typeof cache.fetchedAt === "string") {
        return { rate, date: cache.date, fetchedAt: cache.fetchedAt };
      }
    }
    return null;
  }

  function sanitizeExpenses(items, participants, rateCache) {
    if (!Array.isArray(items)) return [];
    const participantIds = new Set(participants.map((person) => person.id));
    const fallbackPayer = participants[0].id;
    const fallbackSplit = participants.filter((person) => person.active).map((person) => person.id);
    return items.slice(0, 1000).map((item) => {
      if (!item || typeof item !== "object") return null;
      const description = cleanText(item.description || item.title, 100);
      if (!description) return null;
      const currency = VALID_CURRENCIES.has(item.currency) ? item.currency : "HKD";
      let amountMinor = Number(item.amountMinor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        const legacyAmount = Number(item.amount);
        amountMinor = currency === "HKD" ? Math.round(legacyAmount * 100) : Math.round(legacyAmount);
      }
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 10_000_000_000) return null;
      const payerId = participantIds.has(item.payerId) ? item.payerId : fallbackPayer;
      const rawSplit = item.split && Array.isArray(item.split.participantIds) ? item.split.participantIds : item.splitWith;
      const splitIds = Array.isArray(rawSplit) ? [...new Set(rawSplit.filter((id) => participantIds.has(id)))] : fallbackSplit;
      if (!splitIds.length) splitIds.push(payerId);
      let fxRateMicros = Number(item.fxRateMicros);
      if (!Number.isSafeInteger(fxRateMicros) || fxRateMicros <= 0) {
        fxRateMicros = currency === "HKD" && rateCache ? Math.round(rateCache.rate * 1_000_000) : 0;
      }
      let baseAmountKRW = Number(item.baseAmountKRW);
      if (!Number.isSafeInteger(baseAmountKRW) || baseAmountKRW < 0) {
        baseAmountKRW = currency === "KRW" ? amountMinor : fxRateMicros ? convertToKRW(amountMinor, fxRateMicros) : 0;
      }
      return {
        id: cleanText(item.id, 100) || makeId("expense"),
        date: isValidDate(item.date) ? item.date : todayInHongKong(),
        category: VALID_CATEGORIES.has(item.category) ? item.category : "기타",
        description,
        currency,
        amountMinor,
        baseAmountKRW,
        fxRateMicros,
        payerId,
        split: { mode: "equal", participantIds: splitIds },
        receiptId: cleanText(item.receiptId, 100),
        createdAt: cleanText(item.createdAt, 40) || new Date().toISOString()
      };
    }).filter(Boolean);
  }


  function sanitizeState(input) {
    const base = defaultState();
    if (!input || typeof input !== "object" || input.meta?.generation !== DATA_PREFIX) return base;
    const rateCache = sanitizeCache(input.rateCache, "rate");
    const participants = sanitizeParticipants(input.participants, base.participants);
    const trip = sanitizeTrip(input.trip);
    const ui = input.ui && typeof input.ui === "object" ? input.ui : {};
    const itinerary = sanitizeItinerary(input.itinerary, base.itinerary);
    return {
      schemaVersion: 8,
      meta: { generation: DATA_PREFIX },
      trip,
      stays: sanitizeStays(input.stays),
      checklist: sanitizeChecklist(input.checklist, base.checklist, participants),
      itinerary,
      participants,
      expenses: sanitizeExpenses(input.expenses, participants, rateCache),
      weatherCache: sanitizeCache(input.weatherCache, "weather"),
      rateCache,
      ui: {
        activeDate: isValidDate(ui.activeDate) ? ui.activeDate : (trip.startDate || itinerary[0]?.date || ""),
        weatherDate: isValidDate(ui.weatherDate) ? ui.weatherDate : "",
        weatherMode: ui.weatherMode === "week" ? "week" : "trip",
        hideCompleted: ui.hideCompleted === true,
        activeChecklistOwner: checklistOwners(participants).some((owner) => owner.id === ui.activeChecklistOwner) ? ui.activeChecklistOwner : "common"
      }
    };
  }

  function normalizeState(input) {
    return sanitizeState(input);
  }

  function loadState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return normalizeState(JSON.parse(current));
    } catch (error) {
      console.warn("저장 데이터를 불러오지 못했습니다.", error);
    }
    return defaultState();
  }

  function getSharedState() {
    return {
      trip: state.trip,
      stays: state.stays,
      checklist: state.checklist,
      itinerary: state.itinerary,
      participants: state.participants,
      expenses: state.expenses
    };
  }

  function fingerprintSharedState(shared = getSharedState()) {
    return JSON.stringify(shared);
  }

  async function applySharedState(shared) {
    if (!shared || typeof shared !== "object") return;
    const previousLocation = weatherLocationKey();
    state = normalizeState({
      ...state,
      trip: shared.trip || state.trip,
      stays: shared.stays || [],
      checklist: shared.checklist,
      itinerary: shared.itinerary,
      participants: shared.participants,
      expenses: shared.expenses,
      weatherCache: state.weatherCache,
      rateCache: state.rateCache,
      ui: state.ui,
      meta: state.meta
    });
    sharedStateFingerprint = fingerprintSharedState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("공용 데이터를 이 기기에 보관하지 못했습니다.", error);
    }
    renderPage();
    if (previousLocation !== weatherLocationKey()) fetchWeather(false);
  }

  function saveState(notify = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const shared = getSharedState();
      const nextFingerprint = fingerprintSharedState(shared);
      if (nextFingerprint !== sharedStateFingerprint) {
        sharedStateFingerprint = nextFingerprint;
        if (cloudSync?.isReady()) cloudSync.queueReplace(shared);
      }
      if (notify) showToast("저장했습니다");
    } catch (error) {
      console.warn("저장하지 못했습니다.", error);
      showToast("브라우저 저장 공간을 확인해 주세요", true);
    }
  }

  function showToast(message, isError = false) {
    const toast = $("#saveToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1900);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function dateValue(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function daysBetween(from, to) {
    return Math.round((dateValue(to) - dateValue(from)) / 86400000);
  }

  function todayInHongKong() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function bestActiveDate() {
    const today = todayInHongKong();
    if (state.trip.startDate && state.trip.endDate && today >= state.trip.startDate && today <= state.trip.endDate) return today;
    return state.trip.startDate || state.itinerary[0]?.date || "";
  }

  function selectedDay() {
    return tripDays().find((day) => day.date === state.ui.activeDate) || tripDays()[0] || { date: "", day: 0, month: "", number: "", weekday: "", weekdayLong: "ITINERARY" };
  }

  function formatKRW(value) {
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Math.round(value || 0));
  }

  function formatHKDMinor(amountMinor) {
    return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amountMinor / 100);
  }

  function formatExpenseAmount(expense) {
    return expense.currency === "HKD" ? formatHKDMinor(expense.amountMinor) : formatKRW(expense.amountMinor);
  }

  function convertToKRW(amountMinor, rateMicros) {
    if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(rateMicros) || amountMinor <= 0 || rateMicros <= 0) return 0;
    const numerator = BigInt(amountMinor) * BigInt(rateMicros);
    const denominator = 100n * 1_000_000n;
    return Number((numerator + denominator / 2n) / denominator);
  }

  function initials(name) {
    return [...name].slice(0, 2).join("").toUpperCase();
  }

  function personById(id) {
    return state.participants.find((person) => person.id === id);
  }

  function checklistOwnerById(id) {
    return checklistOwners().find((owner) => owner.id === id) || checklistOwners()[0];
  }

  function prepStats(ownerId = null) {
    const items = ownerId ? state.checklist.filter((item) => item.ownerId === ownerId) : state.checklist;
    const total = items.length;
    const done = items.filter((item) => item.done).length;
    return { total, done, remaining: Math.max(0, total - done), percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function updateTripStatus() {
    const { name, startDate, endDate, mapUrl } = state.trip;
    const people = state.participants.filter((person) => person.active);
    const duration = startDate && endDate ? daysBetween(startDate, endDate) : null;
    const range = startDate ? `${startDate.replaceAll("-", ". ")}${endDate ? " — " + endDate.replaceAll("-", ". ") : " 출발"}` : "여행 날짜 미정";
    document.title = name + " · Trip";
    if ($("#heroTripName")) $("#heroTripName").textContent = name + ",";
    if ($("#heroEyebrow")) $("#heroEyebrow").textContent = startDate ? name.toUpperCase() + " · " + startDate.slice(0, 4) : name.toUpperCase();
    if ($("#heroDuration")) $("#heroDuration").textContent = duration === null ? "날짜 미정" : `${duration}박 ${duration + 1}일`;
    if ($("#heroPeople")) $("#heroPeople").textContent = `${people.length}명 · ${people.map((person) => person.name).join(" · ")}`;
    if ($("#tripDateSummary")) $("#tripDateSummary").textContent = range;
    if ($("#tripSettingsName")) $("#tripSettingsName").textContent = name;
    if ($("#tripSettingsSummary")) $("#tripSettingsSummary").textContent = `${range} · ${people.length}명`;
    if ($("#footerTripName")) $("#footerTripName").textContent = name;
    if ($("#footerTripDates")) $("#footerTripDates").textContent = range;
    if ($("#boardingDuration")) $("#boardingDuration").textContent = duration === null ? "DATES TBD" : `${duration + 1} DAYS`;
    $$("[data-shared-map]").forEach((link) => { link.hidden = !mapUrl; link.href = mapUrl || "#"; });
    const label = $("#tripStatusLabel");
    const countdown = $("#tripCountdown");
    const date = $("#tripStatusDate");
    if (!label || !countdown || !date) return;
    const today = todayInHongKong();
    if (!startDate) {
      label.textContent = "여행 준비";
      countdown.textContent = "TBD";
      date.textContent = "날짜를 설정해 주세요";
    } else if (today < startDate) {
      label.textContent = "여행 전";
      countdown.textContent = `D–${daysBetween(today, startDate)}`;
      date.textContent = startDate.replaceAll("-", ". ") + " 출발";
    } else if (!endDate || today <= endDate) {
      const day = daysBetween(startDate, today) + 1;
      label.textContent = `여행 중 · ${day}일차`;
      countdown.textContent = `DAY ${day}`;
      date.textContent = shortDate(today);
    } else {
      label.textContent = "여행 완료";
      countdown.textContent = "+DONE";
      date.textContent = "정산을 확인하세요";
    }
  }

  function renderHome() {
    updateTripStatus();
    const stats = prepStats();
    if ($("#homePrepCount")) $("#homePrepCount").textContent = `${stats.done} / ${stats.total}`;
    if ($("#homePrepBar")) $("#homePrepBar").style.width = `${stats.percent}%`;
    const upcoming = [...state.itinerary].sort((a, b) => `${a.date} ${a.time || "99:99"}`.localeCompare(`${b.date} ${b.time || "99:99"}`))[0];
    const container = $("#homeNextPlan");
    if (container) {
      container.replaceChildren();
      if (!upcoming) {
        container.append(createElement("p", "empty-state", "등록된 일정이 없습니다."));
      } else {
        const time = createElement("time", "", `${upcoming.date.slice(5).replace("-", ".")}\n${upcoming.time || "미정"}`);
        time.dateTime = upcoming.date;
        const copy = createElement("div");
        copy.append(createElement("strong", "", upcoming.title));
        copy.append(createElement("p", "", upcoming.place || upcoming.note || "상세 정보 입력 전"));
        container.append(time, copy);
      }
    }
    renderHomeWeather(cachedWeather());
    renderRate();
  }

  function renderChecklistOwners() {
    const container = $("#checklistOwnerSwitcher");
    if (!container) return;
    const legend = createElement("legend", "visually-hidden", "체크리스트 선택");
    const controls = checklistOwners().map((owner) => {
      const displayOwner = checklistOwnerById(owner.id);
      const stats = prepStats(owner.id);
      const label = createElement("label", "checklist-owner-option");
      const input = createElement("input");
      input.type = "radio";
      input.name = "activeChecklistOwner";
      input.value = owner.id;
      input.id = `checklist-owner-${owner.id}`;
      input.dataset.checkOwner = owner.id;
      input.checked = state.ui.activeChecklistOwner === owner.id;
      input.setAttribute("aria-controls", "beforeChecklist");
      const face = createElement("span", "checklist-owner-face");
      face.append(createElement("b", "", displayOwner.label), createElement("small", "", `${stats.done}/${stats.total}`));
      label.append(input, face);
      return label;
    });
    container.replaceChildren(legend, ...controls);
  }

  function renderChecklist() {
    const container = $("#beforeChecklist");
    if (!container) return;
    container.replaceChildren();
    const ownerItems = state.checklist.filter((item) => item.ownerId === state.ui.activeChecklistOwner);
    checklistCategoriesForOwner(state.ui.activeChecklistOwner).forEach((category) => {
      const categoryItems = ownerItems.filter((item) => item.category === category);
      const isBaggage = category === "위탁 수하물" || category === "기내 수하물";
      const items = categoryItems.filter((item) => !(state.ui.hideCompleted && item.done));
      const group = createElement("section", `check-group${isBaggage ? " is-baggage" : ""}`);
      const heading = createElement("div", "check-group-heading");
      const categoryDone = categoryItems.filter((item) => item.done).length;
      heading.append(
        createElement("h3", "", category),
        createElement("span", "", `${categoryDone}/${categoryItems.length}`)
      );
      group.append(heading);
      const list = createElement("div", "check-list");
      if (!items.length) {
        list.append(createElement("p", "empty-state", categoryItems.length ? "완료 항목을 숨겼습니다." : "아직 항목이 없습니다."));
      } else {
        items.forEach((item) => {
          const row = createElement("div", `check-item${item.done ? " is-done" : ""}`);
          const label = createElement("label");
          const checkbox = createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = item.done;
          checkbox.dataset.checkId = item.id;
          checkbox.setAttribute("aria-label", `${item.text} ${item.done ? "완료 해제" : "완료"}`);
          label.append(checkbox, createElement("span", "check-item-text", item.text));
          const remove = createElement("button", "delete-button", "×");
          remove.type = "button";
          remove.dataset.action = "delete-check";
          remove.dataset.id = item.id;
          remove.setAttribute("aria-label", `${item.text} 삭제`);
          const actions = createElement("div", "check-item-actions");
          if (item.url) {
            const link = createElement(
              "a",
              "check-item-link",
              `${item.linkLabel || (item.category === "예약·티켓" || item.category === "교통·이동" ? "예약" : "열기")} ↗`
            );
            link.href = item.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `${item.text} 링크 열기`);
            actions.append(link);
          }
          actions.append(remove);
          row.append(label, actions);
          list.append(row);
        });
      }
      group.append(list);
      container.append(group);
    });
  }

  function renderChecklistForm() {
    const select = $("#checklistCategory");
    if (!select) return;
    const categories = checklistCategoriesForOwner(state.ui.activeChecklistOwner);
    const previous = select.value;
    select.replaceChildren(...categories.map((category) => {
      const option = createElement("option", "", category);
      option.value = category;
      return option;
    }));
    select.value = categories.includes(previous) ? previous : categories[0];
    const text = $("#checklistText");
    if (text) text.placeholder = state.ui.activeChecklistOwner === "common" ? "예: 피크트램 예매" : "예: 모자 챙기기";
  }

  function renderPrepProgress() {
    const owner = checklistOwnerById(state.ui.activeChecklistOwner);
    const stats = prepStats(owner.id);
    if ($("#prepHeadCount")) $("#prepHeadCount").textContent = `${stats.done} / ${stats.total}`;
    if ($("#prepPercent")) $("#prepPercent").textContent = `${stats.percent}%`;
    if ($("#prepRemaining")) {
      $("#prepRemaining").textContent = stats.total
        ? `${owner.label} · ${stats.remaining ? `${stats.remaining}개 남음` : "완료"}`
        : `${owner.label} · 항목 없음`;
    }
    if ($("#prepProgressRing")) $("#prepProgressRing").style.setProperty("--progress", `${stats.percent}%`);
    const bar = $("#prepProgressBar");
    if (bar) {
      bar.style.width = `${stats.percent}%`;
      const progress = bar.parentElement;
      if (progress) progress.setAttribute("aria-valuenow", String(stats.percent));
    }
    const submit = $("#checklistSubmit");
    if (submit) submit.textContent = `${owner.label}에 추가`;
    const form = $("#checklistForm");
    if (form) form.setAttribute("aria-label", `${owner.label} 체크리스트에 새 항목 추가`);
  }

  function renderPrepare() {
    repairChecklistSelection();
    renderStays();
    if ($("#hideCompleted")) $("#hideCompleted").checked = state.ui.hideCompleted;
    renderChecklistOwners();
    renderChecklistForm();
    renderPrepProgress();
    renderChecklist();
  }

  function renderDaySwitcher() {
    const container = $("#daySwitcher");
    if (!container) return;
    const today = todayInHongKong();
    container.replaceChildren();
    if (!tripDays().length) container.append(createElement("p", "empty-state", "날짜를 설정하면 날짜별 일정이 표시됩니다."));
    tripDays().forEach((day) => {
      const button = createElement("button", `day-tab${day.date === today ? " is-today" : ""}`);
      button.type = "button";
      button.role = "tab";
      button.dataset.date = day.date;
      button.setAttribute("aria-selected", String(day.date === state.ui.activeDate));
      button.setAttribute("aria-controls", "timeline");
      button.setAttribute("aria-label", `${shortDate(day.date)} ${day.weekdayLong}, ${day.day}일차`);
      button.tabIndex = day.date === state.ui.activeDate ? 0 : -1;
      button.append(createElement("strong", "", `${day.month}/${day.number}`), createElement("span", "", day.weekday));
      container.append(button);
    });
  }

  function renderMobileNext(items, day) {
    const card = $("#mobileNextCard");
    if (!card) return;
    if (!items.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const today = todayInHongKong();
    let next = items[0];
    if (day.date === today) {
      const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      next = items.find((item) => !item.time || item.time >= now) || items[items.length - 1];
    }
    if ($("#mobileNextLabel")) $("#mobileNextLabel").textContent = day.date === today ? "NEXT" : `DAY ${day.day}`;
    if ($("#mobileNextTime")) $("#mobileNextTime").textContent = next.time || "미정";
    if ($("#mobileNextTitle")) $("#mobileNextTitle").textContent = next.title;
    if ($("#mobileNextMeta")) $("#mobileNextMeta").textContent = next.place || next.note || "세부 정보 없음";
    const map = $("#mobileNextMap");
    if (map) {
      map.hidden = !next.place;
      if (next.place) map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.place)}`;
    }
  }

  function renderTimeline() {
    const timeline = $("#timeline");
    if (!timeline) return;
    const day = selectedDay();
    if ($("#selectedDayLabel")) $("#selectedDayLabel").textContent = day.date ? `DAY ${day.day}` : "날짜 미정";
    if ($("#selectedDayEnglish")) $("#selectedDayEnglish").textContent = day.weekdayLong;
    if ($("#selectedDayTitle")) $("#selectedDayTitle").textContent = day.date ? `${shortDate(day.date)} · ${day.weekday}요일` : "여행 날짜 미정";
    const items = state.itinerary.filter((item) => item.date === day.date).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    renderMobileNext(items, day);
    timeline.replaceChildren();
    if (!items.length) {
      timeline.append(createElement("p", "empty-state", "등록된 일정이 없습니다."));
      return;
    }
    items.forEach((item) => {
      const row = createElement("article", "timeline-item");
      const time = createElement("time", `timeline-time${item.time ? "" : " is-open"}`, item.time || "미정");
      time.dateTime = item.time ? `${item.date}T${item.time}` : item.date;
      const marker = createElement("span", "timeline-marker");
      const copy = createElement("div", "timeline-copy");
      const titleRow = createElement("div", "timeline-title-row");
      const edit = createElement("button", "timeline-edit-button", "✎");
      edit.type = "button";
      edit.dataset.action = "edit-itinerary";
      edit.dataset.id = item.id;
      edit.setAttribute("aria-haspopup", "dialog");
      edit.setAttribute("aria-label", `${item.title} 수정`);
      titleRow.append(createElement("h3", "", item.title));
      copy.append(titleRow);
      if (item.note) copy.append(createElement("p", "", item.note));
      if (item.place) {
        const map = createElement("a", "", `${item.place} · 지도 ↗`);
        map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place)}`;
        map.target = "_blank";
        map.rel = "noopener noreferrer";
        copy.append(map);
      }
      const remove = createElement("button", "delete-button", "×");
      remove.type = "button";
      remove.dataset.action = "delete-itinerary";
      remove.dataset.id = item.id;
      remove.setAttribute("aria-label", `${item.title} 삭제`);
      const actions = createElement("div", "timeline-row-actions");
      actions.append(edit, remove);
      row.append(time, marker, copy, actions);
      timeline.append(row);
    });
  }

  function stayDates(stay) {
    return `${shortDate(stay.checkInDate)} — ${shortDate(stay.checkOutDate)}`;
  }

  function stayNights(stay) {
    return stay.checkInDate && stay.checkOutDate ? `${daysBetween(stay.checkInDate, stay.checkOutDate)}박` : "날짜 미정";
  }

  function renderStays() {
    const container = $("#stayList");
    if (!container) return;
    container.replaceChildren();
    if (!state.stays.length) { container.append(createElement("p", "empty-state", "등록된 숙소가 없습니다.")); return; }
    [...state.stays].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate)).forEach((stay) => {
      const card = createElement("details", "booking-card stay-booking");
      const summary = createElement("summary", "booking-summary");
      const copy = createElement("span");
      copy.append(createElement("small", "", stayDates(stay)), createElement("strong", "", stay.name), createElement("em", "", `${stayNights(stay)} · ${stay.rooms}실${stay.room ? " · " + stay.room : ""}`));
      summary.append(copy);
      const detail = createElement("div", "booking-detail");
      const facts = createElement("div", "booking-facts is-four");
      [["체크인", `${shortDate(stay.checkInDate)} · ${stay.checkInTime || "시간 미정"}`],
       ["체크아웃", `${shortDate(stay.checkOutDate)} · ${stay.checkOutTime || "시간 미정"}`],
       ["객실", stay.room || "미입력"],
       ["조식", stay.breakfast === "included" ? "포함" : stay.breakfast === "excluded" ? "불포함" : "미입력"]].forEach(([label, value]) => {
        const fact = createElement("span");
        fact.append(createElement("small", "", label), createElement("b", "", value));
        facts.append(fact);
      });
      detail.append(facts);
      if (stay.address) detail.append(createElement("p", "booking-address", stay.address));
      if (stay.note) detail.append(createElement("p", "", stay.note));
      const actions = createElement("div", "inline-actions stay-edit-actions");
      const edit = createElement("button", "secondary-button", "✎ 수정");
      edit.type = "button"; edit.dataset.action = "edit-stay"; edit.dataset.id = stay.id;
      const remove = createElement("button", "danger-button", "삭제");
      remove.type = "button"; remove.dataset.action = "delete-stay"; remove.dataset.id = stay.id;
      const map = createElement("a", "secondary-button", "지도 ↗");
      map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.name + " " + stay.address)}`;
      map.target = "_blank"; map.rel = "noopener noreferrer";
      actions.append(edit, map, remove);
      detail.append(actions);
      card.append(summary, detail);
      container.append(card);
    });
  }

  function renderStayCard() {
    const hotel = $("#activeStayCard");
    const empty = $("#emptyStayCard");
    const stay = state.stays.find((item) => item.checkInDate && state.ui.activeDate >= item.checkInDate && (!item.checkOutDate || state.ui.activeDate <= item.checkOutDate)) || state.stays[0];
    if (hotel) hotel.hidden = !stay;
    if (empty) empty.hidden = Boolean(stay);
    if (!stay) return;
    if ($("#activeStayLabel")) $("#activeStayLabel").textContent = "STAY";
    if ($("#activeStayStatus")) $("#activeStayStatus").textContent = stayNights(stay);
    if ($("#activeStayName")) $("#activeStayName").textContent = stay.name;
    if ($("#activeStayAddress")) $("#activeStayAddress").textContent = stay.address || "주소 미입력";
    if ($("#activeStayDates")) $("#activeStayDates").textContent = stayDates(stay);
    if ($("#activeStayRoom")) $("#activeStayRoom").textContent = `${stay.room || "객실"} · ${stay.rooms}실`;
    if ($("#activeStayCheckIn")) $("#activeStayCheckIn").textContent = stay.checkInTime || "시간 미정";
    if ($("#activeStayCheckOut")) $("#activeStayCheckOut").textContent = stay.checkOutTime || "시간 미정";
    const map = $("#activeStayMap");
    if (map) map.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stay.name + ", " + stay.address)}`;
    const copy = $("#activeStayCopy");
    if (copy) { copy.hidden = !stay.address; copy.dataset.copy = stay.address; }
    const edit = $("#activeStayEdit");
    if (edit) edit.dataset.id = stay.id;
  }

  function openTripSettings() {
    const form = $("#tripSettingsForm");
    if (!form) return;
    form.elements.name.value = state.trip.name;
    form.elements.startDate.value = state.trip.startDate;
    form.elements.endDate.value = state.trip.endDate;
    form.elements.mapUrl.value = state.trip.mapUrl;
    $("#tripSettingsDialog").showModal();
  }

  function openStayDialog(id = "") {
    const form = $("#stayForm");
    if (!form) return;
    form.reset(); delete form.dataset.editingId;
    const stay = state.stays.find((item) => item.id === id);
    $("#stayDialogTitle").textContent = stay ? "숙소 수정" : "숙소 추가";
    if (stay) {
      form.dataset.editingId = stay.id;
      ["name", "address", "checkInDate", "checkOutDate", "checkInTime", "checkOutTime", "room", "rooms", "breakfast", "note"].forEach((key) => { form.elements[key].value = stay[key]; });
    } else {
      form.elements.checkInDate.value = state.trip.startDate;
      form.elements.checkOutDate.value = state.trip.endDate;
    }
    $("#stayDialog").showModal();
  }

  function addParticipant(name) {
    const person = { id: makeId("person"), name, active: true, createdAt: new Date().toISOString() };
    state.participants.push(person);
    state.checklist.push(...personalChecklistSeeds([person]));
  }

  function repairChecklistSelection() {
    if (!checklistOwners().some((owner) => owner.id === state.ui.activeChecklistOwner)) state.ui.activeChecklistOwner = "common";
  }

  function setActiveDate(date, focusTarget = "") {
    if (!isValidDate(date)) return;
    state.ui.activeDate = date;
    state.ui.weatherDate = date;
    state.ui.weatherMode = "trip";
    saveState(false);
    renderDaySwitcher();
    renderTimeline();
    renderStayCard();
    renderTripWeather(cachedWeather());
    const focusSelector = focusTarget === "weather"
      ? `.weather-day[data-date="${date}"]`
      : focusTarget === "day"
        ? `.day-tab[data-date="${date}"]`
        : "";
    if (focusSelector) $(focusSelector)?.focus({ preventScroll: true });
  }

  function renderTrip() {
    renderDaySwitcher();
    renderTimeline();
    renderStayCard();
    renderTripWeather(cachedWeather());
  }

  function weatherInfo(code, isDay = true) {
    const phase = isDay === false || isDay === 0 ? "night" : "day";
    if (code === 0) return { iconName: `clear-${phase}`, kind: "sunny", label: "맑음" };
    if (code === 1) return { iconName: `partly-cloudy-${phase}`, kind: "mostly-clear", label: "대체로 맑음" };
    if (code === 2) return { iconName: `partly-cloudy-${phase}`, kind: "partly-cloudy", label: "구름 조금" };
    if (code === 3) return { iconName: "overcast", kind: "cloudy", label: "흐림" };
    if ([45, 48].includes(code)) return { iconName: "fog", kind: "fog", label: "안개" };
    if ([51, 53, 55].includes(code)) return { iconName: "drizzle", kind: "drizzle", label: "이슬비" };
    if ([56, 57, 66, 67].includes(code)) return { iconName: "sleet", kind: "sleet", label: "진눈깨비" };
    if ([61, 63, 65].includes(code)) return { iconName: "rain", kind: "rain", label: "비" };
    if ([80, 81, 82].includes(code)) return { iconName: `partly-cloudy-${phase}-rain`, kind: "showers", label: "소나기" };
    if ([71, 73, 75, 77].includes(code)) return { iconName: "snow", kind: "snow", label: "눈" };
    if ([85, 86].includes(code)) return { iconName: `partly-cloudy-${phase}-snow`, kind: "snow", label: "눈" };
    if (code === 95) return { iconName: `thunderstorms-${phase}`, kind: "thunder", label: "뇌우" };
    if ([96, 99].includes(code)) return { iconName: `thunderstorms-${phase}-rain`, kind: "thunder", label: "뇌우" };
    return { iconName: "not-available", kind: "unknown", label: "날씨" };
  }

  function createWeatherIcon(info, className, eager = false) {
    const icon = createElement("img", `${className} is-${info.kind}`);
    icon.src = `${WEATHER_ICON_BASE}${info.iconName}.svg`;
    icon.alt = "";
    icon.width = 64;
    icon.height = 64;
    icon.decoding = "async";
    icon.setAttribute("aria-hidden", "true");
    if (!eager) icon.loading = "lazy";
    return icon;
  }

  function renderHomeWeather(data) {
    const text = $("#homeWeather"), detail = $("#homeWeatherDetail");
    if (!text || !detail) return;
    text.textContent = data?.current ? `${weatherValue(data.current.temperature_2m, "°")} · ${weatherInfo(weatherNumber(data.current.weather_code), data.current.is_day).label}` : "확인 전";
    detail.textContent = data?.current ? `체감 ${weatherValue(data.current.apparent_temperature, "°")} · 습도 ${weatherValue(data.current.relative_humidity_2m, "%")}` : "날씨를 불러오세요";
  }

  function renderTripWeather(data, stale = false) {
    const days = $("#weatherDays");
    if (!days) return;
    const location = state.trip.weatherLocation;
    $("#weatherLocationName").textContent = `${location.name} 날씨`;
    const range = $("#weatherRange");
    range.options[0].disabled = !tripDays().length;
    range.value = state.ui.weatherMode === "week" || !tripDays().length ? "week" : "trip";
    const isStale = Boolean(data && (stale || weatherError || Date.now() - new Date(state.weatherCache?.fetchedAt).getTime() > 30 * 60 * 1000));
    $("#currentWeatherKicker").textContent = isStale ? "저장된 날씨" : "오늘 날씨";
    const current = data?.current;
    const info = weatherInfo(weatherNumber(current?.weather_code), current?.is_day);
    $("#currentWeatherIcon").replaceChildren(createWeatherIcon(info, "current-weather-glyph", true));
    $("#currentWeatherIcon").dataset.weatherKind = info.kind;
    $("#currentWeatherText").textContent = current ? `${weatherValue(current.temperature_2m, "°")} · ${info.label}` : weatherError ? "연결을 확인해 주세요" : "날씨 불러오는 중";
    $("#currentWeatherDetail").textContent = current ? `체감 ${weatherValue(current.apparent_temperature, "°")} · 습도 ${weatherValue(current.relative_humidity_2m, "%")} · 바람 ${weatherValue(current.wind_speed_10m, "km/h")}` : `${location.name} · 새로고침으로 다시 시도할 수 있어요`;
    days.replaceChildren();
    const daily = data?.daily, today = todayAtWeatherLocation(), selected = selectedWeatherDate();
    weatherDates().forEach((date) => {
      const index = daily?.time?.indexOf(date) ?? -1;
      const max = weatherNumber(daily?.temperature_2m_max?.[index]);
      const min = weatherNumber(daily?.temperature_2m_min?.[index]);
      const code = weatherNumber(daily?.weather_code?.[index]);
      const card = createElement("button", `weather-day${date === selected ? " is-selected" : ""}`);
      card.type = "button"; card.dataset.date = date;
      card.setAttribute("aria-pressed", String(date === selected));
      const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
      const time = createElement("time", "", `${Number(date.slice(5, 7))}/${Number(date.slice(8))} ${weekday}`);
      time.dateTime = date; card.append(time);
      if ([max, min, code].every(Number.isFinite)) {
        const dailyInfo = weatherInfo(code);
        card.append(createWeatherIcon(dailyInfo, "weather-day-icon"), createElement("strong", "", `${Math.round(max)}°/${Math.round(min)}°`), createElement("small", "weather-day-condition", dailyInfo.label), createElement("small", "weather-day-rain", `강수 ${weatherValue(daily?.precipitation_probability_max?.[index], "%")}`));
        card.setAttribute("aria-label", `${shortDate(date)} ${weekday}요일 날씨, ${dailyInfo.label}, 최고 ${Math.round(max)}도, 최저 ${Math.round(min)}도, 강수확률 ${weatherValue(daily?.precipitation_probability_max?.[index], "%")}`);
      } else {
        const label = date < today ? "지난 날짜" : data ? "예보 전" : weatherError ? "연결 실패" : "확인 중";
        card.append(createWeatherIcon(weatherInfo(NaN), "weather-day-icon"), createElement("strong", "", label), createElement("small", "weather-day-condition", date < today ? "과거 예보 미제공" : data ? "제공 범위 밖" : "새로고침"));
        card.setAttribute("aria-label", `${shortDate(date)} ${weekday}요일, ${label}`);
      }
      days.append(card);
    });
    renderHourlyWeather(data);
    const updated = $("#weatherUpdated");
    updated.replaceChildren();
    const refreshed = data && state.weatherCache?.fetchedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: location.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.weatherCache.fetchedAt)) : "";
    updated.append(document.createTextNode(weatherError ? `${data ? "저장된 예보 표시 · " : ""}업데이트 실패 · 새로고침을 눌러 주세요. ` : refreshed ? `${isStale ? "저장된 예보" : "업데이트"} ${refreshed} · ` : "날씨 불러오는 중 · "));
    const source = createElement("a", "", "Open-Meteo");
    source.href = "https://open-meteo.com/"; source.target = "_blank"; source.rel = "noopener noreferrer";
    updated.append(source, document.createTextNode(` · ${location.name} 현지 시간 · 최대 16일 예보`));
    if (window.matchMedia("(max-width: 760px)").matches) window.requestAnimationFrame(() => {
      const card = $(".weather-day.is-selected", days);
      if (card) days.scrollTo({ left: Math.max(0, card.offsetLeft - (days.clientWidth - card.clientWidth) / 2), behavior: "auto" });
    });
  }

  function renderHourlyWeather(data) {
    const container = $("#hourlyWeather"), title = $("#hourlyWeatherTitle");
    if (!container || !title) return;
    const date = selectedWeatherDate(), hourly = data?.hourly;
    title.textContent = `시간별 · ${shortDate(date)}`;
    container.replaceChildren();
    const indexes = [];
    (hourly?.time || []).forEach((stamp, index) => {
      if (typeof stamp === "string" && stamp.startsWith(date + "T") && /T(?:[01][0-9]|2[0-3]):00$/.test(stamp)) indexes.push(index);
    });
    if (!indexes.length) {
      const empty = createElement("div", "hourly-weather-empty");
      empty.append(createElement("strong", "", weatherError && !data ? "날씨를 불러오지 못했어요" : !data ? "예보 불러오는 중" : date < todayAtWeatherLocation() ? "지난 날짜의 예보는 제공하지 않습니다" : "시간별 예보 제공 전"),
        createElement("span", "", !data ? "인터넷 연결을 확인하고 새로고침해 주세요" : "앞으로 7일을 선택하면 현재 제공되는 예보를 볼 수 있어요"));
      container.append(empty); return;
    }
    indexes.forEach((index) => {
      const stamp = hourly.time[index], temp = weatherNumber(hourly.temperature_2m?.[index]);
      const info = weatherInfo(weatherNumber(hourly.weather_code?.[index]), hourly.is_day?.[index]);
      const timeText = stamp.slice(11, 16), rain = weatherValue(hourly.precipitation_probability?.[index], "%");
      const card = createElement("article", "hourly-weather-item");
      const time = createElement("time", "", timeText); time.dateTime = stamp;
      const detail = createElement("small", "hourly-weather-detail");
      detail.append(createElement("span", "hourly-weather-condition", info.label), createElement("span", "hourly-weather-rain", `강수 ${rain}`));
      card.setAttribute("aria-label", `${timeText}, ${info.label}, ${Number.isFinite(temp) ? Math.round(temp) + "도" : "기온 정보 없음"}, 강수확률 ${rain}`);
      card.title = `체감 ${weatherValue(hourly.apparent_temperature?.[index], "°")}`;
      card.append(time, createWeatherIcon(info, "hourly-weather-icon"), createElement("strong", "", weatherValue(temp, "°")), detail);
      container.append(card);
    });
  }

  function openWeatherLocation() {
    $("#weatherLocationForm").elements.query.value = state.trip.weatherLocation.name;
    $("#weatherLocationResults").replaceChildren();
    $("#weatherLocationStatus").textContent = "도시 이름을 검색하고 지역을 선택해 주세요. 예: 도쿄, Tokyo";
    locationResults = [];
    $("#weatherLocationDialog").showModal();
  }

  async function searchWeatherLocations() {
    const query = cleanText($("#weatherLocationForm").elements.query.value, 80);
    if (query.length < 2) { $("#weatherLocationStatus").textContent = "도시 이름을 두 글자 이상 입력해 주세요"; return; }
    locationSearchRequest?.abort();
    const controller = new AbortController();
    locationSearchRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    $("#weatherLocationSearch").disabled = true;
    $("#weatherLocationResults").replaceChildren(); locationResults = [];
    $("#weatherLocationStatus").textContent = "도시 찾는 중…";
    try {
      const response = await fetch(`${GEOCODING_API}?${new URLSearchParams({ name: query, count: "6", language: "ko", format: "json" })}`, { signal: controller.signal });
      if (!response.ok) throw new Error("City search failed");
      const data = await response.json();
      if (locationSearchRequest !== controller || !$("#weatherLocationDialog").open) return;
      locationResults = (data.results || []).map(sanitizeWeatherLocation).filter(Boolean);
      locationResults.forEach((location, index) => {
        const button = createElement("button", "weather-location-result");
        button.type = "button"; button.dataset.action = "select-weather-location"; button.dataset.index = index;
        button.append(createElement("strong", "", location.name), createElement("small", "", [...new Set([location.admin1, location.country].filter(Boolean))].join(" · ") || `${location.timezone.replaceAll("_", " ")} · ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`));
        $("#weatherLocationResults").append(button);
      });
      $("#weatherLocationStatus").textContent = locationResults.length ? "날씨를 볼 지역을 선택해 주세요" : "검색 결과가 없어요. 영문 도시 이름으로도 검색해 보세요.";
    } catch (error) {
      if (locationSearchRequest === controller && $("#weatherLocationDialog").open) $("#weatherLocationStatus").textContent = "도시를 불러오지 못했어요. 연결을 확인하고 다시 검색해 주세요.";
    } finally {
      clearTimeout(timeout);
      if (locationSearchRequest === controller) { locationSearchRequest = null; $("#weatherLocationSearch").disabled = false; }
    }
  }

  function selectWeatherLocation(index) {
    const location = locationResults[index];
    if (!location) return;
    const trip = { ...state.trip, weatherLocation: location };
    if (JSON.stringify(trip).length > 1000) { showToast("여행 설정의 지도 링크를 더 짧게 입력해 주세요", true); return; }
    state.trip = trip;
    state.ui.weatherDate = "";
    weatherError = "";
    saveState(false);
    closeDialog("#weatherLocationDialog");
    renderHomeWeather(cachedWeather()); renderTripWeather(cachedWeather());
    fetchWeather(false);
    showToast(`${location.name} 날씨로 변경했습니다`);
  }

  async function fetchWeather(force = false) {
    const key = weatherLocationKey();
    if (weatherRequest?.key === key && !force) return weatherRequest.promise;
    weatherRequest?.controller.abort();
    const data = cachedWeather();
    const age = data ? Date.now() - new Date(state.weatherCache.fetchedAt).getTime() : Infinity;
    if (!force && data?.hourly?.is_day && age >= 0 && age < 30 * 60 * 1000 && (!data.current?.time || data.current.time.slice(0, 10) === todayAtWeatherLocation())) {
      weatherError = ""; renderHomeWeather(data); renderTripWeather(data); return;
    }
    const request = { key, controller: new AbortController(), promise: null };
    weatherRequest = request;
    weatherError = "";
    const timeout = setTimeout(() => request.controller.abort(), 15000);
    $$('[data-action="refresh-weather"]').forEach((button) => { button.disabled = true; });
    renderTripWeather(data);
    const location = state.trip.weatherLocation;
    const query = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, timezone: location.timezone, forecast_days: "16", current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max", hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day" });
    request.promise = (async () => {
      try {
        const response = await fetch(`${WEATHER_API}?${query}`, { headers: { Accept: "application/json" }, signal: request.controller.signal });
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        const next = await response.json();
        if (!next?.current || !Array.isArray(next?.daily?.time) || !Array.isArray(next?.hourly?.time)) throw new Error("Invalid weather response");
        if (weatherRequest !== request || weatherLocationKey() !== key) return;
        state.weatherCache = { data: next, locationKey: key, fetchedAt: new Date().toISOString() };
        weatherError = ""; saveState(false);
        renderHomeWeather(next); renderTripWeather(next);
        if (force) showToast("날씨를 업데이트했습니다");
      } catch (error) {
        if (weatherRequest !== request || weatherLocationKey() !== key) return;
        weatherError = "날씨 업데이트 실패";
        console.warn("날씨를 불러오지 못했습니다.", error);
        renderHomeWeather(cachedWeather()); renderTripWeather(cachedWeather(), true);
        if (force) showToast("날씨를 불러오지 못했습니다", true);
      } finally {
        clearTimeout(timeout);
        if (weatherRequest === request) {
          weatherRequest = null;
          $$('[data-action="refresh-weather"]').forEach((button) => { button.disabled = false; });
        }
      }
    })();
    return request.promise;
  }

  function currentRate() {
    return state.rateCache && Number(state.rateCache.rate) > 0 ? Number(state.rateCache.rate) : 0;
  }

  function applyConverterDirection(shouldFocus = false) {
    const converter = $(".converter");
    const hkd = $("#hkdInput");
    const krw = $("#krwInput");
    const swap = $('[data-action="swap-currency"]');
    if (!converter || !hkd || !krw || !swap) return;

    const sourceIsHKD = converterSource === "HKD";
    const sourceInput = sourceIsHKD ? hkd : krw;
    const targetInput = sourceIsHKD ? krw : hkd;
    const sourceLabel = sourceInput.closest("label");
    const targetLabel = targetInput.closest("label");
    const sourceName = sourceIsHKD ? "홍콩달러" : "원화";
    const targetName = sourceIsHKD ? "원화" : "홍콩달러";
    if (!sourceLabel || !targetLabel) return;

    converter.dataset.source = converterSource;
    sourceLabel.classList.add("is-source");
    sourceLabel.classList.remove("is-target");
    targetLabel.classList.add("is-target");
    targetLabel.classList.remove("is-source");
    sourceLabel.querySelector(".converter-role").textContent = "입력";
    targetLabel.querySelector(".converter-role").textContent = "결과";
    sourceInput.readOnly = false;
    targetInput.readOnly = true;
    sourceInput.setAttribute("aria-label", `${sourceName} 입력 금액`);
    targetInput.setAttribute("aria-label", `${targetName} 환산 결과`);
    swap.setAttribute("aria-label", `${targetName} 입력으로 바꾸기`);

    // Move the actual fields so visual, keyboard and screen-reader order all match.
    converter.replaceChildren(sourceLabel, swap, targetLabel);
    if (shouldFocus) {
      sourceInput.focus({ preventScroll: true });
      sourceInput.select();
    }
  }

  function renderRate() {
    const rate = currentRate();
    if ($("#homeRate")) $("#homeRate").textContent = rate ? `₩${rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}` : "확인 전";
    if ($("#homeRateDate")) $("#homeRateDate").textContent = state.rateCache ? `${state.rateCache.date} 기준 · 1 HKD` : "HKD → KRW";
    if ($("#rateDisplay")) $("#rateDisplay").textContent = rate ? `₩${rate.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "확인 전";
    if ($("#rateDate")) $("#rateDate").textContent = state.rateCache ? `${state.rateCache.date} 기준 · Frankfurter` : "Frankfurter";
    if ($("#expenseRateNote")) $("#expenseRateNote").textContent = rate ? `1 HKD = ₩${rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} 환율로 저장합니다.` : "HKD 지출을 저장하려면 환율 연결이 필요합니다.";
    applyConverterDirection();
    syncConverter(converterSource);
  }

  function syncConverter(source) {
    const hkd = $("#hkdInput");
    const krw = $("#krwInput");
    const rate = currentRate();
    if (!hkd || !krw) return;
    const sourceInput = source === "KRW" ? krw : hkd;
    const targetInput = source === "KRW" ? hkd : krw;
    const rawValue = sourceInput.value.trim();
    if (!rate || rawValue === "") {
      targetInput.value = "";
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      targetInput.value = "";
      return;
    }
    if (source === "KRW") {
      hkd.value = (value / rate).toFixed(2);
    } else {
      krw.value = String(Math.round(value * rate));
    }
  }

  async function fetchRate(force = false) {
    if (rateRequest) return rateRequest;
    const age = state.rateCache ? Date.now() - new Date(state.rateCache.fetchedAt).getTime() : Infinity;
    if (!force && state.rateCache && age < 4 * 60 * 60 * 1000) {
      renderRate();
      return;
    }
    $$('[data-action="refresh-rate"]').forEach((button) => { button.disabled = true; });
    rateRequest = fetch(RATE_URL, { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Rate HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const rate = Number(data.rate);
        if (!Number.isFinite(rate) || rate <= 0 || data.base !== "HKD" || data.quote !== "KRW") throw new Error("Invalid rate response");
        state.rateCache = { rate, date: cleanText(data.date, 20), fetchedAt: new Date().toISOString() };
        let repaired = false;
        state.expenses.forEach((expense) => {
          if (expense.currency === "HKD" && (!expense.fxRateMicros || !expense.baseAmountKRW)) {
            expense.fxRateMicros = Math.round(rate * 1_000_000);
            expense.baseAmountKRW = convertToKRW(expense.amountMinor, expense.fxRateMicros);
            repaired = true;
          }
        });
        saveState(false);
        renderRate();
        if (repaired && (PAGE === "settle" || PAGE === "all")) renderSettlement();
        if (force) showToast("환율을 업데이트했습니다");
      })
      .catch((error) => {
        console.warn("환율을 불러오지 못했습니다.", error);
        renderRate();
        if (force) showToast("환율을 불러오지 못했습니다", true);
      })
      .finally(() => {
        $$('[data-action="refresh-rate"]').forEach((button) => { button.disabled = false; });
        rateRequest = null;
      });
    return rateRequest;
  }

  function allocateEqual(total, participantIds) {
    const unit = Math.floor(total / participantIds.length);
    const remainder = total % participantIds.length;
    return participantIds.map((id, index) => ({ id, amount: unit + (index < remainder ? 1 : 0) }));
  }

  function calculateBalances() {
    const balances = new Map(state.participants.map((person) => [person.id, 0]));
    state.expenses.forEach((expense) => {
      if (!expense.baseAmountKRW || !expense.split.participantIds.length) return;
      balances.set(expense.payerId, (balances.get(expense.payerId) || 0) + expense.baseAmountKRW);
      allocateEqual(expense.baseAmountKRW, expense.split.participantIds).forEach((share) => {
        balances.set(share.id, (balances.get(share.id) || 0) - share.amount);
      });
    });
    return balances;
  }

  function calculateTransfers(balances) {
    const debtors = [...balances.entries()].filter(([, amount]) => amount < 0).map(([id, amount]) => ({ id, amount: -amount })).sort((a, b) => b.amount - a.amount);
    const creditors = [...balances.entries()].filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
    const transfers = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
      if (amount > 0) transfers.push({ from: debtors[debtorIndex].id, to: creditors[creditorIndex].id, amount });
      debtors[debtorIndex].amount -= amount;
      creditors[creditorIndex].amount -= amount;
      if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
      if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
    }
    return transfers;
  }

  function renderParticipants() {
    const container = $("#peopleList");
    if (!container) return;
    container.replaceChildren();
    state.participants.forEach((person) => {
      const pill = createElement("span", `person-pill${person.active ? "" : " is-inactive"}`);
      pill.setAttribute("role", "listitem");
      pill.append(createElement("span", "", person.active ? person.name : `${person.name} · 정산 제외`));
      if (person.active) {
        const remove = createElement("button", "", "×");
        remove.type = "button";
        remove.dataset.action = "remove-person";
        remove.dataset.id = person.id;
        remove.setAttribute("aria-label", `${person.name} 참가자에서 제외`);
        pill.append(remove);
      }
      container.append(pill);
    });
    if ($("#peopleCount")) $("#peopleCount").textContent = `${state.participants.filter((person) => person.active).length}명`;
    renderCloudParticipantOptions();
  }

  function renderCloudParticipantOptions() {
    const select = $("#cloudPersonName");
    if (!select) return;
    const previous = select.value;
    const placeholder = createElement("option", "", "선택");
    placeholder.value = "";
    const options = state.participants.filter((person) => person.active).map((person) => {
      const option = createElement("option", "", person.name);
      option.value = person.name;
      return option;
    });
    select.replaceChildren(placeholder, ...options);
    if (options.some((option) => option.value === previous)) select.value = previous;
  }

  function renderParticipantEditor() {
    const list = $("#participantEditList");
    if (!list) return;
    list.replaceChildren();
    state.participants.forEach((person, index) => {
      const row = createElement("div", `participant-edit-row${person.active ? "" : " is-inactive"}`);
      row.dataset.id = person.id;

      const nameLabel = createElement("label", "participant-name-field");
      nameLabel.append(createElement("span", "", `참가자 ${index + 1}`));
      const input = createElement("input");
      input.type = "text";
      input.name = "participantName";
      input.value = person.name;
      input.maxLength = 30;
      input.autocomplete = "off";
      input.required = true;
      input.dataset.participantId = person.id;
      input.setAttribute("aria-label", `참가자 ${index + 1} 이름`);
      nameLabel.append(input);

      const activeLabel = createElement("label", "participant-active-field");
      const checkbox = createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "participantActive";
      checkbox.value = person.id;
      checkbox.checked = person.active;
      checkbox.setAttribute("aria-label", `${person.name} 여행 참가`);
      activeLabel.append(checkbox, createElement("span", "", "여행 참가"));
      row.append(nameLabel, activeLabel);
      list.append(row);
    });
  }

  function renderExpensePeople() {
    const payer = $("#expensePayer");
    const split = $("#splitPeople");
    if (!payer || !split) return;
    const active = state.participants.filter((person) => person.active);
    payer.replaceChildren();
    split.replaceChildren();
    active.forEach((person) => {
      const option = createElement("option", "", person.name);
      option.value = person.id;
      payer.append(option);
      const label = createElement("label", "split-person");
      const checkbox = createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "splitWith";
      checkbox.value = person.id;
      checkbox.checked = true;
      label.append(checkbox, createElement("span", "", person.name));
      split.append(label);
    });
  }

  function renderTransfers(balances, transfers) {
    const transferList = $("#transferList");
    const balanceList = $("#balanceList");
    if (!transferList || !balanceList) return;
    transferList.replaceChildren();
    balanceList.replaceChildren();
    if (!transfers.length) {
      transferList.append(createElement("p", "empty-state", state.expenses.length ? "현재 정산이 맞습니다." : "지출을 추가하면 송금액이 표시됩니다."));
    } else {
      transfers.forEach((transfer) => {
        const from = personById(transfer.from);
        const to = personById(transfer.to);
        if (!from || !to) return;
        const row = createElement("div", "transfer-row");
        const fromBox = createElement("div", "transfer-person");
        fromBox.append(createElement("span", "person-avatar", initials(from.name)), createElement("span", "", from.name));
        const toBox = createElement("div", "transfer-person");
        toBox.append(createElement("span", "person-avatar", initials(to.name)), createElement("span", "", to.name));
        row.append(fromBox, createElement("span", "transfer-arrow", "→"), toBox, createElement("strong", "", formatKRW(transfer.amount)));
        transferList.append(row);
      });
    }
    const referencedIds = new Set();
    state.expenses.forEach((expense) => {
      referencedIds.add(expense.payerId);
      expense.split.participantIds.forEach((id) => referencedIds.add(id));
    });
    state.participants.filter((person) => person.active || referencedIds.has(person.id)).forEach((person) => {
      const amount = balances.get(person.id) || 0;
      const chip = createElement("span", "balance-chip");
      chip.append(createElement("span", "", person.name), createElement("b", "", amount > 0 ? `+${formatKRW(amount)}` : formatKRW(amount)));
      balanceList.append(chip);
    });
  }

  function clearThumbUrls() {
    thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    thumbUrls.clear();
  }

  async function renderExpenseList() {
    const container = $("#expenseList");
    if (!container) return;
    clearThumbUrls();
    container.replaceChildren();
    const filter = $("#expenseFilter")?.value || "all";
    const items = state.expenses.filter((expense) => filter === "all" || expense.currency === filter).sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));
    if (!items.length) {
      container.append(createElement("p", "empty-state", state.expenses.length ? "선택한 통화의 지출이 없습니다." : "아직 등록된 지출이 없습니다."));
      return;
    }
    items.forEach((expense) => {
      const row = createElement("article", "expense-row");
      const date = createElement("time", "expense-date", expense.date.slice(5).replace("-", "."));
      date.dateTime = expense.date;
      const copy = createElement("div", "expense-copy");
      const top = createElement("div");
      top.append(createElement("span", "expense-category", expense.category));
      copy.append(top, createElement("strong", "", expense.description));
      const payer = personById(expense.payerId);
      copy.append(createElement("small", "", `${payer ? payer.name : "알 수 없음"} 결제 · ${expense.split.participantIds.length}명 분담`));
      const amount = createElement("div", "expense-amount");
      amount.append(createElement("strong", "", formatExpenseAmount(expense)));
      if (expense.currency === "HKD") amount.append(createElement("small", "", `약 ${formatKRW(expense.baseAmountKRW)}`));
      const tools = createElement("div", "expense-tools");
      if (expense.receiptId) {
        const receipt = createElement("button", "receipt-thumb", "▣");
        receipt.type = "button";
        receipt.dataset.action = "view-receipt";
        receipt.dataset.id = expense.id;
        receipt.setAttribute("aria-label", `${expense.description} 영수증 보기`);
        tools.append(receipt);
        getAvailableReceipt(expense.id).then((record) => {
          if (!record || !record.blob || !receipt.isConnected) return;
          const url = URL.createObjectURL(record.blob);
          thumbUrls.add(url);
          const image = createElement("img");
          image.src = url;
          image.alt = "";
          receipt.replaceChildren(image);
        }).catch(() => {});
      }
      const remove = createElement("button", "delete-button", "×");
      remove.type = "button";
      remove.dataset.action = "delete-expense";
      remove.dataset.id = expense.id;
      remove.setAttribute("aria-label", `${expense.description} 삭제`);
      tools.append(remove);
      row.append(date, copy, amount, tools);
      container.append(row);
    });
  }

  function renderSettlement() {
    renderParticipants();
    const balances = calculateBalances();
    const transfers = calculateTransfers(balances);
    const totalKRW = state.expenses.reduce((sum, expense) => sum + expense.baseAmountKRW, 0);
    const totalHKDMinor = state.expenses.filter((expense) => expense.currency === "HKD").reduce((sum, expense) => sum + expense.amountMinor, 0);
    if ($("#totalExpenseKRW")) $("#totalExpenseKRW").textContent = formatKRW(totalKRW);
    if ($("#totalExpenseHKD")) $("#totalExpenseHKD").textContent = formatHKDMinor(totalHKDMinor);
    if ($("#expenseCount")) $("#expenseCount").textContent = `${state.expenses.length}건`;
    if ($("#receiptCount")) $("#receiptCount").textContent = `영수증 ${state.expenses.filter((expense) => expense.receiptId).length}장`;
    if ($("#transferCount")) $("#transferCount").textContent = `${transfers.length}건`;
    if ($("#settlementHeadline")) $("#settlementHeadline").textContent = transfers.length ? `송금 ${transfers.length}건 필요` : "정산할 금액 없음";
    if ($("#settlementSubline")) $("#settlementSubline").textContent = state.expenses.length ? `새 지출 ${state.participants.filter((person) => person.active).length}명 기준` : "지출을 추가해 주세요";
    renderTransfers(balances, transfers);
    renderExpenseList();
    renderRate();
  }

  function renderPage() {
    if (PAGE === "home") renderHome();
    if (PAGE === "prepare") renderPrepare();
    if (PAGE === "trip") renderTrip();
    if (PAGE === "settle") renderSettlement();
    if (PAGE === "all") {
      renderHome();
      renderPrepare();
      renderTrip();
      renderSettlement();
    }
  }

  function sectionFromHash() {
    const section = window.location.hash.replace(/^#/, "");
    if (SECTIONS.has(section)) return section;
    const today = todayInHongKong();
    if (!state.trip.startDate || today < state.trip.startDate) return "prepare";
    if (state.trip.endDate && today > state.trip.endDate) return "settle";
    return "trip";
  }

  function activateSection(section, updateHash = false, scrollToTabs = false) {
    const next = SECTIONS.has(section) ? section : "prepare";
    $$(".phase-panel[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== next;
    });
    $$(".phase-tab[data-section], .mobile-phase-nav [data-section]").forEach((button) => {
      const active = button.dataset.section === next;
      button.setAttribute("aria-selected", String(active));
      if (button.classList.contains("phase-tab")) button.tabIndex = active ? 0 : -1;
      if (button.closest(".mobile-phase-nav")) {
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    });
    document.body.dataset.activeSection = next;
    if (updateHash) history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
    if (scrollToTabs) {
      const isMobile = window.matchMedia("(max-width: 760px)").matches;
      const target = isMobile ? $(`.phase-panel[data-panel="${next}"]`) : $(".phase-switcher");
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      if (target) window.requestAnimationFrame(() => target.scrollIntoView({ behavior, block: "start" }));
    }
  }

  function updateItineraryDialogDate(date) {
    if ($("#itineraryDialogDate")) $("#itineraryDialogDate").textContent = isValidDate(date) ? shortDate(date) : "날짜 선택";
  }

  function openItineraryDialog(prefill = null, itineraryId = "") {
    const dialog = $("#itineraryDialog");
    const form = $("#itineraryForm");
    if (!dialog || !form) return;
    form.reset();
    delete form.dataset.editingId;
    const editingItem = itineraryId ? state.itinerary.find((item) => item.id === itineraryId) : null;
    const date = editingItem?.date || state.ui.activeDate;
    $("#itineraryDate").value = date;
    if (editingItem) {
      form.dataset.editingId = editingItem.id;
      form.elements.time.value = editingItem.time;
      $("#itineraryTitle").value = editingItem.title;
      $("#itineraryPlace").value = editingItem.place;
      form.elements.note.value = editingItem.note;
    } else if (prefill) {
      $("#itineraryTitle").value = prefill.description;
      $("#itineraryPlace").value = prefill.name;
    }
    if ($("#itineraryDialogMode")) $("#itineraryDialogMode").textContent = editingItem ? "일정 수정" : "일정 추가";
    if ($("#itinerarySubmit")) $("#itinerarySubmit").textContent = editingItem ? "수정 저장" : "저장";
    updateItineraryDialogDate(date);
    dialog.showModal();
    window.setTimeout(() => $("#itineraryTitle")?.focus(), 50);
  }

  function closeDialog(selector) {
    const dialog = $(selector);
    if (dialog && dialog.open) dialog.close();
  }

  function openParticipantDialog() {
    const dialog = $("#participantDialog");
    if (!dialog) return;
    $("#participantEditForm").elements.newName.value = "";
    renderParticipantEditor();
    dialog.showModal();
    window.setTimeout(() => $("[data-participant-id]", dialog)?.focus(), 50);
  }

  function saveParticipantEdits(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = $$('[data-participant-id]', form);
    const updates = [];
    const names = new Set();

    for (const input of inputs) {
      input.setCustomValidity("");
      const name = cleanText(input.value, 30);
      const normalizedName = name.toLocaleLowerCase();
      if (!name) {
        input.setCustomValidity("이름을 입력해 주세요.");
        input.reportValidity();
        return;
      }
      if (names.has(normalizedName)) {
        input.setCustomValidity("같은 이름의 참가자가 있습니다.");
        input.reportValidity();
        return;
      }
      names.add(normalizedName);
      updates.push({ id: input.dataset.participantId, name });
    }

    const newName = cleanText(form.elements.newName.value, 30);
    if (newName && names.has(newName.toLocaleLowerCase())) { showToast("같은 이름의 참가자가 있습니다", true); return; }
    const activeIds = new Set(new FormData(form).getAll("participantActive"));
    if (!activeIds.size && !newName) {
      showToast("정산 참가자는 한 명 이상 필요합니다", true);
      $("[name='participantActive']", form)?.focus();
      return;
    }

    updates.forEach((update) => {
      const person = personById(update.id);
      if (!person) return;
      person.name = update.name;
      person.active = activeIds.has(person.id);
    });
    if (newName) addParticipant(newName);
    form.elements.newName.value = "";
    repairChecklistSelection();
    saveState(false);
    closeDialog("#participantDialog");
    renderPage();
    showToast("참가자를 수정했습니다");
  }

  function openExpenseDialog() {
    const dialog = $("#expenseDialog");
    const form = $("#expenseForm");
    if (!dialog || !form) return;
    const active = state.participants.filter((person) => person.active);
    if (!active.length) {
      showToast("참가자를 먼저 추가해 주세요", true);
      return;
    }
    form.reset();
    clearPendingReceipt();
    renderExpensePeople();
    $("#expenseDate").value = state.ui.activeDate || todayInHongKong();
    $("#expenseCurrency").value = "HKD";
    renderRate();
    dialog.showModal();
    window.setTimeout(() => $("#expenseDescription")?.focus(), 50);
  }

  function clearPendingReceipt() {
    pendingReceiptFile = null;
    if (pendingReceiptUrl) URL.revokeObjectURL(pendingReceiptUrl);
    pendingReceiptUrl = "";
    const preview = $("#receiptPreview");
    if (preview) {
      preview.replaceChildren(createElement("span", "", "＋"), createElement("p", "", "사진 촬영 또는 파일 선택"));
    }
    if ($("#receiptInput")) $("#receiptInput").value = "";
  }

  function previewReceipt(file) {
    clearPendingReceipt();
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("JPG, PNG, WebP 이미지만 첨부할 수 있습니다", true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("8MB 이하 이미지를 선택해 주세요", true);
      return;
    }
    pendingReceiptFile = file;
    pendingReceiptUrl = URL.createObjectURL(file);
    const preview = $("#receiptPreview");
    if (!preview) return;
    const image = createElement("img");
    image.src = pendingReceiptUrl;
    image.alt = "선택한 영수증 미리보기";
    const copy = createElement("div");
    copy.append(createElement("strong", "", file.name.slice(0, 60)), createElement("small", "", `${(file.size / 1024 / 1024).toFixed(1)}MB · 저장 시 자동 축소`));
    preview.replaceChildren(image, copy);
  }

  async function loadImageSource(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file);
      } catch (error) {
        console.info("이미지 비트맵 변환을 사용할 수 없어 일반 이미지 방식으로 전환합니다.", error);
      }
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressReceipt(file) {
    const source = await loadImageSource(file);
    const width = source.width;
    const height = source.height;
    if (!width || !height) throw new Error("이미지를 읽을 수 없습니다.");
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (typeof source.close === "function") source.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .8));
    if (!blob) throw new Error("이미지를 압축하지 못했습니다.");
    return blob;
  }

  function openReceiptDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "expenseId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("DB open failed"));
    });
  }

  async function withReceiptStore(mode, operation) {
    const db = await openReceiptDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode);
      const store = transaction.objectStore(DB_STORE);
      let result;
      try { result = operation(store); } catch (error) { db.close(); reject(error); return; }
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("DB transaction failed")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("DB transaction aborted")); };
    });
  }

  async function putReceipt(expenseId, blob, name = "receipt.jpg") {
    return withReceiptStore("readwrite", (store) => store.put({ expenseId, blob, name: cleanText(name, 100) || "receipt.jpg", type: blob.type, updatedAt: new Date().toISOString() }));
  }

  async function getReceipt(expenseId) {
    const db = await openReceiptDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(expenseId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Receipt read failed"));
      transaction.oncomplete = () => db.close();
    });
  }

  async function getAvailableReceipt(expenseId) {
    const local = await getReceipt(expenseId).catch(() => null);
    if (local?.blob || !cloudSync?.isReady()) return local;
    const remote = await cloudSync.downloadReceipt(expenseId).catch((error) => {
      console.warn("공용 영수증을 내려받지 못했습니다.", error);
      return null;
    });
    if (!remote?.blob) return null;
    await putReceipt(expenseId, remote.blob, remote.name || "receipt.jpg").catch(() => {});
    return remote;
  }

  async function deleteReceipt(expenseId) {
    return withReceiptStore("readwrite", (store) => store.delete(expenseId));
  }

  async function getAllReceipts() {
    const db = await openReceiptDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("Receipt list failed"));
      transaction.oncomplete = () => db.close();
    });
  }

  async function clearReceipts() {
    return withReceiptStore("readwrite", (store) => store.clear());
  }

  async function showReceipt(expenseId) {
    try {
      const record = await getAvailableReceipt(expenseId);
      if (!record || !record.blob) {
        showToast("저장된 영수증을 찾지 못했습니다", true);
        return;
      }
      if (receiptDialogUrl) URL.revokeObjectURL(receiptDialogUrl);
      receiptDialogUrl = URL.createObjectURL(record.blob);
      $("#receiptFullImage").src = receiptDialogUrl;
      $("#receiptCaption").textContent = record.name || "영수증";
      $("#receiptDialog").showModal();
    } catch (error) {
      console.warn("영수증을 열지 못했습니다.", error);
      showToast("영수증을 열지 못했습니다", true);
    }
  }

  function closeReceipt() {
    closeDialog("#receiptDialog");
    if (receiptDialogUrl) URL.revokeObjectURL(receiptDialogUrl);
    receiptDialogUrl = "";
    if ($("#receiptFullImage")) $("#receiptFullImage").removeAttribute("src");
  }

  async function addExpense(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const description = cleanText(formData.get("description"), 80);
    const amount = Number(formData.get("amount"));
    const currency = VALID_CURRENCIES.has(formData.get("currency")) ? formData.get("currency") : "HKD";
    const payerId = cleanText(formData.get("payer"), 100);
    const splitIds = [...new Set(formData.getAll("splitWith").filter((id) => personById(id)?.active))];
    const rate = currentRate();
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      showToast("항목과 금액을 확인해 주세요", true);
      return;
    }
    if (!personById(payerId)?.active || !splitIds.length) {
      showToast("결제자와 분담자를 선택해 주세요", true);
      return;
    }
    if (currency === "HKD" && !rate) {
      showToast("환율을 불러온 뒤 다시 저장해 주세요", true);
      fetchRate(true);
      return;
    }
    const amountMinor = currency === "HKD" ? Math.round(amount * 100) : Math.round(amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      showToast("금액이 너무 크거나 올바르지 않습니다", true);
      return;
    }
    const expenseId = makeId("expense");
    const submit = $("#expenseSubmit");
    const receiptFile = pendingReceiptFile;
    submit.disabled = true;
    submit.textContent = receiptFile ? "사진 저장 중" : "저장 중";
    let receiptSaved = false;
    try {
      if (receiptFile) {
        const blob = await compressReceipt(receiptFile);
        await putReceipt(expenseId, blob, receiptFile.name);
        receiptSaved = true;
      }
      const fxRateMicros = currency === "HKD" ? Math.round(rate * 1_000_000) : 0;
      state.expenses.push({
        id: expenseId,
        date: isValidDate(formData.get("date")) ? formData.get("date") : todayInHongKong(),
        category: VALID_CATEGORIES.has(formData.get("category")) ? formData.get("category") : "기타",
        description,
        currency,
        amountMinor,
        baseAmountKRW: currency === "KRW" ? amountMinor : convertToKRW(amountMinor, fxRateMicros),
        fxRateMicros,
        payerId,
        split: { mode: "equal", participantIds: splitIds },
        receiptId: receiptSaved ? expenseId : "",
        createdAt: new Date().toISOString()
      });
      saveState(false);
      closeDialog("#expenseDialog");
      clearPendingReceipt();
      renderSettlement();
      showToast("지출을 저장했습니다");
    } catch (error) {
      console.warn("지출 또는 영수증을 저장하지 못했습니다.", error);
      if (receiptSaved) await deleteReceipt(expenseId).catch(() => {});
      showToast("영수증 저장에 실패했습니다", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "저장";
    }
  }

  function removeParticipant(id) {
    const person = personById(id);
    if (!person || !person.active) return;
    if (state.participants.filter((entry) => entry.active).length <= 1) {
      showToast("참가자는 한 명 이상 필요합니다", true);
      return;
    }
    const referenced = state.expenses.some((expense) => expense.payerId === id || expense.split.participantIds.includes(id));
    if (referenced) {
      person.active = false;
      showToast("이전 지출은 유지하고 새 정산에서 제외했습니다");
    } else {
      state.participants = state.participants.filter((entry) => entry.id !== id);
      state.checklist = state.checklist.filter((item) => item.ownerId !== id);
      showToast("참가자를 삭제했습니다");
    }
    repairChecklistSelection();
    saveState(false);
    renderPage();
  }

  async function deleteExpense(id) {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense || !window.confirm(`${expense.description} 지출을 삭제할까요?`)) return;
    state.expenses = state.expenses.filter((item) => item.id !== id);
    if (expense.receiptId) await deleteReceipt(id).catch((error) => console.warn("영수증 삭제 실패", error));
    saveState(false);
    renderSettlement();
    showToast("지출을 삭제했습니다");
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== "string" || dataUrl.length > 30_000_000) throw new Error("Invalid receipt data");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("Invalid receipt format");
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }

  async function exportData() {
    try {
      const records = await getAllReceipts().catch(() => []);
      const receipts = [];
      for (const record of records.filter((entry) => state.expenses.some((expense) => expense.id === entry.expenseId))) {
        receipts.push({ expenseId: record.expenseId, name: record.name, type: record.type, dataUrl: await blobToDataUrl(record.blob) });
      }
      const payload = { appId: "trip-hongkong", formatVersion: 3, exportedAt: new Date().toISOString(), state, receipts };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = createElement("a");
      link.href = url;
      link.download = "hong-kong-trip-backup.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("백업 파일을 만들었습니다");
    } catch (error) {
      console.warn("백업 실패", error);
      showToast("백업 파일을 만들지 못했습니다", true);
    }
  }

  async function importData(file) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      showToast("30MB 이하 백업 파일만 불러올 수 있습니다", true);
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.appId && parsed.appId !== "trip-hongkong") throw new Error("Wrong app backup");
      const rawState = parsed.state || parsed;
      if (rawState.meta?.generation !== DATA_PREFIX) throw new Error("이전 여행 백업은 현재 여행과 형식이 다릅니다.");
      const incoming = normalizeState(rawState);
      const receiptRows = Array.isArray(parsed.receipts) ? parsed.receipts.slice(0, 1000) : [];
      if (!window.confirm("현재 내용을 백업 파일의 내용으로 바꿀까요?")) return;
      for (const expense of state.expenses) await deleteReceipt(expense.id).catch(() => {});
      const expenseIds = new Set(incoming.expenses.map((expense) => expense.id));
      for (const row of receiptRows) {
        if (!row || !expenseIds.has(row.expenseId)) continue;
        const blob = dataUrlToBlob(row.dataUrl);
        await putReceipt(row.expenseId, blob, cleanText(row.name, 100) || "receipt.jpg");
      }
      state = incoming;
      saveState(false);
      renderPage();
      showToast("백업을 불러왔습니다");
    } catch (error) {
      console.warn("백업 불러오기 실패", error);
      showToast("올바른 백업 파일인지 확인해 주세요", true);
    } finally {
      if ($("#importFile")) $("#importFile").value = "";
    }
  }

  async function resetSettlement() {
    if (!window.confirm("현재 여행의 지출과 영수증을 초기화할까요? 참가자와 체크리스트는 유지됩니다.")) return;
    const expenses = state.expenses;
    state.expenses = [];
    for (const expense of expenses) await deleteReceipt(expense.id).catch(() => {});
    saveState(false);
    renderSettlement();
    showToast("정산을 초기화했습니다");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("주소를 복사했습니다");
    } catch (error) {
      const helper = createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      showToast(copied ? "주소를 복사했습니다" : "주소 복사에 실패했습니다", !copied);
    }
  }

  function handleClick(event) {
    const sectionButton = event.target.closest("[data-section]");
    if (sectionButton) {
      event.preventDefault();
      activateSection(sectionButton.dataset.section, true, Boolean(sectionButton.closest(".mobile-phase-nav, .quick-strip")));
      return;
    }
    const dateButton = event.target.closest(".day-tab[data-date]");
    if (dateButton) {
      setActiveDate(dateButton.dataset.date, "day");
      return;
    }
    const weatherDateButton = event.target.closest(".weather-day[data-date]");
    if (weatherDateButton) {
      selectWeatherDate(weatherDateButton.dataset.date);
      return;
    }
    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      copyText(copyButton.dataset.copy);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "open-trip-settings") openTripSettings();
    if (action === "close-trip-settings") closeDialog("#tripSettingsDialog");
    if (action === "open-stay") openStayDialog();
    if (action === "edit-stay") openStayDialog(id);
    if (action === "close-stay") closeDialog("#stayDialog");
    if (action === "delete-stay") {
      const stay = state.stays.find((item) => item.id === id);
      if (stay && window.confirm(`${stay.name} 숙소를 삭제할까요?`)) { state.stays = state.stays.filter((item) => item.id !== id); saveState(); renderPrepare(); renderStayCard(); }
    }
    if (action === "refresh-weather") fetchWeather(true);
    if (action === "open-weather-location") openWeatherLocation();
    if (action === "close-weather-location") closeDialog("#weatherLocationDialog");
    if (action === "select-weather-location") selectWeatherLocation(Number(button.dataset.index));
    if (action === "refresh-rate") fetchRate(true);
    if (action === "toggle-theme") toggleTheme();
    if (action === "open-itinerary") openItineraryDialog();
    if (action === "edit-itinerary") openItineraryDialog(null, id);
    if (action === "close-itinerary") closeDialog("#itineraryDialog");
    if (action === "open-expense") openExpenseDialog();
    if (action === "open-participants") openParticipantDialog();
    if (action === "close-participants") closeDialog("#participantDialog");
    if (action === "close-expense") {
      if ($("#expenseSubmit")?.disabled) {
        showToast("저장 중입니다. 잠시만 기다려 주세요.");
        return;
      }
      closeDialog("#expenseDialog");
      clearPendingReceipt();
    }
    if (action === "close-receipt") closeReceipt();
    if (action === "view-receipt") showReceipt(id);
    if (action === "remove-person") removeParticipant(id);
    if (action === "delete-expense") deleteExpense(id);
    if (action === "export") exportData();
    if (action === "reset-settlement") resetSettlement();
    if (action === "swap-currency") {
      converterSource = converterSource === "HKD" ? "KRW" : "HKD";
      applyConverterDirection(true);
    }
    if (action === "delete-check") {
      state.checklist = state.checklist.filter((item) => item.id !== id);
      saveState();
      renderPrepare();
    }
    if (action === "delete-itinerary") {
      state.itinerary = state.itinerary.filter((item) => item.id !== id);
      saveState();
      renderTimeline();
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && ["home", "trip", "all"].includes(PAGE)) fetchWeather(false);
    });
    $("#weatherDays")?.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const weatherDateButton = target?.closest(".weather-day[data-date]");
      if (!weatherDateButton) return;
      event.preventDefault();
      event.stopPropagation();
      selectWeatherDate(weatherDateButton.dataset.date);
    });
    $("#weatherRange")?.addEventListener("change", (event) => {
      state.ui.weatherMode = event.target.value === "week" ? "week" : "trip";
      state.ui.weatherDate = "";
      saveState(false);
      renderTripWeather(cachedWeather());
    });
    $("#weatherLocationForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      searchWeatherLocations();
    });
    $("#weatherLocationDialog")?.addEventListener("close", () => {
      locationSearchRequest?.abort();
      locationSearchRequest = null;
      $("#weatherLocationSearch").disabled = false;
    });
    document.addEventListener("change", (event) => {
      const ownerInput = event.target.closest("[data-check-owner]");
      if (ownerInput && ownerInput.checked && checklistOwners().some((owner) => owner.id === ownerInput.dataset.checkOwner)) {
        $("#checklistForm")?.reset();
        state.ui.activeChecklistOwner = ownerInput.dataset.checkOwner;
        saveState(false);
        renderPrepare();
        window.requestAnimationFrame(() => $("#checklist-owner-" + state.ui.activeChecklistOwner)?.focus());
        return;
      }
      const checkbox = event.target.closest("[data-check-id]");
      if (checkbox) {
        const item = state.checklist.find((entry) => entry.id === checkbox.dataset.checkId);
        if (item) item.done = checkbox.checked;
        saveState();
        renderPrepare();
      }
    });

    $("#hideCompleted")?.addEventListener("change", (event) => {
      state.ui.hideCompleted = event.target.checked;
      saveState(false);
      renderChecklist();
    });

    $("#checklistForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const text = cleanText(formData.get("text"), 80);
      const categories = checklistCategoriesForOwner(state.ui.activeChecklistOwner);
      const category = categories.includes(formData.get("category")) ? formData.get("category") : categories[0];
      const rawUrl = cleanText(formData.get("url"), 600);
      const url = cleanChecklistUrl(rawUrl);
      if (!text) return;
      if (rawUrl && !url) {
        showToast("http 또는 https 링크를 입력해 주세요", true);
        return;
      }
      state.checklist.push({ id: makeId("check"), ownerId: state.ui.activeChecklistOwner, category, text, url, done: false });
      event.currentTarget.reset();
      saveState();
      renderPrepare();
      $("#checklistText")?.focus();
    });

    $("#itineraryForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const title = cleanText(formData.get("title"), 80);
      if (!title) return;
      const date = formData.get("date");
      if (!isValidDate(date)) { showToast("날짜를 선택해 주세요", true); return; }
      const editingId = cleanText(form.dataset.editingId, 100);
      const editingIndex = editingId ? state.itinerary.findIndex((item) => item.id === editingId) : -1;
      if (editingId && editingIndex < 0) {
        closeDialog("#itineraryDialog");
        showToast("수정할 일정을 찾지 못했습니다", true);
        return;
      }
      const nextItem = {
        id: editingId || makeId("plan"),
        date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(formData.get("time")) ? formData.get("time") : "",
        status: editingIndex >= 0 ? state.itinerary[editingIndex].status : "custom",
        title,
        place: cleanText(formData.get("place"), 100),
        note: cleanText(formData.get("note"), 180)
      };
      if (editingIndex >= 0) state.itinerary[editingIndex] = nextItem;
      else state.itinerary.push(nextItem);
      state.ui.activeDate = date;
      saveState(false);
      closeDialog("#itineraryDialog");
      renderTrip();
      showToast(editingIndex >= 0 ? "일정을 수정했습니다" : "일정을 저장했습니다");
    });

    $("#itineraryDate")?.addEventListener("change", (event) => updateItineraryDialogDate(event.target.value));

    $("#personForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = cleanText(new FormData(event.currentTarget).get("name"), 30);
      if (!name) return;
      if (state.participants.some((person) => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        showToast("같은 이름의 참가자가 있습니다", true);
        return;
      }
      addParticipant(name);
      event.currentTarget.reset();
      saveState(false);
      renderSettlement();
      renderPrepare();
      renderHome();
      showToast("참가자를 추가했습니다");
    });

    $("#tripSettingsForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if ((data.startDate && !isValidDate(data.startDate)) || (data.endDate && !isValidDate(data.endDate)) ||
          Boolean(data.startDate) !== Boolean(data.endDate) || (data.endDate && data.endDate < data.startDate)) {
        showToast("출발일과 마지막 날을 올바르게 입력해 주세요", true); return;
      }
      if (data.startDate && daysBetween(data.startDate, data.endDate) > 365) { showToast("여행 기간은 최대 366일까지 입력할 수 있습니다", true); return; }
      if (data.mapUrl && !cleanChecklistUrl(data.mapUrl)) { showToast("올바른 지도 링크를 입력해 주세요", true); return; }
      const trip = sanitizeTrip({ ...data, weatherLocation: state.trip.weatherLocation });
      if (JSON.stringify(trip).length > 1000) { showToast("공유 지도 링크를 조금 더 짧게 입력해 주세요", true); return; }
      state.trip = trip;
      state.ui.activeDate = bestActiveDate();
      state.ui.weatherDate = state.ui.activeDate;
      state.ui.weatherMode = "trip";
      saveState(false);
      closeDialog("#tripSettingsDialog");
      renderPage();
      showToast("여행 설정을 저장했습니다");
    });

    $("#stayForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      if (data.checkInDate && data.checkOutDate && data.checkOutDate < data.checkInDate) { showToast("체크아웃 날짜가 체크인보다 빠릅니다", true); return; }
      const id = form.dataset.editingId || makeId("hotel");
      const [stay] = sanitizeStays([{ ...data, id }]);
      if (!stay) return;
      if (JSON.stringify(stay).length > 1000) { showToast("숙소 메모나 주소를 조금 줄여 주세요", true); return; }
      const index = state.stays.findIndex((item) => item.id === id);
      if (form.dataset.editingId && index < 0) { showToast("수정할 숙소를 찾지 못했습니다", true); return; }
      if (index >= 0) state.stays[index] = stay; else state.stays.push(stay);
      saveState(false);
      closeDialog("#stayDialog");
      renderPrepare(); renderStayCard();
      showToast("숙소를 저장했습니다");
    });

    $("#participantEditForm")?.addEventListener("submit", saveParticipantEdits);

    $("#expenseForm")?.addEventListener("submit", addExpense);
    $("#receiptInput")?.addEventListener("change", (event) => previewReceipt(event.target.files?.[0]));
    $("#expenseFilter")?.addEventListener("change", renderExpenseList);
    $("#hkdInput")?.addEventListener("input", () => {
      if (converterSource === "HKD") syncConverter("HKD");
    });
    $("#krwInput")?.addEventListener("input", () => {
      if (converterSource === "KRW") syncConverter("KRW");
    });
    $("#importFile")?.addEventListener("change", (event) => importData(event.target.files?.[0]));

    $$("dialog").forEach((dialog) => {
      dialog.addEventListener("close", () => {
        if (dialog.id === "expenseDialog" && !$("#expenseSubmit")?.disabled) clearPendingReceipt();
        if (dialog.id === "participantDialog") $("#participantEditButton")?.focus();
      });
      dialog.addEventListener("cancel", (event) => {
        if (dialog.id === "expenseDialog" && $("#expenseSubmit")?.disabled) event.preventDefault();
      });
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        if (dialog.id === "receiptDialog") closeReceipt();
        else if (dialog.id === "expenseDialog" && $("#expenseSubmit")?.disabled) showToast("저장 중입니다. 잠시만 기다려 주세요.");
        else { dialog.close(); if (dialog.id === "expenseDialog") clearPendingReceipt(); }
      });
    });

    $("#daySwitcher")?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const days = tripDays();
      if (!days.length) return;
      const current = days.findIndex((day) => day.date === state.ui.activeDate);
      let next = current;
      if (event.key === "ArrowLeft") next = (current - 1 + days.length) % days.length;
      if (event.key === "ArrowRight") next = (current + 1) % days.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = days.length - 1;
      setActiveDate(days[next].date, "day");
    });

    $(".phase-tabs")?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = $$(".phase-tab[data-section]");
      const current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
      let next = current;
      if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      event.preventDefault();
      activateSection(tabs[next].dataset.section, true, false);
      tabs[next].focus();
    });

    window.addEventListener("hashchange", () => {
      const section = window.location.hash.replace(/^#/, "");
      if (SECTIONS.has(section)) activateSection(section, false, true);
    });
    THEME_MEDIA.addEventListener?.("change", () => {
      if (themePreference() === "system") applyTheme("system", false);
    });

    window.addEventListener("storage", (event) => {
      if (event.key === THEME_KEY) {
        applyTheme(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system", false);
        return;
      }
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const previousLocation = weatherLocationKey();
        state = normalizeState(JSON.parse(event.newValue));
        renderPage();
        if (previousLocation !== weatherLocationKey()) fetchWeather(false);
        showToast("다른 탭의 변경을 반영했습니다");
      } catch (error) {
        console.warn("다른 탭 데이터를 반영하지 못했습니다.", error);
      }
    });
  }

  sharedStateFingerprint = fingerprintSharedState();
  applyTheme(themePreference(), false);
  renderPage();
  bindEvents();
  if (PAGE === "all") {
    const requestedSection = window.location.hash.replace(/^#/, "");
    const initialSection = sectionFromHash();
    activateSection(initialSection, false, SECTIONS.has(requestedSection));
  }
  if (PAGE === "home" || PAGE === "trip" || PAGE === "all") fetchWeather(false);
  if (PAGE === "home" || PAGE === "settle" || PAGE === "all") fetchRate(false);
  if (globalThis.TripCloudSync?.create) {
    cloudSync = globalThis.TripCloudSync.create({
      getSharedState,
      applySharedState,
      getLocalReceipt: getReceipt,
      showToast
    });
    cloudSync.init().catch((error) => {
      console.warn("공용 저장을 시작하지 못했습니다.", error);
      showToast("공용 저장 연결을 확인해 주세요", true);
    });
  }
})();
