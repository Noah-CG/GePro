# Intégration Discord

Chaque projet GePro peut être relié à **un salon Discord**. Un onglet fixe, réduit au logo Discord, se trouve tout à droite de la barre d'onglets : il ouvre un panneau latéral pour lire le salon et y écrire sans quitter GePro, ou le salon peut s'ouvrir dans un onglet GePro à part entière. Une pastille rouge sur le logo signale les nouveaux messages.

L'intégration est facultative. Tant que `DISCORD_BOT_TOKEN` et `INTEGRATIONS_ENCRYPTION_KEY` ne sont pas tous deux renseignés, elle est désactivée et l'onglet Discord n'apparaît pas.

## Fonctionnement

```
Navigateur ──(polling)──▶ /api/projects/[id]/discord/* ──(REST v10)──▶ Discord
                          (session GePro vérifiée)       bot : lecture
                                                         webhook « GePro » : envoi
```

- **Lecture par un bot**, dont le jeton reste côté serveur. Le navigateur n'appelle jamais Discord directement.
- **Envoi par un webhook** nommé « GePro », créé (ou réutilisé) par le bot sur le salon au moment du rattachement. Chaque message est publié avec le **nom du membre GePro** comme pseudo. `allowed_mentions` est vide : un `@everyone`, un `@here` ou une mention ne notifie personne.
- **Pas de Gateway ni de WebSocket** : sur Vercel (serverless), aucune connexion ne peut rester ouverte. Le panneau interroge les routes de GePro :
  - panneau fermé : `status` toutes les 20 s (l'objet salon et son `last_message_id`, l'appel le plus léger) ;
  - panneau ouvert : `messages?after=<dernier id>` toutes les 4 s ;
  - aucune requête quand l'onglet est masqué, reprise immédiate au retour.
- Les appels à Discord sont **mis en cache 3 s** côté serveur (cache de données de Next.js), partagé entre utilisateurs : dix personnes le panneau ouvert représentent environ un appel à Discord toutes les 3 s, pas dix. Les listes de rôles et de salons (pour afficher les mentions) sont gardées 5 min.
- **Limite de débit (429)** : si Discord demande d'attendre 2 s au plus, le serveur attend puis réessaie ; au-delà, il renvoie un 429 avec `Retry-After`, et le navigateur espace ses requêtes d'autant.
- **Jamais de jeton utilisateur Discord** : les « self-bots » sont interdits par les conditions d'utilisation de Discord.

## 1. Créer l'application et le bot

1. Ouvrez le [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**, nommez-la « GePro » et acceptez les conditions.
2. Onglet **Bot** :
   - **Reset Token** → copiez le jeton : c'est `DISCORD_BOT_TOKEN`. Discord ne le réaffichera pas. Traitez-le comme un mot de passe : quiconque le possède contrôle le bot.
   - Décochez **Public Bot** si vous ne voulez pas que d'autres serveurs puissent l'inviter.
3. Toujours dans **Bot**, section **Privileged Gateway Intents** : activez **Message Content Intent** puis **Save Changes**.

   > Sans cet intent, Discord renvoie les messages **avec un contenu vide** (sauf ceux qui mentionnent le bot), y compris via l'API REST. Le panneau n'afficherait que des auteurs et des pièces jointes. Tant que le bot est sur moins de 100 serveurs, il suffit de cocher la case, sans validation par Discord.

## 2. Inviter le bot sur le serveur

Le bot a besoin de quatre permissions :

| Permission | Pourquoi |
|---|---|
| View Channel (Voir le salon) | Lire le salon et son dernier message |
| Read Message History (Voir les anciens messages) | Charger l'historique |
| Send Messages (Envoyer des messages) | Publier dans le salon |
| Manage Webhooks (Gérer les webhooks) | Créer ou retrouver le webhook « GePro » au rattachement |

URL d'invitation (remplacez `APPLICATION_ID` par l'**Application ID** de l'onglet **General Information**) :

```
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot&permissions=536939520
```

`536939520` = 1024 (View Channel) + 2048 (Send Messages) + 65536 (Read Message History) + 536870912 (Manage Webhooks). Vous pouvez aussi générer l'URL dans **OAuth2 → URL Generator** : scope `bot`, puis les quatre permissions ci-dessus.

Ouvrez l'URL, choisissez le serveur (il faut y avoir la permission « Gérer le serveur ») et validez. Si le salon est privé ou a des permissions spécifiques, ajoutez aussi le bot, ou l'un de ses rôles, aux permissions **du salon**.

## 3. Variables d'environnement

| Variable | Valeur |
|---|---|
| `DISCORD_BOT_TOKEN` | Jeton du bot (étape 1) |
| `INTEGRATIONS_ENCRYPTION_KEY` | Déjà utilisée par Google Docs : 32 octets en base64. Elle chiffre en base le jeton du webhook. Pour la générer : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

- **En local** : ajoutez-les dans `.env.local` (voir `.env.example`), puis redémarrez `npm run dev`.
- **Sur Vercel** : *Settings → Environment Variables*, pour les environnements voulus (Production, Preview), puis redéployez. Une variable ajoutée n'est prise en compte qu'au déploiement suivant.
- **Migration** : l'intégration ajoute deux tables (`project_discord`, `discord_read_state`). En local, `npm run db:migrate`. Sur Vercel, la commande de build les applique (`vercel.json`).

## 4. Relier un salon à un projet

1. Dans Discord, activez le **mode développeur** : *Paramètres utilisateur → Avancés → Mode développeur*.
2. Clic droit sur le salon → **Copier l'identifiant du salon**. Vous pouvez aussi copier le lien du salon (`https://discord.com/channels/<serveur>/<salon>`).
3. Dans GePro : **Paramètres du projet** → carte **Discord** → collez l'identifiant (ou le lien) → **Relier le salon**.

Au rattachement, le serveur :

- vérifie que le bot voit le salon (`GET /channels/{id}`), qu'il s'agit d'un salon textuel ou d'annonces d'un serveur, et récupère son `guild_id` ;
- réutilise le webhook « GePro » du salon s'il existe, sinon en crée un (`POST /channels/{id}/webhooks`) ;
- enregistre l'id du webhook et son jeton **chiffré**. Ils ne sont jamais envoyés au navigateur.

**Changer de salon** ou **Délier** se fait depuis la même carte. Délier conserve le webhook sur Discord : relier de nouveau le salon le réutilise. Pour le supprimer, allez dans les paramètres du salon Discord → *Intégrations → Webhooks*.

Si le webhook est supprimé côté Discord, GePro le recrée automatiquement au prochain envoi.

## Utilisation

- **Onglet fixe Discord**, tout à droite de la barre d'onglets, sur toutes les pages, juste au-dessus du panneau qu'il ouvre : il concerne le projet sélectionné et ne se ferme pas. Sans salon relié, il mène aux paramètres du projet. Sinon, il ouvre ou ferme le panneau, qui se ferme aussi avec **✕** ou **Échap**.
- **Largeur du panneau** : tirez son bord gauche (ou, la poignée ayant le focus, ← pour élargir et → pour rétrécir ; double-clic pour revenir à 380 px). La largeur est mémorisée dans ce navigateur.
- **Ouvrir dans un onglet** (icône à côté de « Ouvrir dans Discord ») : le salon s'affiche en pleine page dans un onglet GePro, placé après les autres (ou réactivé s'il est déjà ouvert). Son adresse est `/projets/<id>/discord`.
- **Pastille rouge** : le dernier message du salon est plus récent que le dernier lu (comparaison en BigInt). Le salon est marqué comme lu à l'ouverture du panneau, puis à chaque nouveau message affiché. Vos propres messages ne déclenchent pas la pastille.
- **Écrire** : Entrée envoie, Maj + Entrée va à la ligne. Discord limite un message à 2 000 caractères (compteur affiché à partir de 1 800). Le message apparaît grisé le temps de l'envoi ; en cas d'échec, **Réessayer** ou **Supprimer**.
- **Rendu** : gras, italique, souligné, barré, spoilers, code, citations, liens, mentions de membres, de rôles et de salons, emojis personnalisés, horodatages `<t:…>`, images jointes, autres fichiers en lien, embeds simples. Aucun HTML n'est interprété : le markdown est analysé en arbre (`src/lib/discord/markdown.ts`) puis rendu en composants React.
- Les messages écrits depuis GePro portent le badge **via GePro**, ceux des bots le badge **BOT**.

Tout membre connecté à GePro peut lire et écrire dans le salon d'un projet (GePro n'a pas de droits par projet) : ne reliez qu'un salon destiné à toute l'équipe.

## Dépannage

| Message dans GePro | Cause et solution |
|---|---|
| « L'intégration Discord n'est pas configurée sur ce serveur » | `DISCORD_BOT_TOKEN` ou `INTEGRATIONS_ENCRYPTION_KEY` manque. Redémarrez (ou redéployez) après l'avoir ajoutée. |
| « Discord refuse le jeton du bot » | Jeton erroné ou régénéré depuis : copiez le nouveau dans `DISCORD_BOT_TOKEN`. |
| « Le bot GePro n'est pas (ou plus) membre de ce serveur » | Invitez le bot avec l'URL de l'étape 2. |
| « Le bot n'a pas accès à ce salon » | Salon privé : donnez au bot « Voir le salon » et « Voir les anciens messages » dans les permissions du salon. |
| « Il manque une permission au bot » | Le plus souvent « Gérer les webhooks », nécessaire au rattachement. |
| « Salon Discord introuvable » | Identifiant erroné, ou salon supprimé. |
| « Ce salon a atteint le nombre maximal de webhooks » | 15 webhooks au plus par salon : supprimez-en un dans *Intégrations → Webhooks*. |
| Messages affichés vides | **Message Content Intent** non activé (étape 1). |

## Code

| Emplacement | Rôle |
|---|---|
| `src/lib/discord/client.ts` | Client REST v10 : cache, 429, erreurs traduites en codes |
| `src/lib/discord/service.ts` | Rattachement, webhook, lecture, envoi, état de lecture |
| `src/lib/discord/normalize.ts` | Conversion des messages bruts au format envoyé au navigateur (`model.ts`) |
| `src/lib/discord/markdown.ts` | Parser du markdown Discord |
| `src/lib/discord/snowflake.ts` | Comparaison des identifiants en BigInt |
| `src/lib/discord/api.ts` | Socle des routes : session, projet, erreurs |
| `src/app/api/projects/[id]/discord/` | Routes `status`, `messages` (GET, POST), `read` |
| `src/actions/discord.ts` | Server Actions de rattachement |
| `src/components/discord/` | Onglet fixe et contexte (`discord-provider.tsx`), panneau redimensionnable, page en onglet, fil, saisie, interrogation périodique |
| `src/app/(app)/projets/[id]/discord/` | Salon en pleine page (onglet GePro) |

Tests : `npm test`. Discord y est simulé en remplaçant `fetch` (`src/test/discord.ts`).

## TODO (hors périmètre)

- [ ] Réactions aux messages
- [ ] Modification et suppression de messages
- [ ] Fils de discussion (threads) et réponses
- [ ] Envoi de fichiers
- [ ] Notifications du navigateur
