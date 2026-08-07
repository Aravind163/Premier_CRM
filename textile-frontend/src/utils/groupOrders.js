// src/utils/groupOrders.js
export function groupOrders(orders) {
  const groups = new Map();
  for (const o of orders) {
    // GroupRef is the standard key (AddOrder.jsx + storeBulk both write
    // it now). CartRef is kept as a fallback so orders created by the
    // customer cart checkout before this fix — which used to write
    // CartRef instead — still group correctly instead of showing as
    // separate orders forever.
    const key = o.OrderDetails?.GroupRef || o.OrderDetails?.CartRef || `single-${o.Id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }

  return Array.from(groups.entries()).map(([key, rows]) => {
    const first = rows[0];
    const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.TotalAmount) || 0), 0);
    const totalQty = rows.reduce((sum, r) => sum + (Number(r.Quantity) || 0), 0);

    const productNames = rows.map((r) => r.product?.Name).filter(Boolean);
    const productLabel = productNames.length === 0
      ? "—"
      : productNames.length === 1
        ? productNames[0]
        : `${productNames[0]} +${productNames.length - 1} more`;

    return {
      groupKey: key,
      id: first.Id,
      code: first.OrderDetails?.EnquiryOrderNo || first.Code,
      customer: first.customer || first.CustomerId,
      status: first.Status,
      createdAt: first.createdAt || first.CreatedAt || first.EnquiryDate || null,
      deliveryDate: first.DeliveryDate,
      notes: first.Notes,
      itemCount: rows.length,
      productLabel,
      totalAmount,
      totalQty,
      rows,
    };
  });
}