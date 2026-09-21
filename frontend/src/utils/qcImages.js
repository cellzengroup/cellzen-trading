// QC photos — the shrink step and the store the screens share.
//
// A QC photo is a picture of the goods taken at the shelf, at most TWO per parcel,
// found again by the parcel's goods number. Three things live here:
//
//   1. compressPhoto — every photo is re-encoded as a JPEG at 50% quality and
//      capped at 1600px on its long side BEFORE it leaves the phone. A camera
//      photo is 3-6 MB; this comes out at ~100-300 KB, which is what the
//      warehouse's mobile data and the database can carry all day.
//
//   2. a small store keyed by tracking number, with a hook, so the "Item stored"
//      sheet, the photo viewer and the goods-number lists all show the SAME photos
//      and a change made in one is on screen in the others at once.
//
//   3. the two things that make it feel instant:
//        - UPLOADING IS OPTIMISTIC. The moment a photo is chosen it is on screen
//          (from the file already in memory) and counted, and whatever was waiting on
//          it — the label print, for one — carries on; shrinking and sending happen
//          behind it, retried on a bad connection. A photo that finally cannot be
//          saved is shown as failed, with a way to retry, instead of being silently
//          lost.
//        - OPENING NEEDS NO WAIT. The lists already carry each parcel's photo ids
//          (seedQcImages), so the popup has its photos before it opens; they are
//          fetched ahead of the tap (prefetchQcImages) and the browser keeps them for
//          good, so a photo seen once never travels again.
//
// A photo on screen is an "entry": { key, id, url, status, error, createdByName }.
//   key    — stable for the entry's whole life (a server photo's key is its id; a photo
//            added here gets a local one, so it does not change when the server answers).
//   id     — the server's id, once it has one.
//   status — "saved" | "saving" | "failed".

import { useEffect, useSyncExternalStore } from "react";
import { loadQcImages, uploadQcImage, deleteQcImage, qcImageUrl } from "./warehouseApi";

export const QC_MAX_IMAGES = 2;
export const QC_JPEG_QUALITY = 0.5; // "50% quality"
export const QC_MAX_SIDE = 1600;    // px, long side

// ------------------------------------------------------------- compress
async function decode(file) {
  // createImageBitmap applies the photo's EXIF rotation when asked, so a phone held
  // sideways does not come out sideways. Older browsers fall back to <img>, which
  // applies it on its own.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't a photo this device can read"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// -> a JPEG Blob: 50% quality, no side longer than QC_MAX_SIDE, never enlarged.
export async function compressPhoto(file, { quality = QC_JPEG_QUALITY, maxSide = QC_MAX_SIDE } = {}) {
  if (!file || !/^image\//i.test(file.type || "")) throw new Error("Choose a photo");
  const bitmap = await decode(file);
  const w0 = bitmap.width || bitmap.naturalWidth;
  const h0 = bitmap.height || bitmap.naturalHeight;
  if (!w0 || !h0) throw new Error("That photo is empty");
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext("2d");
  // JPEG has no transparency: a PNG screenshot would otherwise come out on black.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process that photo");
  return blob;
}

// ------------------------------------------------------------- store
// key -> { images: entry[], status: "idle" | "loading" | "ready" | "error", error, fetchedAt }
// Each snapshot is replaced, never mutated, so a component only re-renders when
// something it shows has changed.
const FRESH_MS = 30000; // how long what the store holds counts as current
const cache = new Map();
const listeners = new Set();
const EMPTY = Object.freeze({ images: [], status: "idle", error: "", fetchedAt: 0 });
const keyOf = (tracking) => String(tracking || "").trim().toUpperCase();
const snapshot = (key) => cache.get(key) || EMPTY;
const put = (key, patch) => {
  cache.set(key, { ...snapshot(key), ...patch });
  listeners.forEach((l) => l());
};
const setImages = (key, fn) => put(key, { images: fn(snapshot(key).images) });
const patchEntry = (key, entryKey, patch) =>
  setImages(key, (imgs) => imgs.map((e) => (e.key === entryKey ? { ...e, ...patch } : e)));
const dropEntry = (key, entryKey) => setImages(key, (imgs) => imgs.filter((e) => e.key !== entryKey));
const findEntry = (key, entryKey) => snapshot(key).images.find((e) => e.key === entryKey);
const isBlobUrl = (u) => typeof u === "string" && u.startsWith("blob:");
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sameImages = (a, b) =>
  a.length === b.length && a.every((e, i) => e.key === b[i].key && e.status === b[i].status && e.id === b[i].id);

// Fold what the server says a parcel has into what is on screen. A server photo we
// already show keeps its entry (and its in-memory copy, so it does not flicker or
// reload); one we do not show is added; a saved one the server no longer has is gone
// (deleted elsewhere). Photos still on their way up, or failed, are ours alone and
// are never dropped by a refresh. `rows`: [{ id, url, createdByName }].
function mergeServer(key, rows) {
  const cur = snapshot(key).images;
  const byId = new Map(cur.filter((e) => e.id).map((e) => [e.id, e]));
  const fromServer = rows.map((r) => byId.get(r.id) || { key: r.id, id: r.id, url: r.url, status: "saved", error: "", createdByName: r.createdByName || "" });
  const serverIds = new Set(rows.map((r) => r.id));
  // Ones of ours the server list does not cover yet: still uploading, failed — or
  // saved a moment ago on a list that was read a moment before that.
  const ours = cur.filter((e) => e.status !== "saved" || (e.id && !serverIds.has(e.id) && Date.now() - (e.savedAt || 0) < FRESH_MS));
  const images = [...fromServer, ...ours.filter((e) => !fromServer.includes(e))];
  const s = snapshot(key);
  if (s.status === "ready" && sameImages(s.images, images)) {
    if (Date.now() - s.fetchedAt > 1000) put(key, { fetchedAt: Date.now() }); // current again — no re-render needed
    return;
  }
  put(key, { images, status: "ready", error: "", fetchedAt: Date.now() });
}

// Re-read a parcel's photos. Quiet once they are on screen — the list stays put
// while the fresh copy is fetched, rather than blinking to a spinner.
export async function refreshQcImages(tracking) {
  const key = keyOf(tracking);
  if (!key) return;
  if (snapshot(key).status !== "ready") put(key, { status: "loading", error: "" });
  try {
    mergeServer(key, await loadQcImages(key));
  } catch (e) {
    put(key, { status: snapshot(key).images.length ? "ready" : "error", error: e.message || "Failed to load QC images" });
  }
}

// The lists (1688 orders, warehouse items) say which photos each parcel has, as
// ids only. Taking that as the parcel's photos means its popup has them BEFORE it is
// opened: nothing to ask the server, nothing to wait for. `ids` must be an array —
// the truth; null/undefined ("the server did not say") is ignored.
export function seedQcImages(tracking, ids) {
  const key = keyOf(tracking);
  if (!key || !Array.isArray(ids)) return;
  mergeServer(key, ids.map((id) => ({ id, url: qcImageUrl(id) })));
}

// Start fetching a parcel's photo files now, ahead of the tap that will want them
// (pointer/touch down on its goods number). The files are immutable, so the browser
// keeps them: a photo seen once never travels again.
const prefetched = new Set();
export function prefetchQcImages(tracking) {
  if (typeof Image === "undefined") return;
  for (const e of snapshot(keyOf(tracking)).images) {
    if (e.status !== "saved" || isBlobUrl(e.url) || prefetched.has(e.url)) continue;
    prefetched.add(e.url);
    const img = new Image();
    img.decoding = "async";
    img.src = e.url;
  }
}

// ------------------------------------------------------------- upload
// A dropped connection is retried; a refusal (a full box, a bad file) is not — it
// would only be refused again.
async function uploadWithRetry(key, blob) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await uploadQcImage(key, blob);
    } catch (e) {
      last = e;
      if (e.status && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

// Shrink and send one entry's photo, then mark it saved (or failed). Every step
// first checks the entry is still there: one discarded while this ran has nothing
// left to send, and anything already saved for it is taken back out.
async function runUpload(key, entryKey) {
  try {
    let blob = findEntry(key, entryKey)?.blob;
    if (!blob) {
      const source = findEntry(key, entryKey)?.source;
      if (!source) return null;
      blob = await compressPhoto(source);
      const e = findEntry(key, entryKey);
      if (!e) return null;
      // What is shown from here on is the shrunk copy, not the multi-megabyte original.
      const old = e.url;
      patchEntry(key, entryKey, { blob, url: URL.createObjectURL(blob) });
      if (isBlobUrl(old)) URL.revokeObjectURL(old);
    }
    const saved = await uploadWithRetry(key, blob);
    if (!findEntry(key, entryKey)) {
      await deleteQcImage(saved.id).catch(() => { /* best effort */ });
      return null;
    }
    // A refresh that ran meanwhile may already list this photo as a server entry: keep one.
    setImages(key, (imgs) =>
      imgs
        .filter((e) => e.key === entryKey || e.id !== saved.id)
        .map((e) => (e.key === entryKey
          ? { ...e, id: saved.id, status: "saved", error: "", createdByName: saved.createdByName || "", savedAt: Date.now(), source: undefined, blob: undefined }
          : e))
    );
    return saved;
  } catch (err) {
    if (findEntry(key, entryKey)) patchEntry(key, entryKey, { status: "failed", error: err.message || "Couldn't save the photo" });
    throw err;
  }
}

// Add a photo. It is on screen and counted AT ONCE (from the file in memory), and
// this returns straight away with the entry's key; `done` settles when it has been
// shrunk and saved (rejecting with the reason if it could not be). Throws right
// away only for what can be known without the network: not a photo, or no room.
export function addQcImage(tracking, file) {
  const key = keyOf(tracking);
  if (!file || !/^image\//i.test(file.type || "")) throw new Error("Choose a photo");
  if (snapshot(key).images.length >= QC_MAX_IMAGES) throw new Error(`Only ${QC_MAX_IMAGES} QC images per box — remove one first`);
  const entry = { key: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, id: null, url: URL.createObjectURL(file), status: "saving", error: "", createdByName: "", source: file };
  setImages(key, (imgs) => [...imgs, entry]);
  const done = runUpload(key, entry.key);
  done.catch(() => { /* reported through the entry's status; callers that care await `done` */ });
  return { key: entry.key, done };
}

// Try a failed photo again.
export function retryQcImage(tracking, entryKey) {
  const key = keyOf(tracking);
  if (!findEntry(key, entryKey)) return Promise.resolve(null);
  patchEntry(key, entryKey, { status: "saving", error: "" });
  const done = runUpload(key, entryKey);
  done.catch(() => {});
  return done;
}

// Remove a photo. One already saved is deleted on the server first — a refused delete
// must leave it on screen. One still uploading, or failed, simply disappears at once;
// runUpload sees that and takes back anything it had already saved.
export async function removeQcImage(tracking, entryKey) {
  const key = keyOf(tracking);
  const e = findEntry(key, entryKey);
  if (!e) return;
  if (e.status === "saved" && e.id) await deleteQcImage(e.id);
  dropEntry(key, entryKey);
  if (isBlobUrl(e.url)) setTimeout(() => URL.revokeObjectURL(e.url), 2000);
}

// Does the store already hold a photo for this parcel (saved, or on its way up)?
// Synchronous, for the places that cannot wait to ask — the sheet's auto-close. A
// parcel whose photos have not been read yet answers false: better a sheet that stays
// than a box let through unchecked.
export function qcHasPhoto(tracking) {
  return snapshot(keyOf(tracking)).images.some((e) => e.status !== "failed");
}

// How many photos a parcel has for the "no photo yet?" check before a label prints:
// saved ones and ones on their way up count (the user has supplied one), failed ones
// do not. Reads the server first unless what the store holds is current. null when
// that could not be found out (offline, say): the caller should not hold anything up.
export async function qcCountFor(tracking) {
  const key = keyOf(tracking);
  if (!key) return null;
  const s = snapshot(key);
  if (s.status !== "ready" || Date.now() - s.fetchedAt > FRESH_MS) await refreshQcImages(key);
  const now = snapshot(key);
  return now.status === "ready" ? now.images.filter((e) => e.status !== "failed").length : null;
}

// The photos for a parcel, kept current. Read on first use (or when what is held has
// gone stale); `refresh` forces a re-read.
export function useQcImages(tracking) {
  const key = keyOf(tracking);
  const state = useSyncExternalStore(subscribe, () => snapshot(key), () => EMPTY);
  useEffect(() => {
    if (!key) return;
    const s = snapshot(key);
    if (s.status === "idle" || Date.now() - s.fetchedAt > FRESH_MS) refreshQcImages(key);
  }, [key]);
  return { ...state, refresh: () => refreshQcImages(key) };
}
