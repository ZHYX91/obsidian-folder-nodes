Object.defineProperty(window, "matchMedia", {
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});
