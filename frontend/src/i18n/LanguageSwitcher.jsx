import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supportedLocales } from './index';

export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation('common');
  const value = i18n.resolvedLanguage || i18n.language || 'en';

  return (
    <label className={`language-switcher ${compact ? 'language-switcher-compact' : ''}`}>
      <span className="sr-only">{t('selectLanguage')}</span>
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      <select
        value={value}
        onChange={event => i18n.changeLanguage(event.target.value)}
        aria-label={t('selectLanguage')}
      >
        {supportedLocales.map(locale => (
          <option key={locale.code} value={locale.code}>
            {locale.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
