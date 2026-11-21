# CIRCLO: Setup, Security & Ownership

## 1. Deploy the backend (one time, ~15 minutes)
1. Sign in to the Google account that will **own** CIRCLO's data. Use a dedicated business account if possible.
2. Open https://script.google.com → **New project** → name it `CIRCLO API`.
3. Delete the sample code, paste all of `apps-script/Code.gs`, click **Save**.
4. Select `setup` in the function dropdown → **Run** → **Review permissions** → choose your account → allow.
   Google may warn "app isn't verified": click *Advanced → Go to CIRCLO API*. It is your own script.
5. The **Execution log** shows your spreadsheet and image-folder links. `setup()` is safe to run again; it never deletes data.

## 2. Create your admin account
Passwords are never written in code or in the Sheet.
1. In Apps Script, open **Project Settings (⚙) → Script Properties → Add script property**:
   - `NEW_ADMIN_EMAIL` = your email
   - `NEW_ADMIN_PASSWORD` = a strong password (10+ characters)
   - optional `NEW_ADMIN_ROLE` = `owner` (default) or `manager`
2. **Save**, go back to the editor, select `addAdminFromProperties` → **Run**.
3. The script stores only a salted, iterated hash in the `ADMINS` property and **deletes the plain-text password property automatically**.

Repeat for each team member. **Owners** can change settings and team members; **managers** can do everything else.
- **Reset a password:** repeat step 1–2 with the same email.
- **Remove an admin:** add `REMOVE_ADMIN_EMAIL` and run `removeAdminFromProperties()`. Everyone is signed out.

## 3. Deploy as a web app
1. **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (needed so the public website can call it; every admin action is still checked on the server)
2. **Deploy** → copy the URL ending in `/exec`.
3. In `config.js` set `API_URL: "https://script.google.com/macros/s/…/exec"`.
4. Check it: open `<your /exec URL>?action=listProducts` in a browser. You should see `{"ok":true,…}`.
5. Sign in at `admin/login.html`.

**Updating Code.gs later:** Deploy → **Manage deployments** → ✏ Edit → Version: **New version** → Deploy. The URL stays the same.

## 4. Host the website (CIRCLO uses Netlify)
1. Copy the website files (everything except `tests/` and `docs/`) into a folder such as `CIRCLO_netlify_upload`.
2. Go to https://app.netlify.com/drop, drag the folder in, then **Claim** the site by signing in. Unclaimed drops expire after one hour and are password-protected.
3. For later updates: Netlify → your site → **Deploys** → drag the folder again.
Any other static HTTPS host also works.

## 5. First steps after launch
1. **Admin → Settings:** check categories, conditions, public email/phone, service area and time slots.
2. **Settings → Team members:** add the people who do pickups and deliveries.
3. Review `privacy.html` and `terms.html`. They are marked as drafts and need the business owner's approval, especially the return policy.

## 6. Security model (what is and isn't protected)
| Item | Status |
|---|---|
| Spreadsheet & image folder | **Private** to the owner. Only the script reads or writes them. Never share them publicly. |
| `/exec` URL, `config.js` | **Public by design.** They contain no secrets. |
| Admin passwords | Stored only as salted HMAC-SHA256 hashes (2,000 rounds) in Script Properties. |
| Sessions | Random 256-bit token, held server-side in Apps Script cache. Expires after **2 h idle** and after **12 h** maximum. Stored in the browser's `sessionStorage`, so closing the tab ends it. |
| Every admin action | Token checked on the server; owner-only actions also check role. |
| Brute force | 5 failed sign-ins per email or 30 overall in 15 minutes → locked for 15 minutes. Failures are logged. |
| "Sign out all sessions" | Settings → Security (owner). Invalidates every token immediately. |
| Public API | Can only create *pending* submissions, enquiries and messages, and read *approved* listings. It cannot approve, edit, or see private data. |
| Inputs | Validated on the server (types, lengths, allowed values). Spreadsheet formula injection blocked. All output is HTML-escaped. |
| Spam | Hidden honeypot field; per-contact rate limits (submissions/hour configurable, 1 enquiry per piece, 3 messages/hour). |
| Concurrency | All writes run under Apps Script's script lock. |
| Audit | Sign-ins, reviews, edits, order/pickup/delivery changes and direct Sheet edits are logged in **AdminAudit**. |

### Photo privacy
- Uploaded photos are saved **private** in "CIRCLO Product Images (private)".
- They become viewable by link **only while the piece is approved and Available or Reserved**. Rejected, pending, sold and hidden pieces' photos are switched back to private automatically, whether the change was made in the admin panel or directly in the Sheet.
- Admins see private photos through the authenticated API, not public links.
- **If your Google Workspace blocks link sharing**, approved photos won't show publicly. The failure is logged as `IMAGE_SHARE_FAILED` in AdminAudit. Ask your Workspace admin to allow "anyone with the link" for this folder, or use a personal Google account.
- v1 photos (if any) were link-shared on upload. Re-approving or editing those products applies the new rule.

### Known limitations
- Password sign-in is the safest option that works on any static host without extra Google Cloud setup. Google Sign-In with 2-step verification would be stronger. It can be added later with an OAuth client ID.
- Rate limits use contact details, so a determined spammer can vary them. Add reCAPTCHA if spam appears.
- Sellers and buyers are **not notified automatically**. The team contacts them by phone or email.
- No online payment, courier integration or GPS tracking. These are intentionally not implemented.
- Apps Script quotas (consumer account): about 6 minutes per call, 20k fetches/day, ~30 simultaneous users. This is fine for a small marketplace. Sheets is comfortable up to a few thousand products.
- Catalogue responses are cached for 60 seconds. Admin changes clear the cache immediately.
- Direct edits in the Sheet bypass the order/pickup/delivery rules. Use the admin panel for those; edit the Sheet only for products and settings.

## 7. Ownership & handover
Everything lives in the owner's Google account: the spreadsheet, the image folder and the Apps Script project.
- **Add a co-owner:** share the spreadsheet, folder and script project as Editor, and create an admin account for them (§2).
- **Hand over fully:** transfer ownership of all three in Google Drive (Share → Make owner). The new owner then redeploys the web app from their account (§3), updates `API_URL`, and re-creates admin accounts.
- Keep a copy of this folder. It contains no secrets.

## 8. Troubleshooting
| Problem | Fix |
|---|---|
| "We couldn't reach CIRCLO" | `API_URL` is wrong, or the deployment isn't "Anyone". Test `?action=listProducts`. |
| Admin sign-in button disabled | `API_URL` is empty in `config.js`. |
| "Incorrect email or password" | Re-create the admin (§2). Emails are case-insensitive. |
| "Too many failed attempts" | Wait 15 minutes. |
| Signed out unexpectedly | 2 h idle or 12 h limit reached, or an owner used "Sign out all sessions". |
| Code changes not live | Deploy a **New version** (§3). |
| First load slow (10–20 s) or "unexpected response" | Apps Script is waking up after being idle. The site retries reads automatically; reload if it persists. |
| Website changes not live | Re-drag the upload folder in Netlify → Deploys. |
| Approved piece missing from shop | Wait up to 60 s, refresh; check Availability is Available/Reserved. |
| Photos not showing publicly | Check AdminAudit for `IMAGE_SHARE_FAILED` (see Photo privacy). |
| "Add an active team member in Settings first" | Settings → Team members → Add. |
| Can't schedule delivery | The pickup must be **Verified** first. |
| "Database not set up" | Run `setup()`. |

## 9. Running the automated tests (developers only)
Requires Node.js 18+ and Python with Playwright (`pip install playwright pillow && playwright install chromium`).
```
node tests/backend.test.js                       # 87 backend checks against a simulated Google environment
LIVE=1 node tests/server.js 8787 &                # site + simulated backend
node tests/server.js 8788 &                       # site in demo mode
python3 tests/e2e.py                              # 70 browser checks
```
The test server creates a throwaway admin (`owner@test.local`) **in memory only**. It never touches Google.
