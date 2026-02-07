'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ClinicaContextType = {
  selectedClinicaId: string | 'all';
  setSelectedClinicaId: (id: string | 'all') => void;
  clinicaNome: string;
  setClinicaNome: (nome: string) => void;
};

const ClinicaContext = createContext<ClinicaContextType | undefined>(undefined);

export function ClinicaProvider({ children }: { children: ReactNode }) {
  const [selectedClinicaId, setSelectedClinicaId] = useState<string | 'all'>('all');
  const [clinicaNome, setClinicaNome] = useState('Todas as Clínicas');

  useEffect(() => {
    const savedId = localStorage.getItem('selectedClinicaId');
    const savedNome = localStorage.getItem('clinicaNome');
    if (savedId) setSelectedClinicaId(savedId);
    if (savedNome) setClinicaNome(savedNome);
  }, []);

  const handleSetId = (id: string | 'all') => {
    setSelectedClinicaId(id);
    localStorage.setItem('selectedClinicaId', id);
  };

  const handleSetNome = (nome: string) => {
    setClinicaNome(nome);
    localStorage.setItem('clinicaNome', nome);
  };

  return (
    <ClinicaContext.Provider value={{ selectedClinicaId, setSelectedClinicaId: handleSetId, clinicaNome, setClinicaNome: handleSetNome }}>
      {children}
    </ClinicaContext.Provider>
  );
}

export function useClinica() {
  const context = useContext(ClinicaContext);
  if (context === undefined) {
    throw new Error('useClinica deve ser usado dentro de um ClinicaProvider');
  }
  return context;
}
