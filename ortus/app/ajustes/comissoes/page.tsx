'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legado: Comissões unificadas em /ajustes/equipe */
export default function ComissoesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ajustes/equipe?aba=comissao');
  }, [router]);

  return null;
}
