import { NextResponse, type NextRequest } from "next/server";

/** Pages accessibles sans être connecté (comptes). Tout le reste exige le cookie de session. */
const PUBLIC_PATHS = /^\/(login|connexion|inscription)\/?$/;

/**
 * Protection CSRF : toute requête qui modifie quelque chose (POST : Server Actions, formulaires,
 * routes API) doit venir de GePro lui-même. Next.js compare déjà l'origine des Server Actions,
 * mais laisse passer une requête sans en-tête Origin ; ici, elle est refusée. Les cookies sont en
 * SameSite=Lax (lib/auth.ts), ce qui bloque déjà l'envoi du cookie depuis un autre site.
 */
function isCrossSite(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Vérification rapide : sans cookie de session, on redirige vers /connexion.
 * La vraie vérification (session valide en base) est faite dans chaque page et Server Action.
 * Un lien d'invitation est repris après la connexion (?suite=).
 */
export function proxy(request: NextRequest) {
  if (isCrossSite(request)) return new NextResponse("Requête refusée (origine inconnue).", { status: 403 });

  const { pathname } = request.nextUrl;
  if (!PUBLIC_PATHS.test(pathname) && !request.cookies.has("gepro_session")) {
    const login = new URL("/connexion", request.url);
    if (/^\/(invitations|rejoindre)\//.test(pathname)) login.searchParams.set("suite", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf les fichiers statiques (dont le favicon, affiché aussi sur les pages de connexion).
  matcher: ["/((?!icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
