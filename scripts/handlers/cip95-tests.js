/**
 * CIP-95 Governance Method Tests
 * Tests Voltaire era governance extensions
 */

import { state } from '../app-state.js';
import * as ui from '../ui.js';

/**
 * Get the CIP-95 API from the wallet
 * @returns {Object|null} CIP-95 API object or null
 */
const getCip95Api = () => {
    if (!state.cip30Api) return null;

    // Try standard location first, then experimental
    return state.cip30Api.cip95 || state.cip30Api.experimental?.cip95 || null;
};

/**
 * Test getPubDRepKey()
 * Returns the public DRep key
 */
export const testGetPubDRepKey = async () => {
    ui.log('Testing cip95.getPubDRepKey()...', 'info');

    const cip95 = getCip95Api();

    if (!cip95) {
        ui.setTestResult('getPubDRepKey', 'CIP-95 extension not available.\n\nThis wallet does not support governance features.', 'warning');
        ui.log('CIP-95 not available - skipping getPubDRepKey()', 'warning');
        return null;
    }

    try {
        const pubDRepKey = await cip95.getPubDRepKey();

        if (!pubDRepKey) {
            ui.setTestResult('getPubDRepKey', 'No DRep key returned.\n\nThe wallet may not have a DRep key configured.', 'warning');
            ui.log('getPubDRepKey() returned null/undefined', 'warning');
            return null;
        }

        let result = `Public DRep Key (hex):\n${pubDRepKey}`;

        // Try to derive the DRep ID if possible
        try {
            const pubKey = Cometa.Ed25519PublicKey.fromHex(pubDRepKey);
            const keyHash = pubKey.toHashHex();
            result += `\n\nKey Hash:\n${keyHash}`;
        } catch {
            // Ignore if derivation fails
        }

        ui.setTestResult('getPubDRepKey', result, 'success');
        ui.log(`getPubDRepKey() returned: ${pubDRepKey.substring(0, 32)}...`, 'success');

        // Update state
        state.pubDRepKey = pubDRepKey;

        return pubDRepKey;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getPubDRepKey', errorMsg, 'error');
        ui.log(`getPubDRepKey() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getRegisteredPubStakeKeys()
 * Returns registered public stake keys
 */
export const testGetRegisteredPubStakeKeys = async () => {
    ui.log('Testing cip95.getRegisteredPubStakeKeys()...', 'info');

    const cip95 = getCip95Api();

    if (!cip95) {
        ui.setTestResult('getRegisteredPubStakeKeys', 'CIP-95 extension not available.\n\nThis wallet does not support governance features.', 'warning');
        ui.log('CIP-95 not available - skipping getRegisteredPubStakeKeys()', 'warning');
        return null;
    }

    try {
        const stakeKeys = await cip95.getRegisteredPubStakeKeys();

        if (!stakeKeys || stakeKeys.length === 0) {
            ui.setTestResult('getRegisteredPubStakeKeys', 'No registered stake keys found.\n\nYour stake address may not be registered on-chain.', 'warning');
            ui.log('getRegisteredPubStakeKeys() returned: 0 keys', 'warning');
            return [];
        }

        let result = `Registered Stake Keys: ${stakeKeys.length}\n\n`;
        stakeKeys.forEach((key, i) => {
            result += `${i + 1}. ${key.substring(0, 32)}...\n`;

            // Try to derive key hash
            try {
                const pubKey = Cometa.Ed25519PublicKey.fromHex(key);
                const keyHash = pubKey.toHashHex();
                result += `   Hash: ${keyHash.substring(0, 32)}...\n`;
            } catch {
                // Ignore
            }
        });

        ui.setTestResult('getRegisteredPubStakeKeys', result, 'success');
        ui.log(`getRegisteredPubStakeKeys() returned: ${stakeKeys.length} key(s)`, 'success');

        // Update state
        state.registeredPubStakeKeys = stakeKeys;

        return stakeKeys;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getRegisteredPubStakeKeys', errorMsg, 'error');
        ui.log(`getRegisteredPubStakeKeys() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getUnregisteredPubStakeKeys()
 * Returns unregistered public stake keys
 */
export const testGetUnregisteredPubStakeKeys = async () => {
    ui.log('Testing cip95.getUnregisteredPubStakeKeys()...', 'info');

    const cip95 = getCip95Api();

    if (!cip95) {
        ui.setTestResult('getUnregisteredPubStakeKeys', 'CIP-95 extension not available.\n\nThis wallet does not support governance features.', 'warning');
        ui.log('CIP-95 not available - skipping getUnregisteredPubStakeKeys()', 'warning');
        return null;
    }

    try {
        const stakeKeys = await cip95.getUnregisteredPubStakeKeys();

        if (!stakeKeys || stakeKeys.length === 0) {
            ui.setTestResult('getUnregisteredPubStakeKeys', 'No unregistered stake keys found.\n\nAll stake keys are registered, or no stake keys exist.', 'success');
            ui.log('getUnregisteredPubStakeKeys() returned: 0 keys', 'info');
            return [];
        }

        let result = `Unregistered Stake Keys: ${stakeKeys.length}\n\n`;
        stakeKeys.forEach((key, i) => {
            result += `${i + 1}. ${key.substring(0, 32)}...\n`;

            // Try to derive key hash
            try {
                const pubKey = Cometa.Ed25519PublicKey.fromHex(key);
                const keyHash = pubKey.toHashHex();
                result += `   Hash: ${keyHash.substring(0, 32)}...\n`;
            } catch {
                // Ignore
            }
        });

        ui.setTestResult('getUnregisteredPubStakeKeys', result, 'success');
        ui.log(`getUnregisteredPubStakeKeys() returned: ${stakeKeys.length} key(s)`, 'success');

        // Update state
        state.unregisteredPubStakeKeys = stakeKeys;

        return stakeKeys;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getUnregisteredPubStakeKeys', errorMsg, 'error');
        ui.log(`getUnregisteredPubStakeKeys() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getNetworkMagic() (CIP-142)
 * Returns the network magic number
 */
export const testGetNetworkMagic = async () => {
    ui.log('Testing cip142.getNetworkMagic()...', 'info');

    // Check for CIP-142 API
    const cip142 = state.cip30Api?.cip142 || state.cip30Api?.experimental?.cip142;

    if (!cip142) {
        ui.setTestResult('getNetworkMagic', 'CIP-142 extension not available.\n\nThis wallet does not support the network magic extension.', 'warning');
        ui.log('CIP-142 not available - skipping getNetworkMagic()', 'warning');
        return null;
    }

    try {
        const networkMagic = await cip142.getNetworkMagic();

        // Map known network magics
        const knownMagics = {
            764824073: 'Mainnet',
            1: 'Preprod',
            2: 'Preview',
            4: 'Sanchonet',
        };

        const networkName = knownMagics[networkMagic] || 'Unknown';

        let result = `Network Magic: ${networkMagic}\nNetwork: ${networkName}`;

        ui.setTestResult('getNetworkMagic', result, 'success');
        ui.log(`getNetworkMagic() returned: ${networkMagic} (${networkName})`, 'success');

        return networkMagic;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getNetworkMagic', errorMsg, 'error');
        ui.log(`getNetworkMagic() failed: ${err.message}`, 'error');
        throw err;
    }
};
