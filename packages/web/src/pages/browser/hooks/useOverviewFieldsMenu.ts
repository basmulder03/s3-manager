import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from 'react';
import type { OverviewColumnVisibility } from '@web/pages/browser/types';
import {
  overviewColumnDefinitions,
  OVERVIEW_COLUMNS_STORAGE_KEY,
  resolveInitialOverviewColumnVisibility,
} from '@web/pages/browser/constants';

export const useOverviewFieldsMenu = () => {
  const [isOverviewFieldsMenuOpen, setIsOverviewFieldsMenuOpen] = useState(false);
  const [overviewFieldsFilterQuery, setOverviewFieldsFilterQuery] = useState('');
  const [overviewColumnVisibility, setOverviewColumnVisibility] =
    useState<OverviewColumnVisibility>(resolveInitialOverviewColumnVisibility);
  const [overviewFieldsMenuStyle, setOverviewFieldsMenuStyle] = useState<CSSProperties>({});

  const overviewFieldsMenuRef = useRef<HTMLDivElement>(null);
  const overviewFieldsPanelRef = useRef<HTMLDivElement>(null);

  const visibleOverviewColumns = overviewColumnDefinitions.filter(
    (column) => overviewColumnVisibility[column.key]
  );

  const visibleOverviewColumnsCount = visibleOverviewColumns.length;
  const allOverviewColumnsSelected =
    visibleOverviewColumnsCount === overviewColumnDefinitions.length;

  const normalizedOverviewFieldsFilterQuery = overviewFieldsFilterQuery.trim().toLowerCase();
  const filteredOverviewColumns = overviewColumnDefinitions.filter((column) =>
    column.label.toLowerCase().includes(normalizedOverviewFieldsFilterQuery)
  );

  // Save visibility to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      OVERVIEW_COLUMNS_STORAGE_KEY,
      JSON.stringify(overviewColumnVisibility)
    );
  }, [overviewColumnVisibility]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (overviewFieldsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      if (overviewFieldsPanelRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOverviewFieldsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOverviewFieldsMenuOpen]);

  const positionOverviewFieldsMenu = useCallback(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const anchor = overviewFieldsMenuRef.current;
    const menu = overviewFieldsPanelRef.current;
    if (!anchor || !menu) {
      return;
    }

    const viewportPadding = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 240;
    const menuHeight = menuRect.height || 320;

    let left = anchorRect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding)
    );

    const spaceBelow = window.innerHeight - anchorRect.bottom - gap - viewportPadding;
    const spaceAbove = anchorRect.top - gap - viewportPadding;

    let top = anchorRect.bottom + gap;
    let maxHeight = Math.max(160, spaceBelow);
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      top = Math.max(viewportPadding, anchorRect.top - gap - Math.min(menuHeight, spaceAbove));
      maxHeight = Math.max(160, spaceAbove);
    }

    setOverviewFieldsMenuStyle({
      position: 'fixed',
      left,
      top,
      right: 'auto',
      bottom: 'auto',
      maxHeight: `${Math.floor(maxHeight)}px`,
      visibility: 'visible',
    });
  }, [isOverviewFieldsMenuOpen]);

  // Position menu initially and on each render
  useLayoutEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      setOverviewFieldsMenuStyle({});
      return;
    }

    positionOverviewFieldsMenu();

    const frameId = window.requestAnimationFrame(positionOverviewFieldsMenu);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOverviewFieldsMenuOpen, overviewFieldsFilterQuery, positionOverviewFieldsMenu]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const reposition = () => {
      positionOverviewFieldsMenu();
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOverviewFieldsMenuOpen, positionOverviewFieldsMenu]);

  return {
    isOverviewFieldsMenuOpen,
    setIsOverviewFieldsMenuOpen,
    overviewFieldsFilterQuery,
    setOverviewFieldsFilterQuery,
    overviewColumnVisibility,
    setOverviewColumnVisibility,
    overviewFieldsMenuStyle,
    overviewFieldsMenuRef,
    overviewFieldsPanelRef,
    visibleOverviewColumns,
    allOverviewColumnsSelected,
    filteredOverviewColumns,
  };
};
