import React, { createContext, useContext } from 'react';

// App-wide navigation with an optional "intent" (e.g. open Create with these reference images,
// this character preselected, or video mode). The target page consumes the intent once on mount.
const NavCtx = createContext({ go: () => {} });
let pending = null;

export function NavProvider({ setPage, children }) {
  const go = (page, intent = null) => { pending = intent ? { page, ...intent } : null; setPage(page); };
  return <NavCtx.Provider value={{ go }}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);

export function takeIntent(page) {
  if (pending && pending.page === page) { const i = pending; pending = null; return i; }
  return null;
}
