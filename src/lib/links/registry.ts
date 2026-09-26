/**
 * Registre des services reconnus dans les « Liens utiles » : domaines (et éventuellement chemin)
 * associés à un logo simple-icons.
 *
 * Les icônes sont importées une par une : le reste du paquet (plus de 3 000 logos) n'entre pas
 * dans le bundle. Certaines marques ont été retirées de simple-icons pour des raisons de droit
 * des marques et manquent donc ici : Canva, Slack, LinkedIn, OneDrive, SharePoint, ChatGPT
 * (OpenAI), Microsoft 365. Leurs liens s'affichent avec le favicon du site (voir link-icon.tsx).
 *
 * Correspondance (voir detect.ts) : `match` liste des domaines, pris tels quels ou avec leurs
 * sous-domaines (« vercel.app » couvre « mon-app.vercel.app ») ; `path` restreint le service à
 * un chemin et à ses sous-chemins. La règle la plus précise l'emporte : une règle avec chemin
 * passe avant une règle sans chemin, puis le domaine le plus long gagne.
 */
import {
  siAirtable,
  siAsana,
  siBasecamp,
  siBehance,
  siBitbucket,
  siBluesky,
  siCalendly,
  siClaude,
  siClickup,
  siCloudflare,
  siCoda,
  siCodesandbox,
  siConfluence,
  siDeepl,
  siDevdotto,
  siDiscord,
  siDocker,
  siDribbble,
  siDropbox,
  siExcalidraw,
  siExpo,
  siFacebook,
  siFigma,
  siFirebase,
  siFramer,
  siGithub,
  siGitlab,
  siGmail,
  siGooglecalendar,
  siGooglecloud,
  siGooglecolab,
  siGoogledocs,
  siGoogledrive,
  siGoogleforms,
  siGooglegemini,
  siGooglemaps,
  siGooglemeet,
  siGooglesheets,
  siGoogleslides,
  siGoogletranslate,
  siHuggingface,
  siInstagram,
  siJira,
  siKaggle,
  siLinear,
  siLoom,
  siMake,
  siMastodon,
  siMdnwebdocs,
  siMedium,
  siMiro,
  siMistralai,
  siN8n,
  siNeon,
  siNetlify,
  siNotion,
  siNpm,
  siObsidian,
  siOverleaf,
  siPerplexity,
  siPinterest,
  siPostman,
  siRailway,
  siReddit,
  siRender,
  siReplit,
  siSentry,
  siShopify,
  siSketch,
  siSpotify,
  siStackblitz,
  siStackoverflow,
  siStripe,
  siSubstack,
  siSupabase,
  siTelegram,
  siThreads,
  siTiktok,
  siTldraw,
  siTodoist,
  siTrello,
  siTwitch,
  siTypeform,
  siVercel,
  siVimeo,
  siWebflow,
  siWetransfer,
  siWhatsapp,
  siWikipedia,
  siWordpress,
  siX,
  siYoutube,
  siZapier,
  siZoom,
  type SimpleIcon,
} from "simple-icons";

export type LinkService = {
  /** Identifiant stable (tests, clés React). */
  key: string;
  /** Nom affiché (« Figma détecté », titre par défaut). */
  name: string;
  icon: SimpleIcon;
  /** Domaines, sans « www. », en minuscules ; leurs sous-domaines sont couverts aussi. */
  match: string[];
  /** Chemin requis (ex. « /document »), en plus du domaine. */
  path?: string;
};

export const LINK_SERVICES: LinkService[] = [
  // Design
  { key: "figma", name: "Figma", icon: siFigma, match: ["figma.com"] },
  { key: "miro", name: "Miro", icon: siMiro, match: ["miro.com"] },
  { key: "dribbble", name: "Dribbble", icon: siDribbble, match: ["dribbble.com"] },
  { key: "behance", name: "Behance", icon: siBehance, match: ["behance.net"] },
  { key: "excalidraw", name: "Excalidraw", icon: siExcalidraw, match: ["excalidraw.com"] },
  { key: "tldraw", name: "tldraw", icon: siTldraw, match: ["tldraw.com"] },
  { key: "framer", name: "Framer", icon: siFramer, match: ["framer.com", "framer.website", "framer.app"] },
  { key: "sketch", name: "Sketch", icon: siSketch, match: ["sketch.com"] },

  // Développement
  { key: "github", name: "GitHub", icon: siGithub, match: ["github.com", "gist.github.com", "github.io", "githubusercontent.com"] },
  { key: "gitlab", name: "GitLab", icon: siGitlab, match: ["gitlab.com", "gitlab.io"] },
  { key: "bitbucket", name: "Bitbucket", icon: siBitbucket, match: ["bitbucket.org"] },
  { key: "vercel", name: "Vercel", icon: siVercel, match: ["vercel.com", "vercel.app"] },
  { key: "netlify", name: "Netlify", icon: siNetlify, match: ["netlify.com", "netlify.app"] },
  { key: "supabase", name: "Supabase", icon: siSupabase, match: ["supabase.com", "supabase.co"] },
  { key: "firebase", name: "Firebase", icon: siFirebase, match: ["firebase.google.com", "firebaseapp.com", "web.app"] },
  { key: "cloudflare", name: "Cloudflare", icon: siCloudflare, match: ["cloudflare.com", "pages.dev", "workers.dev"] },
  { key: "render", name: "Render", icon: siRender, match: ["render.com", "onrender.com"] },
  { key: "railway", name: "Railway", icon: siRailway, match: ["railway.com", "railway.app"] },
  { key: "neon", name: "Neon", icon: siNeon, match: ["neon.tech", "neon.com"] },
  { key: "npm", name: "npm", icon: siNpm, match: ["npmjs.com", "npmjs.org"] },
  { key: "stackoverflow", name: "Stack Overflow", icon: siStackoverflow, match: ["stackoverflow.com"] },
  { key: "codesandbox", name: "CodeSandbox", icon: siCodesandbox, match: ["codesandbox.io", "csb.app"] },
  { key: "stackblitz", name: "StackBlitz", icon: siStackblitz, match: ["stackblitz.com", "stackblitz.io"] },
  { key: "replit", name: "Replit", icon: siReplit, match: ["replit.com", "replit.app", "repl.co"] },
  { key: "postman", name: "Postman", icon: siPostman, match: ["postman.com", "postman.co"] },
  { key: "docker", name: "Docker", icon: siDocker, match: ["docker.com"] },
  { key: "expo", name: "Expo", icon: siExpo, match: ["expo.dev"] },
  { key: "sentry", name: "Sentry", icon: siSentry, match: ["sentry.io"] },
  { key: "huggingface", name: "Hugging Face", icon: siHuggingface, match: ["huggingface.co", "hf.co"] },
  { key: "kaggle", name: "Kaggle", icon: siKaggle, match: ["kaggle.com"] },
  { key: "mdn", name: "MDN Web Docs", icon: siMdnwebdocs, match: ["developer.mozilla.org"] },
  { key: "devto", name: "dev.to", icon: siDevdotto, match: ["dev.to"] },

  // Organisation
  { key: "notion", name: "Notion", icon: siNotion, match: ["notion.so", "notion.site", "notion.com"] },
  { key: "trello", name: "Trello", icon: siTrello, match: ["trello.com"] },
  { key: "jira", name: "Jira", icon: siJira, match: ["atlassian.net"] },
  { key: "confluence", name: "Confluence", icon: siConfluence, match: ["atlassian.net"], path: "/wiki" },
  { key: "linear", name: "Linear", icon: siLinear, match: ["linear.app"] },
  { key: "asana", name: "Asana", icon: siAsana, match: ["asana.com"] },
  { key: "clickup", name: "ClickUp", icon: siClickup, match: ["clickup.com"] },
  { key: "airtable", name: "Airtable", icon: siAirtable, match: ["airtable.com"] },
  { key: "basecamp", name: "Basecamp", icon: siBasecamp, match: ["basecamp.com"] },
  { key: "todoist", name: "Todoist", icon: siTodoist, match: ["todoist.com"] },
  { key: "coda", name: "Coda", icon: siCoda, match: ["coda.io"] },
  { key: "obsidian", name: "Obsidian", icon: siObsidian, match: ["obsidian.md"] },
  { key: "calendly", name: "Calendly", icon: siCalendly, match: ["calendly.com"] },
  { key: "typeform", name: "Typeform", icon: siTypeform, match: ["typeform.com"] },
  { key: "zapier", name: "Zapier", icon: siZapier, match: ["zapier.com"] },
  { key: "make", name: "Make", icon: siMake, match: ["make.com"] },
  { key: "n8n", name: "n8n", icon: siN8n, match: ["n8n.io", "n8n.cloud"] },
  { key: "overleaf", name: "Overleaf", icon: siOverleaf, match: ["overleaf.com"] },

  // Google (docs.google.com sans chemin connu : Google Drive)
  { key: "google-drive", name: "Google Drive", icon: siGoogledrive, match: ["drive.google.com", "docs.google.com"] },
  { key: "google-docs", name: "Google Docs", icon: siGoogledocs, match: ["docs.google.com"], path: "/document" },
  { key: "google-sheets", name: "Google Sheets", icon: siGooglesheets, match: ["docs.google.com"], path: "/spreadsheets" },
  { key: "google-slides", name: "Google Slides", icon: siGoogleslides, match: ["docs.google.com"], path: "/presentation" },
  { key: "google-forms", name: "Google Forms", icon: siGoogleforms, match: ["forms.gle"] },
  { key: "google-forms-docs", name: "Google Forms", icon: siGoogleforms, match: ["docs.google.com"], path: "/forms" },
  { key: "google-meet", name: "Google Meet", icon: siGooglemeet, match: ["meet.google.com"] },
  { key: "google-calendar", name: "Google Agenda", icon: siGooglecalendar, match: ["calendar.google.com"] },
  { key: "google-maps", name: "Google Maps", icon: siGooglemaps, match: ["maps.google.com", "maps.app.goo.gl"] },
  { key: "google-maps-path", name: "Google Maps", icon: siGooglemaps, match: ["google.com", "google.fr", "goo.gl"], path: "/maps" },
  { key: "gmail", name: "Gmail", icon: siGmail, match: ["mail.google.com"] },
  { key: "google-colab", name: "Google Colab", icon: siGooglecolab, match: ["colab.research.google.com"] },
  { key: "google-cloud", name: "Google Cloud", icon: siGooglecloud, match: ["cloud.google.com", "console.cloud.google.com"] },
  { key: "google-translate", name: "Google Traduction", icon: siGoogletranslate, match: ["translate.google.com", "translate.google.fr"] },

  // Communication
  { key: "discord", name: "Discord", icon: siDiscord, match: ["discord.com", "discord.gg", "discordapp.com"] },
  { key: "zoom", name: "Zoom", icon: siZoom, match: ["zoom.us", "zoom.com"] },
  { key: "loom", name: "Loom", icon: siLoom, match: ["loom.com"] },
  { key: "whatsapp", name: "WhatsApp", icon: siWhatsapp, match: ["whatsapp.com", "wa.me"] },
  { key: "telegram", name: "Telegram", icon: siTelegram, match: ["telegram.org", "telegram.me", "t.me"] },

  // Stockage et transfert
  { key: "dropbox", name: "Dropbox", icon: siDropbox, match: ["dropbox.com", "db.tt"] },
  { key: "wetransfer", name: "WeTransfer", icon: siWetransfer, match: ["wetransfer.com", "we.tl"] },

  // Médias et réseaux
  { key: "youtube", name: "YouTube", icon: siYoutube, match: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { key: "vimeo", name: "Vimeo", icon: siVimeo, match: ["vimeo.com"] },
  { key: "twitch", name: "Twitch", icon: siTwitch, match: ["twitch.tv"] },
  { key: "spotify", name: "Spotify", icon: siSpotify, match: ["spotify.com", "spotify.link"] },
  { key: "instagram", name: "Instagram", icon: siInstagram, match: ["instagram.com"] },
  { key: "x", name: "X", icon: siX, match: ["x.com", "twitter.com", "t.co"] },
  { key: "bluesky", name: "Bluesky", icon: siBluesky, match: ["bsky.app"] },
  { key: "threads", name: "Threads", icon: siThreads, match: ["threads.net", "threads.com"] },
  { key: "mastodon", name: "Mastodon", icon: siMastodon, match: ["mastodon.social", "joinmastodon.org"] },
  { key: "facebook", name: "Facebook", icon: siFacebook, match: ["facebook.com", "fb.com", "fb.me"] },
  { key: "tiktok", name: "TikTok", icon: siTiktok, match: ["tiktok.com"] },
  { key: "reddit", name: "Reddit", icon: siReddit, match: ["reddit.com", "redd.it"] },
  { key: "medium", name: "Medium", icon: siMedium, match: ["medium.com"] },
  { key: "substack", name: "Substack", icon: siSubstack, match: ["substack.com"] },
  { key: "pinterest", name: "Pinterest", icon: siPinterest, match: ["pinterest.com", "pinterest.fr", "pin.it"] },

  // IA
  { key: "claude", name: "Claude", icon: siClaude, match: ["claude.ai", "claude.com"] },
  { key: "gemini", name: "Gemini", icon: siGooglegemini, match: ["gemini.google.com"] },
  { key: "mistral", name: "Mistral AI", icon: siMistralai, match: ["mistral.ai"] },
  { key: "perplexity", name: "Perplexity", icon: siPerplexity, match: ["perplexity.ai"] },
  { key: "deepl", name: "DeepL", icon: siDeepl, match: ["deepl.com"] },

  // Divers
  { key: "wikipedia", name: "Wikipédia", icon: siWikipedia, match: ["wikipedia.org"] },
  { key: "wordpress", name: "WordPress", icon: siWordpress, match: ["wordpress.com", "wordpress.org"] },
  { key: "webflow", name: "Webflow", icon: siWebflow, match: ["webflow.com", "webflow.io"] },
  { key: "shopify", name: "Shopify", icon: siShopify, match: ["shopify.com", "myshopify.com"] },
  { key: "stripe", name: "Stripe", icon: siStripe, match: ["stripe.com"] },
];
