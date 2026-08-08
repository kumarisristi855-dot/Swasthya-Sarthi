import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
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

function upsertMeta(selector, attributes) {
  const meta = document.head.querySelector(selector) || document.createElement('meta');
  Object.entries(attributes).forEach(([name, value]) => meta.setAttribute(name, value));
  if (!meta.parentNode) document.head.appendChild(meta);
}

function routeMetadata(pathname) {
  const defaultDescription = 'Discover source-labelled doctors, hospitals, clinics and diagnostic centres near you. Compare healthcare information and check appointment availability.';
  if (pathname.startsWith('/design/')) return { title: 'Care Route Design Validation | Swasthya Sarthi', description: 'Internal Swasthya Sarthi design validation workspace.', noIndex: true };
  if (/^\/(patient|admin)\//.test(pathname) || pathname.startsWith('/doctor/dashboard') || pathname.startsWith('/doctor/pending') || pathname.startsWith('/auth/')) {
    return { title: 'Secure Workspace | Swasthya Sarthi', description: 'Secure Swasthya Sarthi account workspace.', noIndex: true };
  }
  if (pathname.startsWith('/doctor/')) return { title: 'Doctor Profile | Swasthya Sarthi', description: 'Review a doctor profile, hospital affiliation and published appointment information.', noIndex: false };
  if (pathname.startsWith('/hospital/')) return { title: 'Hospital Profile | Swasthya Sarthi', description: 'Review hospital details, verification source, operating hours and listed doctors.', noIndex: false };
  if (pathname.startsWith('/legal/privacy')) return { title: 'Privacy | Swasthya Sarthi', description: 'Read the Swasthya Sarthi privacy information.', noIndex: false };
  if (pathname.startsWith('/legal/terms')) return { title: 'Terms | Swasthya Sarthi', description: 'Read the terms for using Swasthya Sarthi.', noIndex: false };
  if (pathname.startsWith('/legal/security')) return { title: 'Security | Swasthya Sarthi', description: 'Learn how Swasthya Sarthi protects healthcare account information.', noIndex: false };
  if (pathname.startsWith('/login/')) return { title: 'Sign In | Swasthya Sarthi', description: 'Sign in to your secure Swasthya Sarthi workspace.', noIndex: true };
  if (pathname.startsWith('/signup/')) return { title: 'Create Account | Swasthya Sarthi', description: 'Create a Swasthya Sarthi account for your healthcare role.', noIndex: true };
  return { title: 'Swasthya Sarthi | Find Doctors and Hospitals Near You', description: defaultDescription, noIndex: false };
}

function syncRouteMetadata(pathname) {
  const metadata = routeMetadata(pathname);
  const canonicalUrl = `${window.location.origin}${pathname}`;
  const socialImage = `${window.location.origin}/swasthya-sarthi-social.jpg`;
  const canonical = document.head.querySelector('link[rel="canonical"]') || document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = canonicalUrl;
  if (!canonical.parentNode) document.head.appendChild(canonical);

  document.title = metadata.title;
  upsertMeta('meta[name="description"]', { name: 'description', content: metadata.description });
  upsertMeta('meta[name="robots"]', { name: 'robots', content: metadata.noIndex ? 'noindex,nofollow' : 'index,follow' });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: socialImage });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: metadata.title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: metadata.description });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImage });

  const structuredData = document.getElementById('swasthya-sarthi-structured-data') || document.createElement('script');
  structuredData.id = 'swasthya-sarthi-structured-data';
  structuredData.type = 'application/ld+json';
  structuredData.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Swasthya Sarthi',
    url: window.location.origin,
    description: metadata.description,
  });
  if (!structuredData.parentNode) document.head.appendChild(structuredData);
}

export default function I18nDocumentEffects() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  useEffect(() => {
    const activeLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    document.documentElement.lang = activeLanguage;
    document.documentElement.dir = 'ltr';
    document.documentElement.dataset.locale = activeLanguage;
    window.localStorage.setItem(localeStorageKey, activeLanguage);
    setLocaleFont(activeLanguage);
    syncHreflangLinks();
    syncRouteMetadata(pathname);
  }, [i18n.resolvedLanguage, i18n.language, pathname]);

  return null;
}
