// src/utils/draftSession.js
//
// Small sessionStorage-backed handoff used only when resuming a draft.
// Resuming now lands on Product Selection (ProductCatalog.jsx), which
// loads the draft's *items* straight into the shared, persistent cart
// (utils/customerCart.js) — that's fine, both pages already read from
// it. But Additional Details (Requested Date / Ref-PO / Remarks) and
// "which draft am I editing" have no shared home, since Product
// Selection doesn't have those fields on screen. This stashes them so
// Order Enquiry can pick them up the moment the customer proceeds via
// "View Cart & Submit" — read once, then cleared, so it never leaks
// into an unrelated later visit.
const KEY = "customerDraftSession";

export function getDraftSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDraftSession(meta) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* best effort — worst case Additional Details just don't carry over */
  }
}

export function clearDraftSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}