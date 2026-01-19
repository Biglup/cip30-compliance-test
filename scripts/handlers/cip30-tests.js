/**
 * CIP-30 Basic Method Tests
 * Tests core CIP-30 wallet API methods
 */

import { state } from '../app-state.js';
import * as ui from '../ui.js';

/**
 * Convert an address to bech32 format
 * Handles both hex strings and Address objects
 * @param {string|Object} addr - Address as hex string or Address object
 * @returns {string} Bech32 address string
 */
const addressToBech32 = (addr) => {
    if (typeof addr === 'string') {
        // Check if it's already bech32 (starts with addr)
        if (addr.startsWith('addr')) {
            return addr;
        }
        // Try to parse as hex
        try {
            return Cometa.Address.fromHex(addr).toString();
        } catch (e) {
            console.error('Failed to parse address from hex:', e);
            return addr; // Return as-is
        }
    } else if (addr?.toString) {
        return addr.toString();
    }
    return String(addr);
};

/**
 * Convert a reward address to bech32 format
 * Handles hex strings, bech32 strings, and RewardAddress objects
 * @param {string|Object} addr - Reward address
 * @returns {string} Bech32 address string
 */
const rewardAddressToBech32 = (addr) => {
    if (typeof addr === 'string') {
        // Check if it's already bech32 (starts with stake)
        if (addr.startsWith('stake')) {
            return addr;
        }
        // Convert hex to bech32 using Address then asReward()
        try {
            const address = Cometa.Address.fromHex(addr);
            const rewardAddr = address.asReward();
            if (rewardAddr) {
                return rewardAddr.toBech32(); // RewardAddress uses toBech32()
            }
            return address.toString(); // Regular Address uses toString()
        } catch (e) {
            // Return hex as-is if conversion fails
            return addr;
        }
    } else if (addr?.asReward) {
        // It's an Address object, convert to RewardAddress first
        const rewardAddr = addr.asReward();
        if (rewardAddr) {
            return rewardAddr.toBech32(); // RewardAddress uses toBech32()
        }
        return addr.toString?.() || String(addr);
    } else if (addr?.toBech32) {
        // It's already a RewardAddress object
        return addr.toBech32();
    }
    return String(addr);
};

/**
 * Test getNetworkId()
 * Returns 0 for testnet, 1 for mainnet
 */
export const testGetNetworkId = async () => {
    ui.log('Testing getNetworkId()...', 'info');

    try {
        const networkId = await state.wallet.getNetworkId();
        const networkName = networkId === 1 ? 'Mainnet' : 'Testnet';

        const result = `Network ID: ${networkId}\nNetwork: ${networkName}`;
        ui.setTestResult('getNetworkId', result, 'success');
        ui.log(`getNetworkId() returned: ${networkId} (${networkName})`, 'success');

        return networkId;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getNetworkId', errorMsg, 'error');
        ui.log(`getNetworkId() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getBalance()
 * Uses Cometa's BrowserExtensionWallet which handles CBOR decoding
 */
export const testGetBalance = async () => {
    ui.log('Testing getBalance()...', 'info');

    try {
        const balance = await state.wallet.getBalance();
        ui.logJson('Balance', balance);

        // Extract lovelace - Cometa uses "coins" as a string
        let lovelace = 0n;
        if (typeof balance === 'bigint') {
            lovelace = balance;
        } else if (typeof balance === 'number') {
            lovelace = BigInt(balance);
        } else if (balance?.coins !== undefined) {
            lovelace = BigInt(balance.coins);
        } else if (balance?.lovelace !== undefined) {
            lovelace = BigInt(balance.lovelace);
        } else if (balance?.coin !== undefined) {
            lovelace = BigInt(balance.coin);
        }

        // Extract assets - Cometa returns assets as an object/map, not array
        // Format: { "policyId+assetName": "amount" }
        let assetsMap = balance?.assets || balance?.multiAsset || {};
        let assetsList = [];

        if (assetsMap && typeof assetsMap === 'object' && !Array.isArray(assetsMap)) {
            // Convert map to array for display
            for (const [key, amount] of Object.entries(assetsMap)) {
                // Key format is policyId (56 chars) + assetName (hex)
                const policyId = key.substring(0, 56);
                const assetNameHex = key.substring(56);
                // Try to decode asset name from hex
                let assetName = assetNameHex;
                try {
                    assetName = new TextDecoder().decode(Cometa.hexToUint8Array(assetNameHex));
                } catch {
                    // Keep hex if decode fails
                }
                assetsList.push({ policyId, assetName, amount: BigInt(amount) });
            }
        } else if (Array.isArray(assetsMap)) {
            assetsList = assetsMap;
        }

        // Format lovelace as ADA
        const ada = Number(lovelace) / 1_000_000;

        let result = `Lovelace: ${lovelace.toString()}\nADA: ${ada.toFixed(6)}`;

        // Check for native assets
        if (assetsList.length > 0) {
            result += `\n\nNative Assets (${assetsList.length}):`;
            assetsList.slice(0, 5).forEach(asset => {
                const policyId = (asset.policyId || '').substring(0, 16);
                const name = asset.assetName || '';
                const amount = asset.amount || 0;
                result += `\n  - ${policyId}...${name}: ${amount}`;
            });
            if (assetsList.length > 5) {
                result += `\n  ... and ${assetsList.length - 5} more`;
            }
        } else {
            result += '\n\nNo native assets';
        }

        ui.setTestResult('getBalance', result, 'success');
        ui.log(`getBalance() returned: ${ada.toFixed(6)} ADA + ${assetsList.length} assets`, 'success');

        return balance;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getBalance', errorMsg, 'error');
        ui.log(`getBalance() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getUtxos()
 * Uses Cometa's BrowserExtensionWallet which handles CBOR decoding
 */
export const testGetUtxos = async () => {
    ui.log('Testing getUtxos()...', 'info');

    try {
        // Use Cometa wallet wrapper - it returns proper UTxO objects
        const utxos = await state.wallet.getUnspentOutputs();

        if (!utxos || utxos.length === 0) {
            ui.setTestResult('getUtxos', 'No UTxOs found', 'warning');
            ui.log('getUtxos() returned: 0 UTxOs', 'warning');
            return [];
        }

        ui.logJson('UTxOs', utxos);

        let result = `Total UTxOs: ${utxos.length}\n`;

        // Calculate total lovelace - try various property paths
        let totalLovelace = 0n;
        utxos.forEach(utxo => {
            // Try different paths to find coins/lovelace
            const lovelace =
                utxo.output?.value?.coins ||
                utxo.output?.value?.lovelace ||
                utxo.output?.coins ||
                utxo.value?.coins ||
                utxo.value?.lovelace ||
                utxo.coins ||
                0;
            totalLovelace += BigInt(lovelace);
        });

        const totalAda = Number(totalLovelace) / 1_000_000;
        result += `Total Value: ${totalAda.toFixed(6)} ADA\n\n`;

        // Show first few UTxOs
        result += `First ${Math.min(3, utxos.length)} UTxOs:`;
        utxos.slice(0, 3).forEach((utxo, i) => {
            const txHash = (utxo.input?.txId || utxo.input?.transactionId || utxo.txId || 'unknown').substring(0, 16);
            const index = utxo.input?.index ?? utxo.input?.outputIndex ?? utxo.index ?? 0;
            const lovelace =
                utxo.output?.value?.coins ||
                utxo.output?.value?.lovelace ||
                utxo.output?.coins ||
                utxo.value?.coins ||
                0;
            const ada = Number(lovelace) / 1_000_000;
            result += `\n${i + 1}. ${txHash}...#${index}: ${ada.toFixed(6)} ADA`;
        });

        if (utxos.length > 3) {
            result += `\n... and ${utxos.length - 3} more UTxOs`;
        }

        ui.setTestResult('getUtxos', result, 'success');
        ui.log(`getUtxos() returned: ${utxos.length} UTxOs (${totalAda.toFixed(6)} ADA total)`, 'success');

        return utxos;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getUtxos', errorMsg, 'error');
        ui.log(`getUtxos() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getCollateral()
 * Returns UTxOs suitable for Plutus script collateral
 */
export const testGetCollateral = async () => {
    ui.log('Testing getCollateral()...', 'info');

    try {
        // Use raw CIP-30 API for collateral since Cometa may not expose it directly
        const collateralCbor = await state.cip30Api.getCollateral?.();

        if (!collateralCbor || collateralCbor.length === 0) {
            ui.setTestResult('getCollateral', 'No collateral UTxOs set.\n\nHint: Configure collateral in your wallet settings for Plutus script interactions.', 'warning');
            ui.log('getCollateral() returned: No collateral', 'warning');
            return null;
        }

        let result = `Collateral UTxOs: ${collateralCbor.length}\n\n`;
        result += `Raw CBOR (first UTxO):\n${collateralCbor[0]?.substring(0, 100)}...`;

        ui.setTestResult('getCollateral', result, 'success');
        ui.log(`getCollateral() returned: ${collateralCbor.length} collateral UTxO(s)`, 'success');

        return collateralCbor;
    } catch (err) {
        if (err.code === -4 || err.message?.includes('not supported')) {
            ui.setTestResult('getCollateral', 'getCollateral() not supported by this wallet', 'warning');
            ui.log('getCollateral() not supported', 'warning');
            return null;
        }

        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getCollateral', errorMsg, 'error');
        ui.log(`getCollateral() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getUsedAddresses()
 * Returns previously used addresses
 */
export const testGetUsedAddresses = async () => {
    ui.log('Testing getUsedAddresses()...', 'info');

    try {
        const addresses = await state.wallet.getUsedAddresses();

        if (!addresses || addresses.length === 0) {
            ui.setTestResult('getUsedAddresses', 'No used addresses found', 'warning');
            ui.log('getUsedAddresses() returned: 0 addresses', 'warning');
            return [];
        }

        let result = `Used Addresses: ${addresses.length}\n\n`;
        addresses.slice(0, 5).forEach((addr, i) => {
            const bech32 = addressToBech32(addr);
            result += `${i + 1}. ${bech32.substring(0, 40)}...\n`;
        });

        if (addresses.length > 5) {
            result += `\n... and ${addresses.length - 5} more`;
        }

        ui.setTestResult('getUsedAddresses', result, 'success');
        ui.log(`getUsedAddresses() returned: ${addresses.length} address(es)`, 'success');

        // Update state
        state.usedAddresses = addresses;

        return addresses;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getUsedAddresses', errorMsg, 'error');
        ui.log(`getUsedAddresses() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getUnusedAddresses()
 * Returns fresh unused addresses
 */
export const testGetUnusedAddresses = async () => {
    ui.log('Testing getUnusedAddresses()...', 'info');

    try {
        const addresses = await state.wallet.getUnusedAddresses();

        if (!addresses || addresses.length === 0) {
            ui.setTestResult('getUnusedAddresses', 'No unused addresses available.\n\nNote: Some wallets only return unused addresses on demand.', 'warning');
            ui.log('getUnusedAddresses() returned: 0 addresses', 'warning');
            return [];
        }

        let result = `Unused Addresses: ${addresses.length}\n\n`;
        addresses.slice(0, 5).forEach((addr, i) => {
            const bech32 = addressToBech32(addr);
            result += `${i + 1}. ${bech32.substring(0, 40)}...\n`;
        });

        if (addresses.length > 5) {
            result += `\n... and ${addresses.length - 5} more`;
        }

        ui.setTestResult('getUnusedAddresses', result, 'success');
        ui.log(`getUnusedAddresses() returned: ${addresses.length} address(es)`, 'success');

        // Update state
        state.unusedAddresses = addresses;

        return addresses;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getUnusedAddresses', errorMsg, 'error');
        ui.log(`getUnusedAddresses() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getChangeAddress()
 * Returns the change address for transactions
 */
export const testGetChangeAddress = async () => {
    ui.log('Testing getChangeAddress()...', 'info');

    try {
        const address = await state.wallet.getChangeAddress();

        const bech32 = addressToBech32(address);

        let result = `Change Address:\n${bech32}`;

        ui.setTestResult('getChangeAddress', result, 'success');
        ui.log(`getChangeAddress() returned: ${bech32.substring(0, 40)}...`, 'success');

        // Update state
        state.changeAddress = address;

        return address;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getChangeAddress', errorMsg, 'error');
        ui.log(`getChangeAddress() failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Test getRewardAddresses()
 * Returns staking reward addresses
 * Uses raw CIP-30 API to avoid Cometa conversion issues
 */
export const testGetRewardAddresses = async () => {
    ui.log('Testing getRewardAddresses()...', 'info');

    try {
        // Use raw CIP-30 API to get hex strings directly
        const addressesHex = await state.cip30Api.getRewardAddresses();

        if (!addressesHex || addressesHex.length === 0) {
            ui.setTestResult('getRewardAddresses', 'No reward addresses found.\n\nNote: This may indicate no stake key is associated with the wallet.', 'warning');
            ui.log('getRewardAddresses() returned: 0 addresses', 'warning');
            return [];
        }

        let result = `Reward Addresses: ${addressesHex.length}\n\n`;
        const convertedAddresses = [];

        addressesHex.forEach((addrHex, i) => {
            let bech32 = addrHex;

            // Convert hex to bech32
            // Reward addresses start with e0 (testnet) or e1 (mainnet)
            // We need to use Address.fromHex() then asReward() to get proper stake_test1.../stake1... bech32
            try {
                const addr = Cometa.Address.fromHex(addrHex);
                // Convert to RewardAddress to get proper bech32 prefix
                const rewardAddr = addr.asReward();
                if (rewardAddr) {
                    bech32 = rewardAddr.toBech32(); // RewardAddress uses toBech32()
                } else {
                    // Fallback to generic toString for regular Address
                    bech32 = addr.toString();
                }
            } catch (e) {
                ui.log(`Failed to convert reward address ${i}: ${e.message}`, 'warning');
                // Keep hex if conversion fails
            }

            convertedAddresses.push(bech32);
            result += `${i + 1}. ${bech32}\n`;
        });

        ui.setTestResult('getRewardAddresses', result, 'success');
        ui.log(`getRewardAddresses() returned: ${addressesHex.length} address(es)`, 'success');

        // Update state with converted addresses
        state.rewardAddresses = convertedAddresses;

        return convertedAddresses;
    } catch (err) {
        const errorMsg = `Error: ${err.message}`;
        ui.setTestResult('getRewardAddresses', errorMsg, 'error');
        ui.log(`getRewardAddresses() failed: ${err.message}`, 'error');
        throw err;
    }
};
