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
 * Get the CIP-95 API from the connected wallet
 * @returns {Object|null} CIP-95 API object or null
 */
const getCip95Api = () => {
    if (!state.cip30Api) return null;
    return state.cip30Api.cip95 || state.cip30Api.experimental?.cip95 || null;
};

/**
 * The DRep ID representations that wallets may accept for signData().
 * CIP-95 originally only mandated the CIP-105 hex key hash, but most wallets
 * now accept the richer encodings below for ecosystem parity.
 */
export const DREP_SIGN_FORMATS = [
    { key: 'cip129Bech32', label: 'CIP-129 Bech32 DRep ID' },
    { key: 'cip129Hex', label: 'CIP-129 Hex DRep ID' },
    { key: 'cip105Bech32', label: 'Legacy CIP-105 Bech32 DRep ID' },
    { key: 'cip105Hex', label: 'Legacy CIP-105 Hex DRep ID' },
    { key: 'type6Address', label: 'Type-6 Address (enterprise, key hash)' },
];

/**
 * Compute every supported DRep ID representation from the wallet's DRep key.
 *
 * All representations encode the same Blake2b-224 DRep key hash; they only
 * differ in framing (network/credential prefix byte) and encoding (hex vs bech32):
 *  - CIP-129 prefixes the key hash with a header byte (0x22 = DRep key hash)
 *  - CIP-105 (legacy) encodes the bare key hash
 *  - Type-6 is a Shelley enterprise address whose first byte is ignored
 *
 * @returns {Promise<Object>} Map of format key -> { value, description }
 */
export const computeDRepRepresentations = async () => {
    ui.log('Computing DRep ID representations...', 'info');
    ui.setTestResult('drepSign', 'Reading DRep key from wallet...', 'pending');

    const cip95 = getCip95Api();
    if (!cip95) {
        const msg = 'CIP-95 extension not available.\n\nThis wallet does not expose a DRep key.';
        ui.setTestResult('drepSign', msg, 'warning');
        ui.log('CIP-95 not available - cannot compute DRep IDs', 'warning');
        return null;
    }

    const pubDRepKey = state.pubDRepKey || (await cip95.getPubDRepKey());
    if (!pubDRepKey) {
        const msg = 'No DRep key returned by the wallet.';
        ui.setTestResult('drepSign', msg, 'warning');
        ui.log('getPubDRepKey() returned null - cannot compute DRep IDs', 'warning');
        return null;
    }
    state.pubDRepKey = pubDRepKey;

    // Blake2b-224 DRep key hash (28 bytes) - the common payload for every format
    const keyHashHex = Cometa.Ed25519PublicKey.fromHex(pubDRepKey).toHashHex();
    const credential = { hash: keyHashHex, type: Cometa.CredentialType.KeyHash };

    // CIP-129 hex = 0x22 header byte (DRep key-hash credential) + key hash
    const cip129HeaderByte = '22';
    // Type-6 enterprise address scoped to the wallet's network (0 = testnet, 1 = mainnet)
    const networkId = state.networkId ?? 0;
    const type6AddressHex = Cometa.EnterpriseAddress
        .fromCredentials(networkId, credential)
        .toAddress()
        .toHex();

    const representations = {
        cip129Bech32: {
            value: Cometa.cip129DRepFromCredential(credential),
            description: 'CIP-129 bech32 (drep1y...) - header byte + key hash, bech32 encoded',
        },
        cip129Hex: {
            value: cip129HeaderByte + keyHashHex,
            description: 'CIP-129 hex - 0x22 header byte prefixed to the key hash',
        },
        cip105Bech32: {
            value: Cometa.cip105DRepFromCredential(credential),
            description: 'Legacy CIP-105 bech32 (drep1...) - bare key hash, bech32 encoded',
        },
        cip105Hex: {
            value: keyHashHex,
            description: 'Legacy CIP-105 hex - the raw Blake2b-224 key hash digest',
        },
        type6Address: {
            value: type6AddressHex,
            description: 'Type-6 Shelley enterprise address - first byte is ignored, key hash reused',
        },
    };

    state.drepRepresentations = representations;

    let output = `DRep Key (hex):\n${pubDRepKey}\n\n`;
    output += `DRep Key Hash (Blake2b-224):\n${keyHashHex}\n\n`;
    output += `--- DRep ID Representations ---\n`;
    for (const { key, label } of DREP_SIGN_FORMATS) {
        output += `\n${label}:\n${representations[key].value}\n`;
    }
    output += `\nPick a representation below to sign the message with signData().`;

    ui.setTestResult('drepSign', output, 'success');
    ui.log('Computed DRep ID representations successfully', 'success');

    return representations;
};

/**
 * Sign the CIP-08 message with a specific DRep ID representation.
 *
 * The chosen representation is passed verbatim to the wallet's signData() so we
 * can verify the wallet accepts that encoding for DRep signing.
 *
 * @param {string} formatKey - One of DREP_SIGN_FORMATS keys
 * @param {string} message - Message to sign (UTF-8 string)
 */
export const signDataWithDRep = async (formatKey, message) => {
    const format = DREP_SIGN_FORMATS.find((f) => f.key === formatKey);
    const label = format ? format.label : formatKey;

    ui.log(`Testing signData() with ${label}...`, 'info');
    ui.setTestResult('drepSign', `Requesting signature with ${label}...`, 'pending');

    try {
        // Ensure representations are available (compute lazily on first use)
        let representations = state.drepRepresentations;
        if (!representations) {
            representations = await computeDRepRepresentations();
            if (!representations) return null;
        }

        const representation = representations[formatKey];
        if (!representation) {
            throw new Error(`Unknown DRep ID format: ${formatKey}`);
        }

        const drepId = representation.value;
        const payload = Cometa.utf8ToHex(message ?? '');
        ui.log(`DRep ID (${label}): ${drepId}`, 'info');
        ui.log(`Payload (hex): ${payload}`, 'info');

        // Pass the DRep ID straight to the raw CIP-30 signData so the wallet
        // sees the exact encoding under test (the Cometa wrapper expects an Address).
        const result = await state.cip30Api.signData(drepId, payload);

        let output = `Data Signed Successfully with DRep ID\n\n`;
        output += `Format: ${label}\n`;
        output += `DRep ID: ${drepId}\n`;
        output += `Message: "${message}"\n`;
        output += `Payload (hex): ${payload}\n\n`;

        if (result.signature) {
            output += `Signature (COSE_Sign1):\n${result.signature}\n\n`;
        }
        if (result.key) {
            output += `Key (COSE_Key):\n${result.key}\n`;
        }

        ui.setTestResult('drepSign', output, 'success');
        ui.log(`signData() with ${label} completed successfully`, 'success');

        return result;
    } catch (err) {
        const errorMsg = `Sign with ${label} failed: ${err.message}`;
        ui.setTestResult('drepSign', errorMsg, 'error');
        ui.log(`signData() with ${label} failed: ${err.message}`, 'error');

        if (err.code === 2) {
            ui.log('User declined to sign data', 'warning');
        } else if (err.code === 3) {
            ui.log('Wallet rejected the DRep ID (does not belong to wallet or unsupported encoding)', 'error');
        } else if (err.code === 1) {
            ui.log('Invalid payload or encoding error', 'error');
        }

        throw err;
    }
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
