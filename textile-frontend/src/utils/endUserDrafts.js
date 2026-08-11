// src/utils/endUserDrafts.js
//
// Saved-draft storage for the end_user (Field Officer) order flow.
// A "draft" is a named snapshot of one customer's cart plus whatever
// Requested Date / Ref No / Remarks had been filled in on the Cart
// Checkout page — taken with "💾 Save as Draft" instead of submitting.
// Distinct from the live per-customer cart in endUserCart.js: a draft
// is frozen at save time, and the officer can hold several drafts (for
// the same or different customers) at once, browse them all on the
// Drafts page, and resume any one of them back into a live cart.
//
// Storage shape (localStorage key ENDUSER_DRAFTS_KEY): array of
//   {
//     id, customerId, customerName, customerCode,
//     items: [ { key, product, qty } ],
//     requestedDate, refNo, remarks,
//     createdAt, updatedAt,
//   }

const ENDUSER_DRAFTS_KEY = "enduser_drafts_v1";
const EVENT_NAME = "enduser-drafts-changed";

function readAll() {
  try {
    const raw = localStorage.getItem(ENDUSER_DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(drafts) {
  try {
    localStorage.setItem(ENDUSER_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // storage full / unavailable — fail silently
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

// Newest-updated first, so the Drafts page shows recently-touched work
// up top without the caller having to sort.
export function listDrafts() {
  return readAll().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getDraft(id) {
  return readAll().find((d) => d.id === id) || null;
}

// Always creates a new draft — even if one already exists for the same
// customer, so an officer can keep multiple separate drafts per
// customer (e.g. two different orders queued up for the same shop).
export function saveDraft({ customerId, customerName, customerCode, items, requestedDate, refNo, remarks }) {
  const all = readAll();
  const now = new Date().toISOString();
  const draft = {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customerId,
    customerName: customerName || "",
    customerCode: customerCode || "",
    items: items || [],
    requestedDate: requestedDate || "",
    refNo: refNo || "",
    remarks: remarks || "",
    createdAt: now,
    updatedAt: now,
  };
  all.push(draft);
  writeAll(all);
  return draft;
}

export function updateDraft(id, patch) {
  const all = readAll();
  const next = all.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d));
  writeAll(next);
}

export function deleteDraft(id) {
  const all = readAll();
  writeAll(all.filter((d) => d.id !== id));
}

export function draftCount() {
  return readAll().length;
}

export function subscribeToDrafts(callback) {
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler); // cross-tab sync
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}