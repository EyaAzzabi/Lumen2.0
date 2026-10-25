let save: (() => Promise<void>) | null = null;
export function registerDraftFlush(handler: () => Promise<void>) {
  save = handler;
  return () => {
    if (save === handler) save = null;
  };
}
export async function flushDraft() {
  await save?.();
}
