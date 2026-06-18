/**
 * dev-server.js — Servidor de desarrollo LOCAL para la ICC (sin Azure ni func).
 *
 * Levanta en un solo proceso Node:
 *   - El sitio estatico de web/  (simulador, landing, one-pager, admin, etc.)
 *   - La API de Azure Functions (api/src/functions/*.js) SIN el host de Functions,
 *     interceptando @azure/functions app.http para capturar rutas y handlers, y
 *     adaptando peticiones/respuestas HTTP nativas al modelo v4.
 *
 * Sin TABLES_CONNECTION_STRING, api/src/store.js usa su backend EN MEMORIA, asi que
 * waitlist, leaderboard, eventos y el panel admin funcionan en local (datos volatiles).
 *
 * Uso:  node scripts/dev-server.js   ->  http://localhost:4280
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const WEB = path.join(ROOT, "web");
const API = path.join(ROOT, "api");
const PORT = process.env.PORT || 4280;

// --- 1) Cargar variables de api/local.settings.json en process.env (ADMIN_KEY, etc.) ---
try {
  const ls = JSON.parse(fs.readFileSync(path.join(API, "local.settings.json"), "utf8"));
  for (const [k, v] of Object.entries(ls.Values || {})) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  console.log("[dev] local.settings.json cargado");
} catch {
  console.log("[dev] sin local.settings.json (se usaran valores por defecto)");
}

// --- 2) Interceptar @azure/functions para capturar las rutas registradas ---
const routes = [];
const azPath = require.resolve("@azure/functions", { paths: [API] });
const az = require(azPath);
function register(name, opts) {
  routes.push({
    name,
    methods: (opts.methods || ["GET"]).map((m) => m.toUpperCase()),
    route: (opts.route || name).replace(/^\//, ""),
    handler: opts.handler,
  });
}
az.app.http = (name, opts) => register(name, opts);
// Stubs por si algun handler usa los atajos por verbo (no rompen si no se usan).
for (const verb of ["get", "post", "put", "patch", "deleteRequest"]) {
  az.app[verb] = (name, opts) => register(name, { ...opts, methods: [verb === "deleteRequest" ? "delete" : verb] });
}

// --- 3) Requerir todos los handlers (se registran via el app.http interceptado) ---
const fnDir = path.join(API, "src", "functions");
for (const f of fs.readdirSync(fnDir).filter((f) => f.endsWith(".js"))) {
  require(path.join(fnDir, f));
}
console.log("[dev] rutas API:", routes.map((r) => `${r.methods.join("/")} /api/${r.route}`).join(", "));

// --- 4) Adaptadores del modelo v4 de Functions ---
function makeRequest(req, u, rawBody) {
  return {
    method: req.method,
    url: req.url,
    headers: { get: (k) => req.headers[String(k).toLowerCase()] ?? null },
    query: { get: (k) => u.searchParams.get(k) },
    params: {},
    json: async () => JSON.parse(rawBody || "{}"),
    text: async () => rawBody,
  };
}
const ctx = { log: console.log, error: console.error, warn: console.warn, invocationId: "local" };

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}

// --- 5) Estatico ---
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.join(WEB, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(WEB)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); return res.end("404 - No encontrado"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

// --- 6) Servidor ---
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname.startsWith("/api/")) {
    const routePath = u.pathname.replace(/^\/api\//, "");
    const route = routes.find((r) => r.route === routePath && r.methods.includes(req.method));
    if (!route) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "not_found" })); }
    try {
      const rawBody = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : "";
      const result = (await route.handler(makeRequest(req, u, rawBody), ctx)) || {};
      const headers = Object.assign({ "Content-Type": "application/json" }, result.headers || {});
      res.writeHead(result.status || 200, headers);
      if (result.jsonBody !== undefined) res.end(JSON.stringify(result.jsonBody));
      else res.end(result.body !== undefined ? String(result.body) : "");
    } catch (e) {
      console.error("[dev] error en handler:", e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "internal_error" }));
    }
    return;
  }
  serveStatic(res, u.pathname);
});

server.listen(PORT, () => {
  console.log(`\n[dev] ICC en local: http://localhost:${PORT}`);
  console.log(`[dev]   Simulador:  http://localhost:${PORT}/`);
  console.log(`[dev]   Landing:    http://localhost:${PORT}/investors.html`);
  console.log(`[dev]   One-pager:  http://localhost:${PORT}/onepager.html`);
  console.log(`[dev]   Admin:      http://localhost:${PORT}/admin.html  (clave: ${process.env.ADMIN_KEY || "(no definida)"})`);
  console.log(`[dev]   API:        http://localhost:${PORT}/api/health`);
});
