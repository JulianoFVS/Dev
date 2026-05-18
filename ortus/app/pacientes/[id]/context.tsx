'use client';
import { createContext, useContext } from 'react';

export type PatientPageContext = {
    id: string;
    form: any;
    ficha: any;
    setFicha: (f: any) => void;
    supabase: any;
};

const Ctx = createContext<PatientPageContext | null>(null);

export const PatientPageProvider = Ctx.Provider;

export function usePatientPage() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('usePatientPage must be used inside PatientPageProvider');
    return ctx;
}
