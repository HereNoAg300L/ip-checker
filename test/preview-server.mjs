import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const mockCf = {
  asn: 4134,
  asOrganization: "CHINANET-BACKBONE",
  city: "Shanghai",
  colo: "PVG",
  continent: "AS",
  country: "CN",
  edgeL4: { deliveryRate: 3280000 },
  httpProtocol: "HTTP/3",
  isEUCountry: "0",
  latitude: "31.22222",
  longitude: "121.45806",
  postalCode: "200000",
  region: "Shanghai",
  regionCode: "SH",
  timezone: "Asia/Shanghai",
  tlsCipher: "AEAD-AES128-GCM-SHA256",
  tlsVersion: "TLSv1.3",
  clientQuicRtt: 22,
};

const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const resolved = normalize(join(root, pathname));

    if (!resolved.startsWith(normalize(root))) return new Response("Not found", { status: 404 });

    try {
      const content = await readFile(resolved);
      return new Response(content, {
        headers: {
          "Content-Type": mime[extname(resolved)] ?? "application/octet-stream",
        },
      });
    } catch {
      const notFound = await readFile(join(root, "404.html"));
      return new Response(notFound, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
};

const server = createServer(async (incoming, outgoing) => {
  const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
    method: incoming.method,
    headers: {
      ...incoming.headers,
      "CF-Connecting-IP": incoming.headers["x-preview-ip"] ?? "240e:3a1:4321:5b00::2026",
      "CF-Ray": "preview-ray-PVG",
    },
  });
  Object.defineProperty(request, "cf", { value: mockCf });

  const response = await worker.fetch(request, { ASSETS: assets });
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) outgoing.end(Buffer.from(await response.arrayBuffer()));
  else outgoing.end();
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`IP Lens mock preview: http://127.0.0.1:${port}\n`);
});
