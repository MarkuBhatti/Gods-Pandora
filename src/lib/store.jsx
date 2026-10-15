import React, { createContext, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);

const DEFAULT_DB = { characters: [], locations: [], products: [], generations: [], customModels: [], settings: {} };

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DB };
  return {
    ...DEFAULT_DB,
    ...raw,
    characters:  Array.isArray(raw.characters)  ? raw.characters  : [],
    locations:   Array.isArray(raw.locations)    ? raw.locations   : [],
    generations: Array.isArray(raw.generations)  ? raw.generations : [],
    products:    Array.isArray(raw.products)     ? raw.products    : [],
    customModels: Array.isArray(raw.customModels) ? raw.customModels : [],
    settings:    (raw.settings && typeof raw.settings === 'object') ? raw.settings : {},
  };
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(DEFAULT_DB);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api?.storeGet()
      .then((d) => { setDb(sanitize(d)); setLoaded(true); })
      .catch((err) => {
        console.error('[store] Failed to load DB, using defaults:', err);
        setDb({ ...DEFAULT_DB });
        setLoaded(true);
      });
  }, []);

  const update = (fn) => {
    setDb((prev) => {
      try {
        const next = sanitize(fn(structuredClone(prev)));
        window.api?.storeSet(next).catch((err) => console.error('[store] storeSet failed:', err));
        return next;
      } catch (err) {
        console.error('[store] update threw:', err);
        return prev;
      }
    });
  };

  return <Ctx.Provider value={{ db, update, loaded }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
