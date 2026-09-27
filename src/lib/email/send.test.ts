import { afterEach, describe, expect, it, vi } from "vitest";
import { invitationEmail, passwordResetEmail, verificationEmail } from "./templates";
import { appUrl, emailErrorMessage, sendEmail } from "./send";

const message = { to: "nadia@exemple.fr", subject: "Sujet", html: "<p>Bonjour</p>", text: "Bonjour" };

function stubResend(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function configure() {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.exemple.fr");
  vi.stubEnv("APP_URL", "https://gepro.exemple.fr/");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("envoie par l'API Resend depuis noreply@<EMAIL_FROM_DOMAIN>", async () => {
    configure();
    const fetchMock = stubResend(200, { id: "email-1" });
    expect(await sendEmail(message)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "GePro <noreply@mail.exemple.fr>", to: "nadia@exemple.fr", subject: "Sujet" });
  });

  it("quota dépassé, refus, panne : un code d'erreur et un message clair, journalisés sans le contenu", async () => {
    configure();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubResend(429, { name: "daily_quota_exceeded", message: "Quota", statusCode: 429 });
    expect(await sendEmail(message)).toEqual({ ok: false, code: "quota" });
    stubResend(422, { name: "validation_error", message: "Invalid `to`", statusCode: 422 });
    expect(await sendEmail(message)).toEqual({ ok: false, code: "rejected" });
    stubResend(401, { name: "invalid_api_key", message: "Bad key", statusCode: 401 });
    expect(await sendEmail(message)).toEqual({ ok: false, code: "not_configured" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNRESET"))));
    expect(await sendEmail(message)).toEqual({ ok: false, code: "unavailable" });

    // Une ligne par échec (le SDK Resend en ajoute hors production), jamais le contenu de l'email.
    expect(log.mock.calls.filter(([line]) => String(line).startsWith("[email]"))).toHaveLength(4);
    expect(log.mock.calls.flat().map((x) => JSON.stringify(x)).join(" ")).not.toContain("Bonjour");
    expect(emailErrorMessage("quota")).toMatch(/limite/);
  });

  it("en production, sans configuration : erreur « non configuré » (jamais d'envoi silencieux)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubResend(200, {});
    expect(await sendEmail(message)).toEqual({ ok: false, code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hors production, sans clé : l'email est écrit dans la console du serveur", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail(message)).toEqual({ ok: true });
    expect(info.mock.calls[0][0]).toContain("nadia@exemple.fr");
  });

  it("en production, les liens ne sont jamais construits sans APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBeNull();
    vi.stubEnv("APP_URL", "https://gepro.exemple.fr/");
    expect(appUrl()).toBe("https://gepro.exemple.fr");
  });
});

describe("modèles d'email", () => {
  it("échappent les valeurs saisies par les utilisateurs", () => {
    const email = invitationEmail({ name: "Nadia", inviterName: "<script>x</script>", projectName: "A & B", url: "https://gepro.exemple.fr/invitations/t" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B");
    expect(email.text).toContain("https://gepro.exemple.fr/invitations/t");
  });

  it("indiquent la durée de validité des liens", () => {
    expect(verificationEmail({ name: "N", url: "u" }).text).toContain("24 heures");
    expect(passwordResetEmail({ name: "N", url: "u" }).text).toContain("1 heure");
  });
});

describe("isEmailEnabled", () => {
  it("en production : seulement si Resend, le domaine d'envoi et APP_URL sont configurés", async () => {
    const { isEmailEnabled } = await import("./send");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isEmailEnabled()).toBe(false);
    configure();
    expect(isEmailEnabled()).toBe(true);
    vi.stubEnv("APP_URL", "");
    expect(isEmailEnabled()).toBe(false);
  });

  it("hors production : toujours (emails dans la console sans clé)", async () => {
    const { isEmailEnabled } = await import("./send");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isEmailEnabled()).toBe(true);
  });
});
