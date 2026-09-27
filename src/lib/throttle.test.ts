import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./throttle";

const request = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const ipFrom = (headers: Record<string, string>) => {
  request.headers = new Headers(headers);
  return clientIp();
};

afterEach(() => vi.unstubAllEnvs());

describe("adresse IP du client", () => {
  it("prend l'adresse ajoutée par le proxy le plus proche, pas celles inventées par le client", async () => {
    expect(await ipFrom({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })).toBe("203.0.113.9");
    expect(await ipFrom({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("préfère X-Real-IP, posé par le proxy inverse", async () => {
    expect(await ipFrom({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" })).toBe("198.51.100.4");
  });

  it("sur Vercel, lit x-vercel-forwarded-for", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await ipFrom({ "x-vercel-forwarded-for": "192.0.2.7", "x-forwarded-for": "1.1.1.1" })).toBe("192.0.2.7");
  });

  it("sans en-tête : une clé commune", async () => {
    expect(await ipFrom({})).toBe("inconnue");
  });
});
