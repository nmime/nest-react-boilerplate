#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = 'v0.8.0';
const releaseBase = `https://github.com/yannh/kubeconform/releases/download/${version}`;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const artifacts = {
  'darwin-arm64': {
    asset: 'kubeconform-darwin-arm64.tar.gz',
    sha256: 'f84f4dfbebf4a6b0b230385fa065a39ea35e02608c2b50d025dcf64775a69d67',
  },
  'darwin-x64': {
    asset: 'kubeconform-darwin-amd64.tar.gz',
    sha256: '71dbc87ac9f24099a62b93570e65aa06312ba6ac8aea63b7f86e9d999edf5a92',
  },
  'linux-arm64': {
    asset: 'kubeconform-linux-arm64.tar.gz',
    sha256: '1f53fc8e81258197a35e8603054162a5af1de8c5af13746c71ab680d9534ed87',
  },
  'linux-x64': {
    asset: 'kubeconform-linux-amd64.tar.gz',
    sha256: '9bc2bffbf71f261128533edaf912153948b7ff238f9a531ae6d34466ec287883',
  },
};

function parseArgs(argv) {
  const result = {
    installDir: join(repositoryRoot, '.cache', 'tools', 'kubeconform', version),
    printPath: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--install-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--install-dir requires a path');
      result.installDir = resolve(value);
      index += 1;
    } else if (argument === '--print-path') {
      result.printPath = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function platformArtifact() {
  const key = `${process.platform}-${process.arch}`;
  const artifact = artifacts[key];
  if (!artifact) {
    throw new Error(`Unsupported kubeconform platform: ${key}. Install ${version} manually and set KUBECONFORM_BIN.`);
  }
  return artifact;
}

async function install({ installDir }) {
  const binary = join(installDir, 'kubeconform');
  const metadata = join(installDir, 'metadata.json');
  const artifact = platformArtifact();

  if (existsSync(binary) && existsSync(metadata)) {
    const cached = JSON.parse(readFileSync(metadata, 'utf8'));
    if (
      cached.version === version &&
      cached.asset === artifact.asset &&
      cached.binarySha256 === sha256(readFileSync(binary))
    ) {
      return binary;
    }
  }

  const response = await fetch(`${releaseBase}/${artifact.asset}`);
  if (!response.ok) throw new Error(`Unable to download kubeconform: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actualArchiveSha256 = sha256(archive);
  if (actualArchiveSha256 !== artifact.sha256) {
    throw new Error(
      `kubeconform archive checksum mismatch: expected ${artifact.sha256}, received ${actualArchiveSha256}`,
    );
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-kubeconform-'));
  try {
    const archivePath = join(temporaryDirectory, artifact.asset);
    writeFileSync(archivePath, archive);
    const extraction = spawnSync('tar', ['-xzf', archivePath, '-C', temporaryDirectory], {
      encoding: 'utf8',
    });
    if (extraction.status !== 0) {
      throw new Error(`Unable to extract kubeconform: ${extraction.stderr.trim() || 'tar failed'}`);
    }

    const extractedBinary = join(temporaryDirectory, 'kubeconform');
    if (!existsSync(extractedBinary)) throw new Error('kubeconform archive did not contain the expected binary');
    mkdirSync(installDir, { recursive: true });
    copyFileSync(extractedBinary, binary);
    chmodSync(binary, 0o755);
    writeFileSync(
      metadata,
      `${JSON.stringify(
        {
          asset: artifact.asset,
          archiveSha256: artifact.sha256,
          binarySha256: sha256(readFileSync(binary)),
          version,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  return binary;
}

const args = parseArgs(process.argv.slice(2));
const binary = await install(args);
if (args.printPath) {
  process.stdout.write(`${binary}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ binary, status: 'ok', version })}\n`);
}
