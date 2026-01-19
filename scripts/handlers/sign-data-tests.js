/**
 * CIP-08 Data Signing Tests
 * Tests signData() functionality for message signing
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
        return Cometa.Address.fromHex(addr).toString();
    } else if (addr.toString) {
        return addr.toString();
    }
    return String(addr);
};

/**
 * Get an Address object from either hex string or Address object
 * @param {string|Object} addr - Address as hex string or object
 * @returns {Object} Address object
 */
const getAddress = (addr) => {
    if (typeof addr === 'string') {
        return Cometa.Address.fromHex(addr);
    }
    return addr;
};

/**
 * Test signData() - CIP-08 message signing
 * @param {string} message - Message to sign (UTF-8 string)
 * @param {string} addressBech32 - Optional address to sign with
 */
export const testSignData = async (message, addressBech32 = null) => {
    ui.log(`Testing signData() with message: "${message}"`, 'info');
    ui.setTestResult('signData', 'Requesting signature...', 'pending');

    try {
        if (!message) {
            throw new Error('Message is required');
        }

        // Get address to sign with
        let address;
        let addressDisplay;
        if (addressBech32) {
            // Use provided address - fromString handles both addr... and stake... formats
            address = Cometa.Address.fromString(addressBech32);
            addressDisplay = addressBech32;
            ui.log(`Using provided address: ${addressBech32.substring(0, 30)}...`, 'info');
        } else {
            // Use first used address
            const addresses = await state.wallet.getUsedAddresses();
            if (!addresses || addresses.length === 0) {
                throw new Error('No wallet addresses available');
            }
            address = getAddress(addresses[0]);
            addressDisplay = addressToBech32(addresses[0]);
            ui.log(`Using first used address: ${addressDisplay.substring(0, 30)}...`, 'info');
        }

        // Convert message to hex payload
        const payload = Cometa.utf8ToHex(message);
        ui.log(`Payload (hex): ${payload}`, 'info');

        // Sign the data
        const result = await state.wallet.signData(address, payload);

        // Format result
        let output = `Data Signed Successfully\n\n`;
        output += `Message: "${message}"\n`;
        output += `Payload (hex): ${payload}\n\n`;

        if (result.signature) {
            output += `Signature (COSE_Sign1):\n${result.signature}\n\n`;
        }

        if (result.key) {
            output += `Key (COSE_Key):\n${result.key}\n`;
        }

        // Add verification info
        output += `\n--- Verification Info ---\n`;
        output += `Address: ${addressDisplay}\n`;

        ui.setTestResult('signData', output, 'success');
        ui.log('signData() completed successfully', 'success');

        return result;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('signData', errorMsg, 'error');
        ui.log(`signData() failed: ${err.message}`, 'error');

        // Handle specific error codes
        if (err.code === 2) {
            ui.log('User declined to sign data', 'warning');
        } else if (err.code === 3) {
            ui.log('Address does not belong to wallet', 'error');
        } else if (err.code === 1) {
            ui.log('Invalid payload or encoding error', 'error');
        }

        throw err;
    }
};

/**
 * Test signData() with various payload types
 * This can be used for more comprehensive testing
 */
export const runSignDataTests = async () => {
    ui.log('Running comprehensive signData() tests...', 'info');

    const testCases = [
        { name: 'Simple ASCII', message: 'Hello Cardano!' },
        { name: 'Unicode', message: 'Hello 世界 🌍' },
        { name: 'Empty string', message: '' },
        { name: 'Long message', message: 'A'.repeat(1000) },
        { name: 'JSON payload', message: '{"test": true, "value": 42}' },
    ];

    const results = [];

    for (const testCase of testCases) {
        ui.log(`Testing: ${testCase.name}`, 'info');

        try {
            const result = await testSignData(testCase.message);
            results.push({ ...testCase, success: true, result });
        } catch (err) {
            results.push({ ...testCase, success: false, error: err.message });

            // If user declined, stop testing
            if (err.code === 2) {
                ui.log('User declined - stopping tests', 'warning');
                break;
            }
        }
    }

    return results;
};

/**
 * Verify a signed message (client-side verification)
 * Note: Full verification requires parsing COSE structures
 * @param {string} signature - COSE_Sign1 signature
 * @param {string} key - COSE_Key public key
 * @param {string} payload - Original payload hex
 * @param {string} addressBech32 - Expected signer address
 */
export const verifySignature = async (signature, key, payload, addressBech32) => {
    ui.log('Verifying signature...', 'info');

    // Note: Full COSE verification is complex and typically done server-side
    // This is a placeholder showing what information is needed

    const info = {
        signature: signature?.substring(0, 50) + '...',
        key: key?.substring(0, 50) + '...',
        payload: payload,
        address: addressBech32,
    };

    ui.log('Verification info collected. Full verification requires COSE parsing.', 'info');

    return info;
};
