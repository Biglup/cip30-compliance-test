/**
 * Transaction Building Tests
 * Tests for building, signing, and submitting various transaction types
 */

import { state, setPendingTransaction, getPendingTransaction, clearPendingTransaction } from '../app-state.js';
import * as ui from '../ui.js';

/**
 * Convert ADA to lovelace
 * @param {number} ada - Amount in ADA
 * @returns {bigint} Amount in lovelace
 */
const adaToLovelace = (ada) => BigInt(Math.floor(ada * 1_000_000));

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
 * Get a RewardAddress object from either hex string or object
 * @param {string|Object} addr - Reward address as hex string or object
 * @returns {Object} RewardAddress object suitable for Cometa
 */
const getRewardAddress = (addr) => {
    if (typeof addr === 'string') {
        return Cometa.RewardAddress.fromHex(addr);
    }
    return addr;
};

/**
 * Convert a reward address to bech32 format
 * @param {string|Object} addr - Reward address as hex string or object
 * @returns {string} Bech32 address string
 */
const rewardAddressToBech32 = (addr) => {
    if (typeof addr === 'string') {
        return Cometa.RewardAddress.fromHex(addr).toBech32(); // RewardAddress uses toBech32()
    } else if (addr.toBech32) {
        return addr.toBech32(); // RewardAddress uses toBech32()
    }
    return String(addr);
};

/**
 * Format transaction for display
 * @param {Object} tx - Transaction object
 * @returns {string} Formatted string
 */
const formatTransaction = (tx) => {
    try {
        const txBody = tx.body?.();
        if (!txBody) return 'Transaction built (CBOR available)';

        let result = '';

        // Inputs
        const inputs = txBody.inputs?.();
        if (inputs) {
            result += `Inputs: ${inputs.length}\n`;
        }

        // Outputs
        const outputs = txBody.outputs?.();
        if (outputs) {
            result += `Outputs: ${outputs.length}\n`;
        }

        // Fee
        const fee = txBody.fee?.();
        if (fee) {
            const feeAda = Number(fee) / 1_000_000;
            result += `Fee: ${feeAda.toFixed(6)} ADA\n`;
        }

        return result || 'Transaction built successfully';
    } catch {
        return 'Transaction built (details unavailable)';
    }
};

/**
 * Build a simple ADA transfer transaction
 * @param {string} recipientAddress - Recipient bech32 address
 * @param {number} amountAda - Amount in ADA
 */
export const buildSimpleTransaction = async (recipientAddress, amountAda) => {
    ui.log(`Building simple transaction: ${amountAda} ADA to ${recipientAddress.substring(0, 20)}...`, 'info');
    ui.setTestResult('simple-tx', 'Building transaction...', 'pending');

    try {
        if (!recipientAddress) {
            throw new Error('Recipient address is required');
        }

        if (!amountAda || amountAda <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const lovelace = adaToLovelace(amountAda);
        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .sendLovelace({
                address: recipientAddress,
                amount: lovelace,
            })
            .expiresIn(3600) // 1 hour validity
            .build();

        // Store pending transaction
        setPendingTransaction('simple', unsignedTx);
        ui.logCbor('Simple Transaction CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Transaction Built Successfully\n\n${details}`;
        result += `\nAmount: ${amountAda} ADA`;
        result += `\nRecipient: ${recipientAddress.substring(0, 30)}...`;

        ui.setTestResult('simple-tx', result, 'success');
        ui.log('Simple transaction built successfully', 'success');

        // Enable sign button
        ui.signSimpleTx.disabled = false;
        ui.submitSimpleTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('simple-tx', errorMsg, 'error');
        ui.log(`Simple transaction build failed: ${err.message}`, 'error');
        clearPendingTransaction('simple');
        throw err;
    }
};

/**
 * Sign the pending simple transaction
 */
export const signSimpleTransaction = async () => {
    ui.log('Signing simple transaction...', 'info');
    ui.setTestResult('simple-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('simple');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        // Update pending transaction with signed version
        setPendingTransaction('simple', signedTx);

        let result = `Transaction Signed Successfully\n\n`;
        result += `Witnesses applied.\nReady to submit.`;

        ui.setTestResult('simple-tx', result, 'success');
        ui.log('Simple transaction signed successfully', 'success');

        // Enable submit button
        ui.signSimpleTx.disabled = true;
        ui.submitSimpleTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('simple-tx', errorMsg, 'error');
        ui.log(`Simple transaction signing failed: ${err.message}`, 'error');

        if (err.code === 2 || err.message?.includes('declined') || err.message?.includes('reject')) {
            ui.log('User declined to sign the transaction', 'warning');
        }

        throw err;
    }
};

/**
 * Submit the signed simple transaction
 */
export const submitSimpleTransaction = async () => {
    ui.log('Submitting simple transaction...', 'info');
    ui.setTestResult('simple-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('simple');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        let result = `Transaction Submitted!\n\n`;
        result += `Transaction ID:\n${txId}`;

        ui.setTestResult('simple-tx', result, 'success');
        ui.log(`Transaction submitted: ${txId}`, 'success');

        // Clean up
        clearPendingTransaction('simple');
        ui.signSimpleTx.disabled = true;
        ui.submitSimpleTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('simple-tx', errorMsg, 'error');
        ui.log(`Transaction submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Build a self-transfer transaction (send to own address)
 * @param {number} amountAda - Amount in ADA
 */
export const buildSelfTransaction = async (amountAda) => {
    ui.log(`Building self-transfer transaction: ${amountAda} ADA...`, 'info');
    ui.setTestResult('self-tx', 'Building transaction...', 'pending');

    try {
        if (!amountAda || amountAda <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        // Get own address
        const addresses = await state.wallet.getUsedAddresses();
        if (!addresses || addresses.length === 0) {
            throw new Error('No wallet addresses available');
        }

        const ownAddress = addressToBech32(addresses[0]);
        const lovelace = adaToLovelace(amountAda);

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .sendLovelace({
                address: ownAddress,
                amount: lovelace,
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('self', unsignedTx);
        ui.logCbor('Self Transaction CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Self-Transfer Transaction Built\n\n${details}`;
        result += `\nAmount: ${amountAda} ADA`;
        result += `\nTo: ${ownAddress.substring(0, 30)}...`;

        ui.setTestResult('self-tx', result, 'success');
        ui.log('Self-transfer transaction built successfully', 'success');

        ui.signSelfTx.disabled = false;
        ui.submitSelfTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('self-tx', errorMsg, 'error');
        ui.log(`Self-transfer build failed: ${err.message}`, 'error');
        clearPendingTransaction('self');
        throw err;
    }
};

/**
 * Sign the pending self-transfer transaction
 */
export const signSelfTransaction = async () => {
    ui.log('Signing self-transfer transaction...', 'info');
    ui.setTestResult('self-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('self');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('self', signedTx);

        ui.setTestResult('self-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Self-transfer signed successfully', 'success');

        ui.signSelfTx.disabled = true;
        ui.submitSelfTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('self-tx', errorMsg, 'error');
        ui.log(`Self-transfer signing failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Submit the signed self-transfer transaction
 */
export const submitSelfTransaction = async () => {
    ui.log('Submitting self-transfer transaction...', 'info');
    ui.setTestResult('self-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('self');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        let result = `Transaction Submitted!\n\n`;
        result += `Transaction ID:\n${txId}`;

        ui.setTestResult('self-tx', result, 'success');
        ui.log(`Self-transfer submitted: ${txId}`, 'success');

        clearPendingTransaction('self');
        ui.signSelfTx.disabled = true;
        ui.submitSelfTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('self-tx', errorMsg, 'error');
        ui.log(`Self-transfer submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Build stake address registration transaction
 */
export const buildStakeRegistrationTransaction = async () => {
    ui.log('Building stake registration transaction...', 'info');
    ui.setTestResult('stake-reg-tx', 'Building transaction...', 'pending');

    try {
        // Get reward addresses using raw CIP-30 API to avoid Cometa conversion issues
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found in wallet');
        }

        // Convert hex to Address, then to RewardAddress
        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddress = addr.asReward();
        const stakeAddressBech32 = rewardAddress ? rewardAddress.toBech32() : addr.toString();

        ui.log(`Using reward address: ${stakeAddressBech32}`, 'info');

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .registerStakeAddress({
                rewardAddress: rewardAddress,
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('stakeReg', unsignedTx);
        ui.logCbor('Stake Registration CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Stake Registration Transaction Built\n\n${details}`;
        result += `\nReward Address: ${stakeAddressBech32}`;
        result += `\n\nNote: Requires 2 ADA deposit`;

        ui.setTestResult('stake-reg-tx', result, 'success');
        ui.log('Stake registration transaction built', 'success');

        ui.signStakeRegTx.disabled = false;
        ui.submitStakeRegTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('stake-reg-tx', errorMsg, 'error');
        ui.log(`Stake registration build failed: ${err.message}`, 'error');
        clearPendingTransaction('stakeReg');
        throw err;
    }
};

/**
 * Sign stake registration transaction
 */
export const signStakeRegistrationTransaction = async () => {
    ui.log('Signing stake registration transaction...', 'info');
    ui.setTestResult('stake-reg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('stakeReg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('stakeReg', signedTx);

        ui.setTestResult('stake-reg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Stake registration signed', 'success');

        ui.signStakeRegTx.disabled = true;
        ui.submitStakeRegTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('stake-reg-tx', errorMsg, 'error');
        ui.log(`Stake registration signing failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Submit stake registration transaction
 */
export const submitStakeRegistrationTransaction = async () => {
    ui.log('Submitting stake registration transaction...', 'info');
    ui.setTestResult('stake-reg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('stakeReg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('stake-reg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Stake registration submitted: ${txId}`, 'success');

        clearPendingTransaction('stakeReg');
        ui.signStakeRegTx.disabled = true;
        ui.submitStakeRegTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('stake-reg-tx', errorMsg, 'error');
        ui.log(`Stake registration submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Build vote delegation transaction
 * @param {string} drepId - DRep ID, 'abstain', or 'no_confidence'
 */
export const buildVoteDelegationTransaction = async (drepId) => {
    ui.log(`Building vote delegation transaction to ${drepId}...`, 'info');
    ui.setTestResult('vote-deleg-tx', 'Building transaction...', 'pending');

    try {
        if (!drepId) {
            throw new Error('DRep ID is required');
        }

        // Get reward addresses using raw CIP-30 API to avoid Cometa conversion issues
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found');
        }

        // Convert hex to Address, then to RewardAddress
        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddress = addr.asReward();
        const stakeAddressBech32 = rewardAddress ? rewardAddress.toBech32() : addr.toString();

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .delegateVotingPower({
                rewardAddress: rewardAddress,
                drepId: drepId,
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('voteDeleg', unsignedTx);
        ui.logCbor('Vote Delegation CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Vote Delegation Transaction Built\n\n${details}`;
        result += `\nDRep: ${drepId}`;
        result += `\nReward Address: ${stakeAddressBech32.substring(0, 40)}...`;

        ui.setTestResult('vote-deleg-tx', result, 'success');
        ui.log('Vote delegation transaction built', 'success');

        ui.signVoteDelegTx.disabled = false;
        ui.submitVoteDelegTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('vote-deleg-tx', errorMsg, 'error');
        ui.log(`Vote delegation build failed: ${err.message}`, 'error');
        clearPendingTransaction('voteDeleg');
        throw err;
    }
};

/**
 * Sign vote delegation transaction
 */
export const signVoteDelegationTransaction = async () => {
    ui.log('Signing vote delegation transaction...', 'info');
    ui.setTestResult('vote-deleg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('voteDeleg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('voteDeleg', signedTx);

        ui.setTestResult('vote-deleg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Vote delegation signed', 'success');

        ui.signVoteDelegTx.disabled = true;
        ui.submitVoteDelegTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('vote-deleg-tx', errorMsg, 'error');
        ui.log(`Vote delegation signing failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Submit vote delegation transaction
 */
export const submitVoteDelegationTransaction = async () => {
    ui.log('Submitting vote delegation transaction...', 'info');
    ui.setTestResult('vote-deleg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('voteDeleg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('vote-deleg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Vote delegation submitted: ${txId}`, 'success');

        clearPendingTransaction('voteDeleg');
        ui.signVoteDelegTx.disabled = true;
        ui.submitVoteDelegTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('vote-deleg-tx', errorMsg, 'error');
        ui.log(`Vote delegation submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Build stake pool delegation transaction
 * @param {string} poolId - Pool ID (bech32)
 */
export const buildStakeDelegationTransaction = async (poolId) => {
    ui.log(`Building stake delegation transaction to ${poolId}...`, 'info');
    ui.setTestResult('stake-deleg-tx', 'Building transaction...', 'pending');

    try {
        if (!poolId) {
            throw new Error('Pool ID is required');
        }

        // Get reward addresses using raw CIP-30 API to avoid Cometa conversion issues
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found');
        }

        // Convert hex to Address, then to RewardAddress
        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddress = addr.asReward();
        const stakeAddressBech32 = rewardAddress ? rewardAddress.toBech32() : addr.toString();

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .delegateStake({
                rewardAddress: rewardAddress,
                poolId: poolId,
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('stakeDeleg', unsignedTx);
        ui.logCbor('Stake Delegation CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Stake Delegation Transaction Built\n\n${details}`;
        result += `\nPool: ${poolId}`;
        result += `\nReward Address: ${stakeAddressBech32.substring(0, 40)}...`;

        ui.setTestResult('stake-deleg-tx', result, 'success');
        ui.log('Stake delegation transaction built', 'success');

        ui.signStakeDelegTx.disabled = false;
        ui.submitStakeDelegTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('stake-deleg-tx', errorMsg, 'error');
        ui.log(`Stake delegation build failed: ${err.message}`, 'error');
        clearPendingTransaction('stakeDeleg');
        throw err;
    }
};

/**
 * Sign stake pool delegation transaction
 */
export const signStakeDelegationTransaction = async () => {
    ui.log('Signing stake delegation transaction...', 'info');
    ui.setTestResult('stake-deleg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('stakeDeleg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('stakeDeleg', signedTx);

        ui.setTestResult('stake-deleg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Stake delegation signed', 'success');

        ui.signStakeDelegTx.disabled = true;
        ui.submitStakeDelegTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('stake-deleg-tx', errorMsg, 'error');
        ui.log(`Stake delegation signing failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Submit stake pool delegation transaction
 */
export const submitStakeDelegationTransaction = async () => {
    ui.log('Submitting stake delegation transaction...', 'info');
    ui.setTestResult('stake-deleg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('stakeDeleg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('stake-deleg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Stake delegation submitted: ${txId}`, 'success');

        clearPendingTransaction('stakeDeleg');
        ui.signStakeDelegTx.disabled = true;
        ui.submitStakeDelegTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('stake-deleg-tx', errorMsg, 'error');
        ui.log(`Stake delegation submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Build stake address deregistration transaction
 */
export const buildStakeDeregistrationTransaction = async () => {
    ui.log('Building stake deregistration transaction...', 'info');
    ui.setTestResult('stake-dereg-tx', 'Building transaction...', 'pending');

    try {
        // Get reward addresses using raw CIP-30 API to avoid Cometa conversion issues
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found in wallet');
        }

        // Convert hex to Address, then to RewardAddress
        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddress = addr.asReward();
        const stakeAddressBech32 = rewardAddress ? rewardAddress.toBech32() : addr.toString();

        ui.log(`Using reward address: ${stakeAddressBech32}`, 'info');

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .deregisterStakeAddress({
                rewardAddress: rewardAddress,
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('stakeDereg', unsignedTx);
        ui.logCbor('Stake Deregistration CBOR', unsignedTx);

        const details = formatTransaction(unsignedTx);
        let result = `Stake Deregistration Transaction Built\n\n${details}`;
        result += `\nReward Address: ${stakeAddressBech32}`;
        result += `\n\nNote: 2 ADA deposit will be returned`;

        ui.setTestResult('stake-dereg-tx', result, 'success');
        ui.log('Stake deregistration transaction built', 'success');

        ui.signStakeDeregTx.disabled = false;
        ui.submitStakeDeregTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('stake-dereg-tx', errorMsg, 'error');
        ui.log(`Stake deregistration build failed: ${err.message}`, 'error');
        clearPendingTransaction('stakeDereg');
        throw err;
    }
};

/**
 * Sign stake deregistration transaction
 */
export const signStakeDeregistrationTransaction = async () => {
    ui.log('Signing stake deregistration transaction...', 'info');
    ui.setTestResult('stake-dereg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('stakeDereg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('stakeDereg', signedTx);

        ui.setTestResult('stake-dereg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Stake deregistration signed', 'success');

        ui.signStakeDeregTx.disabled = true;
        ui.submitStakeDeregTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('stake-dereg-tx', errorMsg, 'error');
        ui.log(`Stake deregistration signing failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Submit stake deregistration transaction
 */
export const submitStakeDeregistrationTransaction = async () => {
    ui.log('Submitting stake deregistration transaction...', 'info');
    ui.setTestResult('stake-dereg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('stakeDereg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('stake-dereg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Stake deregistration submitted: ${txId}`, 'success');

        clearPendingTransaction('stakeDereg');
        ui.signStakeDeregTx.disabled = true;
        ui.submitStakeDeregTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('stake-dereg-tx', errorMsg, 'error');
        ui.log(`Stake deregistration submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Query stake key status from Blockfrost
 * Returns registration status, pool delegation, and DRep delegation
 */
export const queryStakeStatus = async () => {
    ui.log('Querying stake key status...', 'info');
    ui.setTestResult('stake-status', 'Querying blockchain...', 'pending');

    try {
        // Get reward address
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found');
        }

        // Convert to bech32 for Blockfrost API
        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddr = addr.asReward();
        const stakeAddress = rewardAddr ? rewardAddr.toBech32() : addr.toString();

        ui.log(`Querying stake address: ${stakeAddress}`, 'info');

        // Query Blockfrost directly for full account info
        // The provider's baseUrl includes the network path
        const baseUrl = state.provider.url || state.provider.baseUrl;
        const response = await fetch(`${baseUrl}accounts/${stakeAddress}`);

        let result = `Stake Address:\n${stakeAddress}\n\n`;

        if (response.status === 404) {
            result += `Status: NOT REGISTERED\n\n`;
            result += `The stake key is not registered on-chain.\nUse "Register Stake Key" to register.`;
            ui.setTestResult('stake-status', result, 'warning');
            ui.log('Stake key is not registered', 'warning');
            return { registered: false, stakeAddress };
        }

        if (!response.ok) {
            throw new Error(`Blockfrost API error: ${response.status}`);
        }

        const accountInfo = await response.json();

        // Parse account info - active field indicates registration status
        const isRegistered = accountInfo.active === true;
        result += `Status: ${isRegistered ? 'REGISTERED' : 'NOT REGISTERED'}\n\n`;

        // Controlled stake
        if (accountInfo.controlled_amount !== undefined) {
            const adaAmount = Number(accountInfo.controlled_amount) / 1_000_000;
            result += `Controlled Stake: ${adaAmount.toFixed(6)} ADA\n`;
        }

        // Pool delegation
        result += `\n--- Pool Delegation ---\n`;
        if (accountInfo.pool_id) {
            result += `Pool ID: ${accountInfo.pool_id}\n`;
        } else {
            result += `Not delegated to any pool\n`;
        }

        // DRep delegation (Voltaire era)
        result += `\n--- Vote Delegation ---\n`;
        if (accountInfo.drep_id) {
            if (accountInfo.drep_id === 'drep_always_abstain') {
                result += `DRep: Always Abstain\n`;
            } else if (accountInfo.drep_id === 'drep_always_no_confidence') {
                result += `DRep: Always No Confidence\n`;
            } else {
                result += `DRep ID: ${accountInfo.drep_id}\n`;
            }
        } else {
            result += `Not delegated to any DRep\n`;
        }

        // Rewards
        if (accountInfo.withdrawable_amount !== undefined) {
            const rewardsAda = Number(accountInfo.withdrawable_amount) / 1_000_000;
            result += `\n--- Rewards ---\n`;
            result += `Withdrawable: ${rewardsAda.toFixed(6)} ADA\n`;
        }

        // Reserves and treasury
        if (accountInfo.rewards_sum !== undefined) {
            const totalRewards = Number(accountInfo.rewards_sum) / 1_000_000;
            result += `Total Rewards Earned: ${totalRewards.toFixed(6)} ADA\n`;
        }

        ui.setTestResult('stake-status', result, 'success');
        ui.log('Stake status query complete', 'success');

        return {
            registered: true,
            stakeAddress,
            active: accountInfo.active,
            poolId: accountInfo.pool_id || null,
            drepId: accountInfo.drep_id || null,
            controlledAmount: accountInfo.controlled_amount,
            withdrawableAmount: accountInfo.withdrawable_amount,
        };
    } catch (err) {
        // Check if it's a "not found" error (stake key not registered)
        if (err.message?.includes('404') || err.message?.includes('not found')) {
            let result = `Stake Address Status: NOT REGISTERED\n\n`;
            result += `The stake key has not been registered on-chain yet.\n`;
            result += `Use "Register Stake Key" to register and enable staking.`;
            ui.setTestResult('stake-status', result, 'warning');
            ui.log('Stake key not registered (404)', 'warning');
            return { registered: false };
        }

        const errorMsg = `Query failed: ${err.message}`;
        ui.setTestResult('stake-status', errorMsg, 'error');
        ui.log(`Stake status query failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Get the CIP-95 API
 */
const getCip95Api = () => {
    if (!state.cip30Api) return null;
    return state.cip30Api.cip95 || state.cip30Api.experimental?.cip95 || null;
};

/**
 * Build a complex transaction with multiple governance elements
 * Includes: stake registration, stake delegation, rewards withdrawal (if any),
 * voting on governance action, and Info action proposal
 * @param {string} poolId - Pool ID for stake delegation
 * @param {string} govActionIdBech32 - Governance action ID to vote on
 * @param {string} voteChoice - Vote choice: 'yes', 'no', or 'abstain'
 */
export const buildComplexTransaction = async (poolId, govActionIdBech32, voteChoice) => {
    ui.log('Building complex transaction...', 'info');
    ui.setTestResult('complex-tx', 'Building transaction...', 'pending');

    try {
        if (!poolId) {
            throw new Error('Pool ID is required');
        }
        if (!govActionIdBech32) {
            throw new Error('Governance action ID is required');
        }

        // Get CIP-95 API for DRep key
        const cip95 = getCip95Api();
        if (!cip95) {
            throw new Error('CIP-95 extension not available. Wallet does not support governance.');
        }

        // Get reward address
        const rewardAddressesHex = await state.cip30Api.getRewardAddresses();
        if (!rewardAddressesHex || rewardAddressesHex.length === 0) {
            throw new Error('No reward addresses found');
        }

        const addr = Cometa.Address.fromHex(rewardAddressesHex[0]);
        const rewardAddress = addr.asReward();
        const stakeAddressBech32 = rewardAddress ? rewardAddress.toBech32() : addr.toString();

        ui.log(`Reward address: ${stakeAddressBech32}`, 'info');

        // Get DRep public key for voting
        const pubDRepKey = await cip95.getPubDRepKey();
        if (!pubDRepKey) {
            throw new Error('Could not get DRep public key from wallet');
        }

        const drepId = Cometa.cip129DRepFromPublicKey(pubDRepKey);
        ui.log(`DRep ID: ${drepId}`, 'info');

        // Query withdrawable rewards from Blockfrost
        let withdrawableAmount = 0n;
        try {
            const baseUrl = state.provider.url || state.provider.baseUrl;
            const response = await fetch(`${baseUrl}accounts/${stakeAddressBech32}`);
            if (response.ok) {
                const accountInfo = await response.json();
                if (accountInfo.withdrawable_amount) {
                    withdrawableAmount = BigInt(accountInfo.withdrawable_amount);
                    ui.log(`Withdrawable rewards: ${Number(withdrawableAmount) / 1_000_000} ADA`, 'info');
                }
            }
        } catch (err) {
            ui.log('Could not query rewards (stake key may not be registered yet)', 'warning');
        }

        // Parse governance action ID
        const govActionId = Cometa.govActionIdFromBech32(govActionIdBech32);

        // Map vote choice
        let vote;
        switch (voteChoice.toLowerCase()) {
            case 'yes':
                vote = Cometa.Vote.Yes;
                break;
            case 'no':
                vote = Cometa.Vote.No;
                break;
            case 'abstain':
                vote = Cometa.Vote.Abstain;
                break;
            default:
                throw new Error('Invalid vote choice. Must be yes, no, or abstain.');
        }

        // Create voter for voting procedure
        const voter = {
            credential: Cometa.dRepToCredential(drepId),
            type: Cometa.VoterType.DRepKeyHash
        };

        // Create voting procedure
        const votingProcedure = {
            vote: vote
        };

        // Info action anchor (placeholder metadata)
        const infoAnchor = {
            url: 'https://example.com/info-action.jsonld',
            dataHash: '0000000000000000000000000000000000000000000000000000000000000000'
        };

        // Get own address for outputs
        const addresses = await state.wallet.getUsedAddresses();
        const ownAddress = addressToBech32(addresses[0]);

        // Create a fake UTxO to cover the Info Action deposit (~100k ADA on mainnet)
        const fakeUtxo = {
            input: {
                txId: '0'.repeat(64),
                index: 0
            },
            output: {
                address: ownAddress,
                value: {
                    coins: 250_000_000_000n // 250k ADA to cover all deposits
                }
            }
        };

        // Get real UTxOs from wallet to add as inputs
        const walletUtxos = await state.wallet.getUnspentOutputs();
        const realUtxosToAdd = walletUtxos.slice(0, 3); // Add up to 3 real UTxOs

        ui.log(`Adding ${realUtxosToAdd.length} real UTxOs from wallet`, 'info');

        // Native script for minting (valid until far future)
        const mintingScript = {
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

        // Compute policy ID and asset ID for minting
        const policyId = Cometa.computeScriptHash(mintingScript);
        const tokenName = 'ComplexTestToken';
        const assetNameHex = Array.from(new TextEncoder().encode(tokenName))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const assetId = policyId + assetNameHex;
        const mintAmount = 1n;

        ui.log(`Minting token: ${tokenName} (Policy: ${policyId.substring(0, 20)}...)`, 'info');

        // Create CIP-25 metadata for the minted token
        const cip25Metadata = {
            [policyId]: {
                [tokenName]: {
                    name: tokenName,
                    image: 'ipfs://QmS7w3Q5oVL9NE1gJnsMVPp6fcxia1e38cRT5pE5mmxawL',
                    description: 'Complex transaction test token',
                    mediaType: 'image/png'
                }
            }
        };

        // Additional auxiliary metadata
        const auxMetadata = {
            msg: ['Complex Transaction Test'],
            timestamp: Date.now(),
            elements: ['stake_reg', 'stake_deleg', 'withdrawal', 'vote', 'info_action', 'mint']
        };

        // Build transaction with all elements
        const builder = await state.wallet.createTransactionBuilder();

        // Chain all operations - add fake UTxO and real UTxOs as inputs
        let txBuilder = builder
            .addInput({ utxo: fakeUtxo });

        // Add real UTxOs from wallet
        for (const utxo of realUtxosToAdd) {
            txBuilder = txBuilder.addInput({ utxo });
        }

        // Add metadata
        txBuilder = txBuilder
            .setMetadata({ tag: 721, metadata: cip25Metadata }) // CIP-25 NFT metadata
            .setMetadata({ tag: 674, metadata: auxMetadata });  // Custom metadata

        // Add minting
        txBuilder = txBuilder
            .mintToken({ amount: mintAmount, assetIdHex: assetId })
            .addScript(mintingScript)
            .sendValue({
                address: ownAddress,
                value: {
                    assets: { [assetId]: mintAmount },
                    coins: 2_000_000n // Min UTxO for token
                }
            });

        // Add governance operations
        txBuilder = txBuilder
            .registerStakeAddress({
                rewardAddress: rewardAddress,
            })
            .delegateStake({
                rewardAddress: rewardAddress,
                poolId: poolId,
            })
            .withdrawRewards({
                rewardAddress: rewardAddress,
                amount: withdrawableAmount, // Will be 0n if no rewards available
            });

        // Add vote
        txBuilder = txBuilder.vote({
            actionId: govActionId,
            voter: voter,
            votingProcedure: votingProcedure,
        });

        // Add Info governance action proposal
        txBuilder = txBuilder.proposeInfoAction({
            rewardAddress: rewardAddress,
            anchor: infoAnchor,
        });

        const unsignedTx = await txBuilder
            .expiresIn(3600)
            .build();

        setPendingTransaction('complex', unsignedTx);
        ui.logCbor('Complex Transaction CBOR', unsignedTx);

        let result = `Complex Transaction Built\n\n`;
        result += `--- Elements Included ---\n`;
        result += `1. Stake Key Registration (2 ADA deposit)\n`;
        result += `2. Stake Pool Delegation: ${poolId.substring(0, 30)}...\n`;
        result += `3. Rewards Withdrawal: ${Number(withdrawableAmount) / 1_000_000} ADA\n`;
        result += `4. Vote on ${govActionIdBech32.substring(0, 30)}...: ${voteChoice.toUpperCase()}\n`;
        result += `5. Info Action Proposal (100k ADA deposit on mainnet)\n`;
        result += `6. Mint Token: ${tokenName} (amount: ${mintAmount})\n`;
        result += `7. CIP-25 NFT Metadata (tag 721)\n`;
        result += `8. Custom Auxiliary Data (tag 674)\n`;
        result += `\n--- Inputs ---\n`;
        result += `Fake UTxO: 250k ADA (for deposits)\n`;
        result += `Real UTxOs: ${realUtxosToAdd.length} from wallet\n`;
        result += `\nReward Address: ${stakeAddressBech32.substring(0, 40)}...`;
        result += `\nDRep ID: ${drepId.substring(0, 40)}...`;
        result += `\nPolicy ID: ${policyId.substring(0, 40)}...`;

        ui.setTestResult('complex-tx', result, 'success');
        ui.log('Complex transaction built successfully', 'success');

        ui.signComplexTx.disabled = false;
        ui.submitComplexTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('complex-tx', errorMsg, 'error');
        ui.log(`Complex transaction build failed: ${err.message}`, 'error');
        clearPendingTransaction('complex');
        throw err;
    }
};

/**
 * Sign the pending complex transaction
 */
export const signComplexTransaction = async () => {
    ui.log('Signing complex transaction...', 'info');
    ui.setTestResult('complex-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('complex');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, true);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('complex', signedTx);

        let result = `Transaction Signed Successfully\n\n`;
        result += `Multiple certificates and voting procedure signed.\n`;
        result += `Ready to submit.`;

        ui.setTestResult('complex-tx', result, 'success');
        ui.log('Complex transaction signed successfully', 'success');

        ui.signComplexTx.disabled = true;
        ui.submitComplexTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('complex-tx', errorMsg, 'error');
        ui.log(`Complex transaction signing failed: ${err.message}`, 'error');

        if (err.code === 2 || err.message?.includes('declined') || err.message?.includes('reject')) {
            ui.log('User declined to sign the transaction', 'warning');
        }

        throw err;
    }
};

/**
 * Submit the signed complex transaction
 */
export const submitComplexTransaction = async () => {
    ui.log('Submitting complex transaction...', 'info');
    ui.setTestResult('complex-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('complex');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        let result = `Transaction Submitted!\n\n`;
        result += `Transaction ID:\n${txId}\n\n`;
        result += `Check explorer for:\n`;
        result += `- Stake key registration certificate\n`;
        result += `- Stake pool delegation certificate\n`;
        result += `- Rewards withdrawal (if any)\n`;
        result += `- Voting procedure\n`;
        result += `- Info action governance proposal`;

        ui.setTestResult('complex-tx', result, 'success');
        ui.log(`Complex transaction submitted: ${txId}`, 'success');

        clearPendingTransaction('complex');
        ui.signComplexTx.disabled = true;
        ui.submitComplexTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('complex-tx', errorMsg, 'error');
        ui.log(`Complex transaction submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Sign a raw transaction CBOR
 * @param {string} txCbor - Transaction CBOR hex string
 * @param {boolean} partialSign - Whether to allow partial signing
 */
export const signRawTransaction = async (txCbor, partialSign = false) => {
    ui.log(`Signing raw transaction (partialSign: ${partialSign})...`, 'info');
    ui.setTestResult('raw-tx', 'Requesting signature...', 'pending');

    try {
        if (!txCbor) {
            throw new Error('Transaction CBOR is required');
        }

        // Use raw CIP-30 API for direct CBOR signing
        const witnessSetCbor = await state.cip30Api.signTx(txCbor, partialSign);

        let result = `Transaction Signed Successfully\n\n`;
        result += `Witness Set (CBOR hex):\n${witnessSetCbor}`;

        ui.setTestResult('raw-tx', result, 'success');
        ui.log('Raw transaction signed successfully', 'success');

        return witnessSetCbor;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('raw-tx', errorMsg, 'error');
        ui.log(`Raw transaction signing failed: ${err.message}`, 'error');

        if (err.code === 2 || err.message?.includes('declined')) {
            ui.log('User declined to sign', 'warning');
        } else if (err.code === 1) {
            ui.log('Signing error - transaction may be invalid', 'error');
        }

        throw err;
    }
};
