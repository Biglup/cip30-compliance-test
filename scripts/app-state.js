/**
 * Centralized application state management
 */

export const state = {
    // Wallet instances
    wallet: null,           // Cometa.BrowserExtensionWallet instance
    cip30Api: null,         // Raw CIP-30 API from wallet.enable()
    provider: null,         // Cometa.BlockfrostProvider instance

    // Wallet info
    walletName: null,       // Name of connected wallet (e.g., 'lace', 'eternl')
    networkId: null,        // Network ID (0 = testnet, 1 = mainnet)

    // Addresses
    usedAddresses: [],      // Array of used addresses
    unusedAddresses: [],    // Array of unused addresses
    changeAddress: null,    // Change address
    rewardAddresses: [],    // Staking reward addresses

    // CIP-95 data
    pubDRepKey: null,
    drepRepresentations: null,  // Cached DRep ID encodings for signData() tests
    registeredPubStakeKeys: [],
    unregisteredPubStakeKeys: [],

    // Transaction state (for multi-step tx flows)
    pendingTransactions: {
        simple: null,
        self: null,
        stakeReg: null,
        stakeDereg: null,
        voteDeleg: null,
        stakeDeleg: null,
        complex: null,
    },

    // CIP extension support flags
    extensions: {
        cip95: false,
        cip142: false,
    }
};

/**
 * Update state with new values
 * @param {Object} newState - Partial state to merge
 */
export const setState = (newState) => {
    Object.assign(state, newState);
};

/**
 * Reset state to initial values
 */
export const resetState = () => {
    state.wallet = null;
    state.cip30Api = null;
    state.provider = null;
    state.walletName = null;
    state.networkId = null;
    state.usedAddresses = [];
    state.unusedAddresses = [];
    state.changeAddress = null;
    state.rewardAddresses = [];
    state.pubDRepKey = null;
    state.drepRepresentations = null;
    state.registeredPubStakeKeys = [];
    state.unregisteredPubStakeKeys = [];
    state.pendingTransactions = {
        simple: null,
        self: null,
        stakeReg: null,
        stakeDereg: null,
        voteDeleg: null,
        stakeDeleg: null,
        complex: null,
    };
    state.extensions = {
        cip95: false,
        cip142: false,
    };
};

/**
 * Set a pending transaction
 * @param {string} type - Transaction type key
 * @param {Object} tx - Transaction object
 */
export const setPendingTransaction = (type, tx) => {
    state.pendingTransactions[type] = tx;
};

/**
 * Get a pending transaction
 * @param {string} type - Transaction type key
 * @returns {Object|null} Transaction object or null
 */
export const getPendingTransaction = (type) => {
    return state.pendingTransactions[type];
};

/**
 * Clear a pending transaction
 * @param {string} type - Transaction type key
 */
export const clearPendingTransaction = (type) => {
    state.pendingTransactions[type] = null;
};
