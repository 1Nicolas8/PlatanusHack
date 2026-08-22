import NeuralNet from '../red/NeuralNet';
import { profileHandle } from '../../shared/profile';

function AgentPreview({ resumen, perfil }) {
  const ownerLabel = profileHandle(perfil);

  return (
    <aside className="agent-preview" aria-label="Audiencia">
      <NeuralNet
        owner={{ fotoUrl: resumen?.ownerFotoUrl, label: ownerLabel }}
        contacts={resumen?.topContacts}
      />
    </aside>
  );
}

export default AgentPreview;
