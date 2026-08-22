import { useRef } from 'react';
import NeuralNet from '../red/NeuralNet';
import { profileHandle } from '../../shared/profile';

function AgentPreview({
  resumen,
  perfil,
  arrival,
  arrive,
  listening,
  reactions,
  broadcast,
  onArrived,
}) {
  const ownerLabel = profileHandle(perfil);
  const seeded = (arrival?.personas ?? []).map((person, index) => ({
    connectionId: person.url || person.connectionId || `seed-${index}`,
    nombre: person.nombre ?? '',
    fotoUrl: person.photoUrl ?? person.fotoUrl ?? null,
  }))
  const incoming = resumen?.topContacts?.length ? resumen.topContacts : seeded
  const frozen = useRef(null)
  if (arrive && incoming.length && !frozen.current) frozen.current = incoming
  const contacts = arrive && frozen.current ? frozen.current : incoming

  return (
    <aside className="agent-preview" aria-label="Audiencia">
      <NeuralNet
        owner={{
          fotoUrl: resumen?.ownerFotoUrl || arrival?.dueno?.photoUrl,
          label: ownerLabel,
        }}
        contacts={contacts}
        arrive={arrive}
        listening={listening}
        reactions={reactions}
        broadcast={broadcast}
        onArrived={onArrived}
      />
    </aside>
  );
}

export default AgentPreview;
