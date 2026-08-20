import fs from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const repoDir = new URL(".", import.meta.url);
const envPath = new URL("./.env", repoDir);
const redirectPort = 53921;
const redirectUri = `http://127.0.0.1:${redirectPort}/oauth2callback`;
const scopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];

async function loadDotEnv() {
  const env = {};
  try {
    const body = await fs.readFile(envPath, "utf8");
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key] = rest.join("=").trim();
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return env;
}

async function upsertEnv(values) {
  let body = "";
  try {
    body = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    body = pattern.test(body) ? body.replace(pattern, line) : `${body.trimEnd()}\n${line}\n`;
  }
  await fs.writeFile(envPath, body);
}

function openUrl(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

async function exchangeCode({ code, clientId, clientSecret }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google token exchange failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const env = await loadDotEnv();
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.");

  const state = crypto.randomUUID();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", redirectUri);
      if (requestUrl.pathname === "/" || requestUrl.pathname === "/start") {
        res.writeHead(302, { location: authUrl.toString() });
        res.end();
        return;
      }
      if (requestUrl.pathname !== "/oauth2callback") {
        res.writeHead(404).end("Not found");
        return;
      }
      if (requestUrl.searchParams.get("state") !== state) throw new Error("OAuth state mismatch.");
      const code = requestUrl.searchParams.get("code");
      if (!code) throw new Error(requestUrl.searchParams.get("error") || "Missing OAuth code.");
      const token = await exchangeCode({ code, clientId, clientSecret });
      if (!token.refresh_token) throw new Error("Google no devolvio refresh_token. Reintenta con prompt=consent.");
      await upsertEnv({ YOUTUBE_REFRESH_TOKEN: token.refresh_token });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>YouTube autorizado</h1><p>Ya podes volver a Codex y correr el sync.</p>");
      console.log("YouTube refresh token saved in .env");
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error.message);
      console.error(error.message);
    } finally {
      setTimeout(() => server.close(), 800);
    }
  });

  server.listen(redirectPort, "127.0.0.1", () => {
    const startUrl = `http://127.0.0.1:${redirectPort}/start`;
    console.log("Opening Google authorization in your browser...");
    console.log(`If it does not open, visit: ${startUrl}`);
    openUrl(startUrl);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
