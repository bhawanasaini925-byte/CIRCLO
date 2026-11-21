/* Developer-only local test server: node tests/server.js [port]
   Serves the website and answers POST /api by running apps-script/Code.gs against tests/gas-mock.js.
   Creates a test owner admin: owner@test.local / test-password-123 (local testing only). */
const http = require("http"), fs = require("fs"), path = require("path");
const { load } = require("./gas-mock");
const ROOT = path.join(__dirname, ".."), PORT = +process.argv[2] || 8787;
const G = load({ quiet: true });
G.ctx.setup();
G.props.NEW_ADMIN_EMAIL = "owner@test.local"; G.props.NEW_ADMIN_PASSWORD = "test-password-123"; G.ctx.addAdminFromProperties();
let flaky = 0;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__flaky") { flaky = url.searchParams.get("kind") === "health" ? 2 : 1; res.writeHead(204); return res.end(); } // next API call returns an HTML page, like a Google cold start
  if (url.pathname === "/api" && req.method === "POST") {
    if (flaky === 2) { flaky = 0; req.resume(); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(G.ctx.doGet({ parameter: {} }).getContent()); }
    if (flaky) { flaky = 0; req.resume(); res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html><body>Temporarily unavailable</body></html>"); }
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const out = G.ctx.doPost({ postData: { contents: body } }).getContent();
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(out);
    }); return;
  }
  if (url.pathname === "/config.js") { // tests never use the real API: LIVE -> local simulated backend, otherwise demo mode
    res.writeHead(200, { "Content-Type": "text/javascript" });
    return res.end(fs.readFileSync(path.join(ROOT, "config.js"), "utf8").replace(/API_URL: "[^"]*"/, `API_URL: "${process.env.LIVE ? `http://localhost:${PORT}/api` : ""}"`));
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(data);
  });
}).listen(PORT, () => console.log(`CIRCLO test server on http://localhost:${PORT} ${process.env.LIVE ? "(LIVE mock backend)" : "(demo mode)"}`));
