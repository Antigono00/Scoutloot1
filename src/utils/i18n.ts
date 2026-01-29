/**
 * ScoutLoot i18n Utility Module
 * 
 * V22.1: Added client-side translations injection for JS
 * 
 * Handles:
 * - Language detection (URL path, Accept-Language header, cookie)
 * - Translation loading and caching
 * - Template rendering with translations
 * - hreflang tag generation
 * - Client-side translations for JavaScript
 */

import { Request } from 'express';
import fs from 'fs';
import path from 'path';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// Language metadata for hreflang and display
export const LANGUAGE_META: Record<SupportedLanguage, { 
  name: string; 
  nativeName: string; 
  hreflang: string;
  flag: string;
}> = {
  en: { name: 'English', nativeName: 'English', hreflang: 'en', flag: '🇬🇧' },
  de: { name: 'German', nativeName: 'Deutsch', hreflang: 'de', flag: '🇩🇪' },
  fr: { name: 'French', nativeName: 'Français', hreflang: 'fr', flag: '🇫🇷' },
  es: { name: 'Spanish', nativeName: 'Español', hreflang: 'es', flag: '🇪🇸' },
  it: { name: 'Italian', nativeName: 'Italiano', hreflang: 'it', flag: '🇮🇹' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', hreflang: 'nl', flag: '🇳🇱' },
  pl: { name: 'Polish', nativeName: 'Polski', hreflang: 'pl', flag: '🇵🇱' },
};

// Country to default language mapping
export const COUNTRY_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  // English
  'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en', 'IE': 'en',
  // German
  'DE': 'de', 'AT': 'de', 'CH': 'de', 'LI': 'de', 'LU': 'de',
  // French
  'FR': 'fr', 'BE': 'fr', 'MC': 'fr',
  // Spanish
  'ES': 'es', 'MX': 'es', 'AR': 'es', 'CL': 'es', 'CO': 'es',
  // Italian
  'IT': 'it', 'SM': 'it', 'VA': 'it',
  // Dutch
  'NL': 'nl',
  // Polish
  'PL': 'pl',
};

// Translation cache
const translationCache: Map<SupportedLanguage, Record<string, unknown>> = new Map();

/**
 * Check if a language code is supported
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

/**
 * Load translations for a language
 */
export function loadTranslations(lang: SupportedLanguage, translationsPath: string): Record<string, unknown> {
  // Check cache first
  if (translationCache.has(lang)) {
    return translationCache.get(lang)!;
  }

  try {
    const filePath = path.join(translationsPath, `${lang}.json`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(content);
    translationCache.set(lang, translations);
    return translations;
  } catch (error) {
    console.error(`[i18n] Failed to load translations for ${lang}:`, error);
    // Fall back to English
    if (lang !== 'en') {
      return loadTranslations('en', translationsPath);
    }
    return {};
  }
}

/**
 * Clear translation cache (for development hot reload)
 */
export function clearTranslationCache(): void {
  translationCache.clear();
}

/**
 * Parse Accept-Language header and return best matching language
 */
export function parseAcceptLanguage(header: string | undefined): SupportedLanguage | null {
  if (!header) return null;

  // Parse header like "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
  const languages = header
    .split(',')
    .map(part => {
      const [langWithRegion, qPart] = part.trim().split(';');
      const lang = langWithRegion.split('-')[0].toLowerCase();
      const q = qPart ? parseFloat(qPart.split('=')[1]) : 1;
      return { lang, q };
    })
    .sort((a, b) => b.q - a.q);

  // Find first supported language
  for (const { lang } of languages) {
    if (isSupportedLanguage(lang)) {
      return lang;
    }
  }

  return null;
}

/**
 * Detect language from request
 * Priority: URL path > Query param (?lang=xx) > Cookie > Accept-Language header > Default
 * 
 * V22.1: Added query parameter support for explicit language switching
 */
export function detectLanguage(req: Request, pathLang?: string): SupportedLanguage {
  // 1. URL path (e.g., /de/, /fr/)
  if (pathLang && isSupportedLanguage(pathLang)) {
    return pathLang;
  }

  // 2. Query parameter (e.g., ?lang=en) - for explicit language switching
  const queryLang = req.query?.lang as string | undefined;
  if (queryLang && isSupportedLanguage(queryLang)) {
    return queryLang;
  }

  // 3. Cookie preference
  const cookieLang = req.cookies?.language;
  if (cookieLang && isSupportedLanguage(cookieLang)) {
    return cookieLang;
  }

  // 4. Accept-Language header
  const headerLang = parseAcceptLanguage(req.headers['accept-language']);
  if (headerLang) {
    return headerLang;
  }

  // 5. Default
  return DEFAULT_LANGUAGE;
}

/**
 * Get translation value by dot notation path
 */
export function getTranslation(
  translations: Record<string, unknown>,
  key: string,
  fallback?: string
): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return fallback ?? key;
    }
  }

  return typeof value === 'string' ? value : (fallback ?? key);
}

/**
 * Generate hreflang tags for SEO
 */
export function generateHreflangTags(currentPath: string, baseUrl: string = 'https://scoutloot.com'): string {
  // Remove any existing language prefix from path
  let cleanPath = currentPath;
  for (const lang of SUPPORTED_LANGUAGES) {
    if (currentPath.startsWith(`/${lang}/`) || currentPath === `/${lang}`) {
      cleanPath = currentPath.slice(lang.length + 1) || '/';
      break;
    }
  }

  // Ensure path starts with /
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }

  const tags: string[] = [];

  // Add hreflang for each language
  for (const lang of SUPPORTED_LANGUAGES) {
    const langPath = lang === 'en' ? cleanPath : `/${lang}${cleanPath === '/' ? '' : cleanPath}`;
    const url = `${baseUrl}${langPath}`;
    tags.push(`<link rel="alternate" hreflang="${LANGUAGE_META[lang].hreflang}" href="${url}">`);
  }

  // Add x-default (points to English)
  tags.push(`<link rel="alternate" hreflang="x-default" href="${baseUrl}${cleanPath}">`);

  return tags.join('\n  ');
}

/**
 * Generate language switcher data
 * V22.1: Added ?lang= query parameter to ensure cookie gets updated on switch
 */
export function getLanguageSwitcherData(currentLang: SupportedLanguage, currentPath: string): Array<{
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  url: string;
  isCurrent: boolean;
}> {
  // Remove any existing language prefix from path
  let cleanPath = currentPath;
  for (const lang of SUPPORTED_LANGUAGES) {
    if (currentPath.startsWith(`/${lang}/`) || currentPath === `/${lang}`) {
      cleanPath = currentPath.slice(lang.length + 1) || '/';
      break;
    }
  }

  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }

  // Remove any existing query parameters from path for clean URLs
  const pathWithoutQuery = cleanPath.split('?')[0];

  return SUPPORTED_LANGUAGES.map(lang => {
    const meta = LANGUAGE_META[lang];
    // For English, use clean path with ?lang=en to ensure cookie update
    // For other languages, use /xx/ prefix with ?lang=xx for consistency
    const basePath = lang === 'en' ? pathWithoutQuery : `/${lang}${pathWithoutQuery === '/' ? '' : pathWithoutQuery}`;
    const url = `${basePath}?lang=${lang}`;
    
    return {
      code: lang,
      name: meta.name,
      nativeName: meta.nativeName,
      flag: meta.flag,
      url,
      isCurrent: lang === currentLang,
    };
  });
}

/**
 * Simple template interpolation
 * Replaces {{key}} or {{nested.key}} with translation values
 */
export function interpolateTemplate(
  template: string,
  translations: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const value = getTranslation(translations, key.trim());
    return value !== key.trim() ? value : match;
  });
}

/**
 * Inject translations into HTML template
 * Replaces data-i18n attributes and {{key}} placeholders
 * Also injects client-side translations for JavaScript
 */
export function injectTranslations(
  html: string,
  translations: Record<string, unknown>,
  lang: SupportedLanguage,
  currentPath: string
): string {
  // 1. Replace {{key}} placeholders
  html = interpolateTemplate(html, translations);

  // 2. Set html lang attribute
  html = html.replace(/<html([^>]*)lang="[^"]*"/, `<html$1lang="${lang}"`);
  html = html.replace(/<html(?![^>]*lang=)/, `<html lang="${lang}"`);

  // 3. Inject hreflang tags (before </head>)
  const hreflangTags = generateHreflangTags(currentPath);
  html = html.replace('</head>', `  ${hreflangTags}\n</head>`);

  // 4. Inject language switcher data as JSON (for JS access)
  const switcherData = getLanguageSwitcherData(lang, currentPath);
  const switcherScript = `<script>window.__SCOUTLOOT_LANG__ = "${lang}"; window.__SCOUTLOOT_LANGUAGES__ = ${JSON.stringify(switcherData)};</script>`;
  html = html.replace('</head>', `  ${switcherScript}\n</head>`);

  // 5. V22.1: Inject client-side translations for JavaScript (toasts, dynamic content)
  // Extract only the keys needed for client-side use to keep payload small
  const clientTranslations: Record<string, unknown> = {
    toasts: translations.toasts || {},
    dashboard: {
      empty_watches: (translations.dashboard as Record<string, unknown>)?.empty_watches || '',
      empty_notifications: (translations.dashboard as Record<string, unknown>)?.empty_notifications || '',
    },
    modals: {
      signup: { creating: ((translations.modals as Record<string, unknown>)?.signup as Record<string, unknown>)?.creating || 'Creating account...' },
      login: { logging_in: ((translations.modals as Record<string, unknown>)?.login as Record<string, unknown>)?.logging_in || 'Logging in...' },
      settings: { saving: ((translations.modals as Record<string, unknown>)?.settings as Record<string, unknown>)?.saving || 'Saving...' },
      change_password: { updating: ((translations.modals as Record<string, unknown>)?.change_password as Record<string, unknown>)?.updating || 'Updating...' },
      delete_account: { deleting: ((translations.modals as Record<string, unknown>)?.delete_account as Record<string, unknown>)?.deleting || 'Deleting...' },
      forgot_password: { sending: ((translations.modals as Record<string, unknown>)?.forgot_password as Record<string, unknown>)?.sending || 'Sending...' },
      reset_password: { resetting: ((translations.modals as Record<string, unknown>)?.reset_password as Record<string, unknown>)?.resetting || 'Resetting...' },
      add_watch: { adding: ((translations.modals as Record<string, unknown>)?.add_watch as Record<string, unknown>)?.adding || 'Adding...' },
      edit_watch: { saving: ((translations.modals as Record<string, unknown>)?.edit_watch as Record<string, unknown>)?.saving || 'Saving...' },
    },
  };
  const translationsScript = `<script>window.__SCOUTLOOT_T__ = ${JSON.stringify(clientTranslations)};</script>`;
  html = html.replace('</head>', `  ${translationsScript}\n</head>`);

  return html;
}

export default {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_META,
  isSupportedLanguage,
  loadTranslations,
  clearTranslationCache,
  detectLanguage,
  getTranslation,
  generateHreflangTags,
  getLanguageSwitcherData,
  interpolateTemplate,
  injectTranslations,
};
