import type { FrameSink } from "./types";

// Not in TypeScript's DOM lib yet (Chromium-only File System Access API).
type DirectoryPicker = (options?: {
  mode?: "read" | "readwrite";
}) => Promise<FileSystemDirectoryHandle>;

const getDirectoryPicker = (): DirectoryPicker | null => {
  if (typeof window === "undefined") return null;
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker;
  return typeof picker === "function" ? picker.bind(window) : null;
};

/**
 * Writes each frame as a file in `directory`, replacing files with the same
 * name. Frames already written stay when an export fails or is aborted.
 */
export const createDirectorySink = (directory: FileSystemDirectoryHandle): FrameSink => ({
  async write(name, data) {
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(data);
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    await writable.close();
  },
  async close() {}
});

/** Whether `pickDirectorySink()` can open a folder picker in this browser. */
export const canPickDirectory = (): boolean => getDirectoryPicker() !== null;

/**
 * Asks the user for a folder and returns a sink that writes into it. Call it
 * from a user gesture such as a click. Rejects with an `AbortError` when the
 * picker is dismissed and a `NotSupportedError` where the File System Access
 * API is unavailable (see `canPickDirectory()`).
 */
export const pickDirectorySink = async (): Promise<FrameSink> => {
  const picker = getDirectoryPicker();
  if (!picker) {
    throw new DOMException(
      "This browser cannot pick a folder (File System Access API).",
      "NotSupportedError"
    );
  }
  return createDirectorySink(await picker({ mode: "readwrite" }));
};
