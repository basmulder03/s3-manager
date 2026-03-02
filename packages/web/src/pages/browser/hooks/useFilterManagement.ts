import { useState, useEffect, useRef } from 'react';

interface UseFilterManagementProps {
  filterQuery: string;
  setFilterQuery: (query: string) => void;
}

export const useFilterManagement = ({ filterQuery, setFilterQuery }: UseFilterManagementProps) => {
  const [isFilterOpen, setIsFilterOpen] = useState(() => filterQuery.trim().length > 0);
  const [filterDraftQuery, setFilterDraftQuery] = useState(filterQuery);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Focus filter input when opened
  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    filterInputRef.current?.focus();
  }, [isFilterOpen]);

  // Update draft when query changes externally
  useEffect(() => {
    setFilterDraftQuery(filterQuery);
    if (filterQuery.trim().length > 0) {
      setIsFilterOpen(true);
    }
  }, [filterQuery]);

  // Auto-commit filter with debounce
  useEffect(() => {
    if (filterDraftQuery === filterQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFilterQuery(filterDraftQuery);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filterDraftQuery, filterQuery, setFilterQuery]);

  const openFilter = () => {
    if (isFilterOpen) {
      filterInputRef.current?.focus();
      return;
    }

    setIsFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterDraftQuery('');
    setFilterQuery('');
    setIsFilterOpen(false);
  };

  return {
    isFilterOpen,
    setIsFilterOpen,
    filterDraftQuery,
    setFilterDraftQuery,
    filterInputRef,
    openFilter,
    closeFilter,
  };
};
