'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { fileRepository, createDevServer } = require('../sync/dev.cjs');
const fixture = () => ({ id: 'A'.repeat(22), tokenHash: 'b'.repeat(64), revision: 1, updatedAt: 100, envelope: { version: 1, iv: 'C'.repeat(16), ciphertext: 'D'.repeat(22) } });
async function temporary(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-lock-'));
    const repositories = [];
    t.after(async () => { for (const repository of repositories.reverse()) await repository.close(); await fs.rm(directory, { recursive: true, force: true }); });
    const filename = path.join(directory, 'store.json');
    return { filename, repository() { const repository = fileRepository(filename); repositories.push(repository); return repository; } };
}
async function ownerProcess(filename) {
    const code = `const {fileRepository}=require(process.argv[1]); const repository=fileRepository(process.argv[2]);
      process.on('message',async message=>{if(message==='close'){await repository.close();process.exit(0);}});
      repository.initialize().then(()=>process.send({ready:true}),error=>{process.send({error:error.code||'initialization_failed'});process.exitCode=1;process.disconnect();});`;
    const child = spawn(process.execPath, ['-e', code, require.resolve('../sync/dev.cjs'), filename], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const exited = new Promise(resolve => child.once('exit', resolve));
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Local lock test child did not become ready.')), 10000);
            child.once('message', message => { clearTimeout(timer); if (message.ready) resolve(); else reject(new Error(message.error)); });
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', () => { clearTimeout(timer); reject(new Error('Local lock test child exited before ready.')); });
        });
    } catch (error) { if (child.exitCode === null) child.kill('SIGKILL'); await exited; throw error; }
    return { child, exited, async stop() { if (child.exitCode === null && child.signalCode === null) { child.send('close'); await exited; } } };
}

test('exclusive store ownership rejects a second repository even in the same process', async t => {
    const temp = await temporary(t);
    const first = temp.repository(); const second = temp.repository();
    await Promise.all([first.initialize(), first.initialize()]);
    await first.create(fixture());
    await assert.rejects(second.initialize(), error => error.code === 'SYNC_STORE_LOCKED');
    assert.equal(await first.close(), true);
    await second.initialize();
    assert.equal((await second.get(fixture().id)).revision, 1);
});

test('a rejected stale writer cannot resurrect a deleted profile or remove its revocation', async t => {
    const temp = await temporary(t);
    const first = temp.repository(); const second = temp.repository();
    await first.create(fixture());
    await assert.rejects(second.initialize(), error => error.code === 'SYNC_STORE_LOCKED');
    await first.remove(fixture().id, fixture().tokenHash);
    await first.close();
    await second.initialize();
    assert.equal(await second.update(fixture().id, fixture().tokenHash, 1, fixture().envelope, 200), false);
    assert.equal(await second.create(fixture()), false);
    assert.equal(await second.get(fixture().id), null);
    const saved = JSON.parse(await fs.readFile(temp.filename, 'utf8'));
    assert.equal(saved.profiles.length, 0);
    assert.equal(saved.revoked.length, 1);
});

test('close drains accepted writes, refuses new operations and releases ownership once', async t => {
    const temp = await temporary(t);
    const first = temp.repository();
    const write = first.create(fixture());
    const closing = first.close();
    assert.equal(await write, true);
    assert.equal(await closing, true);
    assert.equal(await first.close(), true);
    await assert.rejects(first.get(fixture().id), error => error.code === 'SYNC_STORE_CLOSED');
    const next = temp.repository();
    assert.equal((await next.get(fixture().id)).revision, 1);
});

test('unknown or replaced lock owners are preserved, and their data is never overwritten', async t => {
    const temp = await temporary(t);
    const first = temp.repository();
    await first.create(fixture());
    const lockfile = temp.filename + '.lock';
    const replacement = JSON.stringify({ version: 1, pid: process.pid, nonce: 'e'.repeat(32) });
    await fs.writeFile(lockfile, replacement);
    await assert.rejects(first.update(fixture().id, fixture().tokenHash, 1, fixture().envelope, 200), error => error.code === 'SYNC_STORE_LOCKED');
    assert.equal(await first.close(), false);
    assert.equal(await fs.readFile(lockfile, 'utf8'), replacement);
    const unknown = temp.repository();
    await assert.rejects(unknown.initialize(), error => error.code === 'SYNC_STORE_LOCKED');
    await unknown.close();
    assert.equal(await fs.readFile(lockfile, 'utf8'), replacement);
});

test('an invalid existing lock fails closed without deleting it or the existing store', async t => {
    const temp = await temporary(t);
    const initial = temp.repository();
    await initial.create(fixture()); await initial.close();
    const before = await fs.readFile(temp.filename, 'utf8');
    const lockfile = temp.filename + '.lock';
    await fs.writeFile(lockfile, '{unknown');
    const blocked = temp.repository();
    await assert.rejects(blocked.initialize(), error => error.code === 'SYNC_STORE_LOCKED');
    assert.equal(await fs.readFile(lockfile, 'utf8'), '{unknown');
    assert.equal(await fs.readFile(temp.filename, 'utf8'), before);
});

test('two real processes cannot own a store together; graceful exit releases it', async t => {
    const temp = await temporary(t);
    const owner = await ownerProcess(temp.filename);
    t.after(() => owner.stop());
    const second = temp.repository();
    await assert.rejects(second.initialize(), error => error.code === 'SYNC_STORE_LOCKED');
    await owner.stop();
    await second.initialize();
    assert.equal(await second.create(fixture()), true);
});

test('a killed process leaves a recoverable ESRCH lock, preserving saved data', async t => {
    const temp = await temporary(t);
    const setup = temp.repository(); await setup.create(fixture()); await setup.close();
    const owner = await ownerProcess(temp.filename);
    owner.child.kill('SIGKILL'); await owner.exited;
    const recover = temp.repository();
    await recover.initialize();
    assert.equal((await recover.get(fixture().id)).revision, 1);
    assert.equal(await recover.update(fixture().id, fixture().tokenHash, 1, fixture().envelope, 200), true);
    assert.equal((await recover.get(fixture().id)).revision, 2);
});

test('simultaneous recovery of a dead owner still allows only one new writer', async t => {
    const temp = await temporary(t);
    const owner = await ownerProcess(temp.filename);
    owner.child.kill('SIGKILL'); await owner.exited;
    const first = temp.repository(); const second = temp.repository();
    const results = await Promise.allSettled([first.initialize(), second.initialize()]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SYNC_STORE_LOCKED');
});

test('server shutdown and startup failure release their own lock', async t => {
    const temp = await temporary(t);
    await assert.rejects(createDevServer({ port: 0, store: temp.filename, origins: {} }), TypeError);
    await assert.rejects(fs.access(temp.filename + '.lock'), error => error.code === 'ENOENT');
    const server = await createDevServer({ port: 0, store: temp.filename });
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const probe = temp.repository(); await probe.initialize(); await probe.close();
    const occupied = http.createServer();
    await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
    try {
        await assert.rejects(createDevServer({ port: occupied.address().port, store: temp.filename }), error => error.code === 'EADDRINUSE');
        const afterFailure = temp.repository(); await afterFailure.initialize();
    } finally { await new Promise(resolve => occupied.close(resolve)); }
});
