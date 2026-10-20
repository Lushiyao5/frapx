import type { RenderEvent } from "./types";

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};

/** One line per event. On a TTY, frame progress rewrites a single status line. */
export const createReporter = (stream: NodeJS.WriteStream) => {
  const tty = stream.isTTY === true;
  let statusShown = false;

  const line = (text: string) => {
    if (statusShown) stream.write("\r\x1b[2K");
    statusShown = false;
    stream.write(`${text}\n`);
  };

  return (event: RenderEvent) => {
    switch (event.type) {
      case "start": {
        const [first, last] = event.range;
        line(`Rendering ${event.url}`);
        line(`  GPU: ${event.renderer}`);
        line(
          `  Size: ${
            event.resolution
              ? `${event.resolution[0]} × ${event.resolution[1]}`
              : "the page's own (headless: the 1280 × 720 viewport)"
          }`
        );
        line(
          `  Frames ${first}–${last} at ${event.fps} fps: ${event.pending} to render, ${last - first + 1 - event.pending} already done`
        );
        break;
      }
      case "frame": {
        const remaining = event.secondsPerFrame * (event.total - event.completed);
        const text = `  frame ${event.frame} · ${event.completed}/${event.total} · ${event.secondsPerFrame.toFixed(1)}s/frame · ${
          event.completed < event.total ? `about ${formatDuration(remaining)} left` : "done"
        }`;
        if (tty) {
          stream.write(`\r\x1b[2K${text}`);
          statusShown = true;
        } else {
          line(text);
        }
        break;
      }
      case "retry":
        line(`  ${event.reason}; opening the page again (attempt ${event.attempt})`);
        break;
      case "page-error":
        line(`  [page] ${event.message}`);
        break;
      case "encode":
        line(`  Encoded ${event.encoder}: ${event.file}`);
        break;
    }
  };
};
