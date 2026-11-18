import { useEffect, useState } from 'react';

export type Page = 'launches' | 'token' | 'developers';
const PAGES: readonly Page[] = ['launches', 'token', 'developers'];

export interface Route {
  readonly page: Page;
  readonly param: string | null;
}

export function parseRoute(hash: string): Route {
  const [name = '', param = null] = hash.replace(/^#\/?/, '').split('/');
  const page = (PAGES as readonly string[]).includes(name) ? (name as Page) : 'launches';
  return { page, param: param || null };
}

export const href = (page: Page, param?: string): string => `#/${page}${param ? `/${param}` : ''}`;
export const go = (page: Page, param?: string): void => void (window.location.hash = href(page, param));

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = (): void => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
