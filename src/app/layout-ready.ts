interface LayoutReadyHost {
  layoutReady: boolean;
  onLayoutReady(callback: () => void): void;
}

export function onLayoutReadyOnce(host: LayoutReadyHost, callback: () => void): void {
  let completed = false;
  const run = (): void => {
    if (completed) return;
    completed = true;
    callback();
  };

  host.onLayoutReady(run);
  if (host.layoutReady) run();
  else queueMicrotask(() => {
    if (host.layoutReady) run();
  });
}
