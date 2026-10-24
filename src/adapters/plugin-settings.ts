interface SettingsApi { open(): void; openTabById(id: string): void }

/** Optional host settings API; callers provide a useful fallback on older hosts. */
export function openPluginSettings(app: unknown, pluginId: string): boolean {
  if (typeof app !== "object" || app === null || !("setting" in app)) return false;
  const settings = app.setting;
  if (typeof settings !== "object" || settings === null
    || !("open" in settings) || typeof settings.open !== "function"
    || !("openTabById" in settings) || typeof settings.openTabById !== "function") return false;
  const api = settings as SettingsApi;
  api.open();
  api.openTabById(pluginId);
  return true;
}
