/**
 * Mode développeur (phase de test) : commentaires rattachés à un emplacement précis de l'interface.
 *
 * Chaque commentaire mémorise où se trouvait l'utilisateur :
 *  - la route (`/sim/<id>`, `/parametres`…) et le titre de la page ;
 *  - un fil d'Ariane lisible de l'élément visé (section, carte, champ, bouton…) ;
 *  - un sélecteur CSS pour retrouver l'élément et y replacer un repère ;
 *  - le contexte d'affichage (format d'écran, thème, version).
 *
 * Les commentaires restent sur l'appareil (aucun réseau) ; ils se transmettent par export
 * Markdown ou JSON et se fusionnent par import. Ce module ne dépend pas de React : les fonctions
 * de description opèrent sur une interface minimale d'élément (`ElLike`) pour être testables.
 */
import { z } from 'zod';

export type DevCommentKind = 'bug' | 'suggestion' | 'question' | 'texte';
export type DevCommentStatus = 'open' | 'resolved';

export const KIND_LABELS: Record<DevCommentKind, string> = {
  bug: 'Anomalie',
  suggestion: 'Suggestion',
  question: 'Question',
  texte: 'Libellé / texte',
};

export interface DevAnchor {
  /** Route de l'application (partie après `#`), sans paramètres de saisie. */
  route: string;
  /** Titre principal de la page (h1). */
  pageTitle: string;
  /** Identifiant du simulateur ouvert, le cas échéant. */
  simId?: string;
  /** Fil d'Ariane lisible, du plus large au plus précis. Vide = commentaire sur la page entière. */
  path: string[];
  /** Sélecteur CSS de l'élément visé (absent pour un commentaire de page). */
  selector?: string;
  /** Position du clic dans l'élément, en fraction de sa largeur et de sa hauteur. */
  offset?: { x: number; y: number };
  /** Format d'écran au moment du commentaire. */
  device: string;
  viewport: { w: number; h: number };
  theme: 'light' | 'dark';
}

export interface DevComment {
  id: string;
  createdAt: number;
  updatedAt: number;
  author: string;
  kind: DevCommentKind;
  status: DevCommentStatus;
  text: string;
  anchor: DevAnchor;
  appVersion: string;
  /** Lien reproduisant la simulation (valeurs saisies hors champs texte), joint sur demande. */
  replayLink?: string;
}

/* ------------------------------ Description d'un élément ------------------------------ */

/** Sous-ensemble de `Element` utilisé ici (compatible DOM, simulable dans les tests). */
export interface ElLike {
  tagName: string;
  id: string;
  parentElement: ElLike | null;
  children: ArrayLike<ElLike>;
  textContent: string | null;
  getAttribute(name: string): string | null;
}

const clean = (s: string | null | undefined, max = 60) => {
  const t = (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

const tag = (el: ElLike) => el.tagName.toLowerCase();
const isRoot = (el: ElLike) => ['body', 'html'].includes(tag(el)) || el.id === 'root';

/** Titre (h1–h3) placé en tête d'un conteneur : on ne suit que le premier enfant, sur trois niveaux. */
function leadingHeading(el: ElLike, depth = 3): string | null {
  let cur: ElLike | undefined = el.children[0];
  for (let d = 0; d < depth && cur; d++) {
    if (/^h[1-3]$/.test(tag(cur))) return clean(cur.textContent);
    cur = cur.children[0];
  }
  return null;
}

const INTERACTIVE: Record<string, string> = { button: 'Bouton', a: 'Lien', input: 'Champ', select: 'Liste', textarea: 'Zone de texte', label: 'Libellé' };

/** Nom accessible approché d'un élément interactif. */
function accessibleName(el: ElLike): string {
  return clean(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder'), 50);
}

/**
 * Fil d'Ariane lisible de l'élément : sections nommées (`aria-label`), repères explicites
 * (`data-dev-label`), cartes titrées, champ de formulaire (`data-dev-field`), puis l'élément lui-même.
 */
export function describeElement(target: ElLike): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => { const t = clean(s); if (t && out[out.length - 1] !== t && !out.includes(t)) out.push(t); };

  // Élément visé : le contrôle interactif le plus proche, sinon le texte cliqué.
  let leaf: string | null = null;
  let unnamed = false;
  for (let cur: ElLike | null = target; cur && !isRoot(cur); cur = cur.parentElement) {
    const role = cur.getAttribute('role');
    const kind = INTERACTIVE[tag(cur)] ?? (role === 'radio' || role === 'switch' || role === 'tab' ? 'Option' : null);
    if (kind) { const n = accessibleName(cur); leaf = n ? `${kind} « ${n} »` : kind; unnamed = !n; break; }
  }
  if (!leaf) { const t = clean(target.textContent, 50); leaf = t ? `« ${t} »` : `Zone <${tag(target)}>`; }

  const levels: string[] = [];
  for (let cur: ElLike | null = target; cur && !isRoot(cur); cur = cur.parentElement) {
    const field = cur.getAttribute('data-dev-field');
    const label = cur.getAttribute('data-dev-label');
    const aria = tag(cur) === 'section' || tag(cur) === 'nav' || tag(cur) === 'aside' || cur.getAttribute('role') === 'dialog' ? cur.getAttribute('aria-label') : null;
    const heading = cur !== target ? leadingHeading(cur) : null;
    if (field) levels.push(`Champ « ${clean(field)} »`);
    else if (label) levels.push(label);
    else if (aria) levels.push(aria);
    else if (heading) levels.push(`« ${heading} »`);
  }
  for (const l of levels.reverse()) push(l);
  // Un contrôle sans nom (saisie d'un champ déjà nommé) n'apporte rien au fil d'Ariane.
  if (!(unnamed && out.length)) push(leaf);
  return out;
}

/**
 * Sélecteur CSS stable autant que possible : identifiant, repères `data-dev-*`, sinon position.
 * `isUnique` (facultatif) arrête la remontée dès que le sélecteur désigne un seul élément.
 */
export function buildSelector(target: ElLike, isUnique?: (selector: string) => boolean, maxDepth = 12): string {
  const parts: string[] = [];
  let cur: ElLike | null = target;
  for (let d = 0; cur && d < maxDepth; d++) {
    if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) { parts.unshift(`#${cur.id}`); break; }
    const t = tag(cur);
    if (t === 'body' || t === 'html') break;
    const parent: ElLike | null = cur.parentElement;
    let part = t;
    const field = cur.getAttribute('data-dev-field');
    const label = cur.getAttribute('data-dev-label');
    const aria = cur.getAttribute('aria-label');
    if (field) part += `[data-dev-field=${JSON.stringify(field)}]`;
    else if (label) part += `[data-dev-label=${JSON.stringify(label)}]`;
    else if (aria && t === 'section') part += `[aria-label=${JSON.stringify(aria)}]`;
    if (parent && part === t) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    if (isUnique && (field || label || aria) && isUnique(parts.join(' > '))) break;
    cur = parent;
  }
  return parts.join(' > ');
}

/** Libellé du format d'écran, aligné sur les points de rupture de la mise en page. */
export function deviceLabel(width: number): string {
  if (width < 768) return 'Téléphone';
  if (width < 1024) return 'Tablette';
  return 'Ordinateur';
}

/** Route sans les paramètres de saisie (`s`, `scenario`), qui ne doivent pas figurer dans le commentaire. */
export function cleanRoute(pathname: string, search = ''): string {
  const p = new URLSearchParams(search);
  p.delete('s'); p.delete('scenario'); p.delete('dev');
  const q = p.toString();
  return pathname + (q ? `?${q}` : '');
}

/* ------------------------------ Contexte du simulateur ouvert ------------------------------ */

/** Le simulateur ouvert publie ici un lien de reproduction (valeurs hors champs texte). */
let simContext: { simId: string; replayLink: string } | null = null;
export function setDevSimContext(ctx: { simId: string; replayLink: string } | null) { simContext = ctx; }
export function getDevSimContext() { return simContext; }

/* ------------------------------ Export et import ------------------------------ */

const fmtDate = (ts: number) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Export lisible (Markdown), groupé par page, pour un ticket ou un message. */
export function commentsToMarkdown(comments: DevComment[]): string {
  if (!comments.length) return '# Commentaires de test\n\nAucun commentaire.';
  const byRoute = new Map<string, DevComment[]>();
  for (const c of [...comments].sort((a, b) => a.createdAt - b.createdAt)) {
    const k = c.anchor.route;
    byRoute.set(k, [...(byRoute.get(k) ?? []), c]);
  }
  const open = comments.filter((c) => c.status === 'open').length;
  const lines = [`# Commentaires de test`, '', `${comments.length} commentaire(s), dont ${open} ouvert(s).`, ''];
  for (const [route, list] of byRoute) {
    lines.push(`## ${list[0].anchor.pageTitle || route} — \`#${route}\``, '');
    for (const c of list) {
      const where = c.anchor.path.length ? c.anchor.path.join(' › ') : 'Page entière';
      lines.push(`### [${KIND_LABELS[c.kind]}]${c.status === 'resolved' ? ' ✓ résolu' : ''} ${where}`);
      lines.push('');
      lines.push(...c.text.split('\n').map((l) => `> ${l}`));
      lines.push('');
      lines.push(`- Auteur : ${c.author || 'anonyme'} · ${fmtDate(c.createdAt)}`);
      lines.push(`- Écran : ${c.anchor.device} ${c.anchor.viewport.w}×${c.anchor.viewport.h} · thème ${c.anchor.theme === 'dark' ? 'sombre' : 'clair'} · v${c.appVersion}`);
      if (c.anchor.selector) lines.push(`- Sélecteur : \`${c.anchor.selector}\``);
      if (c.replayLink) lines.push(`- Reproduire : ${c.replayLink}`);
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

const anchorSchema = z.object({
  route: z.string().max(500),
  pageTitle: z.string().max(200),
  simId: z.string().max(100).optional(),
  path: z.array(z.string().max(200)).max(30),
  selector: z.string().max(2000).optional(),
  offset: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  device: z.string().max(40),
  viewport: z.object({ w: z.number(), h: z.number() }),
  theme: z.enum(['light', 'dark']),
});
const commentSchema = z.object({
  id: z.string().min(1).max(100),
  createdAt: z.number(),
  updatedAt: z.number(),
  author: z.string().max(80),
  kind: z.enum(['bug', 'suggestion', 'question', 'texte']),
  status: z.enum(['open', 'resolved']),
  text: z.string().max(5000),
  anchor: anchorSchema,
  appVersion: z.string().max(40),
  replayLink: z.string().max(20000).optional(),
});
const exportSchema = z.object({ format: z.literal('pbt-dev-comments'), version: z.literal(1), comments: z.array(commentSchema) });

export function commentsToJSON(comments: DevComment[]): string {
  return JSON.stringify({ format: 'pbt-dev-comments', version: 1, exportedAt: new Date().toISOString(), comments }, null, 2);
}

/** Lit un export JSON ; lève une erreur explicite si le fichier n'est pas reconnu. */
export function parseCommentsJSON(raw: string): DevComment[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('Fichier illisible : JSON invalide.'); }
  const r = exportSchema.safeParse(data);
  if (!r.success) throw new Error('Fichier non reconnu : export de commentaires attendu.');
  return r.data.comments;
}

/** Fusionne deux listes par identifiant, en gardant la version la plus récente de chaque commentaire. */
export function mergeComments(current: DevComment[], incoming: DevComment[]): { merged: DevComment[]; added: number; updated: number } {
  const map = new Map(current.map((c) => [c.id, c]));
  let added = 0, updated = 0;
  for (const c of incoming) {
    const prev = map.get(c.id);
    if (!prev) { map.set(c.id, c); added++; }
    else if (c.updatedAt > prev.updatedAt) { map.set(c.id, c); updated++; }
  }
  return { merged: [...map.values()].sort((a, b) => b.createdAt - a.createdAt), added, updated };
}
