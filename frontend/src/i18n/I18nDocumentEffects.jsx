import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { localeStorageKey, supportedLocales } from './index';

const fontLinkId = 'swasthya-sarthi-locale-font';

function setLocaleFont(localeCode) {
  const locale = supportedLocales.find(item => item.code === localeCode);
  const existing = document.getElementById(fontLinkId);

  if (!locale?.font) {
    existing?.remove();
    document.documentElement.style.removeProperty('--locale-font-family');
    return;
  }

  const family = locale.font.replaceAll(' ', '+');
  const href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
  const link = existing || document.createElement('link');
  link.id = fontLinkId;
  link.rel = 'stylesheet';
  link.href = href;
  if (!existing) document.head.appendChild(link);
  document.documentElement.style.setProperty('--locale-font-family', `"${locale.font}"`);
}

function upsertLink(rel, hreflang, href) {
  const selector = `link[rel="${rel}"][hreflang="${hreflang}"]`;
  const link = document.head.querySelector(selector) || document.createElement('link');
  link.rel = rel;
  link.hreflang = hreflang;
  link.href = href;
  if (!link.parentNode) document.head.appendChild(link);
}

function syncHreflangLinks() {
  const { origin, pathname } = window.location;
  supportedLocales.forEach(locale => upsertLink('alternate', locale.code, `${origin}${pathname}?lang=${locale.code}`));
  upsertLink('alternate', 'x-default', `${origin}${pathname}`);
}

export default function I18nDocumentEffects() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const activeLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    document.documentElement.lang = activeLanguage;
    document.documentElement.dir = 'ltr';
    document.documentElement.dataset.locale = activeLanguage;
    window.localStorage.setItem(localeStorageKey, activeLanguage);
    setLocaleFont(activeLanguage);
    syncHreflangLinks();
  }, [i18n.resolvedLanguage, i18n.language]);

  return null;
}
