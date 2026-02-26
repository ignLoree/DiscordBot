const TTS_LANGUAGE_DEFINITIONS = Object.freeze([
  { code: "af", locale: "af-ZA", name: "afrikaans" },
  { code: "am", locale: "am-ET", name: "amarico" },
  { code: "ar", locale: "ar-SA", name: "arabo" },
  { code: "az", locale: "az-AZ", name: "azero" },
  { code: "be", locale: "be-BY", name: "bielorusso" },
  { code: "bg", locale: "bg-BG", name: "bulgaro" },
  { code: "bn", locale: "bn-BD", name: "bengalese" },
  { code: "bs", locale: "bs-BA", name: "bosniaco" },
  { code: "ca", locale: "ca-ES", name: "catalano" },
  { code: "ceb", locale: "ceb-PH", name: "cebuano" },
  { code: "co", locale: "co-FR", name: "corso" },
  { code: "cs", locale: "cs-CZ", name: "ceco" },
  { code: "cy", locale: "cy-GB", name: "gallese" },
  { code: "da", locale: "da-DK", name: "danese" },
  { code: "de", locale: "de-DE", name: "tedesco" },
  { code: "el", locale: "el-GR", name: "greco" },
  { code: "en", locale: "en-US", name: "inglese (usa)" },
  { code: "en-gb", locale: "en-GB", name: "inglese (uk)" },
  { code: "eo", locale: "eo", name: "esperanto" },
  { code: "es", locale: "es-ES", name: "spagnolo" },
  { code: "es-mx", locale: "es-MX", name: "spagnolo (messico)" },
  { code: "et", locale: "et-EE", name: "estone" },
  { code: "eu", locale: "eu-ES", name: "basco" },
  { code: "fa", locale: "fa-IR", name: "persiano" },
  { code: "fi", locale: "fi-FI", name: "finlandese" },
  { code: "fil", locale: "fil-PH", name: "filippino" },
  { code: "fr", locale: "fr-FR", name: "francese" },
  { code: "fr-ca", locale: "fr-CA", name: "francese (canada)" },
  { code: "ga", locale: "ga-IE", name: "irlandese" },
  { code: "gd", locale: "gd-GB", name: "gaelico scozzese" },
  { code: "gl", locale: "gl-ES", name: "galiziano" },
  { code: "gu", locale: "gu-IN", name: "gujarati" },
  { code: "haw", locale: "haw-US", name: "hawaiano" },
  { code: "he", locale: "he-IL", name: "ebraico" },
  { code: "hi", locale: "hi-IN", name: "hindi" },
  { code: "hr", locale: "hr-HR", name: "croato" },
  { code: "hu", locale: "hu-HU", name: "ungherese" },
  { code: "hy", locale: "hy-AM", name: "armeno" },
  { code: "id", locale: "id-ID", name: "indonesiano" },
  { code: "ig", locale: "ig-NG", name: "igbo" },
  { code: "is", locale: "is-IS", name: "islandese" },
  { code: "it", locale: "it-IT", name: "italiano" },
  { code: "ja", locale: "ja-JP", name: "giapponese" },
  { code: "jw", locale: "jw-ID", name: "giavanese" },
  { code: "ka", locale: "ka-GE", name: "georgiano" },
  { code: "kk", locale: "kk-KZ", name: "kazako" },
  { code: "km", locale: "km-KH", name: "khmer" },
  { code: "kn", locale: "kn-IN", name: "kannada" },
  { code: "ko", locale: "ko-KR", name: "coreano" },
  { code: "ku", locale: "ku-TR", name: "curdo" },
  { code: "ky", locale: "ky-KG", name: "kirghiso" },
  { code: "la", locale: "la", name: "latino" },
  { code: "lb", locale: "lb-LU", name: "lussemburghese" },
  { code: "lo", locale: "lo-LA", name: "lao" },
  { code: "lt", locale: "lt-LT", name: "lituano" },
  { code: "lv", locale: "lv-LV", name: "lettone" },
  { code: "mg", locale: "mg-MG", name: "malgascio" },
  { code: "mk", locale: "mk-MK", name: "macedone" },
  { code: "ml", locale: "ml-IN", name: "malayalam" },
  { code: "mn", locale: "mn-MN", name: "mongolo" },
  { code: "mr", locale: "mr-IN", name: "marathi" },
  { code: "ms", locale: "ms-MY", name: "malese" },
  { code: "mt", locale: "mt-MT", name: "maltese" },
  { code: "my", locale: "my-MM", name: "birmano" },
  { code: "ne", locale: "ne-NP", name: "nepalese" },
  { code: "nl", locale: "nl-NL", name: "olandese" },
  { code: "no", locale: "no-NO", name: "norvegese" },
  { code: "pa", locale: "pa-IN", name: "punjabi" },
  { code: "pl", locale: "pl-PL", name: "polacco" },
  { code: "ps", locale: "ps-AF", name: "pashtu" },
  { code: "pt", locale: "pt-PT", name: "portoghese" },
  { code: "pt-br", locale: "pt-BR", name: "portoghese (brasile)" },
  { code: "ro", locale: "ro-RO", name: "rumeno" },
  { code: "ru", locale: "ru-RU", name: "russo" },
  { code: "sd", locale: "sd-PK", name: "sindhi" },
  { code: "si", locale: "si-LK", name: "singalese" },
  { code: "sk", locale: "sk-SK", name: "slovacco" },
  { code: "sl", locale: "sl-SI", name: "sloveno" },
  { code: "sm", locale: "sm-WS", name: "samoano" },
  { code: "sn", locale: "sn-ZW", name: "shona" },
  { code: "so", locale: "so-SO", name: "somalo" },
  { code: "sq", locale: "sq-AL", name: "albanese" },
  { code: "sr", locale: "sr-RS", name: "serbo" },
  { code: "st", locale: "st-ZA", name: "sesotho" },
  { code: "su", locale: "su-ID", name: "sundanese" },
  { code: "sv", locale: "sv-SE", name: "svedese" },
  { code: "sw", locale: "sw-KE", name: "swahili" },
  { code: "ta", locale: "ta-IN", name: "tamil" },
  { code: "te", locale: "te-IN", name: "telugu" },
  { code: "tg", locale: "tg-TJ", name: "tagiko" },
  { code: "th", locale: "th-TH", name: "thailandese" },
  { code: "tr", locale: "tr-TR", name: "turco" },
  { code: "uk", locale: "uk-UA", name: "ucraino" },
  { code: "ur", locale: "ur-PK", name: "urdu" },
  { code: "uz", locale: "uz-UZ", name: "uzbeko" },
  { code: "vi", locale: "vi-VN", name: "vietnamita" },
  { code: "xh", locale: "xh-ZA", name: "xhosa" },
  { code: "yo", locale: "yo-NG", name: "yoruba" },
  { code: "zh", locale: "zh-CN", name: "cinese (semplificato)" },
  { code: "zh-tw", locale: "zh-TW", name: "cinese (tradizionale)" },
  { code: "zu", locale: "zu-ZA", name: "zulu" },
]);

function normalizeSearchKey(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_]+/g, "-")
    .replace(/[^a-z0-9\-\s()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TTS_LANGUAGE_MAP = Object.freeze(
  Object.fromEntries(
    TTS_LANGUAGE_DEFINITIONS.map((item) => [item.code, item.locale]),
  ),
);
const TTS_LANGUAGE_CODES = Object.freeze(Object.keys(TTS_LANGUAGE_MAP));
const TTS_LANGUAGE_LOCALES = Object.freeze(Object.values(TTS_LANGUAGE_MAP));
const TTS_LANGUAGE_OPTIONS = Object.freeze(
  TTS_LANGUAGE_DEFINITIONS.map((item) => ({ ...item })),
);

const LOOKUP = new Map();
for (const item of TTS_LANGUAGE_DEFINITIONS) {
  LOOKUP.set(normalizeSearchKey(item.code), item.code);
  LOOKUP.set(normalizeSearchKey(item.locale), item.code);
  LOOKUP.set(normalizeSearchKey(item.name), item.code);
}

function normalizeTtsLanguageInput(raw) {
  const key = normalizeSearchKey(raw);
  if (!key) return null;

  const byLookup = LOOKUP.get(key);
  if (byLookup) return byLookup;

  if (/^[a-z]{2,3}[-_][a-z]{2}$/i.test(key)) {
    const [lang, region] = key.replace("_", "-").split("-");
    const locale = `${lang.toLowerCase()}-${region.toUpperCase()}`;
    for (const def of TTS_LANGUAGE_DEFINITIONS) {
      if (def.locale.toLowerCase() === locale.toLowerCase()) return def.code;
    }
  }

  return null;
}

function formatTtsLanguageLine(item) {
  return `${item.name} - \`${item.code}\` (\`${item.locale}\`)`;
}

module.exports = {
  TTS_LANGUAGE_MAP,
  TTS_LANGUAGE_CODES,
  TTS_LANGUAGE_LOCALES,
  TTS_LANGUAGE_OPTIONS,
  normalizeTtsLanguageInput,
  formatTtsLanguageLine,
};