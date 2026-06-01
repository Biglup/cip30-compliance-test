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

        // Verify the returned signature against the COSE_Key, client-side
        const verification = buildVerificationReport(result, payload);
        output += verification.text;

        ui.setTestResult('signData', output, verification.valid === false ? 'error' : 'success');
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

        // Verify the returned signature against the COSE_Key, client-side
        const verification = buildVerificationReport(result, payload);
        output += verification.text;

        ui.setTestResult('drepSign', output, verification.valid === false ? 'error' : 'success');
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

// --- CIP-08 / COSE_Sign1 client-side signature verification ---------------
//
// signData() returns a COSE_Sign1 (the signature) and a COSE_Key (the public
// key). To check the wallet really signed our payload we reconstruct the COSE
// `Sig_structure` and verify the Ed25519 signature against the COSE_Key, all in
// the browser. Cometa exposes the CBOR + Ed25519 primitives but no COSE helper,
// so we parse the structures by hand (RFC 8152).

const u8ToHex = (u8) => Cometa.uint8ArrayToHex(u8);

/** Read a CBOR integer that may be unsigned (major type 0) or negative (type 1). */
const readIntAny = (reader) => {
    if (reader.peekState() === Cometa.CborReaderState.NegativeInteger) {
        return Number(reader.readSignedInt());
    }
    return Number(reader.readUnsignedInt());
};

/**
 * Parse a COSE_Sign1: [ protected: bstr, unprotected: map, payload: bstr/nil, signature: bstr ]
 * (optionally wrapped in CBOR tag 18).
 */
const parseCoseSign1 = (signatureHex) => {
    const r = Cometa.CborReader.fromHex(signatureHex);
    if (r.peekState() === Cometa.CborReaderState.Tag) {
        r.readTag(); // COSE_Sign1 tag (18) - not all wallets emit it
    }
    r.readStartArray();
    const protectedBytes = r.readByteString();
    r.skipValue(); // unprotected header map - nothing we need
    let payload = null;
    if (r.peekState() === Cometa.CborReaderState.Null) {
        r.readNull(); // detached payload
    } else {
        payload = r.readByteString();
    }
    const signature = r.readByteString();
    return { protectedBytes, payload, signature };
};

/**
 * Parse the serialized COSE protected-header map for the CIP-8 fields we care
 * about: alg (label 1), the signer `address`, and the `hashed` flag.
 * An empty protected header is a zero-length byte string, not an empty map.
 */
const parseProtectedHeaders = (protectedBytes) => {
    const out = { alg: null, addressHex: null, hashed: false };
    if (!protectedBytes || protectedBytes.length === 0) return out;

    const r = Cometa.CborReader.from(protectedBytes);
    const n = Number(r.readStartMap());
    for (let i = 0; i < n; i++) {
        const key = r.peekState() === Cometa.CborReaderState.TextString
            ? r.readTextString()
            : readIntAny(r);
        if (key === 1) {
            out.alg = readIntAny(r);
        } else if (key === 'address') {
            out.addressHex = u8ToHex(r.readByteString());
        } else if (key === 'hashed') {
            out.hashed = r.readBoolean();
        } else {
            r.skipValue();
        }
    }
    return out;
};

/** Extract the raw Ed25519 public key (COSE_Key label -2, "x") from a COSE_Key. */
const parseCoseKeyPublicKey = (keyHex) => {
    const r = Cometa.CborReader.fromHex(keyHex);
    const n = Number(r.readStartMap());
    let x = null;
    for (let i = 0; i < n; i++) {
        const label = readIntAny(r);
        if (label === -2) {
            x = r.readByteString();
        } else {
            r.skipValue();
        }
    }
    return x;
};

/** Build the canonical COSE Sig_structure that was signed. */
const buildSigStructure = (protectedBytes, payloadBytes) => {
    // Definite-length array (size 4) - no endArray(), which is for indefinite only
    const w = new Cometa.CborWriter();
    w.startArray(4);
    w.writeTextString('Signature1');
    w.writeByteString(protectedBytes);
    w.writeByteString(new Uint8Array(0)); // external_aad is empty in CIP-8
    w.writeByteString(payloadBytes);
    return w.encode();
};

/**
 * Verify a CIP-08 signData() result entirely client-side.
 *
 * @param {string} signatureHex - COSE_Sign1 hex returned by the wallet
 * @param {string} keyHex - COSE_Key hex returned by the wallet
 * @param {string|null} expectedPayloadHex - Payload we asked the wallet to sign
 *        (used only when the COSE_Sign1 carries a detached/nil payload)
 * @returns {Object} verification report
 */
export const verifyCip8Signature = (signatureHex, keyHex, expectedPayloadHex = null) => {
    const { protectedBytes, payload, signature } = parseCoseSign1(signatureHex);
    const headers = parseProtectedHeaders(protectedBytes);

    const xBytes = parseCoseKeyPublicKey(keyHex);
    if (!xBytes) {
        throw new Error('COSE_Key has no Ed25519 public key (label -2)');
    }

    // The bytes that were actually signed: the COSE_Sign1 payload if present,
    // otherwise the payload we supplied (hashed first if the header says so).
    let signedPayload = payload;
    if (!signedPayload) {
        let bytes = expectedPayloadHex != null
            ? Cometa.hexToUint8Array(expectedPayloadHex)
            : new Uint8Array(0);
        if (headers.hashed) bytes = Cometa.Blake2b.computeHash(bytes, 28);
        signedPayload = bytes;
    }

    const sigStructure = buildSigStructure(protectedBytes, signedPayload);
    const publicKey = Cometa.Ed25519PublicKey.fromBytes(xBytes);
    const ed25519Sig = Cometa.Ed25519Signature.fromBytes(signature);
    const valid = publicKey.verify(ed25519Sig, sigStructure);

    // Best-effort, format-agnostic binding check: the signer's key hash should
    // appear inside the address/credential carried in the protected header.
    const keyHashHex = publicKey.toHashHex();
    const keyMatchesAddress = headers.addressHex
        ? headers.addressHex.toLowerCase().includes(keyHashHex.toLowerCase())
        : null;

    return {
        valid,
        algId: headers.alg,
        hashed: headers.hashed,
        publicKeyHex: publicKey.toHex(),
        keyHashHex,
        addressHex: headers.addressHex,
        keyMatchesAddress,
        payloadHex: payload ? u8ToHex(payload) : null,
    };
};

/**
 * Run client-side verification and format it for the result box. Verification
 * problems are reported but never throw, so a signing success is still shown.
 *
 * @param {Object} result - signData() result ({ signature, key })
 * @param {string} payloadHex - Payload that was signed
 * @returns {{ text: string, valid: boolean|null }}
 */
export const buildVerificationReport = (result, payloadHex) => {
    if (!result?.signature || !result?.key) {
        return { text: '', valid: null };
    }
    try {
        const v = verifyCip8Signature(result.signature, result.key, payloadHex);
        let text = `\n--- Signature Verification (client-side) ---\n`;
        text += `Ed25519 signature valid: ${v.valid ? 'YES ✅' : 'NO ❌'}\n`;
        text += `COSE alg: ${v.algId ?? 'n/a'} (EdDSA = -8)\n`;
        text += `Payload hashed: ${v.hashed}\n`;
        text += `Signing public key: ${v.publicKeyHex}\n`;
        text += `Public key hash (Blake2b-224): ${v.keyHashHex}\n`;
        if (v.addressHex) {
            text += `Signer header credential: ${v.addressHex}\n`;
            text += `Key hash matches credential: ${v.keyMatchesAddress ? 'YES ✅' : 'NO ⚠️'}\n`;
        }
        ui.log(`Client-side verification: signature ${v.valid ? 'VALID' : 'INVALID'}`, v.valid ? 'success' : 'error');
        return { text, valid: v.valid };
    } catch (err) {
        ui.log(`Client-side verification skipped: ${err.message}`, 'warning');
        return { text: `\n--- Signature Verification ---\nCould not verify: ${err.message}\n`, valid: null };
    }
};
