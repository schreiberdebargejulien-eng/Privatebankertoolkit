import {
  Activity, Banknote, Building2, CalendarClock, Calculator, Coins, Gift, GitCompare, Home, Landmark,
  Layers, LineChart, Lock, PiggyBank, PieChart, Percent, Repeat, Scale, ScrollText, Shield, Sparkles, Split, TrendingUp, Users,
  Wallet, Briefcase, Hourglass, type LucideIcon,
} from 'lucide-react';
import type { CategoryId, SectionId } from './types';
import { normalize } from '@/lib/format';

export interface SimMeta {
  id: string;
  title: string;
  short: string;
  categories: CategoryId[];
  sections: SectionId[];
  keywords: string[];
  icon: LucideIcon;
}

export const CATEGORIES: { id: CategoryId; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'finance', label: 'Calculs financiers', description: 'Capitalisation, TRI, CAGR, actualisation', icon: Calculator },
  { id: 'fiscalite', label: 'Fiscalité', description: 'IR, IFI, prélèvements, plus-values', icon: Percent },
  { id: 'assurance-vie', label: 'Assurance-vie', description: 'Rachats, fiscalité, comparaison', icon: Shield },
  { id: 'retraite', label: 'Retraite', description: 'PER, rente, revenus complémentaires', icon: Hourglass },
  { id: 'transmission', label: 'Succession et donation', description: 'Droits, abattements, démembrement', icon: Gift },
  { id: 'credit', label: 'Crédit et financement', description: 'Amortissable, in fine, lombard', icon: Landmark },
  { id: 'structures', label: 'Produits structurés', description: 'Autocall, Phoenix, reverse convertible, capital protégé', icon: Sparkles },
  { id: 'obligations', label: 'Obligations', description: 'Rendement actuariel, coupon couru, duration', icon: ScrollText },
  { id: 'allocation', label: 'Allocation d’actifs', description: 'Répartition, capitalisation vs distribution', icon: PieChart },
  { id: 'immobilier', label: 'Immobilier', description: 'Financement, frais de garantie, IFI, démembrement', icon: Building2 },
  { id: 'entreprise', label: 'Entreprise et dirigeants', description: 'Épargne retraite, levier, nantissement', icon: Briefcase },
];

export const SIMULATORS: SimMeta[] = [
  // A. Calculs financiers
  { id: 'compound', title: 'Intérêts composés', short: 'Capital final, intérêts et performance', categories: ['finance'], sections: ['calculators'], keywords: ['capitalisation', 'interets', 'epargne', 'versements', 'composes'], icon: TrendingUp },
  { id: 'xirr', title: 'TRI / XIRR', short: 'Rendement interne de flux datés irréguliers', categories: ['finance', 'allocation'], sections: ['calculators', 'investments'], keywords: ['tri', 'xirr', 'irr', 'taux de rendement interne', 'flux', 'private equity', 'multiple'], icon: Activity },
  { id: 'cagr', title: 'CAGR', short: 'Performance annualisée entre deux valeurs', categories: ['finance'], sections: ['calculators'], keywords: ['cagr', 'performance annualisee', 'taux de croissance'], icon: LineChart },
  { id: 'net-yield', title: 'Rendement net', short: 'Rendement après frais et fiscalité', categories: ['finance', 'assurance-vie'], sections: ['calculators', 'investments'], keywords: ['rendement net', 'frais', 'fiscalite', 'pfu', 'flat tax'], icon: Percent },
  { id: 'discount', title: 'Actualisation', short: 'Valeur actuelle d’un montant futur', categories: ['finance'], sections: ['calculators'], keywords: ['actualisation', 'valeur actuelle', 'va', 'pv', 'discount'], icon: CalendarClock },
  { id: 'cat', title: 'Compte à terme', short: 'Intérêts, TRI brut et net, fiscalité particulier ou IS', categories: ['finance', 'entreprise'], sections: ['calculators', 'investments'], keywords: ['cat', 'compte a terme', 'depot a terme', 'dat', 'tresorerie', 'is', 'societe'], icon: Coins },
  { id: 'compare', title: 'Comparateur de placements', short: 'Capitaux nets finaux de plusieurs placements', categories: ['finance', 'assurance-vie', 'allocation'], sections: ['calculators', 'investments'], keywords: ['comparateur', 'comparer', 'placements', 'fonds euros', 'cto', 'pea'], icon: GitCompare },
  // B. Fiscalité
  { id: 'ir', title: 'Impôt sur le revenu', short: 'Barème, quotient familial, décote, TMI', categories: ['fiscalite', 'entreprise'], sections: ['calculators'], keywords: ['ir', 'impot', 'revenu', 'tmi', 'quotient familial', 'decote', 'bareme', 'parts', 'cehr'], icon: Percent },
  { id: 'ifi', title: 'IFI', short: 'Impôt sur la fortune immobilière', categories: ['fiscalite', 'immobilier'], sections: ['calculators', 'wealth'], keywords: ['ifi', 'fortune', 'immobiliere', 'isf', 'patrimoine immobilier', 'plafonnement'], icon: Home },
  { id: 'assurance-vie', title: 'Rachat assurance-vie', short: 'Fiscalité d’un rachat et net perçu', categories: ['assurance-vie', 'fiscalite'], sections: ['calculators', 'wealth'], keywords: ['assurance vie', 'rachat', 'abattement', '4600', '9200', 'pfu', '150000', '2017', '8 ans'], icon: Shield },
  { id: 'per', title: 'PER', short: 'Économie d’impôt, capital et sortie', categories: ['retraite', 'fiscalite', 'entreprise'], sections: ['calculators', 'wealth'], keywords: ['per', 'plan epargne retraite', 'deduction', 'plafond', 'rente', 'sortie capital'], icon: PiggyBank },
  { id: 'donation', title: 'Donation', short: 'Droits, abattements et rappel fiscal', categories: ['transmission', 'fiscalite'], sections: ['calculators', 'wealth'], keywords: ['donation', 'droits', 'abattement', 'don familial', '790 g', 'transmission', 'rappel fiscal', 'nue propriete'], icon: Gift },
  { id: 'succession', title: 'Succession', short: 'Dévolution légale et droits par héritier', categories: ['transmission', 'fiscalite'], sections: ['calculators', 'wealth'], keywords: ['succession', 'heritage', 'heritiers', 'reserve', 'quotite', 'conjoint', 'droits de succession'], icon: Users },
  { id: 'demembrement', title: 'Démembrement', short: 'Usufruit et nue-propriété (art. 669 CGI)', categories: ['transmission', 'immobilier', 'fiscalite'], sections: ['calculators', 'wealth'], keywords: ['demembrement', 'usufruit', 'nue propriete', '669', 'bareme fiscal'], icon: Split },
  // C. Financement
  { id: 'mortgage', title: 'Crédit amortissable', short: 'Mensualité, coût total, tableau d’amortissement', categories: ['credit', 'immobilier'], sections: ['calculators'], keywords: ['credit', 'pret immobilier', 'mensualite', 'amortissement', 'taeg', 'emprunt'], icon: Home },
  { id: 'capacity', title: 'Capacité d’emprunt', short: 'Capital empruntable selon le taux d’effort', categories: ['credit', 'immobilier'], sections: ['calculators'], keywords: ['capacite', 'emprunt', 'endettement', 'hcsf', '35'], icon: Scale },
  { id: 'in-fine', title: 'Crédit in fine', short: 'Intérêts périodiques et placement adossé', categories: ['credit', 'immobilier', 'entreprise'], sections: ['calculators'], keywords: ['in fine', 'credit', 'interets', 'adosse', 'nantissement'], icon: Hourglass },
  { id: 'guarantee', title: 'Frais de garantie', short: 'Hypothèque conventionnelle ou HLS PD (ex-PPD)', categories: ['credit', 'immobilier'], sections: ['calculators'], keywords: ['garantie', 'hypotheque', 'hls', 'hlspd', 'ppd', 'privilege preteur de deniers', 'frais', 'notaire', 'taxe publicite fonciere', 'pret immobilier'], icon: Shield },
  { id: 'lombard', title: 'Crédit lombard', short: 'Valeur de prêt, LTV et stress de marché', categories: ['credit', 'entreprise'], sections: ['calculators', 'investments'], keywords: ['lombard', 'ltv', 'nantissement', 'credit', 'appel de marge', 'levier', 'portefeuille'], icon: Lock },
  { id: 'pledge', title: 'Nantissement de portefeuille', short: 'Valeur éligible et ratio de couverture', categories: ['credit', 'entreprise'], sections: ['calculators'], keywords: ['nantissement', 'garantie', 'decote', 'haircut', 'couverture'], icon: Layers },
  // D. Obligations & structurés
  { id: 'bond', title: 'Calculateur obligataire', short: 'Rendement actuariel, coupon couru, duration', categories: ['obligations'], sections: ['calculators', 'investments'], keywords: ['obligation', 'bond', 'ytm', 'rendement actuariel', 'coupon couru', 'duration', 'pied de coupon'], icon: ScrollText },
  { id: 'structured', title: 'Produits structurés', short: 'Autocall, Phoenix, reverse convertible, capital protégé — scénarios standards ou trajectoire personnalisée', categories: ['structures'], sections: ['calculators', 'investments'], keywords: ['structure', 'scenario', 'stress', 'trajectoire', 'backtest', 'volatilite', 'volatil', 'autocall', 'athena', 'phoenix', 'reverse convertible', 'rc', 'capital protege', 'capital garanti', 'participation', 'rappel', 'barriere', 'coupon', 'memoire'], icon: Sparkles },
  // E. Patrimoine & investissement
  { id: 'projection', title: 'Projection patrimoniale', short: 'Patrimoine net à 10, 20 et 30 ans', categories: ['allocation', 'retraite'], sections: ['wealth'], keywords: ['projection', 'patrimoine', 'bilan', 'inflation', 'long terme'], icon: TrendingUp },
  { id: 'allocation', title: 'Allocation d’actifs', short: 'Poids, montants et rééquilibrage', categories: ['allocation'], sections: ['investments'], keywords: ['allocation', 'repartition', 'actions', 'obligations', 'private equity', 'reequilibrage'], icon: PieChart },
  { id: 'withdrawal', title: 'Simulation de rente', short: 'Retraits programmés et épuisement du capital', categories: ['retraite'], sections: ['wealth'], keywords: ['rente', 'retraits', 'epuisement', 'decumulation', 'retraite'], icon: Wallet },
  { id: 'income', title: 'Revenus complémentaires', short: 'Revenu net mensuel d’un capital', categories: ['retraite', 'allocation'], sections: ['investments', 'wealth'], keywords: ['revenus', 'distribution', 'scpi', 'dividendes', 'revenu mensuel'], icon: Banknote },
  { id: 'cap-vs-dist', title: 'Capitalisation vs distribution', short: 'Effet de la fiscalité sur le réinvestissement', categories: ['allocation', 'assurance-vie'], sections: ['investments'], keywords: ['capitalisation', 'distribution', 'parts c', 'parts d', 'reinvestissement'], icon: Repeat },
];

/** Anciens identifiants (favoris, liens partagés, scénarios enregistrés) redirigés vers le simulateur unique. */
export const SIM_ALIASES: Record<string, string> = { autocall: 'structured', phoenix: 'structured', 'reverse-convertible': 'structured', scenarios: 'structured' };
export const resolveSimId = (id: string) => SIM_ALIASES[id] ?? id;
export const getMeta = (id: string) => SIMULATORS.find((s) => s.id === resolveSimId(id));
export const byCategory = (c: CategoryId) => SIMULATORS.filter((s) => s.categories.includes(c));
export const bySection = (s: SectionId) => SIMULATORS.filter((x) => x.sections.includes(s));
export const categoryLabel = (c: CategoryId) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

/** Recherche universelle : titre, description, mots-clés, catégories (insensible aux accents). */
export function searchSimulators(q: string): SimMeta[] {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = SIMULATORS.map((s) => {
    const hay = {
      title: normalize(s.title),
      kw: normalize(s.keywords.join(' ')),
      rest: normalize([s.short, ...s.categories.map(categoryLabel)].join(' ')),
    };
    let score = 0;
    for (const t of terms) {
      if (hay.title.startsWith(t)) score += 6;
      else if (hay.title.includes(t)) score += 4;
      if (hay.kw.split(' ').some((w) => w.startsWith(t))) score += 3;
      else if (hay.kw.includes(t)) score += 2;
      if (hay.rest.includes(t)) score += 1;
      if (!hay.title.includes(t) && !hay.kw.includes(t) && !hay.rest.includes(t)) return { s, score: 0 };
    }
    return { s, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s);
}


/**
 * Familles d'outils : chaque simulateur est rattaché à sa catégorie principale
 * (la première déclarée), pour une présentation sans doublon.
 */
export const FAMILIES = CATEGORIES
  .map((c) => ({ ...c, items: SIMULATORS.filter((s) => s.categories[0] === c.id) }))
  .filter((f) => f.items.length > 0);
