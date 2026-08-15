// @requirements REQ-RUNTIME-DELIVERY-009
// Evidence for: REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildSshArgs,
  defaultSshUser,
  evaluateThinHost,
  parseRemoteProbe,
  parseSshTarget,
  redactProbeForLog,
  remoteProbeScript,
  runSshProbe,
} from './verify-single-server-ssh.mjs';

test('SSH target comes from flags or NRB_SSH_* and defaults to deploy user nrb', () => {
  const fromFlags = parseSshTarget({ host: '203.0.113.10', user: 'ops', port: '2222' }, {});
  assert.deepEqual(fromFlags, {
    host: '203.0.113.10',
    user: 'ops',
    port: 2222,
    identity: undefined,
    strictHostKeyChecking: 'yes',
    userKnownHostsFile: undefined,
  });
  const fromEnv = parseSshTarget({}, { NRB_SSH_HOST: '203.0.113.11', NRB_SSH_IDENTITY: '/tmp/id' });
  assert.equal(fromEnv.user, defaultSshUser);
  assert.equal(fromEnv.identity, '/tmp/id');
  assert.throws(() => parseSshTarget({}, {}), /SSH host is required/u);
});

test('CLI ignores a leftover pnpm -- separator', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-single-server-ssh.mjs', '--', '--host=203.0.113.10', '--dry-run'],
    { encoding: 'utf8', cwd: join(import.meta.dirname, '..') },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status": "planned"/u);
});

test('SSH argv is BatchMode, never prints the remote script in dry-run callers', () => {
  const args = buildSshArgs({ host: '203.0.113.10', user: 'nrb', port: 22 });
  assert.equal(args[0], 'ssh');
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('nrb@203.0.113.10'));
  assert.ok(args.at(-1).includes('uname -m'));
  assert.doesNotMatch(args.at(-1), /\bcat\b/u);
});

test('identity files do not force IdentitiesOnly so ssh-add works without a .pub', () => {
  const args = buildSshArgs({ host: '203.0.113.10', user: 'root', port: 22, identity: '/tmp/id_rsa' });
  assert.ok(args.includes('-i'));
  assert.ok(args.includes('/tmp/id_rsa'));
  assert.ok(!args.includes('IdentitiesOnly=yes'));
});

test('remote probe only asks for topology keys, not secret values', () => {
  const script = remoteProbeScript();
  assert.match(script, /IMAGE_TAG\|IMAGE_REGISTRY\|COMPOSE_IMAGE_SOURCE\|RUNTIME_MODE/u);
  assert.doesNotMatch(script, /DATABASE_URL|SECRET|PASSWORD|TOKEN|PRIVATE_KEY/u);
  assert.match(script, /awk/u);
});

test('probe parser redacts credential-bearing registry refs', () => {
  const probe = parseRemoteProbe(
    [
      'arch=x86_64',
      'docker=yes',
      'compose=yes',
      'nx=no',
      'IMAGE_TAG=sha-abc',
      'IMAGE_REGISTRY=https://user:hunter2@ghcr.io/acme',
      'COMPOSE_IMAGE_SOURCE=registry',
      'env_file=present',
    ].join('\n'),
  );
  assert.equal(probe.arch, 'x86_64');
  assert.equal(probe.imageTag, 'sha-abc');
  assert.equal(probe.imageRegistry, 'redacted');
  assert.equal(probe.envFile, true);
  assert.equal(redactProbeForLog(probe).imageRegistry, 'redacted');
});

test('thin host evaluation refuses local compile tags and missing Docker', () => {
  const healthy = evaluateThinHost({
    arch: 'x86_64',
    docker: 'yes',
    compose: 'yes',
    nx: 'no',
    imageSource: 'registry',
    imageTag: 'sha-0123456789abcdef0123456789abcdef01234567',
  });
  assert.equal(healthy.ok, true);
  const localImages = evaluateThinHost({
    arch: 'x86_64',
    docker: 'yes',
    imageSource: 'local',
    imageTag: 'local',
  });
  assert.equal(localImages.ok, false);
  assert.ok(localImages.problems.some((problem) => problem.includes('COMPOSE_IMAGE_SOURCE=local')));
  assert.ok(localImages.problems.some((problem) => problem.includes('IMAGE_TAG')));
  const missingDocker = evaluateThinHost({ arch: 'x86_64', docker: 'no' });
  assert.equal(missingDocker.ok, false);
});

test('thin host evaluation accepts a local Docker name when the tag is an immutable sha', () => {
  const result = evaluateThinHost({
    arch: 'x86_64',
    docker: 'yes',
    compose: 'yes',
    nx: 'no',
    imageSource: 'local',
    imageRegistry: 'dehqonhub-local',
    imageTag: 'sha-01234567abcdef',
  });
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.ok(result.warnings.some((warning) => warning.includes('local Docker name')));
});

test('thin host evaluation fails when local arm64 images meet a foreign arch', () => {
  const result = evaluateThinHost(
    { arch: 'x86_64', docker: 'yes', imageSource: 'registry' },
    { expectArch: 'aarch64' },
  );
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /x86_64/u);
});

test('runSshProbe uses the injected transport and never deploys', () => {
  const calls = [];
  const probe = runSshProbe(
    { host: '203.0.113.10', user: 'nrb', port: 22 },
    {
      spawn: (command, args) => {
        calls.push({ command, args });
        assert.equal(command, 'ssh');
        assert.ok(!args.join(' ').includes('deploy'));
        assert.ok(!args.join(' ').includes('bake'));
        return {
          status: 0,
          stdout: 'arch=x86_64\ndocker=yes\ncompose=yes\nIMAGE_TAG=sha-aa\nCOMPOSE_IMAGE_SOURCE=registry\n',
        };
      },
    },
  );
  assert.equal(probe.docker, 'yes');
  assert.equal(calls.length, 1);
});

test('connects over SSH to a disposable compose host', { timeout: 180_000 }, async (t) => {
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (docker.status !== 0) {
    t.skip('Docker is required for the live SSH probe');
    return;
  }

  const work = mkdtempSync(join(tmpdir(), 'nrb-ssh-probe-'));
  const key = join(work, 'id_ed25519');
  const pub = `${key}.pub`;
  const name = `nrb-ssh-probe-${process.pid}`;
  const keygen = spawnSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', key], { encoding: 'utf8' });
  assert.equal(keygen.status, 0, keygen.stderr);
  const publicKey = readFileSync(pub, 'utf8').trim();

  const run = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
  const started = run(
    'run',
    '-d',
    '--name',
    name,
    '--rm',
    '-p',
    '127.0.0.1::22',
    'alpine:3.21',
    'sh',
    '-c',
    [
      'apk add --no-cache openssh >/dev/null',
      'ssh-keygen -A >/dev/null',
      'adduser -D -s /bin/sh nrb',
      'passwd -u nrb >/dev/null',
      'mkdir -p /home/nrb/.ssh /opt/nest-react-boilerplate /usr/local/bin',
      `printf '%s\\n' '${publicKey.replace(/'/gu, '')}' > /home/nrb/.ssh/authorized_keys`,
      'chown -R nrb:nrb /home/nrb/.ssh',
      'chmod 700 /home/nrb/.ssh',
      'chmod 600 /home/nrb/.ssh/authorized_keys',
      'printf "%s\\n" "#!/bin/sh" "exit 0" > /usr/local/bin/docker',
      'chmod +x /usr/local/bin/docker',
      'printf "%s\\n" "IMAGE_TAG=sha-01234567" "IMAGE_REGISTRY=ghcr.io/example/example" "COMPOSE_IMAGE_SOURCE=registry" "RUNTIME_MODE=compose" "DATABASE_URL=secret" > /opt/nest-react-boilerplate/.env.production',
      'printf "%s\\n" "PasswordAuthentication no" "AllowUsers nrb" >> /etc/ssh/sshd_config',
      'exec /usr/sbin/sshd -D -e',
    ].join(' && '),
  );
  t.after(() => {
    run('rm', '-f', name);
    rmSync(work, { force: true, recursive: true });
  });
  assert.equal(started.status, 0, started.stderr || started.stdout);
  const published = run('port', name, '22/tcp');
  const portMatch = published.stdout.match(/:(\d+)\s*$/mu);
  assert.ok(portMatch, `could not resolve published SSH port: ${published.stdout || published.stderr}`);
  const port = Number(portMatch[1]);

  let connected;
  let lastError = '';
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const ready = run('exec', name, 'pgrep', 'sshd');
    if (ready.status === 0) {
      try {
        connected = runSshProbe({
          host: '127.0.0.1',
          user: 'nrb',
          port,
          identity: key,
          strictHostKeyChecking: 'accept-new',
          userKnownHostsFile: join(work, 'known_hosts'),
        });
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!connected) {
    const logs = run('logs', '--tail', '80', name);
    assert.fail(`SSH probe never connected: ${lastError}\n${logs.stdout || ''}\n${logs.stderr || ''}`);
  }
  assert.ok(connected.arch);
  assert.equal(connected.docker, 'yes');
  assert.equal(connected.imageSource, 'registry');
  assert.equal(connected.imageTag, 'sha-01234567');
  assert.notEqual(connected.imageRegistry, 'secret');
  const evaluation = evaluateThinHost(connected, { expectArch: connected.arch });
  assert.equal(evaluation.ok, true, evaluation.problems.join('; '));
});
