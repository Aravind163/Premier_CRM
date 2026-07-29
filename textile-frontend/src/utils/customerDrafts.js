// src/utils/customerDrafts.js
//
// Multiple saved drafts (not just one, overwritten each time) for the
// customer's Product Selection page. Each draft remembers the cart,
// requested date, ref/PO, remarks, which customer it belongs to, and
// when it was saved — so the Drafts page can list them all and let the
// customer resume whichever one they want.
const KEY = "customer_enquiry_drafts";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(drafts) {
  localStorage.setItem(KEY, JSON.stringify(drafts));
}

export function listDrafts() {
  return readAll().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export function getDraft(id) {
  return readAll().find((d) => d.id === id) || null;
}

/**
 * Create a new draft, or update an existing one if `id` is passed in
 * `draft`. Returns the final draft (with its id) so the caller can keep
 * editing the same draft on subsequent saves.
 */
export function saveDraft(draft) {
  const drafts = readAll();
  const id = draft.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = { ...draft, id, savedAt: new Date().toISOString() };
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx >= 0) drafts[idx] = entry;
  else drafts.push(entry);
  writeAll(drafts);
  return entry;
}

export function deleteDraft(id) {
  writeAll(readAll().filter((d) => d.id !== id));
}