'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type TabsContextValue = {
    value: string;
    onChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function cx(...classes: Array<string | undefined | null | false>) {
    return classes.filter(Boolean).join(' ');
}

interface TabsProps {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    children: ReactNode;
}

export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
    const [internalValue, setInternalValue] = useState<string>(defaultValue || '');

    const currentValue = value !== undefined ? value : internalValue;

    const handleChange = useCallback((newValue: string) => {
        if (value === undefined) {
            setInternalValue(newValue);
        }
        onValueChange?.(newValue);
    }, [value, onValueChange]);

    return (
        <TabsContext.Provider value={{ value: currentValue, onChange: handleChange }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

interface TabsListProps {
    className?: string;
    children: ReactNode;
}

export function TabsList({ className, children }: TabsListProps) {
    return (
        <div role="tablist" className={className}>
            {children}
        </div>
    );
}

interface TabsTriggerProps {
    value: string;
    className?: string;
    children: ReactNode;
}

export function TabsTrigger({ value, className, children }: TabsTriggerProps) {
    const ctx = useContext(TabsContext);
    if (!ctx) {
        throw new Error('TabsTrigger must be used within <Tabs>');
    }
    const selected = ctx.value === value;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            data-state={selected ? 'active' : 'inactive'}
            onClick={() => ctx.onChange(value)}
            className={cx(
                'px-4 py-2 rounded-2xl transition-colors text-sm font-semibold',
                selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                className,
            )}
        >
            {children}
        </button>
    );
}

interface TabsContentProps {
    value: string;
    className?: string;
    children: ReactNode;
}

export function TabsContent({ value, className, children }: TabsContentProps) {
    const ctx = useContext(TabsContext);
    if (!ctx) {
        throw new Error('TabsContent must be used within <Tabs>');
    }
    if (ctx.value !== value) return null;
    return (
        <div role="tabpanel" className={className}>
            {children}
        </div>
    );
}
