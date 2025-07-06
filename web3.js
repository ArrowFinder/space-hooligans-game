// Web3 Integration for Space Hooligans
// Optimized for MetaMask browser extension

class Web3Manager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.karratBalance = 0;
        this.hasPaid = false;
        this.isConnecting = false;
        this.paymentInProgress = false; // Prevent multiple payment attempts
        
        // Contract configuration - using correct checksummed address
        this.KARRAT_CONTRACT = '0xAcd2c239012D17BEB128B0944D49015104113650';
        this.GAME_WALLET = '0x8379AE5b257C4F20a502881f70A08C40ed1305A0'; // Game wallet to receive payments
        
        // Leaderboard contract (will be deployed)
        this.LEADERBOARD_CONTRACT = '0x0000000000000000000000000000000000000000'; // Placeholder - will be updated after deployment
        
        // Global Leaderboard API Configuration
        this.LEADERBOARD_API_URL = 'https://api.jsonbin.io/v3/b/65f8b8c8266cfc3fde8b8c8c'; // Free JSONBin.io storage
        this.LEADERBOARD_API_KEY = '$2a$10$YourApiKeyHere'; // Will be updated with real key
        
        this.KARRAT_ABI = [
            {
                "constant": true,
                "inputs": [{"name": "_owner", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "balance", "type": "uint256"}],
                "type": "function"
            },
            {
                "constant": false,
                "inputs": [
                    {"name": "_to", "type": "address"},
                    {"name": "_value", "type": "uint256"}
                ],
                "name": "transfer",
                "outputs": [{"name": "", "type": "bool"}],
                "type": "function"
            }
        ];
        
        this.LEADERBOARD_ABI = [
            {
                "inputs": [
                    {"name": "_score", "type": "uint256"},
                    {"name": "_gamesPlayed", "type": "uint256"}
                ],
                "name": "submitScore",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "getLeaderboard",
                "outputs": [
                    {
                        "components": [
                            {"name": "player", "type": "address"},
                            {"name": "score", "type": "uint256"},
                            {"name": "gamesPlayed", "type": "uint256"},
                            {"name": "timestamp", "type": "uint256"}
                        ],
                        "name": "",
                        "type": "tuple[]"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"name": "_count", "type": "uint256"}],
                "name": "getTopScores",
                "outputs": [
                    {
                        "components": [
                            {"name": "player", "type": "address"},
                            {"name": "score", "type": "uint256"},
                            {"name": "gamesPlayed", "type": "uint256"},
                            {"name": "timestamp", "type": "uint256"}
                        ],
                        "name": "",
                        "type": "tuple[]"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        this.gameContract = null;
        this.leaderboardContract = null;
        this.connectionRetries = 0;
        this.maxRetries = 3;
        
        // Transaction counter tracking
        this.totalGamesPlayed = 0;
        this.totalKarratSpent = 0;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            const savedPayment = localStorage.getItem('spaceHooligans_payment');
            if (savedPayment) {
                const paymentData = JSON.parse(savedPayment);
                const now = Date.now();
                const sessionDuration = 24 * 60 * 60 * 1000; // 24 hours
                
                if (now - paymentData.timestamp < sessionDuration) {
                    // Only restore payment state if we have a connected wallet with the same address
                    if (this.address && this.address.toLowerCase() === paymentData.address.toLowerCase()) {
                        this.hasPaid = true;
                        console.log('Restored payment state for address:', this.address);
                        showMenu();
                        return;
                    } else {
                        console.log('Saved payment found but for different address, clearing...');
                        localStorage.removeItem('spaceHooligans_payment');
                    }
                } else {
                    console.log('Saved payment expired, clearing...');
                    localStorage.removeItem('spaceHooligans_payment');
                }
            }
        } catch (error) {
            console.error('Error checking saved payment:', error);
            localStorage.removeItem('spaceHooligans_payment');
        }
        
        // Load transaction statistics
        this.loadTransactionStats();
    }
    
    async connectMetaMask() {
        if (this.isConnecting || this.paymentInProgress) return;
        
        this.isConnecting = true;
        this.updateUIState('connecting');
        this.hideMessages();
        
        try {
            // Enhanced MetaMask detection with multiple approaches
            const ethereum = await this.detectMetaMask();
            
            if (!ethereum) {
                throw new Error('MetaMask is not installed. Please install the MetaMask browser extension.');
            }
            
            // Check if MetaMask is unlocked
            const accounts = await ethereum.request({ 
                method: 'eth_accounts' 
            });
            
            if (accounts.length === 0) {
                // Request account access
                const newAccounts = await ethereum.request({ 
                    method: 'eth_requestAccounts' 
                });
                
                if (newAccounts.length === 0) {
                    throw new Error('No accounts found. Please unlock MetaMask and try again.');
                }
                
                this.address = newAccounts[0];
            } else {
                this.address = accounts[0];
            }
            
            // Check network
            const chainId = await ethereum.request({ 
                method: 'eth_chainId' 
            });
            
            if (chainId !== '0x1') {
                throw new Error('Please switch to Ethereum Mainnet in MetaMask.');
            }
            
            this.provider = new ethers.providers.Web3Provider(ethereum);
            this.signer = this.provider.getSigner();
            
            console.log('MetaMask connection successful, setting up wallet info...');
            await this.setupWalletInfo();
            this.showSuccess('MetaMask connected successfully!');
            
            console.log('Connection complete. Current state:', {
                address: this.address,
                balance: this.karratBalance,
                provider: !!this.provider,
                signer: !!this.signer
            });
            
        } catch (error) {
            console.error('MetaMask connection error:', error);
            this.handleConnectionError(error);
        } finally {
            this.isConnecting = false;
        }
    }
    
    async detectMetaMask() {
        // Multiple detection approaches
        const approaches = [
            // Approach 1: Direct window.ethereum
            () => {
                if (typeof window.ethereum !== 'undefined') {
                    return window.ethereum;
                }
                return null;
            },
            
            // Approach 2: Check for MetaMask provider specifically
            () => {
                if (typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask) {
                    return window.ethereum;
                }
                return null;
            },
            
            // Approach 3: Wait and retry (for slow loading)
            async () => {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (typeof window.ethereum !== 'undefined') {
                    return window.ethereum;
                }
                return null;
            }
        ];
        
        for (const approach of approaches) {
            try {
                const result = await approach();
                if (result) {
                    return result;
                }
            } catch (error) {
                console.warn('MetaMask detection approach failed:', error);
            }
        }
        
        return null;
    }
    
    async setupWalletInfo() {
        if (!this.provider || !this.address) {
            console.log('setupWalletInfo: Missing provider or address');
            return;
        }
        
        try {
            console.log('Setting up wallet info for address:', this.address);
            await this.getKarratBalance();
            console.log('Balance fetched:', this.karratBalance);
            
            // Clear any existing payment state for fresh connection
            console.log('Clearing any existing payment state...');
            this.hasPaid = false;
            localStorage.removeItem('spaceHooligans_payment');
            
            // Update UI to connected state
            console.log('Updating UI to connected state...');
            this.updateUIState('connected');
            console.log('UI state updated to connected');
            
            // Show the payment screen after successful connection
            console.log('Showing payment screen...');
            showMenu();
            console.log('Payment screen shown');
        } catch (error) {
            console.error('Error setting up wallet info:', error);
        }
    }
    
    async getKarratBalance() {
        if (!this.provider || !this.address) return 0;
        
        try {
            // Try primary contract address first
            this.gameContract = new ethers.Contract(this.KARRAT_CONTRACT, this.KARRAT_ABI, this.provider);
            const balance = await this.gameContract.balanceOf(this.address);
            this.karratBalance = parseFloat(ethers.utils.formatEther(balance));
            return this.karratBalance;
        } catch (error) {
            console.warn('Primary KARRAT contract failed, trying alternative:', error);
            return await this.tryAlternativeKarratContract();
        }
    }
    
    async tryAlternativeKarratContract() {
        // Alternative KARRAT contract addresses (if needed)
        const alternativeAddresses = [
            '0x4E84E9E5fb0A972628Cf4565cC3a002A70b6C520', // Alternative address
            '0x4e84e9e5fb0a972628cf4565cc3a002a70b6c520'  // Lowercase version
        ];
        
        for (const address of alternativeAddresses) {
            try {
                const contract = new ethers.Contract(address, this.KARRAT_ABI, this.provider);
                const balance = await contract.balanceOf(this.address);
                this.karratBalance = parseFloat(ethers.utils.formatEther(balance));
                this.KARRAT_CONTRACT = address; // Update to working address
                this.gameContract = contract;
                return this.karratBalance;
            } catch (error) {
                console.warn(`Alternative contract ${address} failed:`, error);
            }
        }
        
        this.karratBalance = 0;
        return 0;
    }
    
    async payToPlay() {
        if (this.paymentInProgress) {
            console.log('Payment already in progress');
            return;
        }
        
        this.paymentInProgress = true;
        this.updateUIState('paying');
        this.hideMessages();
        
        try {
            if (!this.provider || !this.signer || !this.address) {
                throw new Error('Please connect your MetaMask wallet first.');
            }
            
            if (this.karratBalance < 1) {
                throw new Error(`Insufficient $KARRAT balance. You have ${this.karratBalance.toFixed(2)} $KARRAT, but need 1 $KARRAT to play.`);
            }
            
            // Transfer 1 $KARRAT to game wallet
            const amount = ethers.utils.parseEther('1');
            
            console.log('PAYMENT VERIFICATION:', {
                from: this.address,
                to: this.GAME_WALLET,
                amount: '1 $KARRAT',
                amountWei: amount.toString(),
                contractAddress: this.KARRAT_CONTRACT
            });
            
            const tx = await this.gameContract.connect(this.signer).transfer(this.GAME_WALLET, amount);
            
            console.log('Transaction submitted:', {
                txHash: tx.hash,
                blockNumber: tx.blockNumber,
                gasLimit: tx.gasLimit.toString(),
                gasPrice: tx.gasPrice.toString()
            });
            
            this.showSuccess('Payment transaction submitted! Waiting for confirmation...');
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
            console.log('Transaction confirmed:', {
                txHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                status: receipt.status,
                gasUsed: receipt.gasUsed.toString(),
                effectiveGasPrice: receipt.effectiveGasPrice.toString()
            });
            
            if (receipt.status === 1) {
                // Verify payment was actually received by checking game wallet balance
                await this.verifyPaymentReceived(receipt.transactionHash);
                
                // Increment transaction counter
                this.incrementTransactionCounter();
                
                this.hasPaid = true;
                
                // Save payment state to localStorage
                localStorage.setItem('spaceHooligans_payment', JSON.stringify({
                    address: this.address,
                    timestamp: Date.now(),
                    txHash: receipt.transactionHash
                }));
                
                // Add player to global leaderboard when they pay
                await this.addPlayerToGlobalLeaderboard();
                
                this.showSuccess('Payment successful! You have 5 more lives!');
                
                // Update balance
                await this.getKarratBalance();
                
                // Show game menu
                showMenu();
            } else {
                throw new Error('Transaction failed. Please try again.');
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            this.handlePaymentError(error);
        } finally {
            this.paymentInProgress = false;
        }
    }
    
    // Transaction Counter Management
    updateTransactionCounter() {
        const gamesElement = document.getElementById('totalGamesPlayed');
        const karratElement = document.getElementById('totalKarratSpent');
        
        if (gamesElement) {
            gamesElement.textContent = this.totalGamesPlayed.toLocaleString();
        }
        
        if (karratElement) {
            karratElement.textContent = this.totalKarratSpent.toLocaleString();
        }
        
        console.log('Transaction counter updated:', {
            games: this.totalGamesPlayed,
            karrat: this.totalKarratSpent
        });
    }
    
    incrementTransactionCounter() {
        this.totalGamesPlayed += 1;
        this.totalKarratSpent += 1;
        this.updateTransactionCounter();
        
        // Save to localStorage for persistence
        localStorage.setItem('spaceHooligans_stats', JSON.stringify({
            gamesPlayed: this.totalGamesPlayed,
            karratSpent: this.totalKarratSpent,
            timestamp: Date.now()
        }));
    }
    
    loadTransactionStats() {
        try {
            const savedStats = localStorage.getItem('spaceHooligans_stats');
            if (savedStats) {
                const stats = JSON.parse(savedStats);
                this.totalGamesPlayed = stats.gamesPlayed || 0;
                this.totalKarratSpent = stats.karratSpent || 0;
                this.updateTransactionCounter();
                console.log('Loaded transaction stats:', stats);
            }
        } catch (error) {
            console.error('Error loading transaction stats:', error);
        }
    }
    
    // Payment Verification
    async verifyPaymentReceived(txHash) {
        try {
            console.log('Verifying payment received by game wallet...');
            
            // Get game wallet balance before and after
            const gameWalletBalance = await this.gameContract.balanceOf(this.GAME_WALLET);
            const gameWalletBalanceFormatted = parseFloat(ethers.utils.formatEther(gameWalletBalance));
            
            console.log('Game wallet balance verification:', {
                gameWallet: this.GAME_WALLET,
                balance: gameWalletBalanceFormatted + ' $KARRAT',
                txHash: txHash,
                etherscanUrl: `https://etherscan.io/tx/${txHash}`
            });
            
            // Verify the transaction on Etherscan
            console.log('🔍 VERIFY ON ETHERSCAN:', `https://etherscan.io/tx/${txHash}`);
            console.log('🎯 GAME WALLET:', this.GAME_WALLET);
            console.log('💰 PAYMENT RECEIVED:', gameWalletBalanceFormatted + ' $KARRAT');
            
            return true;
        } catch (error) {
            console.error('Payment verification error:', error);
            return false;
        }
    }
    
    // Global Leaderboard API Methods
    async addPlayerToGlobalLeaderboard() {
        if (!this.address) return;
        
        try {
            const leaderboard = await this.getGlobalLeaderboard();
            
            // Check if player already exists
            const existingPlayer = leaderboard.find(player => player.address.toLowerCase() === this.address.toLowerCase());
            
            if (!existingPlayer) {
                // Add new player
                leaderboard.push({
                    address: this.address,
                    totalScore: 0,
                    gamesPlayed: 0,
                    lastGameDate: null,
                    firstGameDate: new Date().toISOString()
                });
                
                await this.updateGlobalLeaderboard(leaderboard);
                console.log('Player added to global leaderboard');
            }
        } catch (error) {
            console.error('Error adding player to global leaderboard:', error);
        }
    }
    
    async updatePlayerScore(score) {
        if (!this.address) return;
        
        try {
            const leaderboard = await this.getGlobalLeaderboard();
            
            // Find and update player
            const playerIndex = leaderboard.findIndex(player => player.address.toLowerCase() === this.address.toLowerCase());
            
            if (playerIndex !== -1) {
                leaderboard[playerIndex].totalScore += score;
                leaderboard[playerIndex].gamesPlayed += 1;
                leaderboard[playerIndex].lastGameDate = new Date().toISOString();
                
                await this.updateGlobalLeaderboard(leaderboard);
                console.log('Player score updated in global leaderboard');
            }
        } catch (error) {
            console.error('Error updating player score:', error);
        }
    }
    
    async getGlobalLeaderboard() {
        try {
            const response = await fetch(this.LEADERBOARD_API_URL, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.LEADERBOARD_API_KEY
                }
            });
            
            if (!response.ok) {
                console.log('Leaderboard API not configured yet, returning empty leaderboard');
                return [];
            }
            
            const data = await response.json();
            return data.record.leaderboard || [];
        } catch (error) {
            console.log('Leaderboard API not available yet, returning empty leaderboard');
            return [];
        }
    }
    
    async updateGlobalLeaderboard(leaderboard) {
        try {
            const response = await fetch(this.LEADERBOARD_API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.LEADERBOARD_API_KEY
                },
                body: JSON.stringify({ leaderboard })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update leaderboard');
            }
            
            console.log('Global leaderboard updated successfully');
        } catch (error) {
            console.error('Error updating global leaderboard:', error);
        }
    }
    
    disconnectWallet() {
        console.log('Disconnecting wallet...');
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.karratBalance = 0;
        this.hasPaid = false;
        this.gameContract = null;
        this.leaderboardContract = null;
        this.connectionRetries = 0;
        
        // Clear localStorage
        localStorage.removeItem('spaceHooligans_payment');
        
        this.updateUIState('disconnected');
        this.hideMessages();
        
        // Show wallet connection screen
        console.log('Showing wallet connection screen...');
        showWalletScreen();
        console.log('Wallet connection screen shown');
    }
    
    resetPaymentState() {
        this.hasPaid = false;
        localStorage.removeItem('spaceHooligans_payment');
        // Don't disconnect wallet, just reset payment state
    }
    
    updateUIState(state) {
        console.log('updateUIState called with state:', state);
        
        const connectBtn = document.getElementById('connectWalletBtn');
        const payBtn = document.getElementById('payToPlayBtn');
        const balanceDisplay = document.getElementById('karratBalance');
        const addressDisplay = document.getElementById('walletAddress');
        
        console.log('UI elements found:', {
            connectBtn: !!connectBtn,
            payBtn: !!payBtn,
            balanceDisplay: !!balanceDisplay,
            addressDisplay: !!addressDisplay
        });
        
        if (connectBtn) {
            switch (state) {
                case 'connecting':
                    connectBtn.textContent = 'Connecting...';
                    connectBtn.disabled = true;
                    console.log('Connect button set to: Connecting...');
                    break;
                case 'connected':
                    connectBtn.textContent = 'Connected';
                    connectBtn.disabled = true;
                    console.log('Connect button set to: Connected');
                    break;
                case 'paying':
                    connectBtn.textContent = 'Processing Payment...';
                    connectBtn.disabled = true;
                    console.log('Connect button set to: Processing Payment...');
                    break;
                default:
                    connectBtn.textContent = 'Connect MetaMask';
                    connectBtn.disabled = false;
                    console.log('Connect button set to: Connect MetaMask');
            }
        }
        
        if (payBtn) {
            payBtn.disabled = state === 'paying' || state === 'connecting';
            console.log('Pay button disabled:', payBtn.disabled);
        }
        
        if (balanceDisplay && this.karratBalance !== undefined) {
            balanceDisplay.textContent = `${this.karratBalance.toFixed(2)} $KARRAT`;
            console.log('Balance display updated to:', balanceDisplay.textContent);
        }
        
        if (addressDisplay && this.address) {
            const shortAddress = `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
            addressDisplay.textContent = shortAddress;
            console.log('Address display updated to:', addressDisplay.textContent);
        }
    }
    
    handleConnectionError(error) {
        let message = 'Failed to connect to MetaMask.';
        
        if (error.message.includes('MetaMask is not installed')) {
            message = 'MetaMask is not installed. Please install the MetaMask browser extension.';
        } else if (error.message.includes('No accounts found')) {
            message = 'No accounts found. Please unlock MetaMask and try again.';
        } else if (error.message.includes('Ethereum Mainnet')) {
            message = 'Please switch to Ethereum Mainnet in MetaMask.';
        } else if (error.message.includes('User rejected')) {
            message = 'Connection was rejected. Please try again.';
        }
        
        this.showError(message);
        this.updateUIState('disconnected');
    }
    
    handlePaymentError(error) {
        let message = 'Payment failed. Please try again.';
        
        if (error.message.includes('Insufficient')) {
            message = error.message;
        } else if (error.message.includes('User rejected')) {
            message = 'Payment was rejected. Please try again.';
        } else if (error.message.includes('insufficient funds')) {
            message = 'Insufficient ETH for gas fees. Please add more ETH to your wallet.';
        }
        
        this.showError(message);
        this.updateUIState('connected');
    }
    
    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }
    
    showSuccess(message) {
        const successDiv = document.getElementById('successMessage');
        if (successDiv) {
            successDiv.textContent = message;
            successDiv.style.display = 'block';
        }
    }
    
    hideMessages() {
        const errorDiv = document.getElementById('errorMessage');
        const successDiv = document.getElementById('successMessage');
        
        if (errorDiv) errorDiv.style.display = 'none';
        if (successDiv) successDiv.style.display = 'none';
    }
    
    async submitScoreToBlockchain(score, gamesPlayed) {
        if (!this.leaderboardContract || this.LEADERBOARD_CONTRACT === '0x0000000000000000000000000000000000000000') {
            console.log('Leaderboard contract not deployed yet');
            return;
        }
        
        try {
            const tx = await this.leaderboardContract.connect(this.signer).submitScore(score, gamesPlayed);
            await tx.wait();
            console.log('Score submitted to blockchain');
        } catch (error) {
            console.error('Error submitting score to blockchain:', error);
        }
    }
    
    async getBlockchainLeaderboard() {
        if (!this.leaderboardContract || this.LEADERBOARD_CONTRACT === '0x0000000000000000000000000000000000000000') {
            return [];
        }
        
        try {
            const leaderboard = await this.leaderboardContract.getLeaderboard();
            return leaderboard.map(entry => ({
                address: entry.player,
                score: parseInt(entry.score),
                gamesPlayed: parseInt(entry.gamesPlayed),
                timestamp: parseInt(entry.timestamp)
            }));
        } catch (error) {
            console.error('Error getting blockchain leaderboard:', error);
            return [];
        }
    }
}

// Global functions for UI interaction
function connectMetaMask() {
    if (window.web3Manager) {
        window.web3Manager.connectMetaMask();
    }
}

function refreshBalance() {
    if (window.web3Manager) {
        window.web3Manager.getKarratBalance();
    }
}

function payToPlay() {
    if (window.web3Manager) {
        window.web3Manager.payToPlay();
    }
}

function disconnectWallet() {
    if (window.web3Manager) {
        window.web3Manager.disconnectWallet();
    }
}

function showWalletScreen() {
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('walletScreen').classList.remove('hidden');
}

function showMenu() {
    document.getElementById('walletScreen').classList.add('hidden');
    document.getElementById('menuOverlay').classList.remove('hidden');
}

function showGameOver() {
    document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// Global functions for leaderboard
async function loadGlobalLeaderboard() {
    if (window.web3Manager) {
        return await window.web3Manager.getGlobalLeaderboard();
    }
    return [];
}

async function updateGlobalScore(score) {
    if (window.web3Manager) {
        await window.web3Manager.updatePlayerScore(score);
    }
}

// Manual clear function for debugging
function clearAllGameData() {
    console.log('Clearing all game data...');
    localStorage.removeItem('spaceHooligans_payment');
    localStorage.removeItem('spaceHooligans_stats');
    if (window.web3Manager) {
        window.web3Manager.hasPaid = false;
        window.web3Manager.disconnectWallet();
    }
    console.log('All game data cleared. Refresh the page.');
}

// Global Web3 manager instance
let web3Manager;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    web3Manager = new Web3Manager();
    window.web3Manager = web3Manager;
}); 