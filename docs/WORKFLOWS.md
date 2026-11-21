# CIRCLO Workflows

## Seller
1. **Sell with us** → three steps: the piece → photos (1–4) → contact details and consent.
2. Photos are resized in the browser, then uploaded. The seller gets a reference such as `CIR-261021-A1B2C3`.
3. The piece is saved as **Pending** and is completely private, including its photos.
4. The team reviews it in **Admin → Products → Pending review** and chooses:
   - **Approve:** the piece appears in the shop within seconds and its photos become link-viewable.
   - **Request changes** (note required): stays private. Contact the seller, edit the listing, then approve.
   - **Reject** (note required): stays private.
5. Sellers are not emailed automatically. Use the seller contact shown in the product drawer.

## Buyer
1. Browse **Shop** (search, category, condition, price, availability, sort) → open a piece.
2. **Enquire about this piece** → name, contact, optional message → reference `ENQ-…`. One enquiry per contact per piece.
3. Reserved pieces stay visible with a *Reserved* badge but cannot be enquired about. Sold, hidden, pending and rejected pieces never appear.
4. General questions go through **Contact** (`MSG-…`). They appear in Admin → Enquiries marked "Message".

## Team: from enquiry to handover
```
Enquiry ─► Order (Pending Review) ─► Confirmed ─► In Fulfilment ─────────────────────────► Completed
                                        │            │                                        ▲
                                        │       Pickup: Scheduled ─► Collected ─► Verified    │
                                        │                                           │         │
                                        │       Delivery: Scheduled ─► Out for Delivery ─► Delivered ─► Handover Recorded
                                        └─ Cancel (any time before completion; cascades)
```
| Step | Where | What happens |
|---|---|---|
| Create order | Enquiries → open → *Create an order* | Order `ORD-…` = Pending Review; enquiry = Converted. Blocked if the piece isn't Available or already has an active order. |
| Confirm | Orders → open → *Confirm order* | Order = Confirmed; piece = **Reserved** in the shop. |
| Schedule pickup | Orders → *Schedule pickup* | Date (not in the past), slot, team member, seller's address → `PCK-…`; order = In Fulfilment. |
| Pickup outcome | Pickups → open → Update | *Mark collected*, *Mark failed* (reason, attempt counted), *Reschedule*, *Cancel*. |
| Item check | Pickups (Collected) | *Item matches listing* → Verified, or *Item doesn't match* (notes) → Verification Failed; then decide with both parties and cancel the order if needed. |
| Schedule delivery | Orders → *Schedule delivery* (only after Verified) | Defaults to the buyer's address → `DLV-…`. |
| Delivery outcome | Deliveries → open → Update | *Out for delivery* → *Mark delivered*; or *Mark failed* (reason) → *Reschedule* / *Return to seller* (order cancelled, piece hidden) / *Cancel*. |
| Handover | Deliveries (Delivered) → *Record handover* | Receiver's name required → Handover Recorded; order = **Completed**; piece = **Sold** and removed from the shop; photos made private. |
| Cancel order | Orders → *Cancel order* (reason) | Open pickups/deliveries are cancelled; a Reserved piece returns to Available. |

Filters: Pickups and Deliveries can be filtered by status tab, date and team member. **Item history** (Products → open → History) shows the full journey across the product, order, pickup and delivery.

## Status reference
| Record | Statuses |
|---|---|
| Product review | Pending · Approved · Changes Requested · Rejected |
| Product availability | Available · Reserved · Sold · Hidden |
| Enquiry | New · Contacted · Converted · Closed |
| Order | Pending Review · Confirmed · In Fulfilment · Completed · Cancelled |
| Pickup | Scheduled · Rescheduled · Collected · Verified · Verification Failed · Failed · Cancelled |
| Delivery | Scheduled · Rescheduled · Out for Delivery · Delivered · Failed · Returned to Seller · Cancelled |
| Handover | Pending · Recorded |

**Public visibility rule:** a piece is public only when Review = Approved **and** Availability = Available or Reserved.

## Settings (owner)
Admin → Settings: categories, conditions, public email, phone and service area, pickup and delivery time slots, submission limit, team members, and "Sign out all sessions". Admin accounts are managed in Apps Script (SETUP §2).
