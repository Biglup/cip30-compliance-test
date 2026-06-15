# cip30-compliance-test
Simple tool to test CIP-30 compliance test for wallets

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

## Tests

Pure helpers are covered by unit tests using Node's built-in test runner
(no dependencies to install):

```
npm test
```
