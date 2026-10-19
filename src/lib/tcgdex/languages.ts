export const TCG_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "zh-tw", label: "Chinese (Traditional)" },
  { code: "zh-cn", label: "Chinese (Simplified)" },
] as const;

export type TcgLanguage = (typeof TCG_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: TcgLanguage = "en";

export function isTcgLanguage(value: unknown): value is TcgLanguage {
  return (
    typeof value === "string" &&
    TCG_LANGUAGES.some((language) => language.code === value)
  );
}

export function getLanguageLabel(language: TcgLanguage): string {
  return (
    TCG_LANGUAGES.find((item) => item.code === language)?.label ?? "English"
  );
}
