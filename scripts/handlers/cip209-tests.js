/** CIP-209 checks: getBalances, signSubTxs, the two-wallet wrap flow, balanceAndSignTx and raw calls. */
import { state } from '../app-state.js';
import * as ui from '../ui.js?v=20261126-1';
import { parseAda, requireDijkstra, utxoId, verifyWalletWitnesses } from '../dijkstra.js?v=20261126-1';
import { walletContext } from './dijkstra-tests.js?v=20261126-1';
import { CIP209_METHODS, RAW_METHODS, buildIntents, buildUnbalancedPayment, buildUnbalancedWrapper, buildWrapper, checkBalanceResult,
    decodeBalances, encodeBareSubTransactions, errorDetails, formatError, inspectSubTransactions, malformedPresets, meetsExpectation,
    missingSubTxWitnesses, stringify, verifySignedSubTxs } from '../cip209.js?v=20261126-1';

const element = id => document.getElementById(`cip209-${id}`);
const field = (card, name) => element(`${card}-${name}`);
const outputs = { 'get-balances': [], 'sign-subtxs': ['cbor', 'signed'], wrap: ['cbor'], 'balance-sign': ['cbor', 'returned'], raw: [] };
const idle = {
    'get-balances': 'Not called yet.',
    'sign-subtxs': 'Build subtransactions for the connected wallet.',
    wrap: 'Paste signed subtransactions, then build the top-level transaction.',
    'balance-sign': 'Build an unbalanced request for the connected wallet.',
    raw: 'Not called yet.',
};
const presetIds = ['empty', 'odd-hex', 'non-hex', 'trailing', 'indefinite', 'format', 'too-many'];
const pending = new Map();
const revisions = new Map();
let preset = null;
let busy = false;
let initialized = false;

const namespace = () => state.cip30Api?.cip209 ?? state.cip30Api?.experimental?.cip209;
const available = () => Boolean(state.wallet && state.extensions?.cip209 && namespace());
const mode = () => (element('network-mode').checked ? 'network' : 'compatibility');
const callName = method => (method === 'signTx' ? 'signTx' : `cip209.${method}`);
const show = (card, message, status = '') => {
    field(card, 'result').textContent = message;
    field(card, 'result').className = `test-result large${status ? ` ${status}` : ''}`;
};

/** What the wallet threw, kept verbatim so a card can compare its code with what the CIP requires. */
class WalletRejection extends Error {
    constructor(method, raw) {
        super(`${callName(method)} rejected with:\n${formatError(raw, method)}`);
        this.raw = raw;
    }
}

const call = async (method, args) => {
    const target = method === 'signTx' ? state.cip30Api : namespace();
    if (typeof target?.[method] !== 'function') throw new Error(`The wallet has no ${callName(method)} method.`);
    ui.log(`CIP-209: calling ${callName(method)} with ${args.length} argument(s)`, 'info');
    try {
        const result = await target[method](...args);
        ui.log(`CIP-209: ${callName(method)} resolved`, 'success');
        return result;
    } catch (error) {
        throw new WalletRejection(method, error);
    }
};

const sync = () => {
    const enabled = available() && !busy;
    document.querySelectorAll('#cip209-section button').forEach(button => { button.disabled = !enabled; });
    if (!enabled) return;
    const allowed = element('allow-wallet-submit').checked;
    const wrap = pending.get('wrap');
    field('sign-subtxs', 'sign').disabled = !pending.has('sign-subtxs');
    field('sign-subtxs', 'use').disabled = !pending.get('sign-subtxs')?.signed;
    field('wrap', 'sign').disabled = !wrap || wrap.signed;
    field('wrap', 'submit').disabled = !wrap?.signed || wrap.mode !== 'network';
    field('balance-sign', 'call').disabled = !pending.has('balance-sign') || !allowed;
    field('raw', 'call').disabled = element('raw-method').value === 'balanceAndSignTx' && !allowed;
};

const reset = card => {
    revisions.set(card, (revisions.get(card) || 0) + 1);
    pending.delete(card);
    for (const name of outputs[card]) field(card, name).value = '';
    show(card, idle[card]);
    if (!busy) sync();
};

const clearPreset = () => {
    preset = null;
    element('raw-expected').textContent = '';
};

/** Re-read the connected wallet: discard pending work and enable the section only when CIP-209 is offered. */
export const refreshCip209 = () => {
    if (!initialized) return;
    Object.keys(outputs).forEach(reset);
    clearPreset();
    const status = element('status');
    status.classList.toggle('connected', available());
    if (!state.wallet) {
        status.textContent = 'Connect a wallet to check for CIP-209.';
    } else if (!available()) {
        status.textContent = 'The connected wallet does not offer CIP-209: it did not list { cip: 209 } in supportedExtensions, or the enabled API has no cip209 namespace. These tests are disabled.';
    } else {
        const missing = CIP209_METHODS.filter(method => typeof namespace()[method] !== 'function');
        status.textContent = `The connected wallet offers CIP-209 (${state.cip30Api.cip209 ? 'api.cip209' : 'api.experimental.cip209'}).`
            + (missing.length ? ` Missing methods: ${missing.join(', ')}.` : '');
    }
    sync();
};

const run = async (card, action) => {
    if (busy) return;
    busy = true;
    sync();
    try {
        if (!available()) throw new Error(state.wallet ? 'The connected wallet does not offer CIP-209.' : 'Connect a wallet first.');
        await Cometa.ready();
        await action();
    } catch (error) {
        show(card, error.message, 'error');
        ui.log(`CIP-209: ${error.message}`, 'error');
    } finally {
        busy = false;
        sync();
    }
};

const paymentAddress = (value, name) => {
    let parsed;
    try { parsed = Cometa.Address.fromString(value); } catch { parsed = null; }
    if (!parsed || parsed.asReward() || parsed.getNetworkId() !== state.networkId) {
        throw new Error(`Use a payment address on the connected network for the ${name}.`);
    }
    return parsed.toString();
};

const requireSubmitOptIn = () => {
    if (!element('allow-wallet-submit').checked) {
        throw new Error('Check "Allow balanceAndSignTx" first: the wallet may submit the transaction to the network.');
    }
};

const describeValue = value => `${value.coins} lovelace`
    + Object.entries(value.assets || {}).map(([asset, quantity]) => `\n      ${asset}: ${quantity}`).join('');

const getBalances = async () => {
    const [page, limit] = ['page', 'limit'].map(name => field('get-balances', name).value.trim());
    if ((page === '') !== (limit === '')) throw new Error('Enter both page and limit, or leave both blank.');
    if (page !== '' && ![page, limit].every(value => /^\d+$/.test(value))) throw new Error('Page and limit are non-negative integers.');
    const args = page === '' ? [] : [{ page: Number(page), limit: Number(limit) }];
    const wallet = state.wallet;
    show('get-balances', 'Waiting for the wallet...', 'pending');
    const balance = await call('getBalances', args);
    if (wallet !== state.wallet) return;
    let decoded;
    try { decoded = decodeBalances(Cometa, balance); }
    catch (error) { throw new Error(`${error.message}\n\nRaw result:\n${stringify(balance)}`); }
    show('get-balances', `getBalances(${args.map(arg => JSON.stringify(arg)).join('')}) resolved.\n`
        + `UTxOs (${decoded.utxos.length}${args.length ? `, page ${page}, limit ${limit}` : ''}):\n`
        + decoded.utxos.map(utxo => `  ${utxoId(utxo)}\n    ${utxo.output.address}\n    ${describeValue(utxo.output.value)}\n`).join('')
        + `Reward accounts with a balance (${decoded.accounts.length}):\n`
        + decoded.accounts.map(account => `  ${account.rewardAddress}\n    ${describeValue(account.value)}\n`).join('')
        + `Total across the listed UTxOs and accounts: ${decoded.total} lovelace\n`
        + (decoded.problems.length ? `PROBLEMS:\n${decoded.problems.map(problem => `  ${problem}\n`).join('')}` : '')
        + `\nRaw result:\n${stringify(balance)}`, decoded.problems.length ? 'error' : 'success');
};

const buildSubTxs = async () => {
    reset('sign-subtxs');
    const revision = revisions.get('sign-subtxs');
    const wallet = state.wallet;
    const ctx = await walletContext(mode());
    const recipient = paymentAddress(field('sign-subtxs', 'recipient').value.trim() || ctx.address, 'recipient');
    const batcher = paymentAddress(field('sign-subtxs', 'batcher').value.trim() || ctx.address, 'batcher');
    const intents = await buildIntents(Cometa, ctx, { count: Number(field('sign-subtxs', 'count').value),
        amount: parseAda(field('sign-subtxs', 'amount').value.trim()), recipient, batcher });
    if (revision !== revisions.get('sign-subtxs') || wallet !== state.wallet) return;
    pending.set('sign-subtxs', { intents, wallet });
    field('sign-subtxs', 'cbor').value = intents.map(intent => intent.cbor).join('\n');
    show('sign-subtxs', `Built ${intents.length} subtransaction(s) with ${ctx.mode === 'network' ? 'the endpoint\'s protocol 12 parameters' : `protocol 12 candidate parameters (endpoint protocol ${ctx.networkProtocol})`}. Not yet signed.\n`
        + `Batcher whose top-level guard each requires: ${batcher}\n\n`
        + intents.map(intent => `${intent.id}\n  spends ${utxoId(intent.utxo)} (${intent.utxo.output.value.coins} lovelace), pays ${intent.amount} lovelace to ${recipient}\n`).join(''));
};

const signSubTxs = async () => {
    const item = pending.get('sign-subtxs');
    if (!item || item.wallet !== state.wallet) throw new Error('Build the subtransactions first.');
    const format = field('sign-subtxs', 'format').value;
    const subTxs = item.intents.map(intent => intent.cbor);
    show('sign-subtxs', 'Waiting for the wallet...', 'pending');
    const entries = await call('signSubTxs', format ? [subTxs, format] : [subTxs]);
    if (pending.get('sign-subtxs') !== item || item.wallet !== state.wallet) return;
    let signed;
    try { signed = verifySignedSubTxs(Cometa, item.intents, entries, format || 'witnessSet'); }
    catch (error) { throw new Error(`${error.message}\n\nRaw result:\n${stringify(entries)}`); }
    item.signed = signed;
    field('sign-subtxs', 'signed').value = signed.map(entry => entry.cbor).join('\n');
    show('sign-subtxs', `signSubTxs passed with format ${format ? `"${format}"` : 'omitted'}: one entry per subtransaction, in order.\n`
        + (format === 'full' ? 'Each entry is the subtransaction with the same body bytes and id, plus the witnesses.\n'
            : 'Each entry decodes as a witness set whose signatures verify against the subtransaction id.\n')
        + signed.map(entry => `${entry.id}: ${entry.signatures} key signature(s) verified\n`).join('')
        + `Copy the signed CBOR above to the batcher's session.\n\nRaw result:\n${stringify(entries)}`, 'success');
};

const importedSubTxs = () => field('wrap', 'subtxs').value.split(/\s+/).filter(Boolean);

const resolveInputs = async (provider, known, subs) => {
    const find = (list, input) => list.find(utxo => utxo.input.txId === input.txId && utxo.input.index === input.index);
    const wanted = subs.flatMap(sub => [...sub.inputs, ...sub.referenceInputs]);
    const unknown = wanted.filter(input => !find(known, input));
    let fetched = [];
    if (unknown.length) {
        try { fetched = await provider.resolveUnspentOutputs(unknown); } catch { fetched = []; }
    }
    for (const sub of subs) {
        sub.resolved = [...sub.inputs, ...sub.referenceInputs].map(input => {
            const utxo = find(known, input) ?? find(fetched, input);
            if (!utxo) {
                throw new Error(`Input ${utxoId({ input })} of subtransaction ${sub.id} is not an unspent output on this network. `
                    + 'Every input of every level must exist on chain before the batch, so a subtransaction cannot spend an output of another one.');
            }
            return utxo;
        });
    }
};

const buildWrap = async () => {
    reset('wrap');
    const revision = revisions.get('wrap');
    const wallet = state.wallet;
    const provider = state.provider;
    const subs = inspectSubTransactions(Cometa, importedSubTxs());
    const ctx = await walletContext(mode());
    await resolveInputs(provider, ctx.utxos, subs);
    for (const sub of subs) sub.missing = missingSubTxWitnesses(Cometa, sub, sub.resolved);
    const result = await buildWrapper(Cometa, ctx, subs);
    if (revision !== revisions.get('wrap') || wallet !== state.wallet) return;
    const incomplete = subs.filter(sub => sub.missing.length);
    pending.set('wrap', { cbor: result.cbor, signed: false, wallet, provider, mode: ctx.mode, utxos: ctx.utxos, incomplete });
    field('wrap', 'cbor').value = result.cbor;
    show('wrap', `${ctx.mode === 'network' ? 'Built with the endpoint\'s protocol 12 parameters.' : `SIGNING TEST ONLY: endpoint protocol ${ctx.networkProtocol}, candidate protocol 12 parameters. Submission disabled.`} Not yet signed.\n`
        + `Top-level guards: ${result.ownGuard} (this wallet's change address)`
        + result.foreignGuards.map(guard => `, ${guard} (required by an imported subtransaction; its owner must sign too)`).join('') + '\n'
        + `Imported subtransactions:\n${subs.map((sub, index) => `  ${index + 1}. ${sub.id}: ${sub.inputs.length} input(s), ${sub.signers.length} valid signature(s), `
            + (sub.missing.length ? `MISSING witness for key(s) ${sub.missing.join(', ')}` : 'fully witnessed')).join('\n')}\n`
        + (incomplete.length ? 'Expected from signTx: rejection with TxSignError 7 SubTxWitnessesMissing, naming each missing witness.\n'
            : 'Expected from signTx: the top-level witness set.\n')
        + `\nTransaction summary:\n${stringify(Cometa.inspectTx(result.cbor))}`);
};

const signWrap = async () => {
    const tx = pending.get('wrap');
    if (!tx || tx.wallet !== state.wallet || tx.signed) throw new Error('Build the top-level transaction first.');
    show('wrap', 'Waiting for the wallet...', 'pending');
    let witnessSet;
    try {
        witnessSet = await call('signTx', [tx.cbor, false]);
    } catch (error) {
        if (!(error instanceof WalletRejection) || !tx.incomplete.length || pending.get('wrap') !== tx) throw error;
        const required = errorDetails(error.raw).code === 7;
        ui.log(`CIP-209: signTx rejected an incompletely witnessed batch with code ${errorDetails(error.raw).code}`, required ? 'success' : 'error');
        show('wrap', `${error.message}\n\n${required ? 'As required: an imported subtransaction lacks witnesses and signTx refused with TxSignError 7.'
            : 'NOT as required: an imported subtransaction lacks witnesses, so signTx must reject with TxSignError 7 SubTxWitnessesMissing.'}`, required ? 'success' : 'error');
        return;
    }
    if (pending.get('wrap') !== tx || tx.wallet !== state.wallet) return;
    if (tx.incomplete.length) {
        throw new Error('NOT as required: signTx returned a witness set although an imported subtransaction lacks witnesses. '
            + `It must reject with TxSignError 7 SubTxWitnessesMissing.\n\nRaw result:\n${stringify(witnessSet)}`);
    }
    let witnesses;
    try { witnesses = Cometa.readVkeyWitnessSetFromWitnessSetCbor(witnessSet); }
    catch (error) { throw new Error(`signTx did not return a witness set: ${error.message}\n\nRaw result:\n${stringify(witnessSet)}`); }
    const count = verifyWalletWitnesses(Cometa, tx.cbor, witnesses, tx.utxos);
    tx.cbor = Cometa.applyVkeyWitnessSet(tx.cbor, witnesses);
    tx.signed = true;
    field('wrap', 'cbor').value = tx.cbor;
    show('wrap', `Wallet signing passed: ${count} key signature(s) verified against the top-level transaction.\n`
        + (tx.mode === 'network' ? 'Review the CBOR before submitting.' : 'Compatibility mode: submission remains disabled.'), 'success');
};

const submitWrap = async () => {
    const tx = pending.get('wrap');
    if (!tx?.signed || tx.mode !== 'network' || tx.wallet !== state.wallet) throw new Error('Sign the built transaction first.');
    requireDijkstra(await tx.provider.getParameters());
    if (pending.get('wrap') !== tx || tx.wallet !== state.wallet) return;
    const id = await tx.wallet.submitTransaction(tx.cbor);
    if (pending.get('wrap') !== tx) return;
    reset('wrap');
    show('wrap', `Submitted: ${id}\nSubmission is not confirmation; check the target network's explorer.`, 'success');
};

const buildBalanceRequest = async () => {
    reset('balance-sign');
    const revision = revisions.get('balance-sign');
    const wallet = state.wallet;
    const form = field('balance-sign', 'form').value;
    let request;
    if (form === 'payment') {
        const address = paymentAddress(field('balance-sign', 'recipient').value.trim() || (await wallet.getChangeAddress()).toString(), 'recipient');
        const amount = parseAda(field('balance-sign', 'amount').value.trim());
        request = { cbor: buildUnbalancedPayment(Cometa, { address, amount }), output: { address, amount } };
    } else {
        const subTxs = inspectSubTransactions(Cometa, importedSubTxs()).map(sub => sub.cbor);
        request = { cbor: form === 'wrapper' ? buildUnbalancedWrapper(Cometa, subTxs) : encodeBareSubTransactions(Cometa, subTxs), subTxs };
    }
    if (revision !== revisions.get('balance-sign') || wallet !== state.wallet) return;
    pending.set('balance-sign', { ...request, wallet });
    field('balance-sign', 'cbor').value = request.cbor;
    show('balance-sign', 'Unbalanced request built. Nothing has been sent to the wallet yet.\n'
        + (form === 'bare' ? `Bare subtransaction form carrying ${request.subTxs.length} subtransaction(s).`
            : `No inputs, fee 0, no change; the wallet must add them.\n\nRequest summary:\n${stringify(Cometa.inspectTx(request.cbor))}`));
};

const balanceAndSign = async () => {
    const request = pending.get('balance-sign');
    if (!request || request.wallet !== state.wallet) throw new Error('Build the unbalanced request first.');
    requireSubmitOptIn();
    show('balance-sign', 'Waiting for the wallet. It may submit the transaction...', 'pending');
    const result = await call('balanceAndSignTx', [request.cbor]);
    if (pending.get('balance-sign') !== request || request.wallet !== state.wallet) return;
    pending.delete('balance-sign');
    let checked;
    try { checked = checkBalanceResult(Cometa, request, result); }
    catch (error) { throw new Error(`${error.message}\n\nReturned object:\n${stringify(result)}`); }
    field('balance-sign', 'returned').value = result.cbor;
    if (result.submitted === true) ui.log(`CIP-209: the wallet reports it SUBMITTED transaction ${result.txHash}`, 'warning');
    show('balance-sign', `Wallet reports: complete = ${result.complete}, submitted = ${result.submitted}\n${checked.meaning}\n`
        + (result.submitError === undefined ? '' : `submitError:\n${formatError(result.submitError, 'submit')}\n`)
        + `Returned transaction id: ${checked.id}\n`
        + `Key signatures verified against it: ${checked.signatures}\n`
        + (checked.failures.length ? `FAILED CHECKS:\n${checked.failures.map(failure => `  ${failure}\n`).join('')}`
            : 'Checks passed: result shape, txHash matches the returned transaction, signatures verify, the request is preserved.\n')
        + `Build a new request before calling again.\n\nReturned object:\n${stringify(result)}\n\nReturned transaction summary:\n${stringify(checked.inspected)}`,
    checked.failures.length ? 'error' : 'success');
};

const applyPreset = async id => {
    const address = (await state.wallet.getChangeAddress()).toString();
    const chosen = malformedPresets(Cometa, address).find(item => item.id === id);
    element('raw-method').value = chosen.method;
    element('raw-args').value = JSON.stringify(chosen.args);
    preset = chosen;
    element('raw-expected').textContent = `Preset "${chosen.label}". Expected: ${chosen.expected.label}. Basis: ${chosen.basis}.`;
    show('raw', 'Preset loaded. Press Call to send it to the wallet.');
};

const rawCall = async () => {
    const method = element('raw-method').value;
    if (!RAW_METHODS.includes(method)) throw new Error('Unknown method.');
    let args;
    try { args = JSON.parse(element('raw-args').value); }
    catch (error) { throw new Error(`The arguments are not valid JSON: ${error.message}`); }
    if (!Array.isArray(args)) throw new Error('The arguments must be a JSON array with one item per parameter.');
    if (method === 'balanceAndSignTx') requireSubmitOptIn();
    const expectation = preset;
    show('raw', 'Waiting for the wallet...', 'pending');
    let outcome;
    try {
        outcome = { result: await call(method, args) };
    } catch (error) {
        if (!(error instanceof WalletRejection)) throw error;
        outcome = { error: error.raw };
    }
    const rejected = 'error' in outcome;
    const met = expectation ? meetsExpectation(expectation.expected, outcome) : !rejected;
    if (rejected) ui.log(`CIP-209: ${callName(method)} rejected: ${JSON.stringify(errorDetails(outcome.error))}`, met ? 'info' : 'error');
    show('raw', (rejected ? `${callName(method)} rejected with:\n${formatError(outcome.error, method)}` : `${callName(method)} resolved with:\n${stringify(outcome.result)}`)
        + (expectation ? `\n\nExpected: ${expectation.expected.label}. ${met ? 'Outcome as expected.' : 'Outcome NOT as expected.'}` : ''), met ? 'success' : 'error');
};

export const setupCip209 = () => {
    if (initialized) return true;
    const required = ['status', 'network-mode', 'allow-wallet-submit',
        ...Object.keys(outputs).flatMap(card => ['card', 'result', ...outputs[card]].map(name => `${card}-${name}`)),
        'get-balances-page', 'get-balances-limit', 'get-balances-call',
        'sign-subtxs-count', 'sign-subtxs-amount', 'sign-subtxs-recipient', 'sign-subtxs-batcher', 'sign-subtxs-format',
        'sign-subtxs-build', 'sign-subtxs-sign', 'sign-subtxs-use',
        'wrap-subtxs', 'wrap-build', 'wrap-sign', 'wrap-submit',
        'balance-sign-form', 'balance-sign-recipient', 'balance-sign-amount', 'balance-sign-build', 'balance-sign-call',
        'raw-method', 'raw-args', 'raw-presets', 'raw-expected', 'raw-call',
    ];
    const presetButton = id => document.querySelector(`#cip209-raw-presets [data-preset="${id}"]`);
    if (required.some(id => !element(id)) || presetIds.some(id => !presetButton(id))) {
        document.querySelectorAll('#cip209-section button').forEach(button => { button.disabled = true; });
        ui.log('CIP-209 page and scripts are out of date. Hard-refresh this page to load the matching version. Other wallet tests are still available.', 'error');
        return false;
    }
    for (const [card, name, handler] of [
        ['get-balances', 'call', getBalances],
        ['sign-subtxs', 'build', buildSubTxs], ['sign-subtxs', 'sign', signSubTxs],
        ['wrap', 'build', buildWrap], ['wrap', 'sign', signWrap], ['wrap', 'submit', submitWrap],
        ['balance-sign', 'build', buildBalanceRequest], ['balance-sign', 'call', balanceAndSign],
        ['raw', 'call', rawCall],
    ]) {
        field(card, name).addEventListener('click', () => run(card, handler));
    }
    for (const id of presetIds) presetButton(id).addEventListener('click', () => run('raw', () => applyPreset(id)));
    field('sign-subtxs', 'use').addEventListener('click', () => {
        const signed = pending.get('sign-subtxs')?.signed;
        if (!signed) return;
        field('wrap', 'subtxs').value = signed.map(entry => entry.cbor).join('\n');
        reset('wrap');
        reset('balance-sign');
    });
    for (const name of ['count', 'amount', 'recipient', 'batcher']) {
        field('sign-subtxs', name).addEventListener('input', () => reset('sign-subtxs'));
    }
    field('wrap', 'subtxs').addEventListener('input', () => { reset('wrap'); reset('balance-sign'); });
    for (const name of ['form', 'recipient', 'amount']) {
        field('balance-sign', name).addEventListener('input', () => reset('balance-sign'));
    }
    element('network-mode').addEventListener('input', () => { reset('sign-subtxs'); reset('wrap'); });
    element('allow-wallet-submit').addEventListener('input', () => { if (!busy) sync(); });
    element('raw-method').addEventListener('input', () => { clearPreset(); if (!busy) sync(); });
    element('raw-args').addEventListener('input', clearPreset);
    initialized = true;
    refreshCip209();
    return true;
};
