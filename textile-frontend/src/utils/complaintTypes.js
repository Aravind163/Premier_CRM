// src/utils/complaintTypes.js
//
// Single source of truth for the complaint "Type" field, shared by:
//   - src/pages/RaiseComplaint.jsx (customer picks one when filing)
//   - src/pages/master/ComplaintsAndClaims.jsx (staff filters/reads by it)
//
// Previously these lived as two separate, mismatched lists — a customer
// could file a complaint as "Wrong Item / Size" while staff could only
// ever filter by "Quantity" / "Dispatch Delay" / etc, so the Type filter
// on the staff page would never match anything customers actually sent.
// Both pages now import this array instead of declaring their own, so
// they can never drift apart again.
export const COMPLAINT_TYPES = [
  "Quality Issue",
  "Wrong Item / Size",
  "Damaged in Transit",
  "Delivery Delay",
  "Billing Issue",
  "Other",
];