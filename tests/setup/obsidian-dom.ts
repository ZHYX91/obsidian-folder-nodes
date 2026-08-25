Object.defineProperty(window, "matchMedia", {
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});

interface DomOptions { attr?: Record<string, string>; cls?: string | string[]; text?: string; }

function applyOptions(element: HTMLElement, options: DomOptions = {}): HTMLElement {
  if (options.cls !== undefined) element.classList.add(...(Array.isArray(options.cls) ? options.cls : options.cls.split(" ").filter(Boolean)));
  if (options.text !== undefined) element.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
  return element;
}

Object.defineProperties(HTMLElement.prototype, {
  addClass: { value(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes); } },
  createDiv: { value(this: HTMLElement, options?: DomOptions) { const child = applyOptions(this.ownerDocument.createElement("div"), options); this.append(child); return child; } },
  createEl: { value(this: HTMLElement, tag: string, options?: DomOptions) { const child = applyOptions(this.ownerDocument.createElement(tag), options); this.append(child); return child; } },
  createSpan: { value(this: HTMLElement, options?: DomOptions) { const child = applyOptions(this.ownerDocument.createElement("span"), options); this.append(child); return child; } },
  empty: { value(this: HTMLElement) { this.replaceChildren(); } },
  instanceOf: { value(this: HTMLElement, constructor: typeof HTMLElement) { return this instanceof constructor; } },
  removeClass: { value(this: HTMLElement, ...classes: string[]) { this.classList.remove(...classes); } },
  setAttr: { value(this: HTMLElement, name: string, value: string) { this.setAttribute(name, value); } },
  setText: { value(this: HTMLElement, value: string) { this.textContent = value; } },
  toggleClass: { value(this: HTMLElement, name: string, value: boolean) { this.classList.toggle(name, value); } },
});
