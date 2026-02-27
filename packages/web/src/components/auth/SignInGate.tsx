import { AuthActions } from '@web/components';
import styles from '@web/App.module.css';

export const SignInGate = () => {
  return (
    <main className={styles.signinShell}>
      <section className={styles.signinCard}>
        <p className={styles.heroKicker}>S3 MANAGER</p>
        <h1>Sign in to continue</h1>
        <p>Authenticate with your configured identity provider to access the file browser.</p>
        <AuthActions authenticated={false} />
      </section>
    </main>
  );
};
