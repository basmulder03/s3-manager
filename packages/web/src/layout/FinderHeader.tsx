import { AuthActions } from '@web/components';
import { Button } from '@web/components/ui';
import styles from '@web/App.module.css';
import type { ThemeId } from '@web/state/ui';
import { useI18n } from '@web/i18n';
import { BookOpenText, Keyboard, Menu, Moon, Sun } from 'lucide-react';

interface FinderHeaderProps {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  authenticated: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenFilterQueryHelp: () => void;
}

export const FinderHeader = ({
  theme,
  setTheme,
  authenticated,
  sidebarOpen,
  onToggleSidebar,
  onOpenKeyboardShortcuts,
  onOpenFilterQueryHelp,
}: FinderHeaderProps) => {
  const { locale, setLocale, t, languageOptions } = useI18n();

  return (
    <header className={styles.hero}>
      <div className={styles.heroTopline}>
        <p className={styles.heroKicker}>{t('header.kicker')}</p>
        <div className={styles.heroActions}>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? t('header.sidebar.hide') : t('header.sidebar.show')}
            title={sidebarOpen ? t('header.sidebar.hide') : t('header.sidebar.show')}
          >
            <Menu className={styles.iconToggleIcon} aria-hidden="true" />
          </Button>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
            title={theme === 'dark' ? t('header.theme.titleLight') : t('header.theme.titleDark')}
          >
            {theme === 'dark' ? (
              <Sun className={styles.iconToggleIcon} aria-hidden="true" />
            ) : (
              <Moon className={styles.iconToggleIcon} aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={onOpenKeyboardShortcuts}
            aria-label={t('header.shortcuts.open')}
            title={t('header.shortcuts.title')}
          >
            <Keyboard className={styles.iconToggleIcon} aria-hidden="true" />
          </Button>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={onOpenFilterQueryHelp}
            aria-label={t('header.filterHelp.open')}
            title={t('header.filterHelp.title')}
          >
            <BookOpenText className={styles.iconToggleIcon} aria-hidden="true" />
          </Button>
          <select
            className={styles.languageSelect}
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            aria-label={t('header.language.label')}
            title={t('header.language.label')}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {`${option.flag} ${option.label}`}
              </option>
            ))}
          </select>
          <AuthActions authenticated={authenticated} />
        </div>
      </div>
      <h1>{t('header.title')}</h1>
      <p>{t('header.subtitle')}</p>
    </header>
  );
};
