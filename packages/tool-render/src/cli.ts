#!/usr/bin/env node
import { createRequire } from "node:module";
import { UsageError, parseCliArgs, usage } from "./args";
import { formatDuration, createReporter } from "./progress";
import { render } from "./render";

const main = async (): Promise<number> => {
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`frapx-render: ${error.message}\n\n${usage}\n`);
    return 2;
  }
  if (parsed.kind === "help") {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  if (parsed.kind === "version") {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    process.stdout.write(`${version}\n`);
    return 0;
  }

  // The first Ctrl-C stops between frames; a second one exits at once.
  const controller = new AbortController();
  process.on("SIGINT", () => {
    if (controller.signal.aborted) process.exit(130);
    process.stderr.write("\nStopping… (Ctrl-C again to quit now)\n");
    controller.abort();
  });

  const report = createReporter(process.stderr);
  const started = performance.now();
  try {
    const result = await render(parsed.options, { signal: controller.signal, onEvent: report });
    process.stderr.write(
      `Wrote ${result.rendered} frames to ${result.out} in ${formatDuration((performance.now() - started) / 1000)}.\n`
    );
    return 0;
  } catch (error) {
    if (controller.signal.aborted) {
      process.stderr.write(`Stopped. Run again with --resume to continue.\n`);
      return 130;
    }
    process.stderr.write(`\nfrapx-render: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

process.exitCode = await main();
