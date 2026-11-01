import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as C from '@biglup/cometa';
import { localContext } from './helpers/dijkstra-local.js';

let state, resetDijkstra, ctx, wallet;
const el = id => document.getElementById(`dijkstra-${['build', 'sign', 'submit', 'result', 'cbor', 'count', 'recipient', 'amount'].includes(id) ? `batch-${id}` : id === 'batch' ? 'batch-build' : id}`);
const click = async id => {
    el(id).click();
    for (let n = 0; n < 500 && el('build').disabled; n++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(el('build').disabled, false, 'action must finish');
};
const witnessesFor = cbor => {
    const tx = C.readTransactionFromCbor(cbor);
    let hash;
    try { hash = C.readBlake2bHashData(C.getModule().transaction_get_id(tx)); } finally { C.unrefObject(tx); }
    const key = C.Ed25519PrivateKey.fromNormalHex('01'.repeat(32));
    return [{ vkey: key.getPublicKey().toHex(), signature: key.sign(hash).toHex() }];
};
const connect = () => {
    el('network-mode').checked = true;
    resetDijkstra();
    wallet.signTransaction = async cbor => witnessesFor(cbor);
    state.wallet = wallet;
    state.provider = { getParameters: async () => ctx.params, getNetworkMagic: () => C.NetworkMagic.Preview };
    state.networkId = 0;
};
before(async () => {
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Cometa = C;
    await C.ready();
    ctx = localContext(C);
    wallet = {
        getChangeAddress: async () => C.Address.fromString(ctx.address),
        getUnspentOutputs: async () => ctx.utxos,
        getCollateral: async () => ctx.collateral,
        signTransaction: async () => [],
        submitTransaction: async () => 'ab'.repeat(32),
    };
    ({ state } = await import('../scripts/app-state.js'));
    const handlers = await import('../scripts/handlers/dijkstra-tests.js');
    resetDijkstra = handlers.resetDijkstra;
    handlers.setupDijkstra();
});

test('disconnected users cannot build transactions', async () => {
    await click('batch');
    assert.match(el('result').textContent, /Connect a wallet/);
    assert.equal(el('sign').disabled, true);
    assert.equal(el('submit').disabled, true);
});

test('build, rejected signature, retry, sign, submit flow uses only the built CBOR', async () => {
    connect();
    await click('batch');
    assert.match(el('result').textContent, /Sub-transactions/);
    const summary = el('result').textContent;
    assert.doesNotMatch(summary, /omits|missing fields|use the full CBOR/);
    const inspected = JSON.parse(summary.split('Transaction summary:\n')[1]);
    assert.equal(inspected.body.sub_transactions.length, Number(el('count').value));
    assert.ok(inspected.body.sub_transactions.every(tx => tx.body.outputs.length > 0 && tx.witness_set));
    const unsigned = el('cbor').value;
    assert.ok(unsigned.length > 0);
    assert.equal(el('submit').disabled, true);
    wallet.signTransaction = async () => { throw new Error('User declined'); };
    await click('sign');
    assert.match(el('result').textContent, /User declined/);
    assert.equal(el('submit').disabled, true);
    wallet.signTransaction = async (cbor, partial) => { assert.equal(cbor, unsigned); assert.equal(partial, false); return witnessesFor(cbor); };
    await click('sign');
    assert.equal(el('submit').disabled, false);
    wallet.submitTransaction = async cbor => { assert.equal(cbor, C.applyVkeyWitnessSet(unsigned, witnessesFor(unsigned))); return 'ab'.repeat(32); };
    await click('submit');
    assert.match(el('result').textContent, /Submitted: ab/);
    assert.equal(el('submit').disabled, true);
});

test('editing inputs invalidates a built transaction; a failed rebuild cannot reuse it', async () => {
    connect();
    await click('batch');
    el('count').value = '4';
    el('count').dispatchEvent(new window.Event('input'));
    assert.equal(el('sign').disabled, true);
    assert.equal(el('cbor').value, '');
    state.provider.getParameters = async () => ({ ...ctx.params, protocolVersion: { major: 10 } });
    await click('batch');
    assert.match(el('result').textContent, /endpoint reports 10/);
    assert.equal(el('sign').disabled, true);
});

test('disconnect while signing discards the response and disables submission', async () => {
    connect();
    await click('batch');
    let complete;
    wallet.signTransaction = () => new Promise(resolve => { complete = resolve; });
    el('sign').click();
    for (let n = 0; n < 100 && !complete; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(complete);
    resetDijkstra();
    state.wallet = null;
    complete([]);
    for (let n = 0; n < 100 && el('build').disabled; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(el('sign').disabled, true);
    assert.equal(el('submit').disabled, true);
    assert.equal(el('cbor').value, '');
});

test('custom networks require their own slot timing', async () => {
    connect();
    state.provider.getNetworkMagic = () => 42;
    await click('batch');
    assert.match(el('result').textContent, /slot timing/);
    el('zero-time').value = '1700000000000';
    await click('batch');
    assert.equal(el('sign').disabled, false);
});


test('compatibility mode uses real inputs, verifies signatures, and never enables submission on Conway', async () => {
    connect();
    el('network-mode').checked = false;
    state.provider.getParameters = async () => ({ ...ctx.params, protocolVersion: { major: 10 } });
    await click('batch');
    assert.match(el('result').textContent, /endpoint protocol 10/);
    const body = C.inspectTx(el('cbor').value).body;
    assert.equal(body.inputs[0].transaction_id, ctx.utxos[0].input.txId);
    await click('sign');
    assert.match(el('result').textContent, /signature\(s\) verified/);
    assert.equal(el('submit').disabled, true);
});

test('empty or invalid signatures are failures, not wallet support', async () => {
    connect();
    await click('batch');
    wallet.signTransaction = async () => [];
    await click('sign');
    assert.match(el('result').textContent, /no key witnesses/);
    assert.equal(el('submit').disabled, true);
    wallet.signTransaction = async cbor => [{ ...witnessesFor(cbor)[0], signature: '00'.repeat(64) }];
    await click('sign');
    assert.match(el('result').textContent, /does not verify/);
    assert.equal(el('submit').disabled, true);
});

test('existing Conway transfer and native-mint handlers still build with the new release', async () => {
    connect();
    wallet.getUsedAddresses = async () => [C.Address.fromString(ctx.address)];
    const builders = [];
    wallet.createTransactionBuilder = async () => {
        const builder = C.TransactionBuilder.create({ ...ctx, params: { ...ctx.params, protocolVersion: { major: 10, minor: 0 } } })
            .setUtxos(ctx.utxos).setChangeAddress(ctx.address);
        builders.push(builder);
        return builder;
    };
    try {
        const { buildSelfTransaction } = await import('../scripts/handlers/transaction-tests.js');
        const { buildNativeMintTransaction } = await import('../scripts/handlers/script-tests.js');
        const self = C.inspectTx(await buildSelfTransaction(2));
        assert.equal(self.body.outputs[0].amount.coin, '2000000');
        const mint = C.inspectTx(await buildNativeMintTransaction('Regression', 1));
        assert.equal(Object.values(mint.body.mint[0].assets)[0], '1');
    } finally {
        builders.forEach(builder => builder.dispose());
    }
});


test('all twelve test sections appear together on connection and hide on disconnect', async () => {
    const ui = await import('../scripts/ui.js');
    const sections = [...document.querySelectorAll('section.card')].filter(section => section.id !== 'connection-section');
    assert.equal(sections.length, 12);
    assert.ok(sections.every(section => section.classList.contains('hidden')));
    ui.showTestSections();
    assert.ok(sections.every(section => !section.classList.contains('hidden')));
    ui.hideTestSections();
    assert.ok(sections.every(section => section.classList.contains('hidden')));
});


test('each feature has its own controls and pending state, without a feature dropdown', async () => {
    connect();
    assert.equal(document.querySelector('#dijkstra-section select'), null);
    assert.equal(document.getElementById('dijkstra-apply'), null);
    await click('key-guard-build');
    const keyCbor = el('key-guard-cbor').value;
    assert.ok(keyCbor);
    assert.equal(el('key-guard-sign').disabled, false);
    await click('batch');
    assert.equal(el('key-guard-cbor').value, keyCbor);
    assert.equal(el('key-guard-sign').disabled, false);
    el('count').dispatchEvent(new window.Event('input'));
    assert.equal(el('sign').disabled, true);
    assert.equal(el('key-guard-sign').disabled, false);
    await click('key-guard-sign');
    assert.match(el('key-guard-result').textContent, /signature\(s\) verified/);
});

test('mainnet wallets can build and sign with mainnet addresses', async () => {
    connect();
    el('network-mode').checked = false;
    state.networkId = 1;
    state.provider.getNetworkMagic = () => C.NetworkMagic.Mainnet;
    state.provider.getParameters = async () => ({ ...ctx.params, protocolVersion: { major: 10, minor: 0 } });
    const original = ctx;
    const credential = C.Address.fromString(ctx.address).asEnterprise().getCredential();
    const address = C.EnterpriseAddress.fromCredentials(C.NetworkId.Mainnet, credential).toAddress().toString();
    ctx = { ...ctx, address, utxos: ctx.utxos.map(utxo => ({ ...utxo, output: { ...utxo.output, address } })) };
    try {
        await click('batch');
        assert.ok(el('cbor').value);
        await click('sign');
        assert.match(el('result').textContent, /signature\(s\) verified/);
        assert.equal(el('submit').disabled, true);
    } finally {
        ctx = original;
    }
});

test('every feature card builds through its own controls and reads only its own fields', async () => {
    connect();
    state.cip30Api = { getRewardAddresses: async () => [C.RewardAddress.fromBech32(ctx.rewardAddress).toAddress().toHex()] };
    state.provider.getRewardsBalance = async () => 10_000_000n;
    for (const feature of ['deposit', 'transfer', 'balances', 'key-guard', 'native-guard', 'plutus-guard', 'deferred-mint']) {
        if (el(`${feature}-reward`)) el(`${feature}-reward`).value = ctx.rewardAddress;
        await click(`${feature}-build`);
        assert.ok(el(`${feature}-cbor`).value, `${feature}: ${el(`${feature}-result`).textContent}`);
        assert.equal(el(`${feature}-sign`).disabled, false);
        assert.equal(el(`${feature}-submit`).disabled, true);
    }
});
