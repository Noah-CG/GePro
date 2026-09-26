/**
 * Contenu des emails (HTML simple + texte brut). Les valeurs venues des utilisateurs (noms,
 * projet) sont échappées ; les liens sont construits par l'appelant à partir de APP_URL.
 */
import type { EmailMessage } from "./send";

type Content = Omit<EmailMessage, "to">;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Mise en page commune : un paragraphe d'introduction, un bouton, une note en petit. */
function layout(paragraphs: string[], button: { label: string; url: string }, note: string): Content["html"] {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("");
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:18px">GePro</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(button.label)}</a></p>
<p style="margin:0;font-size:13px;color:#71717a">${note}</p>
<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all">Si le bouton ne fonctionne pas, copiez ce lien : ${escapeHtml(button.url)}</p>
</div></body></html>`;
}

export function verificationEmail({ name, url }: { name: string; url: string }): Content {
  return {
    subject: "Confirmez votre adresse email",
    html: layout(
      [`Bonjour ${escapeHtml(name)},`, "Confirmez votre adresse email pour finaliser votre compte GePro et pouvoir accepter des invitations à des projets."],
      { label: "Confirmer mon adresse", url },
      "Ce lien est valable 24 heures et ne sert qu'une fois. Si vous n'avez pas créé de compte GePro, ignorez cet email.",
    ),
    text: `Bonjour ${name},\n\nConfirmez votre adresse email pour finaliser votre compte GePro :\n${url}\n\nCe lien est valable 24 heures et ne sert qu'une fois. Si vous n'avez pas créé de compte GePro, ignorez cet email.`,
  };
}

export function passwordResetEmail({ name, url }: { name: string; url: string }): Content {
  return {
    subject: "Réinitialisation de votre mot de passe",
    html: layout(
      [`Bonjour ${escapeHtml(name)},`, "Une réinitialisation du mot de passe de votre compte GePro a été demandée."],
      { label: "Choisir un nouveau mot de passe", url },
      "Ce lien est valable 1 heure et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
    ),
    text: `Bonjour ${name},\n\nUne réinitialisation du mot de passe de votre compte GePro a été demandée. Pour choisir un nouveau mot de passe :\n${url}\n\nCe lien est valable 1 heure et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  };
}

export function invitationEmail({
  name,
  inviterName,
  projectName,
  url,
}: {
  name: string;
  inviterName: string;
  projectName: string;
  url: string;
}): Content {
  return {
    subject: `${inviterName} vous invite dans « ${projectName} »`,
    html: layout(
      [
        `Bonjour ${escapeHtml(name)},`,
        `${escapeHtml(inviterName)} vous invite à rejoindre le projet <strong>${escapeHtml(projectName)}</strong> sur GePro.`,
      ],
      { label: "Voir l'invitation", url },
      "L'invitation vous attend aussi dans GePro, sur la page Projets. Elle expire dans 7 jours.",
    ),
    text: `Bonjour ${name},\n\n${inviterName} vous invite à rejoindre le projet « ${projectName} » sur GePro :\n${url}\n\nL'invitation vous attend aussi dans GePro, sur la page Projets. Elle expire dans 7 jours.`,
  };
}
