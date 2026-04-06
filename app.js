const APP_TITLE = "Sufra Recipes";
const RECIPE_TITLE_LIMIT = 140;
const RECIPE_NOTES_LIMIT = 2000;
const STORAGE_KEY = "sufra-recipe-picker-v1";
const LEGACY_STORAGE_KEY = "sufra-weekdays-v1";
const THEME_STORAGE_KEY = "sufra-weekdays-theme";
const SHARE_HASH_PREFIX = "#pool=";
const SERVICE_WORKER_URL = "./service-worker.js?v=20260320-8";
const THEME_COLORS = {
  light: "#efe3ce",
  dark: "#111827",
};

const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

const mealTypeOrder = new Map(MEAL_TYPES.map((type, index) => [type.key, index]));
const statusOrder = new Map([
  ["current", 0],
  ["available", 1],
  ["used", 2],
]);

const dom = {
  themeToggle: document.getElementById("theme-toggle"),
  sharePool: document.getElementById("share-pool"),
  importShared: document.getElementById("import-shared"),
  exportPool: document.getElementById("export-pool"),
  clearPool: document.getElementById("clear-pool"),
  shareFeedback: document.getElementById("share-feedback"),
  sharedBanner: document.getElementById("shared-banner"),
  sharedBannerText: document.getElementById("shared-banner-text"),
  importSharedLink: document.getElementById("import-shared-link"),
  dismissSharedLink: document.getElementById("dismiss-shared-link"),
  poolSummary: document.getElementById("pool-summary"),
  heroCollectionName: document.getElementById("hero-collection-name"),
  poolStatusDisplay: document.getElementById("pool-status-display"),
  recipeForm: document.getElementById("recipe-form"),
  composerHeading: document.getElementById("composer-heading"),
  recipeType: document.getElementById("recipe-type"),
  recipeTitle: document.getElementById("recipe-title"),
  recipePrep: document.getElementById("recipe-prep"),
  recipeIngredients: document.getElementById("recipe-ingredients"),
  recipeNotes: document.getElementById("recipe-notes"),
  recipeLinks: document.getElementById("recipe-links"),
  editingRecipeId: document.getElementById("editing-recipe-id"),
  submitRecipe: document.getElementById("submit-recipe"),
  cancelEdit: document.getElementById("cancel-edit"),
  pickerCount: document.getElementById("picker-count"),
  pickRecipes: document.getElementById("pick-recipes"),
  pickerFeedback: document.getElementById("picker-feedback"),
  currentPicks: document.getElementById("current-picks"),
  searchQuery: document.getElementById("search-query"),
  filterType: document.getElementById("filter-type"),
  filterAvailability: document.getElementById("filter-availability"),
  statRecipes: document.getElementById("stat-recipes"),
  statAvailable: document.getElementById("stat-available"),
  statUsed: document.getElementById("stat-used"),
  statLinks: document.getElementById("stat-links"),
  boardTitle: document.getElementById("board-title"),
  boardCopy: document.getElementById("board-copy"),
  recipeBoard: document.getElementById("recipe-board"),
  recipeCardTemplate: document.getElementById("recipe-card-template"),
  currentPickTemplate: document.getElementById("current-pick-template"),
};

let state = loadState();
let pendingSharedPayload = readSharedPayloadFromLocation();

init();

function init() {
  applyTheme(loadThemePreference());
  syncFilterControls();
  syncPickerControls();
  resetRecipeForm();
  renderSharedNotice();

  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.recipeForm.addEventListener("submit", handleSubmitRecipe);
  dom.cancelEdit.addEventListener("click", () => resetRecipeForm({ preserveType: true }));
  dom.sharePool.addEventListener("click", handleSharePool);
  dom.importShared.addEventListener("click", handleImportPrompt);
  dom.exportPool.addEventListener("click", exportRecipesAsJson);
  dom.clearPool.addEventListener("click", clearRecipes);
  dom.importSharedLink.addEventListener("click", () => {
    if (pendingSharedPayload) {
      importSharedPayload(pendingSharedPayload);
    }
  });
  dom.dismissSharedLink.addEventListener("click", () => dismissSharedNotice({ clearHash: true }));

  dom.searchQuery.addEventListener("input", (event) => {
    state.filters.query = String(event.target.value || "").slice(0, 120);
    saveState();
    render();
  });

  dom.filterType.addEventListener("change", (event) => {
    state.filters.type = normalizeMealTypeFilter(event.target.value);
    saveState();
    render();
  });

  dom.filterAvailability.addEventListener("change", (event) => {
    state.filters.availability = normalizeAvailability(event.target.value);
    saveState();
    render();
  });

  dom.pickerCount.addEventListener("change", (event) => {
    state.picker.pickCount = normalizePickCount(event.target.value);
    saveState();
  });

  dom.pickRecipes.addEventListener("click", pickRecipesWithoutRepeats);
  window.addEventListener("hashchange", handleHashChange);

  render();
  registerServiceWorker();
}

function createDefaultState() {
  return {
    collection: {
      title: APP_TITLE,
    },
    recipes: [],
    cycle: {
      usedRecipeIds: [],
      currentPickIds: [],
    },
    picker: {
      pickCount: 1,
    },
    filters: {
      query: "",
      type: "all",
      availability: "all",
    },
  };
}

function loadState() {
  const stored = readJsonFromStorage(STORAGE_KEY);
  if (stored) {
    return normalizeState(stored);
  }

  const legacy = readJsonFromStorage(LEGACY_STORAGE_KEY);
  if (legacy) {
    const migrated = normalizeState(legacy);
    writeJsonToStorage(STORAGE_KEY, migrated);
    return migrated;
  }

  return createDefaultState();
}

function readJsonFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeJsonToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    return false;
  }

  return true;
}

function saveState() {
  writeJsonToStorage(STORAGE_KEY, state);
}

function normalizeState(raw) {
  const baseState = isLegacyPlannerState(raw) ? migrateLegacyPlannerState(raw) : raw;
  const defaults = createDefaultState();
  const recipes = Array.isArray(baseState?.recipes)
    ? baseState.recipes.map(normalizeRecipe).filter(Boolean)
    : [];
  const recipeIdSet = new Set(recipes.map((recipe) => recipe.id));
  const currentPickIds = uniqueIds(baseState?.cycle?.currentPickIds).filter((id) => recipeIdSet.has(id));
  const usedRecipeIds = uniqueIds([
    ...(Array.isArray(baseState?.cycle?.usedRecipeIds) ? baseState.cycle.usedRecipeIds : []),
    ...currentPickIds,
  ]).filter((id) => recipeIdSet.has(id));

  return {
    collection: {
      title: normalizeTitle(baseState?.collection?.title, defaults.collection.title),
    },
    recipes,
    cycle: {
      usedRecipeIds,
      currentPickIds,
    },
    picker: {
      pickCount: normalizePickCount(baseState?.picker?.pickCount),
    },
    filters: {
      query: String(baseState?.filters?.query || "").slice(0, 120),
      type: normalizeMealTypeFilter(baseState?.filters?.type),
      availability: normalizeAvailability(baseState?.filters?.availability),
    },
  };
}

function isLegacyPlannerState(raw) {
  return Boolean(raw && typeof raw === "object" && Array.isArray(raw.meals));
}

function migrateLegacyPlannerState(raw) {
  const nowIso = new Date().toISOString();

  return {
    collection: {
      title: APP_TITLE,
    },
    recipes: (Array.isArray(raw?.meals) ? raw.meals : []).map((meal) => ({
      id: typeof meal?.id === "string" && meal.id ? meal.id : newId(),
      mealType: normalizeMealType(meal?.mealType),
      title: normalizeTitle(meal?.title, "", RECIPE_TITLE_LIMIT),
      prepMinutes: normalizePrepMinutes(meal?.prepMinutes),
      ingredients: normalizeIngredients(meal?.ingredients),
      notes: normalizeParagraph(meal?.notes, RECIPE_NOTES_LIMIT),
      links: normalizeImportedLinks(meal?.videoLinks),
      createdAt: normalizeIsoDate(meal?.createdAt) || nowIso,
      updatedAt: normalizeIsoDate(meal?.updatedAt) || nowIso,
    })),
    cycle: {
      usedRecipeIds: [],
      currentPickIds: [],
    },
    picker: {
      pickCount: 1,
    },
    filters: {
      query: "",
      type: "all",
      availability: "all",
    },
  };
}

function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const title = normalizeTitle(raw.title, "", RECIPE_TITLE_LIMIT);
  if (!title) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    mealType: normalizeMealType(raw.mealType || raw.type),
    title,
    prepMinutes: normalizePrepMinutes(raw.prepMinutes),
    ingredients: normalizeIngredients(raw.ingredients),
    notes: normalizeParagraph(raw.notes, RECIPE_NOTES_LIMIT),
    links: normalizeImportedLinks(raw.links || raw.videoLinks),
    createdAt: normalizeIsoDate(raw.createdAt) || nowIso,
    updatedAt: normalizeIsoDate(raw.updatedAt) || nowIso,
  };
}

function normalizeImportedLinks(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const links = [];

  for (const item of input) {
    if (typeof item === "string") {
      const parsed = parseLinkInput(item);
      if (parsed) {
        links.push(parsed);
      }
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const parsed = buildLinkRecord(item.url, item.label || item.title || item.host, item.id);
    if (parsed) {
      links.push(parsed);
    }
  }

  return dedupeLinks(links);
}

function loadThemePreference() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return "light";
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
}

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);

  const isDark = normalizedTheme === "dark";
  dom.themeToggle.textContent = isDark ? "Day Mode" : "Night Mode";
  dom.themeToggle.setAttribute("aria-pressed", String(isDark));

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", THEME_COLORS[normalizedTheme]);
  }
}

function handleSubmitRecipe(event) {
  event.preventDefault();

  const editingId = dom.editingRecipeId.value || null;
  const currentRecipe = editingId ? state.recipes.find((recipe) => recipe.id === editingId) : null;
  const nextRecipe = collectRecipeFromForm(currentRecipe);

  if (!nextRecipe) {
    return;
  }

  if (editingId && currentRecipe) {
    const index = state.recipes.findIndex((recipe) => recipe.id === editingId);
    if (index !== -1) {
      state.recipes[index] = nextRecipe;
    }
    setShareFeedback("Recipe updated.", "ok");
  } else {
    state.recipes.push(nextRecipe);
    setShareFeedback("Recipe saved to your library.", "ok");
  }

  sanitizeCycle();
  saveState();
  render();
  resetRecipeForm({ preserveType: true });
}

function collectRecipeFromForm(currentRecipe = null) {
  const title = normalizeTitle(dom.recipeTitle.value, "", RECIPE_TITLE_LIMIT);
  if (!title) {
    dom.recipeTitle.focus();
    return null;
  }

  const { links, invalid } = parseRecipeLinks(dom.recipeLinks.value);
  if (invalid.length) {
    window.alert(`These links could not be saved:\n${invalid.join("\n")}`);
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: currentRecipe?.id || newId(),
    mealType: normalizeMealType(dom.recipeType.value),
    title,
    prepMinutes: normalizePrepMinutes(dom.recipePrep.value),
    ingredients: parseIngredients(dom.recipeIngredients.value),
    notes: normalizeParagraph(dom.recipeNotes.value, RECIPE_NOTES_LIMIT),
    links,
    createdAt: currentRecipe?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

async function handleSharePool() {
  if (!state.recipes.length) {
    setShareFeedback("Add at least one recipe before sharing.", "warn");
    return;
  }

  const shareUrl = buildShareUrl();
  if (!shareUrl) {
    setShareFeedback("This library is too large for a share link. Use Export JSON instead.", "warn");
    return;
  }

  const shareData = {
    title: APP_TITLE,
    text: `${state.recipes.length} saved recipes ready for automatic rounds`,
    url: shareUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      setShareFeedback("Recipes shared.", "ok");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  const copied = await copyText(shareUrl);
  if (copied) {
    setShareFeedback("Share link copied to clipboard.", "ok");
    return;
  }

  window.prompt("Copy this recipe-library share link.", shareUrl);
  setShareFeedback("Share link ready.", "ok");
}

function handleImportPrompt() {
  const value = window.prompt("Paste a Sufra share link, share token, or exported JSON.");
  if (!value) {
    return;
  }

  const payload = decodeSharedInput(value);
  if (!payload) {
    setShareFeedback("That shared recipe list could not be read.", "warn");
    return;
  }

  importSharedPayload(payload);
}

function exportRecipesAsJson() {
  if (!state.recipes.length) {
    setShareFeedback("Add recipes before exporting.", "warn");
    return;
  }

  const payload = buildExportPayload();
  const filename = `${slugify(APP_TITLE)}.json`;
  downloadTextFile(filename, `${JSON.stringify(payload, null, 2)}\n`, "application/json");
  setShareFeedback("JSON export downloaded.", "ok");
}

function clearRecipes() {
  const hasContent = state.recipes.length || state.cycle.usedRecipeIds.length;
  if (!hasContent) {
    return;
  }

  const shouldClear = window.confirm(
    "Clear every saved recipe and round history from this device?",
  );
  if (!shouldClear) {
    return;
  }

  state = createDefaultState();
  saveState();
  syncFilterControls();
  syncPickerControls();
  resetRecipeForm();
  dismissSharedNotice({ clearHash: false });
  setPickerFeedback(
    "The app avoids repeats until the round is complete, then the next pick starts over automatically.",
    "muted",
  );
  setShareFeedback("Recipe library cleared.", "muted");
  render();
}

function importSharedPayload(payload) {
  const importedState = normalizeState(payload);
  const shouldReplace =
    !state.recipes.length ||
    window.confirm("Importing will replace the current recipe library on this device. Continue?");

  if (!shouldReplace) {
    return;
  }

  state = importedState;
  saveState();
  syncFilterControls();
  syncPickerControls();
  resetRecipeForm();
  dismissSharedNotice({ clearHash: true });
  setShareFeedback("Shared recipes imported.", "ok");
  setPickerFeedback(
    "The app avoids repeats until the round is complete, then the next pick starts over automatically.",
    "muted",
  );
  render();
}

function pickRecipesWithoutRepeats() {
  sanitizeCycle();

  if (!state.recipes.length) {
    setPickerFeedback("Add recipes first, then the randomizer can pick from your list.", "warn");
    return;
  }

  const requestedCount = normalizePickCount(state.picker.pickCount);
  let eligibleRecipes = getAvailableRecipes();
  let startedNewRound = false;

  if (!eligibleRecipes.length) {
    state.cycle.usedRecipeIds = [];
    state.cycle.currentPickIds = [];
    eligibleRecipes = getAvailableRecipes();
    startedNewRound = true;
  }

  const selectedRecipes = shuffle(eligibleRecipes).slice(0, Math.min(requestedCount, eligibleRecipes.length));
  const selectedIds = selectedRecipes.map((recipe) => recipe.id);

  state.cycle.currentPickIds = selectedIds;
  state.cycle.usedRecipeIds = uniqueIds([...state.cycle.usedRecipeIds, ...selectedIds]);

  saveState();
  render();

  const remainingRecipes = getAvailableRecipes().length;

  if (startedNewRound) {
    setPickerFeedback(
      `Started a fresh round and picked ${selectedRecipes.length} recipe${pluralize(selectedRecipes.length)}.`,
      "ok",
    );
    return;
  }

  if (selectedRecipes.length < requestedCount) {
    setPickerFeedback(
      `Picked ${selectedRecipes.length} recipe${pluralize(selectedRecipes.length)} because that is all that remained this round. The next pick starts over automatically.`,
      "ok",
    );
    return;
  }

  if (!remainingRecipes) {
    setPickerFeedback(
      `Picked ${selectedRecipes.length} recipe${pluralize(selectedRecipes.length)}. That completed the round, so the next pick will start over automatically.`,
      "ok",
    );
    return;
  }

  setPickerFeedback(
    `Picked ${selectedRecipes.length} recipe${pluralize(selectedRecipes.length)} without repeats.`,
    "ok",
  );
}

function markRecipeUsed(recipeId) {
  state.cycle.usedRecipeIds = uniqueIds([...state.cycle.usedRecipeIds, recipeId]);
  state.cycle.currentPickIds = state.cycle.currentPickIds.filter((id) => id !== recipeId);
  saveState();
  render();

  if (!getAvailableRecipes().length) {
    setPickerFeedback(
      "Recipe marked used. That finished the round, and the next pick will start over automatically.",
      "ok",
    );
    return;
  }

  setPickerFeedback("Recipe marked used for this round.", "ok");
}

function returnRecipeToPool(recipeId, message = "Recipe is available again.") {
  state.cycle.usedRecipeIds = state.cycle.usedRecipeIds.filter((id) => id !== recipeId);
  state.cycle.currentPickIds = state.cycle.currentPickIds.filter((id) => id !== recipeId);
  saveState();
  render();
  setPickerFeedback(message, "ok");
}

function editRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) {
    return;
  }

  dom.recipeType.value = recipe.mealType;
  dom.recipeTitle.value = recipe.title;
  dom.recipePrep.value = recipe.prepMinutes ?? "";
  dom.recipeIngredients.value = recipe.ingredients.join(", ");
  dom.recipeNotes.value = recipe.notes;
  dom.recipeLinks.value = recipe.links.map(formatLinkForTextarea).join("\n");
  dom.editingRecipeId.value = recipe.id;
  dom.composerHeading.textContent = "Edit Recipe";
  dom.submitRecipe.textContent = "Update Recipe";
  dom.cancelEdit.classList.remove("hidden");
  dom.recipeForm.scrollIntoView({ behavior: "smooth", block: "start" });
  dom.recipeTitle.focus();
  setShareFeedback(`Editing ${recipe.title}. Update the fields, then save the recipe again.`, "muted");
}

function removeRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) {
    return;
  }

  const shouldRemove = window.confirm(`Remove "${recipe.title}" from your saved recipes?`);
  if (!shouldRemove) {
    return;
  }

  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  state.cycle.usedRecipeIds = state.cycle.usedRecipeIds.filter((id) => id !== recipeId);
  state.cycle.currentPickIds = state.cycle.currentPickIds.filter((id) => id !== recipeId);

  if (dom.editingRecipeId.value === recipeId) {
    resetRecipeForm();
  }

  saveState();
  render();
  setShareFeedback("Recipe removed.", "muted");
}

function resetRecipeForm({ preserveType = false } = {}) {
  const nextType = preserveType ? normalizeMealType(dom.recipeType.value) : "dinner";
  dom.recipeForm.reset();
  dom.recipeType.value = nextType;
  dom.editingRecipeId.value = "";
  dom.composerHeading.textContent = "Add a Recipe";
  dom.submitRecipe.textContent = "Save Recipe";
  dom.cancelEdit.classList.add("hidden");
}

function syncFilterControls() {
  dom.searchQuery.value = state.filters.query;
  dom.filterType.value = state.filters.type;
  dom.filterAvailability.value = state.filters.availability;
}

function syncPickerControls() {
  dom.pickerCount.value = String(state.picker.pickCount);
}

function render() {
  sanitizeCycle();
  renderHero();
  renderStats();
  renderCurrentPicks();
  renderBoardHeading();
  renderBoard();
  renderSharedNotice();
}

function renderHero() {
  const totalRecipes = state.recipes.length;
  const availableRecipes = getAvailableRecipes().length;
  const usedRecipes = state.cycle.usedRecipeIds.length;

  dom.poolSummary.textContent = totalRecipes
    ? `${totalRecipes} saved recipe${pluralize(totalRecipes)}`
    : "No saved recipes yet";
  dom.heroCollectionName.textContent = "Permanent recipe list";

  if (!totalRecipes) {
    dom.poolStatusDisplay.textContent =
      "Recipes stay saved until you remove them yourself, and rounds restart automatically.";
    return;
  }

  dom.poolStatusDisplay.textContent = `${availableRecipes} ready this round, ${usedRecipes} already used. Nothing disappears after it gets picked.`;
}

function renderStats() {
  dom.statRecipes.textContent = String(state.recipes.length);
  dom.statAvailable.textContent = String(getAvailableRecipes().length);
  dom.statUsed.textContent = String(state.cycle.usedRecipeIds.length);
  dom.statLinks.textContent = String(
    state.recipes.reduce((count, recipe) => count + recipe.links.length, 0),
  );
}

function renderCurrentPicks() {
  dom.currentPicks.replaceChildren();
  const currentRecipes = state.cycle.currentPickIds
    .map((recipeId) => state.recipes.find((recipe) => recipe.id === recipeId))
    .filter(Boolean);

  if (!currentRecipes.length) {
    const emptyCopy = document.createElement("p");
    emptyCopy.className = "empty-copy";
    emptyCopy.textContent = "No picks yet. Tap Pick Recipes to choose from the list.";
    dom.currentPicks.append(emptyCopy);
    return;
  }

  for (const recipe of currentRecipes) {
    const fragment = dom.currentPickTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".current-pick-card");
    const slot = fragment.querySelector(".current-pick-slot");
    const title = fragment.querySelector(".current-pick-title");
    const prep = fragment.querySelector(".current-pick-prep");
    const notes = fragment.querySelector(".current-pick-notes");
    const links = fragment.querySelector(".current-pick-links");
    const embeds = fragment.querySelector(".current-pick-embeds");
    const returnButton = fragment.querySelector(".return");

    slot.textContent = getMealTypeLabel(recipe.mealType);
    title.textContent = recipe.title;
    prep.textContent = formatPrepMinutes(recipe.prepMinutes);
    notes.textContent = getRecipeSummary(recipe);
    renderLinks(links, recipe.links);
    renderEmbeds(embeds, recipe.links);

    returnButton.addEventListener("click", () => {
      returnRecipeToPool(recipe.id, "Recipe returned to the current round.");
    });

    dom.currentPicks.append(card);
  }
}

function renderBoardHeading() {
  const visibleCount = getVisibleRecipes().length;
  dom.boardTitle.textContent = state.filters.type === "all" ? "All Saved Recipes" : `${getMealTypeLabel(state.filters.type)} Recipes`;

  if (!state.recipes.length) {
    dom.boardCopy.textContent =
      "Start by adding recipes. The app keeps them saved and starts a fresh round automatically after every recipe has had a turn.";
    return;
  }

  if (!visibleCount) {
    dom.boardCopy.textContent = "No recipes match the current search or filter settings.";
    return;
  }

  dom.boardCopy.textContent =
    `${visibleCount} recipe${pluralize(visibleCount)} shown. Meal slot tags are optional organization only; picks come from one big saved list.`;
}

function renderBoard() {
  dom.recipeBoard.replaceChildren();
  const recipes = sortRecipesForDisplay(getVisibleRecipes());

  if (!recipes.length) {
    const emptyState = document.createElement("article");
    emptyState.className = "panel day-column recipe-board-empty";

    const message = document.createElement("p");
    message.className = "empty-copy";
    message.textContent = state.recipes.length
      ? "No recipes match the current filters."
      : "No recipes saved yet. Add your first recipe to start the list.";

    emptyState.append(message);
    dom.recipeBoard.append(emptyState);
    return;
  }

  for (const recipe of recipes) {
    dom.recipeBoard.append(renderRecipeCard(recipe));
  }
}

function renderRecipeCard(recipe) {
  const fragment = dom.recipeCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".recipe-card");
  const typePill = fragment.querySelector(".recipe-type-pill");
  const statusPill = fragment.querySelector(".recipe-status-pill");
  const prepPill = fragment.querySelector(".recipe-prep");
  const title = fragment.querySelector(".recipe-card-title");
  const notes = fragment.querySelector(".recipe-card-notes");
  const ingredients = fragment.querySelector(".ingredient-chips");
  const links = fragment.querySelector(".video-link-row");
  const embeds = fragment.querySelector(".embed-stack");
  const toggleButton = fragment.querySelector(".toggle");
  const editButton = fragment.querySelector(".edit");
  const removeButton = fragment.querySelector(".remove");
  const status = getRecipeStatus(recipe);

  card.classList.add(`is-${status}`);
  typePill.textContent = getMealTypeLabel(recipe.mealType);
  prepPill.textContent = formatPrepMinutes(recipe.prepMinutes);
  title.textContent = recipe.title;
  notes.textContent = getRecipeSummary(recipe);
  statusPill.textContent = getStatusLabel(status);
  statusPill.classList.add(`status-${status}`);

  renderIngredients(ingredients, recipe.ingredients);
  renderLinks(links, recipe.links);
  renderEmbeds(embeds, recipe.links);

  if (status === "available") {
    toggleButton.textContent = "Mark Used";
    toggleButton.classList.remove("is-return");
    toggleButton.addEventListener("click", () => markRecipeUsed(recipe.id));
  } else {
    toggleButton.textContent = "Make Available";
    toggleButton.classList.add("is-return");
    toggleButton.addEventListener("click", () => returnRecipeToPool(recipe.id));
  }

  editButton.addEventListener("click", () => editRecipe(recipe.id));
  removeButton.addEventListener("click", () => removeRecipe(recipe.id));

  return card;
}

function renderIngredients(container, ingredients) {
  container.replaceChildren();
  if (!ingredients.length) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  for (const ingredient of ingredients) {
    const item = document.createElement("li");
    item.textContent = ingredient;
    container.append(item);
  }
}

function renderLinks(container, links) {
  container.replaceChildren();
  if (!links.length) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.className = "video-link";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    container.append(anchor);
  }
}

function renderEmbeds(container, links) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  const embeddableLinks = links
    .map((link) => ({ link, embed: getEmbedDetails(link.url) }))
    .filter((item) => item.embed);

  if (!embeddableLinks.length) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");

  for (const item of embeddableLinks) {
    const details = document.createElement("details");
    details.className = "embed-preview";

    const summary = document.createElement("summary");
    summary.textContent = `Preview ${item.embed.provider}`;

    const frame = document.createElement("div");
    frame.className = "embed-frame";

    const iframe = document.createElement("iframe");
    iframe.src = item.embed.embedUrl;
    iframe.title = `${item.embed.provider} preview`;
    iframe.loading = "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;

    frame.append(iframe);
    details.append(summary, frame);
    container.append(details);
  }
}

function getVisibleRecipes() {
  return state.recipes.filter((recipe) => matchesFilters(recipe));
}

function getAvailableRecipes() {
  return state.recipes.filter((recipe) => getRecipeStatus(recipe) === "available");
}

function matchesFilters(recipe) {
  if (state.filters.type !== "all" && recipe.mealType !== state.filters.type) {
    return false;
  }

  const status = getRecipeStatus(recipe);
  if (state.filters.availability === "available" && status !== "available") {
    return false;
  }

  if (state.filters.availability === "used" && status === "available") {
    return false;
  }

  const query = normalizeText(state.filters.query);
  if (!query) {
    return true;
  }

  const haystack = normalizeText(
    [
      recipe.title,
      recipe.notes,
      recipe.ingredients.join(" "),
      recipe.links.map((link) => `${link.label} ${link.host}`).join(" "),
      getMealTypeLabel(recipe.mealType),
    ].join(" "),
  );

  return haystack.includes(query);
}

function getRecipeStatus(recipe) {
  if (state.cycle.currentPickIds.includes(recipe.id)) {
    return "current";
  }

  if (state.cycle.usedRecipeIds.includes(recipe.id)) {
    return "used";
  }

  return "available";
}

function sanitizeCycle() {
  const validIds = new Set(state.recipes.map((recipe) => recipe.id));
  const currentPickIds = uniqueIds(state.cycle.currentPickIds).filter((id) => validIds.has(id));
  const usedRecipeIds = uniqueIds([...state.cycle.usedRecipeIds, ...currentPickIds]).filter((id) =>
    validIds.has(id),
  );

  const cycleChanged =
    currentPickIds.length !== state.cycle.currentPickIds.length ||
    usedRecipeIds.length !== state.cycle.usedRecipeIds.length ||
    currentPickIds.some((id, index) => id !== state.cycle.currentPickIds[index]) ||
    usedRecipeIds.some((id, index) => id !== state.cycle.usedRecipeIds[index]);

  if (!cycleChanged) {
    return;
  }

  state.cycle.currentPickIds = currentPickIds;
  state.cycle.usedRecipeIds = usedRecipeIds;
  saveState();
}

function sortRecipesForDisplay(recipes) {
  return [...recipes].sort((left, right) => {
    const statusDiff = statusOrder.get(getRecipeStatus(left)) - statusOrder.get(getRecipeStatus(right));
    if (statusDiff) {
      return statusDiff;
    }

    const typeDiff = mealTypeOrder.get(left.mealType) - mealTypeOrder.get(right.mealType);
    if (typeDiff) {
      return typeDiff;
    }

    return left.title.localeCompare(right.title);
  });
}

function setShareFeedback(message, tone = "muted") {
  dom.shareFeedback.textContent = message;
  dom.shareFeedback.classList.remove("ok", "warn", "muted");
  dom.shareFeedback.classList.add(tone);
}

function setPickerFeedback(message, tone = "muted") {
  dom.pickerFeedback.textContent = message;
  dom.pickerFeedback.classList.remove("ok", "warn", "muted");
  dom.pickerFeedback.classList.add(tone);
}

function buildShareUrl() {
  const payload = buildExportPayload();
  const token = encodeSharePayload(payload);
  if (!token) {
    return null;
  }

  const shareUrl = `${window.location.href.split("#")[0]}${SHARE_HASH_PREFIX}${token}`;
  if (shareUrl.length > 1800) {
    return null;
  }

  return shareUrl;
}

function buildExportPayload() {
  return {
    app: "sufra-recipes",
    version: 2,
    collection: {
      title: APP_TITLE,
    },
    recipes: state.recipes,
    cycle: state.cycle,
    picker: state.picker,
  };
}

function encodeSharePayload(payload) {
  try {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch (error) {
    return null;
  }
}

function decodeSharedInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      return normalizeState(JSON.parse(trimmed));
    } catch (error) {
      return null;
    }
  }

  let token = trimmed;

  if (trimmed.includes(SHARE_HASH_PREFIX)) {
    const hashIndex = trimmed.indexOf(SHARE_HASH_PREFIX);
    token = trimmed.slice(hashIndex + SHARE_HASH_PREFIX.length);
  } else {
    try {
      const parsedUrl = new URL(trimmed);
      if (parsedUrl.hash.startsWith(SHARE_HASH_PREFIX)) {
        token = parsedUrl.hash.slice(SHARE_HASH_PREFIX.length);
      }
    } catch (error) {
      token = trimmed;
    }
  }

  return decodeShareToken(token);
}

function decodeShareToken(token) {
  const normalizedToken = String(token || "")
    .trim()
    .replace(/^#?pool=/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalizedToken) {
    return null;
  }

  const paddedToken = normalizedToken.padEnd(Math.ceil(normalizedToken.length / 4) * 4, "=");

  try {
    const binary = atob(paddedToken);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeState(JSON.parse(json));
  } catch (error) {
    return null;
  }
}

function readSharedPayloadFromLocation() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) {
    return null;
  }

  return decodeShareToken(window.location.hash.slice(SHARE_HASH_PREFIX.length));
}

function handleHashChange() {
  pendingSharedPayload = readSharedPayloadFromLocation();
  renderSharedNotice();
}

function renderSharedNotice() {
  if (!pendingSharedPayload) {
    dom.sharedBanner.classList.add("hidden");
    dom.sharedBannerText.textContent = "";
    return;
  }

  const count = pendingSharedPayload.recipes.length;
  dom.sharedBannerText.textContent = `${count} shared recipe${pluralize(count)} are ready to import.`;
  dom.sharedBanner.classList.remove("hidden");
}

function dismissSharedNotice({ clearHash = false } = {}) {
  pendingSharedPayload = null;
  dom.sharedBanner.classList.add("hidden");
  dom.sharedBannerText.textContent = "";

  if (clearHash) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    return false;
  }
}

function downloadTextFile(filename, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function parseRecipeLinks(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const links = [];
  const invalid = [];

  for (const line of lines) {
    const link = parseLinkInput(line);
    if (!link) {
      invalid.push(line);
      continue;
    }

    links.push(link);
  }

  return {
    links: dedupeLinks(links),
    invalid,
  };
}

function parseLinkInput(line) {
  if (!line) {
    return null;
  }

  const parts = line.split("|");
  const hasLabel = parts.length > 1;
  const label = hasLabel ? parts.shift().trim() : "";
  const urlPart = hasLabel ? parts.join("|").trim() : line.trim();

  return buildLinkRecord(urlPart, label);
}

function buildLinkRecord(urlValue, labelValue = "", id = null) {
  const parsedUrl = safeUrl(urlValue);
  if (!parsedUrl) {
    return null;
  }

  return {
    id: id || newId(),
    url: parsedUrl.toString(),
    host: parsedUrl.hostname.replace(/^www\./i, ""),
    label: normalizeTitle(labelValue, deriveLinkLabel(parsedUrl)),
  };
}

function safeUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return null;
  }

  const normalizedCandidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)
    ? candidate
    : `https://${candidate.replace(/^\/+/, "")}`;

  try {
    return new URL(normalizedCandidate);
  } catch (error) {
    return null;
  }
}

function deriveLinkLabel(parsedUrl) {
  const embed = getEmbedDetails(parsedUrl.toString());
  if (embed) {
    return embed.provider;
  }

  return parsedUrl.hostname.replace(/^www\./i, "");
}

function getEmbedDetails(url) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return null;
  }

  const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const videoId = getYouTubeVideoId(parsedUrl);
    if (!videoId) {
      return null;
    }

    return {
      provider: "YouTube",
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }

  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const videoId = getVimeoVideoId(parsedUrl);
    if (!videoId) {
      return null;
    }

    return {
      provider: "Vimeo",
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
    };
  }

  return null;
}

function getYouTubeVideoId(parsedUrl) {
  const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    return parsedUrl.pathname.replace(/^\/+/, "").split("/")[0] || null;
  }

  if (parsedUrl.searchParams.get("v")) {
    return parsedUrl.searchParams.get("v");
  }

  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathParts[0] === "embed" || pathParts[0] === "shorts") {
    return pathParts[1] || null;
  }

  return null;
}

function getVimeoVideoId(parsedUrl) {
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean).reverse();
  return pathParts.find((part) => /^\d+$/.test(part)) || null;
}

function formatLinkForTextarea(link) {
  const label = normalizeTitle(link?.label, "");
  return label ? `${label} | ${link.url}` : link.url;
}

function getRecipeSummary(recipe) {
  if (recipe.notes) {
    return recipe.notes;
  }

  if (recipe.ingredients.length) {
    return `Ingredients: ${recipe.ingredients.join(", ")}`;
  }

  return "No notes added yet.";
}

function getStatusLabel(status) {
  if (status === "current") {
    return "Picked Now";
  }

  if (status === "used") {
    return "Used This Round";
  }

  return "Ready";
}

function formatPrepMinutes(value) {
  return value ? `${value} min` : "Prep flexible";
}

function getMealTypeLabel(value) {
  if (value === "all") {
    return "All Slots";
  }

  return MEAL_TYPES.find((type) => type.key === value)?.label || "Dinner";
}

function normalizeMealType(value) {
  return MEAL_TYPES.some((type) => type.key === value) ? value : "dinner";
}

function normalizeMealTypeFilter(value) {
  return value === "all" || MEAL_TYPES.some((type) => type.key === value) ? value : "all";
}

function normalizeAvailability(value) {
  return value === "available" || value === "used" ? value : "all";
}

function normalizePickCount(value) {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue)) {
    return 1;
  }

  return Math.min(4, Math.max(1, parsedValue));
}

function normalizePrepMinutes(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return Math.min(600, parsedValue);
}

function normalizeTitle(value, fallback, limit = 80) {
  const normalizedValue = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

  return normalizedValue || fallback;
}

function normalizeParagraph(value, limit) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseIngredients(value) {
  return dedupeTextEntries(
    String(value || "")
      .split(/[\n,;•·]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeIngredients(value) {
  if (Array.isArray(value)) {
    return dedupeTextEntries(value);
  }

  return parseIngredients(value);
}

function dedupeLinks(links) {
  const seen = new Set();
  const uniqueLinks = [];

  for (const link of links) {
    const key = `${link.url}|${normalizeText(link.label)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueLinks.push(link);
  }

  return uniqueLinks;
}

function dedupeTextEntries(values) {
  const seen = new Set();
  const uniqueValues = [];

  for (const value of values) {
    const normalizedValue = normalizeTitle(value, "");
    if (!normalizedValue) {
      continue;
    }

    const key = normalizedValue.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

function normalizeIsoDate(value) {
  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.valueOf()) ? null : parsedValue.toISOString();
}

function uniqueIds(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function newId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function slugify(value) {
  return (
    normalizeText(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sufra-recipes"
  );
}

function pluralize(count) {
  return count === 1 ? "" : "s";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {});
}
