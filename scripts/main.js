/**
 * CIP-30 Compliance Testing Tool - Main Entry Point
 *
 * This is the main application entry point that:
 * - Initializes Cometa.js
 * - Sets up wallet detection
 * - Binds all event handlers
 */

import * as ui from './ui.js';
import { state } from './app-state.js';
import { detectWallets, waitForWallets } from './wallet-detector.js';
import { connectWallet, disconnectWallet, isConnected } from './handlers/connect-handler.js';
import * as cip30Tests from './handlers/cip30-tests.js';
import * as cip95Tests from './handlers/cip95-tests.js';
import * as txTests from './handlers/transaction-tests.js';
import { testSignData, computeDRepRepresentations, signDataWithDRep } from './handlers/sign-data-tests.js';
import * as scriptTests from './handlers/script-tests.js';
import * as votingTests from './handlers/voting-tests.js';

/**
 * Initialize the application
 */
const initializeApp = async () => {
    try {
        await Cometa.ready();
        const version = Cometa.getLibCardanoCVersion();
        ui.log(`Cometa.js ready (libcardano-c v${version})`, 'success');

        // Allow the network and wallet to be preselected via URL params
        // (?network=custom&wallet=lace). Handy for automated drivers that
        // target a fixed wallet + local devnet without clicking the
        // selects. Falls back to the dropdown defaults when absent. Network
        // is applied immediately (independent of wallet detection); wallet
        // is applied after detection populates the select below.
        const params = new URLSearchParams(window.location.search);
        const networkParam = params.get('network');
        if (networkParam) {
            const hasOption = [...ui.networkSelect.options].some(
                option => option.value === networkParam,
            );
            if (hasOption) ui.networkSelect.value = networkParam;
        }

        const wallets = await waitForWallets(3000);
        ui.updateWalletSelect(wallets);

        const walletParam = params.get('wallet');
        if (walletParam) {
            const hasWallet = [...ui.walletSelect.options].some(
                option => option.value === walletParam,
            );
            if (hasWallet) {
                ui.walletSelect.value = walletParam;
                ui.connectBtn.disabled = false;
            }
        }

        if (wallets.length > 0) {
            ui.log(`Found ${wallets.length} wallet(s). Select one and click "Connect Wallet".`, 'success');
        } else {
            ui.log('No wallets detected. Install a Cardano wallet extension.', 'warning');
        }
    } catch (err) {
        ui.log(`Initialization failed: ${err.message}`, 'error');
        console.error('Initialization error:', err);
    }
};

/**
 * Handle wallet connection
 */
const handleConnect = async () => {
    const walletName = ui.walletSelect.value;
    const network = ui.networkSelect.value;

    if (!walletName) {
        ui.log('Please select a wallet', 'warning');
        return;
    }

    // Disable UI during connection
    ui.connectBtn.disabled = true;
    ui.walletSelect.disabled = true;
    ui.networkSelect.disabled = true;

    try {
        const connectionInfo = await connectWallet(walletName, network);

        // Update UI for connected state
        ui.disconnectBtn.classList.remove('hidden');
        ui.showConnectionStatus(connectionInfo);
        ui.showTestSections();

        ui.log('Wallet connected! You can now run CIP-30 compliance tests.', 'success');

    } catch (err) {
        ui.log(`Connection failed: ${err.message}`, 'error');

        // Re-enable UI
        ui.connectBtn.disabled = false;
        ui.walletSelect.disabled = false;
        ui.networkSelect.disabled = false;
    }
};

/**
 * Handle wallet disconnection
 */
const handleDisconnect = () => {
    disconnectWallet();
    ui.resetUI();
};

/**
 * Handle wallet refresh
 */
const handleRefreshWallets = async () => {
    ui.log('Refreshing wallet list...', 'info');
    const wallets = await waitForWallets(2000);
    ui.updateWalletSelect(wallets);
};

/**
 * Wrapper for test functions to handle errors
 */
const runTest = async (testFn, ...args) => {
    if (!isConnected()) {
        ui.log('Please connect a wallet first', 'warning');
        return;
    }

    try {
        await testFn(...args);
    } catch (err) {
        // Error already logged by test function
        console.error('Test error:', err);
    }
};

/**
 * Set up all event handlers
 */
const setupEventHandlers = () => {
    // Connection handlers
    ui.connectBtn.addEventListener('click', handleConnect);
    ui.disconnectBtn.addEventListener('click', handleDisconnect);
    ui.refreshWalletsBtn.addEventListener('click', handleRefreshWallets);

    // CIP-30 Basic test handlers
    ui.testGetNetworkId.addEventListener('click', () => runTest(cip30Tests.testGetNetworkId));
    ui.testGetBalance.addEventListener('click', () => runTest(cip30Tests.testGetBalance));
    ui.testGetUtxos.addEventListener('click', () => runTest(cip30Tests.testGetUtxos));
    ui.testGetCollateral.addEventListener('click', () => runTest(cip30Tests.testGetCollateral));

    // CIP-30 Address test handlers
    ui.testGetUsedAddresses.addEventListener('click', () => runTest(cip30Tests.testGetUsedAddresses));
    ui.testGetUnusedAddresses.addEventListener('click', () => runTest(cip30Tests.testGetUnusedAddresses));
    ui.testGetChangeAddress.addEventListener('click', () => runTest(cip30Tests.testGetChangeAddress));
    ui.testGetRewardAddresses.addEventListener('click', () => runTest(cip30Tests.testGetRewardAddresses));

    // CIP-08 signData handler
    ui.testSignData.addEventListener('click', () => {
        const message = ui.signDataMessage.value || 'Hello Cardano!';
        const address = ui.signDataAddress.value || null;
        runTest(testSignData, message, address);
    });

    // CIP-08 sign with DRep ID handlers (CIP-95)
    ui.computeDRepIds.addEventListener('click', () => runTest(computeDRepRepresentations));
    const signWithDRep = (formatKey) => {
        const message = ui.signDataMessage.value || 'Hello Cardano!';
        runTest(signDataWithDRep, formatKey, message);
    };
    ui.signDRepCip129Bech32.addEventListener('click', () => signWithDRep('cip129Bech32'));
    ui.signDRepCip129Hex.addEventListener('click', () => signWithDRep('cip129Hex'));
    ui.signDRepCip105Bech32.addEventListener('click', () => signWithDRep('cip105Bech32'));
    ui.signDRepCip105Hex.addEventListener('click', () => signWithDRep('cip105Hex'));
    ui.signDRepType6.addEventListener('click', () => signWithDRep('type6Address'));

    // CIP-95 Governance test handlers
    ui.testGetPubDRepKey.addEventListener('click', () => runTest(cip95Tests.testGetPubDRepKey));
    ui.testGetRegisteredPubStakeKeys.addEventListener('click', () => runTest(cip95Tests.testGetRegisteredPubStakeKeys));
    ui.testGetUnregisteredPubStakeKeys.addEventListener('click', () => runTest(cip95Tests.testGetUnregisteredPubStakeKeys));

    // CIP-142 test handlers
    ui.testGetNetworkMagic.addEventListener('click', () => runTest(cip95Tests.testGetNetworkMagic));

    // Simple transaction handlers
    ui.buildSimpleTx.addEventListener('click', () => {
        const address = ui.simpleTxAddress.value;
        const amount = parseFloat(ui.simpleTxAmount.value) || 0;
        runTest(txTests.buildSimpleTransaction, address, amount);
    });
    ui.signSimpleTx.addEventListener('click', () => runTest(txTests.signSimpleTransaction));
    ui.submitSimpleTx.addEventListener('click', () => runTest(txTests.submitSimpleTransaction));

    // Self transaction handlers
    ui.buildSelfTx.addEventListener('click', () => {
        const amount = parseFloat(ui.selfTxAmount.value) || 0;
        runTest(txTests.buildSelfTransaction, amount);
    });
    ui.signSelfTx.addEventListener('click', () => runTest(txTests.signSelfTransaction));
    ui.submitSelfTx.addEventListener('click', () => runTest(txTests.submitSelfTransaction));

    // Stake status query handler
    ui.queryStakeStatus.addEventListener('click', () => runTest(txTests.queryStakeStatus));

    // Stake registration handlers
    ui.buildStakeRegTx.addEventListener('click', () => runTest(txTests.buildStakeRegistrationTransaction));
    ui.signStakeRegTx.addEventListener('click', () => runTest(txTests.signStakeRegistrationTransaction));
    ui.submitStakeRegTx.addEventListener('click', () => runTest(txTests.submitStakeRegistrationTransaction));

    // Stake deregistration handlers
    ui.buildStakeDeregTx.addEventListener('click', () => runTest(txTests.buildStakeDeregistrationTransaction));
    ui.signStakeDeregTx.addEventListener('click', () => runTest(txTests.signStakeDeregistrationTransaction));
    ui.submitStakeDeregTx.addEventListener('click', () => runTest(txTests.submitStakeDeregistrationTransaction));

    // Vote delegation handlers
    ui.buildVoteDelegTx.addEventListener('click', () => {
        const drepId = ui.drepIdInput.value;
        runTest(txTests.buildVoteDelegationTransaction, drepId);
    });
    ui.signVoteDelegTx.addEventListener('click', () => runTest(txTests.signVoteDelegationTransaction));
    ui.submitVoteDelegTx.addEventListener('click', () => runTest(txTests.submitVoteDelegationTransaction));

    // Stake delegation handlers
    ui.buildStakeDelegTx.addEventListener('click', () => {
        const poolId = ui.poolIdInput.value;
        runTest(txTests.buildStakeDelegationTransaction, poolId);
    });
    ui.signStakeDelegTx.addEventListener('click', () => runTest(txTests.signStakeDelegationTransaction));
    ui.submitStakeDelegTx.addEventListener('click', () => runTest(txTests.submitStakeDelegationTransaction));

    // Raw transaction signing handler
    ui.signRawTx.addEventListener('click', () => {
        const txCbor = ui.rawTxCbor.value;
        const partialSign = ui.partialSignCheckbox.checked;
        runTest(txTests.signRawTransaction, txCbor, partialSign);
    });

    // Script test handlers
    ui.queryScriptBalance.addEventListener('click', () => runTest(scriptTests.queryScriptBalance));
    ui.buildLockTx.addEventListener('click', () => {
        const amount = parseFloat(ui.lockAmount.value) || 0;
        runTest(scriptTests.buildLockTransaction, amount);
    });
    ui.signLockTx.addEventListener('click', () => runTest(scriptTests.signLockTransaction));
    ui.submitLockTx.addEventListener('click', () => runTest(scriptTests.submitLockTransaction));
    ui.buildSpendTx.addEventListener('click', () => {
        const amount = parseFloat(ui.spendAmount.value) || 0;
        runTest(scriptTests.buildSpendTransaction, amount);
    });
    ui.signSpendTx.addEventListener('click', () => runTest(scriptTests.signSpendTransaction));
    ui.submitSpendTx.addEventListener('click', () => runTest(scriptTests.submitSpendTransaction));

    // Native minting handlers
    ui.buildNativeMintTx.addEventListener('click', () => {
        const tokenName = ui.nativeTokenName.value || 'TestToken';
        const amount = parseInt(ui.nativeMintAmount.value) || 1;
        runTest(scriptTests.buildNativeMintTransaction, tokenName, amount);
    });
    ui.signNativeMintTx.addEventListener('click', () => runTest(scriptTests.signNativeMintTransaction));
    ui.submitNativeMintTx.addEventListener('click', () => runTest(scriptTests.submitNativeMintTransaction));

    // Plutus minting handlers
    ui.buildPlutusMintTx.addEventListener('click', () => {
        const tokenName = ui.plutusTokenName.value || 'PlutusToken';
        const amount = parseInt(ui.plutusMintAmount.value) || 1;
        runTest(scriptTests.buildPlutusMintTransaction, tokenName, amount);
    });
    ui.signPlutusMintTx.addEventListener('click', () => runTest(scriptTests.signPlutusMintTransaction));
    ui.submitPlutusMintTx.addEventListener('click', () => runTest(scriptTests.submitPlutusMintTransaction));

    // DRep registration handlers
    ui.buildDRepRegTx.addEventListener('click', () => {
        const metadataUrl = ui.drepMetadataUrl.value || '';
        const metadataHash = ui.drepMetadataHash.value || '';
        runTest(votingTests.buildRegisterDRepTransaction, metadataUrl, metadataHash);
    });
    ui.signDRepRegTx.addEventListener('click', () => runTest(votingTests.signRegisterDRepTransaction));
    ui.submitDRepRegTx.addEventListener('click', () => runTest(votingTests.submitRegisterDRepTransaction));

    // DRep deregistration handlers
    ui.buildDRepDeregTx.addEventListener('click', () => runTest(votingTests.buildDeregisterDRepTransaction));
    ui.signDRepDeregTx.addEventListener('click', () => runTest(votingTests.signDeregisterDRepTransaction));
    ui.submitDRepDeregTx.addEventListener('click', () => runTest(votingTests.submitDeregisterDRepTransaction));

    // Vote handlers
    ui.buildVoteTx.addEventListener('click', () => {
        const govActionId = ui.govActionId.value;
        const vote = ui.voteChoice.value;
        runTest(votingTests.buildVoteTransaction, govActionId, vote);
    });
    ui.signVoteTx.addEventListener('click', () => runTest(votingTests.signVoteTransaction));
    ui.submitVoteTx.addEventListener('click', () => runTest(votingTests.submitVoteTransaction));

    // Complex transaction handlers
    ui.buildComplexTx.addEventListener('click', () => {
        const poolId = ui.complexPoolId.value;
        const govActionId = ui.complexGovActionId.value;
        const voteChoice = ui.complexVoteChoice.value;
        runTest(txTests.buildComplexTransaction, poolId, govActionId, voteChoice);
    });
    ui.signComplexTx.addEventListener('click', () => runTest(txTests.signComplexTransaction));
    ui.submitComplexTx.addEventListener('click', () => runTest(txTests.submitComplexTransaction));
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupEventHandlers();
        initializeApp();
    });
} else {
    setupEventHandlers();
    initializeApp();
}
