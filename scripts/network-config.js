/**
 * Custom / local devnet network support.
 *
 * Pure helpers (no DOM, no Cometa) for the "Local / Custom devnet"
 * network option, so the tool can target any Blockfrost-compatible
 * endpoint — e.g. a local yaci-devkit store — instead of only the
 * hosted public testnets. Configured entirely via URL params:
 *
 *   ?network=custom&provider=http://localhost:8080/api/v1/&magic=42&networkId=0
 *
 * Kept dependency-free and side-effect-free so it can be unit tested
 * with `node --test` (see test/network-config.test.js).
 */

/** Cardano testnet magic used by yaci-devkit's default devnet. */
export const DEFAULT_CUSTOM_MAGIC = 42;

/** CIP-30 networkId for a testnet (mainnet is 1). */
export const DEFAULT_CUSTOM_NETWORK_ID = 0;

/**
 * Parse the custom-network params from a URL search string.
 * @param {string} search - e.g. window.location.search
 * @returns {{ provider: string, magic: number, networkId: number }}
 */
export const getCustomNetworkParams = (
  search = typeof window === 'undefined' ? '' : window.location.search,
) => {
  const params = new URLSearchParams(search);
  const magic = params.get('magic');
  const networkId = params.get('networkId');
  return {
    provider: params.get('provider') || '',
    magic: magic === null ? DEFAULT_CUSTOM_MAGIC : Number(magic),
    networkId: networkId === null ? DEFAULT_CUSTOM_NETWORK_ID : Number(networkId),
  };
};

/**
 * Normalize a provider base URL to a single trailing slash, as the
 * Blockfrost provider expects.
 * @param {string} provider
 * @returns {string}
 */
export const normalizeProviderUrl = provider =>
  provider.endsWith('/') ? provider : `${provider}/`;
