# Architecture

## Stack
React 18 · TypeScript strict · Vite 5 · Tailwind CSS 3 · Recharts · Lucide · Zod · Vitest · vite-plugin-pwa (Workbox) · jsPDF (export PDF local).

Composants UI écrits dans l’esprit shadcn/ui (primitives Tailwind locales, sans dépendance Radix) pour garder un bundle léger et un contrôle total du rendu iOS.

## Arborescence

```
src/
  engine/                 Moteur de calcul — pur TypeScript, aucune dépendance UI
    core/                 errors (ValidationError, safeCalc), math (arrondis, barèmes), dates (UTC, 30/360), solver (Newton + bissection)
    finance/              investment (capitalisation commune), xirr (+CAGR, actualisation), netYield (+comparateur)
    tax/
      types.ts            Métadonnées de règle : juridiction, date d’effet, sources, date de vérification, statut
      fr/rules.ts         TOUS les paramètres fiscaux français, versionnés
      fr/*.ts             ir, ifi, assuranceVie, per, dmtg (donation, démembrement), succession
    credit/               loans (amortissable, capacité, in fine), lombard (+ nantissement)
    bonds/                bond (prix/rendement, coupon couru, duration, convexité)
    structured/           moteur de payoff paramétrique (Autocall, Phoenix, Reverse convertible)
    wealth/               projection, allocation, rente, revenus, capitalisation vs distribution
    __tests__/            tests de référence indépendants
  simulators/
    catalog.ts            métadonnées + recherche universelle (chargé au démarrage)
    defs/*.tsx            fiches : champs déclaratifs, valeurs par défaut, compute → Report (chargé à la demande)
    types.ts              contrat SimulatorDef / FieldDef / Report
  components/
    sim/                  SimulatorPage générique, rendu des résultats, champs
    ui/, layout/, charts  primitives, navigation inférieure, graphiques
  lib/                    format (fr-FR), settings, storage (backend remplaçable), store (favoris, historique, scénarios), report (copie), pdf, share
  pages/                  Accueil, Calculateurs, Catégorie, Investissements, Patrimoine, Favoris, Paramètres, Sources
```

## Principes
1. **Séparation stricte** : `engine/` n’importe jamais React. Chaque fonction `calculateX(input)` valide son entrée avec Zod, lève `ValidationError` / `CalculationError`, et retourne un objet détaillé.
2. **Un seul modèle de rapport** (`Report`) alimente l’écran, la copie texte et le PDF : ce qui est affiché est exactement ce qui est exporté.
3. **Barèmes versionnés** (`tax/fr/rules.ts`) : `pickVersion(versions, date, id)` choisit la règle en vigueur ; chaque résultat fiscal référence l’identifiant de règle utilisé, affiché avec ses sources et sa date de vérification. Ajout d’une juridiction : nouveau dossier `tax/<pays>/` respectant `Versioned<T>`.
4. **Confidentialité** : pas de réseau (CSP `connect-src 'self'`), pas de persistance automatique des saisies ; scénarios enregistrés uniquement sur action explicite, suppressibles un par un ou en bloc. `lib/storage.ts` expose `setStorageBackend()` pour brancher ultérieurement un stockage chiffré (WebCrypto + IndexedDB) derrière une authentification.
5. **Partage** : les valeurs sont encodées dans le fragment d’URL (`#…?s=`), jamais transmis au serveur ; les champs texte libres sont exclus.

## Conventions financières
| Sujet | Convention |
|---|---|
| Taux | décimaux ; annuels. Capitalisation : taux équivalent actuariel `(1+r)^(1/f)−1`. Crédits : taux proportionnel `r/12` (pratique française). |
| TRI | base exact/365 depuis le premier flux (identique à TRI.PAIEMENTS d’Excel). |
| Obligations | convention « street » d’Excel PRICE/YIELD ; ACT/ACT ICMA, ACT/365, ACT/360, 30/360 US. |
| Arrondis | calcul en pleine précision ; arrondi à l’euro des impôts (art. 1657 CGI) ; arrondi à l’affichage sinon. |
| Dates | UTC, format ISO ; ajout de mois avec conservation de la fin de mois. |
| Structurés | niveaux en % du niveau initial ; paiement à la date d’observation ; barrière américaine approchée aux dates d’observation. |

## Tests
`npm test` : 142 tests dont références externes (Excel XIRR, PRICE, YIELD), calculs fiscaux posés à la main (IR avec décote et plafonnement QF, IFI avec décote et limitation des dettes, droits de donation avec rappel fiscal, succession, assurance-vie avant/après 2017 et seuil de 150 000 €), et un test de non-régression qui exécute chaque fiche avec ses valeurs par défaut.

## Limites connues (signalées dans l’application)
- **IR** : revenu net imposable saisi directement ; réductions/crédits d’impôt, CDHR, lissage de la CEHR, réduction complémentaire des veufs non modélisés.
- **Assurance-vie** : ventilation des produits avant/après 27/09/2017 au prorata des primes ; option barème approximée au TMI.
- **PER** : plafond estimé hors reliquats N-3 et mutualisation ; sortie imposée au TMI saisi ; taux de conversion en rente fourni par l’utilisateur.
- **Succession** : dévolution légale uniquement (pas de testament, donation au dernier vivant, assurance-vie hors succession, représentation, ascendants ordinaires).
- **IFI** : abattement annuel des prêts in fine et réductions IFI-dons non modélisés.
- **Structurés** : pas de valorisation de marché (pas de modèle stochastique), ni risque émetteur, frais ou fiscalité.
- **Entreprise et dirigeants** : arbitrage rémunération/dividendes, Dutreil, 150-0 B ter non développés — ils nécessitent un moteur de cotisations sociales fiable.
- Barème IR 2026 et taux de PS 2026 : statut « recoupé » (sources secondaires + BOFiP) à confirmer sur la brochure officielle.
