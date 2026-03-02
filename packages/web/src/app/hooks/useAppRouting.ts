import { useLocation, useNavigate } from 'react-router';
import { useCallback, useMemo } from 'react';
import { normalizeVirtualPath } from '@web/utils/path';

/**
 * Hook for managing URL-based routing state in the app.
 * Handles path navigation, file preview URLs, and filter query parameters.
 */
export const useAppRouting = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse URL parameters
  const selectedPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeVirtualPath(params.get('path') ?? '');
  }, [location.search]);

  const openedFilePath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeVirtualPath(params.get('file') ?? '');
  }, [location.search]);

  const openedFileMode = useMemo<'view' | 'edit'>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('mode') === 'edit' ? 'edit' : 'view';
  }, [location.search]);

  const filterQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('filter') ?? '';
  }, [location.search]);

  // Update URL parameters
  const setSelectedPath = useCallback(
    (nextPath: string) => {
      const normalized = normalizeVirtualPath(nextPath);
      const params = new URLSearchParams(location.search);

      if (normalized) {
        params.set('path', normalized);
      } else {
        params.delete('path');
      }

      const nextSearch = params.toString();
      const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
      const currentUrl = `${location.pathname}${location.search}`;

      if (nextUrl === currentUrl) {
        return;
      }

      navigate(nextUrl);
    },
    [location.pathname, location.search, navigate]
  );

  const setOpenedFileInUrl = useCallback(
    (path: string, mode: 'view' | 'edit') => {
      const normalized = normalizeVirtualPath(path);
      const params = new URLSearchParams(location.search);
      if (normalized) {
        params.set('file', normalized);
        params.set('mode', mode);
      } else {
        params.delete('file');
        params.delete('mode');
      }

      const nextSearch = params.toString();
      const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
      const currentUrl = `${location.pathname}${location.search}`;
      if (nextUrl !== currentUrl) {
        navigate(nextUrl);
      }
    },
    [location.pathname, location.search, navigate]
  );

  const clearOpenedFileInUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete('file');
    params.delete('mode');
    const nextSearch = params.toString();
    const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
    const currentUrl = `${location.pathname}${location.search}`;
    if (nextUrl !== currentUrl) {
      navigate(nextUrl);
    }
  }, [location.pathname, location.search, navigate]);

  const setFilterQuery = useCallback(
    (nextQuery: string) => {
      const params = new URLSearchParams(location.search);

      if (nextQuery.trim().length > 0) {
        params.set('filter', nextQuery);
      } else {
        params.delete('filter');
      }

      const nextSearch = params.toString();
      const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
      const currentUrl = `${location.pathname}${location.search}`;

      if (nextUrl === currentUrl) {
        return;
      }

      navigate(nextUrl, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  return {
    selectedPath,
    openedFilePath,
    openedFileMode,
    filterQuery,
    setSelectedPath,
    setOpenedFileInUrl,
    clearOpenedFileInUrl,
    setFilterQuery,
  };
};
