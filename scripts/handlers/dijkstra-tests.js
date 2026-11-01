/** Wallet compatibility checks and explicit Dijkstra build/sign/submit steps. */
import { state } from '../app-state.js';
import * as ui from '../ui.js';
import { buildBatch, buildFeature, requireDijkstra, parseAda, v4Script, buildParameters, verifyWalletWitnesses } from '../dijkstra.js';

const element = id => document.getElementById(`dijkstra-${id}`);
let pending = null;
let busy = false;
let generation = 0;
const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const show = message => { element('result').textContent = message; };

export const resetDijkstra = () => {
    generation++;
    pending = null;
    element('sign').disabled = true;
    element('submit').disabled = true;
    element('cbor').value = '';
    show('Build a new transaction for the connected wallet.');
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
    if (state.networkId !== 0) throw new Error('Dijkstra experiments are available on test networks only.');
};

const context = async plutus => {
    requireWallet();
    const wallet = state.wallet;
    const provider = state.provider;
    const params = await provider.getParameters();
    const mode = element('mode').value;
    const buildParams = buildParameters(params, mode);
    const address = (await wallet.getChangeAddress()).toString();
    return { params: buildParams, mode, networkProtocol: params.protocolVersion?.major, slotConfig: slotConfig(), address, utxos: await wallet.getUnspentOutputs(),
        collateral: plutus ? await wallet.getCollateral() : [] };
};

const run = async action => {
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll('#dijkstra-section button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
        await Cometa.ready();
        await action();
    } catch (error) {
        show(error.message);
        ui.log(`Dijkstra: ${error.message}`, 'error');
    } finally {
        busy = false;
        buttons.forEach(button => { button.disabled = false; });
        element('sign').disabled = !pending || pending.signed;
        element('submit').disabled = !pending?.signed || pending.mode !== 'network';
    }
};

const build = async batch => {
    resetDijkstra();
    const current = generation;
    const wallet = state.wallet;
    const feature = element('feature').value;
    const ctx = await context(!batch && ['plutus-guard', 'deferred-mint'].includes(feature));
    const amount = parseAda(element('amount').value.trim());
    let result;
    if (batch) {
        const recipient = element('recipient').value.trim() || ctx.address;
        const parsed = Cometa.Address.fromString(recipient);
        if (parsed.asReward() || parsed.getNetworkId() !== state.networkId) throw new Error('Use a payment address on this test network.');
        result = await buildBatch(Cometa, ctx, { count: Number(element('count').value), amount, recipient });
    } else {
        let sourceRewardAddress;
        const rewardAddress = element('reward').value.trim();
        if (['deposit', 'transfer', 'balances'].includes(feature)) {
            const reward = Cometa.RewardAddress.fromBech32(rewardAddress);
            if (reward.toAddress().getNetworkId() !== state.networkId) throw new Error('Use a reward account on this test network.');
        }
        if (feature === 'transfer') {
            const rewards = await state.cip30Api.getRewardAddresses();
            if (!rewards.length) throw new Error('The wallet has no reward address.');
            sourceRewardAddress = Cometa.Address.fromHex(rewards[0]).asReward()?.toBech32();
            if (!sourceRewardAddress) throw new Error('Wallet returned an invalid reward address.');
            if (await state.provider.getRewardsBalance(sourceRewardAddress) < amount) throw new Error('The source reward account has insufficient balance.');
        }
        result = await buildFeature(Cometa, ctx, { feature, amount, rewardAddress, sourceRewardAddress,
            lower: parseAda(element('lower').value.trim()), upper: parseAda(element('upper').value.trim()),
            starting: parseAda(element('starting').value.trim()) });
    }
    if (current !== generation || wallet !== state.wallet) return;
    pending = { cbor: result.cbor, signed: false, wallet, provider: state.provider, mode: ctx.mode, utxos: [...ctx.utxos, ...ctx.collateral] };
    element('cbor').value = result.cbor;
    show(`${ctx.mode === 'network' ? 'Built with the endpoint’s protocol 12 parameters.' : `SIGNING TEST ONLY — endpoint protocol ${ctx.networkProtocol}, candidate protocol 12 parameters. Submission disabled.`} Not yet signed.\n${(result.details || []).join('\n')}\n`
        + (result.intents ? `Sub-transactions:\n${result.intents.map(item => `${item.id} — ${item.amount} lovelace\n${item.cbor}`).join('\n\n')}\n\n` : '')
        + `Transaction summary (RC1 omits some Dijkstra fields; use the full CBOR):\n${stringify(Cometa.inspectTx(result.cbor))}`);
};

const sign = async () => {
    requireWallet();
    const tx = pending;
    if (!tx || tx.wallet !== state.wallet || tx.signed) throw new Error('Build a transaction first.');
    const witnesses = await tx.wallet.signTransaction(tx.cbor, false);
    if (pending !== tx || tx.wallet !== state.wallet) return;
    const count = verifyWalletWitnesses(Cometa, tx.cbor, witnesses, tx.utxos);
    tx.cbor = Cometa.applyVkeyWitnessSet(tx.cbor, witnesses);
    tx.signed = true;
    element('cbor').value = tx.cbor;
    show(`Wallet signing passed: ${count} key signature(s) verified against the enclosing transaction.\n${tx.mode === 'network' ? 'Review the CBOR before submitting.' : 'Compatibility mode: submission remains disabled.'}`);
};

const submit = async () => {
    requireWallet();
    const tx = pending;
    if (!tx?.signed || tx.mode !== 'network' || tx.wallet !== state.wallet) throw new Error('Sign the built transaction first.');
    requireDijkstra(await tx.provider.getParameters());
    if (pending !== tx || tx.wallet !== state.wallet) return;
    const id = await tx.wallet.submitTransaction(tx.cbor);
    if (pending !== tx) return;
    pending = null;
    show(`Submitted: ${id}\nSubmission is not confirmation; check the target network’s explorer.`);
};

export const setupDijkstra = () => {
    element('build').addEventListener('click', () => run(() => build(false)));
    element('batch').addEventListener('click', () => run(() => build(true)));
    element('sign').addEventListener('click', () => run(sign));
    element('submit').addEventListener('click', () => run(submit));
    element('apply').addEventListener('click', () => run(async () => {
        const bytes = element('script').value.trim();
        if (!/^(?:[\da-f]{2})+$/i.test(bytes)) throw new Error('Enter a script as CBOR hex.');
        const value = element('parameter').value.trim();
        if (!/^-?\d+$/.test(value)) throw new Error('Enter an integer script parameter.');
        const script = Cometa.applyParamsToScript({ ...v4Script(Cometa), bytes }, [BigInt(value)]);
        show(`Parameter applied with the native VM. This does not validate the resulting script.\n${stringify(script)}\nScript hash: ${Cometa.computeScriptHash(script)}`);
    }));
    document.querySelectorAll('#dijkstra-section input, #dijkstra-section select').forEach(input => {
        input.addEventListener('input', resetDijkstra);
    });
};
