'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';

type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertConfig {
  title?: string;
  message: string;
  type?: AlertType;
}

interface ConfirmConfig {
  title?: string;
  message: string;
  type?: AlertType;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AlertState {
  id: number;
  config: AlertConfig | ConfirmConfig;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

interface CustomAlertContextType {
  showAlert: (message: string, config?: Partial<AlertConfig>) => Promise<void>;
  showConfirm: (message: string, config?: Partial<ConfirmConfig>) => Promise<boolean>;
}

const CustomAlertContext = createContext<CustomAlertContextType | null>(null);

let idCounter = 0;

export function CustomAlertProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<AlertState[]>([]);

  const showAlert = useCallback((message: string, config?: Partial<AlertConfig>): Promise<void> => {
    return new Promise(resolve => {
      const id = ++idCounter;
      setDialogs(prev => [...prev, {
        id,
        config: { message, type: 'info', ...config },
        isConfirm: false,
        resolve: () => resolve(),
      }]);
    });
  }, []);

  const showConfirm = useCallback((message: string, config?: Partial<ConfirmConfig>): Promise<boolean> => {
    return new Promise(resolve => {
      const id = ++idCounter;
      setDialogs(prev => [...prev, {
        id,
        config: { message, type: 'warning', confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', ...config },
        isConfirm: true,
        resolve,
      }]);
    });
  }, []);

  const dismiss = useCallback((id: number, result: boolean) => {
    setDialogs(prev => {
      const dialog = prev.find(d => d.id === id);
      if (dialog) dialog.resolve(result);
      return prev.filter(d => d.id !== id);
    });
  }, []);

  const iconMap: Record<AlertType, ReactNode> = {
    info: <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><Info size={24} /></div>,
    success: <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle size={24} /></div>,
    warning: <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><AlertTriangle size={24} /></div>,
    error: <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center"><XCircle size={24} /></div>,
  };

  return (
    <CustomAlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialogs.map(dialog => {
        const type: AlertType = ((dialog.config as any).type as AlertType) || 'info';
        const isConfirm = dialog.isConfirm;
        const cfg = dialog.config as ConfirmConfig;
        return (
          <div
            key={dialog.id}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => dismiss(dialog.id, false)}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <div
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => dismiss(dialog.id, false)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>

              <div className="p-6 text-center">
                <div className="flex justify-center mb-4">
                  {iconMap[type]}
                </div>
                {cfg.title && (
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{cfg.title}</h3>
                )}
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {cfg.message}
                </p>
              </div>

              <div className="px-6 pb-6 flex gap-3">
                {isConfirm ? (
                  <>
                    <button
                      onClick={() => dismiss(dialog.id, false)}
                      className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      {cfg.cancelLabel || 'Cancelar'}
                    </button>
                    <button
                      autoFocus
                      onClick={() => dismiss(dialog.id, true)}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white transition-colors shadow-sm ${
                        type === 'error' || type === 'warning'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {cfg.confirmLabel || 'Confirmar'}
                    </button>
                  </>
                ) : (
                  <button
                    autoFocus
                    onClick={() => dismiss(dialog.id, true)}
                    className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </CustomAlertContext.Provider>
  );
}

export function useCustomAlert() {
  const ctx = useContext(CustomAlertContext);
  if (!ctx) {
    return {
      showAlert: async (message: string) => { window.alert(message); },
      showConfirm: async (message: string) => window.confirm(message),
    };
  }
  return ctx;
}
