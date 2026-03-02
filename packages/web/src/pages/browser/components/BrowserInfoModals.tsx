import { Fragment, type RefObject } from 'react';
import { BookOpenText, Keyboard } from 'lucide-react';
import { Button } from '@web/components/ui';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import { browserShortcuts, filterHelpEntries } from '@web/pages/browser/constants';
import styles from '@web/App.module.css';

interface BrowserInfoModalsProps {
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: (isOpen: boolean) => void;
  isFilterHelpModalOpen: boolean;
  setIsFilterHelpModalOpen: (isOpen: boolean) => void;
  activeModalRef: RefObject<HTMLDivElement>;
}

export const BrowserInfoModals = ({
  isShortcutsModalOpen,
  setIsShortcutsModalOpen,
  isFilterHelpModalOpen,
  setIsFilterHelpModalOpen,
  activeModalRef,
}: BrowserInfoModalsProps) => {
  if (!isShortcutsModalOpen && !isFilterHelpModalOpen) {
    return null;
  }

  return (
    <ModalPortal>
      <>
        {isShortcutsModalOpen ? (
          <div
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-modal-title"
            aria-describedby="shortcuts-modal-description"
            aria-label="Keyboard shortcuts"
          >
            <div
              className={`${styles.modalCard} ${styles.shortcutsModalCard}`}
              ref={activeModalRef}
            >
              <div className={styles.shortcutsModalHeader}>
                <Keyboard size={16} aria-hidden />
                <h3 id="shortcuts-modal-title">Keyboard shortcuts</h3>
              </div>
              <p id="shortcuts-modal-description" className={styles.shortcutsModalDescription}>
                Quick commands available in the browser view.
              </p>
              <div className={styles.shortcutsGrid}>
                <div className={styles.shortcutsTableHeader}>
                  <span className={styles.shortcutsTableHeaderAction}>Action</span>
                  <span className={styles.shortcutsTableHeaderKeys}>Shortcut</span>
                </div>
                {browserShortcuts.map(({ id, action, shortcuts, Icon }) => (
                  <div key={id} className={styles.shortcutItem}>
                    <span className={styles.shortcutIcon} aria-hidden>
                      <Icon size={14} />
                    </span>
                    <span className={styles.shortcutAction}>{action}</span>
                    <span className={styles.shortcutKeys}>
                      {shortcuts.map((shortcut, shortcutIndex) => (
                        <Fragment key={`${id}-${shortcut.join('+')}`}>
                          <span className={styles.shortcutOption}>
                            {shortcut.map((key, keyIndex) => (
                              <Fragment key={`${id}-${shortcutIndex}-${key}`}>
                                {keyIndex > 0 ? (
                                  <span className={styles.shortcutJoin}>+</span>
                                ) : null}
                                <kbd className={styles.shortcutKeycap}>{key}</kbd>
                              </Fragment>
                            ))}
                          </span>
                          {shortcutIndex < shortcuts.length - 1 ? (
                            <span className={styles.shortcutOptionSeparator}>or</span>
                          ) : null}
                        </Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.modalActions}>
                <Button variant="muted" onClick={() => setIsShortcutsModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isFilterHelpModalOpen ? (
          <div
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-help-modal-title"
            aria-describedby="filter-help-modal-description"
            aria-label="Filter query help"
          >
            <div
              className={`${styles.modalCard} ${styles.shortcutsModalCard}`}
              ref={activeModalRef}
            >
              <div className={styles.shortcutsModalHeader}>
                <BookOpenText size={16} aria-hidden />
                <h3 id="filter-help-modal-title">Filter query help</h3>
              </div>
              <p id="filter-help-modal-description" className={styles.shortcutsModalDescription}>
                Use plain text or field expressions in the filter input. Clauses are combined with
                AND.
              </p>
              <div className={styles.filterHelpList}>
                {filterHelpEntries.map((entry) => (
                  <article key={entry.id} className={styles.filterHelpCard}>
                    <p className={styles.filterHelpSectionLabel}>Query option</p>
                    <p className={styles.filterHelpQuery}>
                      <code>{entry.query}</code>
                    </p>
                    <p className={styles.filterHelpSectionLabel}>What it does</p>
                    <p className={styles.filterHelpBody}>{entry.whatItDoes}</p>
                    <p className={styles.filterHelpSectionLabel}>How it works</p>
                    <p className={styles.filterHelpBody}>{entry.howItWorks}</p>
                    <p className={styles.filterHelpSectionLabel}>Examples</p>
                    <p className={styles.filterHelpExamples}>
                      {entry.examples.map((example, index) => (
                        <Fragment key={`${entry.id}-${example}`}>
                          {index > 0 ? (
                            <span className={styles.filterHelpExampleSeparator}> | </span>
                          ) : null}
                          <code>{example}</code>
                        </Fragment>
                      ))}
                    </p>
                  </article>
                ))}
              </div>
              <div className={styles.modalActions}>
                <Button variant="muted" onClick={() => setIsFilterHelpModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    </ModalPortal>
  );
};
