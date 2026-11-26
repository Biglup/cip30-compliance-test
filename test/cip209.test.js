import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as C from '@biglup/cometa';
import { Decoder } from 'cbor-x';
import { createBuilder, paymentCredential } from '../scripts/dijkstra.js';
import { MAX_INTENTS, buildIntents, buildUnbalancedPayment, buildUnbalancedWrapper, buildWrapper, checkBalanceResult, decodeBalances,
    encodeBareSubTransactions, errorDetails, errorName, formatError, inspectSubTransactions, isHex, malformedPresets, meetsExpectation,
    missingSubTxWitnesses, sampleSubTransaction, splitSubTransaction, subTransactionsOf, transactionId, verifySignedSubTxs } from '../scripts/cip209.js';
import { addressOf, fixtureKey, signSubTx, signTx, utxoCbor, walletContext, witnessSetOf } from './helpers/cip209-local.js';

const decoder = new Decoder({ mapsAsObjects: false });
const decode = cbor => decoder.decode(Buffer.from(cbor, 'hex'));
let context, batcher, intents;
before(async () => {
    await C.ready();
    context = walletContext(C);
    batcher = addressOf(C, fixtureKey(C, '05'));
    intents = await buildIntents(C, context, { count: 2, amount: 3_000_000n, batcher });
});

test('every cache-busting version on the page and in the scripts is the same', () => {
    const files = ['index.html', ...['', 'handlers/'].flatMap(dir => readdirSync(new URL(`../scripts/${dir}`, import.meta.url))
        .filter(name => name.endsWith('.js')).map(name => `scripts/${dir}${name}`))];
    const versions = files.flatMap(file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(/\?v=[\w-]+/g) || []);
    assert.ok(versions.length > 10);
    assert.equal(new Set(versions).size, 1, [...new Set(versions)].join(' '));
});

test('an unbalanced payment has no inputs, a zero fee and only the requested output', () => {
    const cbor = buildUnbalancedPayment(C, { address: context.address, amount: 2_500_000n });
    const [body, witnesses, valid, auxiliary] = decode(cbor);
    assert.deepEqual([...body.keys()], [0, 1, 2]);
    assert.equal(cbor.slice(4, 14), '00d9010280');
    assert.equal(body.get(1).length, 1);
    assert.equal(body.get(1)[0].get(1), 2_500_000);
    assert.equal(body.get(2), 0);
    assert.deepEqual([witnesses.size, valid, auxiliary], [0, true, null]);
    const inspected = C.inspectTx(cbor);
    assert.deepEqual(inspected.body.inputs, []);
    assert.deepEqual(inspected.body.outputs, [{ address: context.address, amount: { coin: '2500000' } }]);
    assert.throws(() => buildUnbalancedPayment(C, { address: context.address, amount: 0n }), /positive/);
});

test('an unbalanced wrapper and the bare forms carry the subtransactions byte for byte', () => {
    const subTxs = intents.map(intent => signSubTx(C, intent.cbor));
    const wrapper = buildUnbalancedWrapper(C, subTxs);
    const [body] = decode(wrapper);
    assert.deepEqual([...body.keys()], [0, 1, 2, 23]);
    assert.ok(wrapper.includes(`17d9010282${subTxs[0]}`));
    assert.deepEqual([body.get(1), body.get(2)], [[], 0]);
    assert.deepEqual(subTransactionsOf(C, wrapper), subTxs);
    assert.deepEqual(C.inspectTx(wrapper).body.sub_transactions.map(sub => sub.body.inputs.length), [1, 1]);
    assert.equal(encodeBareSubTransactions(C, [subTxs[0]]), subTxs[0]);
    assert.equal(encodeBareSubTransactions(C, subTxs), `82${subTxs.join('')}`);
    assert.throws(() => buildUnbalancedWrapper(C, []), /At least one/);
    assert.throws(() => buildUnbalancedWrapper(C, ['zz']), /hex/);
    assert.deepEqual(subTransactionsOf(C, buildUnbalancedPayment(C, { address: context.address, amount: 1n })), []);
});

test('intents each spend their own UTxO, balance by themselves and require the batcher guard', () => {
    assert.equal(new Set(intents.map(intent => intent.id)).size, 2);
    const guard = paymentCredential(C, batcher).hash;
    const spent = new Set();
    for (const intent of intents) {
        const [body, witnesses] = decode(intent.cbor);
        assert.equal(body.has(2), false);
        const [[txId, index]] = [...body.get(0)];
        spent.add(`${txId.toString('hex')}#${index}`);
        assert.equal(`${txId.toString('hex')}#${index}`, `${intent.utxo.input.txId}#${intent.utxo.input.index}`);
        assert.equal(body.get(1).reduce((sum, output) => sum + BigInt(output.get(1)), 0n), intent.utxo.output.value.coins);
        assert.equal(body.get(1)[0].get(1), 3_000_000);
        const [required] = [...body.get(24).keys()];
        assert.deepEqual([required[0], required[1].toString('hex')], [0, guard]);
        assert.equal(witnesses.size, 0);
        assert.deepEqual(intent.required, [paymentCredential(C, context.address).hash]);
    }
    assert.equal(spent.size, 2);
});

test('intent count, amount and funding fail before anything can be signed', async () => {
    for (const count of [0, 1.5, MAX_INTENTS + 1, NaN]) await assert.rejects(buildIntents(C, context, { count, amount: 2_000_000n }), /Choose 1-16/);
    await assert.rejects(buildIntents(C, context, { count: 1, amount: 0n }), /positive/);
    await assert.rejects(buildIntents(C, context, { count: 6, amount: 2_000_000n }), /has 5 such UTxO\(s\); 6 needed/);
    const withToken = { ...context, utxos: context.utxos.map(utxo => ({ ...utxo, output: { ...utxo.output, value: { ...utxo.output.value, assets: { [`${'0a'.repeat(28)}54`]: 1n } } } })) };
    await assert.rejects(buildIntents(C, withToken, { count: 1, amount: 2_000_000n }), /has 0 such UTxO/);
    await assert.rejects(buildIntents(C, context, { count: 1, amount: 99_500_000n }), /has 0 such UTxO/);
    await assert.rejects(buildIntents(C, { ...context, params: { ...context.params, protocolVersion: { major: 10 } } }, { count: 1, amount: 1n }), /protocol 12/);
    const exact = await buildIntents(C, context, { count: 1, amount: 20_000_000n });
    assert.equal(decode(exact[0].cbor)[0].get(1).length, 1);
});

test('witness sets returned by signSubTxs are verified against each subtransaction id', () => {
    const sets = intents.map(intent => witnessSetOf(C, intent.cbor));
    const signed = verifySignedSubTxs(C, intents, sets);
    assert.deepEqual(signed.map(entry => [entry.id, entry.signatures]), intents.map(intent => [intent.id, 1]));
    assert.deepEqual(signed.map(entry => entry.cbor), intents.map(intent => signSubTx(C, intent.cbor)));
    assert.deepEqual(verifySignedSubTxs(C, intents, sets, 'witnessSet'), signed);
    assert.throws(() => verifySignedSubTxs(C, intents, 'a0'), /must resolve with an array/);
    assert.throws(() => verifySignedSubTxs(C, intents, [sets[0]]), /returned 1 entries for 2/);
    assert.throws(() => verifySignedSubTxs(C, intents, [...sets, sets[0]]), /returned 3 entries for 2/);
    assert.throws(() => verifySignedSubTxs(C, intents, [sets[1], sets[0]]), /Entry 0: a signature does not verify/);
    assert.throws(() => verifySignedSubTxs(C, intents, ['a0', sets[1]]), /Entry 0: the wallet did not sign required key/);
    assert.throws(() => verifySignedSubTxs(C, intents, [sets[0], witnessSetOf(C, intents[1].cbor, fixtureKey(C, '07'))]), /Entry 1: the wallet did not sign required key/);
    assert.throws(() => verifySignedSubTxs(C, intents, [sets[0], signSubTx(C, intents[1].cbor)]), /Entry 1 does not decode as a transaction_witness_set/);
    assert.throws(() => verifySignedSubTxs(C, intents, [`${sets[0]}00`, sets[1]]), /Entry 0 does not decode as a transaction_witness_set: Trailing bytes/);
    assert.throws(() => verifySignedSubTxs(C, intents, [sets[0], 'xyz']), /Entry 1 is not a CBOR hex string/);
});

test('full entries returned by signSubTxs keep the body bytes and id and carry the witnesses', () => {
    const full = intents.map(intent => signSubTx(C, intent.cbor));
    const signed = verifySignedSubTxs(C, intents, full, 'full');
    assert.deepEqual(signed.map(entry => entry.cbor), full);
    assert.throws(() => verifySignedSubTxs(C, intents, intents.map(intent => intent.cbor), 'full'), /did not sign required key/);
    assert.throws(() => verifySignedSubTxs(C, intents, [full[1], full[0]], 'full'), /Entry 0: the wallet changed the subtransaction body/);
    assert.throws(() => verifySignedSubTxs(C, intents, [witnessSetOf(C, intents[0].cbor), full[1]], 'full'), /Entry 0 does not decode as a subtransaction/);
    assert.throws(() => verifySignedSubTxs(C, intents, [`${full[0]}00`, full[1]], 'full'), /Trailing bytes/);
    assert.throws(() => verifySignedSubTxs(C, intents, [`9f${full[0].slice(2)}ff`, full[1]], 'full'), /definite-length array of three/);
});

test('imported subtransactions are parsed, checked for witnesses and wrapped unchanged', async () => {
    const own = paymentCredential(C, context.address).hash;
    const forWallet = await buildIntents(C, context, { count: 2, amount: 3_000_000n });
    const subTxs = [signSubTx(C, forWallet[0].cbor), forWallet[1].cbor];
    const subs = inspectSubTransactions(C, subTxs);
    assert.deepEqual(subs.map(sub => sub.id), forWallet.map(intent => intent.id));
    assert.deepEqual(subs.map(sub => sub.inputs), forWallet.map(intent => [intent.utxo.input]));
    assert.deepEqual(subs.map(sub => sub.topLevelGuards), [[{ tag: 'pubkey_hash', value: own }], [{ tag: 'pubkey_hash', value: own }]]);
    assert.deepEqual(subs.map(sub => sub.signers), [[own], []]);
    subs.forEach((sub, index) => { sub.resolved = [forWallet[index].utxo]; });
    assert.deepEqual(subs.map(sub => missingSubTxWitnesses(C, sub, sub.resolved)), [[], [own]]);
    assert.throws(() => missingSubTxWitnesses(C, subs[0], []), /is not resolved/);
    const wrapped = await buildWrapper(C, context, subs);
    assert.deepEqual([wrapped.ownGuard, wrapped.foreignGuards], [own, []]);
    assert.deepEqual(subTransactionsOf(C, wrapped.cbor), subTxs);
    const body = C.inspectTx(wrapped.cbor).body;
    assert.deepEqual(body.guards, [{ tag: 'pubkey_hash', value: own }]);
    const spentBySubs = new Set(forWallet.map(intent => `${intent.utxo.input.txId}#${intent.utxo.input.index}`));
    assert.ok(body.inputs.length > 0);
    assert.ok(body.inputs.every(input => !spentBySubs.has(`${input.transaction_id}#${input.index}`)));
});

test('a wrapper meets key guards of other parties and refuses what it cannot carry', async () => {
    const subs = inspectSubTransactions(C, intents.map(intent => signSubTx(C, intent.cbor)));
    subs.forEach((sub, index) => { sub.resolved = [intents[index].utxo]; });
    const wrapped = await buildWrapper(C, context, subs);
    assert.deepEqual(wrapped.foreignGuards, [paymentCredential(C, batcher).hash]);
    assert.equal(C.inspectTx(wrapped.cbor).body.guards.length, 2);
    assert.throws(() => inspectSubTransactions(C, []), /Paste at least one/);
    assert.throws(() => inspectSubTransactions(C, [intents[0].cbor, intents[0].cbor]), /Lines 1 and 2 are the same subtransaction/);
    const [rival] = await buildIntents(C, { ...context, utxos: [intents[0].utxo] }, { count: 1, amount: 4_000_000n, batcher });
    assert.throws(() => inspectSubTransactions(C, [intents[0].cbor, rival.cbor]), /Lines 1 and 2 spend the same UTxO/);
    assert.throws(() => inspectSubTransactions(C, [intents[0].cbor, 'a0']), /Line 2 is not a subtransaction/);
    assert.throws(() => inspectSubTransactions(C, [`${intents[0].cbor}00`]), /Line 1 is not a subtransaction: Trailing bytes/);
    assert.throws(() => inspectSubTransactions(C, [buildUnbalancedPayment(C, { address: context.address, amount: 1n })]), /Line 1 is not a subtransaction/);
    const forged = C.applySubTransactionWitnesses(intents[0].cbor, [{ vkey: fixtureKey(C).getPublicKey().toHex(), signature: '00'.repeat(64) }]);
    assert.throws(() => inspectSubTransactions(C, [forged]), /Line 1: a signature does not verify/);
    const scriptGuarded = [{ ...subs[0], topLevelGuards: [{ tag: 'script_hash', value: '09'.repeat(28) }] }];
    await assert.rejects(buildWrapper(C, context, scriptGuarded), /requires script guard/);
    await assert.rejects(buildWrapper(C, { ...context, utxos: intents.map(intent => intent.utxo) }, subs), /No spendable UTxOs/);
});

test('getBalances results decode into UTxOs and per-account values, and departures are listed', () => {
    const account = hash => `581de0${hash}`;
    const own = paymentCredential(C, context.address).hash;
    const balance = { utxos: context.utxos.slice(0, 2).map(utxo => utxoCbor(C, utxo)),
        accounts: `a2${account(own)}1a004c4b40${account('0b'.repeat(28))}821a000f4240a1581c${'0c'.repeat(28)}a1415407` };
    const decoded = decodeBalances(C, balance);
    assert.deepEqual(decoded.utxos.map(utxo => [utxo.input, utxo.output.address, utxo.output.value.coins]),
        context.utxos.slice(0, 2).map(utxo => [utxo.input, utxo.output.address, utxo.output.value.coins]));
    assert.deepEqual(decoded.accounts[0], { rewardAddress: context.rewardAddress, value: { coins: 5_000_000n } });
    assert.deepEqual(decoded.accounts[1].value, { coins: 1_000_000n, assets: { [`${'0c'.repeat(28)}54`]: 7n } });
    assert.equal(decoded.total, 100_000_000n + 20_000_000n + 6_000_000n);
    assert.deepEqual(decoded.problems, []);
    assert.deepEqual(decodeBalances(C, { utxos: [], accounts: 'a0' }), { utxos: [], accounts: [], problems: [], total: 0n });
    assert.equal(decodeBalances(C, { utxos: [], accounts: `bf${account(own)}05ff` }).accounts.length, 1);
    assert.match(decodeBalances(C, { utxos: [], accounts: `a1${account(own)}00` }).problems[0], /zero balance/);
    assert.match(decodeBalances(C, { utxos: [], accounts: `a2${account(own)}01${account(own)}02` }).problems[0], /twice/);
    assert.throws(() => decodeBalances(C, null), /must resolve with an object/);
    assert.throws(() => decodeBalances(C, { utxos: 'a0', accounts: 'a0' }), /`utxos` must be an array/);
    assert.throws(() => decodeBalances(C, { utxos: [], accounts: {} }), /`accounts` must be one CBOR hex string/);
    assert.throws(() => decodeBalances(C, { utxos: ['zz'], accounts: 'a0' }), /utxos\[0\] does not decode/);
    assert.throws(() => decodeBalances(C, { utxos: [], accounts: '80' }), /does not decode as a map/);
    assert.throws(() => decodeBalances(C, { utxos: [], accounts: 'a000' }), /Trailing bytes/);
});

test('a BalanceSignResult for a payment is checked for shape, id, signatures and the preserved output', async () => {
    const output = { address: batcher, amount: 2_000_000n };
    const builder = createBuilder(C, context);
    let balanced;
    try { balanced = await builder.sendLovelace(output).build(); } finally { builder.dispose(); }
    const cbor = signTx(C, balanced);
    const result = { cbor, txHash: transactionId(C, cbor), complete: true, submitted: true };
    const checked = checkBalanceResult(C, { output }, result);
    assert.deepEqual(checked.failures, []);
    assert.deepEqual([checked.id, checked.signatures], [result.txHash, 1]);
    assert.match(checked.meaning, /COMPLETE and SUBMITTED/);
    assert.match(checkBalanceResult(C, { output }, { ...result, submitted: false }).meaning, /chose not to submit/);
    assert.match(checkBalanceResult(C, { output }, { ...result, submitted: false, submitError: { code: 2, info: 'node down' } }).meaning, /attempted and failed/);
    const unsigned = { cbor: balanced, txHash: transactionId(C, balanced), complete: false, submitted: false };
    assert.deepEqual(checkBalanceResult(C, { output }, unsigned).failures, []);
    assert.match(checkBalanceResult(C, { output }, unsigned).meaning, /INCOMPLETE and NOT SUBMITTED/);
    const fails = (changed, request = { output }) => checkBalanceResult(C, request, { ...result, ...changed }).failures.join('\n');
    assert.match(fails({ txHash: '00'.repeat(32) }), /is not the id of the returned transaction/);
    assert.match(fails({ txHash: undefined }), /not a 32-byte hex hash/);
    assert.match(fails({ complete: 'yes' }), /`complete` is not a boolean/);
    assert.match(fails({ complete: false }), /not a combination the CIP allows/);
    assert.match(fails({ submitError: { code: 1 } }), /not a combination the CIP allows/);
    assert.match(fails({ cbor: balanced, txHash: transactionId(C, balanced) }), /complete but it carries no key witness/);
    assert.match(fails({}, { output: { ...output, amount: 2_000_001n } }), /payment output is not in the returned transaction/);
    const forged = C.applyVkeyWitnessSet(balanced, [{ vkey: fixtureKey(C).getPublicKey().toHex(), signature: '00'.repeat(64) }]);
    assert.match(fails({ cbor: forged }), /does not verify against the returned transaction/);
    assert.throws(() => checkBalanceResult(C, { output }, 'ok'), /must resolve with an object/);
    assert.throws(() => checkBalanceResult(C, { output }, { ...result, cbor: 5 }), /`cbor` must be a CBOR hex string/);
    assert.throws(() => checkBalanceResult(C, { output }, { ...result, cbor: 'a0' }), /does not decode as a transaction/);
});

test('a BalanceSignResult for subtransactions must carry them unchanged and meet their guards', async () => {
    const forWallet = await buildIntents(C, context, { count: 2, amount: 3_000_000n });
    const subTxs = forWallet.map(intent => signSubTx(C, intent.cbor));
    const subs = inspectSubTransactions(C, subTxs);
    subs.forEach((sub, index) => { sub.resolved = [forWallet[index].utxo]; });
    const cbor = signTx(C, (await buildWrapper(C, context, subs)).cbor);
    const result = { cbor, txHash: transactionId(C, cbor), complete: true, submitted: false };
    assert.deepEqual(checkBalanceResult(C, { subTxs }, result).failures, []);
    assert.match(checkBalanceResult(C, { subTxs: [subTxs[1], subTxs[0]] }, result).failures.join(), /not the supplied/);
    assert.match(checkBalanceResult(C, { subTxs: [subTxs[0]] }, result).failures.join(), /not the supplied/);
    const foreign = intents.map(intent => signSubTx(C, intent.cbor));
    const unguarded = signTx(C, C.applyVkeyWitnessSet(buildUnbalancedWrapper(C, foreign), []));
    assert.match(checkBalanceResult(C, { subTxs: foreign }, { ...result, cbor: unguarded, txHash: transactionId(C, unguarded) }).failures.join(),
        /Top-level guard .* is missing from the top-level guards/);
});

test('the malformed presets are what their labels say and all expect InvalidRequest', () => {
    const presets = malformedPresets(C, context.address);
    const by = id => presets.find(preset => preset.id === id);
    assert.deepEqual(presets.map(preset => preset.id), ['empty', 'odd-hex', 'non-hex', 'trailing', 'indefinite', 'format', 'too-many']);
    assert.ok(presets.every(preset => preset.method === 'signSubTxs' && preset.expected.code === -1 && preset.basis && preset.label));
    const sample = sampleSubTransaction(C, context.address, 2_000_000n);
    assert.equal(C.getSubTransactionId(sample), C.getSubTransactionId(by('format').args[0][0]));
    assert.deepEqual(splitSubTransaction(C, sample).witnessSet, 'a0');
    assert.deepEqual(decode(sample)[0].get(1)[0].get(1), 2_000_000);
    assert.deepEqual(by('empty').args, [[]]);
    assert.equal(by('odd-hex').args[0][0].length % 2, 1);
    assert.equal(isHex(by('non-hex').args[0][0]), false);
    assert.equal(by('non-hex').args[0][0].length % 2, 0);
    assert.equal(by('trailing').args[0][0], `${sample}00`);
    assert.throws(() => splitSubTransaction(C, by('trailing').args[0][0]), /Trailing bytes/);
    assert.equal(by('indefinite').args[0][0], `9f${sample.slice(2)}ff`);
    assert.deepEqual(decode(by('indefinite').args[0][0]), decode(sample));
    assert.deepEqual(by('format').args, [[sample], 'cbor']);
    assert.equal(by('too-many').args[0].length, 17);
    assert.equal(new Set(by('too-many').args[0].map(cbor => C.getSubTransactionId(cbor))).size, 17);
    assert.equal(by('too-many').args.length, 1);
    assert.equal(meetsExpectation(by('empty').expected, { error: { code: -1, info: 'empty' } }), true);
    assert.equal(meetsExpectation(by('empty').expected, { error: Object.assign(new Error('bad'), { code: -1 }) }), true);
    assert.equal(meetsExpectation(by('empty').expected, { error: { code: 2, info: 'declined' } }), false);
    assert.equal(meetsExpectation(by('empty').expected, { error: 'InvalidRequest' }), false);
    assert.equal(meetsExpectation(by('empty').expected, { result: [] }), false);
});

test('wallet errors are shown verbatim and named for the method that returned them', () => {
    assert.deepEqual(errorDetails({ code: 7, info: 'sub 0 lacks a witness', extra: [1] }), { code: 7, info: 'sub 0 lacks a witness', extra: [1] });
    assert.deepEqual(errorDetails(Object.assign(new Error('declined'), { code: 2 })), { code: 2, message: 'declined' });
    assert.deepEqual(errorDetails('nope'), { value: 'nope' });
    assert.deepEqual(errorDetails(null), { value: null });
    for (const [code, name] of [[1, 'ProofGeneration'], [2, 'UserDeclined'], [3, 'BodyLocked'], [4, 'CannotBalance'], [5, 'EvaluationFailed'],
        [6, 'UnsatisfiedGuard'], [7, 'SubTxWitnessesMissing']]) {
        for (const method of ['signTx', 'signSubTxs', 'balanceAndSignTx']) assert.equal(errorName({ code }, method), `TxSignError ${name}`);
    }
    for (const [code, name] of [[-1, 'InvalidRequest'], [-2, 'InternalError'], [-3, 'Refused'], [-4, 'AccountChange']]) {
        assert.equal(errorName({ code }, 'getBalances'), `APIError ${name}`);
    }
    assert.equal(errorName({ code: 2 }, 'getBalances'), undefined);
    assert.equal(errorName({ code: 8 }, 'signTx'), undefined);
    assert.equal(errorName({ maxSize: 3 }, 'getBalances'), 'PaginateError');
    assert.deepEqual([errorName({ code: 1 }, 'submit'), errorName({ code: 2 }, 'submit')], ['TxSendError Refused', 'TxSendError Failure']);
    assert.match(formatError({ code: -1, info: 'odd-length hex' }, 'signSubTxs'), /"info": "odd-length hex"[\s\S]*code -1: APIError InvalidRequest/);
    assert.match(formatError({ maxSize: 3 }, 'getBalances'), /"maxSize": 3[\s\S]*no numeric code: PaginateError/);
    assert.match(formatError({ code: 99 }, 'signTx'), /code 99: not an error this method is specified to return/);
});

test('the published browser bundle has every API the CIP-209 builders and checks rely on', async () => {
    const { createContext, runInContext } = await import('node:vm');
    const { webcrypto } = await import('node:crypto');
    const sandbox = createContext({ console, crypto: webcrypto, TextEncoder, TextDecoder, URL, Blob, atob, btoa, setTimeout, clearTimeout, fetch });
    runInContext(readFileSync(new URL('../node_modules/@biglup/cometa/dist/iife/index.global.js', import.meta.url), 'utf8'), sandbox);
    const B = sandbox.Cometa;
    await B.ready();
    const built = await buildIntents(B, walletContext(B), { count: 2, amount: 3_000_000n });
    assert.deepEqual(built.map(intent => intent.cbor), (await buildIntents(C, context, { count: 2, amount: 3_000_000n })).map(intent => intent.cbor));
    const signed = verifySignedSubTxs(B, built, built.map(intent => witnessSetOf(B, intent.cbor)));
    const subs = inspectSubTransactions(B, signed.map(entry => entry.cbor));
    subs.forEach((sub, index) => { sub.resolved = [built[index].utxo]; });
    const cbor = signTx(B, (await buildWrapper(B, walletContext(B), subs)).cbor);
    const request = { subTxs: signed.map(entry => entry.cbor) };
    assert.deepEqual(checkBalanceResult(B, request, { cbor, txHash: transactionId(B, cbor), complete: true, submitted: true }).failures, []);
    assert.equal(buildUnbalancedPayment(B, { address: context.address, amount: 5n }), buildUnbalancedPayment(C, { address: context.address, amount: 5n }));
    assert.equal(decodeBalances(B, { utxos: [utxoCbor(B, context.utxos[0])], accounts: 'a0' }).total, 100_000_000n);
    assert.equal(malformedPresets(B, context.address).length, 7);
});
