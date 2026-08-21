let language = "en";

export function getLanguage(): string {
  return language;
}

export function setMockLanguage(value: string): void {
  language = value;
}
