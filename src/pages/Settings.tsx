import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Trash2, ShieldCheck, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, SectionTitle, Badge } from '@/components/ui/primitives';
import { FieldShell, NumberInput, Segmented, Select, Toggle } from '@/components/ui/fields';
import { useSettings, type Currency, type ThemePref } from '@/lib/settings';
import { clearAllLocalData } from '@/lib/storage';
import { ALL_RULES, IR_VERSIONS, pickVersion } from '@/engine';
import { dateFR } from '@/lib/format';

export function SettingsPage() {
  const { settings, update } = useSettings();
  return (
    <div className="pb-28">
      <div className="safe-top px-2 pt-2"><Link to="/"><Button variant="ghost" size="sm" tabIndex={-1}><ArrowLeft className="h-4 w-4" /> Accueil</Button></Link></div>
      <PageHeader title="Paramètres" subtitle="Hypothèses par défaut et confidentialité" />
      <div className="px-4 max-w-2xl mx-auto">
        <SectionTitle>Affichage</SectionTitle>
        <Card className="p-4 space-y-4">
          <FieldShell label="Thème"><Segmented<ThemePref> value={settings.theme} onChange={(theme) => update({ theme })} options={[{ value: 'system', label: 'Système' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} /></FieldShell>
          <FieldShell label="Devise d’affichage" hint="Libellé uniquement : aucune conversion n’est appliquée. Les barèmes fiscaux sont exprimés en euros."><Select<Currency> value={settings.currency} onChange={(currency) => update({ currency })} options={[{ value: 'EUR', label: 'Euro (€)' }, { value: 'CHF', label: 'Franc suisse (CHF)' }, { value: 'USD', label: 'Dollar US ($)' }, { value: 'GBP', label: 'Livre sterling (£)' }]} /></FieldShell>
          <Toggle label="Afficher les centimes" checked={settings.showCents} onChange={(showCents) => update({ showCents })} />
        </Card>

        <SectionTitle>Conventions de calcul</SectionTitle>
        <Card className="p-4 space-y-4">
          <FieldShell label="Barème IR par défaut"><Select value={settings.irVersion} onChange={(irVersion) => update({ irVersion })} options={[{ value: 'auto', label: `Automatique (${pickVersion(IR_VERSIONS).meta.label})` }, ...IR_VERSIONS.map((v) => ({ value: v.meta.id, label: v.meta.label }))]} /></FieldShell>
          <FieldShell label="Base de décompte des jours (obligations)"><Select value={settings.dayCount} onChange={(dayCount) => update({ dayCount })} options={[{ value: 'ACT/ACT', label: 'Exact/Exact (ICMA)' }, { value: 'ACT/365', label: 'Exact/365' }, { value: 'ACT/360', label: 'Exact/360' }, { value: '30/360', label: '30/360' }]} /></FieldShell>
          <FieldShell label="Date des versements périodiques"><Segmented value={settings.contributionTiming} onChange={(contributionTiming) => update({ contributionTiming })} options={[{ value: 'start', label: 'Début de période' }, { value: 'end', label: 'Fin de période' }]} /></FieldShell>
          <FieldShell label="Inflation par défaut"><NumberInput value={settings.inflation} scale={100} suffix="%" onChange={(x) => x !== null && update({ inflation: x })} /></FieldShell>
          <p className="text-[12px] text-muted">Taux : saisie en taux annuels ; conversion actuarielle ou proportionnelle précisée dans chaque simulateur.</p>
        </Card>

        <SectionTitle>Barèmes fiscaux</SectionTitle>
        <Link to="/sources"><Card className="flex items-center gap-3 px-4 py-3.5"><BookOpen className="h-5 w-5 text-accent" /><div className="flex-1"><div className="text-[15px] font-medium">Barèmes, sources et mises à jour</div><div className="text-[12.5px] text-muted">{ALL_RULES.length} règles versionnées · vérifiées le {dateFR(ALL_RULES.map((r) => r.lastVerified).sort().reverse()[0])}</div></div><ChevronRight className="h-4 w-4 text-muted" /></Card></Link>

        <SectionTitle>Confidentialité</SectionTitle>
        <Card className="p-4 space-y-3 text-[13px] text-muted leading-relaxed">
          <div className="flex gap-2 text-fg font-medium"><ShieldCheck className="h-4 w-4 text-accent mt-0.5" /> Données traitées localement</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Aucun envoi de données, aucun traceur, aucune publicité. Une politique de sécurité (CSP) interdit toute connexion à un serveur tiers.</li>
            <li>Les saisies ne sont pas conservées automatiquement ; seuls les favoris, l’historique (identifiants de simulateurs) et vos préférences le sont.</li>
            <li>Les scénarios ne sont enregistrés que sur action explicite, sur cet appareil. N’y indiquez aucun nom de client.</li>
          </ul>
          <Button variant="danger" className="w-full" onClick={() => { if (window.confirm('Effacer toutes les données locales (favoris, historique, scénarios, paramètres) ?')) { clearAllLocalData(); } }}><Trash2 className="h-4 w-4" /> Effacer toutes les données locales</Button>
        </Card>

        <p className="text-center text-[11.5px] text-muted mt-8">Private Banker Toolkit · v{__APP_VERSION__}<br />Estimations indicatives — ne constituent ni un conseil fiscal, juridique ou en investissement.</p>
      </div>
    </div>
  );
}

export function SourcesPage() {
  const groups = ALL_RULES.reduce<Record<string, typeof ALL_RULES>>((acc, r) => { const k = r.id.split('-')[1]; (acc[k] ||= []).push(r); return acc; }, {});
  const names: Record<string, string> = { IR: 'Impôt sur le revenu', IFI: 'IFI', CAP: 'Revenus du capital et assurance-vie', PER: 'Épargne retraite', DMTG: 'Donations et successions', '669': 'Démembrement' };
  return (
    <div className="pb-28">
      <div className="safe-top px-2 pt-2"><Button variant="ghost" size="sm" onClick={() => history.back()}><ArrowLeft className="h-4 w-4" /> Retour</Button></div>
      <PageHeader title="Barèmes et sources" subtitle="Règles versionnées par date d’effet" />
      <div className="px-4 max-w-2xl mx-auto">
        {Object.entries(groups).map(([k, rules]) => (
          <div key={k}>
            <SectionTitle>{names[k] ?? k}</SectionTitle>
            <div className="space-y-2.5">
              {rules.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[14.5px] font-medium">{r.label}</span><Badge tone={r.status === 'official' ? 'pos' : r.status === 'cross-checked' ? 'accent' : 'warn'}>{r.status === 'official' ? 'Source officielle' : r.status === 'cross-checked' ? 'Recoupé' : 'À confirmer'}</Badge></div>
                  <div className="text-[12.5px] text-muted mt-1">{r.scope}</div>
                  <div className="text-[12px] text-muted mt-1">En vigueur au {dateFR(r.effectiveFrom)} · dernière vérification {dateFR(r.lastVerified)} · {r.id}</div>
                  {r.notes?.map((n, i) => <div key={i} className="text-[12px] text-fg/70 mt-1.5">— {n}</div>)}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">{r.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="text-[12px] text-accent underline underline-offset-2">{s.label}</a>)}</div>
                </Card>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[12px] text-muted mt-6 leading-snug">« Recoupé » : valeurs concordantes entre plusieurs sources, dont une partie officielle, en attente de confirmation définitive sur la brochure ou le BOFiP. Les liens externes s’ouvrent dans le navigateur.</p>
      </div>
    </div>
  );
}
