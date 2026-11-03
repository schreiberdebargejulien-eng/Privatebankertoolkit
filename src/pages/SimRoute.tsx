import { useParams, Link } from 'react-router-dom';
import { getSimulator } from '@/simulators/registry';
import { SimulatorPage } from '@/components/sim/SimulatorPage';

export default function SimRoute() {
  const { id } = useParams();
  const def = id ? getSimulator(id) : undefined;
  if (!def) return <div className="p-6 safe-top">Simulateur introuvable. <Link to="/" className="text-accent">Accueil</Link></div>;
  return <SimulatorPage key={def.id} def={def} />;
}
