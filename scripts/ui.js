/**
 * UI element references and helper functions
 */

// Connection section
export const networkSelect = document.getElementById('network-select');
export const walletSelect = document.getElementById('wallet-select');
export const refreshWalletsBtn = document.getElementById('refresh-wallets-btn');
export const connectBtn = document.getElementById('connect-btn');
export const disconnectBtn = document.getElementById('disconnect-btn');
export const connectionStatus = document.getElementById('connection-status');

// Sections
export const cip30BasicSection = document.getElementById('cip30-basic-section');
export const cip30AddressSection = document.getElementById('cip30-address-section');
export const cip08Section = document.getElementById('cip08-section');
export const cip95Section = document.getElementById('cip95-section');
export const cip142Section = document.getElementById('cip142-section');
export const txBuilderSection = document.getElementById('tx-builder-section');
export const govTxSection = document.getElementById('gov-tx-section');
export const rawTxSection = document.getElementById('raw-tx-section');

// CIP-30 Basic test buttons
export const testGetNetworkId = document.getElementById('test-getNetworkId');
export const testGetBalance = document.getElementById('test-getBalance');
export const testGetUtxos = document.getElementById('test-getUtxos');
export const testGetCollateral = document.getElementById('test-getCollateral');

// CIP-30 Address test buttons
export const testGetUsedAddresses = document.getElementById('test-getUsedAddresses');
export const testGetUnusedAddresses = document.getElementById('test-getUnusedAddresses');
export const testGetChangeAddress = document.getElementById('test-getChangeAddress');
export const testGetRewardAddresses = document.getElementById('test-getRewardAddresses');

// CIP-08 elements
export const signDataMessage = document.getElementById('sign-data-message');
export const signDataAddress = document.getElementById('sign-data-address');
export const testSignData = document.getElementById('test-signData');

// CIP-95 test buttons
export const testGetPubDRepKey = document.getElementById('test-getPubDRepKey');
export const testGetRegisteredPubStakeKeys = document.getElementById('test-getRegisteredPubStakeKeys');
export const testGetUnregisteredPubStakeKeys = document.getElementById('test-getUnregisteredPubStakeKeys');

// CIP-142 test buttons
export const testGetNetworkMagic = document.getElementById('test-getNetworkMagic');

// Simple transaction elements
export const simpleTxAddress = document.getElementById('simple-tx-address');
export const simpleTxAmount = document.getElementById('simple-tx-amount');
export const buildSimpleTx = document.getElementById('build-simple-tx');
export const signSimpleTx = document.getElementById('sign-simple-tx');
export const submitSimpleTx = document.getElementById('submit-simple-tx');

// Self transaction elements
export const selfTxAmount = document.getElementById('self-tx-amount');
export const buildSelfTx = document.getElementById('build-self-tx');
export const signSelfTx = document.getElementById('sign-self-tx');
export const submitSelfTx = document.getElementById('submit-self-tx');

// Governance transaction elements
export const queryStakeStatus = document.getElementById('query-stake-status');

export const buildStakeRegTx = document.getElementById('build-stake-reg-tx');
export const signStakeRegTx = document.getElementById('sign-stake-reg-tx');
export const submitStakeRegTx = document.getElementById('submit-stake-reg-tx');

export const buildStakeDeregTx = document.getElementById('build-stake-dereg-tx');
export const signStakeDeregTx = document.getElementById('sign-stake-dereg-tx');
export const submitStakeDeregTx = document.getElementById('submit-stake-dereg-tx');

export const drepIdInput = document.getElementById('drep-id-input');
export const buildVoteDelegTx = document.getElementById('build-vote-deleg-tx');
export const signVoteDelegTx = document.getElementById('sign-vote-deleg-tx');
export const submitVoteDelegTx = document.getElementById('submit-vote-deleg-tx');

export const poolIdInput = document.getElementById('pool-id-input');
export const buildStakeDelegTx = document.getElementById('build-stake-deleg-tx');
export const signStakeDelegTx = document.getElementById('sign-stake-deleg-tx');
export const submitStakeDelegTx = document.getElementById('submit-stake-deleg-tx');

// Script test elements
export const scriptSection = document.getElementById('script-section');
export const queryScriptBalance = document.getElementById('query-script-balance');
export const lockAmount = document.getElementById('lock-amount');
export const buildLockTx = document.getElementById('build-lock-tx');
export const signLockTx = document.getElementById('sign-lock-tx');
export const submitLockTx = document.getElementById('submit-lock-tx');
export const spendAmount = document.getElementById('spend-amount');
export const buildSpendTx = document.getElementById('build-spend-tx');
export const signSpendTx = document.getElementById('sign-spend-tx');
export const submitSpendTx = document.getElementById('submit-spend-tx');

// Minting test elements
export const mintSection = document.getElementById('mint-section');
export const nativeTokenName = document.getElementById('native-token-name');
export const nativeMintAmount = document.getElementById('native-mint-amount');
export const buildNativeMintTx = document.getElementById('build-native-mint-tx');
export const signNativeMintTx = document.getElementById('sign-native-mint-tx');
export const submitNativeMintTx = document.getElementById('submit-native-mint-tx');
export const plutusTokenName = document.getElementById('plutus-token-name');
export const plutusMintAmount = document.getElementById('plutus-mint-amount');
export const buildPlutusMintTx = document.getElementById('build-plutus-mint-tx');
export const signPlutusMintTx = document.getElementById('sign-plutus-mint-tx');
export const submitPlutusMintTx = document.getElementById('submit-plutus-mint-tx');

// Voting test elements
export const votingSection = document.getElementById('voting-section');
export const drepMetadataUrl = document.getElementById('drep-metadata-url');
export const drepMetadataHash = document.getElementById('drep-metadata-hash');
export const buildDRepRegTx = document.getElementById('build-drep-reg-tx');
export const signDRepRegTx = document.getElementById('sign-drep-reg-tx');
export const submitDRepRegTx = document.getElementById('submit-drep-reg-tx');
export const buildDRepDeregTx = document.getElementById('build-drep-dereg-tx');
export const signDRepDeregTx = document.getElementById('sign-drep-dereg-tx');
export const submitDRepDeregTx = document.getElementById('submit-drep-dereg-tx');
export const govActionId = document.getElementById('gov-action-id');
export const voteChoice = document.getElementById('vote-choice');
export const buildVoteTx = document.getElementById('build-vote-tx');
export const signVoteTx = document.getElementById('sign-vote-tx');
export const submitVoteTx = document.getElementById('submit-vote-tx');

// Raw transaction elements
export const rawTxCbor = document.getElementById('raw-tx-cbor');
export const partialSignCheckbox = document.getElementById('partial-sign-checkbox');
export const signRawTx = document.getElementById('sign-raw-tx');

// Log elements
export const logOutput = document.getElementById('log-output');
export const clearLogBtn = document.getElementById('clear-log-btn');
export const copyLogBtn = document.getElementById('copy-log-btn');
export const logSidebar = document.getElementById('log-section');
export const toggleLogBtn = document.getElementById('toggle-log-btn');
export const closeLogBtn = document.getElementById('close-log-btn');

/**
 * Log a message to the activity log
 * @param {string} message - Message to log
 * @param {string} type - Log type: 'info', 'success', 'error', 'warning'
 */
export const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${timestamp}] `;

    const msgSpan = document.createElement('span');
    msgSpan.className = `log-${type}`;
    msgSpan.textContent = message;

    entry.appendChild(timeSpan);
    entry.appendChild(msgSpan);
    logOutput.appendChild(entry);
    logOutput.scrollTop = logOutput.scrollHeight;
};

/**
 * Clear the activity log
 */
export const clearLog = () => {
    logOutput.innerHTML = '';
    log('Log cleared', 'info');
};

/**
 * Copy the log contents to clipboard
 */
export const copyLog = async () => {
    const text = logOutput.innerText;
    try {
        await navigator.clipboard.writeText(text);
        log('Log copied to clipboard', 'success');
    } catch (err) {
        log('Failed to copy log: ' + err.message, 'error');
    }
};

/**
 * Set test result content
 * @param {string} elementId - Result element ID (without 'result-' prefix)
 * @param {string} content - Content to display
 * @param {string} status - Status: 'success', 'error', 'pending', or ''
 */
export const setTestResult = (elementId, content, status = '') => {
    const element = document.getElementById(`result-${elementId}`);
    if (element) {
        element.textContent = content;
        element.className = 'test-result' + (element.classList.contains('large') ? ' large' : '') + (status ? ` ${status}` : '');
    }
};

/**
 * Clear a test result
 * @param {string} elementId - Result element ID (without 'result-' prefix)
 */
export const clearTestResult = (elementId) => {
    const element = document.getElementById(`result-${elementId}`);
    if (element) {
        element.textContent = '';
        element.className = 'test-result' + (element.classList.contains('large') ? ' large' : '');
    }
};

/**
 * Show connection status
 * @param {Object} info - Connection info object
 */
export const showConnectionStatus = (info) => {
    connectionStatus.classList.remove('hidden');
    connectionStatus.classList.add('connected');
    connectionStatus.innerHTML = `
        <div class="status-label">Connected to ${info.walletName}</div>
        <div class="status-value">Network: ${info.network} (ID: ${info.networkId})</div>
        <div class="status-value">Address: ${info.address}</div>
    `;
};

/**
 * Hide connection status
 */
export const hideConnectionStatus = () => {
    connectionStatus.classList.add('hidden');
    connectionStatus.classList.remove('connected');
    connectionStatus.innerHTML = '';
};

/**
 * Show all test sections
 */
export const showTestSections = () => {
    cip30BasicSection.classList.remove('hidden');
    cip30AddressSection.classList.remove('hidden');
    cip08Section.classList.remove('hidden');
    cip95Section.classList.remove('hidden');
    cip142Section.classList.remove('hidden');
    txBuilderSection.classList.remove('hidden');
    govTxSection.classList.remove('hidden');
    scriptSection.classList.remove('hidden');
    mintSection.classList.remove('hidden');
    votingSection.classList.remove('hidden');
    rawTxSection.classList.remove('hidden');
};

/**
 * Hide all test sections
 */
export const hideTestSections = () => {
    cip30BasicSection.classList.add('hidden');
    cip30AddressSection.classList.add('hidden');
    cip08Section.classList.add('hidden');
    cip95Section.classList.add('hidden');
    cip142Section.classList.add('hidden');
    txBuilderSection.classList.add('hidden');
    govTxSection.classList.add('hidden');
    scriptSection.classList.add('hidden');
    mintSection.classList.add('hidden');
    votingSection.classList.add('hidden');
    rawTxSection.classList.add('hidden');
};

/**
 * Reset UI to disconnected state
 */
export const resetUI = () => {
    // Reset connection controls
    connectBtn.disabled = false;
    disconnectBtn.classList.add('hidden');
    networkSelect.disabled = false;
    walletSelect.disabled = false;

    // Hide status and sections
    hideConnectionStatus();
    hideTestSections();

    // Reset transaction buttons
    signSimpleTx.disabled = true;
    submitSimpleTx.disabled = true;
    signSelfTx.disabled = true;
    submitSelfTx.disabled = true;
    signStakeRegTx.disabled = true;
    submitStakeRegTx.disabled = true;
    signStakeDeregTx.disabled = true;
    submitStakeDeregTx.disabled = true;
    signVoteDelegTx.disabled = true;
    submitVoteDelegTx.disabled = true;
    signStakeDelegTx.disabled = true;
    submitStakeDelegTx.disabled = true;

    // Reset script test buttons
    signLockTx.disabled = true;
    submitLockTx.disabled = true;
    signSpendTx.disabled = true;
    submitSpendTx.disabled = true;

    // Reset minting test buttons
    signNativeMintTx.disabled = true;
    submitNativeMintTx.disabled = true;
    signPlutusMintTx.disabled = true;
    submitPlutusMintTx.disabled = true;

    // Reset voting test buttons
    signDRepRegTx.disabled = true;
    submitDRepRegTx.disabled = true;
    signDRepDeregTx.disabled = true;
    submitDRepDeregTx.disabled = true;
    signVoteTx.disabled = true;
    submitVoteTx.disabled = true;

    // Clear all test results
    const results = document.querySelectorAll('.test-result');
    results.forEach(el => {
        el.textContent = '';
        el.className = el.className.replace(/\s*(success|error|pending)/g, '');
    });

    log('Wallet disconnected. Ready to reconnect.', 'info');
};

/**
 * Update wallet select with detected wallets
 * @param {Array} wallets - Array of wallet objects { name, icon, apiVersion }
 */
export const updateWalletSelect = (wallets) => {
    walletSelect.innerHTML = '';

    if (wallets.length === 0) {
        walletSelect.innerHTML = '<option value="">No wallets detected</option>';
        walletSelect.disabled = true;
        connectBtn.disabled = true;
        return;
    }

    wallets.forEach(wallet => {
        const option = document.createElement('option');
        option.value = wallet.name;
        option.textContent = `${wallet.displayName} (v${wallet.apiVersion})`;
        walletSelect.appendChild(option);
    });

    walletSelect.disabled = false;
    connectBtn.disabled = false;
};

// Initialize log control buttons
clearLogBtn?.addEventListener('click', clearLog);
copyLogBtn?.addEventListener('click', copyLog);

/**
 * Show log sidebar
 */
export const showLogSidebar = () => {
    logSidebar.classList.remove('collapsed', 'auto-collapsed');
};

/**
 * Hide log sidebar
 */
export const hideLogSidebar = () => {
    logSidebar.classList.add('collapsed');
};

/**
 * Handle responsive auto-collapse
 */
const handleResponsiveCollapse = () => {
    const isSmallScreen = window.innerWidth <= 1024;
    if (isSmallScreen && !logSidebar.classList.contains('collapsed')) {
        logSidebar.classList.add('auto-collapsed');
    } else if (!isSmallScreen) {
        logSidebar.classList.remove('auto-collapsed');
    }
};

// Initialize log sidebar toggle
toggleLogBtn?.addEventListener('click', showLogSidebar);
closeLogBtn?.addEventListener('click', hideLogSidebar);

// Handle responsive behavior
window.addEventListener('resize', handleResponsiveCollapse);

// Initial check for screen size
handleResponsiveCollapse();
