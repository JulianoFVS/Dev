'use client';

import type { MarcacaoPreview, Referencia } from '@/lib/hofPreview';

type Props = {
  src: string;
  marks: MarcacaoPreview[];
  referencia?: Referencia;
};

/**
 * Prévia do rosto na aba HOF.
 *
 * Antes existia um seletor "Antes / Depois" que simulava o resultado do
 * procedimento por cima da foto. Essa simulação foi retirada (a pedido):
 * o que a clínica vê aqui é a foto real da sessão, sem promessa de
 * resultado. As marcações continuam sendo registradas no mapa, que é onde
 * o profissional trabalha.
 */
export default function HofPreviewRosto({ src }: Props) {
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- foto da sessão já comprimida em JPEG pelo próprio Ortus */}
      <img
        src={src}
        alt="Foto frontal da sessão"
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
