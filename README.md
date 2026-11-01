# cip30-compliance-test
Test CIP-30 wallet APIs and transaction signing with [Cometa.js 2.0.0-rc.2](https://www.npmjs.com/package/@biglup/cometa/v/2.0.0-rc.2).

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
transfers, execution-time and block-start balance constraints, key guards,
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

## Tests

```sh
npm ci
npm test
```

Tests use the exact published Cometa candidate and Node’s test runner. They
check encoded Dijkstra fields, native VM evaluation, balanced batches,
independent intent signatures, wallet UI state transitions and failure paths.
Synthetic ledger fixtures and public test keys are confined to automated tests;
the page builds wallet transactions from the connected wallet’s UTxOs.
