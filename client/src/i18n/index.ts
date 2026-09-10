import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ur from './ur.json';

// i18n scaffold: UI strings are externalized to en.json / ur.json.
// Note: the layout stays LTR even in Urdu for prototype simplicity.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
  lng: localStorage.getItem('hsms_lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function toggleLanguage() {
  const next = i18n.language === 'en' ? 'ur' : 'en';
  localStorage.setItem('hsms_lang', next);
  i18n.changeLanguage(next);
}

export default i18n;
