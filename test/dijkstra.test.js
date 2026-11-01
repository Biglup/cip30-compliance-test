import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '@biglup/cometa';
import { Decoder } from 'cbor-x';
import { buildBatch, buildFeature, createBuilder, parseAda, requireDijkstra, COMETA_VERSION, buildParameters, verifyWalletWitnesses } from '../scripts/dijkstra.js';
import { localContext, runLocalChecks } from './helpers/dijkstra-local.js';

const decoder = new Decoder({ mapsAsObjects: false });
const decode = cbor => decoder.decode(Buffer.from(cbor, 'hex'));
let results;
before(async () => {
    await C.ready();
    results = new Map((await runLocalChecks(C)).map(result => [result.name, result]));
});

test('browser CDN and integration tests use the same published Cometa candidate', () => {
    assert.ok(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes(`@biglup/cometa@${COMETA_VERSION}/`));
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
    assert.equal(pkg.devDependencies['@biglup/cometa'], COMETA_VERSION);
});

test('all local feature checks execute against the released WASM', () => {
    assert.equal(results.size, 14);
    for (const result of results.values()) assert.equal(result.passed, true, `${result.name}: ${result.error}`);
});

test('direct deposit and transfer preserve amounts in actual Dijkstra CBOR fields', () => {
    const deposit = decode(results.get('deposit').cbor)[0];
    assert.deepEqual([...deposit.get(25).values()], [2_000_000]);
    const transfer = decode(results.get('transfer').cbor)[0];
    assert.deepEqual([...transfer.get(25).values()], [2_000_000]);
    assert.deepEqual([...transfer.get(5).values()], [2_000_000]);
});

test('both balance interval forms survive serialization', () => {
    const body = decode(results.get('balances').cbor)[0];
    assert.deepEqual([...body.get(26).values()], [[0, 100_000_000]]);
    assert.deepEqual([...body.get(27).values()], [0]);
});

test('native guard policy requires the enclosing payment-key guard', () => {
    const [body, witnesses] = decode(results.get('native-guard').cbor);
    const [policy] = witnesses.get(1);
    const inspected = C.inspectTx(results.get('native-guard').cbor);
    assert.equal(Object.hasOwn(inspected.body, 'required_signers'), false);
    assert.deepEqual(inspected.body.guards, [inspected.witness_set.native_scripts[0].credential]);
    assert.equal(policy[0], 6); // RequireGuard native script tag
    assert.deepEqual(policy[1][1], [...body.get(14)][0]);
    assert.equal([...body.get(9).values()][0].values().next().value, 1);
});

test('native VM evaluates Plutus V4 guard and deferred mint with separate collateral', () => {
    for (const [name, purpose] of [['plutus-guard', 6], ['deferred-mint', 1]]) {
        const [body, witnesses] = decode(results.get(name).cbor);
        assert.equal(witnesses.get(8).size, 1); // V4 scripts
        const [[pointer, [data, budget]]] = witnesses.get(5);
        assert.equal(pointer[0], purpose);
        assert.ok(budget[0] > 0 && budget[1] > 0);
        if (name === 'deferred-mint') assert.equal(data, body.get(0).size);
        assert.notDeepEqual([...body.get(0)], [...body.get(13)]);
    }
});

for (const name of ['wallet-funded batch', 'independently signed batch']) {
    test(`${name}: three distinct intents, preserved witnesses, no duplicate inputs, balanced value`, () => {
        const result = results.get(name);
        const [body] = decode(result.cbor);
        const subs = [...body.get(23)];
        assert.equal(subs.length, 3);
        assert.equal(new Set(result.intents.map(item => item.id)).size, 3);
        const inputIds = [...body.get(0)].map(([id, index]) => `${id.toString('hex')}#${index}`);
        let outputValue = body.get(1).reduce((sum, output) => sum + output.get(1), 0);
        for (const sub of subs) {
            const original = result.intents.find(item => {
                const decoded = decode(item.cbor);
                return JSON.stringify([...decoded[0].get(1)][0].get(0)) === JSON.stringify([...sub[0].get(1)][0].get(0))
                    && decoded[0].get(1)[0].get(1) === sub[0].get(1)[0].get(1);
            });
            assert.ok(original);
            assert.deepEqual(sub, decode(original.cbor));
            assert.equal(sub[0].get(24).size, 1);
            assert.equal(sub[0].has(2), false); // Sub-transactions do not carry fees.
            inputIds.push(...[...sub[0].get(0)].map(([id, index]) => `${id.toString('hex')}#${index}`));
            outputValue += sub[0].get(1).reduce((sum, output) => sum + output.get(1), 0);
            if (name === 'independently signed batch') {
                const [[vkey, signature]] = sub[1].get(0);
                assert.ok(C.Ed25519PublicKey.fromHex(vkey.toString('hex')).verify(
                    C.Ed25519Signature.fromHex(signature.toString('hex')), C.hexToUint8Array(original.id)));
            }
        }
        assert.equal(new Set(inputIds).size, inputIds.length);
        assert.equal(outputValue + body.get(2), name === 'independently signed batch' ? 130_000_000 : 100_000_000);
    });
}

test('batch size and insufficient funding fail before a transaction can be signed', async () => {
    const context = localContext(C);
    for (const count of [0, 1, 2.5, 21, NaN]) await assert.rejects(buildBatch(C, context, { count, amount: 2_000_000n }), /2–20/);
    await assert.rejects(buildBatch(C, context, { count: 3, amount: 100_000_000n }));
});

test('Conway parameters and absent V4 cost models cannot masquerade as Dijkstra', () => {
    for (const major of [10, 11, 13, undefined]) assert.throws(() => requireDijkstra({ protocolVersion: { major } }), /protocol 12/);
    const context = localContext(C);
    assert.throws(() => createBuilder(C, { ...context, params: { ...context.params, costModels: [] } }, true), /cost model/);
    assert.throws(() => createBuilder(C, { ...context, collateral: context.utxos }, true), /No spendable/);
});

test('invalid amounts, ranges, and reward accounts fail explicitly', async () => {
    assert.equal(parseAda('4294.967303'), 4294967303n);
    for (const value of ['', '-1', 'NaN', '1e3', '0.0000001', '18446744073710']) assert.throws(() => parseAda(value));
    const context = localContext(C);
    await assert.rejects(buildFeature(C, context, { feature: 'balances', rewardAddress: context.rewardAddress, lower: 2n, upper: 1n, starting: 0n }));
    await assert.rejects(buildFeature(C, context, { feature: 'deposit', rewardAddress: 'invalid' }));
});


test('compatibility parameters never mutate the endpoint parameters; network mode preserves them', () => {
    const params = { ...localContext(C).params, protocolVersion: { major: 10, minor: 0 }, costModels: [] };
    const diagnostic = buildParameters(params, 'compatibility');
    assert.equal(params.protocolVersion.major, 10);
    assert.equal(params.costModels.length, 0);
    assert.equal(diagnostic.protocolVersion.major, 12);
    assert.equal(diagnostic.costModels[0].language, 'PlutusV4');
    assert.throws(() => buildParameters(params, 'network'));
    assert.equal(buildParameters(diagnostic, 'network'), diagnostic);
});

test('the published browser bundle runs every feature without Node shims', async () => {
    const { createContext, runInContext } = await import('node:vm');
    const { webcrypto } = await import('node:crypto');
    const sandbox = createContext({ console, crypto: webcrypto, TextEncoder, TextDecoder, URL, Blob, atob, btoa, setTimeout, clearTimeout, fetch });
    runInContext(readFileSync(new URL('../node_modules/@biglup/cometa/dist/iife/index.global.js', import.meta.url), 'utf8'), sandbox);
    await sandbox.Cometa.ready();
    for (const result of await runLocalChecks(sandbox.Cometa)) assert.equal(result.passed, true, `${result.name}: ${result.error}`);
});


test('signature verification checks key guards independently of funding keys', async () => {
    const context = localContext(C);
    const paymentKey = C.Ed25519PrivateKey.fromNormalHex('01'.repeat(32));
    const guardKey = C.Ed25519PrivateKey.fromNormalHex('02'.repeat(32));
    const guardHash = guardKey.getPublicKey().toHashHex();
    const builder = createBuilder(C, context);
    let cbor;
    try {
        cbor = await builder.addGuard({ type: C.CredentialType.KeyHash, hash: guardHash })
            .sendLovelace({ address: context.address, amount: 2_000_000n }).build();
    } finally { builder.dispose(); }
    const tx = C.readTransactionFromCbor(cbor);
    let hash;
    try { hash = C.readBlake2bHashData(C.getModule().transaction_get_id(tx)); }
    finally { C.unrefObject(tx); }
    const witness = key => ({ vkey: key.getPublicKey().toHex(), signature: key.sign(hash).toHex() });
    const inspected = C.inspectTx(cbor);
    assert.equal(Object.hasOwn(inspected.body, 'required_signers'), false);
    assert.ok(inspected.body.guards.some(guard => guard.tag === 'pubkey_hash' && guard.value === guardHash));
    const mixedGuardsInspector = { ...C, inspectTx(value) {
        const inspected = C.inspectTx(value);
        inspected.body.guards.push({ tag: 'script_hash', value: '03'.repeat(28) });
        return inspected;
    } };
    for (const api of [C, mixedGuardsInspector]) {
        assert.throws(() => verifyWalletWitnesses(api, cbor, [witness(paymentKey)], context.utxos),
            new RegExp(`Wallet did not sign required key ${guardHash}`));
        assert.equal(verifyWalletWitnesses(api, cbor, [witness(paymentKey), witness(guardKey)], context.utxos), 2);
    }
});
