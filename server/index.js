import { createServer } from "node:http";
import { verifyAuth } from "@supabase/server/core";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_JWKS_URL"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  throw new Error(`Missing server environment variables: ${missingEnv.join(", ")}`);
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/me") {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    const webRequest = new Request(requestUrl, { method: request.method, headers });
    try {
      const { data: auth, error } = await verifyAuth(webRequest, { auth: "user" });
      if (error) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      sendJson(response, 200, { user: auth.userClaims });
    } catch {
      sendJson(response, 500, { error: "Unable to verify the Supabase session." });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const port = Number(process.env.API_PORT || 3001);
server.listen(port, "127.0.0.1", () => {
  console.log(`Supabase API listening on http://127.0.0.1:${port}`);
});
