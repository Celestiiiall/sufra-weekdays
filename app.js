const STORAGE_KEY = "sufra-weekdays-v1";
const WEEKDAYS = [
  { key: "monday", label: "Monday", shortLabel: "Mon" },
  { key: "tuesday", label: "Tuesday", shortLabel: "Tue" },
  { key: "wednesday", label: "Wednesday", shortLabel: "Wed" },
  { key: "thursday", label: "Thursday", shortLabel: "Thu" },
  { key: "friday", label: "Friday", shortLabel: "Fri" },
];
const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

const weekdayOrder = new Map(WEEKDAYS.map((day, index) => [day.key, index]));
const mealTypeOrder = new Map(MEAL_TYPES.map((type, index) => [type.key, index]));

const dom = {
  planForm: document.getElementById("plan-form"),
  planTitle: document.getElementById("plan-title"),
  weekOf: document.getElementById("week-of"),
  householdSize: document.getElementById("household-size"),
  planNote: document.getElementById("plan-note"),
  weekRange: document.getElementById("week-range"),
  heroPlanName: document.getElementById("hero-plan-name"),
  planFocusDisplay: document.getElementById("plan-focus-display"),
  exportPlan: document.getElementById("export-plan"),
  clearPlan: document.getElementById("clear-plan"),
  mealForm: document.getElementById("meal-form"),
  composerHeading: document.getElementById("composer-heading"),
  mealDay: document.getElementById("meal-day"),
  mealType: document.getElementById("meal-type"),
  mealTitle: document.getElementById("meal-title"),
  mealPrep: document.getElementById("meal-prep"),
  mealIngredients: document.getElementById("meal-ingredients"),
  mealNotes: document.getElementById("meal-notes"),
  mealLinks: document.getElementById("meal-links"),
  editingMealId: document.getElementById("editing-meal-id"),
  submitMeal: document.getElementById("submit-meal"),
  cancelEdit: document.getElementById("cancel-edit"),
  searchQuery: document.getElementById("search-query"),
  filterDay: document.getElementById("filter-day"),
  filterLinks: document.getElementById("filter-links"),
  statMeals: document.getElementById("stat-meals"),
  statDays: document.getElementById("stat-days"),
  statLinks: document.getElementById("stat-links"),
  statPrep: document.getElementById("stat-prep"),
  weekdayBoard: document.getElementById("weekday-board"),
  dayColumnTemplate: document.getElementById("day-column-template"),
  mealCardTemplate: document.getElementById("meal-card-template"),
};

const state = loadState();

init();

function init() {
  syncPlanForm();
  syncFilterControls();
  resetMealForm();

  dom.planForm.addEventListener("submit", handleSavePlan);
  dom.mealForm.addEventListener("submit", handleSubmitMeal);
  dom.cancelEdit.addEventListener("click", () => resetMealForm({ preserveDay: true }));
  dom.exportPlan.addEventListener("click", exportPlanAsJson);
  dom.clearPlan.addEventListener("click", clearWeek);

  dom.searchQuery.addEventListener("input", (event) => {
    state.filters.query = normalizeText(event.target.value);
    saveState();
    render();
  });

  dom.filterDay.addEventListener("change", (event) => {
    state.filters.day = normalizeFilterDay(event.target.value);
    saveState();
    render();
  });

  dom.filterLinks.addEventListener("change", (event) => {
    state.filters.links = normalizeLinkFilter(event.target.value);
    saveState();
    render();
  });

  render();
  registerServiceWorker();
}

function handleSavePlan(event) {
  event.preventDefault();

  state.plan = collectPlanFromForm();
  saveState();
  syncPlanForm();
  render();
}

function handleSubmitMeal(event) {
  event.preventDefault();

  const editingId = dom.editingMealId.value || null;
  const currentMeal = editingId ? state.meals.find((meal) => meal.id === editingId) : null;
  const nextMeal = collectMealFromForm(currentMeal);

  if (!nextMeal) {
    return;
  }

  if (editingId && currentMeal) {
    const index = state.meals.findIndex((meal) => meal.id === editingId);
    if (index !== -1) {
      state.meals[index] = nextMeal;
    }
  } else {
    state.meals.push(nextMeal);
  }

  saveState();
  render();
  resetMealForm({ preserveDay: true });
}

function collectPlanFromForm() {
  return {
    title: normalizeTitle(dom.planTitle.value, "Weekday Flow"),
    weekOf: normalizeWeekOf(dom.weekOf.value || getMondayInput()),
    householdSize: normalizeHouseholdSize(dom.householdSize.value),
    note: normalizeParagraph(dom.planNote.value, 220),
  };
}

function collectMealFromForm(currentMeal = null) {
  const title = normalizeTitle(dom.mealTitle.value, "");
  if (!title) {
    dom.mealTitle.focus();
    return null;
  }

  const { links, invalid } = parseVideoLinks(dom.mealLinks.value);
  if (invalid.length) {
    window.alert(`These links could not be saved:\n${invalid.join("\n")}`);
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: currentMeal?.id || newId(),
    day: normalizeWeekday(dom.mealDay.value),
    mealType: normalizeMealType(dom.mealType.value),
    title,
    prepMinutes: normalizePrepMinutes(dom.mealPrep.value),
    ingredients: parseIngredients(dom.mealIngredients.value),
    notes: normalizeParagraph(dom.mealNotes.value, 320),
    videoLinks: links,
    createdAt: currentMeal?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

function render() {
  renderHero();
  renderStats();
  renderBoard();
}

function renderHero() {
  dom.weekRange.textContent = formatWeekRange(state.plan.weekOf);
  dom.heroPlanName.textContent = `${state.plan.title} · ${formatHouseholdSize(state.plan.householdSize)}`;
  dom.planFocusDisplay.textContent =
    state.plan.note || "Add a week focus so the planner stays practical.";
}

function renderStats() {
  const totalMeals = state.meals.length;
  const daysCovered = new Set(state.meals.map((meal) => meal.day)).size;
  const totalLinks = state.meals.reduce((sum, meal) => sum + meal.videoLinks.length, 0);

  const prepValues = state.meals
    .map((meal) => meal.prepMinutes)
    .filter((value) => Number.isFinite(value));
  const averagePrep = prepValues.length
    ? Math.round(prepValues.reduce((sum, value) => sum + value, 0) / prepValues.length)
    : null;

  dom.statMeals.textContent = String(totalMeals);
  dom.statDays.textContent = `${daysCovered} / 5`;
  dom.statLinks.textContent = String(totalLinks);
  dom.statPrep.textContent = averagePrep === null ? "-" : `${averagePrep} min`;
}

function renderBoard() {
  dom.weekdayBoard.innerHTML = "";

  const daysToRender =
    state.filters.day === "all"
      ? WEEKDAYS
      : WEEKDAYS.filter((day) => day.key === state.filters.day);

  daysToRender.forEach((day) => {
    const fragment = dom.dayColumnTemplate.content.cloneNode(true);
    const column = fragment.querySelector(".day-column");
    const nameEl = fragment.querySelector(".day-name");
    const dateEl = fragment.querySelector(".day-date");
    const summaryEl = fragment.querySelector(".day-summary");
    const mealsEl = fragment.querySelector(".day-meals");
    const emptyEl = fragment.querySelector(".day-empty");

    const date = addDays(parseDateInput(state.plan.weekOf), weekdayOrder.get(day.key));
    const allMeals = sortMeals(state.meals.filter((meal) => meal.day === day.key));
    const visibleMeals = getVisibleMeals(allMeals);

    nameEl.textContent = day.label;
    dateEl.textContent = formatColumnDate(date);
    summaryEl.textContent = formatDaySummary(allMeals);

    visibleMeals.forEach((meal) => {
      mealsEl.appendChild(renderMealCard(meal));
    });

    const hasFilters = Boolean(state.filters.query || state.filters.day !== "all" || state.filters.links !== "all");
    const showEmpty = visibleMeals.length === 0;

    emptyEl.textContent = showEmpty
      ? hasFilters && allMeals.length
        ? "Meals exist here, but none match the current filters."
        : "No meals planned for this day yet."
      : "";
    emptyEl.classList.toggle("hidden", !showEmpty);

    dom.weekdayBoard.appendChild(column);
  });
}

function renderMealCard(meal) {
  const fragment = dom.mealCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".meal-card");
  const mealTypePill = fragment.querySelector(".meal-type-pill");
  const prepEl = fragment.querySelector(".meal-prep");
  const titleEl = fragment.querySelector(".meal-card-title");
  const notesEl = fragment.querySelector(".meal-card-notes");
  const ingredientsEl = fragment.querySelector(".ingredient-chips");
  const videoLinksEl = fragment.querySelector(".video-link-row");
  const embedStackEl = fragment.querySelector(".embed-stack");
  const editButton = fragment.querySelector(".edit");
  const removeButton = fragment.querySelector(".remove");

  mealTypePill.textContent = labelForMealType(meal.mealType);
  prepEl.textContent = meal.prepMinutes === null ? "Prep flexible" : `${meal.prepMinutes} min`;
  titleEl.textContent = meal.title;

  notesEl.textContent = meal.notes;
  notesEl.classList.toggle("hidden", !meal.notes);

  ingredientsEl.innerHTML = "";
  meal.ingredients.forEach((ingredient) => {
    const chip = document.createElement("li");
    chip.textContent = ingredient;
    ingredientsEl.appendChild(chip);
  });
  ingredientsEl.classList.toggle("hidden", meal.ingredients.length === 0);

  videoLinksEl.innerHTML = "";
  embedStackEl.innerHTML = "";

  meal.videoLinks.forEach((url, index) => {
    const metadata = describeVideoLink(url);
    const link = document.createElement("a");
    link.className = "video-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = metadata.linkLabel || `Video ${index + 1}`;
    videoLinksEl.appendChild(link);

    if (metadata.embedUrl) {
      embedStackEl.appendChild(createEmbedPreview(metadata));
    }
  });

  videoLinksEl.classList.toggle("hidden", meal.videoLinks.length === 0);
  embedStackEl.classList.toggle(
    "hidden",
    !meal.videoLinks.some((url) => Boolean(describeVideoLink(url).embedUrl)),
  );

  editButton.addEventListener("click", () => startEditingMeal(meal.id));
  removeButton.addEventListener("click", () => removeMeal(meal.id));

  return card;
}

function createEmbedPreview(metadata) {
  const details = document.createElement("details");
  details.className = "embed-preview";

  const summary = document.createElement("summary");
  summary.textContent = `Preview ${metadata.providerLabel}`;

  const frame = document.createElement("div");
  frame.className = "embed-frame";

  const iframe = document.createElement("iframe");
  iframe.loading = "lazy";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.src = metadata.embedUrl;
  iframe.title = metadata.providerLabel;

  frame.appendChild(iframe);
  details.append(summary, frame);

  return details;
}

function startEditingMeal(mealId) {
  const meal = state.meals.find((item) => item.id === mealId);
  if (!meal) {
    return;
  }

  dom.composerHeading.textContent = "Edit Dish";
  dom.submitMeal.textContent = "Save Changes";
  dom.cancelEdit.classList.remove("hidden");
  dom.editingMealId.value = meal.id;
  dom.mealDay.value = meal.day;
  dom.mealType.value = meal.mealType;
  dom.mealTitle.value = meal.title;
  dom.mealPrep.value = meal.prepMinutes === null ? "" : String(meal.prepMinutes);
  dom.mealIngredients.value = meal.ingredients.join(", ");
  dom.mealNotes.value = meal.notes;
  dom.mealLinks.value = meal.videoLinks.join("\n");

  dom.mealForm.scrollIntoView({ behavior: "smooth", block: "start" });
  dom.mealTitle.focus();
}

function removeMeal(mealId) {
  const meal = state.meals.find((item) => item.id === mealId);
  if (!meal) {
    return;
  }

  const shouldRemove = window.confirm(`Remove "${meal.title}" from the week?`);
  if (!shouldRemove) {
    return;
  }

  state.meals = state.meals.filter((item) => item.id !== mealId);
  saveState();
  render();

  if (dom.editingMealId.value === mealId) {
    resetMealForm({ preserveDay: true });
  }
}

function exportPlanAsJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    plan: state.plan,
    meals: sortMeals(state.meals),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sufra-weekdays-${state.plan.weekOf}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearWeek() {
  const shouldClear = window.confirm("Clear the saved week details and all planned meals?");
  if (!shouldClear) {
    return;
  }

  state.plan = getDefaultPlan();
  state.meals = [];
  state.filters = getDefaultFilters();

  saveState();
  syncPlanForm();
  syncFilterControls();
  resetMealForm();
  render();
}

function resetMealForm(options = {}) {
  dom.composerHeading.textContent = "Compose a Dish";
  dom.submitMeal.textContent = "Add to Week";
  dom.cancelEdit.classList.add("hidden");
  dom.editingMealId.value = "";
  dom.mealType.value = "dinner";
  dom.mealTitle.value = "";
  dom.mealPrep.value = "";
  dom.mealIngredients.value = "";
  dom.mealNotes.value = "";
  dom.mealLinks.value = "";

  if (!options.preserveDay || !WEEKDAYS.some((day) => day.key === dom.mealDay.value)) {
    dom.mealDay.value = getDefaultMealDay();
  }
}

function syncPlanForm() {
  dom.planTitle.value = state.plan.title;
  dom.weekOf.value = state.plan.weekOf;
  dom.householdSize.value = String(state.plan.householdSize);
  dom.planNote.value = state.plan.note;
}

function syncFilterControls() {
  dom.searchQuery.value = state.filters.query;
  dom.filterDay.value = state.filters.day;
  dom.filterLinks.value = state.filters.links;
}

function getVisibleMeals(meals) {
  return meals.filter((meal) => {
    if (state.filters.day !== "all" && meal.day !== state.filters.day) {
      return false;
    }

    if (state.filters.links === "video" && meal.videoLinks.length === 0) {
      return false;
    }

    if (
      state.filters.links === "embed" &&
      !meal.videoLinks.some((url) => Boolean(describeVideoLink(url).embedUrl))
    ) {
      return false;
    }

    if (!state.filters.query) {
      return true;
    }

    const searchTarget = [
      meal.title,
      meal.notes,
      meal.ingredients.join(" "),
      meal.videoLinks.join(" "),
      labelForMealType(meal.mealType),
    ]
      .join(" ")
      .toLowerCase();

    return searchTarget.includes(state.filters.query.toLowerCase());
  });
}

function sortMeals(meals) {
  return [...meals].sort((left, right) => {
    const dayDelta = weekdayOrder.get(left.day) - weekdayOrder.get(right.day);
    if (dayDelta !== 0) {
      return dayDelta;
    }

    const mealDelta = mealTypeOrder.get(left.mealType) - mealTypeOrder.get(right.mealType);
    if (mealDelta !== 0) {
      return mealDelta;
    }

    const prepDelta = (left.prepMinutes ?? Number.POSITIVE_INFINITY) - (right.prepMinutes ?? Number.POSITIVE_INFINITY);
    if (prepDelta !== 0) {
      return prepDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

function loadState() {
  const fallback = {
    plan: getDefaultPlan(),
    meals: [],
    filters: getDefaultFilters(),
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return {
      plan: sanitizePlan(parsed?.plan),
      meals: sanitizeMeals(parsed?.meals),
      filters: sanitizeFilters(parsed?.filters),
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizePlan(plan) {
  return {
    title: normalizeTitle(plan?.title, "Weekday Flow"),
    weekOf: normalizeWeekOf(plan?.weekOf || getMondayInput()),
    householdSize: normalizeHouseholdSize(plan?.householdSize),
    note: normalizeParagraph(plan?.note, 220),
  };
}

function sanitizeMeals(meals) {
  if (!Array.isArray(meals)) {
    return [];
  }

  return meals.reduce((list, meal) => {
    const title = normalizeTitle(meal?.title, "");
    if (!title) {
      return list;
    }

    list.push({
      id: typeof meal?.id === "string" && meal.id ? meal.id : newId(),
      day: normalizeWeekday(meal?.day),
      mealType: normalizeMealType(meal?.mealType),
      title,
      prepMinutes: normalizePrepMinutes(meal?.prepMinutes),
      ingredients: Array.isArray(meal?.ingredients)
        ? meal.ingredients.map((item) => normalizeIngredient(item)).filter(Boolean)
        : [],
      notes: normalizeParagraph(meal?.notes, 320),
      videoLinks: Array.isArray(meal?.videoLinks)
        ? meal.videoLinks.map((link) => normalizeUrl(link)).filter(Boolean)
        : [],
      createdAt: typeof meal?.createdAt === "string" ? meal.createdAt : new Date().toISOString(),
      updatedAt: typeof meal?.updatedAt === "string" ? meal.updatedAt : new Date().toISOString(),
    });

    return list;
  }, []);
}

function sanitizeFilters(filters) {
  return {
    query: normalizeText(filters?.query),
    day: normalizeFilterDay(filters?.day),
    links: normalizeLinkFilter(filters?.links),
  };
}

function getDefaultPlan() {
  return {
    title: "Weekday Flow",
    weekOf: getMondayInput(),
    householdSize: 4,
    note: "",
  };
}

function getDefaultFilters() {
  return {
    query: "",
    day: "all",
    links: "all",
  };
}

function normalizeWeekday(value) {
  return WEEKDAYS.some((day) => day.key === value) ? value : "monday";
}

function normalizeMealType(value) {
  return MEAL_TYPES.some((type) => type.key === value) ? value : "dinner";
}

function normalizeFilterDay(value) {
  return value === "all" || WEEKDAYS.some((day) => day.key === value) ? value : "all";
}

function normalizeLinkFilter(value) {
  return ["all", "video", "embed"].includes(value) ? value : "all";
}

function normalizeTitle(value, fallback = "") {
  const text = normalizeText(value).slice(0, 80);
  return text || fallback;
}

function normalizeParagraph(value, maxLength) {
  return normalizeText(value).slice(0, maxLength);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeHouseholdSize(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return 4;
  }

  return Math.min(20, Math.max(1, number));
}

function normalizePrepMinutes(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(600, Math.max(0, number));
}

function parseIngredients(value) {
  if (typeof value !== "string") {
    return [];
  }

  const seen = new Set();

  return value
    .split(/[\n,]/)
    .map((item) => normalizeIngredient(item))
    .filter((item) => {
      if (!item || seen.has(item.toLowerCase())) {
        return false;
      }
      seen.add(item.toLowerCase());
      return true;
    })
    .slice(0, 16);
}

function normalizeIngredient(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : "";
}

function parseVideoLinks(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { links: [], invalid: [] };
  }

  const links = [];
  const invalid = [];
  const seen = new Set();

  value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const normalized = normalizeUrl(item);
      if (!normalized) {
        invalid.push(item);
        return;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      links.push(normalized);
    });

  return { links, invalid };
}

function normalizeUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function describeVideoLink(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return { providerLabel: "Video link", linkLabel: "Open recipe link", embedUrl: null };
  }

  const host = parsed.hostname.replace(/^www\./, "");

  const youtubeId = getYouTubeId(parsed);
  if (youtubeId) {
    return {
      providerLabel: "YouTube",
      linkLabel: "YouTube",
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
    };
  }

  const vimeoId = getVimeoId(parsed);
  if (vimeoId) {
    return {
      providerLabel: "Vimeo",
      linkLabel: "Vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
    };
  }

  if (host.includes("instagram.com")) {
    return {
      providerLabel: "Instagram",
      linkLabel: "Instagram",
      embedUrl: null,
    };
  }

  if (host.includes("tiktok.com")) {
    return {
      providerLabel: "TikTok",
      linkLabel: "TikTok",
      embedUrl: null,
    };
  }

  return {
    providerLabel: host || "Video link",
    linkLabel: host || "Open recipe link",
    embedUrl: null,
  };
}

function getYouTubeId(url) {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    return cleanVideoId(url.pathname.slice(1));
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      return cleanVideoId(url.searchParams.get("v"));
    }

    if (url.pathname.startsWith("/shorts/")) {
      return cleanVideoId(url.pathname.split("/")[2]);
    }

    if (url.pathname.startsWith("/embed/")) {
      return cleanVideoId(url.pathname.split("/")[2]);
    }
  }

  return null;
}

function getVimeoId(url) {
  const host = url.hostname.replace(/^www\./, "");
  if (!host.includes("vimeo.com")) {
    return null;
  }

  const match = url.pathname.match(/\/(\d+)/);
  return match ? match[1] : null;
}

function cleanVideoId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatWeekRange(weekOf) {
  const start = parseDateInput(weekOf);
  const end = addDays(start, 4);

  const startText = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(start);
  const endText = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(end);

  return `${startText} - ${endText}`;
}

function formatColumnDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDaySummary(meals) {
  if (!meals.length) {
    return "Open slot";
  }

  const prepTotal = meals
    .map((meal) => meal.prepMinutes)
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);

  if (!prepTotal) {
    return `${meals.length} meal${meals.length === 1 ? "" : "s"}`;
  }

  return `${meals.length} meal${meals.length === 1 ? "" : "s"} · ${prepTotal} min`;
}

function formatHouseholdSize(size) {
  return `${size} ${size === 1 ? "person" : "people"}`;
}

function labelForMealType(value) {
  return MEAL_TYPES.find((type) => type.key === value)?.label || "Dinner";
}

function parseDateInput(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, 12);

  if (!Number.isFinite(date.getTime())) {
    return parseDateInput(getMondayInput());
  }

  return date;
}

function getMondayInput() {
  return toDateInput(startOfWeek(new Date()));
}

function normalizeWeekOf(value) {
  return toDateInput(startOfWeek(parseDateInput(value)));
}

function startOfWeek(date) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);

  const weekday = monday.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  monday.setDate(monday.getDate() + delta);

  return monday;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateInput(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultMealDay() {
  const weekday = new Date().getDay();
  if (weekday >= 1 && weekday <= 5) {
    return WEEKDAYS[weekday - 1].key;
  }

  return "monday";
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `meal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js?v=20250321-1", { updateViaCache: "none" })
      .catch(() => {});
  });
}
