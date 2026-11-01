/** Wallet compatibility checks and explicit Dijkstra build/sign/submit steps. */
import { state } from '../app-state.js';
import * as ui from '../ui.js?v=20261101-4';
import { buildBatch, buildFeature, requireDijkstra, parseAda, buildParameters, verifyWalletWitnesses } from '../dijkstra.js?v=20261101-4';

const element = id => document.getElementById(`dijkstra-${id}`);
const features = ['deposit', 'transfer', 'balances', 'key-guard', 'native-guard', 'plutus-guard', 'deferred-mint', 'batch'];
const pending = new Map();
const revisions = new Map();
let busy = false;
let initialized = false;
const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const field = (feature, name) => element(`${feature}-${name}`);
const show = (feature, message) => { field(feature, 'result').textContent = message; };

const resetTest = feature => {
    revisions.set(feature, (revisions.get(feature) || 0) + 1);
    pending.delete(feature);
    field(feature, 'sign').disabled = true;
    field(feature, 'submit').disabled = true;
    field(feature, 'cbor').value = '';
    show(feature, 'Build a new transaction for the connected wallet.');
};

export const resetDijkstra = () => {
    if (initialized) features.forEach(resetTest);
};

const slotConfig = () => {
    const magic = state.provider.getNetworkMagic();
    if (magic === Cometa.NetworkMagic.Mainnet) return Cometa.CARDANO_MAINNET_SLOT_CONFIG;
    if (magic === Cometa.NetworkMagic.Preprod) return Cometa.CARDANO_PREPROD_SLOT_CONFIG;
    if (magic === Cometa.NetworkMagic.Preview) return Cometa.CARDANO_PREVIEW_SLOT_CONFIG;
    const values = ['zero-time', 'zero-slot', 'slot-length'].map(id => element(id).value.trim());
    if (values.some(value => !/^\d+$/.test(value)) || BigInt(values[2]) === 0n) {
        throw new Error('Set the custom network’s slot timing (Unix milliseconds, reference slot, slot length).');
    }
    return { zeroTime: BigInt(values[0]), zeroSlot: BigInt(values[1]), slotLength: BigInt(values[2]) };
};

const requireWallet = () => {
    if (!state.wallet) throw new Error('Connect a wallet first.');
};

const context = async plutus => {
    requireWallet();
    const wallet = state.wallet;
    const provider = state.provider;
    const params = await provider.getParameters();
    const mode = element('network-mode').checked ? 'network' : 'compatibility';
    const buildParams = buildParameters(params, mode);
    const address = (await wallet.getChangeAddress()).toString();
    return { params: buildParams, mode, networkProtocol: params.protocolVersion?.major, slotConfig: slotConfig(), address, utxos: await wallet.getUnspentOutputs(),
        collateral: plutus ? await wallet.getCollateral() : [] };
};

const run = async (feature, action) => {
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll('#dijkstra-section button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
        await Cometa.ready();
        await action();
    } catch (error) {
        show(feature, error.message);
        ui.log(`Dijkstra: ${error.message}`, 'error');
    } finally {
        busy = false;
        buttons.forEach(button => { button.disabled = false; });
        for (const test of features) {
            const tx = pending.get(test);
            field(test, 'sign').disabled = !tx || tx.signed;
            field(test, 'submit').disabled = !tx?.signed || tx.mode !== 'network';
        }
    }
};

const build = async feature => {
    resetTest(feature);
    const current = revisions.get(feature);
    const batch = feature === 'batch';
    const wallet = state.wallet;
    const ctx = await context(!batch && ['plutus-guard', 'deferred-mint'].includes(feature));
    const amount = field(feature, 'amount') ? parseAda(field(feature, 'amount').value.trim()) : undefined;
    let result;
    if (batch) {
        const recipient = field(feature, 'recipient').value.trim() || ctx.address;
        const parsed = Cometa.Address.fromString(recipient);
        if (parsed.asReward() || parsed.getNetworkId() !== state.networkId) throw new Error('Use a payment address on the connected network.');
        result = await buildBatch(Cometa, ctx, { count: Number(field(feature, 'count').value), amount, recipient });
    } else {
        let sourceRewardAddress;
        const rewardAddress = field(feature, 'reward')?.value.trim();
        if (['deposit', 'transfer', 'balances'].includes(feature)) {
            const reward = Cometa.RewardAddress.fromBech32(rewardAddress);
            if (reward.toAddress().getNetworkId() !== state.networkId) throw new Error('Use a reward account on the connected network.');
        }
        if (feature === 'transfer') {
            const rewards = await state.cip30Api.getRewardAddresses();
            if (!rewards.length) throw new Error('The wallet has no reward address.');
            sourceRewardAddress = Cometa.Address.fromHex(rewards[0]).asReward()?.toBech32();
            if (!sourceRewardAddress) throw new Error('Wallet returned an invalid reward address.');
            if (await state.provider.getRewardsBalance(sourceRewardAddress) < amount) throw new Error('The source reward account has insufficient balance.');
        }
        result = await buildFeature(Cometa, ctx, { feature, amount, rewardAddress, sourceRewardAddress,
            ...(feature === 'balances' ? { lower: parseAda(field(feature, 'lower').value.trim()),
                upper: parseAda(field(feature, 'upper').value.trim()), starting: parseAda(field(feature, 'starting').value.trim()) } : {}) });
    }
    if (current !== revisions.get(feature) || wallet !== state.wallet) return;
    pending.set(feature, { cbor: result.cbor, signed: false, wallet, provider: state.provider, mode: ctx.mode, utxos: [...ctx.utxos, ...ctx.collateral] });
    field(feature, 'cbor').value = result.cbor;
    show(feature, `${ctx.mode === 'network' ? 'Built with the endpoint’s protocol 12 parameters.' : `SIGNING TEST ONLY — endpoint protocol ${ctx.networkProtocol}, candidate protocol 12 parameters. Submission disabled.`} Not yet signed.\n${(result.details || []).join('\n')}\n`
        + (result.intents ? `Sub-transactions:\n${result.intents.map(item => `${item.id} — ${item.amount} lovelace\n${item.cbor}`).join('\n\n')}\n\n` : '')
        + `Transaction summary:\n${stringify(Cometa.inspectTx(result.cbor))}`);
};

const sign = async feature => {
    requireWallet();
    const tx = pending.get(feature);
    if (!tx || tx.wallet !== state.wallet || tx.signed) throw new Error('Build a transaction first.');
    const witnesses = await tx.wallet.signTransaction(tx.cbor, false);
    if (pending.get(feature) !== tx || tx.wallet !== state.wallet) return;
    const count = verifyWalletWitnesses(Cometa, tx.cbor, witnesses, tx.utxos);
    tx.cbor = Cometa.applyVkeyWitnessSet(tx.cbor, witnesses);
    tx.signed = true;
    field(feature, 'cbor').value = tx.cbor;
    show(feature, `Wallet signing passed: ${count} key signature(s) verified against the enclosing transaction.\n${tx.mode === 'network' ? 'Review the CBOR before submitting.' : 'Compatibility mode: submission remains disabled.'}`);
};

const submit = async feature => {
    requireWallet();
    const tx = pending.get(feature);
    if (!tx?.signed || tx.mode !== 'network' || tx.wallet !== state.wallet) throw new Error('Sign the built transaction first.');
    requireDijkstra(await tx.provider.getParameters());
    if (pending.get(feature) !== tx || tx.wallet !== state.wallet) return;
    const id = await tx.wallet.submitTransaction(tx.cbor);
    if (pending.get(feature) !== tx) return;
    resetDijkstra();
    show(feature, `Submitted: ${id}\nSubmission is not confirmation; check the target network’s explorer.`);
};

export const setupDijkstra = () => {
    if (initialized) return true;
    const required = [
        'network-mode', 'zero-time', 'zero-slot', 'slot-length',
        ...features.flatMap(feature => ['card', 'build', 'sign', 'submit', 'cbor', 'result'].map(name => `${feature}-${name}`)),
        'deposit-reward', 'deposit-amount', 'transfer-reward', 'transfer-amount',
        'balances-reward', 'balances-lower', 'balances-upper', 'balances-starting',
        'batch-count', 'batch-recipient', 'batch-amount',
    ];
    if (required.some(id => !element(id))) {
        document.querySelectorAll('#dijkstra-section button').forEach(button => { button.disabled = true; });
        ui.log('Dijkstra page and scripts are out of date. Hard-refresh this page to load the matching version. Other wallet tests are still available.', 'error');
        return false;
    }
    for (const feature of features) {
        for (const [action, handler] of [['build', build], ['sign', sign], ['submit', submit]]) {
            field(feature, action).addEventListener('click', () => run(feature, () => handler(feature)));
        }
        field(feature, 'card').querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => resetTest(feature));
        });
    }
    for (const id of ['network-mode', 'zero-time', 'zero-slot', 'slot-length']) {
        element(id).addEventListener('input', resetDijkstra);
    }
    initialized = true;
    return true;
};
