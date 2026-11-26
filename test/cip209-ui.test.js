import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as C from '@biglup/cometa';
import { buildIntents, buildUnbalancedPayment, buildUnbalancedWrapper, malformedPresets, subTransactionsOf, transactionId } from '../scripts/cip209.js';
import { createBuilder } from '../scripts/dijkstra.js';
import { addressOf, fixtureKey, signSubTx, signTx, txWitnessSet, utxoCbor, walletContext, witnessSetOf } from './helpers/cip209-local.js';

let state, refreshCip209, ctx, wallet, calls, api, provider;
const el = id => document.getElementById(`cip209-${id}`);
const buttons = () => [...document.querySelectorAll('#cip209-section button')];
const idle = async () => {
    for (let n = 0; n < 500 && el('get-balances-call').disabled; n++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(el('get-balances-call').disabled, false, 'action must finish');
};
const click = async id => { el(id).click(); await idle(); };
const preset = async id => { document.querySelector(`#cip209-raw-presets [data-preset="${id}"]`).click(); await idle(); };
const type = (id, value) => { el(id).value = value; el(id).dispatchEvent(new window.Event('input')); };
const check = (id, checked) => { el(id).checked = checked; el(id).dispatchEvent(new window.Event('input')); };
const record = (method, respond) => async (...args) => { calls.push({ method, args }); return respond(...args); };
const result = card => el(`${card}-result`);

const connect = (overrides = {}) => {
    calls = [];
    api = {
        getBalances: record('getBalances', () => ({ utxos: ctx.utxos.slice(0, 2).map(utxo => utxoCbor(C, utxo)), accounts: 'a0' })),
        signSubTxs: record('signSubTxs', (subTxs, format) => subTxs.map(cbor => (format === 'full' ? signSubTx(C, cbor) : witnessSetOf(C, cbor)))),
        balanceAndSignTx: record('balanceAndSignTx', () => { throw { code: 2, info: 'user declined' }; }),
        ...overrides,
    };
    provider = { getParameters: async () => ctx.params, getNetworkMagic: () => C.NetworkMagic.Preview, resolveUnspentOutputs: async () => [] };
    state.wallet = wallet;
    state.provider = provider;
    state.networkId = 0;
    state.cip30Api = { cip209: api, signTx: record('signTx', cbor => txWitnessSet(C, cbor)) };
    state.extensions = { cip95: false, cip142: false, cip209: true };
    check('network-mode', true);
    check('allow-wallet-submit', false);
    refreshCip209();
};

/** Subtransactions another wallet built and signed, naming the connected wallet as batcher. */
const counterparty = async (count = 2, sign = true) => {
    const key = fixtureKey(C, '07');
    const address = addressOf(C, key);
    const utxos = Array.from({ length: count }, (_, index) => ({ input: { txId: '04'.repeat(32), index }, output: { address, value: { coins: 9_000_000n } } }));
    const intents = await buildIntents(C, { ...ctx, address, utxos }, { count, amount: 3_000_000n, recipient: ctx.address, batcher: ctx.address });
    return { utxos, subTxs: intents.map(intent => (sign ? signSubTx(C, intent.cbor, key) : intent.cbor)) };
};

before(async () => {
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Cometa = C;
    await C.ready();
    ctx = walletContext(C);
    wallet = {
        getChangeAddress: async () => C.Address.fromString(ctx.address),
        getUnspentOutputs: async () => ctx.utxos,
        submitTransaction: async () => 'ab'.repeat(32),
    };
    ({ state } = await import('../scripts/app-state.js'));
    const handlers = await import('../scripts/handlers/cip209-tests.js');
    refreshCip209 = handlers.refreshCip209;
    assert.equal(handlers.setupCip209(), true);
});
beforeEach(() => connect());

test('the section is disabled with a clear message until the connected wallet offers CIP-209', async () => {
    assert.match(document.querySelector('#cip209-section h2').textContent, /^14\. CIP-209 \(Dijkstra connector extension\)$/);
    assert.equal(document.querySelectorAll('#cip209-section .tx-test-card').length, 5);
    state.wallet = null;
    state.cip30Api = null;
    refreshCip209();
    assert.match(el('status').textContent, /Connect a wallet/);
    assert.ok(buttons().every(button => button.disabled));
    connect();
    state.extensions = { cip95: true, cip142: true, cip209: false };
    state.cip30Api = { signTx: state.cip30Api.signTx };
    refreshCip209();
    assert.match(el('status').textContent, /does not offer CIP-209.*These tests are disabled/);
    assert.equal(el('status').classList.contains('connected'), false);
    assert.ok(buttons().every(button => button.disabled));
    el('get-balances-call').click();
    el('raw-call').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls.length, 0);
    connect();
    assert.match(el('status').textContent, /offers CIP-209 \(api\.cip209\)\.$/);
    assert.equal(el('status').classList.contains('connected'), true);
    for (const id of ['get-balances-call', 'sign-subtxs-build', 'wrap-build', 'balance-sign-build', 'raw-call']) assert.equal(el(id).disabled, false, id);
    for (const id of ['sign-subtxs-sign', 'sign-subtxs-use', 'wrap-sign', 'wrap-submit', 'balance-sign-call']) assert.equal(el(id).disabled, true, id);
    state.cip30Api = { experimental: { cip209: { getBalances: api.getBalances } } };
    refreshCip209();
    assert.match(el('status').textContent, /api\.experimental\.cip209\)\. Missing methods: signSubTxs, balanceAndSignTx\./);
    await click('get-balances-call');
    assert.equal(calls.at(-1).method, 'getBalances');
    await click('sign-subtxs-build');
    await click('sign-subtxs-sign');
    assert.match(result('sign-subtxs').textContent, /The wallet has no cip209\.signSubTxs method/);
});

test('connecting requests { cip: 209 } when the wallet lists it and records what the enabled API carries', async () => {
    const { connectWallet } = await import('../scripts/handlers/connect-handler.js');
    const ui = await import('../scripts/ui.js');
    const log = document.getElementById('log-output');
    const fixture = (supported, enabled) => {
        const requested = [];
        window.cardano = { fixture: { name: 'Fixture', apiVersion: '1', supportedExtensions: supported,
            enable: async options => { requested.push(options); return { getNetworkId: async () => 0, getUsedAddresses: async () => [], ...enabled }; } } };
        return requested;
    };
    let requested = fixture([{ cip: 95 }, { cip: 209 }], { cip95: {}, cip209: api });
    let info = await connectWallet('fixture', 'preprod');
    assert.deepEqual(requested, [{ extensions: [{ cip: 95 }, { cip: 209 }] }]);
    assert.deepEqual(info.extensions, { cip95: true, cip142: false, cip209: true });
    assert.deepEqual(state.extensions, info.extensions);
    assert.equal(state.cip30Api.cip209, api);
    assert.match(log.textContent, /extensions: CIP-95, CIP-209/);
    ui.showConnectionStatus(info);
    assert.match(document.getElementById('connection-status').textContent, /Extensions: CIP-95 yes, CIP-142 no, CIP-209 yes/);
    refreshCip209();
    assert.match(el('status').textContent, /offers CIP-209/);

    requested = fixture([{ cip: 209 }], { experimental: { cip209: api } });
    info = await connectWallet('fixture', 'preprod');
    assert.deepEqual(requested, [{ extensions: [{ cip: 209 }] }]);
    assert.equal(info.extensions.cip209, true);

    requested = fixture([{ cip: 95 }, { cip: 142 }], { cip95: {}, cip142: {} });
    info = await connectWallet('fixture', 'preprod');
    assert.deepEqual(requested, [{ extensions: [{ cip: 95 }, { cip: 142 }] }]);
    assert.equal(info.extensions.cip209, false);
    ui.showConnectionStatus(info);
    assert.match(document.getElementById('connection-status').textContent, /CIP-209 no/);
    refreshCip209();
    assert.match(el('status').textContent, /does not offer CIP-209/);

    requested = fixture(undefined, {});
    await connectWallet('fixture', 'preprod');
    assert.deepEqual(requested, [{ extensions: undefined }]);

    fixture([{ cip: 209 }], {});
    info = await connectWallet('fixture', 'preprod');
    assert.equal(info.extensions.cip209, false);
    assert.match(log.textContent, /lists CIP-209 in supportedExtensions but the enabled API has no cip209 namespace/);
});

test('getBalances passes pagination only when given and renders UTxOs and account balances', async () => {
    await click('get-balances-call');
    assert.deepEqual(calls, [{ method: 'getBalances', args: [] }]);
    assert.match(result('get-balances').textContent, /UTxOs \(2\):/);
    assert.match(result('get-balances').textContent, new RegExp(`${ctx.utxos[0].input.txId}#0\\s+${ctx.address}\\s+100000000 lovelace`));
    assert.match(result('get-balances').textContent, /Reward accounts with a balance \(0\):/);
    assert.ok(result('get-balances').classList.contains('success'));
    const account = `581de0${C.Address.fromString(ctx.address).toHex().slice(2)}`;
    api.getBalances = record('getBalances', () => ({ utxos: [utxoCbor(C, ctx.utxos[1])], accounts: `a1${account}1a004c4b40` }));
    type('get-balances-page', '1');
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /Enter both page and limit/);
    assert.equal(calls.length, 1);
    type('get-balances-limit', '1');
    await click('get-balances-call');
    assert.deepEqual(calls.at(-1), { method: 'getBalances', args: [{ page: 1, limit: 1 }] });
    assert.match(result('get-balances').textContent, /UTxOs \(1, page 1, limit 1\):/);
    assert.match(result('get-balances').textContent, new RegExp(`${ctx.rewardAddress}\\s+5000000 lovelace`));
    assert.match(result('get-balances').textContent, /Total across the listed UTxOs and accounts: 25000000 lovelace/);
    assert.match(result('get-balances').textContent, /Raw result:\s+\{\s+"utxos"/);
    type('get-balances-limit', 'ten');
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /non-negative integers/);
    assert.equal(calls.length, 2);
    type('get-balances-page', '');
    type('get-balances-limit', '');
});

test('getBalances errors show their code and info, a paginate error its maxSize, and bad results fail', async () => {
    type('get-balances-page', '9');
    type('get-balances-limit', '5');
    api.getBalances = record('getBalances', () => { throw { maxSize: 2 }; });
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /cip209\.getBalances rejected with:\s+\{\s+"maxSize": 2\s+\}\s+no numeric code: PaginateError/);
    assert.ok(result('get-balances').classList.contains('error'));
    api.getBalances = record('getBalances', () => { throw { code: -2, info: 'backend unavailable' }; });
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /"code": -2,\s+"info": "backend unavailable"\s+\}\s+code -2: APIError InternalError/);
    assert.match(document.getElementById('log-output').textContent, /CIP-209: cip209\.getBalances rejected with/);
    api.getBalances = record('getBalances', () => ({ utxos: [], accounts: { stake: 1 } }));
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /`accounts` must be one CBOR hex string[\s\S]*Raw result:[\s\S]*"stake": 1/);
    const account = `581de0${C.Address.fromString(ctx.address).toHex().slice(2)}`;
    api.getBalances = record('getBalances', () => ({ utxos: [], accounts: `a1${account}00` }));
    await click('get-balances-call');
    assert.match(result('get-balances').textContent, /PROBLEMS:\s+stake_test1\S+ has a zero balance/);
    assert.ok(result('get-balances').classList.contains('error'));
    type('get-balances-page', '');
    type('get-balances-limit', '');
});

test('signSubTxs signs built intents with each format choice and exposes the signed CBOR', async () => {
    const batcher = addressOf(C, fixtureKey(C, '05'));
    type('sign-subtxs-count', '3');
    type('sign-subtxs-batcher', batcher);
    await click('sign-subtxs-build');
    const built = el('sign-subtxs-cbor').value.split('\n');
    assert.equal(built.length, 3);
    assert.match(result('sign-subtxs').textContent, new RegExp(`Batcher whose top-level guard each requires: ${batcher}`));
    const required = C.inspectTx(buildUnbalancedWrapper(C, built)).body.sub_transactions.map(sub => sub.body.required_top_level_guards[0].key.value);
    assert.deepEqual(new Set(required), new Set([fixtureKey(C, '05').getPublicKey().toHashHex()]));
    assert.equal(el('sign-subtxs-sign').disabled, false);
    assert.equal(el('sign-subtxs-use').disabled, true);
    assert.equal(calls.length, 0);

    await click('sign-subtxs-sign');
    assert.deepEqual(calls.at(-1), { method: 'signSubTxs', args: [built] });
    assert.match(result('sign-subtxs').textContent, /passed with format omitted[\s\S]*witness set whose signatures verify/);
    assert.deepEqual(el('sign-subtxs-signed').value.split('\n'), built.map(cbor => signSubTx(C, cbor)));

    type('sign-subtxs-format', 'witnessSet');
    await click('sign-subtxs-sign');
    assert.deepEqual(calls.at(-1), { method: 'signSubTxs', args: [built, 'witnessSet'] });
    assert.ok(result('sign-subtxs').classList.contains('success'));

    type('sign-subtxs-format', 'full');
    await click('sign-subtxs-sign');
    assert.deepEqual(calls.at(-1), { method: 'signSubTxs', args: [built, 'full'] });
    assert.match(result('sign-subtxs').textContent, /passed with format "full"[\s\S]*same body bytes and id/);
    assert.deepEqual(el('sign-subtxs-signed').value.split('\n'), built.map(cbor => signSubTx(C, cbor)));
    assert.equal(el('sign-subtxs-cbor').value, built.join('\n'));

    await click('sign-subtxs-use');
    assert.equal(el('wrap-subtxs').value, built.map(cbor => signSubTx(C, cbor)).join('\n'));
    type('sign-subtxs-format', '');
    type('sign-subtxs-count', '2');
    type('sign-subtxs-batcher', '');
    type('wrap-subtxs', '');
});

test('signSubTxs results that are short, unsigned or in the wrong shape fail, as do wallet errors', async () => {
    await click('sign-subtxs-build');
    const built = el('sign-subtxs-cbor').value.split('\n');
    for (const [respond, expected] of [
        [subTxs => [witnessSetOf(C, subTxs[0])], /returned 1 entries for 2[\s\S]*Raw result:/],
        [subTxs => subTxs.map(() => 'a0'), /Entry 0: the wallet did not sign required key/],
        [subTxs => subTxs.map(cbor => signSubTx(C, cbor)), /Entry 0 does not decode as a transaction_witness_set/],
        [subTxs => subTxs.map(cbor => witnessSetOf(C, cbor)).reverse(), /Entry 0: a signature does not verify/],
        [() => { throw { code: 2, info: 'user declined' }; }, /cip209\.signSubTxs rejected with:[\s\S]*"info": "user declined"[\s\S]*code 2: TxSignError UserDeclined/],
        [() => { throw { code: -1, info: 'bad cbor' }; }, /code -1: APIError InvalidRequest/],
    ]) {
        api.signSubTxs = record('signSubTxs', respond);
        await click('sign-subtxs-sign');
        assert.match(result('sign-subtxs').textContent, expected);
        assert.ok(result('sign-subtxs').classList.contains('error'));
        assert.equal(el('sign-subtxs-signed').value, '');
        assert.equal(el('sign-subtxs-use').disabled, true);
        assert.equal(el('sign-subtxs-cbor').value, built.join('\n'));
    }
    type('sign-subtxs-format', 'full');
    api.signSubTxs = record('signSubTxs', subTxs => subTxs.map(cbor => witnessSetOf(C, cbor)));
    await click('sign-subtxs-sign');
    assert.match(result('sign-subtxs').textContent, /Entry 0 does not decode as a subtransaction/);
    type('sign-subtxs-format', '');
    type('sign-subtxs-recipient', 'stake_test1uqxk54m7j3q6mrkevcunryrwf4p7e68c93cjk8gzxkhlkpsfpjx89');
    assert.equal(el('sign-subtxs-cbor').value, '');
    assert.equal(el('sign-subtxs-sign').disabled, true);
    await click('sign-subtxs-build');
    assert.match(result('sign-subtxs').textContent, /Use a payment address on the connected network for the recipient/);
    type('sign-subtxs-recipient', '');
    type('sign-subtxs-batcher', 'not an address');
    await click('sign-subtxs-build');
    assert.match(result('sign-subtxs').textContent, /payment address on the connected network for the batcher/);
    type('sign-subtxs-batcher', '');
});

test('the two-wallet flow wraps another wallet\'s signed subtransactions, signs with plain signTx and submits', async () => {
    const other = await counterparty();
    const resolved = [];
    provider.resolveUnspentOutputs = async inputs => { resolved.push(inputs); return other.utxos; };
    type('wrap-subtxs', `${other.subTxs[0]}\n\n  ${other.subTxs[1]}\n`);
    await click('wrap-build');
    assert.deepEqual(resolved, [other.utxos.map(utxo => utxo.input)]);
    const unsigned = el('wrap-cbor').value;
    assert.deepEqual(subTransactionsOf(C, unsigned), other.subTxs);
    const body = C.inspectTx(unsigned).body;
    assert.deepEqual(body.guards, [{ tag: 'pubkey_hash', value: fixtureKey(C).getPublicKey().toHashHex() }]);
    assert.ok(body.inputs.every(input => input.transaction_id !== '04'.repeat(32)));
    assert.match(result('wrap').textContent, /1\. \S+: 1 input\(s\), 1 valid signature\(s\), fully witnessed/);
    assert.match(result('wrap').textContent, /Expected from signTx: the top-level witness set/);
    assert.deepEqual([el('wrap-sign').disabled, el('wrap-submit').disabled], [false, true]);
    assert.equal(calls.length, 0);

    await click('wrap-sign');
    assert.deepEqual(calls, [{ method: 'signTx', args: [unsigned, false] }]);
    assert.match(result('wrap').textContent, /1 key signature\(s\) verified against the top-level transaction/);
    assert.equal(el('wrap-cbor').value, signTx(C, unsigned));
    assert.deepEqual([el('wrap-sign').disabled, el('wrap-submit').disabled], [true, false]);

    const submitted = [];
    wallet.submitTransaction = async cbor => { submitted.push(cbor); return 'cd'.repeat(32); };
    await click('wrap-submit');
    assert.deepEqual(submitted, [signTx(C, unsigned)]);
    assert.match(result('wrap').textContent, /Submitted: cdcd/);
    assert.equal(el('wrap-submit').disabled, true);
    assert.equal(el('wrap-cbor').value, '');

    check('network-mode', false);
    provider.getParameters = async () => ({ ...ctx.params, protocolVersion: { major: 10, minor: 0 } });
    await click('wrap-build');
    assert.match(result('wrap').textContent, /SIGNING TEST ONLY: endpoint protocol 10/);
    await click('wrap-sign');
    assert.match(result('wrap').textContent, /Compatibility mode: submission remains disabled/);
    assert.equal(el('wrap-submit').disabled, true);
    type('wrap-subtxs', '');
});

test('an imported subtransaction that lacks witnesses must make the amended signTx refuse with code 7', async () => {
    const other = await counterparty(2, false);
    const signedFirst = signSubTx(C, other.subTxs[0], fixtureKey(C, '07'));
    provider.resolveUnspentOutputs = async () => other.utxos;
    type('wrap-subtxs', [signedFirst, other.subTxs[1]].join('\n'));
    await click('wrap-build');
    const missing = fixtureKey(C, '07').getPublicKey().toHashHex();
    assert.match(result('wrap').textContent, new RegExp(`2\\. \\S+: 1 input\\(s\\), 0 valid signature\\(s\\), MISSING witness for key\\(s\\) ${missing}`));
    assert.match(result('wrap').textContent, /Expected from signTx: rejection with TxSignError 7 SubTxWitnessesMissing/);
    const unsigned = el('wrap-cbor').value;

    state.cip30Api.signTx = record('signTx', () => { throw { code: 7, info: 'sub-transaction 1 lacks a witness' }; });
    await click('wrap-sign');
    assert.deepEqual(calls.at(-1), { method: 'signTx', args: [unsigned, false] });
    assert.match(result('wrap').textContent, /"code": 7,\s+"info": "sub-transaction 1 lacks a witness"[\s\S]*code 7: TxSignError SubTxWitnessesMissing[\s\S]*As required/);
    assert.ok(result('wrap').classList.contains('success'));
    assert.equal(el('wrap-submit').disabled, true);

    state.cip30Api.signTx = record('signTx', () => { throw { code: 1, info: 'cannot sign' }; });
    await click('wrap-sign');
    assert.match(result('wrap').textContent, /code 1: TxSignError ProofGeneration[\s\S]*NOT as required/);
    assert.ok(result('wrap').classList.contains('error'));

    state.cip30Api.signTx = record('signTx', cbor => txWitnessSet(C, cbor));
    await click('wrap-sign');
    assert.match(result('wrap').textContent, /NOT as required: signTx returned a witness set/);
    assert.equal(el('wrap-cbor').value, unsigned);
    assert.equal(el('wrap-submit').disabled, true);
    type('wrap-subtxs', '');
});

test('wrapping refuses inputs that are not on chain, malformed lines and bad top-level signatures', async () => {
    const other = await counterparty();
    type('wrap-subtxs', other.subTxs.join('\n'));
    await click('wrap-build');
    assert.match(result('wrap').textContent, /is not an unspent output on this network\. Every input of every level must exist on chain before the batch/);
    assert.equal(el('wrap-sign').disabled, true);
    provider.resolveUnspentOutputs = async () => { throw new Error('404'); };
    await click('wrap-build');
    assert.match(result('wrap').textContent, /is not an unspent output on this network/);
    type('wrap-subtxs', 'a0');
    await click('wrap-build');
    assert.match(result('wrap').textContent, /Line 1 is not a subtransaction/);
    type('wrap-subtxs', '');
    await click('wrap-build');
    assert.match(result('wrap').textContent, /Paste at least one subtransaction CBOR/);

    provider.resolveUnspentOutputs = async () => other.utxos;
    type('wrap-subtxs', other.subTxs.join('\n'));
    await click('wrap-build');
    const unsigned = el('wrap-cbor').value;
    for (const [respond, expected] of [
        [() => 'a0', /Wallet returned no key witnesses/],
        [() => 'zz', /signTx did not return a witness set/],
        [cbor => txWitnessSet(C, cbor, fixtureKey(C, '07')), /Wallet did not sign required key/],
        [() => { throw { code: 2, info: 'declined' }; }, /signTx rejected with:[\s\S]*code 2: TxSignError UserDeclined/],
    ]) {
        state.cip30Api.signTx = record('signTx', respond);
        await click('wrap-sign');
        assert.match(result('wrap').textContent, expected);
        assert.doesNotMatch(result('wrap').textContent, /As required|NOT as required/);
        assert.equal(el('wrap-cbor').value, unsigned);
        assert.deepEqual([el('wrap-sign').disabled, el('wrap-submit').disabled], [false, true]);
    }
    type('wrap-subtxs', `${other.subTxs[0]} `);
    assert.equal(el('wrap-cbor').value, '');
    assert.equal(el('wrap-sign').disabled, true);
    type('wrap-subtxs', '');
});

test('balanceAndSignTx is locked behind the explicit opt-in and warns that the wallet may submit', async () => {
    assert.match(document.getElementById('cip209-balance-sign-card').textContent, /THIS CALL MAY SUBMIT A REAL TRANSACTION/);
    assert.match(document.getElementById('cip209-section').textContent, /CIP-209 gives the dApp no flag to prevent it/);
    assert.equal(el('allow-wallet-submit').checked, false);
    await click('balance-sign-build');
    const request = el('balance-sign-cbor').value;
    assert.equal(request, buildUnbalancedPayment(C, { address: ctx.address, amount: 2_000_000n }));
    assert.match(result('balance-sign').textContent, /Nothing has been sent to the wallet yet/);
    assert.equal(el('balance-sign-call').disabled, true);
    el('balance-sign-call').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls.length, 0);

    check('allow-wallet-submit', true);
    assert.equal(el('balance-sign-call').disabled, false);
    check('allow-wallet-submit', false);
    assert.equal(el('balance-sign-call').disabled, true);
    el('balance-sign-call').disabled = false;
    await click('balance-sign-call');
    assert.match(result('balance-sign').textContent, /Check "Allow balanceAndSignTx" first: the wallet may submit/);
    assert.equal(calls.length, 0);

    type('raw-method', 'balanceAndSignTx');
    assert.equal(el('raw-call').disabled, true);
    type('raw-args', JSON.stringify([request]));
    el('raw-call').disabled = false;
    await click('raw-call');
    assert.match(result('raw').textContent, /Check "Allow balanceAndSignTx" first/);
    assert.equal(calls.length, 0);
    check('allow-wallet-submit', true);
    assert.equal(el('raw-call').disabled, false);
    await click('raw-call');
    assert.deepEqual(calls, [{ method: 'balanceAndSignTx', args: [request] }]);
    type('raw-method', 'getBalances');
    type('raw-args', '[]');
});

test('balanceAndSignTx sends the unbalanced payment and reports what the wallet did with it', async () => {
    const recipient = addressOf(C, fixtureKey(C, '05'));
    const builder = createBuilder(C, ctx);
    let balanced;
    try { balanced = signTx(C, await builder.sendLovelace({ address: recipient, amount: 3_500_000n }).build()); } finally { builder.dispose(); }
    const txHash = transactionId(C, balanced);
    api.balanceAndSignTx = record('balanceAndSignTx', () => ({ cbor: balanced, txHash, complete: true, submitted: true }));
    type('balance-sign-recipient', recipient);
    type('balance-sign-amount', '3.5');
    check('allow-wallet-submit', true);
    await click('balance-sign-build');
    const request = el('balance-sign-cbor').value;
    assert.deepEqual(C.inspectTx(request).body, { inputs: [], outputs: [{ address: recipient, amount: { coin: '3500000' } }], fee: '0' });
    await click('balance-sign-call');
    assert.deepEqual(calls, [{ method: 'balanceAndSignTx', args: [request] }]);
    const text = result('balance-sign').textContent;
    assert.match(text, /Wallet reports: complete = true, submitted = true\nCOMPLETE and SUBMITTED by the wallet\./);
    assert.match(text, new RegExp(`Returned transaction id: ${txHash}`));
    assert.match(text, /Key signatures verified against it: 1/);
    assert.match(text, /Checks passed: result shape, txHash matches the returned transaction/);
    assert.match(text, /Returned object:\s+\{\s+"cbor"/);
    assert.match(text, /Returned transaction summary:\s+\{\s+"body"/);
    assert.ok(result('balance-sign').classList.contains('success'));
    assert.equal(el('balance-sign-returned').value, balanced);
    assert.match(document.getElementById('log-output').textContent, new RegExp(`the wallet reports it SUBMITTED transaction ${txHash}`));
    assert.equal(el('balance-sign-call').disabled, true, 'a new request must be built before calling again');

    for (const [response, expected, status] of [
        [{ cbor: balanced, txHash, complete: true, submitted: false }, /COMPLETE but NOT SUBMITTED: the wallet chose not to submit/, 'success'],
        [{ cbor: balanced, txHash, complete: true, submitted: false, submitError: { code: 1, info: 'mempool full' } },
            /submission was attempted and failed[\s\S]*"info": "mempool full"[\s\S]*code 1: TxSendError Refused/, 'success'],
        [{ cbor: balanced, txHash: 'ee'.repeat(32), complete: true, submitted: true }, /FAILED CHECKS:\s+`txHash` e+ is not the id of the returned transaction/, 'error'],
        [{ cbor: balanced, txHash, complete: false, submitted: true }, /FAILED CHECKS:[\s\S]*not a combination the CIP allows/, 'error'],
        [{ cbor: signTx(C, request), txHash: transactionId(C, request), complete: false, submitted: false }, /INCOMPLETE and NOT SUBMITTED[\s\S]*Checks passed/, 'success'],
        [{ txHash, complete: true, submitted: true }, /`cbor` must be a CBOR hex string[\s\S]*Returned object:/, 'error'],
    ]) {
        api.balanceAndSignTx = record('balanceAndSignTx', () => response);
        await click('balance-sign-build');
        await click('balance-sign-call');
        assert.match(result('balance-sign').textContent, expected);
        assert.ok(result('balance-sign').classList.contains(status), result('balance-sign').textContent);
    }
    for (const [code, name] of [[2, 'UserDeclined'], [3, 'BodyLocked'], [4, 'CannotBalance'], [5, 'EvaluationFailed'], [6, 'UnsatisfiedGuard'], [7, 'SubTxWitnessesMissing']]) {
        api.balanceAndSignTx = record('balanceAndSignTx', () => { throw { code, info: `reason ${code}` }; });
        await click('balance-sign-build');
        await click('balance-sign-call');
        assert.match(result('balance-sign').textContent, new RegExp(`cip209\\.balanceAndSignTx rejected with:[\\s\\S]*"info": "reason ${code}"[\\s\\S]*code ${code}: TxSignError ${name}`));
        assert.equal(el('balance-sign-returned').value, '');
    }
    type('balance-sign-recipient', '');
    type('balance-sign-amount', '2');
});

test('balanceAndSignTx can send the imported subtransactions in an unbalanced wrapper or bare', async () => {
    const other = await counterparty();
    check('allow-wallet-submit', true);
    type('balance-sign-form', 'wrapper');
    await click('balance-sign-build');
    assert.match(result('balance-sign').textContent, /Paste at least one subtransaction CBOR/);
    assert.equal(el('balance-sign-call').disabled, true);
    type('wrap-subtxs', other.subTxs.join('\n'));
    await click('balance-sign-build');
    const request = el('balance-sign-cbor').value;
    assert.equal(request, buildUnbalancedWrapper(C, other.subTxs));
    assert.deepEqual([C.inspectTx(request).body.inputs, C.inspectTx(request).body.fee], [[], '0']);

    provider.resolveUnspentOutputs = async () => other.utxos;
    await click('wrap-build');
    const wrapped = signTx(C, el('wrap-cbor').value);
    api.balanceAndSignTx = record('balanceAndSignTx', () => ({ cbor: wrapped, txHash: transactionId(C, wrapped), complete: true, submitted: false }));
    await click('balance-sign-call');
    assert.deepEqual(calls.at(-1), { method: 'balanceAndSignTx', args: [request] });
    assert.match(result('balance-sign').textContent, /COMPLETE but NOT SUBMITTED[\s\S]*Checks passed/);

    const payment = signTx(C, buildUnbalancedPayment(C, { address: ctx.address, amount: 1_000_000n }));
    api.balanceAndSignTx = record('balanceAndSignTx', () => ({ cbor: payment, txHash: transactionId(C, payment), complete: true, submitted: false }));
    await click('balance-sign-build');
    await click('balance-sign-call');
    assert.match(result('balance-sign').textContent, /FAILED CHECKS:\s+The returned transaction carries subtransactions \[\], not the supplied/);

    type('balance-sign-form', 'bare');
    assert.equal(el('balance-sign-cbor').value, '');
    await click('balance-sign-build');
    assert.equal(el('balance-sign-cbor').value, `82${other.subTxs.join('')}`);
    type('wrap-subtxs', other.subTxs[0]);
    assert.equal(el('balance-sign-cbor').value, '', 'editing the imported list invalidates the request');
    await click('balance-sign-build');
    assert.equal(el('balance-sign-cbor').value, other.subTxs[0]);
    await click('balance-sign-call');
    assert.deepEqual(calls.at(-1), { method: 'balanceAndSignTx', args: [other.subTxs[0]] });
    type('balance-sign-form', 'payment');
    type('wrap-subtxs', '');
});

test('raw calls pass the JSON arguments untouched and show the raw result or error object', async () => {
    check('allow-wallet-submit', true);
    const response = { utxos: [], accounts: 'a0' };
    for (const [method, args, respond, expected] of [
        ['getBalances', [], () => response, /cip209\.getBalances resolved with:\s+\{\s+"utxos": \[\],\s+"accounts": "a0"\s+\}/],
        ['getBalances', [{ page: 3, limit: 7 }], () => { throw { maxSize: 1 }; }, /cip209\.getBalances rejected with:\s+\{\s+"maxSize": 1\s+\}/],
        ['signSubTxs', [['83a0a0f6'], 'full'], () => ['83a0a0f6'], /cip209\.signSubTxs resolved with:\s+\[\s+"83a0a0f6"\s+\]/],
        ['signSubTxs', [['zz']], () => { throw { code: -1, info: 'not hex' }; }, /"code": -1,\s+"info": "not hex"\s+\}\s+code -1: APIError InvalidRequest/],
        ['balanceAndSignTx', ['84a0'], () => { throw { code: 4, info: 'insufficient funds' }; }, /code 4: TxSignError CannotBalance/],
        ['balanceAndSignTx', ['84a0'], () => undefined, /cip209\.balanceAndSignTx resolved with:\nundefined/],
        ['signTx', ['84a0', true], () => 'a0', /^signTx resolved with:\n"a0"$/],
        ['signTx', ['84a0'], () => { throw Object.assign(new Error('SubTxWitnessesMissing'), { code: 7, info: 'sub 0: key ab' }); },
            /signTx rejected with:\s+\{\s+"code": 7,\s+"info": "sub 0: key ab",\s+"message": "SubTxWitnessesMissing"\s+\}\s+code 7: TxSignError SubTxWitnessesMissing/],
    ]) {
        if (method === 'signTx') state.cip30Api.signTx = record(method, respond);
        else api[method] = record(method, respond);
        type('raw-method', method);
        type('raw-args', JSON.stringify(args));
        await click('raw-call');
        assert.deepEqual(calls.at(-1), { method, args });
        assert.match(result('raw').textContent, expected);
        assert.doesNotMatch(result('raw').textContent, /Expected:/);
    }
    const before = calls.length;
    for (const [args, expected] of [['{"page":0}', /must be a JSON array/], ['[', /not valid JSON/]]) {
        type('raw-args', args);
        await click('raw-call');
        assert.match(result('raw').textContent, expected);
    }
    assert.equal(calls.length, before);
    type('raw-method', 'getBalances');
    type('raw-args', '[]');
});

test('each malformed preset fills the raw form and is judged against InvalidRequest (-1)', async () => {
    const presets = malformedPresets(C, ctx.address);
    assert.equal(document.querySelectorAll('#cip209-raw-presets [data-preset]').length, presets.length);
    for (const item of presets) {
        api.signSubTxs = record('signSubTxs', () => { throw { code: -1, info: `refused ${item.id}` }; });
        await preset(item.id);
        assert.equal(el('raw-method').value, 'signSubTxs');
        assert.deepEqual(JSON.parse(el('raw-args').value), item.args);
        assert.match(el('raw-expected').textContent, new RegExp(`Preset "${item.label}"\\. Expected: APIError InvalidRequest \\(-1\\)\\. Basis: `));
        const sent = calls.length;
        await click('raw-call');
        assert.equal(calls.length, sent + 1);
        assert.deepEqual(calls.at(-1), { method: 'signSubTxs', args: item.args });
        assert.match(result('raw').textContent, new RegExp(`"info": "refused ${item.id}"[\\s\\S]*Expected: APIError InvalidRequest \\(-1\\)\\. Outcome as expected\\.`));
        assert.ok(result('raw').classList.contains('success'));
    }
    api.signSubTxs = record('signSubTxs', subTxs => subTxs.map(() => 'a0'));
    await preset('empty');
    await click('raw-call');
    assert.match(result('raw').textContent, /resolved with:\s+\[\][\s\S]*Expected: APIError InvalidRequest \(-1\)\. Outcome NOT as expected\./);
    assert.ok(result('raw').classList.contains('error'));
    api.signSubTxs = record('signSubTxs', () => { throw { code: 2, info: 'declined' }; });
    await preset('too-many');
    await click('raw-call');
    assert.match(result('raw').textContent, /code 2: TxSignError UserDeclined[\s\S]*Outcome NOT as expected\./);

    await preset('format');
    type('raw-args', '[[]]');
    assert.equal(el('raw-expected').textContent, '');
    api.signSubTxs = record('signSubTxs', () => []);
    await click('raw-call');
    assert.doesNotMatch(result('raw').textContent, /Expected:/);
    type('raw-method', 'getBalances');
    type('raw-args', '[]');
});

test('changing wallet or mode discards pending work, and a late wallet answer is ignored', async () => {
    await click('sign-subtxs-build');
    await click('sign-subtxs-sign');
    await click('sign-subtxs-use');
    await click('wrap-build');
    await click('balance-sign-build');
    for (const id of ['sign-subtxs-cbor', 'sign-subtxs-signed', 'wrap-cbor', 'balance-sign-cbor']) assert.ok(el(id).value, id);
    check('network-mode', false);
    for (const id of ['sign-subtxs-cbor', 'sign-subtxs-signed', 'wrap-cbor']) assert.equal(el(id).value, '', id);
    assert.ok(el('balance-sign-cbor').value);
    refreshCip209();
    assert.equal(el('balance-sign-cbor').value, '');
    assert.deepEqual([el('sign-subtxs-sign').disabled, el('wrap-sign').disabled, el('balance-sign-call').disabled], [true, true, true]);

    check('network-mode', true);
    await click('sign-subtxs-build');
    let complete;
    api.signSubTxs = () => new Promise(resolve => { complete = resolve; });
    el('sign-subtxs-sign').click();
    for (let n = 0; n < 100 && !complete; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(complete);
    assert.ok(buttons().every(button => button.disabled), 'no second action while the wallet is asked');
    state.wallet = null;
    state.cip30Api = null;
    state.extensions = { cip95: false, cip142: false, cip209: false };
    refreshCip209();
    complete(['a0', 'a0']);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(el('sign-subtxs-signed').value, '');
    assert.match(el('status').textContent, /Connect a wallet/);
    assert.ok(buttons().every(button => button.disabled));
    type('wrap-subtxs', '');
});

test('compatibility mode builds intents with candidate parameters; network mode needs protocol 12', async () => {
    provider.getParameters = async () => ({ ...ctx.params, protocolVersion: { major: 10, minor: 0 } });
    await click('sign-subtxs-build');
    assert.match(result('sign-subtxs').textContent, /endpoint reports 10/);
    assert.equal(el('sign-subtxs-sign').disabled, true);
    check('network-mode', false);
    await click('sign-subtxs-build');
    assert.match(result('sign-subtxs').textContent, /protocol 12 candidate parameters \(endpoint protocol 10\)/);
    await click('sign-subtxs-sign');
    assert.ok(result('sign-subtxs').classList.contains('success'));
    wallet.getUnspentOutputs = async () => ctx.utxos.slice(0, 1);
    await click('sign-subtxs-build');
    assert.match(result('sign-subtxs').textContent, /The wallet has 1 such UTxO\(s\); 2 needed/);
    wallet.getUnspentOutputs = async () => ctx.utxos;
});
