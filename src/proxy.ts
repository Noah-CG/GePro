import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification rapide : sans cookie de session, on redirige vers /login.
 * La vraie vérification (session valide en base) est faite dans chaque page et Server Action.
 * Un lien d'invitation est repris après la connexion (?suite=).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("gepro_session")) {
    const login = new URL("/login", request.url);
    if (request.nextUrl.pathname.startsWith("/invitations/")) login.searchParams.set("suite", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf la page de connexion et les fichiers statiques (dont le favicon, affiché aussi sur /login).
  matcher: ["/((?!login|icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
