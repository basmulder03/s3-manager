import { Fragment, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuAction } from '@web/pages/browser/types';
import styles from '@web/App.module.css';

interface BrowserContextMenuProps {
  contextMenu: { x: number; y: number } | null;
  contextMenuRef: RefObject<HTMLDivElement>;
  contextSubmenuRef: RefObject<HTMLDivElement>;
  contextMenuItemRefs: { current: Array<HTMLButtonElement | null> };
  contextSubmenuItemRefs: { current: Array<HTMLButtonElement | null> };
  contextSubmenuSide: 'left' | 'right';
  contextMenuActions: ContextMenuAction[];
  openSubmenuActionId: string | null;
  setOpenSubmenuActionId: (
    id: string | null | ((previous: string | null) => string | null)
  ) => void;
  handleContextMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

const SECONDARY_CONTEXT_ACTION_IDS = ['rename', 'move', 'delete'];

export const BrowserContextMenu = ({
  contextMenu,
  contextMenuRef,
  contextSubmenuRef,
  contextMenuItemRefs,
  contextSubmenuItemRefs,
  contextSubmenuSide,
  contextMenuActions,
  openSubmenuActionId,
  setOpenSubmenuActionId,
  handleContextMenuKeyDown,
}: BrowserContextMenuProps) => {
  if (!contextMenu) {
    return null;
  }

  return createPortal(
    <div
      ref={contextMenuRef}
      className={styles.contextMenu}
      role="menu"
      aria-label="Item actions"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleContextMenuKeyDown}
    >
      {contextMenuActions.map((action, index) => {
        const previousAction = contextMenuActions[index - 1];
        const startsSecondarySection =
          SECONDARY_CONTEXT_ACTION_IDS.includes(action.id) &&
          previousAction &&
          !SECONDARY_CONTEXT_ACTION_IDS.includes(previousAction.id);
        const hasSubmenu = Boolean(action.submenuActions && action.submenuActions.length > 0);
        const isSubmenuOpen = hasSubmenu && openSubmenuActionId === action.id;

        return (
          <Fragment key={action.id}>
            {startsSecondarySection ? <div className={styles.contextMenuSeparator} /> : null}
            <div className={styles.contextMenuRow}>
              <button
                ref={(element) => {
                  contextMenuItemRefs.current[index] = element;
                }}
                role="menuitem"
                disabled={action.isDisabled}
                aria-haspopup={hasSubmenu ? 'menu' : undefined}
                aria-expanded={hasSubmenu ? isSubmenuOpen : undefined}
                className={`${styles.contextMenuItem} ${action.isDanger ? styles.contextMenuItemDanger : ''}`}
                onFocus={() => {
                  if (!hasSubmenu) {
                    setOpenSubmenuActionId(null);
                  }
                }}
                onMouseEnter={() => {
                  if (hasSubmenu) {
                    setOpenSubmenuActionId(action.id);
                  }
                }}
                onClick={() => {
                  if (hasSubmenu) {
                    setOpenSubmenuActionId((previous) =>
                      previous === action.id ? null : action.id
                    );
                    return;
                  }

                  action.onSelect();
                }}
              >
                <span>{action.label}</span>
                <span className={styles.contextMenuHint}>{hasSubmenu ? '>' : action.hint}</span>
              </button>
              {hasSubmenu && isSubmenuOpen ? (
                <div
                  ref={contextSubmenuRef}
                  className={`${styles.contextSubmenu} ${
                    contextSubmenuSide === 'left' ? styles.contextSubmenuLeft : ''
                  }`.trim()}
                  role="menu"
                  aria-label={`${action.label} options`}
                >
                  {action.submenuActions?.map((submenuAction, submenuIndex) => (
                    <button
                      key={submenuAction.id}
                      ref={(element) => {
                        contextSubmenuItemRefs.current[submenuIndex] = element;
                      }}
                      role="menuitem"
                      disabled={submenuAction.isDisabled}
                      className={styles.contextMenuItem}
                      onClick={submenuAction.onSelect}
                    >
                      <span>{submenuAction.label}</span>
                      {submenuAction.hint ? (
                        <span className={styles.contextMenuHint}>{submenuAction.hint}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>,
    document.body
  );
};
