export function getBrowserLang() {
  const lang = navigator.language || navigator.userLanguage || "en";
  if (lang.startsWith("ja")) return "ja";
  return "en";
}
