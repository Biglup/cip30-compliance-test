/** Local-only integration checks. Synthetic UTxOs never enter the wallet signing flow. */
import { localParameters } from './dijkstra-parameters.js';
import { buildBatch, buildFeature, v4Script, paymentCredential } from '../../scripts/dijkstra.js';

export const localContext = C => {
    const key = C.Ed25519PrivateKey.fromNormalHex('01'.repeat(32));
    const credential = { type: C.CredentialType.KeyHash, hash: key.getPublicKey().toHashHex() };
    const address = C.EnterpriseAddress.fromCredentials(C.NetworkId.Testnet, credential).toAddress().toString();
    const rewardAddress = C.RewardAddress.fromCredentials(C.NetworkId.Testnet, credential).toBech32();
    const utxo = index => ({ input: { txId: '01'.repeat(32), index }, output: { address, value: { coins: 100_000_000n } } });
    return { params: localParameters, slotConfig: C.CARDANO_PREVIEW_SLOT_CONFIG, address, rewardAddress,
        utxos: [utxo(0)], collateral: [utxo(1)] };
};

/** Independently sign input-bearing intents and preserve their IDs when batching them. */
export const buildSignedLocalBatch = async (C, context, count = 3) => {
    const guard = paymentCredential(C, context.address);
    const batch = C.TransactionBuilder.create(context).setUtxos(context.utxos).setChangeAddress(context.address).addGuard(guard);
    const intents = [];
    try {
        for (let index = 0; index < count; index++) {
            // Public fixture keys. These addresses must never receive real funds.
            const key = C.Bip32PrivateKey.fromBip39Entropy(new Uint8Array(), new Uint8Array(32).fill(index + 2)).toEd25519Key();
            const credential = { type: C.CredentialType.KeyHash, hash: key.getPublicKey().toHashHex() };
            const address = C.EnterpriseAddress.fromCredentials(C.NetworkId.Testnet, credential).toAddress().toString();
            const utxo = { input: { txId: '02'.repeat(32), index }, output: { address, value: { coins: 10_000_000n } } };
            const password = () => new TextEncoder().encode('local-fixture');
            const signer = await C.SoftwareEd25519SecureKeyHandler.fromEd25519Key(key, password(), async () => password());
            const sub = C.SubTransactionBuilder.create(context);
            try {
                const cbor = await sub.addInput({ utxo }).sendLovelace({ address, amount: 10_000_000n })
                    .requireTopLevelGuard(guard).build();
                const id = C.getSubTransactionId(cbor);
                const witnesses = await signer.signSubTransaction(cbor);
                for (const witness of witnesses) {
                    if (!C.Ed25519PublicKey.fromHex(witness.vkey).verify(
                        C.Ed25519Signature.fromHex(witness.signature), C.hexToUint8Array(id))) {
                        throw new Error('Sub-transaction signature verification failed.');
                    }
                }
                const signed = C.applySubTransactionWitnesses(cbor, witnesses);
                if (C.getSubTransactionId(signed) !== id) throw new Error('Signing changed the intent body.');
                batch.addSubTransaction(signed, [utxo]);
                intents.push({ id, cbor: signed, witnesses });
            } finally {
                sub.dispose();
            }
        }
        return { cbor: await batch.build(), intents };
    } finally {
        batch.dispose();
    }
};

export const runLocalChecks = async (C, report = () => {}) => {
    const context = localContext(C);
    const results = [];
    const check = async (name, fn) => {
        try {
            const result = await fn();
            results.push({ name, passed: true, ...result });
            report(`${name}: passed`, 'success');
        } catch (error) {
            results.push({ name, passed: false, error: error.message });
            report(`${name}: ${error.message}`, 'error');
        }
    };
    for (const feature of ['deposit', 'transfer', 'balances', 'key-guard', 'native-guard', 'plutus-guard', 'deferred-mint']) {
        await check(feature, () => buildFeature(C, context, { feature, rewardAddress: context.rewardAddress,
            sourceRewardAddress: context.rewardAddress, lower: 0n, upper: 100_000_000n, starting: 0n }));
    }
    await check('wallet-funded batch', () => buildBatch(C, context, { count: 3, amount: 2_000_000n }));
    await check('independently signed batch', () => buildSignedLocalBatch(C, context));
    for (const purpose of ['spend', 'withdrawal', 'certificate', 'vote']) {
        await check(`deferred ${purpose} in an intent`, async () => {
            const builder = C.SubTransactionBuilder.create(context);
            const script = v4Script(C);
            const credential = { type: C.CredentialType.ScriptHash, hash: C.computeScriptHash(script) };
            let calls = 0;
            const callback = (draft, inputs) => { C.inspectTx(draft); calls++; return BigInt(inputs.length); };
            try {
                builder.addScript(script);
                switch (purpose) {
                    case 'spend':
                        builder.addInputWithDeferredRedeemer({ ...context.utxos[0], output: {
                            address: C.getScriptAddress(script, C.NetworkId.Testnet).toString(),
                            value: { coins: 10_000_000n }
                        } }, callback);
                        break;
                    case 'withdrawal':
                        builder.withdrawRewardsWithDeferredRedeemer(C.RewardAddress.fromCredentials(C.NetworkId.Testnet, credential), 1n, callback);
                        break;
                    case 'certificate':
                        builder.addCertificateWithDeferredRedeemer({ type: C.CertificateType.UpdateDRep, dRepCredential: credential, anchor: null }, callback);
                        break;
                    case 'vote':
                        builder.voteWithDeferredRedeemer({ type: C.VoterType.DRepScriptHash, credential },
                            { id: '22'.repeat(32), actionIndex: 0 }, { vote: C.Vote.Yes, anchor: null }, callback);
                        break;
                }
                const cbor = await builder.build();
                if (!calls) throw new Error('Deferred callback did not execute.');
                return { subTransactionCbor: cbor, callbackCalls: calls };
            } finally {
                builder.dispose();
            }
        });
    }
    await check('apply script parameters', () => {
        const script = v4Script(C);
        const applied = C.applyParamsToScript(script, [42n]);
        if (applied.bytes === script.bytes) throw new Error('Applying a parameter left the script unchanged.');
        return { script: applied, hash: C.computeScriptHash(applied) };
    });
    return results;
};
