import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification rapide : sans cookie de session, on redirige vers /login.
 * La vraie vérification (session valide en base) est faite dans chaque page et Server Action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("gepro_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf la page de connexion et les fichiers statiques (dont le favicon, affiché aussi sur /login).
  matcher: ["/((?!login|icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
