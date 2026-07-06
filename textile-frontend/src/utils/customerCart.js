// src/utils/customerCart.js
//
// The cart used to live only inside CustomerShop.jsx's component state,
// which meant it vanished the moment you navigated away. Now that
// "browse + specify requirements" (ProductCatalog) and "review + submit"
// (OrderEnquiry) are separate pages, the cart needs to survive the
// navigation between them — so it's backed by localStorage here, with a
// custom event so any mounted component (e.g. the sidebar cart badge)
// can react immediately without waiting on the native `storage` event
// (which doesn't fire in the same tab that made the change).

const CART_KEY = "customer_cart";
export const CUSTOMER_CART_EVENT = "customer-cart-updated";

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CUSTOMER_CART_EVENT));
}

export function getCart() {
  return readCart();
}

export function getCartCount() {
  return readCart().reduce((sum, i) => sum + (i.qty || 0), 0);
}

// A "line" is a product + a specific Color/Size requirement. The same
// product with a different color/size is tracked as its own line so a
// customer can request e.g. 5 Red-M and 3 Blue-L of the same product.
export function addToCart({ product, qty, color, size }) {
  const items = readCart();
  const key = `${product.Id}::${color || ""}::${size || ""}`;
  const existing = items.find((i) => i.key === key);
  const cap = product.Quantity || Infinity;

  if (existing) {
    existing.qty = Math.min(existing.qty + qty, cap);
  } else {
    items.push({
      key,
      product,
      qty: Math.min(Math.max(qty, 1), cap),
      color: color || "",
      size: size || "",
    });
  }
  writeCart(items);
  return items;
}

export function updateCartQty(key, qty) {
  const items = readCart();
  const item = items.find((i) => i.key === key);
  if (!item) return items;
  const cap = item.product.Quantity || qty;
  item.qty = Math.max(1, Math.min(qty, cap));
  writeCart(items);
  return items;
}

export function removeFromCart(key) {
  const items = readCart().filter((i) => i.key !== key);
  writeCart(items);
  return items;
}

export function clearCart() {
  writeCart([]);
}

export function subscribeToCart(callback) {
  window.addEventListener(CUSTOMER_CART_EVENT, callback);
  return () => window.removeEventListener(CUSTOMER_CART_EVENT, callback);
}