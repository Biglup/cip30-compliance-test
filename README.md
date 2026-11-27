# cip30-compliance-test
Test CIP-30 wallet APIs and transaction signing with [Cometa.js 2.0.0-rc.3](https://www.npmjs.com/package/@biglup/cometa/v/2.0.0-rc.3).

## Local / custom network

In addition to the hosted public networks (mainnet / preprod / preview),
the tool can target any Blockfrost-compatible endpoint — for example a
local [yaci-devkit](https://github.com/bloxbean/yaci-devkit) store — by
selecting the **Local / Custom devnet** network and supplying the
endpoint via URL params:

```
?network=custom&provider=http://localhost:8080/api/v1/&magic=42&networkId=0
```

- `provider` — Blockfrost-compatible base URL (no proxy, no API key)
- `magic` — Cardano network magic (defaults to `42`, yaci-devkit's devnet)
- `networkId` — CIP-30 network id, `0` for testnet (default) or `1` for mainnet

The network and wallet can also be preselected for automated runs with
`?network=…&wallet=…`.

## Dijkstra wallet tests

Connect a wallet on any network and open **Dijkstra Era**. Each feature has its
own card, inputs, transaction CBOR, result, and Build / Sign / Submit buttons.
The **Enable network submission** checkbox controls the mode:

- **Submission disabled (default):** use the connected wallet’s real UTxOs,
  addresses and current fees with protocol 12. This mode tests
  wallet parsing and signing before a network upgrade; submission stays disabled.
- **Submission enabled:** use the endpoint’s protocol
  parameters unchanged. Requires protocol 12. Build, sign and submit are separate actions.

The test cards cover direct reward-account deposits, account-to-account
transfers, execution-time and transaction-start balance constraints, key guards,
and native `RequireGuard` minting.

For account operations, use registered reward accounts. Transfers withdraw from
the wallet’s first reward account, so it must have sufficient rewards and the
wallet must sign with its staking key. Balance constraints are assertions about
ledger state, not changes to the account. Plutus transactions need a separate
collateral UTxO; collateral is excluded from normal coin selection.

**Build batch** creates 2–20 sub-transactions with one output each, paid for by
the enclosing wallet transaction. Leave the recipient blank to send to your own
change address. The entered ADA amount is the first intent’s amount; subsequent
intents add one lovelace each to keep their IDs distinct. Every intent requires
the enclosing wallet’s payment-key guard. The app displays each intent’s CBOR
and ID, then requests the wallet’s signature for the complete batch.

These are output-only intents: they need no independent input signatures.
This tests the wallet’s ability to parse and sign a nested transaction. It does
not claim support for signing standalone input-bearing sub-transactions; that
requires a wallet API beyond the Cometa browser-wallet interface.

Returned key signatures are verified against the exact transaction body and
checked for the required wallet input, collateral, guard and withdrawal keys.
Empty, invalid or incomplete signatures fail the check. Changing form values or
disconnecting invalidates the pending transaction.

For custom devnets, enter the reference Unix time in milliseconds, reference slot
and slot duration under **Custom devnet slot timing**. Use the genesis settings
of the network selected above. Public networks use their standard slot timing.

Successful construction and signing do not establish ledger acceptance. Submission requires a compatible node, provider and wallet,
and current valid inputs/account state. Check the network explorer for confirmation.

## CIP-209 tests

**CIP-209 (Dijkstra connector extension)** exercises the draft CIP-30 extension.
On connection the page requests `{ cip: 209 }` when the wallet lists it in
`supportedExtensions`, and the connection box shows whether the enabled API
carries `cip209`. Without it the section stays disabled.

- **getBalances:** optional page and limit; lists the UTxOs and the balance of
  each reward account, and shows errors with their code and info.
- **signSubTxs over built intents:** builds 1-16 subtransactions that each spend
  one ADA-only wallet UTxO and require the batcher's top-level guard, signs them
  with the chosen format argument and verifies every returned entry against the
  subtransaction id.
- **Wrap imported subtransactions:** builds the top-level transaction that
  carries subtransactions pasted from another session and signs it with plain
  `signTx`. When an imported subtransaction lacks a witness, the amended
  `signTx` must refuse with TxSignError 7.
- **balanceAndSignTx:** sends an unbalanced payment, an unbalanced wrapper or
  bare subtransactions, then checks the returned object and transaction.
- **Raw calls:** any of the four methods with JSON arguments, the raw result or
  error object, and ready-made malformed `signSubTxs` inputs.

Two-wallet flow: in wallet A's session, enter wallet B's payment address as the
batcher (the change address B's session shows after connecting), build and sign
with `signSubTxs`, and copy the signed CBOR. In wallet B's session, paste it
into the wrap card, build, and sign. B's wallet then reviews a transaction that
carries A's subtransactions. Every input must already exist on chain; a
subtransaction cannot spend an output of another one.

`balanceAndSignTx` lets the wallet submit, and the CIP gives the dApp no way to
prevent that, so those calls stay disabled until **Allow balanceAndSignTx** is
checked. **Enable network submission** in this section works as in the Dijkstra
section and applies to the two cards that use the transaction builder.

## Tests

```sh
npm ci
npm test
```

Tests use the exact published Cometa candidate and Node’s test runner. They
check encoded Dijkstra fields, native VM evaluation, balanced batches,
independent intent signatures, wallet UI state transitions and failure paths.
The CIP-209 section is tested against a mocked wallet API only.
Synthetic ledger fixtures and public test keys are confined to automated tests;
the page builds wallet transactions from the connected wallet’s UTxOs.
