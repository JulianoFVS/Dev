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
    info: <Info size={16} />,
    success: <CheckCircle size={16} />,
    warning: <AlertTriangle size={16} />,
    error: <XCircle size={16} />,
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
            <div className="absolute inset-0 bg-black/25 backdrop-blur-md" />
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-xl border border-neutral-200 bg-white"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => dismiss(dialog.id, false)}
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>

              <div className="px-5 pb-2 pt-5">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                  {iconMap[type]}
                </div>
                {cfg.title && (
                  <h3 className="text-base font-semibold text-neutral-900">{cfg.title}</h3>
                )}
                <p className="mt-1 text-sm leading-relaxed text-neutral-600 whitespace-pre-line">
                  {cfg.message}
                </p>
              </div>

              <div className="flex justify-end gap-2 px-5 py-4">
                {isConfirm ? (
                  <>
                    <button
                      type="button"
                      onClick={() => dismiss(dialog.id, false)}
                      className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50"
                    >
                      {cfg.cancelLabel || 'Cancelar'}
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => dismiss(dialog.id, true)}
                      className="h-9 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
                    >
                      {cfg.confirmLabel || 'Confirmar'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    autoFocus
                    onClick={() => dismiss(dialog.id, true)}
                    className="h-9 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
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
