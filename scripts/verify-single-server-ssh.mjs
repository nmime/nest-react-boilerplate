#!/usr/bin/env node
/**
 * Read-only SSH probe for a one-VPS compose host.
 *
 * Does not deploy, bake, or print secret values. Use after compiling images
 * elsewhere and pointing the host at published sha-<git-sha> tags.
 *
 *   node scripts/verify-single-server-ssh.mjs --host=203.0.113.10
 *   NRB_SSH_HOST=203.0.113.10 NRB_SSH_USER=nrb node scripts/verify-single-server-ssh.mjs
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const defaultSshUser = 'nrb';
export const defaultSshPort = 22;

export function parseSshTarget(options = {}, env = process.env) {
  const host = options.host ?? env.NRB_SSH_HOST;
  if (!host || String(host).trim() === '') {
    throw new Error('SSH host is required (--host or NRB_SSH_HOST).');
  }
  const port = Number(options.port ?? env.NRB_SSH_PORT ?? defaultSshPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SSH port must be an integer 1-65535 (received ${options.port ?? env.NRB_SSH_PORT}).`);
  }
  return {
    host: String(host).trim(),
    user: String(options.user ?? env.NRB_SSH_USER ?? defaultSshUser).trim() || defaultSshUser,
    port,
    identity: options.identity ?? env.NRB_SSH_IDENTITY,
    strictHostKeyChecking: options.strictHostKeyChecking ?? 'yes',
    userKnownHostsFile: options.userKnownHostsFile,
  };
}

export function remoteProbeScript() {
  return [
    'set +e',
    'printf "arch=%s\\n" "$(uname -m)"',
    'printf "kernel=%s\\n" "$(uname -r)"',
    'printf "docker=%s\\n" "$(command -v docker >/dev/null 2>&1 && echo yes || echo no)"',
    'printf "compose=%s\\n" "$(docker compose version >/dev/null 2>&1 && echo yes || echo no)"',
    'printf "nx=%s\\n" "$(command -v nx >/dev/null 2>&1 && echo yes || echo no)"',
    'printf "nginx=%s\\n" "$(command -v nginx >/dev/null 2>&1 && echo yes || echo no)"',
    'for f in /opt/nest-react-boilerplate/.env.production /etc/nest-react-boilerplate/.env.production; do',
    '  if [ -f "$f" ]; then',
    '    printf "env_file=present\\n"',
    '    awk -F= \'/^(IMAGE_TAG|IMAGE_REGISTRY|COMPOSE_IMAGE_SOURCE|RUNTIME_MODE)=/{print}\' "$f"',
    '    break',
    '  fi',
    'done',
  ].join('\n');
}

export function buildSshArgs(target, remoteCommand = remoteProbeScript()) {
  return [
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    `StrictHostKeyChecking=${target.strictHostKeyChecking ?? 'yes'}`,
    ...(target.userKnownHostsFile ? ['-o', `UserKnownHostsFile=${target.userKnownHostsFile}`] : []),
    // Encrypted keys loaded with ssh-add are offered by the agent. IdentitiesOnly
    // plus a missing .pub makes OpenSSH treat the file as type -1 and skip the agent.
    ...(target.identity ? ['-i', target.identity] : []),
    '-p',
    String(target.port),
    `${target.user}@${target.host}`,
    remoteCommand,
  ];
}

export function parseRemoteProbe(stdout) {
  const probe = {
    arch: undefined,
    kernel: undefined,
    docker: undefined,
    compose: undefined,
    nx: undefined,
    nginx: undefined,
    envFile: false,
    imageTag: undefined,
    imageRegistry: undefined,
    imageSource: undefined,
    runtimeMode: undefined,
  };
  for (const raw of String(stdout ?? '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key === 'arch') probe.arch = value;
    else if (key === 'kernel') probe.kernel = value;
    else if (key === 'docker') probe.docker = value;
    else if (key === 'compose') probe.compose = value;
    else if (key === 'nx') probe.nx = value;
    else if (key === 'nginx') probe.nginx = value;
    else if (key === 'env_file') probe.envFile = value === 'present';
    else if (key === 'IMAGE_TAG') probe.imageTag = value;
    else if (key === 'IMAGE_REGISTRY') {
      probe.imageRegistry = value.includes('@') ? 'redacted' : value;
    } else if (key === 'COMPOSE_IMAGE_SOURCE') probe.imageSource = value;
    else if (key === 'RUNTIME_MODE') probe.runtimeMode = value;
  }
  return probe;
}

export function isImmutableImageTag(tag) {
  return /^sha-[0-9a-f]{8,}$/iu.test(String(tag ?? '').trim());
}

export function evaluateThinHost(probe, { expectArch } = {}) {
  const problems = [];
  const warnings = [];
  if (!probe.arch) problems.push('Remote architecture was not reported.');
  if (expectArch && probe.arch && probe.arch !== expectArch) {
    problems.push(`Remote architecture is ${probe.arch}; expected ${expectArch} for these images.`);
  }
  if (probe.docker !== 'yes') problems.push('Docker is missing; the compose one-VPS path cannot pull images.');
  if (probe.imageTag === 'local' || (probe.imageTag && !isImmutableImageTag(probe.imageTag))) {
    problems.push('IMAGE_TAG must be a sha-<git-sha> pin on the one-VPS path; IMAGE_TAG=local is refused.');
  }
  if (probe.imageSource === 'local' && !isImmutableImageTag(probe.imageTag)) {
    problems.push('COMPOSE_IMAGE_SOURCE=local is refused on the one-VPS path; pull published sha-<git-sha> tags.');
  } else if (probe.imageSource === 'local' && isImmutableImageTag(probe.imageTag)) {
    warnings.push(
      'COMPOSE_IMAGE_SOURCE=local with a sha-<git-sha> pin uses a local Docker name, not a pull registry. The host must not bake; images should already be loaded.',
    );
  }
  if (probe.nx === 'yes') {
    warnings.push('nx is on PATH; the thin compose host should not compile.');
  }
  return { ok: problems.length === 0, problems, warnings, probe };
}

export function redactProbeForLog(probe) {
  const copy = { ...probe };
  if (copy.imageRegistry && copy.imageRegistry !== 'redacted' && copy.imageRegistry.includes('@')) {
    copy.imageRegistry = 'redacted';
  }
  for (const key of Object.keys(copy)) {
    if (
      ![
        'arch',
        'kernel',
        'docker',
        'compose',
        'nx',
        'nginx',
        'envFile',
        'imageTag',
        'imageRegistry',
        'imageSource',
        'runtimeMode',
      ].includes(key)
    ) {
      delete copy[key];
    }
  }
  return copy;
}

function parseCli(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') continue;
    if (item === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (item === '--help' || item === '-h') {
      options.help = true;
      continue;
    }
    const [flag, inline] = item.includes('=') ? item.split(/=(.*)/su) : [item, undefined];
    const take = () => {
      const value = inline ?? argv[(index += 1)];
      if (!value || String(value).startsWith('--')) throw new Error(`${flag} requires a value.`);
      return value;
    };
    if (flag === '--host') options.host = take();
    else if (flag === '--user') options.user = take();
    else if (flag === '--port') options.port = take();
    else if (flag === '--identity') options.identity = take();
    else if (flag === '--expect-arch') options.expectArch = take();
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

export function runSshProbe(target, { spawn = spawnSync, remoteCommand = remoteProbeScript() } = {}) {
  const args = buildSshArgs(target, remoteCommand);
  const result = spawn(args[0], args.slice(1), { encoding: 'utf8' });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`SSH probe failed (${result.status ?? 1})${detail ? `: ${detail.split('\n')[0]}` : ''}.`);
  }
  return parseRemoteProbe(result.stdout);
}

function usage() {
  console.log(`Usage: node scripts/verify-single-server-ssh.mjs --host=<ip> [--user=nrb] [--port=22] [--identity=<key>] [--expect-arch=x86_64] [--dry-run]

Read-only SSH inspection of a one-VPS compose host. Does not deploy or bake.`);
}

function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (options.help) {
    usage();
    return 0;
  }
  const target = parseSshTarget(options);
  const args = buildSshArgs(target);
  if (options.dryRun) {
    console.log(JSON.stringify({ status: 'planned', ssh: args.slice(0, -1).concat(['<remote-probe>']) }, null, 2));
    return 0;
  }
  const probe = runSshProbe(target);
  const evaluation = evaluateThinHost(probe, { expectArch: options.expectArch });
  console.log(
    JSON.stringify(
      { status: evaluation.ok ? 'ok' : 'failed', ...evaluation, probe: redactProbeForLog(probe) },
      null,
      2,
    ),
  );
  if (!evaluation.ok) {
    for (const problem of evaluation.problems) console.error(problem);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
