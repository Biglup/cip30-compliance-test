/**
 * Wallet detection utilities
 * Detects all CIP-30 compliant wallets injected into window.cardano
 */

import * as ui from './ui.js';

// Known wallet identifiers and display names
const KNOWN_WALLETS = {
    lace: 'Lace',
    eternl: 'Eternl',
    nami: 'Nami',
    flint: 'Flint',
    typhon: 'Typhon',
    gerowallet: 'GeroWallet',
    nufi: 'NuFi',
    vespr: 'Vespr',
    begin: 'Begin',
    yoroi: 'Yoroi',
    exodus: 'Exodus',
    tokeo: 'Tokeo',
};

// Properties that are NOT wallets in window.cardano
const NON_WALLET_KEYS = ['ccvault', '_call', '_events'];

/**
 * Check if an object is a CIP-30 wallet API
 * @param {Object} obj - Object to check
 * @returns {boolean} True if it appears to be a wallet
 */
const isWalletApi = (obj) => {
    if (!obj || typeof obj !== 'object') return false;

    // CIP-30 wallets must have these properties
    return (
        typeof obj.enable === 'function' &&
        typeof obj.name === 'string' &&
        typeof obj.apiVersion === 'string'
    );
};

/**
 * Get display name for a wallet
 * @param {string} name - Wallet identifier
 * @returns {string} Display name
 */
const getDisplayName = (name) => {
    // Check known wallets first
    if (KNOWN_WALLETS[name.toLowerCase()]) {
        return KNOWN_WALLETS[name.toLowerCase()];
    }

    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
};

/**
 * Detect all CIP-30 wallets in window.cardano
 * @returns {Array} Array of wallet objects
 */
export const detectWallets = (silent = false) => {
    const wallets = [];

    if (!window.cardano) {
        return wallets;
    }

    for (const key of Object.keys(window.cardano)) {
        // Skip known non-wallet keys
        if (NON_WALLET_KEYS.includes(key)) continue;

        try {
            const walletApi = window.cardano[key];

            if (isWalletApi(walletApi)) {
                const wallet = {
                    name: key,
                    displayName: walletApi.name || getDisplayName(key),
                    apiVersion: walletApi.apiVersion || 'unknown',
                    icon: walletApi.icon || null,
                    api: walletApi,
                };

                wallets.push(wallet);
            }
        } catch (err) {
            // Skip problematic entries silently
        }
    }

    return wallets;
};

/**
 * Wait for wallets to be injected (some wallets inject slowly)
 * @param {number} timeout - Maximum wait time in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<Array>} Array of wallet objects
 */
export const waitForWallets = (timeout = 3000, interval = 100) => {
    return new Promise((resolve) => {
        let elapsed = 0;
        let lastCount = 0;

        const check = () => {
            const wallets = detectWallets();

            // If we have wallets and count is stable, resolve
            if (wallets.length > 0 && wallets.length === lastCount) {
                resolve(wallets);
                return;
            }

            lastCount = wallets.length;
            elapsed += interval;

            if (elapsed >= timeout) {
                resolve(wallets);
                return;
            }

            setTimeout(check, interval);
        };

        check();
    });
};

/**
 * Get a specific wallet API by name
 * @param {string} name - Wallet identifier
 * @returns {Object|null} Wallet API or null
 */
export const getWalletByName = (name) => {
    if (!window.cardano || !window.cardano[name]) {
        return null;
    }

    const walletApi = window.cardano[name];

    if (isWalletApi(walletApi)) {
        return walletApi;
    }

    return null;
};

/**
 * Check if a wallet supports specific CIP extensions
 * @param {Object} walletApi - Wallet API object
 * @returns {Object} Object with extension support flags
 */
export const checkExtensionSupport = (walletApi) => {
    const support = {
        cip95: false,
        cip142: false,
    };

    if (!walletApi || !walletApi.supportedExtensions) {
        return support;
    }

    const extensions = walletApi.supportedExtensions;

    if (Array.isArray(extensions)) {
        support.cip95 = extensions.some(ext => ext.cip === 95);
        support.cip142 = extensions.some(ext => ext.cip === 142);
    }

    return support;
};
