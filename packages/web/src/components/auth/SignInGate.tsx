import { AuthActions } from '@web/components';
import styles from '@web/App.module.css';
import { useI18n } from '@web/i18n';

export const SignInGate = () => {
  const { t } = useI18n();

  return (
    <main className={styles.signinShell}>
      <section className={styles.signinCard}>
        <p className={styles.heroKicker}>{t('header.kicker')}</p>
        <h1>{t('signin.title')}</h1>
        <p>{t('signin.description')}</p>
        <AuthActions authenticated={false} />
      </section>
    </main>
  );
};
