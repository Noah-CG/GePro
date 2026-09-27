import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers: { host: "localhost:3000", ...init.headers } });

describe("proxy", () => {
  it("sans session, une page redirige vers la connexion (lien d'invitation repris)", () => {
    const res = proxy(request("/invitations/abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/connexion?suite=%2Finvitations%2Fabc");
  });

  it("sans session, une route API répond 401 en JSON", async () => {
    const res = proxy(request("/api/fichiers/123"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("sans session, la connexion Google redirige comme une page", () => {
    expect(proxy(request("/api/integrations/google/connect")).status).toBe(307);
  });

  it("refuse un POST venu d'un autre site ou sans origine", () => {
    expect(proxy(request("/connexion", { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect(proxy(request("/connexion", { method: "POST" })).status).toBe(403);
    expect(proxy(request("/connexion", { method: "POST", headers: { origin: "http://localhost:3000" } })).status).toBe(200);
  });
});
