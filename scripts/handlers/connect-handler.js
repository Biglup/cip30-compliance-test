/**
 * Wallet connection handler
 * Handles connecting to and disconnecting from CIP-30 wallets
 */

import { state, setState, resetState } from '../app-state.js';
import * as ui from '../ui.js';
import { getWalletByName, checkExtensionSupport } from '../wallet-detector.js';

// Blockfrost proxy URL (eliminates need for user API keys)
const PROXY_URL = 'https://cardano-blockfrost-proxy.arcangelz.workers.dev/';

// Network configuration
const NETWORK_CONFIG = {
    mainnet: {
        magic: Cometa.NetworkMagic.Mainnet,
        name: 'Mainnet',
        expectedNetworkId: 1,
    },
    preprod: {
        magic: Cometa.NetworkMagic.Preprod,
        name: 'Preprod Testnet',
        expectedNetworkId: 0,
    },
    preview: {
        magic: Cometa.NetworkMagic.Preview,
        name: 'Preview Testnet',
        expectedNetworkId: 0,
    },
};

/**
 * Create a Blockfrost provider for the selected network
 * @param {string} network - Network identifier (mainnet, preprod, preview)
 * @returns {Object} Cometa.BlockfrostProvider instance
 */
const createProvider = (network) => {
    const config = NETWORK_CONFIG[network];
    if (!config) {
        throw new Error(`Unknown network: ${network}`);
    }

    const baseUrl = `${PROXY_URL}${network}/`;

    return new Cometa.BlockfrostProvider({
        baseUrl,
        network: config.magic,
        projectId: '', // Using proxy, no key needed
    });
};

/**
 * Connect to the selected wallet
 * @param {string} walletName - Wallet identifier
 * @param {string} network - Selected network
 * @returns {Promise<Object>} Connection result
 */
export const connectWallet = async (walletName, network) => {
    ui.log(`Connecting to ${walletName} on ${network}...`, 'info');

    // Get wallet API
    const walletApi = getWalletByName(walletName);
    if (!walletApi) {
        throw new Error(`Wallet "${walletName}" not found`);
    }

    // Check extension support
    const extensionSupport = checkExtensionSupport(walletApi);
    ui.log(`Extension support - CIP-95: ${extensionSupport.cip95}, CIP-142: ${extensionSupport.cip142}`, 'info');

    // Build extensions array for enable()
    const extensions = [];
    if (extensionSupport.cip95) {
        extensions.push({ cip: 95 });
    }
    if (extensionSupport.cip142) {
        extensions.push({ cip: 142 });
    }

    // Enable wallet with extensions
    ui.log('Requesting wallet access...', 'info');
    let cip30Api;
    try {
        cip30Api = await walletApi.enable({
            extensions: extensions.length > 0 ? extensions : undefined,
        });
    } catch (err) {
        if (err.code === -3 || err.message?.includes('rejected')) {
            throw new Error('User rejected wallet connection');
        }
        throw err;
    }

    ui.log('Wallet access granted', 'success');

    // Create provider
    const provider = createProvider(network);
    ui.log(`Provider created for ${network}`, 'info');

    // Create Cometa wallet wrapper
    const wallet = new Cometa.BrowserExtensionWallet(cip30Api, provider);

    // Get network ID and validate
    const networkId = await wallet.getNetworkId();
    const config = NETWORK_CONFIG[network];

    if (networkId !== config.expectedNetworkId) {
        const walletNetwork = networkId === 1 ? 'mainnet' : 'testnet';
        const expectedNetwork = config.expectedNetworkId === 1 ? 'mainnet' : 'testnet';
        throw new Error(
            `Network mismatch: Wallet is on ${walletNetwork} but ${expectedNetwork} was selected. ` +
            `Please switch your wallet to the correct network.`
        );
    }

    ui.log(`Network validated: ${config.name} (ID: ${networkId})`, 'success');

    // Get initial address for display
    // Note: CIP-30 API returns hex strings, Cometa wrapper may return Address objects
    const usedAddresses = await wallet.getUsedAddresses();
    let primaryAddress = '(no used addresses)';

    if (usedAddresses && usedAddresses.length > 0) {
        const firstAddr = usedAddresses[0];
        // Handle both hex string and Address object
        if (typeof firstAddr === 'string') {
            // It's a hex string, convert to Address then to string (bech32)
            primaryAddress = Cometa.Address.fromHex(firstAddr).toString();
        } else if (firstAddr.toString) {
            // It's already an Address object
            primaryAddress = firstAddr.toString();
        } else {
            primaryAddress = String(firstAddr);
        }
    }

    // Check which CIP extensions are actually available in the enabled API
    // Log the API structure to help debug
    ui.log(`CIP-30 API keys: ${Object.keys(cip30Api || {}).join(', ')}`, 'info');
    if (cip30Api?.experimental) {
        ui.log(`Experimental keys: ${Object.keys(cip30Api.experimental).join(', ')}`, 'info');
    }
    if (cip30Api?.cip95) {
        ui.log(`CIP-95 keys: ${Object.keys(cip30Api.cip95).join(', ')}`, 'info');
    }

    const actualExtensions = {
        cip95: !!(cip30Api?.cip95 || cip30Api?.experimental?.cip95),
        cip142: !!(cip30Api?.cip142 || cip30Api?.experimental?.cip142),
    };

    if (actualExtensions.cip95) {
        ui.log('CIP-95 (Governance) extension available', 'success');
    } else {
        ui.log('CIP-95 (Governance) extension not available', 'warning');
    }

    if (actualExtensions.cip142) {
        ui.log('CIP-142 (Network Magic) extension available', 'success');
    } else {
        ui.log('CIP-142 (Network Magic) extension not available', 'warning');
    }

    // Update state
    setState({
        wallet,
        cip30Api,
        provider,
        walletName,
        networkId,
        usedAddresses,
        extensions: actualExtensions,
    });

    ui.log(`Successfully connected to ${walletName}`, 'success');

    return {
        walletName: walletApi.name || walletName,
        network: config.name,
        networkId,
        address: primaryAddress,
        extensions: actualExtensions,
    };
};

/**
 * Disconnect from the current wallet
 */
export const disconnectWallet = () => {
    ui.log('Disconnecting wallet...', 'info');
    resetState();
    ui.log('Wallet disconnected', 'info');
};

/**
 * Get current connection info
 * @returns {Object|null} Connection info or null if not connected
 */
export const getConnectionInfo = () => {
    if (!state.wallet) {
        return null;
    }

    return {
        walletName: state.walletName,
        networkId: state.networkId,
        provider: state.provider,
        extensions: state.extensions,
    };
};

/**
 * Check if wallet is connected
 * @returns {boolean} True if connected
 */
export const isConnected = () => {
    return state.wallet !== null;
};
