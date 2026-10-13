// Long enough for the browser to start reading the Blob before it is released.
const REVOKE_DELAY_MS = 10_000;

/** Saves `blob` through the browser's download flow, e.g. a ZIP sink result. */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
