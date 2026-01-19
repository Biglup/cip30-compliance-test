/**
 * Script Tests - Plutus and Native Script Operations
 * Tests for locking/spending from Plutus scripts and minting with scripts
 */

import { state, setPendingTransaction, getPendingTransaction, clearPendingTransaction } from '../app-state.js';
import * as ui from '../ui.js';

// Always-succeeds Plutus V3 script (from cometa.js examples)
const ALWAYS_SUCCEEDS_SCRIPT_V3 =
    '590dff010000323232332232323232332232323232323232232498c8c8c94cd4ccd5cd19b874800000804c0484c8c8c8c8c8ccc88848ccc00401000c008c8c8c94cd4ccd5cd19b874800000806c0684c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8cccccccccccc8ccc8cc8cc888888888888888848cccccccccccccccc00404404003c03803403002c02802402001c01801401000c008c004d5d080a18009aba1013302123232325335333573466e1d2000002031030133221233001003002301d35742002600a6ae84d5d1000898192481035054310035573c0046aae74004dd5000998108009aba101123232325335333573466e1d200000203002f13232333322221233330010050040030023232325335333573466e1d2000002035034133221233001003002302a35742002660564646464a66a666ae68cdc3a40000040720702642446004006605c6ae8400454cd4ccd5cd19b87480080080e40e04c8ccc888488ccc00401401000cdd69aba1002375a6ae84004dd69aba1357440026ae880044c0e92401035054310035573c0046aae74004dd50009aba1357440022606c9201035054310035573c0046aae74004dd51aba1003300735742004646464a66a666ae68cdc3a400000406a068224440062a66a666ae68cdc3a400400406a068264244460020086eb8d5d08008a99a999ab9a3370e900200101a81a099091118010021aba1001130364901035054310035573c0046aae74004dd51aba10013302875c6ae84d5d10009aba200135744002260629201035054310035573c0046aae74004dd50009bad3574201e60026ae84038c008c009d69980f80a9aba100c33302202075a6ae8402cc8c8c94cd4ccd5cd19b87480000080b80b44cc8848cc00400c008c8c8c94cd4ccd5cd19b87480000080c40c04cc8848cc00400c008cc0b9d69aba1001302d357426ae880044c0c9241035054310035573c0046aae74004dd51aba10013232325335333573466e1d20000020310301332212330010030023302e75a6ae84004c0b4d5d09aba200113032491035054310035573c0046aae74004dd51aba1357440022605e921035054310035573c0046aae74004dd51aba100a3301f75c6ae84024ccc0888c8c8c94cd4ccd5cd19b87480000080bc0b84c84888888c01401cdd71aba100115335333573466e1d200200202f02e13212222223002007301b357420022a66a666ae68cdc3a400800405e05c2642444444600600e60486ae8400454cd4ccd5cd19b87480180080bc0b84cc884888888cc01802001cdd69aba10013019357426ae8800454cd4ccd5cd19b87480200080bc0b84c84888888c00401cc068d5d08008a99a999ab9a3370e9005001017817099910911111198020040039bad3574200260306ae84d5d1000898182481035054310035573c0046aae74004dd50008131aba1008330020263574200e6eb8d5d080319981100b198110149191919299a999ab9a3370e9000001017817089110010a99a999ab9a3370e9001001017817089110008a99a999ab9a3370e900200101781708911001898182481035054310035573c0046aae74004dd50009aba10053301f0143574200860026ae8400cc004d5d09aba2003302075a6040eb8d5d10009aba2001357440026ae88004d5d10009aba2001357440026ae88004d5d10009aba2001357440026ae88004d5d10009aba20011301c491035054310035573c0046aae74004dd51aba10063574200a646464a66a666ae68cdc3a40000040360342642444444600a00e6eb8d5d08008a99a999ab9a3370e900100100d80d0999109111111980100400398039aba100133011016357426ae8800454cd4ccd5cd19b874801000806c0684c84888888c00c01cc040d5d08008a99a999ab9a3370e900300100d80d099910911111198030040039bad35742002600a6ae84d5d10008a99a999ab9a3370e900400100d80d0990911111180080398031aba100115335333573466e1d200a00201b01a13322122222233004008007375a6ae84004c010d5d09aba20011301c4901035054310035573c0046aae74004dd51aba13574400a4646464a66a666ae68cdc3a4000004036034264666444246660020080060046eb4d5d080118089aba10013232325335333573466e1d200000201f01e1323332221222222233300300a0090083301601e357420046ae84004cc059d71aba1357440026ae8800454cd4ccd5cd19b874800800807c0784cc8848888888cc01c024020cc054074d5d0800991919299a999ab9a3370e90000010110108999109198008018011bad357420026eb4d5d09aba200113023491035054310035573c0046aae74004dd51aba1357440022a66a666ae68cdc3a400800403e03c26644244444446600401201066602c028eb4d5d08009980abae357426ae8800454cd4ccd5cd19b874801800807c0784c848888888c010020cc054074d5d08008a99a999ab9a3370e900400100f80f09919199991110911111119998008058050048041980b80f9aba1003330150163574200466603002ceb4d5d08009a991919299a999ab9a3370e900000101201189980e1bad357420026eb4d5d09aba2001130254901035054310035573c0046aae74004dd51aba135744002446602a0040026ae88004d5d10008a99a999ab9a3370e900500100f80f0999109111111198028048041980a80e9aba10013232325335333573466e1d200000202202113301875c6ae840044c08d241035054310035573c0046aae74004dd51aba1357440022a66a666ae68cdc3a401800403e03c22444444400c26040921035054310035573c0046aae74004dd51aba1357440026ae880044c071241035054310035573c0046aae74004dd50009191919299a999ab9a3370e900000100d00c899910911111111111980280680618079aba10013301075a6ae84d5d10008a99a999ab9a3370e900100100d00c899910911111111111980100680618079aba10013301075a6ae84d5d10008a9919a999ab9a3370e900200180d80d099910911111111111980500680618081aba10023001357426ae8800854cd4ccd5cd19b874801800c06c0684c8ccc888488888888888ccc018038034030c044d5d080198011aba1001375a6ae84d5d10009aba200215335333573466e1d200800301b01a133221222222222223300700d00c3010357420046eb4d5d09aba200215335333573466e1d200a00301b01a132122222222222300100c3010357420042a66a666ae68cdc3a4018006036034266442444444444446600601a01860206ae84008dd69aba1357440042a66a666ae68cdc3a401c006036034266442444444444446601201a0186eb8d5d08011bae357426ae8800854cd4ccd5cd19b874804000c06c0684cc88488888888888cc020034030dd71aba1002375a6ae84d5d10010a99a999ab9a3370e900900180d80d099910911111111111980580680618081aba10023010357426ae8800854cd4ccd5cd19b874805000c06c0684c8488888888888c010030c040d5d08010980e2481035054310023232325335333573466e1d200000201e01d13212223003004375c6ae8400454c8cd4ccd5cd19b874800800c07c0784c84888c004010c004d5d08010a99a999ab9a3370e900200180f80f099910911198010028021bae3574200460026ae84d5d1001098102481035054310023232325335333573466e1d2000002022021132122230030043017357420022a66a666ae68cdc3a4004004044042224440042a66a666ae68cdc3a40080040440422244400226046921035054310035573c0046aae74004dd50009aab9e00235573a0026ea8004d55cf0011aab9d00137540024646464a66a666ae68cdc3a400000403203026424446006008601c6ae8400454cd4ccd5cd19b87480080080640604c84888c008010c038d5d08008a99a999ab9a3370e900200100c80c099091118008021bae3574200226034921035054310035573c0046aae74004dd50009191919299a999ab9a3370e900000100c00b8999109198008018011bae357420026eb4d5d09aba200113019491035054310035573c0046aae74004dd50009aba200113014491035054310035573c0046aae74004dd50009808911299a999ab9a3370e900000080880809809249035054330015335333573466e20005200001101013300333702900000119b81480000044c8cc8848cc00400c008cdc200180099b840020013300400200130102225335333573466e1d200000101000f10021330030013370c004002464460046eb0004c04088cccd55cf8009005119a80498021aba10023003357440040224646464a66a666ae68cdc3a400000401e01c26424460040066eb8d5d08008a99a999ab9a3370e900100100780709909118008019bae3574200226020921035054310035573c0046aae74004dd500091191919299a999ab9a3370e900100100780708910008a99a999ab9a3370e9000001007807099091180100198029aba1001130104901035054310035573c0046aae74004dd50009119118011bab001300e2233335573e002401046466a0106600e600c6aae74004c014d55cf00098021aba20033574200401e4424660020060042440042442446600200800640024646464a66a666ae68cdc3a400000401000e200e2a66a666ae68cdc3a400400401000e201026012921035054310035573c0046aae74004dd500091191919299a999ab9a3370e9000001004003889110010a99a999ab9a3370e90010010040038990911180180218029aba100115335333573466e1d200400200800711222001130094901035054310035573c0046aae74004dd50009191919299a999ab9a3370e90000010030028999109198008018011bae357420026eb4d5d09aba200113007491035054310035573c0046aae74004dd5000891001091000919319ab9c0010021200123230010012300223300200200101';

// Empty redeemer for always-succeeds script
const EMPTY_REDEEMER = {
    cbor: 'd87980',
    constructor: 0n,
    fields: { items: [] }
};

// Always-succeeds native script (valid until far future)
const ALWAYS_SUCCEEDS_NATIVE_SCRIPT = {
    type: Cometa.ScriptType.Native,
    kind: Cometa.NativeScriptKind.RequireAllOf,
    scripts: [
        {
            type: Cometa.ScriptType.Native,
            kind: Cometa.NativeScriptKind.RequireTimeBefore,
            slot: 1001655683199 // Valid until year 33658
        }
    ]
};

/**
 * Get the Plutus V3 script object
 */
const getPlutusScript = () => ({
    type: Cometa.ScriptType.Plutus,
    bytes: ALWAYS_SUCCEEDS_SCRIPT_V3,
    version: Cometa.PlutusLanguageVersion.V3
});

/**
 * Get the script address for the always-succeeds script
 */
const getScriptAddress = () => {
    const script = getPlutusScript();
    const networkId = state.networkId === 1 ? Cometa.NetworkId.Mainnet : Cometa.NetworkId.Testnet;

    const scriptHash = Cometa.computeScriptHash(script);
    const scriptAddress = Cometa.EnterpriseAddress.fromCredentials(networkId, {
        hash: scriptHash,
        type: Cometa.CredentialType.ScriptHash
    }).toAddress();

    return scriptAddress;
};

/**
 * Query the script address balance
 */
export const queryScriptBalance = async () => {
    ui.log('Querying script balance...', 'info');
    ui.setTestResult('script-balance', 'Querying...', 'pending');

    try {
        const scriptAddress = getScriptAddress();

        if (!scriptAddress) {
            throw new Error('Failed to create script address - got null/undefined');
        }

        // Handle different return types - Address objects use toString() not toBech32()
        let scriptAddressBech32;
        if (typeof scriptAddress === 'string') {
            scriptAddressBech32 = scriptAddress;
        } else if (typeof scriptAddress.toString === 'function') {
            scriptAddressBech32 = scriptAddress.toString();
        } else {
            throw new Error(`Unknown script address format: ${JSON.stringify(scriptAddress)}`);
        }

        ui.log(`Script address: ${scriptAddressBech32}`, 'info');

        // Get UTxOs at script address
        const utxos = await state.provider.getUnspentOutputs(scriptAddress);

        let result = `Script Address:\n${scriptAddressBech32}\n\n`;

        if (!utxos || utxos.length === 0) {
            result += `Balance: 0 ADA\nNo UTxOs at script address.\n\nUse "Lock ADA in Script" to send funds.`;
            ui.setTestResult('script-balance', result, 'warning');
            ui.log('No UTxOs at script address', 'warning');
            return { balance: 0n, utxos: [] };
        }

        // Calculate total balance
        let totalLovelace = 0n;
        utxos.forEach(utxo => {
            const coins = utxo.output?.value?.coins || utxo.value?.coins || 0n;
            totalLovelace += BigInt(coins);
        });

        const ada = Number(totalLovelace) / 1_000_000;
        result += `Balance: ${ada.toFixed(6)} ADA\n`;
        result += `UTxOs: ${utxos.length}\n\n`;

        // List first few UTxOs
        result += `UTxOs:\n`;
        utxos.slice(0, 5).forEach((utxo, i) => {
            const txId = (utxo.input?.txId || '').substring(0, 16);
            const coins = utxo.output?.value?.coins || utxo.value?.coins || 0n;
            const utxoAda = Number(coins) / 1_000_000;
            result += `${i + 1}. ${txId}...#${utxo.input?.index}: ${utxoAda.toFixed(6)} ADA\n`;
        });

        if (utxos.length > 5) {
            result += `... and ${utxos.length - 5} more\n`;
        }

        ui.setTestResult('script-balance', result, 'success');
        ui.log(`Script balance: ${ada.toFixed(6)} ADA (${utxos.length} UTxOs)`, 'success');

        // Store for later use
        state.scriptUtxos = utxos;
        state.scriptAddress = scriptAddress;

        return { balance: totalLovelace, utxos };
    } catch (err) {
        const errorMsg = `Query failed: ${err.message}`;
        ui.setTestResult('script-balance', errorMsg, 'error');
        ui.log(`Script balance query failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Lock ADA in the always-succeeds script
 */
export const buildLockTransaction = async (amountAda) => {
    ui.log(`Building lock transaction: ${amountAda} ADA...`, 'info');
    ui.setTestResult('lock-tx', 'Building transaction...', 'pending');

    try {
        if (!amountAda || amountAda <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const scriptAddress = getScriptAddress();
        const lovelace = BigInt(Math.floor(amountAda * 1_000_000));

        ui.log(`Locking ${amountAda} ADA at ${scriptAddress.toString().substring(0, 40)}...`, 'info');

        const builder = await state.wallet.createTransactionBuilder();

        // Lock funds with an inline datum (empty constructor)
        const unsignedTx = await builder
            .sendValue({
                address: scriptAddress,
                value: { coins: lovelace },
                datum: EMPTY_REDEEMER // Inline datum
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('lock', unsignedTx);

        let result = `Lock Transaction Built\n\n`;
        result += `Amount: ${amountAda} ADA\n`;
        result += `Script Address: ${scriptAddress.toString().substring(0, 50)}...\n`;
        result += `Datum: Empty constructor (d87980)`;

        ui.setTestResult('lock-tx', result, 'success');
        ui.log('Lock transaction built', 'success');

        ui.signLockTx.disabled = false;
        ui.submitLockTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('lock-tx', errorMsg, 'error');
        ui.log(`Lock transaction build failed: ${err.message}`, 'error');
        clearPendingTransaction('lock');
        throw err;
    }
};

export const signLockTransaction = async () => {
    ui.log('Signing lock transaction...', 'info');
    ui.setTestResult('lock-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('lock');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('lock', signedTx);

        ui.setTestResult('lock-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Lock transaction signed', 'success');

        ui.signLockTx.disabled = true;
        ui.submitLockTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('lock-tx', errorMsg, 'error');
        ui.log(`Lock transaction signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitLockTransaction = async () => {
    ui.log('Submitting lock transaction...', 'info');
    ui.setTestResult('lock-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('lock');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('lock-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Lock transaction submitted: ${txId}`, 'success');

        clearPendingTransaction('lock');
        ui.signLockTx.disabled = true;
        ui.submitLockTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('lock-tx', errorMsg, 'error');
        ui.log(`Lock transaction submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Spend from the always-succeeds script
 */
export const buildSpendTransaction = async (amountAda) => {
    ui.log(`Building spend transaction: ${amountAda} ADA from script...`, 'info');
    ui.setTestResult('spend-tx', 'Building transaction...', 'pending');

    try {
        if (!amountAda || amountAda <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const scriptAddress = getScriptAddress();
        const lovelace = BigInt(Math.floor(amountAda * 1_000_000));

        // Get UTxOs at script address
        const utxos = await state.provider.getUnspentOutputs(scriptAddress);

        if (!utxos || utxos.length === 0) {
            throw new Error('No UTxOs available at script address. Lock some ADA first.');
        }

        ui.log(`Found ${utxos.length} UTxOs at script address`, 'info');

        // Get receiving address (own address)
        const addresses = await state.wallet.getUsedAddresses();
        if (!addresses || addresses.length === 0) {
            throw new Error('No wallet addresses available');
        }
        const receivingAddress = addresses[0];
        const receivingBech32 = typeof receivingAddress === 'string'
            ? Cometa.Address.fromHex(receivingAddress).toString()
            : receivingAddress.toString();

        const script = getPlutusScript();
        const builder = await state.wallet.createTransactionBuilder();

        // Add script input with redeemer
        const unsignedTx = await builder
            .addInput({
                redeemer: EMPTY_REDEEMER,
                utxo: utxos[0] // Spend first UTxO
            })
            .sendLovelace({
                address: receivingBech32,
                amount: lovelace
            })
            .addScript(script)
            .expiresIn(7200) // 2 hours
            .build();

        setPendingTransaction('spend', unsignedTx);

        const utxoCoins = utxos[0].output?.value?.coins || utxos[0].value?.coins || 0n;
        const utxoAda = Number(utxoCoins) / 1_000_000;

        let result = `Spend Transaction Built\n\n`;
        result += `Spending from UTxO: ${utxoAda.toFixed(6)} ADA\n`;
        result += `Sending: ${amountAda} ADA\n`;
        result += `To: ${receivingBech32.substring(0, 40)}...\n`;
        result += `Redeemer: Empty constructor`;

        ui.setTestResult('spend-tx', result, 'success');
        ui.log('Spend transaction built', 'success');

        ui.signSpendTx.disabled = false;
        ui.submitSpendTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('spend-tx', errorMsg, 'error');
        ui.log(`Spend transaction build failed: ${err.message}`, 'error');
        clearPendingTransaction('spend');
        throw err;
    }
};

export const signSpendTransaction = async () => {
    ui.log('Signing spend transaction...', 'info');
    ui.setTestResult('spend-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('spend');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('spend', signedTx);

        ui.setTestResult('spend-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Spend transaction signed', 'success');

        ui.signSpendTx.disabled = true;
        ui.submitSpendTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('spend-tx', errorMsg, 'error');
        ui.log(`Spend transaction signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitSpendTransaction = async () => {
    ui.log('Submitting spend transaction...', 'info');
    ui.setTestResult('spend-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('spend');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('spend-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Spend transaction submitted: ${txId}`, 'success');

        clearPendingTransaction('spend');
        ui.signSpendTx.disabled = true;
        ui.submitSpendTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('spend-tx', errorMsg, 'error');
        ui.log(`Spend transaction submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Mint tokens with native script
 */
export const buildNativeMintTransaction = async (tokenName, amount) => {
    ui.log(`Building native mint transaction: ${amount}x ${tokenName}...`, 'info');
    ui.setTestResult('native-mint-tx', 'Building transaction...', 'pending');

    try {
        if (!tokenName) {
            throw new Error('Token name is required');
        }
        if (!amount || amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const policyId = Cometa.computeScriptHash(ALWAYS_SUCCEEDS_NATIVE_SCRIPT);
        const assetNameHex = Cometa.utf8ToHex(tokenName);
        const assetId = `${policyId}${assetNameHex}`;

        ui.log(`Policy ID: ${policyId}`, 'info');
        ui.log(`Asset ID: ${assetId}`, 'info');

        // Get receiving address
        const addresses = await state.wallet.getUsedAddresses();
        if (!addresses || addresses.length === 0) {
            throw new Error('No wallet addresses available');
        }
        const address = addresses[0];
        const addressBech32 = typeof address === 'string'
            ? Cometa.Address.fromHex(address).toString()
            : address.toString();

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .mintToken({ amount: BigInt(amount), assetIdHex: assetId })
            .addScript(ALWAYS_SUCCEEDS_NATIVE_SCRIPT)
            .sendValue({
                address: addressBech32,
                value: {
                    assets: { [assetId]: BigInt(amount) },
                    coins: 2000000n // Min UTxO
                }
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('nativeMint', unsignedTx);

        let result = `Native Mint Transaction Built\n\n`;
        result += `Token: ${tokenName}\n`;
        result += `Amount: ${amount}\n`;
        result += `Policy ID: ${policyId.substring(0, 32)}...\n`;
        result += `Script Type: Native (Time-locked)`;

        ui.setTestResult('native-mint-tx', result, 'success');
        ui.log('Native mint transaction built', 'success');

        ui.signNativeMintTx.disabled = false;
        ui.submitNativeMintTx.disabled = true;

        // Store for burn
        state.lastMintedNativeAsset = { policyId, assetNameHex, assetId, tokenName };

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('native-mint-tx', errorMsg, 'error');
        ui.log(`Native mint build failed: ${err.message}`, 'error');
        clearPendingTransaction('nativeMint');
        throw err;
    }
};

export const signNativeMintTransaction = async () => {
    ui.log('Signing native mint transaction...', 'info');
    ui.setTestResult('native-mint-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('nativeMint');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('nativeMint', signedTx);

        ui.setTestResult('native-mint-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Native mint transaction signed', 'success');

        ui.signNativeMintTx.disabled = true;
        ui.submitNativeMintTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('native-mint-tx', errorMsg, 'error');
        ui.log(`Native mint signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitNativeMintTransaction = async () => {
    ui.log('Submitting native mint transaction...', 'info');
    ui.setTestResult('native-mint-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('nativeMint');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('native-mint-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Native mint submitted: ${txId}`, 'success');

        clearPendingTransaction('nativeMint');
        ui.signNativeMintTx.disabled = true;
        ui.submitNativeMintTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('native-mint-tx', errorMsg, 'error');
        ui.log(`Native mint submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Mint tokens with Plutus script
 */
export const buildPlutusMintTransaction = async (tokenName, amount) => {
    ui.log(`Building Plutus mint transaction: ${amount}x ${tokenName}...`, 'info');
    ui.setTestResult('plutus-mint-tx', 'Building transaction...', 'pending');

    try {
        if (!tokenName) {
            throw new Error('Token name is required');
        }
        if (!amount || amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const script = getPlutusScript();
        const policyId = Cometa.computeScriptHash(script);
        const assetNameHex = Cometa.utf8ToHex(tokenName);
        const assetId = `${policyId}${assetNameHex}`;

        ui.log(`Policy ID: ${policyId}`, 'info');
        ui.log(`Asset ID: ${assetId}`, 'info');

        // Get receiving address
        const addresses = await state.wallet.getUsedAddresses();
        if (!addresses || addresses.length === 0) {
            throw new Error('No wallet addresses available');
        }
        const address = addresses[0];
        const addressBech32 = typeof address === 'string'
            ? Cometa.Address.fromHex(address).toString()
            : address.toString();

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .mintToken({
                amount: BigInt(amount),
                assetIdHex: assetId,
                redeemer: EMPTY_REDEEMER
            })
            .addScript(script)
            .sendValue({
                address: addressBech32,
                value: {
                    assets: { [assetId]: BigInt(amount) },
                    coins: 2000000n // Min UTxO
                }
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('plutusMint', unsignedTx);

        let result = `Plutus Mint Transaction Built\n\n`;
        result += `Token: ${tokenName}\n`;
        result += `Amount: ${amount}\n`;
        result += `Policy ID: ${policyId.substring(0, 32)}...\n`;
        result += `Script Type: Plutus V3\n`;
        result += `Redeemer: Empty constructor`;

        ui.setTestResult('plutus-mint-tx', result, 'success');
        ui.log('Plutus mint transaction built', 'success');

        ui.signPlutusMintTx.disabled = false;
        ui.submitPlutusMintTx.disabled = true;

        // Store for burn
        state.lastMintedPlutusAsset = { policyId, assetNameHex, assetId, tokenName };

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('plutus-mint-tx', errorMsg, 'error');
        ui.log(`Plutus mint build failed: ${err.message}`, 'error');
        clearPendingTransaction('plutusMint');
        throw err;
    }
};

export const signPlutusMintTransaction = async () => {
    ui.log('Signing Plutus mint transaction...', 'info');
    ui.setTestResult('plutus-mint-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('plutusMint');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('plutusMint', signedTx);

        ui.setTestResult('plutus-mint-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Plutus mint transaction signed', 'success');

        ui.signPlutusMintTx.disabled = true;
        ui.submitPlutusMintTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('plutus-mint-tx', errorMsg, 'error');
        ui.log(`Plutus mint signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitPlutusMintTransaction = async () => {
    ui.log('Submitting Plutus mint transaction...', 'info');
    ui.setTestResult('plutus-mint-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('plutusMint');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('plutus-mint-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Plutus mint submitted: ${txId}`, 'success');

        clearPendingTransaction('plutusMint');
        ui.signPlutusMintTx.disabled = true;
        ui.submitPlutusMintTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('plutus-mint-tx', errorMsg, 'error');
        ui.log(`Plutus mint submission failed: ${err.message}`, 'error');
        throw err;
    }
};
