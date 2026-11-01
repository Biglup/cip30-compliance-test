/** Dijkstra transaction recipes shared by the page and integration tests. */
import { plutusV4Costs } from './dijkstra-cost-model.js';

export const COMETA_VERSION = '2.0.0-rc.2';
export const utxoId = utxo => `${utxo.input.txId}#${utxo.input.index}`;

export const parseAda = value => {
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) {
        throw new Error('Enter a non-negative ADA amount with at most six decimal places.');
    }
    const [whole, fraction = ''] = value.split('.');
    const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    if (amount > 0xffffffffffffffffn) throw new Error('Amount exceeds uint64.');
    return amount;
};

export const requireDijkstra = params => {
    if (params.protocolVersion?.major !== 12) {
        throw new Error(`This candidate targets protocol 12; the endpoint reports ${params.protocolVersion?.major ?? 'unknown'}. Use a Dijkstra devnet.`);
    }
};

export const paymentCredential = (C, address) => {
    const parsed = typeof address === 'string' ? C.Address.fromString(address) : address;
    const credential = parsed.asBase()?.getPaymentCredential()
        ?? parsed.asEnterprise()?.getCredential()
        ?? parsed.asPointer()?.getPaymentCredential();
    if (!credential || credential.type !== C.CredentialType.KeyHash) {
        throw new Error('A payment-key address is required for the batcher guard.');
    }
    return credential;
};

export const v4Script = C => ({
    type: C.ScriptType.Plutus,
    version: C.PlutusLanguageVersion.V4,
    // One-argument, always-succeeds validator; testing only.
    bytes: '450100002499',
});

export const createBuilder = (C, context, plutus = false) => {
    requireDijkstra(context.params);
    if (plutus && !context.params.costModels.some(model => model.language === 'PlutusV4' && model.costs.length)) {
        throw new Error('The endpoint must supply its PlutusV4 cost model for native evaluation.');
    }
    const collateral = plutus ? context.collateral : [];
    if (plutus && !collateral.length) throw new Error('Provide a separate wallet collateral UTxO.');
    const reserved = new Set(collateral.map(utxoId));
    const spendable = context.utxos.filter(utxo => !reserved.has(utxoId(utxo)));
    if (!spendable.length) throw new Error('No spendable UTxOs remain after reserving collateral.');
    return C.TransactionBuilder.create(context)
        .setUtxos(spendable)
        .setChangeAddress(context.address)
        .setCollateralUtxos(collateral)
        .setCollateralChangeAddress(context.address);
};

/** Output-only intents are paid for by the enclosing wallet; no sub-input signatures are needed. */
export const buildBatch = async (C, context, { count, amount, recipient = context.address }) => {
    requireDijkstra(context.params);
    if (!Number.isInteger(count) || count < 2 || count > 20) throw new Error('Choose 2–20 sub-transactions.');
    if (amount <= 0n) throw new Error('Each sub-transaction needs a positive amount.');
    const guard = paymentCredential(C, context.address);
    const batch = createBuilder(C, context).addGuard(guard);
    const intents = [];
    try {
        for (let index = 0; index < count; index++) {
            const sub = C.SubTransactionBuilder.create(context);
            try {
                // Distinct amounts make each intent ID unique, even with the same recipient.
                const cbor = await sub.sendLovelace({ address: recipient, amount: amount + BigInt(index) })
                    .requireTopLevelGuard(guard).build();
                intents.push({ id: C.getSubTransactionId(cbor), cbor, amount: amount + BigInt(index) });
                batch.addSubTransaction(cbor, []);
            } finally {
                sub.dispose();
            }
        }
        return { cbor: await batch.build(), intents };
    } finally {
        batch.dispose();
    }
};

export const buildFeature = async (C, context, options) => {
    const { feature, amount = 2_000_000n, rewardAddress, sourceRewardAddress, lower, upper, starting } = options;
    const plutus = feature === 'plutus-guard' || feature === 'deferred-mint';
    const builder = createBuilder(C, context, plutus);
    const details = [];
    try {
        switch (feature) {
            case 'deposit':
            case 'transfer': {
                C.RewardAddress.fromBech32(rewardAddress);
                if (amount <= 0n) throw new Error('Deposit amount must be positive.');
                if (feature === 'transfer') {
                    builder.withdrawRewards({ rewardAddress: C.RewardAddress.fromBech32(sourceRewardAddress), amount });
                }
                builder.addDirectDeposit(rewardAddress, amount);
                break;
            }
            case 'balances':
                C.RewardAddress.fromBech32(rewardAddress);
                if (upper <= lower) throw new Error('The upper balance bound must be greater than the lower bound.');
                builder.addAccountBalanceInterval(rewardAddress, { inclusiveLowerBound: lower, exclusiveUpperBound: upper })
                    .addStartingAccountBalanceInterval(rewardAddress, { exact: starting });
                break;
            case 'key-guard':
                builder.addGuard(paymentCredential(C, context.address));
                break;
            case 'native-guard': {
                const credential = paymentCredential(C, context.address);
                const script = { type: C.ScriptType.Native, kind: C.NativeScriptKind.RequireGuard, credential };
                const assetIdHex = C.computeScriptHash(script) + C.utf8ToHex('GuardTest');
                builder.addGuard(credential).addScript(script).mintToken({ assetIdHex, amount: 1n });
                details.push(`Minted test asset: ${assetIdHex}`);
                break;
            }
            case 'plutus-guard': {
                const script = v4Script(C);
                builder.addScript(script).addGuard({ type: C.CredentialType.ScriptHash, hash: C.computeScriptHash(script) }, 0n);
                details.push('Plutus V4 guard evaluated by the bundled native VM.');
                break;
            }
            case 'deferred-mint': {
                const script = v4Script(C);
                builder.addScript(script).mintTokenWithDeferredRedeemer(C.computeScriptHash(script) + C.utf8ToHex('DeferredTest'), 1n,
                    (draft, inputs) => {
                        C.inspectTx(draft);
                        details.push(`Deferred redeemer resolved with ${inputs.length} input(s).`);
                        return BigInt(inputs.length);
                    });
                break;
            }
            default:
                throw new Error('Unknown Dijkstra feature.');
        }
        return { cbor: await builder.build(), details };
    } finally {
        builder.dispose();
    }
};

/** Compatibility mode changes only the era and supplies a diagnostic V4 model if absent. */
export const buildParameters = (params, mode) => {
    if (mode === 'network') { requireDijkstra(params); return params; }
    if (mode !== 'compatibility') throw new Error('Unknown test mode.');
    return { ...params, protocolVersion: { major: 12, minor: 0 },
        costModels: params.costModels.some(model => model.language === 'PlutusV4')
            ? params.costModels : [...params.costModels, { language: 'PlutusV4', costs: plutusV4Costs }] };
};

/** Check the returned signatures against the exact transaction and the keys it spends. */
export const verifyWalletWitnesses = (C, cbor, witnesses, utxos) => {
    if (!witnesses.length) throw new Error('Wallet returned no key witnesses.');
    const tx = C.readTransactionFromCbor(cbor);
    let hash;
    try { hash = C.readBlake2bHashData(C.getModule().transaction_get_id(tx)); }
    finally { C.unrefObject(tx); }
    const signedKeys = new Set();
    for (const witness of witnesses) {
        const key = C.Ed25519PublicKey.fromHex(witness.vkey);
        if (!key.verify(C.Ed25519Signature.fromHex(witness.signature), hash)) {
            throw new Error('Wallet returned a signature that does not verify against this transaction.');
        }
        signedKeys.add(key.toHashHex());
    }
    const body = C.inspectTx(cbor).body;
    const required = new Set((body.required_signers || []).filter(value => typeof value === 'string'));
    for (const guard of body.guards || []) {
        if (guard.tag === 'pubkey_hash') required.add(guard.value);
    }
    for (const input of [...body.inputs, ...(body.collateral || [])]) {
        const utxo = utxos.find(item => item.input.txId === input.transaction_id && item.input.index === input.index);
        if (!utxo) throw new Error('Cannot verify a signature for an unresolved wallet input.');
        required.add(paymentCredential(C, utxo.output.address).hash);
    }
    for (const withdrawal of body.withdrawals || []) {
        const account = C.RewardAddress.fromBech32(withdrawal.key);
        const credential = account.getCredential();
        if (credential.type === C.CredentialType.KeyHash) required.add(credential.hash);
    }
    for (const key of required) if (!signedKeys.has(key)) throw new Error(`Wallet did not sign required key ${key}.`);
    return signedKeys.size;
};
