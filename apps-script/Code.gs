/**
 * CIRCLO — Google Apps Script backend (v2: admin sessions, orders, pickups, deliveries, private images).
 *
 * SETUP (details in docs/SETUP.md)
 *  1. Paste this file into a new Apps Script project and run setup() once.
 *  2. Project Settings > Script Properties: add NEW_ADMIN_EMAIL and NEW_ADMIN_PASSWORD, then run addAdminFromProperties().
 *  3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Put the /exec URL in config.js.
 *
 * SECURITY MODEL
 *  - The spreadsheet and image folder stay private to the owner; only this script touches them.
 *  - Admins sign in with email + password. Passwords are stored only as salted, iterated hashes in Script Properties.
 *  - Sign-in returns a random session token (2h idle timeout, 12h maximum). Every admin action checks it on the server.
 *  - Uploaded photos are private. They are shared "anyone with the link" only while the product is publicly listed.
 */

const P = PropertiesService.getScriptProperties();
const TZ = 'Asia/Kolkata';

const APPROVAL = ['Pending', 'Approved', 'Rejected', 'Changes Requested'];
const AVAIL = ['Available', 'Reserved', 'Sold', 'Hidden'];
const ENQ_STATUS = ['New', 'Contacted', 'Converted', 'Closed'];
const ORDER_STATUS = ['Pending Review', 'Confirmed', 'In Fulfilment', 'Completed', 'Cancelled'];
const PICKUP_STATUS = ['Scheduled', 'Rescheduled', 'Collected', 'Verified', 'Verification Failed', 'Failed', 'Cancelled'];
const DELIVERY_STATUS = ['Scheduled', 'Rescheduled', 'Out for Delivery', 'Delivered', 'Failed', 'Returned to Seller', 'Cancelled'];
const ACTIVE_ORDER = ['Pending Review', 'Confirmed', 'In Fulfilment'];
const ACTIVE_PICKUP = ['Scheduled', 'Rescheduled', 'Collected', 'Verified'];
const ACTIVE_DELIVERY = ['Scheduled', 'Rescheduled', 'Out for Delivery', 'Delivered'];

const HEADERS = {
  Products: ['ProductID','CreatedAt','UpdatedAt','SellerName','SellerContact','Title','Description','Category','Brand','Condition','Price','ImageURL','ImageURLs','ApprovalStatus','AvailabilityStatus','ReviewedAt','ReviewedBy','ReviewNotes','PublicReference','ImageFileIDs'],
  Enquiries: ['EnquiryID','CreatedAt','ProductID','ProductTitleSnapshot','BuyerName','BuyerContact','Message','Consent','Status','AdminNotes','Type','OrderID'],
  Orders: ['OrderID','CreatedAt','UpdatedAt','ProductID','EnquiryID','ProductTitle','Price','BuyerName','BuyerContact','DeliveryAddress','Status','CancelReason','Notes'],
  Pickups: ['PickupID','CreatedAt','UpdatedAt','OrderID','ProductID','Date','Slot','StaffID','PickupAddress','Status','Attempts','FailureReason','VerificationNotes','CompletedAt','Notes'],
  Deliveries: ['DeliveryID','CreatedAt','UpdatedAt','OrderID','ProductID','Date','Slot','StaffID','DeliveryAddress','Status','Attempts','FailureReason','HandoverStatus','ReceivedBy','HandoverAt','Notes'],
  Staff: ['StaffID','Name','Phone','Role','Active','CreatedAt'],
  Settings: ['Key','Value','Notes'],
  AdminAudit: ['Timestamp','Actor','EntityID','Action','OldValue','NewValue','Notes']
};
const SETTING_DEFAULTS = [
  ['Categories', 'Jewellery, Sarees, Lehengas, Kurtis, Dresses, Ethnic Wear, Handbags, Clutches, Accessories, Footwear', 'Comma-separated; shown on the website'],
  ['Conditions', 'New with tags, Like new, Gently used, Well loved', 'Comma-separated'],
  ['ContactEmail', 'hello@circlo.in', 'Shown on the website'],
  ['ContactPhone', '', 'Shown on the website'],
  ['ServiceArea', 'Moradabad and nearby areas', 'Where CIRCLO collects and delivers'],
  ['PickupSlots', '10:00-12:00, 12:00-14:00, 14:00-16:00, 16:00-18:00', 'Comma-separated'],
  ['DeliverySlots', '10:00-12:00, 12:00-14:00, 14:00-16:00, 16:00-18:00', 'Comma-separated'],
  ['MaxSubmissionsPerHour', '5', 'Per contact detail']
];
const EDITABLE_SETTINGS = SETTING_DEFAULTS.map(s => s[0]);

/* ============================ SETUP ============================ */
function setup() {
  let ss, id = P.getProperty('SHEET_ID');
  if (id) ss = SpreadsheetApp.openById(id);
  else { ss = SpreadsheetApp.create('CIRCLO Marketplace Database'); P.setProperty('SHEET_ID', ss.getId()); }

  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold').setBackground('#702D42').setFontColor('#FAF7F2');
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  const st = ss.getSheetByName('Settings'), have = st.getDataRange().getValues().map(r => r[0]);
  SETTING_DEFAULTS.filter(s => have.indexOf(s[0]) < 0).forEach(s => st.appendRow(s));

  const dv = list => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  const col = (sheet, name) => { const sh = ss.getSheetByName(sheet), c = HEADERS[sheet].indexOf(name) + 1; return sh.getRange(2, c, sh.getMaxRows() - 1, 1); };
  col('Products', 'ApprovalStatus').setDataValidation(dv(APPROVAL));
  col('Products', 'AvailabilityStatus').setDataValidation(dv(AVAIL));
  col('Enquiries', 'Status').setDataValidation(dv(ENQ_STATUS));

  if (!P.getProperty('FOLDER_ID')) P.setProperty('FOLDER_ID', DriveApp.createFolder('CIRCLO Product Images (private)').getId());
  if (!P.getProperty('SESSION_EPOCH')) P.setProperty('SESSION_EPOCH', '1');
  P.deleteProperty('ADMIN_KEY'); // v1 key is no longer used

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'onSheetEdit').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();

  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Image folder: https://drive.google.com/drive/folders/' + P.getProperty('FOLDER_ID'));
  Logger.log('Admins configured: ' + Object.keys(admins_()).length + '. Next: add NEW_ADMIN_EMAIL / NEW_ADMIN_PASSWORD in Script Properties and run addAdminFromProperties().');
}

/** Creates or updates an admin from Script Properties, then deletes the plain-text password property. */
function addAdminFromProperties() {
  const email = String(P.getProperty('NEW_ADMIN_EMAIL') || '').trim().toLowerCase();
  const pass = String(P.getProperty('NEW_ADMIN_PASSWORD') || '');
  const role = String(P.getProperty('NEW_ADMIN_ROLE') || 'owner').trim().toLowerCase();
  P.deleteProperty('NEW_ADMIN_PASSWORD');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set NEW_ADMIN_EMAIL to a valid email.');
  if (pass.length < 10) throw new Error('NEW_ADMIN_PASSWORD must be at least 10 characters. Set it again and re-run.');
  if (['owner', 'manager'].indexOf(role) < 0) throw new Error('NEW_ADMIN_ROLE must be owner or manager.');
  const salt = Utilities.getUuid(), list = admins_();
  list[email] = { salt: salt, hash: hash_(pass, salt), role: role, created: new Date().toISOString() };
  P.setProperty('ADMINS', JSON.stringify(list));
  P.deleteProperty('NEW_ADMIN_EMAIL'); P.deleteProperty('NEW_ADMIN_ROLE');
  Logger.log('Admin saved: ' + email + ' (' + role + '). The password property has been deleted.');
}
/** Removes the admin named in Script Property REMOVE_ADMIN_EMAIL and signs everyone out. */
function removeAdminFromProperties() {
  const email = String(P.getProperty('REMOVE_ADMIN_EMAIL') || '').trim().toLowerCase(), list = admins_();
  delete list[email]; P.setProperty('ADMINS', JSON.stringify(list)); P.deleteProperty('REMOVE_ADMIN_EMAIL');
  P.setProperty('SESSION_EPOCH', String(Date.now()));
  Logger.log('Removed ' + email + '. All sessions signed out.');
}

/* ============================ ROUTING ============================ */
const PUBLIC = { listProducts: listProducts_, getProduct: getProduct_, submitProduct: submitProduct_, submitEnquiry: submitEnquiry_, submitContact: submitContact_, adminLogin: adminLogin_ };
// [handler, needsLock, ownerOnly]
const ADMIN = {
  adminSession: [a => ({ email: a.email, role: a.role }), false],
  adminLogout: [adminLogout_, false],
  adminLogoutAll: [adminLogoutAll_, false, true],
  adminDashboard: [adminDashboard_, false],
  adminList: [adminList_, false],
  adminImage: [adminImage_, false],
  adminHistory: [adminHistory_, false],
  adminReviewProduct: [adminReviewProduct_, true],
  adminUpdateProduct: [adminUpdateProduct_, true],
  adminUpdateEnquiry: [adminUpdateEnquiry_, true],
  adminCreateOrder: [adminCreateOrder_, true],
  adminOrderAction: [adminOrderAction_, true],
  adminSchedulePickup: [adminSchedulePickup_, true],
  adminPickupAction: [adminPickupAction_, true],
  adminScheduleDelivery: [adminScheduleDelivery_, true],
  adminDeliveryAction: [adminDeliveryAction_, true],
  adminStaff: [adminStaff_, true, true],
  adminSaveSettings: [adminSaveSettings_, true, true]
};

function doGet(e) {
  const a = e && e.parameter && e.parameter.action;
  if (a === 'listProducts') return out_(() => listProducts_());
  return out_(() => ({ service: 'CIRCLO API', status: 'ok', version: 2 }));
}

function doPost(e) {
  return out_(() => {
    let b;
    try { b = JSON.parse(e.postData.contents); } catch (x) { throw err_('Invalid request'); }
    if (!b || typeof b !== 'object') throw err_('Invalid request');
    if (PUBLIC[b.action]) return PUBLIC[b.action](b);
    const route = ADMIN[b.action];
    if (!route) throw err_('Unknown action');
    const admin = auth_(b.token);
    if (route[2] && admin.role !== 'owner') throw err_('Only an owner can do this', 'FORBIDDEN');
    return route[1] ? withLock_(() => route[0](admin, b)) : route[0](admin, b);
  });
}

function out_(fn) {
  let res;
  try { res = { ok: true, data: fn() }; }
  catch (x) {
    res = { ok: false, error: x.userFacing ? x.message : 'Something went wrong. Please try again.' };
    if (x.code) res.code = x.code;
    if (!x.userFacing) console.error(x && x.stack || x);
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}
function err_(m, code) { const e = new Error(m); e.userFacing = true; if (code) e.code = code; return e; }

/* ============================ AUTH ============================ */
function admins_() { try { return JSON.parse(P.getProperty('ADMINS') || '{}'); } catch (x) { return {}; } }
function hash_(pass, salt) {
  let h = Utilities.computeHmacSha256Signature(pass, salt);
  for (let i = 0; i < 2000; i++) h = Utilities.computeHmacSha256Signature(h, Utilities.newBlob(salt).getBytes());
  return Utilities.base64Encode(h);
}
function digest_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)); }
function safeEq_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

function adminLogin_(b) {
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120), pass = String(b.password || '').slice(0, 200);
  const c = CacheService.getScriptCache(), fk = 'fail:' + digest_(email), gk = 'fail:all';
  if (+(c.get(fk) || 0) >= 5 || +(c.get(gk) || 0) >= 30) throw err_('Too many failed attempts. Try again in 15 minutes.');
  const a = admins_()[email];
  if (!a || !pass || !safeEq_(hash_(pass, a.salt), a.hash)) {
    c.put(fk, String(+(c.get(fk) || 0) + 1), 900); c.put(gk, String(+(c.get(gk) || 0) + 1), 900);
    Utilities.sleep(700);
    audit_('login', email, 'LOGIN_FAILED', '', '', '');
    throw err_('Incorrect email or password');
  }
  c.remove(fk);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), now = Date.now();
  c.put('sess:' + digest_(token), JSON.stringify({ email: email, role: a.role, epoch: P.getProperty('SESSION_EPOCH'), exp: now + 12 * 3600e3 }), 7200);
  audit_(email, email, 'LOGIN', '', '', '');
  return { token: token, email: email, role: a.role, idleMinutes: 120 };
}
function auth_(token) {
  if (typeof token !== 'string' || token.length !== 64) throw err_('Please sign in', 'AUTH');
  const c = CacheService.getScriptCache(), k = 'sess:' + digest_(token), raw = c.get(k);
  if (!raw) throw err_('Your session has expired. Please sign in again.', 'AUTH');
  const s = JSON.parse(raw), a = admins_()[s.email];
  if (!a || s.epoch !== P.getProperty('SESSION_EPOCH') || Date.now() > s.exp) { c.remove(k); throw err_('Your session has expired. Please sign in again.', 'AUTH'); }
  c.put(k, raw, 7200); // sliding idle timeout
  return { email: s.email, role: a.role, key: k };
}
function adminLogout_(a) { CacheService.getScriptCache().remove(a.key); audit_(a.email, a.email, 'LOGOUT', '', '', ''); return { signedOut: true }; }
function adminLogoutAll_(a) { P.setProperty('SESSION_EPOCH', String(Date.now())); audit_(a.email, '-', 'LOGOUT_ALL', '', '', ''); return { signedOut: true }; }

/* ============================ PUBLIC ============================ */
function settings_() {
  const s = {}; rows_('Settings').forEach(r => s[r.Key] = String(r.Value));
  const split = v => String(v || '').split(',').map(x => x.trim()).filter(String);
  return { raw: s, categories: split(s.Categories), conditions: split(s.Conditions), pickupSlots: split(s.PickupSlots), deliverySlots: split(s.DeliverySlots), maxPerHour: +s.MaxSubmissionsPerHour || 5 };
}
function isPublic_(r) { return r.ApprovalStatus === 'Approved' && (r.AvailabilityStatus === 'Available' || r.AvailabilityStatus === 'Reserved'); }
function json_(v, fb) { try { const x = JSON.parse(v || ''); return Array.isArray(x) ? x : fb; } catch (e) { return fb; } }
function publicView_(r) {
  let imgs = json_(r.ImageURLs, []);
  if (!imgs.length && r.ImageURL) imgs = [r.ImageURL];
  return { productId: r.ProductID, title: r.Title, description: r.Description, category: r.Category, brand: r.Brand, condition: r.Condition,
    price: Number(r.Price) || 0, images: imgs, availability: r.AvailabilityStatus, createdAt: iso_(r.CreatedAt) };
}
function listProducts_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('catalogue');
  if (hit) return JSON.parse(hit);
  const s = settings_();
  const data = { products: rows_('Products').filter(isPublic_).map(publicView_), categories: s.categories, conditions: s.conditions,
    site: { contactEmail: s.raw.ContactEmail || '', contactPhone: s.raw.ContactPhone || '', serviceArea: s.raw.ServiceArea || '' } };
  try { cache.put('catalogue', JSON.stringify(data), 60); } catch (x) {}
  return data;
}
function bust_() { CacheService.getScriptCache().remove('catalogue'); }
function getProduct_(b) {
  const r = find_('Products', str_(b.productId, 'Product', 40));
  if (!r || !isPublic_(r)) throw err_('This piece is not available');
  return publicView_(r);
}

function submitProduct_(b) {
  if (b.website) return { reference: 'CIR-RECEIVED', status: 'Pending' }; // honeypot
  const s = settings_();
  const d = {
    SellerName: str_(b.sellerName, 'Name', 80), SellerContact: contact_(b.sellerContact),
    Title: str_(b.title, 'Title', 100, 3), Description: str_(b.description, 'Description', 1500, 20),
    Category: oneOf_(b.category, s.categories, 'category'), Condition: oneOf_(b.condition, s.conditions, 'condition'),
    Brand: str_(b.brand || '', 'Brand', 60, 0), Price: num_(b.price, 'Price', 1, 1000000)
  };
  if (b.consent !== true) throw err_('Please accept the consent statement');
  const imgs = Array.isArray(b.images) ? b.images : [];
  if (!imgs.length || imgs.length > 4) throw err_('Please include 1 to 4 photos');
  imgs.forEach(im => { if (!im || !/^image\/(jpeg|png|webp)$/.test(im.type || '') || typeof im.data !== 'string') throw err_('Photos must be JPG, PNG or WebP'); });
  rateLimit_('sub:' + String(d.SellerContact).toLowerCase(), s.maxPerHour);

  const id = newId_('CIR'), folder = DriveApp.getFolderById(P.getProperty('FOLDER_ID')), ids = [], created = [];
  try {
    imgs.forEach((im, i) => {
      const bytes = Utilities.base64Decode(im.data);
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw err_('Each photo must be under 5 MB');
      const f = folder.createFile(Utilities.newBlob(bytes, im.type, id + '-' + (i + 1) + '.' + im.type.split('/')[1].replace('jpeg', 'jpg')));
      created.push(f); ids.push(f.getId()); // private: not shared until approved
    });
  } catch (x) { created.forEach(f => { try { f.setTrashed(true); } catch (y) {} }); throw x.userFacing ? x : err_('Photo upload failed. Please try again.'); }
  const urls = ids.map(thumb_), now = new Date();
  withLock_(() => append_('Products', Object.assign(d, { ProductID: id, CreatedAt: now, UpdatedAt: now, ImageURL: urls[0], ImageURLs: JSON.stringify(urls),
    ImageFileIDs: JSON.stringify(ids), ApprovalStatus: 'Pending', AvailabilityStatus: 'Available', PublicReference: id })));
  audit_('public', id, 'SUBMITTED', '', 'Pending', ids.length + ' photo(s)');
  return { reference: id, status: 'Pending' };
}
function thumb_(id) { return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200'; }

function submitEnquiry_(b) {
  if (b.website) return { reference: 'ENQ-RECEIVED' };
  const pid = str_(b.productId, 'Product', 40), p = find_('Products', pid);
  if (!p || !isPublic_(p) || p.AvailabilityStatus !== 'Available') throw err_('This piece is no longer available for enquiry');
  const name = str_(b.buyerName, 'Name', 80), contact = contact_(b.buyerContact), message = str_(b.message || '', 'Message', 800, 0);
  if (b.consent !== true) throw err_('Please accept the consent statement');
  rateLimit_('enq:' + String(contact).toLowerCase() + pid, 1, 'You have already enquired about this piece. We will be in touch.');
  const id = newId_('ENQ');
  withLock_(() => append_('Enquiries', { EnquiryID: id, CreatedAt: new Date(), ProductID: pid, ProductTitleSnapshot: p.Title, BuyerName: name, BuyerContact: contact, Message: message, Consent: 'Yes', Status: 'New', Type: 'Product' }));
  return { reference: id };
}
function submitContact_(b) {
  if (b.website) return { reference: 'MSG-RECEIVED' };
  const name = str_(b.name, 'Name', 80), contact = contact_(b.contact), subject = str_(b.subject, 'Subject', 120, 3), message = str_(b.message, 'Message', 1500, 10);
  if (b.consent !== true) throw err_('Please accept the consent statement');
  rateLimit_('msg:' + String(contact).toLowerCase(), 3, 'You have sent several messages recently. We will reply soon.');
  const id = newId_('MSG');
  withLock_(() => append_('Enquiries', { EnquiryID: id, CreatedAt: new Date(), ProductID: '', ProductTitleSnapshot: subject, BuyerName: name, BuyerContact: contact, Message: message, Consent: 'Yes', Status: 'New', Type: 'Contact' }));
  return { reference: id };
}

/* ============================ ADMIN: READ ============================ */
const LISTABLE = { products: 'Products', enquiries: 'Enquiries', orders: 'Orders', pickups: 'Pickups', deliveries: 'Deliveries', staff: 'Staff', audit: 'AdminAudit', settings: 'Settings' };
function adminList_(a, b) {
  const sheet = LISTABLE[b.entity];
  if (!sheet) throw err_('Unknown list');
  let rows = rows_(sheet).map(clean4json_);
  if (sheet === 'AdminAudit') rows = rows.reverse().slice(0, 300);
  const out = { rows: rows };
  if (sheet === 'Settings' || b.withMeta) { const s = settings_(); out.meta = { pickupSlots: s.pickupSlots, deliverySlots: s.deliverySlots, categories: s.categories, conditions: s.conditions, role: a.role }; }
  return out;
}
function adminDashboard_() {
  const pr = rows_('Products'), en = rows_('Enquiries'), or = rows_('Orders'), pk = rows_('Pickups'), dl = rows_('Deliveries');
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const cnt = (arr, f) => arr.filter(f).length;
  return {
    metrics: {
      pendingReview: cnt(pr, r => r.ApprovalStatus === 'Pending'), live: cnt(pr, isPublic_), sold: cnt(pr, r => r.AvailabilityStatus === 'Sold'),
      newEnquiries: cnt(en, r => r.Status === 'New'), openOrders: cnt(or, r => ACTIVE_ORDER.indexOf(r.Status) >= 0),
      pickupsToday: cnt(pk, r => dstr_(r.Date) === today && ['Scheduled', 'Rescheduled'].indexOf(r.Status) >= 0),
      deliveriesToday: cnt(dl, r => dstr_(r.Date) === today && ['Scheduled', 'Rescheduled', 'Out for Delivery'].indexOf(r.Status) >= 0),
      failedOps: cnt(pk, r => r.Status === 'Failed') + cnt(dl, r => r.Status === 'Failed')
    },
    upcoming: pk.filter(r => ['Scheduled', 'Rescheduled'].indexOf(r.Status) >= 0).map(r => ({ type: 'Pickup', id: r.PickupID, date: dstr_(r.Date), slot: r.Slot, staff: r.StaffID, status: r.Status }))
      .concat(dl.filter(r => ['Scheduled', 'Rescheduled', 'Out for Delivery'].indexOf(r.Status) >= 0).map(r => ({ type: 'Delivery', id: r.DeliveryID, date: dstr_(r.Date), slot: r.Slot, staff: r.StaffID, status: r.Status })))
      .sort((x, y) => (x.date + x.slot).localeCompare(y.date + y.slot)).slice(0, 8),
    recent: rows_('AdminAudit').slice(-8).reverse().map(clean4json_)
  };
}
function adminImage_(a, b) {
  const fid = str_(b.fileId, 'File', 80);
  const owner = rows_('Products').find(r => json_(r.ImageFileIDs, []).indexOf(fid) >= 0);
  if (!owner) throw err_('Image not found');
  const blob = DriveApp.getFileById(fid).getBlob();
  return { type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}
function adminHistory_(a, b) {
  const pid = str_(b.productId, 'Product', 40);
  const orders = rows_('Orders').filter(r => r.ProductID === pid), oids = orders.map(r => r.OrderID);
  const pk = rows_('Pickups').filter(r => r.ProductID === pid), dl = rows_('Deliveries').filter(r => r.ProductID === pid);
  const ids = [pid].concat(oids, pk.map(r => r.PickupID), dl.map(r => r.DeliveryID));
  return { orders: orders.map(clean4json_), pickups: pk.map(clean4json_), deliveries: dl.map(clean4json_),
    audit: rows_('AdminAudit').filter(r => ids.indexOf(r.EntityID) >= 0).map(clean4json_) };
}

/* ============================ ADMIN: PRODUCTS & ENQUIRIES ============================ */
function adminReviewProduct_(a, b) {
  const p = mustFind_('Products', b.productId), decision = oneOf_(b.decision, ['Approved', 'Rejected', 'Changes Requested'], 'decision');
  const notes = str_(b.notes || '', 'Notes', 500, decision === 'Approved' ? 0 : 3);
  if (decision !== 'Approved' && activeOrderFor_(p.ProductID)) throw err_('This piece has an active order. Cancel the order first.');
  const ch = { ApprovalStatus: decision, ReviewedAt: new Date(), ReviewedBy: a.email, ReviewNotes: notes };
  update_('Products', p, ch, a, 'REVIEW ' + decision, notes);
  syncImageSharing_(Object.assign(p, ch), a.email);
  return { productId: p.ProductID, approval: decision };
}
function adminUpdateProduct_(a, b) {
  const p = mustFind_('Products', b.productId), f = b.fields || {}, s = settings_(), ch = {};
  if (f.title !== undefined) ch.Title = str_(f.title, 'Title', 100, 3);
  if (f.description !== undefined) ch.Description = str_(f.description, 'Description', 1500, 20);
  if (f.price !== undefined) ch.Price = num_(f.price, 'Price', 1, 1000000);
  if (f.category !== undefined) ch.Category = oneOf_(f.category, s.categories, 'category');
  if (f.condition !== undefined) ch.Condition = oneOf_(f.condition, s.conditions, 'condition');
  if (f.brand !== undefined) ch.Brand = str_(f.brand, 'Brand', 60, 0);
  if (f.availability !== undefined) {
    const av = oneOf_(f.availability, AVAIL, 'availability');
    if (av !== p.AvailabilityStatus && activeOrderFor_(p.ProductID)) throw err_('Availability is managed by the active order. Cancel or complete it first.');
    if (av === 'Sold' && p.ApprovalStatus !== 'Approved') throw err_('Only approved pieces can be marked sold');
    ch.AvailabilityStatus = av;
  }
  if (!Object.keys(ch).length) throw err_('Nothing to update');
  update_('Products', p, ch, a, 'EDIT PRODUCT', Object.keys(ch).join(', '));
  syncImageSharing_(Object.assign(p, ch), a.email);
  return { productId: p.ProductID };
}
function adminUpdateEnquiry_(a, b) {
  const e = mustFind_('Enquiries', b.enquiryId), ch = {};
  if (b.status !== undefined) ch.Status = oneOf_(b.status, ENQ_STATUS, 'status');
  if (b.notes !== undefined) ch.AdminNotes = str_(b.notes, 'Notes', 800, 0);
  if (ch.Status === 'Converted' && !e.OrderID) throw err_('Create an order to convert an enquiry');
  update_('Enquiries', e, ch, a, 'ENQUIRY ' + (ch.Status || 'NOTE'), '');
  return { enquiryId: e.EnquiryID };
}

/* ============================ ADMIN: ORDERS ============================ */
function activeOrderFor_(pid) { return rows_('Orders').find(o => o.ProductID === pid && ACTIVE_ORDER.indexOf(o.Status) >= 0); }
function setAvail_(pid, av, a, why) {
  const p = find_('Products', pid); if (!p || p.AvailabilityStatus === av) return;
  update_('Products', p, { AvailabilityStatus: av }, a, 'AVAILABILITY ' + av, why);
  syncImageSharing_(Object.assign(p, { AvailabilityStatus: av }), a.email);
}
function adminCreateOrder_(a, b) {
  const e = mustFind_('Enquiries', b.enquiryId);
  if (e.Type === 'Contact' || !e.ProductID) throw err_('General messages cannot become orders');
  if (e.OrderID) throw err_('An order already exists for this enquiry: ' + e.OrderID);
  const p = mustFind_('Products', e.ProductID);
  if (p.ApprovalStatus !== 'Approved' || p.AvailabilityStatus !== 'Available') throw err_('This piece is not available (currently ' + p.AvailabilityStatus + ')');
  const existing = activeOrderFor_(p.ProductID);
  if (existing) throw err_('This piece already has an active order: ' + existing.OrderID);
  const id = newId_('ORD'), now = new Date();
  append_('Orders', { OrderID: id, CreatedAt: now, UpdatedAt: now, ProductID: p.ProductID, EnquiryID: e.EnquiryID, ProductTitle: p.Title, Price: p.Price,
    BuyerName: e.BuyerName, BuyerContact: e.BuyerContact, DeliveryAddress: str_(b.address || '', 'Address', 300, 0), Status: 'Pending Review', Notes: str_(b.notes || '', 'Notes', 500, 0) });
  update_('Enquiries', e, { Status: 'Converted', OrderID: id }, a, 'ENQUIRY Converted', id);
  audit_(a.email, id, 'ORDER CREATED', '', 'Pending Review', 'Product ' + p.ProductID);
  return { orderId: id };
}
function adminOrderAction_(a, b) {
  const o = mustFind_('Orders', b.orderId), act = oneOf_(b.op, ['confirm', 'cancel', 'note'], 'action');
  if (act === 'note') { update_('Orders', o, { Notes: str_(b.notes, 'Notes', 500, 0), DeliveryAddress: str_(b.address === undefined ? o.DeliveryAddress : b.address, 'Address', 300, 0) }, a, 'ORDER NOTE', ''); return { orderId: o.OrderID }; }
  if (act === 'confirm') {
    if (o.Status !== 'Pending Review') throw err_('Only orders pending review can be confirmed');
    const p = mustFind_('Products', o.ProductID);
    if (p.ApprovalStatus !== 'Approved' || p.AvailabilityStatus !== 'Available') throw err_('The piece is no longer available');
    update_('Orders', o, { Status: 'Confirmed' }, a, 'ORDER Confirmed', '');
    setAvail_(o.ProductID, 'Reserved', a, 'Order ' + o.OrderID + ' confirmed');
    return { orderId: o.OrderID, status: 'Confirmed' };
  }
  if (ACTIVE_ORDER.indexOf(o.Status) < 0) throw err_('This order is already ' + o.Status);
  const reason = str_(b.reason, 'Cancellation reason', 300, 3);
  rows_('Pickups').filter(r => r.OrderID === o.OrderID && ['Scheduled', 'Rescheduled', 'Failed'].indexOf(r.Status) >= 0).forEach(r => update_('Pickups', r, { Status: 'Cancelled' }, a, 'PICKUP Cancelled', 'Order cancelled'));
  rows_('Deliveries').filter(r => r.OrderID === o.OrderID && ['Scheduled', 'Rescheduled', 'Failed'].indexOf(r.Status) >= 0).forEach(r => update_('Deliveries', r, { Status: 'Cancelled' }, a, 'DELIVERY Cancelled', 'Order cancelled'));
  update_('Orders', o, { Status: 'Cancelled', CancelReason: reason }, a, 'ORDER Cancelled', reason);
  const p = find_('Products', o.ProductID);
  if (p && p.AvailabilityStatus === 'Reserved') setAvail_(o.ProductID, 'Available', a, 'Order ' + o.OrderID + ' cancelled');
  return { orderId: o.OrderID, status: 'Cancelled' };
}

/* ============================ ADMIN: PICKUP & DELIVERY ============================ */
function schedule_(b, slots) {
  const date = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00'))) throw err_('Please choose a valid date');
  if (date < Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) throw err_('The date cannot be in the past');
  const slot = oneOf_(b.slot, slots, 'time slot'), st = find_('Staff', String(b.staffId || ''));
  if (!st || String(st.Active) !== 'Yes') throw err_('Please choose an active team member');
  return { Date: "'" + date, Slot: slot, StaffID: st.StaffID };
}
function adminSchedulePickup_(a, b) {
  const o = mustFind_('Orders', b.orderId);
  if (['Confirmed', 'In Fulfilment'].indexOf(o.Status) < 0) throw err_('Confirm the order before scheduling a pickup');
  const active = rows_('Pickups').find(r => r.OrderID === o.OrderID && ACTIVE_PICKUP.concat(['Failed']).indexOf(r.Status) >= 0);
  if (active) throw err_('This order already has a pickup (' + active.PickupID + ', ' + active.Status + '). Reschedule it instead.');
  const id = newId_('PCK'), now = new Date();
  append_('Pickups', Object.assign(schedule_(b, settings_().pickupSlots), { PickupID: id, CreatedAt: now, UpdatedAt: now, OrderID: o.OrderID, ProductID: o.ProductID,
    PickupAddress: str_(b.address, 'Pickup address', 300, 5), Status: 'Scheduled', Attempts: 0, Notes: str_(b.notes || '', 'Notes', 500, 0) }));
  if (o.Status === 'Confirmed') update_('Orders', o, { Status: 'In Fulfilment' }, a, 'ORDER In Fulfilment', 'Pickup ' + id);
  audit_(a.email, id, 'PICKUP Scheduled', '', 'Scheduled', 'Order ' + o.OrderID);
  return { pickupId: id };
}
const PICKUP_T = {
  reschedule: [['Scheduled', 'Rescheduled', 'Failed'], 'Rescheduled'], collected: [['Scheduled', 'Rescheduled'], 'Collected'],
  verified: [['Collected'], 'Verified'], verification_failed: [['Collected'], 'Verification Failed'],
  failed: [['Scheduled', 'Rescheduled'], 'Failed'], cancel: [['Scheduled', 'Rescheduled', 'Failed'], 'Cancelled']
};
function adminPickupAction_(a, b) {
  const r = mustFind_('Pickups', b.pickupId), t = PICKUP_T[b.op];
  if (!t) throw err_('Invalid action');
  if (t[0].indexOf(r.Status) < 0) throw err_('A pickup that is ' + r.Status + ' cannot be changed this way');
  const ch = { Status: t[1] };
  if (b.op === 'reschedule') Object.assign(ch, schedule_(b, settings_().pickupSlots), { FailureReason: '' });
  if (b.op === 'failed') { ch.FailureReason = str_(b.reason, 'Failure reason', 300, 3); ch.Attempts = (+r.Attempts || 0) + 1; }
  if (b.op === 'collected') ch.CompletedAt = new Date();
  if (b.op === 'verified' || b.op === 'verification_failed') ch.VerificationNotes = str_(b.notes || '', 'Verification notes', 500, b.op === 'verified' ? 0 : 3);
  if (b.op === 'cancel') ch.FailureReason = str_(b.reason || '', 'Reason', 300, 0);
  update_('Pickups', r, ch, a, 'PICKUP ' + t[1], ch.FailureReason || ch.VerificationNotes || '');
  return { pickupId: r.PickupID, status: t[1] };
}
function adminScheduleDelivery_(a, b) {
  const o = mustFind_('Orders', b.orderId);
  if (o.Status !== 'In Fulfilment') throw err_('This order is not in fulfilment');
  if (!rows_('Pickups').some(r => r.OrderID === o.OrderID && r.Status === 'Verified')) throw err_('The item must be collected and verified before delivery');
  const active = rows_('Deliveries').find(r => r.OrderID === o.OrderID && ACTIVE_DELIVERY.concat(['Failed']).indexOf(r.Status) >= 0);
  if (active) throw err_('This order already has a delivery (' + active.DeliveryID + ', ' + active.Status + ')');
  const id = newId_('DLV'), now = new Date();
  append_('Deliveries', Object.assign(schedule_(b, settings_().deliverySlots), { DeliveryID: id, CreatedAt: now, UpdatedAt: now, OrderID: o.OrderID, ProductID: o.ProductID,
    DeliveryAddress: str_(b.address || o.DeliveryAddress, 'Delivery address', 300, 5), Status: 'Scheduled', Attempts: 0, HandoverStatus: 'Pending', Notes: str_(b.notes || '', 'Notes', 500, 0) }));
  audit_(a.email, id, 'DELIVERY Scheduled', '', 'Scheduled', 'Order ' + o.OrderID);
  return { deliveryId: id };
}
const DELIVERY_T = {
  reschedule: [['Scheduled', 'Rescheduled', 'Failed'], 'Rescheduled'], out: [['Scheduled', 'Rescheduled'], 'Out for Delivery'],
  delivered: [['Out for Delivery'], 'Delivered'], failed: [['Scheduled', 'Rescheduled', 'Out for Delivery'], 'Failed'],
  returned: [['Failed'], 'Returned to Seller'], cancel: [['Scheduled', 'Rescheduled', 'Failed'], 'Cancelled'], handover: [['Delivered'], 'Delivered']
};
function adminDeliveryAction_(a, b) {
  const r = mustFind_('Deliveries', b.deliveryId), t = DELIVERY_T[b.op];
  if (!t) throw err_('Invalid action');
  if (t[0].indexOf(r.Status) < 0) throw err_('A delivery that is ' + r.Status + ' cannot be changed this way');
  if (b.op === 'handover' && r.HandoverStatus === 'Recorded') throw err_('Handover is already recorded');
  const ch = { Status: t[1] };
  if (b.op === 'reschedule') Object.assign(ch, schedule_(b, settings_().deliverySlots), { FailureReason: '' });
  if (b.op === 'failed') { ch.FailureReason = str_(b.reason, 'Failure reason', 300, 3); ch.Attempts = (+r.Attempts || 0) + 1; }
  if (b.op === 'returned' || b.op === 'cancel') ch.FailureReason = str_(b.reason || r.FailureReason || '', 'Reason', 300, b.op === 'returned' ? 3 : 0);
  if (b.op === 'handover') Object.assign(ch, { HandoverStatus: 'Recorded', ReceivedBy: str_(b.receivedBy, 'Received by', 80, 2), HandoverAt: new Date(), Notes: str_(b.notes || r.Notes || '', 'Notes', 500, 0) });
  update_('Deliveries', r, ch, a, b.op === 'handover' ? 'HANDOVER Recorded' : 'DELIVERY ' + t[1], ch.FailureReason || ch.ReceivedBy || '');
  const o = find_('Orders', r.OrderID);
  if (b.op === 'handover' && o) { update_('Orders', o, { Status: 'Completed' }, a, 'ORDER Completed', 'Handover to ' + ch.ReceivedBy); setAvail_(r.ProductID, 'Sold', a, 'Order ' + o.OrderID + ' completed'); }
  if (b.op === 'returned' && o) { update_('Orders', o, { Status: 'Cancelled', CancelReason: 'Returned to seller: ' + ch.FailureReason }, a, 'ORDER Cancelled', 'Returned to seller'); setAvail_(r.ProductID, 'Hidden', a, 'Returned to seller'); }
  return { deliveryId: r.DeliveryID, status: t[1], handover: ch.HandoverStatus || r.HandoverStatus };
}

/* ============================ ADMIN: STAFF & SETTINGS (owner) ============================ */
function adminStaff_(a, b) {
  if (b.op === 'add') {
    const id = newId_('STF');
    append_('Staff', { StaffID: id, Name: str_(b.name, 'Name', 80, 2), Phone: b.phone ? contact_(b.phone) : '', Role: oneOf_(b.role || 'Pickup & Delivery', ['Pickup & Delivery', 'Pickup', 'Delivery', 'Quality Check'], 'role'), Active: 'Yes', CreatedAt: new Date() });
    audit_(a.email, id, 'STAFF Added', '', b.name, '');
    return { staffId: id };
  }
  if (b.op === 'toggle') { const s = mustFind_('Staff', b.staffId), v = String(s.Active) === 'Yes' ? 'No' : 'Yes'; update_('Staff', s, { Active: v }, a, 'STAFF Active=' + v, ''); return { staffId: s.StaffID, active: v }; }
  throw err_('Invalid action');
}
function adminSaveSettings_(a, b) {
  const s = b.settings || {}, sh = sheet_('Settings'), v = sh.getDataRange().getValues();
  Object.keys(s).forEach(k => {
    if (EDITABLE_SETTINGS.indexOf(k) < 0) throw err_('Unknown setting: ' + k);
    const val = str_(s[k], k, 1000, k === 'ContactPhone' ? 0 : 1);
    if (k === 'MaxSubmissionsPerHour') num_(val, k, 1, 100);
    const i = v.findIndex(r => r[0] === k);
    const old = i >= 0 ? v[i][1] : '';
    if (String(old) === val) return;
    if (i >= 0) sh.getRange(i + 1, 2).setValue(val); else sh.appendRow([k, val, '']);
    audit_(a.email, 'Settings', 'SETTING ' + k, old, val, '');
  });
  bust_();
  return { saved: true };
}

/* ============================ IMAGE PRIVACY ============================ */
/** Photos are link-viewable only while the product is publicly listed; otherwise they are private to the owner. */
function syncImageSharing_(p, actor) {
  const pub = isPublic_(p);
  json_(p.ImageFileIDs, []).forEach(id => {
    try { DriveApp.getFileById(id).setSharing(pub ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE, pub ? DriveApp.Permission.VIEW : DriveApp.Permission.NONE); }
    catch (x) { audit_(actor || 'system', p.ProductID, 'IMAGE_SHARE_FAILED', '', pub ? 'public' : 'private', String(x.message || x).slice(0, 200)); }
  });
}

/* Installable trigger: edits made directly in the Products sheet are stamped, audited and kept consistent. */
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== 'Products' || e.range.getRow() < 2) return;
  const h = HEADERS.Products, name = h[e.range.getColumn() - 1];
  if (['ApprovalStatus', 'AvailabilityStatus', 'Title', 'Price', 'Description', 'Category', 'Condition'].indexOf(name) < 0) return;
  const row = e.range.getRow(), vals = sh.getRange(row, 1, 1, h.length).getValues()[0], p = {}, now = new Date();
  h.forEach((k, i) => p[k] = vals[i]);
  let who = 'sheet-editor'; try { who = (e.user && e.user.getEmail && e.user.getEmail()) || who; } catch (x) {}
  sh.getRange(row, h.indexOf('UpdatedAt') + 1).setValue(now);
  if (name === 'ApprovalStatus') { sh.getRange(row, h.indexOf('ReviewedAt') + 1).setValue(now); sh.getRange(row, h.indexOf('ReviewedBy') + 1).setValue(who); }
  if (name === 'ApprovalStatus' || name === 'AvailabilityStatus') syncImageSharing_(p, who);
  bust_();
  audit_(who, p.ProductID, 'SHEET EDIT ' + name, e.oldValue || '', e.value || '', '');
}

/* ============================ DATA HELPERS ============================ */
function ss_() { return SpreadsheetApp.openById(P.getProperty('SHEET_ID')); }
function sheet_(n) { const s = ss_().getSheetByName(n); if (!s) throw err_('Database not set up. Run setup().'); return s; }
function rows_(n) {
  const v = sheet_(n).getDataRange().getValues(), h = v.shift();
  return v.map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; }).filter(o => o[h[0]] !== '');
}
function find_(n, id) { return id ? rows_(n).find(r => r[HEADERS[n][0]] === id) : null; }
function mustFind_(n, id) { const r = find_(n, str_(id, 'ID', 40)); if (!r) throw err_('Record not found'); return r; }
function append_(n, obj) { sheet_(n).appendRow(HEADERS[n].map(k => obj[k] === undefined ? '' : obj[k])); }
function update_(n, rec, changes, a, action, notes) {
  const sh = sheet_(n), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], old = {};
  if (h.indexOf('UpdatedAt') >= 0) changes.UpdatedAt = new Date();
  Object.keys(changes).forEach(k => {
    const c = h.indexOf(k); if (c < 0) throw new Error('Missing column ' + k + ' in ' + n);
    old[k] = rec[k]; sh.getRange(rec._row, c + 1).setValue(changes[k]); rec[k] = changes[k];
  });
  if (n === 'Products') bust_();
  delete old.UpdatedAt;
  audit_(a.email, rec[HEADERS[n][0]], action, JSON.stringify(old), JSON.stringify(Object.assign({}, changes, { UpdatedAt: undefined })), notes || '');
}
function audit_(actor, id, action, oldV, newV, notes) {
  try { sheet_('AdminAudit').appendRow([new Date(), actor, id, action, String(oldV).slice(0, 500), String(newV).slice(0, 500), String(notes || '').slice(0, 300)]); } catch (x) { console.error(x); }
}
function clean4json_(r) { const o = {}; Object.keys(r).forEach(k => o[k] = r[k] instanceof Date ? r[k].toISOString() : r[k]); return o; }
function iso_(d) { return d instanceof Date ? d.toISOString() : String(d || ''); }
function dstr_(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : String(d || ''); }
function newId_(prefix) { return prefix + '-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); }
function withLock_(fn) {
  const l = LockService.getScriptLock();
  if (!l.tryLock(20000)) throw err_('The service is busy. Please try again in a moment.');
  try { return fn(); } finally { SpreadsheetApp.flush(); l.releaseLock(); }
}
function rateLimit_(key, max, msg) {
  const c = CacheService.getScriptCache(), k = 'rl:' + digest_(key), n = +(c.get(k) || 0);
  if (n >= max) throw err_(msg || 'Too many submissions. Please try again later.');
  c.put(k, String(n + 1), 3600);
}

/* ============================ VALIDATION ============================ */
// Strips control characters and neutralises spreadsheet formulas (=, +, -, @ at the start).
function clean_(v) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().replace(/^[=+\-@]/, "'$&"); }
function str_(v, label, max, min) {
  const s = clean_(v); min = min === undefined ? 1 : min;
  if (s.length < min) throw err_(min > 1 ? label + ' must be at least ' + min + ' characters' : label + ' is required');
  if (s.length > max) throw err_(label + ' is too long (max ' + max + ')');
  return s;
}
function oneOf_(v, list, label) { const s = String(v == null ? '' : v).trim(); if (list.indexOf(s) < 0) throw err_('Please choose a valid ' + label); return s; }
function num_(v, label, min, max) { const n = Number(v); if (!isFinite(n) || n < min || n > max) throw err_(label + ' must be between ' + min + ' and ' + max); return Math.round(n); }
function contact_(v) {
  const s = str_(v, 'Contact', 120);
  if (!/^(\+?[\d\s-]{8,15}|[^\s@]+@[^\s@]+\.[^\s@]{2,})$/.test(s.replace(/^'/, ''))) throw err_('Please enter a valid phone number or email');
  return s.charAt(0) === "'" ? s : "'" + s; // stored as text so phone numbers keep leading zeros
}
