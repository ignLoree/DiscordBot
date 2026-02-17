const TTS_LANGUAGE_MAP = Object.freeze({
  it: "it-IT",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-PT",
  ru: "ru-RU",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
  ar: "ar-SA",
  nl: "nl-NL",
  pl: "pl-PL",
  tr: "tr-TR",
});

const TTS_LANGUAGE_CODES = Object.freeze(Object.keys(TTS_LANGUAGE_MAP));
const TTS_LANGUAGE_LOCALES = Object.freeze(Object.values(TTS_LANGUAGE_MAP));

function normalizeTtsLanguageInput(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(TTS_LANGUAGE_MAP, value))
    return value;

  for (const [code, locale] of Object.entries(TTS_LANGUAGE_MAP)) {
    if (locale.toLowerCase() === value) return locale;
  }

  if (/^[a-z]{2}[-_][a-z]{2}$/i.test(value)) {
    const [lang, region] = value.replace("_", "-").split("-");
    return `${lang.toLowerCase()}-${region.toUpperCase()}`;
  }

  return null;
}

module.exports = {
  TTS_LANGUAGE_MAP,
  TTS_LANGUAGE_CODES,
  TTS_LANGUAGE_LOCALES,
  normalizeTtsLanguageInput,
};
