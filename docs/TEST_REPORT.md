# CIRCLO Test Report (updated 22 October 2026)

Three kinds of testing: **simulated** (Code.gs run in Node against an imitation of Google services), **local browser** (the real pages against that simulation), and **live** (the real Google deployment and the hosted site).

## How it was tested
- **Backend:** the real `apps-script/Code.gs` was run in Node against `tests/gas-mock.js`. The mock is an in-memory imitation of SpreadsheetApp, DriveApp, CacheService, PropertiesService, LockService and Utilities.
- **Browser:** Playwright (Chromium) drove the real pages. One server ran demo mode (no backend). A second server answered API calls with the same `Code.gs` and mock, so the site, admin panel and backend logic were exercised end to end.
- **Photos:** the six Unsplash photos were loaded in a real browser on the owner's computer. All six returned images, and each was visually checked to match its label.

## Results
| Suite | Result |
|---|---|
| Backend logic (`tests/backend.test.js`) | **87 / 87 passed** |
| Browser end-to-end (`tests/e2e.py`) | **71 / 71 passed** |
| JavaScript syntax (all files incl. Code.gs) | passed |
| Hard-coded secrets scan | none found |

### Covered by passing tests
- **Public pages:** all 10 pages load; all internal links resolve; no JavaScript errors; no horizontal overflow at 390 px and 768 px; mobile menu works; reduced-motion keeps content visible.
- **Shop:** category from URL, search, price filter, sort, reserved toggle, empty state.
- **Product page:** details and gallery; unknown or pending IDs show "not available".
- **Seller submission:** step validation, photo required, thumbnails and remove, real upload, `CIR-` reference, "pending review" message; pending piece absent from shop and product page.
- **Server validation:** consent, category, description length, contact format, price range, photo count and type, unknown action, invalid JSON, spreadsheet formula injection.
- **Privacy:**
  - Seller name and phone are never present in public responses or HTML.
  - Pending and rejected photos stay private; approved photos become link-shared; sold photos return to private.
  - The admin image endpoint refuses file IDs that don't belong to a product.
- **Admin auth:**
  - No token, forged token and wrong password are all rejected.
  - Password stored only as a hash and the plain-text property deleted.
  - Logout invalidates the token; "sign out everywhere" invalidates other sessions.
  - Lockout after 5 failures; managers are blocked from owner-only settings.
  - A forged session in the browser is redirected to sign-in.
- **Review:** approve, reject (note required), invalid product ID.
- **Enquiries and contact:** saved; duplicate enquiry blocked; enquiry on a rejected piece blocked.
- **Orders:**
  - Create from enquiry; duplicate blocked; pickup before confirmation blocked.
  - Confirm sets the piece to Reserved, which shows in the shop; manual availability change is blocked during an active order.
  - Cancellation needs a reason, cascades to the pickup, returns the piece to Available, and cannot be re-confirmed.
- **Pickup:** past date and invalid slot rejected; failed (reason required) → rescheduled → collected → verified; invalid transitions blocked; second pickup blocked; date filter.
- **Delivery:**
  - Blocked before verification.
  - Out → failed → rescheduled → out → delivered.
  - Handover blocked before delivery, requires the receiver's name, and can't be recorded twice.
  - Recording it completes the order, marks the piece Sold and removes it from the shop.
- **Admin panel:** dashboard real counts, staff add, settings save and visible publicly, item history, activity log, mobile sidebar and no overflow.

## Live Google integration test (22 October 2026, real deployment)
Run against the deployed Apps Script, the real Google Sheet and Drive, and the Netlify-hosted site, in the Claude desktop browser signed in as the owner.

| Area | Result |
|---|---|
| Code in Apps Script matches tested file (SHA-256) | PASS |
| `setup()`: 8 tabs, folder, properties, trigger | PASS |
| Admin created; plain-text password property deleted | PASS |
| Health and catalogue endpoints | PASS |
| Admin action with no token / forged token | PASS: refused (AUTH) |
| Wrong admin password | PASS: refused |
| Unknown action, invalid submission | PASS: clear errors |
| Spreadsheet not publicly readable | PASS: anonymous query denied |
| Seller form on live site: photo upload to Drive → reference, Pending | PASS (CIR-261022-9D9901, ~6 s) |
| Pending piece hidden from shop and product URL | PASS |
| Admin sign-in (owner typed password) and dashboard counts | PASS |
| Admin views private photo through the server | PASS |
| Reject needs a note; reject works | PASS |
| Approve → appears in shop; seller name/contact absent from public data | PASS |
| Photo sharing: approved = Shared, rejected = private (checked in Drive) | PASS |
| Team member added; phone keeps leading zero | PASS |
| Buyer enquiry saved; duplicate enquiry blocked | PASS (ENQ-261022-B88D5E) |
| Order created from enquiry → confirmed → piece shows Reserved; enquiries on reserved piece refused | PASS (ORD-261022-964C0C) |
| Pickup scheduled → failed (reason) → rescheduled → collected → verified | PASS |
| Delivery scheduled (buyer address) → out → failed (reason) → rescheduled → out → delivered | PASS (DLV-261022-26840C) |
| Handover without receiver refused; handover recorded | PASS |
| Order Completed; piece Sold and gone from shop; duplicate handover refused | PASS |
| Item history shows all 20 steps | PASS |
| Pickup on a completed order refused | PASS |
| Cancellation: reason required, piece back to Available, cannot re-confirm | PASS (ORD-261022-2AD7EC) |
| Hide piece → removed from shop | PASS |
| Sold and hidden photos switched back to private (checked in Drive) | PASS |

### Issues found live
1. **Cold-start replies.** While Apps Script was waking up (first calls took 13–22 s), Google occasionally returned a non-JSON page. Pages showed "unexpected response" until reloaded. **Fixed:** read-only requests retry once automatically; writes never retry, to avoid duplicates. The admin panel now shows an error with "Try again" instead of a blank page. A regression test was added (71/71). The fix is in the project; **re-upload to Netlify to publish it.**
2. During testing, some requests fired right after a page load in the Claude browser were blocked by that browser's own per-site approval prompts. This is specific to the test browser, not to visitors' browsers, but the retry above also helps.

### Not live-tested
- Direct edits typed into the Sheet (the `onSheetEdit` trigger). Logic is unit-tested; try changing a test row's ApprovalStatus in the Sheet and check AdminAudit.
- Manager-role restrictions (only an owner account exists live; covered in simulated tests).
- Session idle expiry after 2 hours and lockout after 5 failed sign-ins (simulated tests only, to avoid locking you out).
- Real phones (iOS Safari, Android Chrome) and screen readers.

## Manual checks still recommended
- Visual review on a real phone (iOS Safari, Android Chrome).
- Screen-reader pass (labels, focus order, dialogs were built with semantic HTML and tested for keyboard focus only).
- Business review of `privacy.html` and `terms.html`, especially the return policy.
