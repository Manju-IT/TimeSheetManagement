import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fullAppUrl, isEmbedded } from '@/lib/embedded';

interface EmbeddedContextValue {
    embedded: boolean;
    openFullApp: () => void;
}

const EmbeddedCtx = createContext<EmbeddedContextValue>({
    embedded: false,
    openFullApp: () => { },
});

export function EmbeddedProvider({ children }: { children: ReactNode }) {
    const embedded = isEmbedded();
    const value = useMemo<EmbeddedContextValue>(
        () => ({
            embedded,
            openFullApp: () => {
                // New tab, no opener reference. Escapes the iframe context entirely.
                window.open(fullAppUrl(), '_blank', 'noopener,noreferrer');
            },
        }),
        [embedded],
    );
    return <EmbeddedCtx.Provider value={value}>{children}</EmbeddedCtx.Provider>;
}

export function useEmbedded(): EmbeddedContextValue {
    return useContext(EmbeddedCtx);
}