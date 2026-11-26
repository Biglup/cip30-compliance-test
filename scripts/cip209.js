/** CIP-209 request builders, decoders and result checks shared by the page and integration tests. */
import { createBuilder, paymentCredential, requireDijkstra, utxoId } from './dijkstra.js?v=20261126-1';

export const CIP209_METHODS = ['getBalances', 'signSubTxs', 'balanceAndSignTx'];
export const RAW_METHODS = [...CIP209_METHODS, 'signTx'];
export const MAX_INTENTS = 16;
/** Change below this is refused up front so an intent never carries an output under the minimum UTxO value. */
export const MIN_CHANGE = 1_000_000n;

const API_ERRORS = { '-1': 'InvalidRequest', '-2': 'InternalError', '-3': 'Refused', '-4': 'AccountChange' };
const TX_SIGN_ERRORS = { 1: 'ProofGeneration', 2: 'UserDeclined', 3: 'BodyLocked', 4: 'CannotBalance',
    5: 'EvaluationFailed', 6: 'UnsatisfiedGuard', 7: 'SubTxWitnessesMissing' };
const TX_SEND_ERRORS = { 1: 'Refused', 2: 'Failure' };

export const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) ?? String(value);

/** Copy what a wallet threw without dropping fields: plain objects, Error instances and primitives alike. */
export const errorDetails = error => {
    if (error === null || typeof error !== 'object') return { value: error };
    const details = {};
    for (const key of ['code', 'info', 'maxSize', 'message']) if (error[key] !== undefined) details[key] = error[key];
    for (const key of Object.keys(error)) details[key] = error[key];
    return details;
};

/** Name a code for the method that produced it. Positive codes mean different things per error type. */
export const errorName = (details, method) => {
    if (typeof details.code !== 'number') return typeof details.maxSize === 'number' ? 'PaginateError' : undefined;
    if (details.code < 0) return API_ERRORS[details.code] && `APIError ${API_ERRORS[details.code]}`;
    if (method === 'getBalances') return undefined;
    if (method === 'submit') return TX_SEND_ERRORS[details.code] && `TxSendError ${TX_SEND_ERRORS[details.code]}`;
    return TX_SIGN_ERRORS[details.code] && `TxSignError ${TX_SIGN_ERRORS[details.code]}`;
};

export const formatError = (error, method) => {
    const details = errorDetails(error);
    const name = errorName(details, method);
    const label = typeof details.code === 'number' ? `code ${details.code}` : 'no numeric code';
    return `${stringify(details)}\n${label}: ${name ?? 'not an error this method is specified to return'}`;
};

export const isHex = value => typeof value === 'string' && value.length > 0 && value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
const requireHex = value => {
    if (!isHex(value)) throw new Error('Not a hex-encoded byte string.');
    return value.toLowerCase();
};

const encode = (C, write) => {
    const writer = new C.CborWriter();
    try { write(writer); return writer.encodeHex(); }
    finally { writer.dispose(); }
};
const decode = (C, cbor, read) => {
    const reader = C.CborReader.fromHex(requireHex(cbor));
    try {
        const value = read(reader);
        if (reader.peekState() !== C.CborReaderState.Finished) throw new Error('Trailing bytes after the CBOR value.');
        return value;
    } finally { reader.dispose(); }
};

export const transactionId = (C, cbor) => {
    const tx = C.readTransactionFromCbor(cbor);
    try { return C.uint8ArrayToHex(C.readBlake2bHashData(C.getModule().transaction_get_id(tx))); }
    finally { C.unrefObject(tx); }
};

/** Strict split of `[body, witness_set, auxiliary_data / nil]`; indefinite arrays and trailing bytes are refused. */
export const splitSubTransaction = (C, cbor) => decode(C, cbor, reader => {
    if (reader.readStartArray() !== 3) throw new Error('A subtransaction is a definite-length array of three items.');
    const body = C.uint8ArrayToHex(reader.readEncodedValue());
    const witnessSet = C.uint8ArrayToHex(reader.readEncodedValue());
    reader.skipValue();
    reader.readEndArray();
    return { body, witnessSet };
});

/** Raw subtransactions (body field 23) of a top-level transaction, in order. */
export const subTransactionsOf = (C, cbor) => decode(C, cbor, reader => {
    const found = [];
    reader.readStartArray();
    reader.readStartMap();
    while (reader.peekState() !== C.CborReaderState.EndMap) {
        if (reader.readUnsignedInt() !== 23n) { reader.skipValue(); continue; }
        if (reader.peekState() === C.CborReaderState.Tag) reader.readTag();
        reader.readStartArray();
        while (reader.peekState() !== C.CborReaderState.EndArray) found.push(C.uint8ArrayToHex(reader.readEncodedValue()));
        reader.readEndArray();
    }
    reader.readEndMap();
    while (reader.peekState() !== C.CborReaderState.EndArray) reader.skipValue();
    reader.readEndArray();
    return found;
});

const writeOutput = (C, writer, address, amount) => writer.startMap(2)
    .writeInt(0).writeByteString(C.Address.fromString(address).toBytes())
    .writeInt(1).writeUnsignedInt(amount);
const writeEmptySet = writer => writer.writeTag(258).startArray(0);

/**
 * An incomplete top-level transaction: no inputs, a placeholder fee of 0 and no change.
 * Cometa only builds balanced transactions, so this is written field by field in the
 * four-item form the builder emits for every other transaction on this page.
 */
const unbalanced = (C, fields, writeFields) => encode(C, writer => {
    writer.startArray(4).startMap(3 + fields).writeInt(0);
    writeEmptySet(writer);
    writer.writeInt(1);
    writeFields(writer);
    writer.startMap(0).writeBoolean(true).writeNull();
});

export const buildUnbalancedPayment = (C, { address, amount }) => {
    if (amount <= 0n) throw new Error('The payment needs a positive amount.');
    return unbalanced(C, 0, writer => {
        writeOutput(C, writer.startArray(1), address, amount);
        writer.writeInt(2).writeInt(0);
    });
};

/** Field 23 is a tagged set, as the builder writes it. The wallet is left to add inputs, fee, collateral and every required top-level guard. */
export const buildUnbalancedWrapper = (C, subTxs) => {
    if (!subTxs.length) throw new Error('At least one subtransaction is required.');
    return unbalanced(C, 1, writer => {
        writer.startArray(0).writeInt(2).writeInt(0).writeInt(23).writeTag(258).startArray(subTxs.length);
        for (const subTx of subTxs) writer.writeEncoded(C.hexToUint8Array(requireHex(subTx)));
    });
};

/** The bare `sub_transaction` and `sub_transactions` input forms of balanceAndSignTx. */
export const encodeBareSubTransactions = (C, subTxs) => {
    if (!subTxs.length) throw new Error('At least one subtransaction is required.');
    if (subTxs.length === 1) return requireHex(subTxs[0]);
    return encode(C, writer => {
        writer.startArray(subTxs.length);
        for (const subTx of subTxs) writer.writeEncoded(C.hexToUint8Array(requireHex(subTx)));
    });
};

/** A well-formed output-only subtransaction used as the base of the malformed presets. */
export const sampleSubTransaction = (C, address, amount) => encode(C, writer => {
    writer.startArray(3).startMap(2).writeInt(0);
    writeEmptySet(writer);
    writeOutput(C, writer.writeInt(1).startArray(1), address, amount);
    writer.startMap(0).writeNull();
});

export const EXPECT_INVALID_REQUEST = { code: -1, label: 'APIError InvalidRequest (-1)' };
const MALFORMED = 'malformed input';
const UNSTATED = 'the CIP text names no such limit; a wallet that accepts this is not contradicting it';

/** signSubTxs arguments a wallet is expected to refuse before prompting the user. */
export const malformedPresets = (C, address) => {
    const sample = index => sampleSubTransaction(C, address, 2_000_000n + BigInt(index));
    const one = sample(0);
    return [
        { id: 'empty', label: 'Empty list', args: [[]], basis: UNSTATED },
        { id: 'odd-hex', label: 'Odd-length hex', args: [[one.slice(0, -1)]], basis: MALFORMED },
        { id: 'non-hex', label: 'Non-hex characters', args: [[`zz${one.slice(2)}`]], basis: MALFORMED },
        { id: 'trailing', label: 'Trailing bytes', args: [[`${one}00`]], basis: MALFORMED },
        { id: 'indefinite', label: 'Indefinite-length array', args: [[`9f${one.slice(2)}ff`]], basis: UNSTATED },
        { id: 'format', label: 'Unknown format string', args: [[one], 'cbor'], basis: MALFORMED },
        { id: 'too-many', label: '17 entries', args: [Array.from({ length: 17 }, (_, index) => sample(index))], basis: UNSTATED },
    ].map(preset => ({ ...preset, method: 'signSubTxs', expected: EXPECT_INVALID_REQUEST }));
};

/** Compare a raw call outcome with a preset expectation. */
export const meetsExpectation = (expected, outcome) => 'error' in outcome && errorDetails(outcome.error).code === expected.code;

/** Decode `{ utxos, accounts }` and list everything in it that departs from the CIP. */
export const decodeBalances = (C, balance) => {
    if (balance === null || typeof balance !== 'object') throw new Error('getBalances must resolve with an object.');
    if (!Array.isArray(balance.utxos)) throw new Error('`utxos` must be an array of CBOR hex strings.');
    if (typeof balance.accounts !== 'string') throw new Error('`accounts` must be one CBOR hex string.');
    const problems = [];
    const utxos = balance.utxos.map((cbor, index) => {
        try { return C.readUTxOtFromCbor(requireHex(cbor)); }
        catch (error) { throw new Error(`utxos[${index}] does not decode as a transaction_unspent_output: ${error.message}`); }
    });
    let accounts;
    try {
        accounts = decode(C, balance.accounts, reader => {
            const entries = [];
            reader.readStartMap();
            while (reader.peekState() !== C.CborReaderState.EndMap) {
                const rewardAddress = C.RewardAddress.fromBytes(reader.readByteString()).toBech32();
                entries.push({ rewardAddress, value: C.readValueFromCbor(C.uint8ArrayToHex(reader.readEncodedValue())) });
            }
            reader.readEndMap();
            return entries;
        });
    } catch (error) {
        throw new Error(`\`accounts\` does not decode as a map from reward_account to value: ${error.message}`);
    }
    for (const account of accounts) {
        if (account.value.coins === 0n && !Object.keys(account.value.assets || {}).length) {
            problems.push(`${account.rewardAddress} has a zero balance; the CIP says such accounts are not listed.`);
        }
    }
    if (new Set(accounts.map(account => account.rewardAddress)).size !== accounts.length) problems.push('`accounts` lists a reward account twice.');
    const total = [...utxos.map(utxo => utxo.output.value), ...accounts.map(account => account.value)]
        .reduce((sum, value) => sum + BigInt(value.coins), 0n);
    return { utxos, accounts, problems, total };
};

const keyHashOf = (C, address) => {
    try { return paymentCredential(C, address).hash; } catch { return undefined; }
};
const isAdaOnly = utxo => !Object.keys(utxo.output.value.assets || {}).length;

/**
 * Input-bearing intents: each spends one ADA-only wallet UTxO, pays the recipient and returns the
 * rest as change, so it balances by itself and needs the wallet's own signature. The batcher is the
 * party whose top-level guard every intent requires. No intent spends another's output: CIP-118
 * requires every input of every level to exist on chain before the batch.
 */
export const buildIntents = async (C, context, { count, amount, recipient = context.address, batcher = context.address }) => {
    requireDijkstra(context.params);
    if (!Number.isInteger(count) || count < 1 || count > MAX_INTENTS) throw new Error(`Choose 1-${MAX_INTENTS} subtransactions.`);
    if (amount <= 0n) throw new Error('Each subtransaction needs a positive amount.');
    const guard = paymentCredential(C, batcher);
    const covers = utxo => BigInt(utxo.output.value.coins) === amount || BigInt(utxo.output.value.coins) >= amount + MIN_CHANGE;
    const funding = context.utxos.filter(utxo => isAdaOnly(utxo) && covers(utxo) && keyHashOf(C, utxo.output.address))
        .sort((a, b) => (BigInt(a.output.value.coins) < BigInt(b.output.value.coins) ? -1 : 1));
    if (funding.length < count) {
        throw new Error(`Each subtransaction spends its own ADA-only UTxO holding the amount plus at least 1 ADA of change (or exactly the amount). The wallet has ${funding.length} such UTxO(s); ${count} needed.`);
    }
    const intents = [];
    for (const utxo of funding.slice(0, count)) {
        const sub = C.SubTransactionBuilder.create(context);
        try {
            const change = BigInt(utxo.output.value.coins) - amount;
            sub.addInput({ utxo }).sendLovelace({ address: recipient, amount });
            if (change > 0n) sub.sendLovelace({ address: context.address, amount: change });
            const cbor = await sub.requireTopLevelGuard(guard).build();
            intents.push({ id: C.getSubTransactionId(cbor), cbor, utxo, amount, required: [keyHashOf(C, utxo.output.address)] });
        } finally {
            sub.dispose();
        }
    }
    return intents;
};

const verifiedSigners = (C, witnesses, id, label) => {
    const signers = new Set();
    for (const witness of witnesses) {
        const key = C.Ed25519PublicKey.fromHex(witness.vkey);
        if (!key.verify(C.Ed25519Signature.fromHex(witness.signature), C.hexToUint8Array(id))) {
            throw new Error(`${label}: a signature does not verify against subtransaction ${id}.`);
        }
        signers.add(key.toHashHex());
    }
    return signers;
};

/**
 * Check what signSubTxs returned for the given intents: one entry per input in the same order;
 * with `witnessSet` (also the default when the format is omitted) a witness set whose signatures
 * verify against that subtransaction's id; with `full` the same body bytes plus the witnesses.
 * Returns the signed subtransactions, ready for another party to wrap.
 */
export const verifySignedSubTxs = (C, intents, entries, format = 'witnessSet') => {
    if (!Array.isArray(entries)) throw new Error('signSubTxs must resolve with an array.');
    if (entries.length !== intents.length) {
        throw new Error(`signSubTxs returned ${entries.length} entries for ${intents.length} subtransaction(s); exactly one per input is required.`);
    }
    return intents.map((intent, index) => {
        const label = `Entry ${index}`;
        const entry = entries[index];
        if (!isHex(entry)) throw new Error(`${label} is not a CBOR hex string.`);
        let witnesses;
        let cbor;
        if (format === 'full') {
            let returned;
            try { returned = splitSubTransaction(C, entry); }
            catch (error) { throw new Error(`${label} does not decode as a subtransaction: ${error.message}`); }
            if (returned.body !== splitSubTransaction(C, intent.cbor).body || C.getSubTransactionId(entry) !== intent.id) {
                throw new Error(`${label}: the wallet changed the subtransaction body.`);
            }
            witnesses = C.readVkeyWitnessSetFromWitnessSetCbor(returned.witnessSet);
            cbor = entry.toLowerCase();
        } else {
            try {
                decode(C, entry, reader => reader.skipValue());
                witnesses = C.readVkeyWitnessSetFromWitnessSetCbor(entry);
            } catch (error) {
                throw new Error(`${label} does not decode as a transaction_witness_set: ${error.message}`);
            }
            cbor = C.applySubTransactionWitnesses(intent.cbor, witnesses);
            if (C.getSubTransactionId(cbor) !== intent.id) throw new Error(`${label}: attaching the witnesses changed the subtransaction id.`);
        }
        const signers = verifiedSigners(C, witnesses, intent.id, label);
        for (const key of intent.required) {
            if (!signers.has(key)) throw new Error(`${label}: the wallet did not sign required key ${key}.`);
        }
        return { id: intent.id, cbor, signatures: signers.size };
    });
};

/**
 * Parse subtransactions received from another party. Their bodies are read through a throwaway
 * unbalanced wrapper because the inspector only accepts top-level transactions.
 */
export const inspectSubTransactions = (C, subTxs) => {
    if (!subTxs.length) throw new Error('Paste at least one subtransaction CBOR, one per line.');
    const ids = subTxs.map((cbor, index) => {
        try { splitSubTransaction(C, cbor); return C.getSubTransactionId(cbor); }
        catch (error) { throw new Error(`Line ${index + 1} is not a subtransaction: ${error.message}`); }
    });
    ids.forEach((id, index) => {
        if (ids.indexOf(id) !== index) throw new Error(`Lines ${ids.indexOf(id) + 1} and ${index + 1} are the same subtransaction.`);
    });
    const inspected = C.inspectTx(buildUnbalancedWrapper(C, subTxs)).body.sub_transactions;
    const spent = new Map();
    return subTxs.map((cbor, index) => {
        const { body, witness_set: witnessSet } = inspected[index];
        const inputs = (body.inputs || []).map(input => ({ txId: input.transaction_id, index: input.index }));
        for (const input of inputs) {
            const id = utxoId({ input });
            if (spent.has(id)) throw new Error(`Lines ${spent.get(id) + 1} and ${index + 1} spend the same UTxO ${id}; a batch cannot contain both.`);
            spent.set(id, index);
        }
        return { cbor: cbor.toLowerCase(), id: ids[index], inputs,
            referenceInputs: (body.reference_inputs || []).map(input => ({ txId: input.transaction_id, index: input.index })),
            keyGuards: (body.guards || []).filter(guard => guard.tag === 'pubkey_hash').map(guard => guard.value),
            topLevelGuards: (body.required_top_level_guards || []).map(guard => guard.key),
            signers: [...verifiedSigners(C, witnessSet?.vkey_witnesses || [], ids[index], `Line ${index + 1}`)] };
    });
};

/** Payment keys of the spent inputs and key guards of a subtransaction that have no signature yet. */
export const missingSubTxWitnesses = (C, sub, resolved) => {
    const required = new Set(sub.keyGuards);
    for (const input of sub.inputs) {
        const utxo = resolved.find(item => item.input.txId === input.txId && item.input.index === input.index);
        if (!utxo) throw new Error(`Input ${utxoId({ input })} of subtransaction ${sub.id} is not resolved.`);
        const key = keyHashOf(C, utxo.output.address);
        if (key) required.add(key);
    }
    return [...required].filter(key => !sub.signers.includes(key));
};

/**
 * The top-level transaction that carries subtransactions from other parties. It is funded by the
 * connected wallet from UTxOs none of them spends, and meets every key guard they require; the
 * wallet's own payment key is always a guard.
 */
export const buildWrapper = async (C, context, subs) => {
    const spent = new Set(subs.flatMap(sub => sub.inputs.map(input => utxoId({ input }))));
    const own = paymentCredential(C, context.address);
    const guards = new Map([[own.hash, own]]);
    for (const sub of subs) {
        for (const guard of sub.topLevelGuards) {
            if (guard.tag !== 'pubkey_hash') {
                throw new Error(`Subtransaction ${sub.id} requires script guard ${guard.value}; this card only meets payment-key guards.`);
            }
            guards.set(guard.value, { type: C.CredentialType.KeyHash, hash: guard.value });
        }
    }
    const builder = createBuilder(C, { ...context, utxos: context.utxos.filter(utxo => !spent.has(utxoId(utxo))) });
    try {
        for (const guard of guards.values()) builder.addGuard(guard);
        for (const sub of subs) builder.addSubTransaction(sub.cbor, sub.resolved);
        return { cbor: await builder.build(), ownGuard: own.hash, foreignGuards: [...guards.keys()].filter(hash => hash !== own.hash) };
    } finally {
        builder.dispose();
    }
};

const RESULT_MEANINGS = [
    [false, false, false, 'INCOMPLETE and NOT SUBMITTED: the wallet signed what it could; other parties still need to sign.'],
    [true, true, false, 'COMPLETE and SUBMITTED by the wallet.'],
    [true, false, false, 'COMPLETE but NOT SUBMITTED: the wallet chose not to submit.'],
    [true, false, true, 'COMPLETE but NOT SUBMITTED: submission was attempted and failed; the signed transaction is still usable.'],
];

/**
 * Check a BalanceSignResult against the request: its shape, that `txHash` is the id of the returned
 * transaction, that the returned signatures verify, and that what the dApp supplied was preserved.
 * `request` is `{ output?: { address, amount }, subTxs?: string[] }`.
 */
export const checkBalanceResult = (C, request, result) => {
    const failures = [];
    if (result === null || typeof result !== 'object') throw new Error('balanceAndSignTx must resolve with an object.');
    if (!isHex(result.cbor)) throw new Error('`cbor` must be a CBOR hex string.');
    if (!/^[0-9a-fA-F]{64}$/.test(result.txHash ?? '')) failures.push('`txHash` is not a 32-byte hex hash.');
    for (const flag of ['complete', 'submitted']) if (typeof result[flag] !== 'boolean') failures.push(`\`${flag}\` is not a boolean.`);
    let inspected;
    let id;
    try { inspected = C.inspectTx(result.cbor); id = transactionId(C, result.cbor); }
    catch (error) { throw new Error(`\`cbor\` does not decode as a transaction: ${error.message}`); }
    if (id !== String(result.txHash).toLowerCase()) failures.push(`\`txHash\` ${result.txHash} is not the id of the returned transaction (${id}).`);
    let signatures = 0;
    for (const witness of inspected.witness_set?.vkey_witnesses || []) {
        const valid = C.Ed25519PublicKey.fromHex(witness.vkey).verify(C.Ed25519Signature.fromHex(witness.signature), C.hexToUint8Array(id));
        if (valid) signatures++;
        else failures.push(`The signature of key ${witness.vkey} does not verify against the returned transaction.`);
    }
    const hasSubmitError = result.submitError !== undefined;
    const meaning = RESULT_MEANINGS.find(row => row[0] === result.complete && row[1] === result.submitted && row[2] === hasSubmitError);
    if (!meaning) {
        failures.push(`complete = ${result.complete}, submitted = ${result.submitted}, submitError ${hasSubmitError ? 'set' : 'unset'} is not a combination the CIP allows.`);
    }
    if (result.complete === true && !signatures) failures.push('The wallet reports the transaction complete but it carries no key witness.');
    if (request.output) {
        const kept = (inspected.body.outputs || []).some(output => output.address === request.output.address
            && output.amount?.coin === request.output.amount.toString() && Object.keys(output.amount).length === 1);
        if (!kept) failures.push('The requested payment output is not in the returned transaction.');
    }
    if (request.subTxs?.length) {
        const wanted = request.subTxs.map(subTx => C.getSubTransactionId(subTx));
        const returned = subTransactionsOf(C, result.cbor);
        const got = returned.map(subTx => C.getSubTransactionId(subTx));
        if (wanted.join() !== got.join()) failures.push(`The returned transaction carries subtransactions [${got.join(', ')}], not the supplied [${wanted.join(', ')}] in order.`);
        else if (returned.some((subTx, index) => splitSubTransaction(C, subTx).body !== splitSubTransaction(C, request.subTxs[index]).body)) {
            failures.push('A subtransaction body was re-encoded by the wallet.');
        }
        const guards = new Set((inspected.body.guards || []).map(guard => guard.value));
        for (const sub of inspectSubTransactions(C, request.subTxs)) {
            for (const guard of sub.topLevelGuards) {
                if (!guards.has(guard.value)) failures.push(`Top-level guard ${guard.value} required by subtransaction ${sub.id} is missing from the top-level guards.`);
            }
        }
    }
    return { failures, inspected, id, signatures, meaning: meaning?.[3] ?? 'The wallet reported an invalid status.' };
};
