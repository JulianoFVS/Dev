'use client';

import { useEffect } from 'react';
import { useClinica } from '@/app/context/ClinicaContext';
import { carregarConfig } from '@/lib/configClinica';
import { applyTheme, type ThemeId } from '@/lib/themePresets';

const PREFS_PADRAO = { cor_tema: 'blue' as ThemeId };

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeClinicId } = useClinica();

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      if (!activeClinicId || activeClinicId === 'all') {
        applyTheme('blue');
        return;
      }
      try {
        const prefs = await carregarConfig(
          activeClinicId,
          'preferencias',
          'ortus_preferencias',
          PREFS_PADRAO,
        );
        if (!cancelled) {
          applyTheme((prefs?.cor_tema as ThemeId) || 'blue');
        }
      } catch {
        if (!cancelled) applyTheme('blue');
      }
    }

    loadTheme();
    return () => { cancelled = true; };
  }, [activeClinicId]);

  return <>{children}</>;
}
