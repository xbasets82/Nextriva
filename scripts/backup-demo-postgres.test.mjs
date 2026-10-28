import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectRetainedBackups } from './backup-demo-postgres.mjs';
import {
  backupDemoPostgres,
  createDockerDump,
  createProtonTransport,
  protonCommandEnvironment,
} from './backup-demo-postgres.mjs';
import {
  forgetProtonGpg,
  gpgCommandEnvironment,
  unlockProtonGpg,
} from './proton-gpg-credentials.mjs';
import {
  mkdtemp,
  readFile,
  writeFile,
  stat,
  chmod,
  symlink,
  mkdir,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const record = (day, suffix = '0') => ({
  name: `nextriva_demo-${day}T020000Z-${suffix.repeat(32)}.dump`,
  createdAt: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T02:00:00.000Z`,
  sha256: 'a'.repeat(64),
});

test('Proton child process selects the pass credential store', () => {
  assert.deepEqual(protonCommandEnvironment('/home/ubuntu', {}), {
    PATH: '/usr/bin:/bin',
    HOME: '/home/ubuntu',
    LANG: 'C.UTF-8',
    PROTON_DRIVE_CREDENTIALS_STORE: 'pass',
  });
});

test('GPG and Proton forward only the configured agent paths and omit unrelated secrets', () => {
  const source = {
    GNUPGHOME: '/home/ubuntu/.gnupg',
    XDG_RUNTIME_DIR: '/run/user/1000',
    DATABASE_URL: 'synthetic-secret',
    NEXTRIVA_GPG_PASSPHRASE: 'synthetic-secret',
    PATH: '/untrusted/bin',
  };
  const expected = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/ubuntu',
    LANG: 'C.UTF-8',
    GNUPGHOME: '/home/ubuntu/.gnupg',
    XDG_RUNTIME_DIR: '/run/user/1000',
  };
  assert.deepEqual(gpgCommandEnvironment('/home/ubuntu', source), expected);
  assert.deepEqual(protonCommandEnvironment('/home/ubuntu', source), {
    ...expected,
    PROTON_DRIVE_CREDENTIALS_STORE: 'pass',
  });
});

test('GPG and Proton reject noncanonical or injected agent paths', () => {
  for (const value of [
    'relative',
    '/run/../tmp',
    '/run//user/1000',
    '/run/user/1000\n',
    '/run/user/1000\0',
  ]) {
    for (const name of ['GNUPGHOME', 'XDG_RUNTIME_DIR']) {
      assert.throws(
        () => gpgCommandEnvironment('/home/ubuntu', { [name]: value }),
        /Invalid GPG environment/,
      );
      assert.throws(
        () => protonCommandEnvironment('/home/ubuntu', { [name]: value }),
        /Invalid GPG environment/,
      );
    }
  }
});

test('systemd GPG unlock passes its credential only on stdin to gpg-preset-passphrase', async (t) => {
  const credentialsDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'nextriva-credentials-')),
  );
  await chmod(credentialsDirectory, 0o700);
  t.after(() => rm(credentialsDirectory, { recursive: true, force: true }));
  const credentialPath = join(credentialsDirectory, 'proton-gpg-passphrase');
  await writeFile(credentialPath, 'synthetic passphrase', { mode: 0o400 });
  const calls = [];
  let passedInput;
  await unlockProtonGpg(
    {
      credentialsDirectory,
      keygrip: 'a'.repeat(40),
      executable: '/usr/lib/gnupg/gpg-preset-passphrase',
    },
    async (command) => {
      passedInput = command.input;
      calls.push({ ...command, input: Buffer.from(command.input) });
    },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--preset', 'a'.repeat(40)]);
  assert.equal(calls[0].input.toString(), 'synthetic passphrase');
  assert.equal(JSON.stringify(calls[0].args).includes('synthetic'), false);
  assert.equal(
    passedInput.every((byte) => byte === 0),
    true,
  );
});

test('systemd GPG cleanup clears only the configured keygrip through the agent', async () => {
  const calls = [];
  await forgetProtonGpg(
    {
      keygrip: 'b'.repeat(40),
      executable: '/usr/bin/gpg-connect-agent',
    },
    async (command) => calls.push(command),
  );
  assert.deepEqual(calls, [
    {
      executable: '/usr/bin/gpg-connect-agent',
      args: ['CLEAR_PASSPHRASE ' + 'b'.repeat(40), '/bye'],
    },
  ]);
});

test('systemd GPG cleanup rejects invalid executables and keygrips before running', async () => {
  for (const options of [
    { executable: 'gpg-connect-agent', keygrip: 'a'.repeat(40) },
    {
      executable: '/usr/bin/../bin/gpg-connect-agent',
      keygrip: 'a'.repeat(40),
    },
    { executable: '/usr/bin/gpg-preset-passphrase', keygrip: 'a'.repeat(40) },
    { executable: '/usr/unsafe\n/gpg-connect-agent', keygrip: 'a'.repeat(40) },
    {
      executable: '/usr/bin/gpg-connect-agent',
      keygrip: 'a'.repeat(40) + '\n',
    },
  ]) {
    let called = false;
    await assert.rejects(
      forgetProtonGpg(options, async () => {
        called = true;
      }),
    );
    assert.equal(called, false);
  }
});

test('systemd GPG cleanup CLI suppresses agent output and forwards only the validated command', async (t) => {
  const { options } = await gpgFixture(t);
  const executable = join(options.credentialsDirectory, 'gpg-connect-agent');
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdout.write('OK\\n');\nprocess.stderr.write('synthetic-sensitive-error');\nprocess.exitCode = process.argv.slice(2).join('|') === 'CLEAR_PASSPHRASE ${options.keygrip}|/bye' ? 0 : 1;\n`,
    { mode: 0o700 },
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./proton-gpg-credentials.mjs', import.meta.url)),
      'forget',
    ],
    {
      env: {
        NEXTRIVA_GPG_KEYGRIP: options.keygrip,
        NEXTRIVA_GPG_AGENT_EXECUTABLE: executable,
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('systemd GPG cleanup rejects Assuan errors, missing acknowledgement and overflow despite exit zero', async (t) => {
  for (const output of [
    'OK Pleased to meet you\nERR 67108949 synthetic-sensitive-error\n',
    'OK Pleased to meet you\n',
    '',
    'OK\nERR synthetic-sensitive-error\n',
    'x'.repeat(5000),
  ]) {
    const { options } = await gpgFixture(t);
    const executable = join(options.credentialsDirectory, 'gpg-connect-agent');
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)});\n`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./proton-gpg-credentials.mjs', import.meta.url)),
        'forget',
      ],
      {
        env: {
          NEXTRIVA_GPG_KEYGRIP: options.keygrip,
          NEXTRIVA_GPG_AGENT_EXECUTABLE: executable,
        },
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'GPG credential operation failed\n');
  }
});

async function gpgFixture(t, content = 'synthetic-passphrase') {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'nextriva-gpg-test-')),
  );
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'proton-gpg-passphrase');
  await writeFile(path, content, { mode: 0o400 });
  return {
    path,
    options: {
      credentialsDirectory: directory,
      keygrip: 'a'.repeat(40),
      executable: '/usr/lib/gnupg/gpg-preset-passphrase',
    },
  };
}

test('systemd GPG accepts a read-only 0440 credential from LoadCredentialEncrypted', async (t) => {
  const { path, options } = await gpgFixture(t);
  await chmod(path, 0o440);
  let called = false;
  await unlockProtonGpg(options, async (command) => {
    called = true;
    assert.equal(command.input.toString(), 'synthetic-passphrase');
  });
  assert.equal(called, true);
});

test('systemd GPG rejects writable, executable, unreadable or world-accessible credentials', async (t) => {
  for (const mode of [0o000, 0o200, 0o600, 0o640, 0o500, 0o410, 0o404, 0o444]) {
    const { path, options } = await gpgFixture(t);
    await chmod(path, mode);
    let called = false;
    await assert.rejects(
      unlockProtonGpg(options, async () => {
        called = true;
      }),
      { message: 'GPG credential unlock failed' },
    );
    assert.equal(called, false);
  }
});

test('systemd GPG rejects invalid keygrips before reading or running', async () => {
  for (const keygrip of [
    undefined,
    '',
    'a'.repeat(39),
    'z'.repeat(40),
    'a'.repeat(40) + '\n',
  ]) {
    let called = false;
    await assert.rejects(
      unlockProtonGpg(
        { keygrip, executable: '/usr/lib/gnupg/gpg-preset-passphrase' },
        async () => {
          called = true;
        },
      ),
      { message: 'Invalid GPG preset configuration' },
    );
    assert.equal(called, false);
  }
});

test('systemd GPG rejects empty, symlinked or shared credential files', async (t) => {
  for (const variant of ['empty', 'symlink', 'permissions']) {
    const { path, options } = await gpgFixture(
      t,
      variant === 'empty' ? '' : 'synthetic-passphrase',
    );
    if (variant === 'symlink') {
      const target = join(options.credentialsDirectory, 'target');
      await writeFile(target, 'synthetic-passphrase', { mode: 0o600 });
      await rm(path);
      await symlink(target, path);
    } else if (variant === 'permissions') await chmod(path, 0o640);
    let called = false;
    await assert.rejects(
      unlockProtonGpg(options, async () => {
        called = true;
      }),
      { message: 'GPG credential unlock failed' },
    );
    assert.equal(called, false);
  }
});

test('systemd GPG sanitizes executable failure and wipes its input buffer', async (t) => {
  const { options } = await gpgFixture(t);
  let input;
  await assert.rejects(
    unlockProtonGpg(options, async (command) => {
      input = command.input;
      assert.deepEqual(command.args, ['--preset', options.keygrip]);
      assert.deepEqual(Object.keys(command).sort(), [
        'args',
        'executable',
        'input',
      ]);
      throw new Error(input.toString());
    }),
    { message: 'GPG credential unlock failed' },
  );
  assert.equal(input.length > 0, true);
  assert.equal(
    input.every((byte) => byte === 0),
    true,
  );
});

test('systemd GPG CLI suppresses executable stdout and stderr containing its input', async (t) => {
  const { options } = await gpgFixture(t);
  const executable = join(
    options.credentialsDirectory,
    'gpg-preset-passphrase',
  );
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdin.on('data', (chunk) => { process.stdout.write(chunk); process.stderr.write(chunk); });\nprocess.stdin.on('end', () => { process.exitCode = 23; });\n`,
    { mode: 0o700 },
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./proton-gpg-credentials.mjs', import.meta.url)),
      'unlock',
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        CREDENTIALS_DIRECTORY: options.credentialsDirectory,
        NEXTRIVA_GPG_KEYGRIP: options.keygrip,
        NEXTRIVA_GPG_PRESET_EXECUTABLE: executable,
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'GPG credential operation failed\n');
});

test('systemd GPG CLI forwards agent paths without inheriting secrets or invoking a shell', async (t) => {
  const { options } = await gpgFixture(t);
  const executable = join(
    options.credentialsDirectory,
    'gpg-preset-passphrase',
  );
  await writeFile(
    executable,
    `#!${process.execPath}\nlet input = '';\nprocess.stdin.on('data', (chunk) => { input += chunk; });\nprocess.stdin.on('end', () => {\n  const valid = process.env.GNUPGHOME === '/home/ubuntu/.gnupg' && process.env.XDG_RUNTIME_DIR === '/run/user/1000' && process.env.DATABASE_URL === undefined && process.env.CREDENTIALS_DIRECTORY === undefined && process.argv.slice(2).join(' ') === '--preset ${options.keygrip}' && input === 'synthetic-passphrase';\n  process.exitCode = valid ? 0 : 1;\n});\n`,
    { mode: 0o700 },
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./proton-gpg-credentials.mjs', import.meta.url)),
      'unlock',
    ],
    {
      env: {
        CREDENTIALS_DIRECTORY: options.credentialsDirectory,
        NEXTRIVA_GPG_KEYGRIP: options.keygrip,
        NEXTRIVA_GPG_PRESET_EXECUTABLE: executable,
        GNUPGHOME: '/home/ubuntu/.gnupg',
        XDG_RUNTIME_DIR: '/run/user/1000',
        DATABASE_URL: 'synthetic-secret',
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('systemd service starts the agent before unlock and always configures credential cleanup', async () => {
  const service = await readFile(
    new URL('../deploy/systemd/nextriva-demo-backup.service', import.meta.url),
    'utf8',
  );
  const lines = service.split('\n');
  assert.equal(lines.includes('User=ubuntu'), true);
  assert.equal(
    lines.includes(
      'LoadCredentialEncrypted=proton-gpg-passphrase:/etc/credstore.encrypted/nextriva-proton-gpg-passphrase',
    ),
    true,
  );
  const starts = lines.filter(
    (line) => line.startsWith('ExecStartPre=') || line.startsWith('ExecStart='),
  );
  assert.deepEqual(starts, [
    'ExecStartPre=/usr/bin/gpgconf --launch gpg-agent',
    'ExecStartPre=/home/ubuntu/.local/lib/node-v24.22.0-linux-x64/bin/node /opt/nextriva/backup/proton-gpg-credentials.mjs unlock',
    'ExecStart=/home/ubuntu/.local/lib/node-v24.22.0-linux-x64/bin/node /opt/nextriva/backup/run-demo-backup.mjs',
  ]);
  assert.equal(
    lines.includes(
      'ExecStopPost=/home/ubuntu/.local/lib/node-v24.22.0-linux-x64/bin/node /opt/nextriva/backup/proton-gpg-credentials.mjs forget',
    ),
    true,
  );
  assert.equal(
    lines.includes(
      'Environment=NEXTRIVA_GPG_AGENT_EXECUTABLE=/usr/bin/gpg-connect-agent',
    ),
    true,
  );
  assert.equal(lines.includes('NoNewPrivileges=true'), false);
  assert.equal(lines.includes('TimeoutStartSec=15min'), true);
  assert.equal(lines.includes('UMask=0077'), true);
  assert.equal(
    lines.some((line) =>
      /^Exec.*(?:\/bin\/(?:ba)?sh| --passphrase)/u.test(line),
    ),
    false,
  );
  assert.equal(service.includes('[Install]'), false);
});

test('systemd timer has a UTC daily schedule, persistence and bounded random delay', async () => {
  const timer = await readFile(
    new URL('../deploy/systemd/nextriva-demo-backup.timer', import.meta.url),
    'utf8',
  );
  const lines = timer.split('\n');
  assert.equal(lines.includes('OnCalendar=*-*-* 02:00:00 UTC'), true);
  assert.equal(lines.includes('Persistent=true'), true);
  assert.equal(lines.includes('RandomizedDelaySec=15min'), true);
  assert.equal(lines.includes('Unit=nextriva-demo-backup.service'), true);
  assert.equal(lines.includes('WantedBy=timers.target'), true);
});

test('Proton stages exact names, downloads into a private folder, and only trashes exact paths', async (t) => {
  const { root } = await fixture(t);
  const calls = [];
  const name = record('20261025').name;
  const source = join(root, 'source dump;$(touch injected).dump');
  const target = join(root, 'download.dump');
  await writeFile(source, 'synthetic data', { mode: 0o600 });
  await writeFile(target, '', { mode: 0o600 });
  const remoteDirectory = '/Backups/Nextriva demo;$(touch injected)';
  const executable = '/home/ubuntu/Proton CLI/proton-drive';
  const transport = createProtonTransport(
    { executable, remoteDirectory },
    async (command) => {
      calls.push(command);
      if (command.args[1] === 'upload') {
        assert.equal(basename(command.args.at(-2)), name);
        assert.equal(
          await readFile(command.args.at(-2), 'utf8'),
          'synthetic data',
        );
        assert.equal((await stat(command.args.at(-2))).mode & 0o777, 0o600);
      }
      if (command.args[1] === 'download') {
        const directory = command.args.at(-1);
        assert.equal((await stat(directory)).mode & 0o777, 0o700);
        await writeFile(join(directory, name), 'synthetic data');
      }
    },
    () => 'ubuntu',
  );
  await transport.upload(source, name);
  await transport.download(name, target);
  await transport.trash(name);
  assert.equal(await readFile(target, 'utf8'), 'synthetic data');
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  const flags = [
    '--file-conflict-strategy',
    'skip',
    '--folder-conflict-strategy',
    'skip',
  ];
  assert.deepEqual(calls[0].args.slice(0, -2), [
    'filesystem',
    'upload',
    ...flags,
  ]);
  assert.equal(calls[0].args.at(-1), remoteDirectory);
  assert.deepEqual(calls[1].args.slice(0, -1), [
    'filesystem',
    'download',
    ...flags,
    `${remoteDirectory}/${name}`,
  ]);
  assert.deepEqual(calls[2].args, [
    'filesystem',
    'trash',
    `${remoteDirectory}/${name}`,
  ]);
  assert.equal(
    calls.every(
      (call) => call.executable === executable && call.shell === false,
    ),
    true,
  );
  assert.equal(
    calls.some(
      (call) => call.args.includes('delete') || call.args.includes('sudo'),
    ),
    false,
  );
});

test('Proton rejects unsafe configuration, names and non-ubuntu user before commands', async () => {
  const config = {
    executable: '/home/ubuntu/.local/bin/proton-drive',
    remoteDirectory: '/Backups/Nextriva',
  };
  for (const invalid of [
    { ...config, executable: 'proton-drive' },
    { ...config, executable: '/usr/bin/sudo' },
    ...[
      '/',
      '/Backups',
      '/Backups/../Other',
      '/Backups/./Other',
      '/Backups//Other',
      '/Backups/Other\n',
    ].map((remoteDirectory) => ({ ...config, remoteDirectory })),
  ])
    assert.throws(
      () => createProtonTransport(invalid),
      /Invalid Proton configuration/,
    );
  const calls = [];
  const transport = createProtonTransport(
    config,
    async (command) => calls.push(command),
    () => 'ubuntu',
  );
  for (const name of [
    '../other.dump',
    '--recursive',
    'unowned.dump',
    '/other.dump',
  ]) {
    await assert.rejects(
      transport.trash(name),
      /Proton backup operation failed/,
    );
  }
  const wrongUser = createProtonTransport(
    config,
    async (command) => calls.push(command),
    () => 'root',
  );
  await assert.rejects(
    wrongUser.trash(record('20261025').name),
    /Proton backup operation failed/,
  );
  assert.deepEqual(calls, []);
});

test('Proton failures stop coordinator before trash and hide secrets', async (t) => {
  for (const stage of ['upload', 'download']) {
    const { options, events } = await fixture(t);
    const commands = [];
    options.transport = createProtonTransport(
      {
        executable: '/home/ubuntu/.local/bin/proton-drive',
        remoteDirectory: '/Backups/Nextriva',
      },
      async (command) => {
        commands.push(command.args[1]);
        if (command.args[1] === stage) throw new Error('secret-proton-token');
      },
      () => 'ubuntu',
    );
    await assert.rejects(
      backupDemoPostgres(options),
      (error) =>
        /Backup failed/.test(error.message) &&
        !String(error).includes('secret-'),
    );
    assert.deepEqual(events, ['dump']);
    assert.deepEqual(
      commands,
      stage === 'upload' ? ['upload'] : ['upload', 'download'],
    );
  }
});

test('coordinator with Proton adapter verifies downloaded bytes before exact manifest trash', async (t) => {
  for (const corrupt of [false, true]) {
    const { options, entries } = await fixture(t);
    const commands = [];
    let uploaded;
    options.transport = createProtonTransport(
      {
        executable: '/home/ubuntu/.local/bin/proton-drive',
        remoteDirectory: '/Backups/Nextriva',
      },
      async (command) => {
        commands.push(command.args);
        if (command.args[1] === 'upload')
          uploaded = await readFile(command.args.at(-2));
        if (command.args[1] === 'download')
          await writeFile(
            join(command.args.at(-1), basename(command.args.at(-2))),
            corrupt ? 'corrupt' : uploaded,
          );
      },
      () => 'ubuntu',
    );
    if (corrupt) {
      await assert.rejects(backupDemoPostgres(options), /Backup failed/);
      assert.deepEqual(
        commands.map((args) => args[1]),
        ['upload', 'download'],
      );
    } else {
      assert.equal((await backupDemoPostgres(options)).verified, true);
      assert.deepEqual(
        commands.slice(0, 2).map((args) => args[1]),
        ['upload', 'download'],
      );
      assert.deepEqual(
        commands.slice(2),
        [entries[0], entries[1], entries[3]].map((entry) => [
          'filesystem',
          'trash',
          `/Backups/Nextriva/${entry.name}`,
        ]),
      );
    }
    assert.equal(
      commands.some((args) => args.includes('delete') || args.includes('list')),
      false,
    );
  }
});

async function fixture(t, failure) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'nextriva-backup-test-')),
  );
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = [
    '20261004',
    '20261011',
    '20261018',
    '20261022',
    '20261023',
    '20261024',
  ].map((d) => record(d));
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({ version: 1, entries }),
    { mode: 0o600 },
  );
  const events = [];
  const options = {
    stateDirectory: root,
    now: new Date('2026-10-25T02:00:00Z'),
    dump: async (path) => {
      events.push('dump');
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await stat(join(path, '..'))).mode & 0o777, 0o700);
      await writeFile(path, 'synthetic dump');
      if (failure === 'dump') throw new Error('secret-database-password');
    },
    transport: {
      upload: async (path, name) => {
        events.push(`upload:${name}`);
        assert.equal(await readFile(path, 'utf8'), 'synthetic dump');
        if (failure === 'upload') throw new Error('secret-proton-token');
      },
      download: async (name, path) => {
        events.push(`download:${name}`);
        if (failure === 'download') throw new Error('secret-proton-token');
        await writeFile(
          path,
          failure === 'hash' ? 'corrupt dump' : 'synthetic dump',
        );
        if (failure === 'permissions') await chmod(path, 0o644);
        if (failure === 'empty') await writeFile(path, '');
      },
      trash: async (name) => {
        events.push(`trash:${name}`);
      },
    },
    prune: true,
  };
  return { root, entries, events, options };
}

test('uploads, downloads and hashes before pruning only exact manifest-owned names', async (t) => {
  const { root, entries, events, options } = await fixture(t);
  const result = await backupDemoPostgres(options);
  assert.equal(result.verified, true);
  assert.deepEqual(
    events.slice(0, 3).map((e) => e.split(':')[0]),
    ['dump', 'upload', 'download'],
  );
  assert.deepEqual(
    events.filter((e) => e.startsWith('trash:')),
    [entries[0], entries[1], entries[3]].map((e) => `trash:${e.name}`),
  );
  const manifest = JSON.parse(
    await readFile(join(root, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.entries.length, 4);
  assert.equal((await stat(join(root, 'manifest.json'))).mode & 0o777, 0o600);
});

for (const failure of [
  'dump',
  'upload',
  'download',
  'hash',
  'permissions',
  'empty',
]) {
  test(`fails closed on ${failure}, keeps manifest unchanged and hides tool secrets`, async (t) => {
    const { root, events, options } = await fixture(t, failure);
    const before = await readFile(join(root, 'manifest.json'), 'utf8');
    await assert.rejects(
      backupDemoPostgres(options),
      (error) =>
        /Backup failed/.test(error.message) &&
        !String(error).includes('secret-'),
    );
    assert.equal(
      events.some((e) => e.startsWith('trash:')),
      false,
    );
    const expectedStages = ['dump'];
    if (failure !== 'dump') expectedStages.push('upload');
    if (!['dump', 'upload'].includes(failure)) expectedStages.push('download');
    assert.deepEqual(
      events.map((e) => e.split(':')[0]),
      expectedStages,
    );
    assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), before);
  });
}

test('pruning defaults off and returns pending candidates after verification', async (t) => {
  const { events, options } = await fixture(t);
  delete options.prune;
  const result = await backupDemoPostgres(options);
  assert.equal(result.pendingPrune.length, 3);
  assert.equal(
    events.some((e) => e.startsWith('trash:')),
    false,
  );
});

test('rejects every non-boolean prune value before dump or transport', async (t) => {
  for (const prune of ['false', 'true', '', 0, 1, null, [], {}]) {
    const { options, events } = await fixture(t);
    options.prune = prune;
    await assert.rejects(backupDemoPostgres(options), /Backup failed/);
    assert.deepEqual(events, []);
  }
});

test('does not store dump or manifest inside the repository', async (t) => {
  const { options, events } = await fixture(t);
  const root = await mkdtemp(
    join(fileURLToPath(new URL('../', import.meta.url)), '.backup-test-'),
  );
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true }));
  options.stateDirectory = root;
  await assert.rejects(backupDemoPostgres(options), /Backup failed/);
  assert.deepEqual(events, []);
});

test('stops on selective trash failure and persists only completed removals', async (t) => {
  const { options, root, entries } = await fixture(t);
  let attempts = 0;
  options.transport.trash = async () => {
    if (++attempts === 2) throw new Error('secret-provider-error');
  };
  await assert.rejects(backupDemoPostgres(options), /Backup failed/);
  assert.equal(attempts, 2);
  const manifest = JSON.parse(
    await readFile(join(root, 'manifest.json'), 'utf8'),
  );
  assert.equal(
    manifest.entries.some((e) => e.name === entries[0].name),
    false,
  );
  assert.equal(
    manifest.entries.some((e) => e.name === entries[1].name),
    true,
  );
  assert.equal(manifest.entries.length, entries.length);
});

test('Docker adapter uses sudo only for fixed Docker arguments and uniquely selected Compose container', async () => {
  const calls = [];
  const dump = createDockerDump(async (command) => {
    calls.push(command);
    return { stdout: 'a'.repeat(64) + '\n' };
  });
  const path = '/private/space and $(touch injected);.dump';
  await dump(path);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].executable, '/usr/bin/sudo');
  assert.deepEqual(calls[0].args, [
    '-n',
    '/usr/bin/docker',
    'ps',
    '--filter',
    'label=com.docker.compose.project=nextriva-demo',
    '--filter',
    'label=com.docker.compose.service=postgres',
    '--filter',
    'label=com.docker.compose.oneoff=False',
    '--format',
    '{{.ID}}',
    '--no-trunc',
  ]);
  assert.deepEqual(calls[1].args.slice(0, 4), [
    '-n',
    '/usr/bin/docker',
    'exec',
    'a'.repeat(64),
  ]);
  assert.equal(calls[1].outputPath, path);
  assert.equal(
    calls[1].args.some((arg) => arg.includes(path)),
    false,
  );
  assert.ok(calls[1].args.at(-1).includes('--format=custom'));
  assert.ok(calls[1].args.at(-1).includes('POSTGRES_PASSWORD_FILE'));
});

for (const stdout of [
  '',
  'a'.repeat(64) + '\n' + 'b'.repeat(64),
  '$(touch injected)',
  'not-an-id',
]) {
  test(`Docker adapter rejects absent, ambiguous or unsafe container ID (${stdout.length} characters)`, async () => {
    let calls = 0;
    const dump = createDockerDump(async () => {
      calls++;
      return { stdout };
    });
    await assert.rejects(
      dump('/private/archive.dump'),
      /unique demo PostgreSQL container/,
    );
    assert.equal(calls, 1);
  });
}

test('rejects unsafe manifest and state permissions, symlinks, and concurrent run before dumping', async (t) => {
  const { root, events, options } = await fixture(t);
  const manifestPath = join(root, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      entries: [{ ...record('20261004'), name: '../unowned.dump' }],
    }),
  );
  await assert.rejects(backupDemoPostgres(options));
  assert.deepEqual(events, []);
  await writeFile(manifestPath, JSON.stringify({ version: 1, entries: [] }));
  await chmod(manifestPath, 0o644);
  await assert.rejects(backupDemoPostgres(options));
  await chmod(manifestPath, 0o600);
  await chmod(root, 0o755);
  await assert.rejects(backupDemoPostgres(options));
  await chmod(root, 0o700);
  await mkdir(join(root, '.backup-lock'));
  await assert.rejects(backupDemoPostgres(options));
  await rm(join(root, '.backup-lock'), { recursive: true });
  await rm(manifestPath);
  await symlink(join(root, 'unowned-manifest'), manifestPath);
  await assert.rejects(backupDemoPostgres(options));
  assert.deepEqual(events, []);
});

test('retains three distinct daily snapshots and two Sundays, sharing a snapshot', () => {
  const entries = [
    '20261011',
    '20261018',
    '20261023',
    '20261024',
    '20261025',
  ].map((d) => record(d));
  assert.deepEqual(
    selectRetainedBackups(entries, new Date('2026-10-25T03:00:00Z')).map(
      (r) => r.name,
    ),
    entries
      .slice(1)
      .map((r) => r.name)
      .reverse(),
  );
});

test('keeps only the latest snapshot per UTC day and rejects future or malformed records', () => {
  const old = record('20261025');
  const latest = {
    ...record('20261025', '1'),
    createdAt: '2026-10-25T03:00:00.000Z',
    name: `nextriva_demo-20261025T030000Z-${'1'.repeat(32)}.dump`,
  };
  assert.deepEqual(
    selectRetainedBackups([old, latest], new Date('2026-10-25T04:00:00Z')),
    [latest],
  );
  for (const invalid of [
    { ...old, name: '../other.dump' },
    { ...old, name: 'unowned.dump' },
    { ...old, sha256: 'invalid' },
    { ...old, createdAt: '2026-10-26T02:00:00.000Z' },
    record('20261026'),
  ])
    assert.throws(
      () => selectRetainedBackups([invalid], new Date('2026-10-25T04:00:00Z')),
      /Invalid backup manifest/,
    );
});
