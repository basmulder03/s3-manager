import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { BrowseData } from '@web/pages/browser/types';
import {
  BREADCRUMB_HINTS_STORAGE_KEY,
  resolveInitialBreadcrumbHintPaths,
} from '@web/pages/browser/constants';

interface UseBreadcrumbNavigationProps {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  knownBucketNames: string[];
  browseData?: BrowseData;
}

export const useBreadcrumbNavigation = ({
  selectedPath,
  setSelectedPath,
  knownBucketNames,
  browseData,
}: UseBreadcrumbNavigationProps) => {
  const [isBreadcrumbEditing, setIsBreadcrumbEditing] = useState(false);
  const [breadcrumbDraft, setBreadcrumbDraft] = useState(selectedPath ? `/${selectedPath}` : '/');
  const [cachedDirectoryHintPaths, setCachedDirectoryHintPaths] = useState<string[]>(
    resolveInitialBreadcrumbHintPaths
  );
  const [activeBreadcrumbHintIndex, setActiveBreadcrumbHintIndex] = useState(-1);
  const breadcrumbInputRef = useRef<HTMLInputElement>(null);
  const wasBreadcrumbEditingRef = useRef(false);

  const commitBreadcrumbPath = useCallback(
    (rawPath: string) => {
      const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (normalized !== selectedPath) {
        setSelectedPath(normalized);
      }
    },
    [selectedPath, setSelectedPath]
  );

  const isBreadcrumbPathCommitAllowed = useCallback(
    (rawPath: string) => {
      const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized) {
        return true;
      }

      if (knownBucketNames.length === 0) {
        return true;
      }

      const [bucketName = ''] = normalized.split('/');
      return knownBucketNames.includes(bucketName);
    },
    [knownBucketNames]
  );

  const breadcrumbSegments = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return [] as Array<{ label: string; path: string }>;
    }

    const segments = normalized.split('/');
    return segments.map((segment, index) => ({
      label: segment,
      path: segments.slice(0, index + 1).join('/'),
    }));
  }, [selectedPath]);

  const breadcrumbHintOptions = useMemo(() => {
    const draft = breadcrumbDraft.trim().replace(/^\/+/, '');
    const normalizedSelectedPath = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const suggestions = new Set<string>();

    suggestions.add('/');

    const addSuggestion = (value: string) => {
      const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized) {
        suggestions.add('/');
        return;
      }

      suggestions.add(`/${normalized}`);
    };

    for (const crumb of browseData?.breadcrumbs ?? []) {
      addSuggestion(crumb.path);
    }

    for (const bucketName of knownBucketNames) {
      addSuggestion(bucketName);
    }

    for (const cachedPath of cachedDirectoryHintPaths) {
      addSuggestion(cachedPath);
    }

    for (const item of browseData?.items ?? []) {
      if (item.type !== 'directory') {
        continue;
      }

      addSuggestion(item.path);
    }

    const filtered = Array.from(suggestions).filter((value) => {
      if (!draft) {
        return true;
      }

      const normalizedValue = value.slice(1).toLowerCase();
      const normalizedDraft = draft.toLowerCase();

      if (normalizedValue.startsWith(normalizedDraft)) {
        return true;
      }

      if (draft.includes('/')) {
        return false;
      }

      const valueSegments = normalizedValue.split('/');
      const leafSegment = valueSegments[valueSegments.length - 1] ?? '';
      if (leafSegment.startsWith(normalizedDraft)) {
        return true;
      }

      if (!normalizedSelectedPath) {
        return false;
      }

      const selectedPrefix = `${normalizedSelectedPath.toLowerCase()}/`;
      if (!normalizedValue.startsWith(selectedPrefix)) {
        return false;
      }

      const relativeFromCurrent = normalizedValue.slice(selectedPrefix.length);
      return relativeFromCurrent.startsWith(normalizedDraft);
    });

    filtered.sort((left, right) => left.localeCompare(right));
    return filtered.slice(0, 12);
  }, [
    breadcrumbDraft,
    browseData?.breadcrumbs,
    browseData?.items,
    cachedDirectoryHintPaths,
    knownBucketNames,
    selectedPath,
  ]);

  // Update draft when selectedPath changes and not editing
  useEffect(() => {
    if (isBreadcrumbEditing) {
      return;
    }

    setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
  }, [isBreadcrumbEditing, selectedPath]);

  // Auto-commit breadcrumb path after delay
  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (isBreadcrumbPathCommitAllowed(breadcrumbDraft)) {
        commitBreadcrumbPath(breadcrumbDraft);
      }
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [breadcrumbDraft, commitBreadcrumbPath, isBreadcrumbEditing, isBreadcrumbPathCommitAllowed]);

  // Focus input when editing starts
  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    breadcrumbInputRef.current?.focus();
    breadcrumbInputRef.current?.select();
  }, [isBreadcrumbEditing]);

  // Reset state when editing starts
  useEffect(() => {
    const wasEditing = wasBreadcrumbEditingRef.current;
    if (isBreadcrumbEditing && !wasEditing) {
      setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
      setActiveBreadcrumbHintIndex(-1);
    }

    wasBreadcrumbEditingRef.current = isBreadcrumbEditing;
  }, [isBreadcrumbEditing, selectedPath]);

  // Cache directory paths for hints
  useEffect(() => {
    setCachedDirectoryHintPaths((previous) => {
      const next = new Set(previous);

      const rememberPath = (value: string) => {
        const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        if (!normalized) {
          return;
        }

        next.add(normalized);
      };

      rememberPath(selectedPath);

      for (const crumb of browseData?.breadcrumbs ?? []) {
        rememberPath(crumb.path);
      }

      for (const item of browseData?.items ?? []) {
        if (item.type !== 'directory') {
          continue;
        }

        rememberPath(item.path);
      }

      if (next.size === previous.length) {
        return previous;
      }

      return Array.from(next).slice(-600);
    });
  }, [browseData?.breadcrumbs, browseData?.items, selectedPath]);

  // Save cached hints to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      BREADCRUMB_HINTS_STORAGE_KEY,
      JSON.stringify(cachedDirectoryHintPaths)
    );
  }, [cachedDirectoryHintPaths]);

  // Reset hint index when options change
  useEffect(() => {
    if (!isBreadcrumbEditing) {
      setActiveBreadcrumbHintIndex(-1);
      return;
    }

    setActiveBreadcrumbHintIndex((previous) => {
      if (breadcrumbHintOptions.length === 0) {
        return -1;
      }

      if (previous < 0) {
        return -1;
      }

      return Math.min(previous, breadcrumbHintOptions.length - 1);
    });
  }, [breadcrumbHintOptions, isBreadcrumbEditing]);

  return {
    isBreadcrumbEditing,
    setIsBreadcrumbEditing,
    breadcrumbDraft,
    setBreadcrumbDraft,
    breadcrumbInputRef,
    breadcrumbSegments,
    breadcrumbHintOptions,
    activeBreadcrumbHintIndex,
    setActiveBreadcrumbHintIndex,
    commitBreadcrumbPath,
    isBreadcrumbPathCommitAllowed,
  };
};
