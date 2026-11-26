/** Local-only CIP-209 fixtures: a stand-in for a wallet that signs with the public test key. */
import { splitSubTransaction, transactionId } from '../../scripts/cip209.js';
import { localContext } from './dijkstra-local.js';

export const fixtureKey = (C, byte = '01') => C.Ed25519PrivateKey.fromNormalHex(byte.repeat(32));
export const addressOf = (C, key) => C.EnterpriseAddress.fromCredentials(C.NetworkId.Testnet,
    { type: C.CredentialType.KeyHash, hash: key.getPublicKey().toHashHex() }).toAddress().toString();

/** A context whose wallet holds several ADA-only UTxOs, so each intent can spend its own. */
export const walletContext = (C, count = 4) => {
    const context = localContext(C);
    const utxo = index => ({ input: { txId: '03'.repeat(32), index }, output: { address: context.address, value: { coins: 20_000_000n + BigInt(index) } } });
    return { ...context, collateral: [], utxos: [...context.utxos, ...Array.from({ length: count }, (_, index) => utxo(index))] };
};

const witness = (C, key, id) => ({ vkey: key.getPublicKey().toHex(), signature: key.sign(C.hexToUint8Array(id)).toHex() });
export const signSubTx = (C, cbor, key = fixtureKey(C)) => C.applySubTransactionWitnesses(cbor, [witness(C, key, C.getSubTransactionId(cbor))]);
export const witnessSetOf = (C, cbor, key) => splitSubTransaction(C, signSubTx(C, cbor, key)).witnessSet;
export const signTx = (C, cbor, key = fixtureKey(C)) => C.applyVkeyWitnessSet(cbor, [witness(C, key, transactionId(C, cbor))]);
/** The witness set signTx would return for a top-level transaction. */
export const txWitnessSet = (C, cbor, key = fixtureKey(C)) => {
    const { vkey, signature } = witness(C, key, transactionId(C, cbor));
    return `a100d9010281825820${vkey}5840${signature}`;
};
/** A `transaction_unspent_output` as getUtxos and getBalances return it. */
export const utxoCbor = (C, utxo) => `82825820${utxo.input.txId}${utxo.input.index.toString(16).padStart(2, '0')}`
    + `a200${C.Address.fromString(utxo.output.address).toHex().length === 58 ? '581d' : '5839'}${C.Address.fromString(utxo.output.address).toHex()}011a${utxo.output.value.coins.toString(16).padStart(8, '0')}`;
