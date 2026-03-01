import { useEffect } from 'react';
import type { RefObject } from 'react';

export const useModalFocusTrapEffect = (
  isModalOpen: boolean,
  activeModalRef: RefObject<HTMLDivElement>
) => {
  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const focusFirstElement = () => {
      const container = activeModalRef.current;
      if (!container) {
        return;
      }

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );

      const first = focusable[0];
      if (!first) {
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (active && container.contains(active)) {
        return;
      }

      first.focus();
    };

    focusFirstElement();

    const onFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const container = activeModalRef.current;
      if (!container) {
        return;
      }

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const container = activeModalRef.current;
      if (!container) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (container.contains(target)) {
        return;
      }

      focusFirstElement();
    };

    window.addEventListener('keydown', onFocusTrap);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onFocusTrap);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [isModalOpen, activeModalRef]);
};
