"use strict";

(() => {
  const STORAGE_KEY = "trip-hongkong-hub-v2";
  const LEGACY_STORAGE_KEY = "trip-hongkong-hub-v1";
  const DB_NAME = "trip-hongkong-media-v1";
  const DB_STORE = "receipts";
  const THEME_KEY = "trip-hongkong-theme";
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
  const START_DATE = "2026-08-15";
  const END_DATE = "2026-08-19";
  const TIMEZONE = "Asia/Hong_Kong";
  const PAGE = document.body.dataset.page || "home";
  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.3193&longitude=114.1694&timezone=Asia%2FHong_Kong&forecast_days=16&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code";
  const RATE_URL = "https://api.frankfurter.dev/v2/rate/HKD/KRW";

  const TRIP_DAYS = [
    { date: "2026-08-15", day: 1, number: "15", weekday: "토", weekdayLong: "SATURDAY" },
    { date: "2026-08-16", day: 2, number: "16", weekday: "일", weekdayLong: "SUNDAY" },
    { date: "2026-08-17", day: 3, number: "17", weekday: "월", weekdayLong: "MONDAY" },
    { date: "2026-08-18", day: 4, number: "18", weekday: "화", weekdayLong: "TUESDAY" },
    { date: "2026-08-19", day: 5, number: "19", weekday: "수", weekdayLong: "WEDNESDAY" }
  ];

  const ITINERARY_MIGRATION = "confirmed-trip-plan-v1";
  const PLACEHOLDER_CLEANUP_MIGRATION = "legacy-placeholder-cleanup-v1";
  const CHECKLIST_SCOPE_MIGRATION = "personal-checklists-v1";
  const CHECKLIST_TASKS_MIGRATION = "practical-checklists-v2";
  const PARTICIPANT_NAMES_MIGRATION = "traveler-names-v1";
  const VALID_PLAN_STATUSES = new Set(["confirmed", "recommended", "flexible", "custom"]);
  const LEGACY_PLACEHOLDERS = [
    { id: "seed-arrival", date: "2026-08-15", time: "", title: "홍콩 도착", place: "", note: "항공편 확정 후 도착 시각과 이동 방법 입력" },
    { id: "seed-departure", date: "2026-08-19", time: "", title: "체크아웃 · 귀국", place: "Royal Plaza Hotel", note: "항공편 확정 후 공항 출발 시각 입력" }
  ];
  const TRIP_ITINERARY = [
    { id: "trip-cx413-depart", date: "2026-08-15", time: "08:00", status: "confirmed", title: "CX413 인천 출발", place: "인천국제공항 제1터미널", note: "캐세이퍼시픽 · Economy Light · 이코노미 · 위탁 수하물 1개" },
    { id: "trip-cx413-arrive", date: "2026-08-15", time: "10:50", status: "confirmed", title: "홍콩 도착", place: "홍콩국제공항 제1터미널", note: "입국 심사와 수하물 수령 후 숙소 이동" },
    { id: "trip-royal-arrive", date: "2026-08-15", time: "12:30", status: "recommended", title: "Royal Plaza Hotel 도착", place: "Royal Plaza Hotel Hong Kong", note: "도착 예정 12:00–13:00 · 객실 준비 전이면 짐 보관" },
    { id: "trip-mong-kok", date: "2026-08-15", time: "16:00", status: "flexible", title: "몽콕 산책", place: "Mong Kok Hong Kong", note: "MOKO · 화원가 · 운동화 거리, 컨디션에 따라 짧게" },
    { id: "trip-temple-street", date: "2026-08-15", time: "19:30", status: "flexible", title: "템플스트리트 야시장", place: "Temple Street Night Market Hong Kong", note: "첫날 저녁 · 피곤하면 다음 날로 이동" },
    { id: "trip-peak", date: "2026-08-16", time: "08:30", status: "recommended", title: "빅토리아 피크", place: "Victoria Peak Hong Kong", note: "오전 일찍 이동 · 피크트램 운영과 날씨 확인" },
    { id: "trip-central", date: "2026-08-16", time: "11:30", status: "recommended", title: "센트럴", place: "Central Hong Kong", note: "점심 · 타이쿤 · PMQ · 미드레벨 에스컬레이터" },
    { id: "trip-star-ferry", date: "2026-08-16", time: "16:30", status: "recommended", title: "스타페리", place: "Central Star Ferry Pier Hong Kong", note: "센트럴에서 침사추이로 이동" },
    { id: "trip-avenue-stars", date: "2026-08-16", time: "17:30", status: "recommended", title: "스타의 거리 · 빅토리아항", place: "Avenue of Stars Hong Kong", note: "해질 무렵부터 야경까지" },
    { id: "trip-kowloon-park", date: "2026-08-17", time: "09:30", status: "flexible", title: "구룡채성 공원", place: "Kowloon Walled City Park Hong Kong", note: "오전 야외 일정 · 비가 많이 오면 실내 일정으로 변경" },
    { id: "trip-west-kowloon", date: "2026-08-17", time: "14:00", status: "flexible", title: "서구룡 · M+", place: "M+ Museum Hong Kong", note: "비 오는 날에도 가능한 실내 일정" },
    { id: "trip-k11", date: "2026-08-17", time: "18:00", status: "flexible", title: "K11 MUSEA · 침사추이", place: "K11 MUSEA Hong Kong", note: "저녁 식사와 쇼핑 · 전날 못 본 야경 보완" },
    { id: "trip-royal-checkout", date: "2026-08-18", time: "09:00", status: "recommended", title: "Royal Plaza Hotel 체크아웃", place: "Royal Plaza Hotel Hong Kong", note: "객실 1실 · 3박 종료" },
    { id: "trip-hzmb-hk", date: "2026-08-18", time: "09:30", status: "recommended", title: "HZMB 홍콩구안으로 이동", place: "HZMB Hong Kong Port", note: "큰 짐이 있으면 택시 또는 6인승 차량 검토" },
    { id: "trip-gold-bus", date: "2026-08-18", time: "11:10", status: "recommended", title: "금바로 마카오 이동", place: "HZMB Macao Port", note: "출입경 포함 전체 이동 3–4시간 예상" },
    { id: "trip-broadway-checkin", date: "2026-08-18", time: "13:30", status: "recommended", title: "Broadway Hotel 도착", place: "Broadway Hotel Macau", note: "Broadway King 2실 · 성인 4명 · 조식 불포함" },
    { id: "trip-macau-old-town", date: "2026-08-18", time: "15:00", status: "flexible", title: "마카오 구시가지", place: "Senado Square Macau", note: "세나도 광장 · 성바울 유적 · 몬테요새" },
    { id: "trip-cotai", date: "2026-08-18", time: "19:30", status: "flexible", title: "코타이 야경", place: "Galaxy Macau", note: "Galaxy · Broadway 주변에서 저녁" },
    { id: "trip-broadway-checkout", date: "2026-08-19", time: "10:20", status: "recommended", title: "Broadway Hotel 체크아웃", place: "Broadway Hotel Macau", note: "객실 2실 · 1박 종료" },
    { id: "trip-macau-port", date: "2026-08-19", time: "11:15", status: "recommended", title: "마카오구안 도착 · 상류 체크인", place: "HZMB Macao Port", note: "HKIA 직행버스 카운터 · 이용 가능 여부와 수하물 연결 사전 확인" },
    { id: "trip-skypier-coach", date: "2026-08-19", time: "12:30", status: "recommended", title: "HKIA SkyPier 직행버스", place: "Hong Kong International Airport SkyPier", note: "별도 예약 필요 · 예상 도착 13:15" },
    { id: "trip-cx430-depart", date: "2026-08-19", time: "17:40", status: "confirmed", title: "CX430 홍콩 출발", place: "홍콩국제공항 제1터미널", note: "캐세이퍼시픽 · Economy Light · 이코노미 · 위탁 수하물 1개" },
    { id: "trip-cx430-arrive", date: "2026-08-19", time: "22:25", status: "confirmed", title: "인천 도착", place: "인천국제공항 제1터미널", note: "비행시간 3시간 45분" }
  ];
  const STAYS = [
    { city: "HONG KONG", status: "3박", name: "Royal Plaza Hotel", address: "193 Prince Edward Road West, Kowloon, Hong Kong", addressHtml: "193 Prince Edward Road West,<br>Kowloon, Hong Kong", dates: "15–18 AUG", room: "Family · 1실" },
    { city: "MACAU", status: "1박", name: "Broadway Hotel", address: "Sul da Marina Taipa-Sul, junto a Rotunda do Dique Oeste, Taipa, Macau", addressHtml: "Sul da Marina Taipa-Sul,<br>Taipa, Macau", dates: "18–19 AUG", room: "King · 2실" }
  ];

  const CHECKLIST_OWNERS = [
    { id: "common", label: "공통" },
    { id: "minje", label: "민제" },
    { id: "junho", label: "준호" },
    { id: "juyoung", label: "주영" },
    { id: "junhyuk", label: "준혁" }
  ];
  const CHECK_OWNER_IDS = new Set(CHECKLIST_OWNERS.map((owner) => owner.id));
  const FIXED_PARTICIPANT_IDS = new Set(["person-me", "person-companion", "person-companion-2", "person-companion-3"]);
  const COMMON_CHECK_CATEGORIES = ["예약·티켓", "교통·이동", "함께 준비"];
  const PERSONAL_CHECK_CATEGORIES = ["개인 준비", "위탁 수하물", "기내 수하물"];
  const CHECK_CATEGORIES = [...COMMON_CHECK_CATEGORIES, ...PERSONAL_CHECK_CATEGORIES];
  const COMMON_CHECKLIST_TEMPLATES = [
    { id: "before-flight", category: "예약·티켓", text: "CX413·CX430 항공편 예약 내용 확인", done: true },
    { id: "before-hotel", category: "예약·티켓", text: "홍콩·마카오 숙소 예약 내용 확인", done: true },
    { id: "common-disney", category: "예약·티켓", text: "홍콩 디즈니랜드 방문일 정하고 4명 예매", url: "https://www.hongkongdisneyland.com/book/tickets/", linkLabel: "예매", done: false },
    { id: "common-hk-restaurant", category: "예약·티켓", text: "홍콩 식당 후보 찾기", url: "https://www.openrice.com/en/hongkong", linkLabel: "후보", done: false },
    { id: "common-macau-restaurant", category: "예약·티켓", text: "마카오 식당 후보 찾기", url: "https://www.openrice.com/en/macau", linkLabel: "후보", done: false },
    { id: "common-gold-bus", category: "교통·이동", text: "8/18 홍콩 → 마카오 금바 예매", url: "https://i.hzmbus.com/webhtml/index.html", linkLabel: "예매", done: false },
    { id: "common-airport-bus", category: "교통·이동", text: "8/19 마카오 → 홍콩공항 직행버스 4명 예매", url: "https://ticket.macauhkairportbus.com/", linkLabel: "예매", done: false },
    { id: "before-map", category: "함께 준비", text: "공유 지도에 갈 곳 최종 정리", url: "https://maps.app.goo.gl/c4aqxDU5yhHmMNfu5?g_st=ac", linkLabel: "지도", done: true },
    { id: "common-restaurant-links", category: "함께 준비", text: "선택한 식당 예약 링크 등록하기", done: false },
    { id: "common-share-confirmations", category: "함께 준비", text: "예약 확인서·QR을 4명에게 공유", done: false },
    { id: "common-online-checkin", category: "함께 준비", text: "출발 48시간 전 4명 온라인 체크인", url: "https://www.cathaypacific.com/mb/#/en_HK/login", linkLabel: "체크인", done: false }
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
    { key: "charger", category: "기내 수하물", text: "충전기 · BF형 어댑터" },
    { key: "battery", category: "기내 수하물", text: "보조배터리 최대 2개 · 기내 휴대" },
    { key: "medicine", category: "기내 수하물", text: "상비약 · 개인 약" },
    { key: "liquids", category: "기내 수하물", text: "100ml 이하 액체 · 지퍼백" },
    { key: "rain", category: "기내 수하물", text: "접이식 우산 · 우비" }
  ];
  const VALID_DATES = new Set(TRIP_DAYS.map((day) => day.date));
  const VALID_CURRENCIES = new Set(["HKD", "KRW"]);
  const VALID_CATEGORIES = new Set(["식비", "교통", "숙소", "관광", "쇼핑", "기타"]);
  const SECTIONS = new Set(["prepare", "trip", "settle"]);

  let state = loadState();
  let cloudSync = null;
  let sharedStateFingerprint = "";
  let toastTimer = 0;
  let weatherRequest = null;
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

  function defaultState() {
    return {
      schemaVersion: 6,
      meta: { appliedMigrations: [ITINERARY_MIGRATION, PLACEHOLDER_CLEANUP_MIGRATION, CHECKLIST_SCOPE_MIGRATION, CHECKLIST_TASKS_MIGRATION, PARTICIPANT_NAMES_MIGRATION] },
      checklist: checklistSeeds(),
      itinerary: TRIP_ITINERARY.map((item) => ({ ...item })),
      participants: [
        { id: "person-me", name: "민제", active: true, createdAt: new Date().toISOString() },
        { id: "person-companion", name: "준호", active: true, createdAt: new Date().toISOString() },
        { id: "person-companion-2", name: "주영", active: true, createdAt: new Date().toISOString() },
        { id: "person-companion-3", name: "준혁", active: true, createdAt: new Date().toISOString() }
      ],
      expenses: [],
      weatherCache: null,
      rateCache: null,
      ui: { activeDate: START_DATE, hideCompleted: false, activeChecklistOwner: "common" }
    };
  }

  function commonChecklistSeeds() {
    return COMMON_CHECKLIST_TEMPLATES.map((item) => ({ ...item, ownerId: "common" }));
  }

  function personalChecklistId(ownerId, item) {
    const prefix = item.category === "개인 준비" ? "personal" : item.category === "위탁 수하물" ? "packing" : "carry";
    return `${prefix}-${ownerId}-${item.key}`;
  }

  function personalChecklistSeeds() {
    return CHECKLIST_OWNERS.filter((owner) => owner.id !== "common").flatMap((owner) => (
      PERSONAL_CHECKLIST_TEMPLATES.map((item) => ({
        id: personalChecklistId(owner.id, item),
        ownerId: owner.id,
        category: item.category,
        text: item.text,
        done: false
      }))
    ));
  }

  function checklistSeeds() {
    return [...commonChecklistSeeds(), ...personalChecklistSeeds()];
  }

  function makeId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  function sanitizeChecklist(items, fallback) {
    if (!Array.isArray(items)) return fallback;
    if (!items.length) return [];
    const ids = new Set();
    const cleaned = items.slice(0, 500).map((item) => {
      if (!item || typeof item !== "object" || (item.phase && item.phase !== "before")) return null;
      const text = cleanText(item.text, 100);
      if (!text) return null;
      let id = cleanText(item.id, 100) || makeId("check");
      while (ids.has(id)) id = makeId("check");
      ids.add(id);
      const ownerId = CHECK_OWNER_IDS.has(item.ownerId) ? item.ownerId : "common";
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
      if (!item || typeof item !== "object") return null;
      const title = cleanText(item.title, 100);
      if (!title) return null;
      return {
        id: cleanText(item.id, 100) || makeId("plan"),
        date: VALID_DATES.has(item.date) ? item.date : START_DATE,
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
    if (type === "weather" && cache.data && typeof cache.data === "object" && typeof cache.fetchedAt === "string") {
      return { data: cache.data, fetchedAt: cache.fetchedAt };
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
        date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : START_DATE,
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

  function sanitizeMeta(meta) {
    const appliedMigrations = meta && Array.isArray(meta.appliedMigrations)
      ? [...new Set(meta.appliedMigrations.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 30)
      : [];
    return { appliedMigrations };
  }

  function sameItineraryItem(left, right) {
    return ["id", "date", "time", "title", "place", "note"].every((key) => left[key] === right[key]);
  }

  function itineraryFingerprint(item) {
    return [item.date, item.time, item.title, item.place, item.note].join("|");
  }

  function previousChecklistDone(seed, previousById) {
    if (seed.id === "before-map") return ["before-map", "before-hotel-map"].some((id) => previousById.get(id)?.done);
    const exact = previousById.get(seed.id);
    if (exact) return exact.done;
    if (seed.ownerId === "common") {
      return seed.done;
    }

    const template = PERSONAL_CHECKLIST_TEMPLATES.find((item) => personalChecklistId(seed.ownerId, item) === seed.id);
    if (!template) return false;
    const legacyIds = {
      passport: ["before-passport"],
      insurance: ["before-insurance"],
      esim: ["before-esim"],
      payment: ["before-payment"],
      clothes: [`packing-${seed.ownerId}-clothes`],
      toiletries: [`packing-${seed.ownerId}-toiletries`],
      shoes: ["before-shoes"],
      essentials: [`packing-${seed.ownerId}-essentials`],
      documents: [],
      charger: [`packing-${seed.ownerId}-power`, "before-adapter"],
      battery: [`packing-${seed.ownerId}-power`],
      medicine: ["before-medicine"],
      liquids: [],
      rain: ["before-rain"]
    }[template.key] || [];
    return legacyIds.some((id) => previousById.get(id)?.done);
  }

  function migratePracticalChecklist(previous) {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const legacyDefaultIds = new Set([
      "before-flight", "before-hotel", "before-passport", "before-insurance",
      "before-esim", "before-payment", "before-map", "before-hotel-map",
      "before-adapter", "before-rain", "before-medicine", "before-shoes"
    ]);
    CHECKLIST_OWNERS.filter((owner) => owner.id !== "common").forEach((owner) => {
      ["clothes", "toiletries", "essentials", "power"].forEach((key) => legacyDefaultIds.add(`packing-${owner.id}-${key}`));
    });
    checklistSeeds().forEach((item) => legacyDefaultIds.add(item.id));

    const seeds = checklistSeeds().map((item) => ({ ...item, done: previousChecklistDone(item, previousById) }));
    const usedIds = new Set(seeds.map((item) => item.id));
    const custom = [];
    const append = (item) => {
      let id = item.id;
      while (usedIds.has(id)) id = makeId("check");
      usedIds.add(id);
      custom.push({ ...item, id });
    };

    previous.forEach((item) => {
      if (legacyDefaultIds.has(item.id)) return;
      if (item.ownerId === "common" && ["위탁 수하물", "기내 수하물"].includes(item.category)) {
        CHECKLIST_OWNERS.filter((owner) => owner.id !== "common").forEach((owner) => {
          append({ ...item, id: `migrated-${owner.id}-${item.id}`.slice(0, 100), ownerId: owner.id });
        });
        return;
      }
      const allowedCategories = checklistCategoriesForOwner(item.ownerId);
      append({
        ...item,
        category: allowedCategories.includes(item.category)
          ? item.category
          : item.ownerId === "common" ? "함께 준비" : "개인 준비"
      });
    });

    return [...seeds, ...custom];
  }

  function normalizeChecklistScopes(items) {
    return items.map((item) => {
      const allowedCategories = checklistCategoriesForOwner(item.ownerId);
      if (allowedCategories.includes(item.category)) return item;
      return {
        ...item,
        category: item.ownerId === "common" ? "함께 준비" : "개인 준비"
      };
    });
  }

  function applyMigrations(input) {
    if (!input.meta.appliedMigrations.includes(ITINERARY_MIGRATION)) {
      input.itinerary = input.itinerary.filter((item) => !LEGACY_PLACEHOLDERS.some((legacy) => sameItineraryItem(item, legacy)));
      const ids = new Set(input.itinerary.map((item) => item.id));
      const fingerprints = new Set(input.itinerary.map(itineraryFingerprint));
      TRIP_ITINERARY.forEach((item) => {
        if (ids.has(item.id) || fingerprints.has(itineraryFingerprint(item))) return;
        input.itinerary.push({ ...item });
        ids.add(item.id);
        fingerprints.add(itineraryFingerprint(item));
      });

      input.checklist = input.checklist.map((item) => (
        item.id === "before-flight" || item.id === "before-hotel" ? { ...item, done: true } : item
      ));

      const participantIds = new Set(input.participants.map((person) => person.id));
      if (input.participants.length === 2 && participantIds.has("person-me") && participantIds.has("person-companion")) {
        input.participants.push(
          { id: "person-companion-2", name: "동행 2", active: true, createdAt: new Date().toISOString() },
          { id: "person-companion-3", name: "동행 3", active: true, createdAt: new Date().toISOString() }
        );
      }
      input.meta.appliedMigrations.push(ITINERARY_MIGRATION);
    }

    if (!input.meta.appliedMigrations.includes(PLACEHOLDER_CLEANUP_MIGRATION)) {
      input.itinerary = input.itinerary.filter((item) => item.id !== "seed-arrival" && item.id !== "seed-departure");
      input.meta.appliedMigrations.push(PLACEHOLDER_CLEANUP_MIGRATION);
    }

    if (!input.meta.appliedMigrations.includes(CHECKLIST_SCOPE_MIGRATION)) {
      const checklistIds = new Set(input.checklist.map((item) => item.id));
      personalChecklistSeeds().forEach((item) => {
        if (checklistIds.has(item.id)) return;
        input.checklist.push(item);
        checklistIds.add(item.id);
      });
      input.meta.appliedMigrations.push(CHECKLIST_SCOPE_MIGRATION);
    }

    if (!input.meta.appliedMigrations.includes(CHECKLIST_TASKS_MIGRATION)) {
      input.checklist = migratePracticalChecklist(input.checklist);
      input.meta.appliedMigrations.push(CHECKLIST_TASKS_MIGRATION);
    }

    if (!input.meta.appliedMigrations.includes(PARTICIPANT_NAMES_MIGRATION)) {
      const travelerNames = {
        "person-me": ["나", "민제"],
        "person-companion": ["동행 1", "준호"],
        "person-companion-2": ["동행 2", "주영"],
        "person-companion-3": ["동행 3", "준혁"]
      };
      const replacementNames = {
        "person-me": "민제",
        "person-companion": "준호",
        "person-companion-2": "주영",
        "person-companion-3": "준혁"
      };
      input.participants = input.participants.map((person) => (
        travelerNames[person.id]?.includes(person.name) ? { ...person, name: replacementNames[person.id] } : person
      ));
      input.meta.appliedMigrations.push(PARTICIPANT_NAMES_MIGRATION);
    }

    input.checklist = normalizeChecklistScopes(input.checklist);

    input.schemaVersion = 6;
    return input;
  }

  function sanitizeState(input) {
    const base = defaultState();
    if (!input || typeof input !== "object") return base;
    const rateCache = sanitizeCache(input.rateCache, "rate");
    const participants = sanitizeParticipants(input.participants, base.participants);
    const ui = input.ui && typeof input.ui === "object" ? input.ui : {};
    return {
      schemaVersion: 6,
      meta: sanitizeMeta(input.meta),
      checklist: sanitizeChecklist(input.checklist, base.checklist),
      itinerary: sanitizeItinerary(input.itinerary, base.itinerary),
      participants,
      expenses: sanitizeExpenses(input.expenses, participants, rateCache),
      weatherCache: sanitizeCache(input.weatherCache, "weather"),
      rateCache,
      ui: {
        activeDate: VALID_DATES.has(ui.activeDate) ? ui.activeDate : bestActiveDate(),
        hideCompleted: ui.hideCompleted === true,
        activeChecklistOwner: CHECK_OWNER_IDS.has(ui.activeChecklistOwner) ? ui.activeChecklistOwner : "common"
      }
    };
  }

  function normalizeState(input) {
    return applyMigrations(sanitizeState(input));
  }

  function loadState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) {
        const normalized = normalizeState(JSON.parse(current));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const migrated = normalizeState(JSON.parse(legacy));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.warn("저장 데이터를 불러오지 못했습니다.", error);
    }
    return defaultState();
  }

  function getSharedState() {
    return {
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
    state = normalizeState({
      ...state,
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
    if (VALID_DATES.has(today)) return today;
    return today > END_DATE ? END_DATE : START_DATE;
  }

  function selectedDay() {
    return TRIP_DAYS.find((day) => day.date === state.ui.activeDate) || TRIP_DAYS[0];
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
    return CHECKLIST_OWNERS.find((owner) => owner.id === id) || CHECKLIST_OWNERS[0];
  }

  function prepStats(ownerId = null) {
    const items = ownerId ? state.checklist.filter((item) => item.ownerId === ownerId) : state.checklist;
    const total = items.length;
    const done = items.filter((item) => item.done).length;
    return { total, done, remaining: Math.max(0, total - done), percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function updateTripStatus() {
    const label = $("#tripStatusLabel");
    const countdown = $("#tripCountdown");
    const date = $("#tripStatusDate");
    if (!label || !countdown || !date) return;
    const today = todayInHongKong();
    if (today < START_DATE) {
      label.textContent = "여행 전";
      countdown.textContent = `D–${daysBetween(today, START_DATE)}`;
      date.textContent = "2026. 08. 15 출발";
    } else if (today <= END_DATE) {
      const day = daysBetween(START_DATE, today) + 1;
      label.textContent = `여행 중 · ${day}일차`;
      countdown.textContent = `DAY ${day}`;
      date.textContent = `${today.slice(5).replace("-", ". ")}`;
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
    renderHomeWeather(state.weatherCache ? state.weatherCache.data : null);
    renderRate();
  }

  function renderChecklistOwners() {
    const container = $("#checklistOwnerSwitcher");
    if (!container) return;
    const legend = createElement("legend", "visually-hidden", "체크리스트 선택");
    const controls = CHECKLIST_OWNERS.map((owner) => {
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
      face.append(createElement("b", "", owner.label), createElement("small", "", `${stats.done}/${stats.total}`));
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
    TRIP_DAYS.forEach((day) => {
      const button = createElement("button", `day-tab${day.date === today ? " is-today" : ""}`);
      button.type = "button";
      button.role = "tab";
      button.dataset.date = day.date;
      button.setAttribute("aria-selected", String(day.date === state.ui.activeDate));
      button.setAttribute("aria-controls", "timeline");
      button.setAttribute("aria-label", `8월 ${day.number}일 ${day.weekdayLong}, ${day.day}일차`);
      button.tabIndex = day.date === state.ui.activeDate ? 0 : -1;
      button.append(createElement("strong", "", day.number), createElement("span", "", day.weekday));
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
    if ($("#selectedDayLabel")) $("#selectedDayLabel").textContent = `DAY ${day.day}`;
    if ($("#selectedDayEnglish")) $("#selectedDayEnglish").textContent = day.weekdayLong;
    if ($("#selectedDayTitle")) $("#selectedDayTitle").textContent = `8월 ${day.number}일 · ${day.weekday}요일`;
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
      row.append(time, marker, copy, remove);
      timeline.append(row);
    });
  }

  function renderStayCard() {
    const stay = state.ui.activeDate >= "2026-08-18" ? STAYS[1] : STAYS[0];
    if ($("#activeStayLabel")) $("#activeStayLabel").textContent = `STAY · ${stay.city}`;
    if ($("#activeStayStatus")) $("#activeStayStatus").textContent = stay.status;
    if ($("#activeStayName")) $("#activeStayName").textContent = stay.name;
    if ($("#activeStayAddress")) $("#activeStayAddress").textContent = stay.address;
    if ($("#activeStayDates")) $("#activeStayDates").textContent = stay.dates;
    if ($("#activeStayRoom")) $("#activeStayRoom").textContent = stay.room;
    const map = $("#activeStayMap");
    if (map) map.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stay.name}, ${stay.address}`)}`;
    const copy = $("#activeStayCopy");
    if (copy) copy.dataset.copy = stay.address;
  }

  function setActiveDate(date, focus = false) {
    if (!VALID_DATES.has(date)) return;
    state.ui.activeDate = date;
    saveState(false);
    renderDaySwitcher();
    renderTimeline();
    renderStayCard();
    renderTripWeather(state.weatherCache ? state.weatherCache.data : null);
    if (focus) $(`.day-tab[data-date="${date}"]`)?.focus();
  }

  function renderTrip() {
    renderDaySwitcher();
    renderTimeline();
    renderStayCard();
    renderTripWeather(state.weatherCache ? state.weatherCache.data : null, Boolean(state.weatherCache));
  }

  function weatherInfo(code) {
    if (code === 0) return { icon: "☀", label: "맑음" };
    if ([1, 2].includes(code)) return { icon: "◑", label: "대체로 맑음" };
    if (code === 3) return { icon: "☁", label: "흐림" };
    if ([45, 48].includes(code)) return { icon: "≋", label: "안개" };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: "⌁", label: "이슬비" };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "☂", label: "비" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄", label: "눈" };
    if ([95, 96, 99].includes(code)) return { icon: "ϟ", label: "뇌우" };
    return { icon: "◌", label: "날씨" };
  }

  function renderHomeWeather(data) {
    const text = $("#homeWeather");
    const detail = $("#homeWeatherDetail");
    if (!text || !detail) return;
    if (!data || !data.current) {
      text.textContent = "확인 전";
      detail.textContent = "날씨 연결 필요";
      return;
    }
    const temp = Number(data.current.temperature_2m);
    const info = weatherInfo(Number(data.current.weather_code));
    text.textContent = `${Number.isFinite(temp) ? Math.round(temp) + "°" : "--"} · ${info.label}`;
    detail.textContent = `체감 ${Math.round(Number(data.current.apparent_temperature))}° · 습도 ${Math.round(Number(data.current.relative_humidity_2m))}%`;
  }

  function renderTripWeather(data, stale = false) {
    const currentText = $("#currentWeatherText");
    const currentIcon = $("#currentWeatherIcon");
    const currentDetail = $("#currentWeatherDetail");
    const days = $("#weatherDays");
    if (!days) return;
    days.replaceChildren();
    if (data && data.current) {
      const info = weatherInfo(Number(data.current.weather_code));
      currentIcon.textContent = info.icon;
      currentText.textContent = `${Math.round(Number(data.current.temperature_2m))}° · ${info.label}`;
      currentDetail.textContent = `체감 ${Math.round(Number(data.current.apparent_temperature))}° · 습도 ${Math.round(Number(data.current.relative_humidity_2m))}%`;
    } else {
      currentIcon.textContent = "◌";
      currentText.textContent = "확인 전";
      currentDetail.textContent = "날씨 연결 필요";
    }
    const daily = data && data.daily ? data.daily : null;
    TRIP_DAYS.forEach((tripDay) => {
      const index = daily && Array.isArray(daily.time) ? daily.time.indexOf(tripDay.date) : -1;
      const rawMax = index >= 0 ? daily.temperature_2m_max?.[index] : null;
      const rawMin = index >= 0 ? daily.temperature_2m_min?.[index] : null;
      const rawCode = index >= 0 ? daily.weather_code?.[index] : null;
      const max = rawMax === null || rawMax === undefined ? NaN : Number(rawMax);
      const min = rawMin === null || rawMin === undefined ? NaN : Number(rawMin);
      const code = rawCode === null || rawCode === undefined ? NaN : Number(rawCode);
      const card = createElement("article", `weather-day${tripDay.date === state.ui.activeDate ? " is-selected" : ""}`);
      const time = createElement("time", "", `${tripDay.number} ${tripDay.weekday}`);
      time.dateTime = tripDay.date;
      card.append(time);
      if ([max, min, code].every(Number.isFinite)) {
        const info = weatherInfo(code);
        card.append(createElement("span", "", info.icon), createElement("strong", "", `${Math.round(max)}°/${Math.round(min)}°`), createElement("small", "", info.label));
      } else {
        card.append(createElement("span", "", "◌"), createElement("strong", "", "예보 전"), createElement("small", "", "준비 중"));
      }
      days.append(card);
    });
    renderHourlyWeather(data);
    const updated = $("#weatherUpdated");
    if (updated) {
      updated.textContent = state.weatherCache ? `${stale ? "저장된 예보" : "업데이트"} · ${new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.weatherCache.fetchedAt))}` : "Open-Meteo";
    }
    if (window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() => {
        const selected = $(".weather-day.is-selected", days);
        if (!selected) return;
        const left = Math.max(0, selected.offsetLeft - (days.clientWidth - selected.clientWidth) / 2);
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        days.scrollTo({ left, behavior });
      });
    }
  }

  function renderHourlyWeather(data) {
    const container = $("#hourlyWeather");
    const title = $("#hourlyWeatherTitle");
    if (!container || !title) return;

    const tripDay = TRIP_DAYS.find((day) => day.date === state.ui.activeDate) || TRIP_DAYS[0];
    title.textContent = `시간별 · 8월 ${tripDay.number}일`;
    container.replaceChildren();

    const hourly = data && data.hourly ? data.hourly : null;
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const indexes = [];
    times.forEach((stamp, index) => {
      if (typeof stamp !== "string" || !stamp.startsWith(`${tripDay.date}T`)) return;
      const hour = Number(stamp.slice(11, 13));
      if (Number.isInteger(hour)) indexes.push(index);
    });

    if (!indexes.length) {
      const empty = createElement("div", "hourly-weather-empty");
      empty.append(
        createElement("strong", "", "시간별 예보 제공 전"),
        createElement("span", "", "출발 16일 전부터 순차적으로 표시됩니다")
      );
      container.append(empty);
      return;
    }

    indexes.forEach((index) => {
      const stamp = times[index];
      const temp = Number(hourly.temperature_2m?.[index]);
      const feels = Number(hourly.apparent_temperature?.[index]);
      const rain = Number(hourly.precipitation_probability?.[index]);
      const code = Number(hourly.weather_code?.[index]);
      const info = weatherInfo(code);
      const timeText = stamp.slice(11, 16);
      const rainText = Number.isFinite(rain) ? `${Math.round(rain)}%` : "--";
      const card = createElement("article", "hourly-weather-item");
      const time = createElement("time", "", timeText);
      time.dateTime = stamp;
      const icon = createElement("span", "hourly-weather-icon", info.icon);
      icon.setAttribute("aria-hidden", "true");
      const temperature = createElement("strong", "", Number.isFinite(temp) ? `${Math.round(temp)}°` : "--");
      const detail = createElement("small", "", `${info.label} · 강수 ${rainText}`);
      card.setAttribute("aria-label", `${timeText}, ${info.label}, ${Number.isFinite(temp) ? Math.round(temp) + "도" : "기온 정보 없음"}, 강수확률 ${rainText}`);
      if (Number.isFinite(feels)) card.title = `체감 ${Math.round(feels)}°`;
      card.append(time, icon, temperature, detail);
      container.append(card);
    });
  }

  async function fetchWeather(force = false) {
    if (weatherRequest) return weatherRequest;
    const age = state.weatherCache ? Date.now() - new Date(state.weatherCache.fetchedAt).getTime() : Infinity;
    if (!force && state.weatherCache?.data?.hourly && age < 30 * 60 * 1000) {
      renderHomeWeather(state.weatherCache.data);
      renderTripWeather(state.weatherCache.data);
      return;
    }
    $$('[data-action="refresh-weather"]').forEach((button) => { button.disabled = true; });
    weatherRequest = fetch(WEATHER_URL, { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        state.weatherCache = { data, fetchedAt: new Date().toISOString() };
        saveState(false);
        renderHomeWeather(data);
        renderTripWeather(data);
        if (force) showToast("날씨를 업데이트했습니다");
      })
      .catch((error) => {
        console.warn("날씨를 불러오지 못했습니다.", error);
        if (state.weatherCache) {
          renderHomeWeather(state.weatherCache.data);
          renderTripWeather(state.weatherCache.data, true);
        }
        if (force) showToast("날씨를 불러오지 못했습니다", true);
      })
      .finally(() => {
        $$('[data-action="refresh-weather"]').forEach((button) => { button.disabled = false; });
        weatherRequest = null;
      });
    return weatherRequest;
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
      pill.append(createElement("span", "", person.active ? person.name : `${person.name} · 이전 내역`));
      if (person.active && !FIXED_PARTICIPANT_IDS.has(person.id)) {
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
    state.participants.forEach((person) => {
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
    if ($("#settlementSubline")) $("#settlementSubline").textContent = state.expenses.length ? `${state.participants.length}명 기준` : "지출을 추가해 주세요";
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
    if (today < TRIP_DAYS[0].date) return "prepare";
    if (today > TRIP_DAYS[TRIP_DAYS.length - 1].date) return "settle";
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

  function openItineraryDialog(prefill = null) {
    const dialog = $("#itineraryDialog");
    const form = $("#itineraryForm");
    if (!dialog || !form) return;
    form.reset();
    $("#itineraryDate").value = state.ui.activeDate;
    if (prefill) {
      $("#itineraryTitle").value = prefill.description;
      $("#itineraryPlace").value = prefill.name;
    }
    const day = selectedDay();
    $("#itineraryDialogDate").textContent = `8월 ${day.number}일`;
    dialog.showModal();
    window.setTimeout(() => $("#itineraryTitle")?.focus(), 50);
  }

  function closeDialog(selector) {
    const dialog = $(selector);
    if (dialog && dialog.open) dialog.close();
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
    $("#expenseDate").value = state.ui.activeDate;
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
        date: /^\d{4}-\d{2}-\d{2}$/.test(formData.get("date")) ? formData.get("date") : START_DATE,
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
    if (FIXED_PARTICIPANT_IDS.has(id)) {
      showToast("민제·준호·주영·준혁은 개인 체크리스트가 있어 삭제할 수 없습니다", true);
      return;
    }
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
      showToast("참가자를 삭제했습니다");
    }
    saveState(false);
    renderSettlement();
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
      for (const record of records) {
        receipts.push({ expenseId: record.expenseId, name: record.name, type: record.type, dataUrl: await blobToDataUrl(record.blob) });
      }
      const payload = { appId: "trip-hongkong", formatVersion: 2, exportedAt: new Date().toISOString(), state, receipts };
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
      const incoming = normalizeState(parsed.state || parsed);
      const receiptRows = Array.isArray(parsed.receipts) ? parsed.receipts.slice(0, 1000) : [];
      if (!window.confirm("현재 내용을 백업 파일의 내용으로 바꿀까요?")) return;
      await clearReceipts().catch(() => {});
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
    if (!window.confirm("참가자, 지출과 영수증을 모두 초기화할까요?")) return;
    const fresh = defaultState();
    state.participants = fresh.participants;
    state.expenses = [];
    await clearReceipts().catch(() => {});
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
      setActiveDate(dateButton.dataset.date, true);
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
    if (action === "refresh-weather") fetchWeather(true);
    if (action === "refresh-rate") fetchRate(true);
    if (action === "toggle-theme") toggleTheme();
    if (action === "open-itinerary") openItineraryDialog();
    if (action === "close-itinerary") closeDialog("#itineraryDialog");
    if (action === "open-expense") openExpenseDialog();
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
    document.addEventListener("change", (event) => {
      const ownerInput = event.target.closest("[data-check-owner]");
      if (ownerInput && ownerInput.checked && CHECK_OWNER_IDS.has(ownerInput.dataset.checkOwner)) {
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
      const formData = new FormData(event.currentTarget);
      const title = cleanText(formData.get("title"), 80);
      if (!title) return;
      const date = VALID_DATES.has(formData.get("date")) ? formData.get("date") : state.ui.activeDate;
      state.itinerary.push({ id: makeId("plan"), date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(formData.get("time")) ? formData.get("time") : "", status: "custom", title, place: cleanText(formData.get("place"), 100), note: cleanText(formData.get("note"), 180) });
      state.ui.activeDate = date;
      saveState(false);
      closeDialog("#itineraryDialog");
      renderTrip();
      showToast("일정을 저장했습니다");
    });

    $("#personForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = cleanText(new FormData(event.currentTarget).get("name"), 30);
      if (!name) return;
      if (state.participants.some((person) => person.active && person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        showToast("같은 이름의 참가자가 있습니다", true);
        return;
      }
      state.participants.push({ id: makeId("person"), name, active: true, createdAt: new Date().toISOString() });
      event.currentTarget.reset();
      saveState(false);
      renderSettlement();
      showToast("참가자를 추가했습니다");
    });

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
      const current = TRIP_DAYS.findIndex((day) => day.date === state.ui.activeDate);
      let next = current;
      if (event.key === "ArrowLeft") next = (current - 1 + TRIP_DAYS.length) % TRIP_DAYS.length;
      if (event.key === "ArrowRight") next = (current + 1) % TRIP_DAYS.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = TRIP_DAYS.length - 1;
      setActiveDate(TRIP_DAYS[next].date, true);
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
        state = normalizeState(JSON.parse(event.newValue));
        renderPage();
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
