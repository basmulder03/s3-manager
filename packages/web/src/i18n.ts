import { useCallback, useEffect } from 'react';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { type LocaleId, useUiStore } from '@web/state/ui';

interface LocaleMeta {
  label?: string;
  flag?: string;
  enabled?: boolean;
  order?: number;
}

interface LocaleFile {
  _meta?: LocaleMeta;
  [key: string]: unknown;
}

interface LanguageOption {
  value: LocaleId;
  label: string;
  flag: string;
}

const LOCALE_FILE_MODULES = import.meta.glob<{ default: LocaleFile }>('./locales/*.json', {
  eager: true,
});

const buildLocaleCatalog = (): {
  resources: Record<string, { translation: Record<string, string> }>;
  languageOptions: LanguageOption[];
  defaultLocale: LocaleId;
} => {
  const resources: Record<string, { translation: Record<string, string> }> = {};
  const sortableOptions: Array<LanguageOption & { order: number }> = [];

  for (const [path, localeModule] of Object.entries(LOCALE_FILE_MODULES)) {
    const localeMatch = path.match(/\/([a-z0-9-]+)\.json$/i);
    const localeCode = localeMatch?.[1]?.toLowerCase();
    if (!localeCode) {
      continue;
    }

    const fileContent = localeModule.default;
    const meta = fileContent._meta;

    if (meta?.enabled === false) {
      continue;
    }

    const translationEntries = Object.entries(fileContent).filter(([key, value]) => {
      return key !== '_meta' && typeof value === 'string';
    });

    const translation = Object.fromEntries(translationEntries) as Record<string, string>;
    resources[localeCode] = { translation };

    sortableOptions.push({
      value: localeCode,
      label: meta?.label?.trim() || localeCode.toUpperCase(),
      flag: meta?.flag?.trim() || '🏳️',
      order: meta?.order ?? Number.MAX_SAFE_INTEGER,
    });
  }

  sortableOptions.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.label.localeCompare(right.label);
  });

  const languageOptions = sortableOptions.map(({ order, ...option }) => option);
  const defaultLocale =
    languageOptions.find((option) => option.value === 'en')?.value ??
    languageOptions[0]?.value ??
    'en';

  return {
    resources,
    languageOptions,
    defaultLocale,
  };
};

const localeCatalog = buildLocaleCatalog();

const resolveInitialLocale = (): LocaleId => {
  const supportedLocales = new Set(localeCatalog.languageOptions.map((option) => option.value));

  if (typeof window === 'undefined') {
    return localeCatalog.defaultLocale;
  }

  const stored = window.localStorage.getItem('ui-locale');
  if (stored && supportedLocales.has(stored)) {
    return stored;
  }

  return localeCatalog.defaultLocale;
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: localeCatalog.resources,
    lng: resolveInitialLocale(),
    fallbackLng: localeCatalog.defaultLocale,
    interpolation: {
      escapeValue: false,
    },
  });
}

export const useI18n = () => {
  const locale = useUiStore((state) => state.locale);
  const saveLocale = useUiStore((state) => state.setLocale);
  const { t } = useTranslation();

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: LocaleId) => {
      saveLocale(nextLocale);
      void i18n.changeLanguage(nextLocale);
    },
    [saveLocale]
  );

  return {
    t,
    locale,
    setLocale,
    languageOptions: localeCatalog.languageOptions,
  };
};
