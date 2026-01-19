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

    // Build extensions array for enable()
    const extensions = [];
    if (extensionSupport.cip95) {
        extensions.push({ cip: 95 });
    }
    if (extensionSupport.cip142) {
        extensions.push({ cip: 142 });
    }

    // Enable wallet with extensions
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

    // Create provider
    const provider = createProvider(network);

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

    // Get initial address for display
    const usedAddresses = await wallet.getUsedAddresses();
    let primaryAddress = '(no used addresses)';

    if (usedAddresses && usedAddresses.length > 0) {
        const firstAddr = usedAddresses[0];
        if (typeof firstAddr === 'string') {
            primaryAddress = Cometa.Address.fromHex(firstAddr).toString();
        } else if (firstAddr.toString) {
            primaryAddress = firstAddr.toString();
        } else {
            primaryAddress = String(firstAddr);
        }
    }

    // Check which CIP extensions are actually available
    const actualExtensions = {
        cip95: !!(cip30Api?.cip95 || cip30Api?.experimental?.cip95),
        cip142: !!(cip30Api?.cip142 || cip30Api?.experimental?.cip142),
    };

    // Log connection summary
    const extList = [];
    if (actualExtensions.cip95) extList.push('CIP-95');
    if (actualExtensions.cip142) extList.push('CIP-142');
    ui.log(`Connected to ${config.name} (ID: ${networkId})${extList.length ? `, extensions: ${extList.join(', ')}` : ''}`, 'success');

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
