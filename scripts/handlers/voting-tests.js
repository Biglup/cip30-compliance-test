/**
 * Voting Tests - DRep Registration and Governance Voting
 * Tests for Voltaire era governance participation
 */

import { state, setPendingTransaction, getPendingTransaction, clearPendingTransaction } from '../app-state.js';
import * as ui from '../ui.js';

// Default DRep anchor metadata
const DEFAULT_ANCHOR = {
    dataHash: '0000000000000000000000000000000000000000000000000000000000000000',
    url: 'https://example.com/drep-metadata.jsonld'
};

/**
 * Get the CIP-95 API
 */
const getCip95Api = () => {
    if (!state.cip30Api) return null;
    return state.cip30Api.cip95 || state.cip30Api.experimental?.cip95 || null;
};

/**
 * Register as a DRep (using wallet's DRep key)
 */
export const buildRegisterDRepTransaction = async (metadataUrl, metadataHash) => {
    ui.log('Building DRep registration transaction...', 'info');
    ui.setTestResult('drep-reg-tx', 'Building transaction...', 'pending');

    try {
        const cip95 = getCip95Api();
        if (!cip95) {
            throw new Error('CIP-95 extension not available. Wallet does not support governance.');
        }

        // Get DRep public key from wallet
        const pubDRepKey = await cip95.getPubDRepKey();
        if (!pubDRepKey) {
            throw new Error('Could not get DRep public key from wallet');
        }

        ui.log(`DRep Public Key: ${pubDRepKey.substring(0, 32)}...`, 'info');

        // Create DRep ID from public key
        const drepId = Cometa.cip129DRepFromPublicKey(pubDRepKey);

        ui.log(`DRep ID: ${drepId}`, 'info');

        // Create anchor
        const anchor = {
            url: metadataUrl || DEFAULT_ANCHOR.url,
            dataHash: metadataHash || DEFAULT_ANCHOR.dataHash
        };

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .registerDRep({
                drepId: drepId,
                anchor: anchor
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('drepReg', unsignedTx);

        let result = `DRep Registration Transaction Built\n\n`;
        result += `DRep ID: ${drepId}\n`;
        result += `Metadata URL: ${anchor.url}\n`;
        result += `\nNote: Requires deposit (check protocol parameters)`;

        ui.setTestResult('drep-reg-tx', result, 'success');
        ui.log('DRep registration transaction built', 'success');

        ui.signDRepRegTx.disabled = false;
        ui.submitDRepRegTx.disabled = true;

        // Store DRep ID for later use
        state.drepId = drepId;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('drep-reg-tx', errorMsg, 'error');
        ui.log(`DRep registration build failed: ${err.message}`, 'error');
        clearPendingTransaction('drepReg');
        throw err;
    }
};

export const signRegisterDRepTransaction = async () => {
    ui.log('Signing DRep registration transaction...', 'info');
    ui.setTestResult('drep-reg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('drepReg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('drepReg', signedTx);

        ui.setTestResult('drep-reg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('DRep registration signed', 'success');

        ui.signDRepRegTx.disabled = true;
        ui.submitDRepRegTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('drep-reg-tx', errorMsg, 'error');
        ui.log(`DRep registration signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitRegisterDRepTransaction = async () => {
    ui.log('Submitting DRep registration transaction...', 'info');
    ui.setTestResult('drep-reg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('drepReg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('drep-reg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`DRep registration submitted: ${txId}`, 'success');

        clearPendingTransaction('drepReg');
        ui.signDRepRegTx.disabled = true;
        ui.submitDRepRegTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('drep-reg-tx', errorMsg, 'error');
        ui.log(`DRep registration submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Deregister as a DRep
 */
export const buildDeregisterDRepTransaction = async () => {
    ui.log('Building DRep deregistration transaction...', 'info');
    ui.setTestResult('drep-dereg-tx', 'Building transaction...', 'pending');

    try {
        const cip95 = getCip95Api();
        if (!cip95) {
            throw new Error('CIP-95 extension not available');
        }

        // Get DRep public key
        const pubDRepKey = await cip95.getPubDRepKey();
        if (!pubDRepKey) {
            throw new Error('Could not get DRep public key from wallet');
        }

        const drepId = Cometa.cip129DRepFromPublicKey(pubDRepKey);

        ui.log(`Deregistering DRep: ${drepId}`, 'info');

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .deregisterDRep({ drepId: drepId })
            .expiresIn(3600)
            .build();

        setPendingTransaction('drepDereg', unsignedTx);

        let result = `DRep Deregistration Transaction Built\n\n`;
        result += `DRep ID: ${drepId}\n`;
        result += `\nNote: Deposit will be returned`;

        ui.setTestResult('drep-dereg-tx', result, 'success');
        ui.log('DRep deregistration transaction built', 'success');

        ui.signDRepDeregTx.disabled = false;
        ui.submitDRepDeregTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('drep-dereg-tx', errorMsg, 'error');
        ui.log(`DRep deregistration build failed: ${err.message}`, 'error');
        clearPendingTransaction('drepDereg');
        throw err;
    }
};

export const signDeregisterDRepTransaction = async () => {
    ui.log('Signing DRep deregistration transaction...', 'info');
    ui.setTestResult('drep-dereg-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('drepDereg');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('drepDereg', signedTx);

        ui.setTestResult('drep-dereg-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('DRep deregistration signed', 'success');

        ui.signDRepDeregTx.disabled = true;
        ui.submitDRepDeregTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('drep-dereg-tx', errorMsg, 'error');
        ui.log(`DRep deregistration signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitDeregisterDRepTransaction = async () => {
    ui.log('Submitting DRep deregistration transaction...', 'info');
    ui.setTestResult('drep-dereg-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('drepDereg');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('drep-dereg-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`DRep deregistration submitted: ${txId}`, 'success');

        clearPendingTransaction('drepDereg');
        ui.signDRepDeregTx.disabled = true;
        ui.submitDRepDeregTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('drep-dereg-tx', errorMsg, 'error');
        ui.log(`DRep deregistration submission failed: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Vote on a governance proposal
 */
export const buildVoteTransaction = async (govActionIdBech32, voteChoice) => {
    ui.log(`Building vote transaction: ${voteChoice} on ${govActionIdBech32}...`, 'info');
    ui.setTestResult('vote-tx', 'Building transaction...', 'pending');

    try {
        if (!govActionIdBech32) {
            throw new Error('Governance action ID is required');
        }

        const cip95 = getCip95Api();
        if (!cip95) {
            throw new Error('CIP-95 extension not available');
        }

        // Get DRep public key
        const pubDRepKey = await cip95.getPubDRepKey();
        if (!pubDRepKey) {
            throw new Error('Could not get DRep public key from wallet');
        }

        const drepId = Cometa.cip129DRepFromPublicKey(pubDRepKey);

        // Parse governance action ID
        const govActionId = Cometa.govActionIdFromBech32(govActionIdBech32);

        ui.log(`Voting as DRep: ${drepId}`, 'info');
        ui.log(`On action: ${govActionIdBech32}`, 'info');

        // Map vote choice to Cometa.Vote enum
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

        // Create voter
        const voter = {
            credential: Cometa.dRepToCredential(drepId),
            type: Cometa.VoterType.DRepKeyHash
        };

        // Create voting procedure
        const votingProcedure = {
            vote: vote
        };

        const builder = await state.wallet.createTransactionBuilder();

        const unsignedTx = await builder
            .vote({
                actionId: govActionId,
                voter: voter,
                votingProcedure: votingProcedure
            })
            .expiresIn(3600)
            .build();

        setPendingTransaction('vote', unsignedTx);

        let result = `Vote Transaction Built\n\n`;
        result += `DRep ID: ${drepId}\n`;
        result += `Action ID: ${govActionIdBech32.substring(0, 40)}...\n`;
        result += `Vote: ${voteChoice.toUpperCase()}`;

        ui.setTestResult('vote-tx', result, 'success');
        ui.log('Vote transaction built', 'success');

        ui.signVoteTx.disabled = false;
        ui.submitVoteTx.disabled = true;

        return unsignedTx;
    } catch (err) {
        const errorMsg = `Build failed: ${err.message}`;
        ui.setTestResult('vote-tx', errorMsg, 'error');
        ui.log(`Vote transaction build failed: ${err.message}`, 'error');
        clearPendingTransaction('vote');
        throw err;
    }
};

export const signVoteTransaction = async () => {
    ui.log('Signing vote transaction...', 'info');
    ui.setTestResult('vote-tx', 'Requesting signature...', 'pending');

    const unsignedTx = getPendingTransaction('vote');
    if (!unsignedTx) {
        throw new Error('No pending transaction to sign');
    }

    try {
        const witnessSet = await state.wallet.signTransaction(unsignedTx, false);
        const signedTx = Cometa.applyVkeyWitnessSet(unsignedTx, witnessSet);

        setPendingTransaction('vote', signedTx);

        ui.setTestResult('vote-tx', 'Transaction Signed Successfully\n\nReady to submit.', 'success');
        ui.log('Vote transaction signed', 'success');

        ui.signVoteTx.disabled = true;
        ui.submitVoteTx.disabled = false;

        return signedTx;
    } catch (err) {
        const errorMsg = `Sign failed: ${err.message}`;
        ui.setTestResult('vote-tx', errorMsg, 'error');
        ui.log(`Vote transaction signing failed: ${err.message}`, 'error');
        throw err;
    }
};

export const submitVoteTransaction = async () => {
    ui.log('Submitting vote transaction...', 'info');
    ui.setTestResult('vote-tx', 'Submitting to network...', 'pending');

    const signedTx = getPendingTransaction('vote');
    if (!signedTx) {
        throw new Error('No signed transaction to submit');
    }

    try {
        const txId = await state.wallet.submitTransaction(signedTx);

        ui.setTestResult('vote-tx', `Transaction Submitted!\n\nTransaction ID:\n${txId}`, 'success');
        ui.log(`Vote submitted: ${txId}`, 'success');

        clearPendingTransaction('vote');
        ui.signVoteTx.disabled = true;
        ui.submitVoteTx.disabled = true;

        return txId;
    } catch (err) {
        const errorMsg = `Submit failed: ${err.message}`;
        ui.setTestResult('vote-tx', errorMsg, 'error');
        ui.log(`Vote submission failed: ${err.message}`, 'error');
        throw err;
    }
};
