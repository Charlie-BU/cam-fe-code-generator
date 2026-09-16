const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Command } = require('commander');

process.env.SERVER_BASE_URL = 'http://localhost.invalid';
const servicesApi = require('../dist/services/apis/service');
const api = require('../dist/services/apis/api');
const utils = require('../dist/utils/utils');
// Avoid authentication and network access; exercise real command parsing and generation.
utils.loginRequired = (fn) => fn;
const { registerUpdateCommand } = require('../dist/cli/update');

async function runUpdate(args, response) {
    const originalCwd = process.cwd();
    const originalExitCode = process.exitCode;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-update-'));
    const requests = [];
    const apiRequests = [];
    const config = JSON.stringify({
        services: { users: 'team/users@1.0.0', orders: 'team/orders@2.0.0' },
        outDir: 'generated', generateConfig: {},
    });
    servicesApi.GetServiceByUuidAndVersion = async (...args) => {
        requests.push(args);
        return response || { status: 200, service: { apis: [] }, is_latest: true };
    };
    api.GetApiById = async (...args) => {
        apiRequests.push(args);
        return { status: 500, message: 'API unavailable' };
    };
    try {
        process.chdir(temp);
        process.exitCode = 0;
        fs.writeFileSync('cam.config.json', config);
        for (const name of ['users', 'orders']) {
            fs.mkdirSync(`generated/${name}`, { recursive: true });
            fs.writeFileSync(`generated/${name}/index.ts`, `old ${name}`);
            fs.writeFileSync(`generated/${name}/stale.ts`, 'stale');
        }
        fs.writeFileSync('generated/request-demo.ts', 'custom demo');
        const program = new Command();
        registerUpdateCommand(program);
        await program.parseAsync(['node', 'cam', 'update', ...args]);
        return {
            requests, apiRequests, exitCode: process.exitCode,
            users: fs.readFileSync('generated/users/index.ts', 'utf8'),
            orders: fs.readFileSync('generated/orders/index.ts', 'utf8'),
            usersStale: fs.existsSync('generated/users/stale.ts'),
            ordersStale: fs.existsSync('generated/orders/stale.ts'),
            demo: fs.readFileSync('generated/request-demo.ts', 'utf8'),
            config: fs.readFileSync('cam.config.json', 'utf8'), originalConfig: config,
        };
    } finally {
        process.chdir(originalCwd);
        process.exitCode = originalExitCode;
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

for (const identifier of ['users', 'team/users']) {
    test(`updates only selected service via ${identifier}`, async () => {
        const result = await runUpdate([identifier]);
        assert.deepEqual(result.requests, [['team/users', 'latest']]);
        assert.equal(result.exitCode, 0);
        assert.match(result.users, /export default class UsersService/);
        assert.equal(result.usersStale, false);
        assert.equal(result.orders, 'old orders');
        assert.equal(result.ordersStale, true);
        assert.equal(result.demo, 'custom demo');
        assert.equal(result.config, result.originalConfig);
    });
}

test('unknown service performs no requests or output changes', async () => {
    const result = await runUpdate(['missing']);
    assert.deepEqual(result.requests, []);
    assert.equal(result.exitCode, 1);
    assert.equal(result.users, 'old users');
    assert.equal(result.orders, 'old orders');
    assert.equal(result.demo, 'custom demo');
});

test('no argument retains configured versions and updates all services', async () => {
    const result = await runUpdate([]);
    assert.deepEqual(result.requests, [['team/users', '1.0.0'], ['team/orders', '2.0.0']]);
    assert.match(result.users, /export default class UsersService/);
    assert.match(result.orders, /export default class OrdersService/);
    assert.equal(result.ordersStale, false);
});

for (const response of [
    { status: 500, message: 'Service unavailable' },
    { status: 200, service: { apis: [{ id: 42, name: 'getUser' }] }, is_latest: true },
]) {
    test(`failed ${response.status === 500 ? 'service' : 'API'} fetch preserves existing files`, async () => {
        const result = await runUpdate(['users'], response);
        assert.equal(result.exitCode, 1);
        assert.deepEqual(result.requests, [['team/users', 'latest']]);
        assert.equal(result.users, 'old users');
        assert.equal(result.usersStale, true);
        assert.equal(result.orders, 'old orders');
        assert.equal(result.demo, 'custom demo');
        if (response.status === 200) assert.deepEqual(result.apiRequests, [[42, true]]);
    });
}
