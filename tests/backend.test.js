/* Developer-only backend tests: node tests/backend.test.js  (runs the real Code.gs against tests/gas-mock.js) */
const { load } = require('./gas-mock');
let pass = 0, fail = 0;
const t = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const ok = r => r.ok === true, bad = (r, re) => r.ok === false && (!re || re.test(r.error));

const G = load({ quiet: true }), { call, ctx, props, files, sheets } = G;
ctx.setup();
t('setup creates all tabs', ['Products', 'Enquiries', 'Orders', 'Pickups', 'Deliveries', 'Staff', 'Settings', 'AdminAudit'].every(n => sheets[n]) && !sheets.Sheet1);
props.NEW_ADMIN_EMAIL = 'Owner@Circlo.in'; props.NEW_ADMIN_PASSWORD = 'correct horse 42';
ctx.addAdminFromProperties();
t('admin stored hashed, plain password deleted', !props.NEW_ADMIN_PASSWORD && props.ADMINS.includes('owner@circlo.in') && !props.ADMINS.includes('correct horse'));

const img = { type: 'image/jpeg', data: Buffer.from('fakejpegbytes').toString('base64') };
const product = { action: 'submitProduct', sellerName: 'Asha', sellerContact: '+91 98765 43210', title: 'Silk saree', description: 'Pure silk saree worn twice, no flaws at all.', category: 'Sarees', condition: 'Like new', price: 4500, consent: true, images: [img] };

/* ---------- Public validation ---------- */
t('reject missing consent', bad(call({ ...product, consent: false }), /consent/i));
t('reject bad category', bad(call({ ...product, category: 'Cars' }), /category/));
t('reject short description', bad(call({ ...product, description: 'short' }), /20/));
t('reject bad contact', bad(call({ ...product, sellerContact: 'abc' }), /phone|email/));
t('reject bad price', bad(call({ ...product, price: -5 }), /Price/));
t('reject no photos', bad(call({ ...product, images: [] }), /photo/));
t('reject bad image type', bad(call({ ...product, images: [{ type: 'image/gif', data: 'xx' }] }), /JPG/));
t('reject unknown action', bad(call({ action: 'dropTables' }), /Unknown/));
t('reject invalid JSON', JSON.parse(ctx.doPost({ postData: { contents: '{oops' } }).getContent()).ok === false);
const fx = call({ ...product, title: '=HYPERLINK("http://evil")' });
t('formula injection neutralised', ok(fx) && ctx.clean_('=HYPERLINK(1)') === "'=HYPERLINK(1)" && ctx.clean_('+91 9') === "'+91 9", fx);

/* ---------- Submission → pending → private ---------- */
const sub = call(product);
t('submit product', ok(sub) && sub.data.status === 'Pending', sub);
const pid = sub.data.reference;
const row = () => sheets.Products.data.find(r => r[0] === pid);
t('saved as Pending', row()[13] === 'Pending');
const fids = JSON.parse(row()[19]);
t('photo stored private', fids.length === 1 && files[fids[0]].sharing === 'private');
let list = call({ action: 'listProducts' });
t('pending not in public catalogue', ok(list) && !list.data.products.some(p => p.productId === pid));
t('pending not fetchable by id', bad(call({ action: 'getProduct', productId: pid })));

/* ---------- Admin auth ---------- */
t('admin action without token rejected', bad(call({ action: 'adminList', entity: 'products' }), /sign in/i));
t('admin action with fake token rejected', call({ action: 'adminReviewProduct', token: 'x'.repeat(64), productId: pid, decision: 'Approved' }).code === 'AUTH');
t('wrong password rejected', bad(call({ action: 'adminLogin', email: 'owner@circlo.in', password: 'nope' }), /Incorrect/));
const login = call({ action: 'adminLogin', email: 'OWNER@circlo.in', password: 'correct horse 42' });
t('correct login', ok(login) && login.data.token.length === 64, login);
const tok = login.data.token, A = b => call({ ...b, token: tok });
t('login response has no secrets', !JSON.stringify(login).includes('hash') && !JSON.stringify(login).includes('salt'));

/* ---------- Review ---------- */
t('reject requires notes', bad(A({ action: 'adminReviewProduct', productId: pid, decision: 'Rejected' }), /Notes/));
t('invalid product id rejected', bad(A({ action: 'adminReviewProduct', productId: 'CIR-NOPE', decision: 'Approved' }), /not found/));
const rej = call(product); // second product to reject (rate limit allows 5/h)
t('reject product', ok(A({ action: 'adminReviewProduct', productId: rej.data.reference, decision: 'Rejected', notes: 'Photos unclear' })));
list = call({ action: 'listProducts' });
t('rejected stays private', !list.data.products.some(p => p.productId === rej.data.reference));
t('approve product', ok(A({ action: 'adminReviewProduct', productId: pid, decision: 'Approved' })));
list = call({ action: 'listProducts' });
const pub = list.data.products.find(p => p.productId === pid);
t('approved appears publicly', !!pub);
t('public view hides seller data', pub && !JSON.stringify(list).includes('98765') && !('sellerName' in pub) && !JSON.stringify(list).includes('Asha'));
t('approved photo now link-shared', files[fids[0]].sharing === 'link');
t('admin can view private image', ok(A({ action: 'adminImage', fileId: JSON.parse(sheets.Products.data.find(r => r[0] === rej.data.reference)[19])[0] })));
t('admin image refuses foreign file ids', bad(A({ action: 'adminImage', fileId: 'Fdeadbeef' }), /not found/));

/* ---------- Enquiry → order ---------- */
const enqBody = { action: 'submitEnquiry', productId: pid, buyerName: 'Meera', buyerContact: 'meera@example.com', message: 'Is it available?', consent: true };
const enq = call(enqBody);
t('buyer enquiry saved', ok(enq) && sheets.Enquiries.data.some(r => r[0] === enq.data.reference && r[8] === 'New'));
t('duplicate enquiry blocked', bad(call(enqBody), /already/));
t('enquiry on rejected product blocked', bad(call({ ...enqBody, productId: rej.data.reference, buyerContact: 'x@y.com' }), /no longer/));
t('contact form saved', ok(call({ action: 'submitContact', name: 'Ria', contact: 'ria@example.com', subject: 'Selling bulk', message: 'Can I sell ten sarees?', consent: true })));

const ord = A({ action: 'adminCreateOrder', enquiryId: enq.data.reference, address: '12 Civil Lines, Moradabad' });
t('create order from enquiry', ok(ord), ord);
const oid = ord.data.orderId;
t('duplicate order from same enquiry blocked', bad(A({ action: 'adminCreateOrder', enquiryId: enq.data.reference }), /already/));
t('pickup before confirmation blocked', bad(A({ action: 'adminSchedulePickup', orderId: oid, date: '2099-01-01', slot: '10:00-12:00', staffId: 'x', address: 'Seller home' }), /Confirm/));
t('confirm order', ok(A({ action: 'adminOrderAction', orderId: oid, op: 'confirm' })));
t('product reserved after confirm', row()[14] === 'Reserved');
t('reserved piece still listed with badge', call({ action: 'listProducts' }).data.products.find(p => p.productId === pid).availability === 'Reserved');
t('manual availability change blocked during order', bad(A({ action: 'adminUpdateProduct', productId: pid, fields: { availability: 'Available' } }), /active order/));

/* ---------- Staff & pickup ---------- */
const st = A({ action: 'adminStaff', op: 'add', name: 'Ravi', phone: '9876500000', role: 'Pickup & Delivery' });
t('add staff', ok(st), st);
const sid = st.data.staffId, P = { orderId: oid, slot: '10:00-12:00', staffId: sid, address: 'Seller, 4 Rampur Rd' };
t('past date rejected', bad(A({ action: 'adminSchedulePickup', ...P, date: '2020-01-01' }), /past/));
t('invalid slot rejected', bad(A({ action: 'adminSchedulePickup', ...P, date: '2099-01-01', slot: '3am' }), /slot/));
const pk = A({ action: 'adminSchedulePickup', ...P, date: '2099-01-01' });
t('schedule pickup', ok(pk), pk);
const pkid = pk.data.pickupId;
t('dates stored as text', sheets.Pickups.data.find(r => r[0] === pkid)[5] === '2099-01-01');
t('second pickup blocked', bad(A({ action: 'adminSchedulePickup', ...P, date: '2099-01-02' }), /already/));
t('delivery before verification blocked', bad(A({ action: 'adminScheduleDelivery', orderId: oid, date: '2099-01-03', slot: '10:00-12:00', staffId: sid }), /verified/));
t('pickup failed needs reason', bad(A({ action: 'adminPickupAction', pickupId: pkid, op: 'failed' }), /reason/));
t('pickup failed', ok(A({ action: 'adminPickupAction', pickupId: pkid, op: 'failed', reason: 'Seller not home' })));
t('verify before collect blocked', bad(A({ action: 'adminPickupAction', pickupId: pkid, op: 'verified' }), /cannot/));
t('reschedule pickup', ok(A({ action: 'adminPickupAction', pickupId: pkid, op: 'reschedule', date: '2099-01-02', slot: '12:00-14:00', staffId: sid })));
t('pickup collected', ok(A({ action: 'adminPickupAction', pickupId: pkid, op: 'collected' })));
t('pickup verified', ok(A({ action: 'adminPickupAction', pickupId: pkid, op: 'verified', notes: 'Matches photos' })));

/* ---------- Delivery & handover ---------- */
const D = { orderId: oid, slot: '14:00-16:00', staffId: sid };
const dl = A({ action: 'adminScheduleDelivery', ...D, date: '2099-01-04' });
t('schedule delivery (uses order address)', ok(dl) && sheets.Deliveries.data.find(r => r[0] === dl.data.deliveryId)[8].includes('Civil Lines'), dl);
const did = dl.data.deliveryId, DA = (op, x = {}) => A({ action: 'adminDeliveryAction', deliveryId: did, op, ...x });
t('handover before delivery blocked', bad(DA('handover', { receivedBy: 'Meera' }), /cannot/));
t('out for delivery', ok(DA('out')));
t('delivery failed', ok(DA('failed', { reason: 'Buyer unreachable' })));
t('reschedule delivery', ok(DA('reschedule', { date: '2099-01-05', slot: '10:00-12:00', staffId: sid })));
t('out again', ok(DA('out')));
t('delivered', ok(DA('delivered')));
t('handover needs receiver', bad(DA('handover'), /Received/));
t('handover recorded', ok(DA('handover', { receivedBy: 'Meera' })));
t('order completed', sheets.Orders.data.find(r => r[0] === oid)[10] === 'Completed');
t('product sold', row()[14] === 'Sold');
list = call({ action: 'listProducts' });
t('sold not in public catalogue', !list.data.products.some(p => p.productId === pid));
t('sold photo private again', files[fids[0]].sharing === 'private');
t('duplicate handover blocked', bad(DA('handover', { receivedBy: 'X' })));
const hist = A({ action: 'adminHistory', productId: pid });
t('item history links order/pickup/delivery', ok(hist) && hist.data.orders.length === 1 && hist.data.pickups.length === 1 && hist.data.audit.length >= 10);

/* ---------- Cancellation flow ---------- */
const p2 = call({ ...product, sellerContact: 'seller2@example.com', title: 'Kundan set' });
A({ action: 'adminReviewProduct', productId: p2.data.reference, decision: 'Approved' });
const e2 = call({ ...enqBody, productId: p2.data.reference });
const o2 = A({ action: 'adminCreateOrder', enquiryId: e2.data.reference, address: 'Somewhere 123' }).data.orderId;
A({ action: 'adminOrderAction', orderId: o2, op: 'confirm' });
const pk2 = A({ action: 'adminSchedulePickup', orderId: o2, date: '2099-02-01', slot: '10:00-12:00', staffId: sid, address: 'Seller two home' }).data.pickupId;
t('cancel needs reason', bad(A({ action: 'adminOrderAction', orderId: o2, op: 'cancel' }), /reason/));
t('cancel order', ok(A({ action: 'adminOrderAction', orderId: o2, op: 'cancel', reason: 'Buyer changed mind' })));
t('cancel cascades to pickup', sheets.Pickups.data.find(r => r[0] === pk2)[9] === 'Cancelled');
t('product available again', sheets.Products.data.find(r => r[0] === p2.data.reference)[14] === 'Available');
t('cancelled order cannot be confirmed', bad(A({ action: 'adminOrderAction', orderId: o2, op: 'confirm' })));

/* ---------- Settings, roles, sessions ---------- */
t('save settings', ok(A({ action: 'adminSaveSettings', settings: { ServiceArea: 'Moradabad city' } })));
t('unknown setting rejected', bad(A({ action: 'adminSaveSettings', settings: { ADMINS: 'x' } }), /Unknown/));
t('public sees new setting', call({ action: 'listProducts' }).data.site.serviceArea === 'Moradabad city');
props.NEW_ADMIN_EMAIL = 'mgr@circlo.in'; props.NEW_ADMIN_PASSWORD = 'manager pass 99'; props.NEW_ADMIN_ROLE = 'manager'; ctx.addAdminFromProperties();
const mtok = call({ action: 'adminLogin', email: 'mgr@circlo.in', password: 'manager pass 99' }).data.token;
t('manager cannot change settings', call({ action: 'adminSaveSettings', token: mtok, settings: { ServiceArea: 'x' } }).code === 'FORBIDDEN');
t('manager can list orders', ok(call({ action: 'adminList', entity: 'orders', token: mtok })));
t('dashboard metrics', (() => { const d = A({ action: 'adminDashboard' }); return ok(d) && d.data.metrics.sold === 1 && d.data.metrics.pendingReview === 1; })());
t('logout', ok(A({ action: 'adminLogout' })));
t('token invalid after logout', A({ action: 'adminDashboard' }).code === 'AUTH');
call({ action: 'adminLogoutAll', token: call({ action: 'adminLogin', email: 'owner@circlo.in', password: 'correct horse 42' }).data.token });
t('sign-out-everywhere invalidates other sessions', call({ action: 'adminDashboard', token: mtok }).code === 'AUTH');
for (let i = 0; i < 5; i++) call({ action: 'adminLogin', email: 'mgr@circlo.in', password: 'wrong' });
t('lockout after 5 failed logins', bad(call({ action: 'adminLogin', email: 'mgr@circlo.in', password: 'manager pass 99' }), /Too many/));
t('audit log populated', sheets.AdminAudit.data.length > 40);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
