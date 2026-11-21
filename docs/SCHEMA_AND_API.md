# CIRCLO Data Schema & API

## Spreadsheet: "CIRCLO Marketplace Database"
IDs look like `PREFIX-YYMMDD-XXXXXX` and never depend on row numbers. Don't rename or reorder header rows; new columns were added at the **end** so v1 data stays valid. Dates for pickups/deliveries are stored as text `YYYY-MM-DD`.

| Sheet | Columns | Notes |
|---|---|---|
| **Products** | ProductID (`CIR-`), CreatedAt, UpdatedAt, SellerName, SellerContact, Title, Description, Category, Brand, Condition, Price, ImageURL, ImageURLs (JSON), ApprovalStatus, AvailabilityStatus, ReviewedAt, ReviewedBy, ReviewNotes, PublicReference, **ImageFileIDs** (JSON, new) | Seller columns are never returned publicly. |
| **Enquiries** | EnquiryID (`ENQ-`/`MSG-`), CreatedAt, ProductID, ProductTitleSnapshot, BuyerName, BuyerContact, Message, Consent, Status, AdminNotes, **Type** (Product/Contact), **OrderID** | Contact-form messages: Type = Contact, ProductTitleSnapshot = subject. |
| **Orders** (new) | OrderID (`ORD-`), CreatedAt, UpdatedAt, ProductID, EnquiryID, ProductTitle, Price, BuyerName, BuyerContact, DeliveryAddress, Status, CancelReason, Notes | One active order per product. |
| **Pickups** (new) | PickupID (`PCK-`), CreatedAt, UpdatedAt, OrderID, ProductID, Date, Slot, StaffID, PickupAddress, Status, Attempts, FailureReason, VerificationNotes, CompletedAt, Notes | One active pickup per order. |
| **Deliveries** (new) | DeliveryID (`DLV-`), CreatedAt, UpdatedAt, OrderID, ProductID, Date, Slot, StaffID, DeliveryAddress, Status, Attempts, FailureReason, HandoverStatus, ReceivedBy, HandoverAt, Notes | One active delivery per order. |
| **Staff** (new) | StaffID (`STF-`), Name, Phone, Role, Active (Yes/No), CreatedAt | |
| **Settings** | Key, Value, Notes | Categories, Conditions, ContactEmail, ContactPhone, ServiceArea, PickupSlots, DeliverySlots, MaxSubmissionsPerHour |
| **AdminAudit** | Timestamp, Actor, EntityID, Action, OldValue, NewValue, Notes | Column 3 renamed from ProductID to EntityID (holds any record ID). |

**Script Properties (secret, not in the Sheet):** SHEET_ID, FOLDER_ID, ADMINS (hashed), SESSION_EPOCH. The v1 `ADMIN_KEY` is removed by `setup()`.

## API
`POST <API_URL>` with a JSON body sent as `Content-Type: text/plain` (Apps Script can't answer CORS preflight requests). Response: `{"ok":true,"data":…}` or `{"ok":false,"error":"…","code":"AUTH"|"FORBIDDEN"?}`.

### Public
| action | Body | Returns |
|---|---|---|
| `listProducts` | none | `{products[], categories[], conditions[], site{contactEmail,contactPhone,serviceArea}}` (public listings only) |
| `getProduct` | productId | one public product, or error |
| `submitProduct` | sellerName, sellerContact, title, description (≥20), category, condition, price, brand?, consent:true, images:[{type,data(base64)}] (1–4, ≤5 MB each) | `{reference, status:"Pending"}` |
| `submitEnquiry` | productId, buyerName, buyerContact, message?, consent:true | `{reference}` |
| `submitContact` | name, contact, subject, message, consent:true | `{reference}` |
| `adminLogin` | email, password | `{token, email, role, idleMinutes}` |

### Admin (every call includes `token`)
| action | Body | Notes |
|---|---|---|
| `adminSession`, `adminLogout` | none | `adminLogoutAll` (owner) signs everyone out |
| `adminDashboard` | none | metrics, upcoming operations, recent activity |
| `adminList` | entity: products, enquiries, orders, pickups, deliveries, staff, audit or settings | rows (+ meta) |
| `adminImage` | fileId | base64 photo, only for files linked to a product |
| `adminHistory` | productId | linked orders, pickups, deliveries and audit entries |
| `adminReviewProduct` | productId, decision (Approved/Rejected/Changes Requested), notes | notes required unless approving |
| `adminUpdateProduct` | productId, fields{title,description,price,category,condition,brand,availability} | availability locked while an order is active |
| `adminUpdateEnquiry` | enquiryId, status?, notes? | |
| `adminCreateOrder` | enquiryId, address?, notes? | |
| `adminOrderAction` | orderId, op: confirm, cancel (reason) or note (notes, address) | |
| `adminSchedulePickup` | orderId, date, slot, staffId, address, notes? | |
| `adminPickupAction` | pickupId, op: reschedule (date, slot, staffId), collected, verified (notes?), verification_failed (notes), failed (reason) or cancel (reason?) | |
| `adminScheduleDelivery` | orderId, date, slot, staffId, address?, notes? | requires a Verified pickup |
| `adminDeliveryAction` | deliveryId, op: reschedule, out, delivered, failed (reason), returned (reason), cancel or handover (receivedBy, notes?) | |
| `adminStaff` (owner) | op: add (name, phone?, role) or toggle (staffId) | |
| `adminSaveSettings` (owner) | settings{Key: Value} | only known keys |

Invalid transitions return a clear error, for example "A pickup that is Collected cannot be changed this way".
