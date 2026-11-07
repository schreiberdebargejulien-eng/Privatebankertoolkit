# CLAUDE.md

Consignes de travail sur Private Banker Toolkit : application PWA (React 18, TypeScript strict, Vite, Tailwind) de simulateurs financiers, fiscaux et patrimoniaux pour la banque privée. Calculs 100 % locaux, aucun appel réseau.

L’architecture, les conventions financières et les limites connues sont décrites dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : la lire avant toute modification du moteur.

## Commandes

```bash
npm ci                 # installer les dépendances
npm run dev            # serveur de développement
npx tsc -b --noEmit    # typage (strict, noUnusedLocals / noUnusedParameters)
npm test               # tests Vitest
npm run build          # build de production + service worker (dist/)
npm run preview        # servir dist/ (port 4173, routes en hash : /#/sim/<id>)
```

Avant chaque commit : typage, tests et build doivent passer. Le déploiement GitHub Pages (`.github/workflows/deploy.yml`) relance `npm test` et `npm run build` à chaque push sur `main`.

## Règles du projet

- **Moteur pur** : `src/engine/` n’importe jamais React ni le DOM. Chaque fonction `calculateX(input)` valide son entrée avec Zod (`validate`), lève `ValidationError` pour une saisie invalide et retourne un objet détaillé. Tout nouvel export passe par `src/engine/index.ts`.
- **Aucun taux codé en dur** : tous les paramètres fiscaux et réglementaires vivent dans `src/engine/tax/fr/rules.ts`, versionnés (`Versioned<T>`, date d’effet, sources, date de vérification, statut `official` / `cross-checked` / `to-confirm`). Un nouveau barème est ajouté à `ALL_RULES` et son identifiant renvoyé dans `report.rules`.
- **Un seul modèle de rapport** : le `Report` retourné par `compute` alimente l’écran, la copie texte et le PDF. Ne pas créer de contenu propre au PDF hors de ce modèle (utiliser `pdfOnly` sur une table si besoin).
- **Confidentialité** : pas de réseau (CSP `connect-src 'self'`), pas de persistance automatique des saisies ; les champs texte libres sont exclus des liens partagés.
- **Langue** : interface, messages d’erreur, commentaires et messages de commit en français.

## Ajouter ou modifier un simulateur

1. Métadonnées dans `src/simulators/catalog.ts` (id unique, catégories, sections, mots-clés sans accents).
2. Fiche dans `src/simulators/defs/*.tsx` via `defineSim(id, { … })`, puis ajout au tableau exporté du fichier (`financeSims`, `creditSims`…) repris par `registry.ts`.
3. Pages de navigation à mettre à jour si besoin : `src/pages/Browse.tsx`, `src/pages/Home.tsx`.
4. Tests : `src/simulators/registry.test.ts` exécute automatiquement chaque fiche avec ses valeurs par défaut (et sous chaque régime fiscal si elle en a un) ; ajouter des tests de référence du moteur dans `src/engine/__tests__/`, avec des valeurs posées à la main ou issues d’Excel.
5. Renommer ou fusionner un simulateur : ajouter l’ancien id dans `SIM_ALIASES` (`catalog.ts`) pour ne pas casser favoris, historiques et liens partagés.

## Option fiscalité des placements

Tout simulateur de placement utilise les helpers communs de `src/simulators/helpers.tsx` :

- `taxFields({ pea?, timing?, custom?, group? })` pour les champs (régime, TMI, taux d’IS, ancienneté du PEA, taux personnalisé, moment d’imposition) ;
- `taxDefaults(regime)` pour les valeurs par défaut ;
- `resolveTax(values, holdingYears)` pour obtenir taux, mode (`none` / `exit` / `annual`), libellé, note et barèmes.

Le calcul du taux est dans `src/engine/tax/fr/investmentTax.ts` (PFU, barème avec CSG déductible, PEA selon l’ancienneté, IS 25 % / 15 %). Ne pas recalculer un taux à la main dans une fiche. Exclure le PEA (`pea: false`) pour les supports non éligibles (CAT, obligations, revenus distribués).

## Pièges connus

- **Valeurs par défaut** : chaque champ déclaré dans `fields` doit avoir une clé dans `defaults`, sinon `registry.test.ts` échoue.
- **Ordre de déclaration** : les `fields` d’une fiche sont évalués au chargement du module. Une constante (`const`) utilisée par une fonction appelée dans `fields` doit être déclarée **avant** la fiche, sinon erreur de zone morte temporelle au démarrage — que `tsc` ne détecte pas.
- **PDF** (`src/lib/pdf.ts`) : tout texte passe par `pdfSafe` (polices standard WinAnsi : espaces fines, `−`, `≥`, `→`… remplacés). Les largeurs de colonnes sont communes aux tableaux de même en-tête ; garder des colonnes cohérentes et renseigner `align` pour les colonnes texte.
- **Formatage** : utiliser `money`, `pct`, `num`, `dateFR` de `src/lib/format.ts` (locale fr-FR), jamais `toFixed` dans l’interface.
- **Dates** : manipulées en UTC au format ISO via `src/engine/core/dates.ts`.
- **Montants fiscaux** : estimations ; les fiches fiscales portent `fiscal: true` pour afficher la mention adaptée.
- `tsconfig.tsbuildinfo` est suivi par git : ne pas committer ses modifications locales (`git checkout tsconfig.tsbuildinfo`).

## Mode développeur

Commentaires de test localisés (`src/components/dev/DevMode.tsx`, logique dans `src/lib/devComments.ts`), activés par Paramètres › Phase de test ou `#/?dev=1`. Les emplacements s’appuient sur les attributs `data-dev-field` (champs) et `data-dev-label` (blocs) : les conserver lors d’une refonte des composants et en ajouter sur les nouveaux blocs. Voir `docs/ARCHITECTURE.md`.

## Vérification visuelle

Chromium et Playwright sont disponibles. Après `npm run build && npm run preview`, ouvrir `http://localhost:4173/#/sim/<id>` pour contrôler l’écran, et déclencher « Export PDF » pour vérifier l’alignement des tableaux exportés.
