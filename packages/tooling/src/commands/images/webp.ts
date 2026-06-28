import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

const imageExtensions = new Set([".png", ".jpg", ".jpeg"]);
const defaultAssetDirectories = [
  "apps/frontend",
  "libs/frontend",
  "packages/tooling/baselines",
];
const defaultIgnoredDirectoryNames = new Set([
  ".git",
  ".nx",
  ".pnpm-store",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "reports",
  "storybook-static",
]);
const defaultIgnoreGlobs = [
  "**/favicon*.png",
  "**/apple-touch-icon*.png",
  "**/android-chrome*.png",
];

type OutputMode = "side-by-side" | "replace";
type PlannedStatus =
  | "would-convert"
  | "converted"
  | "skipped-existing"
  | "skipped-larger"
  | "failed";
type SharpFactory = (input: Buffer) => {
  webp(options: { quality: number }): { toBuffer(): Promise<Buffer> };
};

export interface WebpCommandContext {
  argv: string[];
  workspaceRoot: string;
}

export interface WebpOptions {
  inputPaths: string[];
  ignoreGlobs: string[];
  includeDefaultIgnores: boolean;
  quality: number;
  mode: OutputMode;
  dryRun: boolean;
  check: boolean;
  overwrite: boolean;
  skipLarger: boolean;
}

export interface ImagePlanEntry {
  sourcePath: string;
  outputPath: string;
  relativeSourcePath: string;
  relativeOutputPath: string;
  status: PlannedStatus;
  originalBytes?: number;
  webpBytes?: number;
  error?: string;
}

export interface OptimizeImagesResult {
  filesFound: number;
  entries: ImagePlanEntry[];
}

export interface ImageConverter {
  convertToWebp(input: Buffer, quality: number): Promise<Buffer>;
}

export async function runWebpCommand({
  argv,
  workspaceRoot,
}: WebpCommandContext): Promise<number> {
  let parsed: ReturnType<typeof parseWebpOptions>;

  try {
    parsed = parseWebpOptions(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printWebpHelp();
    return 1;
  }

  if (parsed.help) {
    printWebpHelp();
    return 0;
  }

  if (parsed.error !== undefined) {
    console.error(parsed.error);
    printWebpHelp();
    return 1;
  }

  const options = parsed.options;

  try {
    const result = await optimizeImages({ workspaceRoot, options });
    printResult(result, options);

    const failed = result.entries.some((entry) => entry.status === "failed");
    if (failed) return 1;

    if (
      options.check &&
      result.entries.some((entry) => entry.status === "would-convert")
    ) {
      return 1;
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function optimizeImages({
  workspaceRoot,
  options,
  converter = sharpImageConverter,
}: {
  workspaceRoot: string;
  options: WebpOptions;
  converter?: ImageConverter;
}): Promise<OptimizeImagesResult> {
  const sourcePaths = await discoverImageFiles({ workspaceRoot, options });
  const entries: ImagePlanEntry[] = [];

  for (const sourcePath of sourcePaths) {
    entries.push(
      await processImage({ workspaceRoot, sourcePath, options, converter }),
    );
  }

  return { filesFound: sourcePaths.length, entries };
}

export async function discoverImageFiles({
  workspaceRoot,
  options,
}: {
  workspaceRoot: string;
  options: Pick<
    WebpOptions,
    "inputPaths" | "ignoreGlobs" | "includeDefaultIgnores"
  >;
}): Promise<string[]> {
  const inputRoots = resolveInputRoots(workspaceRoot, options.inputPaths);
  const ignoreMatchers = createIgnoreMatchers(options);
  const files: string[] = [];

  for (const inputRoot of inputRoots) {
    if (!existsSync(inputRoot)) continue;

    const inputStat = await stat(inputRoot);
    if (inputStat.isFile()) {
      if (isImageFile(inputRoot) && !isIgnored(workspaceRoot, inputRoot, ignoreMatchers)) {
        files.push(inputRoot);
      }
      continue;
    }

    if (inputStat.isDirectory()) {
      await walkImages({ workspaceRoot, directory: inputRoot, ignoreMatchers, files });
    }
  }

  return [...new Set(files)].sort((left, right) =>
    relativeToWorkspace(workspaceRoot, left).localeCompare(
      relativeToWorkspace(workspaceRoot, right),
    ),
  );
}

export function parseWebpOptions(
  argv: string[],
): { options: WebpOptions; help?: false; error?: string } | { help: true } {
  const options: WebpOptions = {
    inputPaths: [],
    ignoreGlobs: [],
    includeDefaultIgnores: true,
    quality: 80,
    mode: "side-by-side",
    dryRun: false,
    check: false,
    overwrite: false,
    skipLarger: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === "--") continue;

    if (token === "--help" || token === "-h") return { help: true };

    if (!token.startsWith("--")) {
      options.inputPaths.push(token);
      continue;
    }

    const { name, value, consumedNext } = readOptionValue(argv, index);
    if (consumedNext) index += 1;

    switch (name) {
      case "input":
      case "inputs":
        options.inputPaths.push(...splitOptionList(requiredValue(name, value)));
        break;
      case "ignore":
        options.ignoreGlobs.push(...splitOptionList(requiredValue(name, value)));
        break;
      case "quality": {
        const quality = Number(requiredValue(name, value));
        if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
          return { options, error: "--quality must be an integer from 1 to 100." };
        }
        options.quality = quality;
        break;
      }
      case "mode": {
        const mode = requiredValue(name, value);
        if (mode !== "side-by-side" && mode !== "replace") {
          return { options, error: "--mode must be side-by-side or replace." };
        }
        options.mode = mode;
        break;
      }
      case "replace":
        options.mode = "replace";
        break;
      case "dry-run":
        options.dryRun = true;
        break;
      case "check":
        options.check = true;
        options.dryRun = true;
        break;
      case "overwrite":
        options.overwrite = true;
        break;
      case "no-default-ignores":
        options.includeDefaultIgnores = false;
        break;
      case "skip-larger":
        options.skipLarger = true;
        break;
      case "no-skip-larger":
        options.skipLarger = false;
        break;
      default:
        return { options, error: `Unknown option: --${name}` };
    }
  }

  return { options };
}

const sharpImageConverter: ImageConverter = {
  async convertToWebp(input: Buffer, quality: number): Promise<Buffer> {
    const sharp = await loadSharp();
    return await sharp(input).webp({ quality }).toBuffer();
  },
};

async function processImage({
  workspaceRoot,
  sourcePath,
  options,
  converter,
}: {
  workspaceRoot: string;
  sourcePath: string;
  options: WebpOptions;
  converter: ImageConverter;
}): Promise<ImagePlanEntry> {
  const outputPath = sourcePath.replace(/\.(?:png|jpe?g)$/iu, ".webp");
  const baseEntry = createEntry(workspaceRoot, sourcePath, outputPath);

  if (existsSync(outputPath) && !options.overwrite) {
    return { ...baseEntry, status: "skipped-existing" };
  }

  if (options.dryRun) {
    return { ...baseEntry, status: "would-convert" };
  }

  try {
    const original = await readFile(sourcePath);
    const webp = await converter.convertToWebp(original, options.quality);

    if (options.skipLarger && webp.length >= original.length) {
      return {
        ...baseEntry,
        status: "skipped-larger",
        originalBytes: original.length,
        webpBytes: webp.length,
      };
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, webp);

    if (options.mode === "replace") {
      await unlink(sourcePath);
    }

    return {
      ...baseEntry,
      status: "converted",
      originalBytes: original.length,
      webpBytes: webp.length,
    };
  } catch (error) {
    return {
      ...baseEntry,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createEntry(
  workspaceRoot: string,
  sourcePath: string,
  outputPath: string,
): Omit<ImagePlanEntry, "status"> {
  return {
    sourcePath,
    outputPath,
    relativeSourcePath: relativeToWorkspace(workspaceRoot, sourcePath),
    relativeOutputPath: relativeToWorkspace(workspaceRoot, outputPath),
  };
}

async function walkImages({
  workspaceRoot,
  directory,
  ignoreMatchers,
  files,
}: {
  workspaceRoot: string;
  directory: string;
  ignoreMatchers: RegExp[];
  files: string[];
}): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (defaultIgnoredDirectoryNames.has(entry.name)) continue;
      if (isIgnored(workspaceRoot, entryPath, ignoreMatchers)) continue;
      await walkImages({ workspaceRoot, directory: entryPath, ignoreMatchers, files });
      continue;
    }

    if (entry.isFile() && isImageFile(entryPath) && !isIgnored(workspaceRoot, entryPath, ignoreMatchers)) {
      files.push(entryPath);
    }
  }
}

function resolveInputRoots(workspaceRoot: string, inputPaths: string[]): string[] {
  const requestedInputs = inputPaths.length > 0 ? inputPaths : defaultAssetDirectories;
  return requestedInputs.map((inputPath) =>
    isAbsolute(inputPath) ? inputPath : resolve(workspaceRoot, inputPath),
  );
}

function isImageFile(path: string): boolean {
  return imageExtensions.has(extname(path).toLowerCase());
}

function createIgnoreMatchers(
  options: Pick<WebpOptions, "ignoreGlobs" | "includeDefaultIgnores">,
): RegExp[] {
  const globs = [
    ...(options.includeDefaultIgnores ? defaultIgnoreGlobs : []),
    ...options.ignoreGlobs,
  ];
  return globs.map(globToRegExp);
}

function isIgnored(
  workspaceRoot: string,
  path: string,
  ignoreMatchers: RegExp[],
): boolean {
  const relativePath = relativeToWorkspace(workspaceRoot, path);
  const basename = relativePath.split("/").at(-1) ?? relativePath;
  return ignoreMatchers.some(
    (matcher) => matcher.test(relativePath) || matcher.test(basename),
  );
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replaceAll("\\", "/");
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  return new RegExp(`${source}$`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}

function relativeToWorkspace(workspaceRoot: string, path: string): string {
  const relativePath = relative(workspaceRoot, path).replaceAll("\\", "/");
  return relativePath.startsWith("..") ? path.replaceAll("\\", "/") : relativePath;
}

function readOptionValue(
  argv: string[],
  index: number,
): { name: string; value?: string; consumedNext: boolean } {
  const raw = (argv[index] ?? "").slice(2);
  const equalsIndex = raw.indexOf("=");

  if (equalsIndex >= 0) {
    return {
      name: raw.slice(0, equalsIndex),
      value: raw.slice(equalsIndex + 1),
      consumedNext: false,
    };
  }

  const next = argv[index + 1];
  if (next !== undefined && !next.startsWith("--")) {
    return { name: raw, value: next, consumedNext: true };
  }

  return { name: raw, consumedNext: false };
}

function requiredValue(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}

function splitOptionList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function loadSharp(): Promise<SharpFactory> {
  try {
    const sharpModule = await import("sharp");
    return sharpModule.default as unknown as SharpFactory;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Native image conversion dependency "sharp" is unavailable. Run "pnpm install" in the workspace and ensure pnpm build approval allows sharp. Original error: ${reason}`,
    );
  }
}

function printResult(result: OptimizeImagesResult, options: WebpOptions): void {
  if (result.filesFound === 0) {
    console.log("No PNG/JPG/JPEG assets found.");
    return;
  }

  for (const entry of result.entries) {
    const suffix = formatEntrySuffix(entry, options);
    console.log(
      `${formatStatus(entry.status)} ${entry.relativeSourcePath} -> ${entry.relativeOutputPath}${suffix}`,
    );
  }

  const converted = countStatus(result, "converted");
  const wouldConvert = countStatus(result, "would-convert");
  const failed = countStatus(result, "failed");
  console.log(
    `Summary: found=${result.filesFound} converted=${converted} wouldConvert=${wouldConvert} failed=${failed} mode=${options.mode} quality=${options.quality}`,
  );
}

function formatEntrySuffix(entry: ImagePlanEntry, options: WebpOptions): string {
  if (entry.status === "failed") return ` (${entry.error ?? "conversion failed"})`;
  if (entry.status === "skipped-existing") return " (webp exists; pass --overwrite to replace it)";
  if (entry.status === "skipped-larger") return " (webp was not smaller)";
  if (entry.originalBytes === undefined || entry.webpBytes === undefined) return "";

  const savings = ((1 - entry.webpBytes / entry.originalBytes) * 100).toFixed(0);
  const replaceNote = options.mode === "replace" ? "; source removed" : "";
  return ` (${entry.originalBytes}B -> ${entry.webpBytes}B, ${savings}% saved${replaceNote})`;
}

function formatStatus(status: PlannedStatus): string {
  return `[${status}]`;
}

function countStatus(result: OptimizeImagesResult, status: PlannedStatus): number {
  return result.entries.filter((entry) => entry.status === status).length;
}

function printWebpHelp(): void {
  console.log(`Usage: repo-tooling images webp [input ...] [options]

Find PNG/JPG/JPEG assets and convert them to WebP.

Options:
  --input <path[,path]>       Add input file or directory. Positional inputs are also supported.
  --mode <side-by-side|replace>
                              Output .webp next to originals (default) or remove originals after writing .webp.
  --replace                   Alias for --mode replace.
  --quality <1-100>           WebP quality (default: 80).
  --dry-run                   Print planned conversions without loading sharp or writing files.
  --check                     Dry-run and exit 1 if convertible assets are found.
  --ignore <glob[,glob]>      Ignore matching repo-relative paths. Repeatable.
  --no-default-ignores        Include default favicon/apple/android icon exclusions.
  --overwrite                 Overwrite existing .webp outputs.
  --no-skip-larger            Write WebP even when it is not smaller than the source.

Defaults scan apps/frontend, libs/frontend, and packages/tooling/baselines when present.
Replace mode is never used unless --mode replace or --replace is passed.`);
}
