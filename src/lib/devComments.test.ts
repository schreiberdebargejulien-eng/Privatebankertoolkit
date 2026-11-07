import { describe, expect, it } from 'vitest';
import {
  buildSelector, cleanRoute, commentsToJSON, commentsToMarkdown, describeElement, deviceLabel, mergeComments, parseCommentsJSON,
  type DevComment, type ElLike,
} from './devComments';

/** Élément simulé : balise, attributs, texte propre et enfants. */
function el(tagName: string, attrs: Record<string, string> = {}, children: (ElLike | string)[] = []): ElLike {
  const node: ElLike = {
    tagName: tagName.toUpperCase(),
    id: attrs.id ?? '',
    parentElement: null,
    children: [],
    get textContent() { return children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); },
    getAttribute: (n) => attrs[n] ?? null,
  };
  const kids = children.filter((c): c is ElLike => typeof c !== 'string');
  kids.forEach((k) => { k.parentElement = node; });
  node.children = kids;
  return node;
}

/** Arborescence proche d'une fiche : section nommée › carte titrée › champ › saisie. */
function simTree() {
  const input = el('input', { 'aria-label': 'Taux annuel' });
  const field = el('div', { 'data-dev-field': 'Taux annuel' }, [el('label', {}, ['Taux annuel']), input]);
  const other = el('div', {}, [el('label', {}, ['Durée'])]);
  const card = el('div', {}, [el('div', {}, [el('div', {}, [el('h3', {}, ['Versements'])])]), el('div', {}, [other, field])]);
  const section = el('section', { 'aria-label': 'Paramètres de la simulation' }, [card]);
  const root = el('div', { id: 'root' }, [el('main', {}, [section])]);
  return { root, input, field, other };
}

describe('describeElement', () => {
  it('décrit section, carte, champ et contrôle visé', () => {
    const { input } = simTree();
    expect(describeElement(input)).toEqual(['Paramètres de la simulation', '« Versements »', 'Champ « Taux annuel »']);
  });

  it('utilise data-dev-label et le texte cliqué hors contrôle', () => {
    const value = el('span', {}, ['12 345 €']);
    const card = el('div', { 'data-dev-label': 'Résultat principal' }, [value]);
    el('section', { 'aria-label': 'Résultats' }, [card]);
    expect(describeElement(value)).toEqual(['Résultats', 'Résultat principal', '« 12 345 € »']);
  });

  it('nomme un bouton par son libellé', () => {
    const btn = el('button', {}, [el('span', {}, ['Export PDF'])]);
    el('div', {}, [btn]);
    expect(describeElement(btn.children[0])).toEqual(['Bouton « Export PDF »']);
  });
});

describe('describeElement — conteneurs', () => {
  it('nomme une carte cliquée par son titre, sans recopier tout son texte', () => {
    const card = el('div', {}, [el('div', {}, [el('div', {}, [el('h3', {}, ['Classes d’actifs'])])]), el('div', {}, ['Montant', '€'])]);
    el('section', { 'aria-label': 'Paramètres de la simulation' }, [card]);
    expect(describeElement(card)).toEqual(['Paramètres de la simulation', '« Classes d’actifs »']);
  });
  it('utilise la première ligne du texte rendu', () => {
    const tile = el('a', {}, ['Produits structurés', 'Autocall, Phoenix']);
    (tile as { innerText?: string }).innerText = 'Produits structurés\nAutocall, Phoenix';
    el('div', {}, [tile]);
    expect(describeElement(tile)).toEqual(['Lien « Produits structurés Autocall, Phoenix »']);
    const div = el('div', {}, ['Produits structurés', 'Autocall']);
    (div as { innerText?: string }).innerText = 'Produits structurés\nAutocall';
    el('div', {}, [div]);
    expect(describeElement(div)).toEqual(['« Produits structurés »']);
  });
});

describe('buildSelector', () => {
  it('s’arrête sur un identifiant et privilégie les repères data-dev', () => {
    const { input } = simTree();
    expect(buildSelector(input)).toBe('#root > main > section[aria-label="Paramètres de la simulation"] > div > div:nth-of-type(2) > div[data-dev-field="Taux annuel"] > input');
  });
  it('raccourcit le sélecteur dès qu’il est unique', () => {
    const { input } = simTree();
    expect(buildSelector(input, (s) => s.startsWith('div[data-dev-field'))).toBe('div[data-dev-field="Taux annuel"] > input');
  });
});

describe('utilitaires', () => {
  it('retire les valeurs saisies de la route', () => {
    expect(cleanRoute('/sim/capitalisation', '?s=abc&scenario=1&tab=2')).toBe('/sim/capitalisation?tab=2');
    expect(cleanRoute('/', '?dev=1')).toBe('/');
  });
  it('déduit le format d’écran', () => {
    expect(deviceLabel(390)).toBe('Téléphone');
    expect(deviceLabel(800)).toBe('Tablette');
    expect(deviceLabel(1440)).toBe('Ordinateur');
  });
});

const base = (p: Partial<DevComment> = {}): DevComment => ({
  id: 'a', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, author: 'Testeur', kind: 'bug', status: 'open', text: 'Libellé tronqué\nsur mobile',
  anchor: { route: '/sim/capitalisation', pageTitle: 'Capitalisation', simId: 'capitalisation', path: ['Résultats', 'Résultat principal'], selector: '#results', device: 'Téléphone', viewport: { w: 390, h: 844 }, theme: 'light' },
  appVersion: '1.0.0', ...p,
});

describe('export et import', () => {
  it('produit un Markdown groupé par page', () => {
    const md = commentsToMarkdown([base(), base({ id: 'b', kind: 'suggestion', status: 'resolved', anchor: { ...base().anchor, path: [] } })]);
    expect(md).toContain('## Capitalisation — `#/sim/capitalisation`');
    expect(md).toContain('### [Anomalie] Résultats › Résultat principal');
    expect(md).toContain('### [Suggestion] ✓ résolu Page entière');
    expect(md).toContain('> Libellé tronqué\n> sur mobile');
    expect(md).toContain('2 commentaire(s), dont 1 ouvert(s).');
  });

  it('relit son propre export JSON et rejette un fichier étranger', () => {
    const list = [base(), base({ id: 'b' })];
    expect(parseCommentsJSON(commentsToJSON(list))).toEqual(list);
    expect(() => parseCommentsJSON('{"foo":1}')).toThrow(/non reconnu/);
    expect(() => parseCommentsJSON('pas du json')).toThrow(/illisible/);
  });

  it('fusionne en gardant la version la plus récente', () => {
    const cur = [base(), base({ id: 'b', text: 'ancien' })];
    const inc = [base({ id: 'b', text: 'nouveau', updatedAt: 1_800_000_000_000 }), base({ id: 'c', createdAt: 1_800_000_000_000 }), base({ text: 'plus ancien', updatedAt: 1 })];
    const { merged, added, updated } = mergeComments(cur, inc);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(merged.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(merged.find((c) => c.id === 'b')?.text).toBe('nouveau');
    expect(merged.find((c) => c.id === 'a')?.text).toBe('Libellé tronqué\nsur mobile');
  });
});
