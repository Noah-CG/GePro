/**
 * Données d'exemple réalistes : 6 membres, 5 projets (dont 1 archivé), ~35 tâches.
 * Les dates sont calculées par rapport à aujourd'hui pour que le tableau de bord
 * affiche toujours des tâches en retard et des tâches de la semaine.
 *
 *   npm run db:seed            → refuse si la base contient déjà des données
 *   npm run db:seed -- --reset → vide la base puis la remplit
 */
import "./env";
import { db, isLocalDb } from "../src/db";
import {
  externalConnections,
  externalResources,
  projectEvents,
  projectFiles,
  projects,
  sessions,
  taskAssignees,
  tasks,
  users,
  type TaskPriority,
  type TaskStatus,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { addDays, todayISO } from "../src/lib/dates";

const DEMO_PASSWORD = "demo1234";

const MEMBERS = [
  { key: "camille", name: "Camille Martin", email: "camille@exemple.fr", role: "admin" as const, color: "#6366f1" },
  { key: "thomas", name: "Thomas Bernard", email: "thomas@exemple.fr", role: "member" as const, color: "#0ea5e9" },
  { key: "lea", name: "Léa Dubois", email: "lea@exemple.fr", role: "member" as const, color: "#10b981" },
  { key: "hugo", name: "Hugo Moreau", email: "hugo@exemple.fr", role: "member" as const, color: "#f59e0b" },
  { key: "chloe", name: "Chloé Laurent", email: "chloe@exemple.fr", role: "member" as const, color: "#f43f5e" },
  { key: "nathan", name: "Nathan Girard", email: "nathan@exemple.fr", role: "member" as const, color: "#8b5cf6" },
];
type MemberKey = (typeof MEMBERS)[number]["key"];

// [titre, statut, priorité, échéance (jours depuis aujourd'hui, null = aucune), responsables, description]
type T = [string, TaskStatus, TaskPriority, number | null, MemberKey[], string?];

const PROJECTS: {
  name: string;
  description: string;
  color: string;
  start: number;
  end: number;
  archived?: boolean;
  tasks: T[];
}[] = [
  {
    name: "Refonte du site web",
    description: "Nouveau site vitrine : arborescence simplifiée, design responsive et meilleur référencement. Mise en ligne prévue fin du mois prochain.",
    color: "#6366f1",
    start: -30,
    end: 35,
    tasks: [
      ["Atelier arborescence avec la direction", "done", "high", -21, ["camille", "lea"]],
      ["Maquettes de la page d'accueil", "done", "high", -10, ["lea"], "Deux variantes : claire et contrastée. Valider avec Camille."],
      ["Rédiger les textes des pages services", "in_progress", "medium", -2, ["chloe"], "Ton : direct, orienté bénéfices. 300 mots max par page."],
      ["Intégration du gabarit de page article", "in_progress", "medium", 3, ["thomas"]],
      ["Choisir l'hébergeur et réserver le domaine", "todo", "high", -1, ["hugo"]],
      ["Plan de redirections 301 depuis l'ancien site", "todo", "high", 6, ["thomas", "hugo"]],
      ["Optimiser les images (WebP, lazy loading)", "todo", "low", 20, ["thomas"]],
      ["Recette mobile sur iOS et Android", "todo", "medium", 28, ["lea", "nathan"]],
      ["Mentions légales et bandeau cookies", "todo", "medium", null, ["camille"]],
    ],
  },
  {
    name: "Lancement newsletter mensuelle",
    description: "Newsletter clients : premier numéro, modèle réutilisable et formulaire d'inscription sur le site.",
    color: "#10b981",
    start: -14,
    end: 12,
    tasks: [
      ["Choisir l'outil d'emailing", "done", "high", -8, ["hugo"], "Comparatif Brevo / Mailchimp / MailerLite fait. Choix : Brevo."],
      ["Créer le modèle d'email aux couleurs de la marque", "done", "medium", -4, ["lea"]],
      ["Rédiger l'édito du premier numéro", "in_progress", "high", 1, ["camille"]],
      ["Importer et nettoyer la liste de contacts (RGPD)", "in_progress", "high", 0, ["nathan"], "Ne garder que les contacts avec consentement explicite."],
      ["Formulaire d'inscription sur le site", "todo", "medium", 4, ["thomas"]],
      ["Envoi test à l'équipe", "todo", "medium", 5, ["nathan", "chloe"]],
      ["Planifier l'envoi du numéro 1", "todo", "low", 10, ["camille"]],
    ],
  },
  {
    name: "Salon Pro Expo",
    description: "Présence sur le salon régional : stand, supports imprimés, démo produit et prise de rendez-vous.",
    color: "#f59e0b",
    start: -20,
    end: 45,
    tasks: [
      ["Réserver l'emplacement du stand", "done", "high", -15, ["camille"]],
      ["Commander le kakémono et les flyers", "todo", "high", -3, ["chloe"], "Délai imprimeur : 10 jours ouvrés. Urgent."],
      ["Préparer le script de démo produit", "in_progress", "medium", 9, ["hugo", "thomas"]],
      ["Réserver hôtel et train pour 3 personnes", "todo", "medium", 2, ["nathan"]],
      ["Campagne LinkedIn d'annonce du salon", "todo", "low", 15, ["chloe", "lea"]],
      ["Planning de présence sur le stand", "todo", "medium", 21, ["camille"]],
      ["Goodies : devis et commande", "todo", "low", null, []],
    ],
  },
  {
    name: "Migration CRM",
    description: "Passage du tableur partagé vers un vrai CRM : import des données, formation de l'équipe, arrêt de l'ancien fichier.",
    color: "#f43f5e",
    start: -45,
    end: 20,
    tasks: [
      ["Cartographier les champs du tableur actuel", "done", "high", -35, ["nathan"]],
      ["Paramétrer les étapes du pipeline commercial", "done", "medium", -20, ["hugo"]],
      ["Script d'import des contacts et entreprises", "done", "high", -12, ["thomas"]],
      ["Dédoublonner les fiches après import", "in_progress", "medium", -5, ["nathan"], "≈ 180 doublons détectés automatiquement, à valider à la main."],
      ["Session de formation de l'équipe (1h30)", "todo", "high", 3, ["hugo", "camille"]],
      ["Rédiger le guide d'utilisation interne", "todo", "medium", 8, ["lea"]],
      ["Archiver l'ancien tableur en lecture seule", "todo", "low", 18, ["nathan"]],
    ],
  },
  {
    name: "Audit sécurité 2025",
    description: "Audit annuel : mots de passe, sauvegardes, accès des anciens collaborateurs.",
    color: "#64748b",
    start: -120,
    end: -60,
    archived: true,
    tasks: [
      ["Révoquer les accès des anciens collaborateurs", "done", "high", -90, ["hugo"]],
      ["Activer la double authentification partout", "done", "high", -80, ["hugo", "thomas"]],
      ["Tester la restauration des sauvegardes", "done", "medium", -65, ["thomas"]],
    ],
  },
];

async function main() {
  const reset = process.argv.includes("--reset");
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length && !reset) {
    console.log("La base contient déjà des données. Relancez avec --reset pour tout effacer et recharger la démo.");
    return;
  }

  if (reset) {
    console.log("Suppression des données existantes…");
    await db.delete(projectFiles);
    await db.delete(projectEvents);
    await db.delete(externalResources);
    await db.delete(externalConnections);
    await db.delete(taskAssignees);
    await db.delete(tasks);
    await db.delete(projects);
    await db.delete(sessions);
    await db.delete(users);
  }

  const today = todayISO();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const insertedUsers = await db
    .insert(users)
    .values(MEMBERS.map(({ key: _, ...m }) => ({ ...m, passwordHash })))
    .returning({ id: users.id, email: users.email });
  const userId = (key: MemberKey) => insertedUsers.find((u) => u.email === MEMBERS.find((m) => m.key === key)!.email)!.id;
  const admin = userId("camille");

  let taskCount = 0;
  for (const p of PROJECTS) {
    const [project] = await db
      .insert(projects)
      .values({
        name: p.name,
        description: p.description,
        color: p.color,
        startDate: addDays(today, p.start),
        endDate: addDays(today, p.end),
        archivedAt: p.archived ? new Date() : null,
        createdBy: admin,
      })
      .returning({ id: projects.id });

    const rows = await db
      .insert(tasks)
      .values(
        p.tasks.map(([title, status, priority, due, , description], i) => ({
          projectId: project.id,
          title,
          description: description ?? "",
          status,
          priority,
          dueDate: due === null ? null : addDays(today, due),
          position: (i + 1) * 1024,
          completedAt: status === "done" ? new Date() : null,
          createdBy: admin,
        })),
      )
      .returning({ id: tasks.id });

    const links = rows.flatMap((row, i) => p.tasks[i][4].map((key) => ({ taskId: row.id, userId: userId(key) })));
    if (links.length) await db.insert(taskAssignees).values(links);
    taskCount += rows.length;
  }

  console.log(`✔ Démo chargée (${isLocalDb ? "base locale" : "Neon"}) : ${MEMBERS.length} membres, ${PROJECTS.length} projets, ${taskCount} tâches.`);
  console.log(`  Connexion admin : ${MEMBERS[0].email} / ${DEMO_PASSWORD}`);
  console.log(`  (mêmes mots de passe pour les autres membres — à changer avant un usage réel)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
