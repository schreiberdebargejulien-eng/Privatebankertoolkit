# Private Banker Toolkit

Application **PWA mobile-first** (iPhone en priorité) regroupant 28 simulateurs financiers, fiscaux, patrimoniaux et d’investissement pour la banque privée. Les calculs s’exécutent **intégralement sur l’appareil** : aucun serveur, aucun traceur, fonctionnement hors ligne.

## Démarrage

```bash
npm install
npm run dev        # développement
npm test           # 142 tests unitaires (Vitest)
npm run build      # build de production + service worker (dist/)
npm run preview    # servir le build localement
```

**Installation sur iPhone** : déployer `dist/` sur un hébergement statique HTTPS, ouvrir l’URL dans Safari → Partager → « Sur l’écran d’accueil ». L’application fonctionne ensuite hors connexion.

## Simulateurs

| Domaine | Simulateurs |
|---|---|
| Calculs financiers | Intérêts composés · TRI/XIRR · CAGR · Rendement net · Actualisation · Comparateur de placements |
| Fiscalité française | IR (QF, plafonnement, décote, CEHR) · IFI · Rachat assurance-vie · PER · Donation · Succession · Démembrement (art. 669) |
| Financement | Crédit amortissable (TAEG, tableau) · Capacité d’emprunt · In fine · Lombard (stress −10 à −40 %) · Nantissement |
| Obligations & structurés | Calculateur obligataire (YTM, coupon couru, duration) · Autocall · Phoenix · Reverse convertible · Scénarios personnalisés |
| Patrimoine | Projection 10/20/30 ans · Allocation d’actifs · Rente / retraits · Revenus complémentaires · Capitalisation vs distribution |

Chaque fiche : description, formulaire tactile avec valeurs par défaut, résultat principal, résultats secondaires, graphique, tableau détaillé, hypothèses, points d’attention, barèmes et sources, méthode et formules, exemple — et les actions Copier / Export PDF / Partager / Enregistrer / Réinitialiser.

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour l’architecture, les conventions financières et les limites connues.

> Les résultats fiscaux sont des **estimations** et ne constituent pas un avis fiscal ou juridique. Les résultats d’investissement ne sont **pas des garanties de performance**.
