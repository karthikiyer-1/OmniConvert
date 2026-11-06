/**
 * GET /api/frame-check?url=https://example.com
 *
 * Tells the Browse panel whether a page allows being shown in an <iframe>
 * (X-Frame-Options / CSP frame-ancestors) and returns its <title>.
 * It reads response headers and at most 96 KB of HTML; page content is
 * never forwarded, so this is not a proxy.
 *
 * SSRF protection: http(s) on default ports only, no credentials in URLs,
 * every hop (including redirects) must resolve to a public IP, and the
 * connection is pinned to the IP that was validated.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 6000;
const MAX_BYTES = 96 * 1024;

function ipv4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

const allowPrivate = () => process.env.FRAME_CHECK_ALLOW_PRIVATE === "1"; // tests only

async function resolvePublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true });
  if (!addrs.length) throw new Error("unresolvable");
  if (!allowPrivate() && addrs.some((a) => isPrivateIp(a.address))) throw new Error("private-address");
  return addrs[0];
}

function validate(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid-url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("unsupported-scheme");
  if (u.username || u.password) throw new Error("credentials-not-allowed");
  if (u.port && !allowPrivate() && !["80", "443"].includes(u.port)) throw new Error("port-not-allowed");
  return u;
}

function get(u, addr) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname.replace(/^\[|\]$/g, ""),
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; OmniConvert-FrameCheck/1.0)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "en",
        },
        // Pin the connection to the address we validated (no DNS rebinding).
        lookup: (_h, opts, cb) =>
          opts && opts.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family),
      },
      (res) => {
        const type = String(res.headers["content-type"] || "");
        const done = (body) => resolve({ status: res.statusCode || 0, headers: res.headers, body });
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return done("");
        }
        if (!/html/i.test(type)) {
          res.destroy();
          return done("");
        }
        let size = 0;
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
          size += c.length;
          if (size >= MAX_BYTES) {
            res.destroy();
            done(Buffer.concat(chunks).toString("utf8"));
          }
        });
        res.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
        res.on("error", () => done(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function sourceAllows(src, appOrigin) {
  const s = src.trim().replace(/^'|'$/g, "").toLowerCase();
  if (s === "*") return true;
  if (!appOrigin) return false;
  const app = new URL(appOrigin);
  if (s === "self") return false; // 'self' refers to the framed site, not us
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return app.protocol === s; // scheme-only, e.g. https:
  const m = s.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/);
  if (!m) return false;
  const [, scheme, wild, host] = m;
  if (scheme && scheme + ":" !== app.protocol) return false;
  return wild ? app.hostname.endsWith("." + host) : app.hostname === host;
}

export function framingVerdict(headers, appOrigin) {
  const xfo = String(headers["x-frame-options"] || "").toLowerCase();
  const csp = [].concat(headers["content-security-policy"] || []).join(";");
  const fa = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  // CSP frame-ancestors overrides X-Frame-Options when present.
  if (fa) {
    const sources = fa.split(/\s+/).slice(1);
    if (!sources.length || sources.some((s) => s.toLowerCase() === "'none'")) return { embeddable: false, reason: "csp" };
    return sources.some((s) => sourceAllows(s, appOrigin)) ? { embeddable: true } : { embeddable: false, reason: "csp" };
  }
  if (xfo.includes("deny") || xfo.includes("sameorigin") || xfo.includes("allow-from")) return { embeddable: false, reason: "x-frame-options" };
  return { embeddable: true };
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

export async function check(rawUrl, appOrigin) {
  let u = validate(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addr = await resolvePublic(u.hostname);
    const r = await get(u, addr);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      u = validate(new URL(r.headers.location, u).toString());
      continue;
    }
    const verdict = framingVerdict(r.headers, appOrigin);
    const t = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = t ? decodeEntities(t[1]).replace(/\s+/g, " ").trim().slice(0, 140) : undefined;
    return { ...verdict, status: r.status, finalUrl: u.toString(), title };
  }
  throw new Error("too-many-redirects");
}

export default async function handler(req, res) {
  const send = (code, body, cache = "no-store") => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", cache);
    res.setHeader("x-content-type-options", "nosniff");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return send(405, { error: "method-not-allowed" });
  const q = new URL(req.url, "http://x").searchParams;
  const target = q.get("url");
  if (!target || target.length > 2048) return send(400, { error: "missing-url" });
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const appOrigin = host ? `${String(proto).split(",")[0]}://${String(host).split(",")[0]}` : undefined;
  try {
    const result = await check(target, appOrigin);
    send(200, result, "public, max-age=300, s-maxage=3600");
  } catch (e) {
    const reason = e && e.message ? e.message : "unreachable";
    const client = ["invalid-url", "unsupported-scheme", "credentials-not-allowed", "port-not-allowed", "private-address"].includes(reason);
    send(client ? 400 : 200, { embeddable: null, reason });
  }
}
