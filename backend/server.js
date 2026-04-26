import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { FieldValue, Firestore, Timestamp } from "@google-cloud/firestore";

const APP_TITLE = "Sufra Recipes";
const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const PAIR_CODE_TTL_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.PAIR_CODE_TTL_MINUTES || "10", 10),
);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const firestore = new Firestore();
const librariesCollection = firestore.collection("libraries");
const devicesCollection = firestore.collection("devices");
const pairingCodesCollection = firestore.collection("pairingCodes");
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const DEFAULT_GROCERY_SOURCE = "all";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new HttpError(403, "This origin is not allowed for cloud sync."));
    },
  }),
);
app.use(express.json({ limit: "12mb" }));

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    service: "sufra-sync-backend",
  });
});

app.post("/api/session/bootstrap", asyncHandler(async (request, response) => {
  const appState = normalizeAppState(request.body?.appState);
  const libraryRef = librariesCollection.doc();
  const deviceRef = devicesCollection.doc();
  const { token, tokenHash } = createDeviceToken();

  await replaceLibraryState(libraryRef.id, appState, {
    ownerDeviceId: deviceRef.id,
    isBootstrap: true,
  });

  await deviceRef.set({
    libraryId: libraryRef.id,
    tokenHash,
    createdAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  });

  response.status(201).json({
    libraryId: libraryRef.id,
    deviceToken: token,
    appState: await loadLibraryState(libraryRef.id),
  });
}));

app.get("/api/library", requireDevice, asyncHandler(async (request, response) => {
  response.json({
    libraryId: request.device.libraryId,
    appState: await loadLibraryState(request.device.libraryId),
  });
}));

app.put("/api/library", requireDevice, asyncHandler(async (request, response) => {
  const appState = normalizeAppState(request.body?.appState);
  await replaceLibraryState(request.device.libraryId, appState);

  response.json({
    libraryId: request.device.libraryId,
    appState: await loadLibraryState(request.device.libraryId),
  });
}));

app.post("/api/pairing-codes", requireDevice, asyncHandler(async (request, response) => {
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MINUTES * 60 * 1000);
  const code = await createUniquePairCode();

  await pairingCodesCollection.doc(code).set({
    code,
    libraryId: request.device.libraryId,
    deviceId: request.device.deviceId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    usedAt: null,
  });

  response.status(201).json({
    code,
    expiresAt: expiresAt.toISOString(),
  });
}));

app.post("/api/pair/consume", asyncHandler(async (request, response) => {
  const code = sanitizePairCode(request.body?.code);
  if (!code) {
    throw new HttpError(400, "Enter a valid pairing code.");
  }

  const pairResult = await firestore.runTransaction(async (transaction) => {
    const pairingRef = pairingCodesCollection.doc(code);
    const snapshot = await transaction.get(pairingRef);

    if (!snapshot.exists) {
      throw new HttpError(404, "That pairing code was not found.");
    }

    const pairing = snapshot.data();
    if (pairing?.usedAt) {
      throw new HttpError(409, "That pairing code has already been used.");
    }

    const expiresAt = pairing?.expiresAt?.toDate?.() || null;
    if (!expiresAt || expiresAt.valueOf() < Date.now()) {
      throw new HttpError(410, "That pairing code has expired.");
    }

    const deviceRef = devicesCollection.doc();
    const { token, tokenHash } = createDeviceToken();

    transaction.set(deviceRef, {
      libraryId: pairing.libraryId,
      tokenHash,
      createdAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
    transaction.update(pairingRef, {
      usedAt: FieldValue.serverTimestamp(),
    });

    return {
      deviceId: deviceRef.id,
      deviceToken: token,
      libraryId: pairing.libraryId,
    };
  });

  response.status(201).json({
    ...pairResult,
    appState: await loadLibraryState(pairResult.libraryId),
  });
}));

app.delete("/api/device", requireDevice, asyncHandler(async (request, response) => {
  await devicesCollection.doc(request.device.deviceId).delete();
  response.status(204).send();
}));

app.use((error, _request, response, _next) => {
  const status = error?.status || 500;
  const message = status >= 500 ? "The sync backend hit an internal error." : error.message;
  response.status(status).json({
    error: message,
  });
});

app.listen(PORT, () => {
  console.log(`sufra-sync-backend listening on ${PORT}`);
});

async function requireDevice(request, _response, next) {
  try {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      throw new HttpError(401, "A valid device token is required.");
    }

    const tokenHash = sha256(token);
    const snapshot = await devicesCollection.where("tokenHash", "==", tokenHash).limit(1).get();

    if (snapshot.empty) {
      throw new HttpError(401, "This device is not linked to cloud sync.");
    }

    const deviceDoc = snapshot.docs[0];
    request.device = {
      deviceId: deviceDoc.id,
      ...deviceDoc.data(),
    };

    await deviceDoc.ref.set(
      {
        lastSeenAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    next();
  } catch (error) {
    next(error);
  }
}

async function replaceLibraryState(libraryId, rawState, options = {}) {
  const appState = normalizeAppState(rawState);
  const libraryRef = librariesCollection.doc(libraryId);
  const recipeRefs = await libraryRef.collection("recipes").get();
  const incomingRecipeIds = new Set(appState.recipes.map((recipe) => recipe.id));
  const writes = [];

  writes.push({
    type: "set",
    ref: libraryRef,
    value: {
      title: appState.collection.title,
      ownerDeviceId: options.ownerDeviceId,
      createdAt: options.isBootstrap ? FieldValue.serverTimestamp() : undefined,
      updatedAt: FieldValue.serverTimestamp(),
    },
    merge: true,
  });

  writes.push({
    type: "set",
    ref: libraryRef.collection("meta").doc("state"),
    value: {
      cycle: appState.cycle,
      grocery: appState.grocery,
      picker: appState.picker,
      filters: appState.filters,
      updatedAt: FieldValue.serverTimestamp(),
    },
    merge: true,
  });

  for (const recipe of appState.recipes) {
    writes.push({
      type: "set",
      ref: libraryRef.collection("recipes").doc(recipe.id),
      value: {
        ...recipe,
        syncedAt: FieldValue.serverTimestamp(),
      },
      merge: true,
    });
  }

  for (const recipeDoc of recipeRefs.docs) {
    if (!incomingRecipeIds.has(recipeDoc.id)) {
      writes.push({
        type: "delete",
        ref: recipeDoc.ref,
      });
    }
  }

  await commitWrites(writes);
}

async function loadLibraryState(libraryId) {
  const libraryRef = librariesCollection.doc(libraryId);
  const [librarySnapshot, metaSnapshot, recipeSnapshot] = await Promise.all([
    libraryRef.get(),
    libraryRef.collection("meta").doc("state").get(),
    libraryRef.collection("recipes").get(),
  ]);

  const libraryData = librarySnapshot.data() || {};
  const meta = metaSnapshot.data() || {};
  const recipes = recipeSnapshot.docs.map((snapshot) => normalizeRecipe(snapshot.data())).filter(Boolean);

  return normalizeAppState({
    app: "sufra-recipes",
    version: 5,
    collection: {
      title: libraryData.title || APP_TITLE,
    },
    recipes,
    cycle: meta.cycle,
    grocery: meta.grocery,
    picker: meta.picker,
    filters: meta.filters,
  });
}

async function commitWrites(writes) {
  const chunks = chunk(writes, 400);

  for (const chunkItems of chunks) {
    const batch = firestore.batch();
    for (const write of chunkItems) {
      if (write.type === "delete") {
        batch.delete(write.ref);
        continue;
      }

      const cleanedValue = removeUndefined(write.value);
      if (write.merge) {
        batch.set(write.ref, cleanedValue, { merge: true });
      } else {
        batch.set(write.ref, cleanedValue);
      }
    }
    await batch.commit();
  }
}

async function createUniquePairCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = crypto.randomBytes(4).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length < 6) {
      continue;
    }

    const snapshot = await pairingCodesCollection.doc(code).get();
    if (!snapshot.exists) {
      return code;
    }

    const expiresAt = snapshot.data()?.expiresAt?.toDate?.() || null;
    if (!expiresAt || expiresAt.valueOf() < Date.now()) {
      return code;
    }
  }

  throw new HttpError(500, "A pairing code could not be generated right now.");
}

function createDeviceToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: sha256(token),
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function getBearerToken(headerValue) {
  const header = String(headerValue || "");
  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice(7).trim();
}

function sanitizePairCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function normalizeAppState(raw) {
  const recipes = Array.isArray(raw?.recipes)
    ? raw.recipes.map(normalizeRecipe).filter(Boolean)
    : [];
  const recipeIds = new Set(recipes.map((recipe) => recipe.id));
  const currentPickIds = uniqueIds(raw?.cycle?.currentPickIds).filter((id) => recipeIds.has(id));
  const usedRecipeIds = uniqueIds([
    ...(Array.isArray(raw?.cycle?.usedRecipeIds) ? raw.cycle.usedRecipeIds : []),
    ...currentPickIds,
  ]).filter((id) => recipeIds.has(id));

  return {
    app: "sufra-recipes",
    version: 5,
    collection: {
      title: normalizeTitle(raw?.collection?.title, APP_TITLE, 80),
    },
    recipes,
    cycle: {
      usedRecipeIds,
      currentPickIds,
    },
    grocery: {
      source: normalizeGrocerySource(raw?.grocery?.source),
      checkedKeys: normalizeCheckedKeys(raw?.grocery?.checkedKeys),
    },
    picker: {
      selectedSlots: normalizePickerSlots(raw?.picker?.selectedSlots),
    },
    filters: {
      query: String(raw?.filters?.query || "").slice(0, 120),
      type: normalizeMealTypeFilter(raw?.filters?.type),
      availability: normalizeAvailability(raw?.filters?.availability),
    },
  };
}

function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const title = normalizeTitle(raw.title, "", 140);
  if (!title) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: normalizeTitle(raw.id, crypto.randomUUID ? crypto.randomUUID() : `recipe-${Date.now()}`, 80),
    mealType: normalizeMealType(raw.mealType || raw.type),
    title,
    prepMinutes: normalizePrepMinutes(raw.prepMinutes),
    image: normalizeImage(raw.image),
    ingredients: normalizeIngredients(raw.ingredients),
    notes: normalizeParagraph(raw.notes, 2000),
    links: normalizeLinks(raw.links || raw.videoLinks),
    createdAt: normalizeIsoDate(raw.createdAt) || nowIso,
    updatedAt: normalizeIsoDate(raw.updatedAt) || nowIso,
  };
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const links = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const url = safeUrl(item.url);
    if (!url) {
      continue;
    }

    links.push({
      id: normalizeTitle(item.id, crypto.randomUUID ? crypto.randomUUID() : `link-${Date.now()}`, 80),
      url: url.toString(),
      host: url.hostname.replace(/^www\./i, ""),
      label: normalizeTitle(item.label || item.host || url.hostname, url.hostname, 80),
    });
  }

  return dedupeLinks(links);
}

function normalizeImage(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  if (candidate.startsWith("data:image/")) {
    return candidate;
  }

  const url = safeUrl(candidate);
  return url ? url.toString() : "";
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

function normalizeIngredients(value) {
  if (Array.isArray(value)) {
    return dedupeTextEntries(value);
  }

  return dedupeTextEntries(
    String(value || "")
      .split(/[\n,;•·]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizePickerSlots(value) {
  const slots = uniqueIds(
    (Array.isArray(value) ? value : [])
      .map((slot) => String(slot || "").trim())
      .filter((slot) => MEAL_TYPES.has(slot)),
  );

  return slots.length ? slots : ["lunch", "dinner"];
}

function normalizeMealType(value) {
  return MEAL_TYPES.has(value) ? value : "dinner";
}

function normalizeMealTypeFilter(value) {
  return value === "all" || MEAL_TYPES.has(value) ? value : "all";
}

function normalizeAvailability(value) {
  return value === "available" || value === "used" ? value : "all";
}

function normalizeGrocerySource(value) {
  return value === "all" ? "all" : DEFAULT_GROCERY_SOURCE;
}

function normalizeCheckedKeys(value) {
  return uniqueIds(
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeIngredientKey(item))
      .filter(Boolean),
  );
}

function normalizeParagraph(value, limit) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeTitle(value, fallback, limit = 80) {
  const normalizedValue = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

  return normalizedValue || fallback;
}

function normalizeIngredientKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function normalizeIsoDate(value) {
  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.valueOf()) ? "" : parsedValue.toISOString();
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

function dedupeLinks(links) {
  const seen = new Set();
  const uniqueLinks = [];

  for (const link of links) {
    const key = `${link.url}|${link.label.toLowerCase()}`;
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
    const normalizedValue = normalizeTitle(value, "", 120);
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

function uniqueIds(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  );
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
