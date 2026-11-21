# CIRCLO Live Deployment & Final Checklist (22 October 2026)

All details here are safe to share. **No passwords, tokens or keys are stored in this project.**

## Live resources
| Resource | Value |
|---|---|
| Owner Google account | ts5330307@gmail.com (owns the Sheet, Drive folder and Apps Script) |
| Website (Netlify) | https://fantastic-kitten-b795fb.netlify.app (rename in Netlify → Site configuration → Change site name) |
| Admin sign-in | https://fantastic-kitten-b795fb.netlify.app/admin/login.html |
| API (Apps Script web app) | https://script.google.com/macros/s/AKfycbxqwp9NrmEVWDPpvlp6zC1jwf1ifzs9YDybc1Tszl40tY901g9Volqgj5NCxN3qc6w/exec |
| Web app settings | Execute as: Me (owner) · Who has access: Anyone · Deployment "CIRCLO v2 initial deployment" |
| Private Google links | Spreadsheet, photo folder and Apps Script editor: see `docs/PRIVATE_LINKS.local.md` (local only, not in the ZIP), or open them from the owner's Google Drive / script.google.com |
| Admin accounts | ts5330307@gmail.com (owner). Stored as a salted hash in Script Properties → `ADMINS`. |

The spreadsheet is **not** publicly viewable. This was confirmed live: Google refused an anonymous query to it.

## How the pieces connect
`config.js` → `API_URL` (the public Apps Script `/exec` URL). Every page sends JSON as `text/plain` POST requests to it, so browsers send no CORS preflight. Google answers with `Access-Control-Allow-Origin: *`, so any origin (Netlify, localhost, a file) can call it. Security does **not** depend on origin: admin actions require a server-checked session token, and public actions can only create pending records or read approved listings.

## Run locally (Windows)
1. Double-click **`run-circlo.bat`** in the project folder.
2. It checks for Python 3 (`py -3`, then `python`); if neither exists it uses the PowerShell server in `tools\serve.ps1` (built into Windows; nothing is installed).
3. It picks the first free port from **8080** to 8099, prints the address, and opens your browser at `http://localhost:8080/`.
4. Keep the window open while you use the site. **To stop:** press **Ctrl+C** (answer **Y**), or close the window.

**Important:** localhost serves the website files only. With `API_URL` set in `config.js`, the local copy talks to the **live** Google backend, so submissions, enquiries and admin changes made locally are **real**. For a safe sandbox, set `API_URL: ""` (demo mode, nothing saved) or use the developer test server (`tests/server.js`, see SETUP §9).

## Updating the site
- **Website files changed:** copy the changed files into `Downloads\CIRCLO_netlify_upload` (or recreate it from the project without `tests/` and `docs/`). Then go to Netlify → your site → **Deploys** → drag the folder onto "Drag and drop your project folder here".
- **Code.gs changed:** paste it into the Apps Script editor → Save → Deploy → **Manage deployments** → ✏ → Version: **New version** → Deploy. The API URL stays the same.

## Final checklist
### Done
- [x] Project installed into `Downloads\CIRCLO\CIRCLO` (backup kept at `Downloads\CIRCLO\backup_before_premium_20261021`)
- [x] Apps Script project created and code verified byte-for-byte (SHA-256 prefix `7b1b41f2fe0a9a66`)
- [x] `setup()` run: 8 sheets, dropdowns, default settings, private photo folder, edit trigger
- [x] Owner admin created via Script Properties; plain-text password property auto-deleted
- [x] Web app deployed (Me / Anyone); `config.js` connected
- [x] Website hosted on Netlify and claimed (permanent)
- [x] Live end-to-end test passed (see TEST_REPORT.md)
- [x] Two issues found live and fixed: automatic retry for read requests during Apps Script cold starts; admin panel shows an error instead of a blank page

### Needs you
- [ ] Delete the test data (all rows marked **TEST** / **[TEST]**) when you no longer need it. See "Removing test data" below.
- [ ] Settings in Admin: public phone, service area wording, real time slots.
- [ ] Add your real pickup/delivery team in Admin → Settings, and deactivate "TEST Ravi (live check)".
- [ ] Optional: rename the Netlify site and/or connect your own domain (Netlify → Domain management).

### Business decisions still open
- Return policy after delivery (Terms §7 placeholder) and final approval of Privacy and Terms pages.
- Real contact email/phone (currently hello@circlo.in placeholder) and service area.
- Pricing and commission model, and how payment is collected (the site deliberately has no online payment).
- Who else should have admin access (owner vs manager).

## Removing test data
In the spreadsheet, delete these rows:
- **Products:** CIR-261022-5560FA, CIR-261022-9D9901
- **Enquiries:** rows from TEST Buyer Meera / TEST Cancel Buyer
- **Orders:** ORD-261022-964C0C, ORD-261022-2AD7EC
- **Pickups:** 1 row
- **Deliveries:** DLV-261022-26840C
- **Staff:** TEST Ravi (or just deactivate it in Admin)

Also delete the two `CIR-261022-…-1.jpg` files in the photo folder. Keep the AdminAudit rows as your history, or clear them.
