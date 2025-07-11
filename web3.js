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
        this.GAME_WALLET = '0x452161Fd28713878D84838c5Cc5b41Faf46d710A'; // Game wallet to receive payments
        
        // Leaderboard contract (will be deployed)
        this.LEADERBOARD_CONTRACT = '0x0000000000000000000000000000000000000000'; // Placeholder - will be updated after deployment
        
        // Global Leaderboard API Configuration
        this.LEADERBOARD_API_URL = 'https://api.jsonbin.io/v3/b/686a15ad8561e97a50325112'; // Free JSONBin.io storage
        this.LEADERBOARD_API_KEY = '$2a$10$9ENFV8/nfR1RZPbq4gP08uO4aGyczMGM3/5EQt9mqgzLrDJmQqWzu'; // JSONBin.io Master Key
        
        // Etherscan API Configuration for blockchain stats
        this.ETHERSCAN_API_KEY = 'MR8TZ35Z9UH32JM6YPX88W9B784NXXTM3C';
        this.ETHERSCAN_API_URL = 'https://api.etherscan.io/api';
        
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
        // Only run initialization if we don't have a connected wallet
        if (this.address) {
            console.log('Wallet already connected, skipping initialization');
            return;
        }
        
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
        
        // Don't show any screens during initialization - let the connection flow handle UI
        console.log('Initialization complete - waiting for wallet connection');
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
            showWalletScreen();
            console.log('Payment screen shown');
            
            // Force a small delay to ensure UI updates are processed
            setTimeout(() => {
                console.log('Final check - wallet screen should be visible');
                const walletScreen = document.getElementById('walletScreen');
                const menuOverlay = document.getElementById('menuOverlay');
                console.log('Wallet screen hidden:', walletScreen?.classList.contains('hidden'));
                console.log('Menu overlay hidden:', menuOverlay?.classList.contains('hidden'));
            }, 100);
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
    
    async payToPlay(tier = 1) {
        if (this.paymentInProgress) {
            console.log('Payment already in progress');
            return;
        }
        
        // Define payment tiers
        const paymentTiers = {
            1: { amount: 2, lives: 3, name: 'Starter' },
            2: { amount: 5, lives: 8, name: 'Pro' },
            3: { amount: 10, lives: 20, name: 'Elite' }
        };
        
        const selectedTier = paymentTiers[tier];
        if (!selectedTier) {
            throw new Error('Invalid payment tier selected');
        }
        
        this.paymentInProgress = true;
        this.updateUIState('paying');
        this.hideMessages();
        
        try {
            if (!this.provider || !this.signer || !this.address) {
                throw new Error('Please connect your MetaMask wallet first.');
            }
            
            if (this.karratBalance < selectedTier.amount) {
                throw new Error(`Insufficient $KARRAT balance. You have ${this.karratBalance.toFixed(2)} $KARRAT, but need ${selectedTier.amount} $KARRAT for the ${selectedTier.name} tier.`);
            }
            
            // Transfer KARRAT to game wallet
            const amount = ethers.utils.parseEther(selectedTier.amount.toString());
            
            console.log('PAYMENT VERIFICATION:', {
                from: this.address,
                to: this.GAME_WALLET,
                amount: `${selectedTier.amount} $KARRAT`,
                lives: selectedTier.lives,
                tier: selectedTier.name,
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
            
            this.showSuccess(`Payment transaction submitted! Waiting for confirmation...`);
            
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
                this.incrementTransactionCounter(selectedTier.amount);
                
                this.hasPaid = true;
                
                // Save payment state to localStorage with tier information
                localStorage.setItem('spaceHooligans_payment', JSON.stringify({
                    address: this.address,
                    timestamp: Date.now(),
                    txHash: receipt.transactionHash,
                    tier: tier,
                    lives: selectedTier.lives,
                    amount: selectedTier.amount
                }));
                
                // Add player to global leaderboard when they pay
                await this.addPlayerToGlobalLeaderboard();
                
                this.showSuccess(`Payment successful! You have ${selectedTier.lives} lives with the ${selectedTier.name} tier!`);
                
                // Update balance
                await this.getKarratBalance();
                
                // Show game menu with additional logging
                console.log('Payment successful - showing game menu...');
                
                // Explicitly hide game over screen first
                const gameOverElement = document.getElementById('gameOverOverlay');
                if (gameOverElement) {
                    gameOverElement.classList.add('hidden');
                    gameOverElement.style.display = 'none';
                    console.log('Game over screen explicitly hidden');
                }
                
                showMenu();
                console.log('showMenu() called - menu should now be visible');
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
        
        if (gamesElement) {
            gamesElement.textContent = this.totalGamesPlayed.toLocaleString();
        }
        
        console.log('Transaction counter updated:', {
            games: this.totalGamesPlayed
        });
    }
    
    incrementTransactionCounter(amount) {
        this.totalGamesPlayed += 1;
        this.totalKarratSpent += amount;
        this.updateTransactionCounter();
        
        // Save to localStorage for persistence
        localStorage.setItem('spaceHooligans_stats', JSON.stringify({
            gamesPlayed: this.totalGamesPlayed,
            karratSpent: this.totalKarratSpent,
            timestamp: Date.now()
        }));
    }
    
    loadTransactionStats() {
        // Load from localStorage first for immediate display
        try {
            const savedStats = localStorage.getItem('spaceHooligans_stats');
            if (savedStats) {
                const stats = JSON.parse(savedStats);
                this.totalGamesPlayed = stats.gamesPlayed || 0;
                this.totalKarratSpent = stats.karratSpent || 0;
                this.updateTransactionCounter();
                console.log('Loaded local transaction stats:', stats);
            }
        } catch (error) {
            console.error('Error loading local transaction stats:', error);
        }
        
        // Then fetch real blockchain data
        this.fetchBlockchainStats();
    }
    
    async fetchBlockchainStats() {
        try {
            console.log('Fetching blockchain stats from Etherscan...');
            
            // Filter for transactions from 7/5/2025 onwards
            const startDate = new Date('2025-07-05T00:00:00Z').getTime() / 1000; // Convert to Unix timestamp
            
            // Fetch all token transfers to the game wallet from 7/5/2025 onwards
            const response = await fetch(`${this.ETHERSCAN_API_URL}?module=account&action=tokentx&contractaddress=${this.KARRAT_CONTRACT}&address=${this.GAME_WALLET}&startblock=0&endblock=99999999&starttime=${startDate}&sort=desc&apikey=${this.ETHERSCAN_API_KEY}`);
            
            if (!response.ok) {
                console.log('Etherscan API not configured yet, using local stats');
                return;
            }
            
            const data = await response.json();
            
            if (data.status === '1' && data.result) {
                let totalKarratReceived = 0;
                let uniqueTransactions = new Set();
                
                // Process all incoming transfers to game wallet from 7/5/2025 onwards
                data.result.forEach(tx => {
                    if (tx.to.toLowerCase() === this.GAME_WALLET.toLowerCase()) {
                        const amount = parseFloat(ethers.utils.formatEther(tx.value));
                        totalKarratReceived += amount;
                        uniqueTransactions.add(tx.hash);
                    }
                });
                
                // Update stats with real blockchain data
                this.totalGamesPlayed = uniqueTransactions.size;
                this.totalKarratSpent = totalKarratReceived;
                
                // Update localStorage with real data
                localStorage.setItem('spaceHooligans_stats', JSON.stringify({
                    gamesPlayed: this.totalGamesPlayed,
                    karratSpent: this.totalKarratSpent,
                    timestamp: Date.now(),
                    source: 'blockchain'
                }));
                
                this.updateTransactionCounter();
                console.log('Updated blockchain stats from 7/5/2025 onwards:', {
                    gamesPlayed: this.totalGamesPlayed,
                    karratSpent: this.totalKarratSpent,
                    transactions: uniqueTransactions.size
                });
            } else {
                console.log('No blockchain data available, using local stats');
            }
        } catch (error) {
            console.log('Error fetching blockchain stats:', error);
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
        // No longer needed - blockchain leaderboard is automatically updated
        // when new transactions are detected
        console.log('Player will be automatically added to blockchain leaderboard');
    }
    
    async updatePlayerScore(score) {
        if (!this.address) {
            console.log('No wallet connected, cannot update score');
            return;
        }
        
        try {
            console.log('Updating player score:', {
                address: this.address,
                score: score
            });
            
            // Get current leaderboard data
            const response = await fetch(this.LEADERBOARD_API_URL, {
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.log('Failed to fetch current leaderboard data');
                return;
            }
            
            const data = await response.json();
            let leaderboard = data.record?.leaderboard || [];
            let metadata = data.record?.metadata || {};
            let settings = data.record?.settings || {};
            
            // Check if we need to reset the leaderboard (100 days)
            const now = Date.now();
            
            // Initialize lastReset if it doesn't exist (first time setup)
            if (!metadata.lastReset) {
                metadata.lastReset = now;
                console.log('🆕 Initializing leaderboard reset timestamp');
            }
            
            const lastReset = metadata.lastReset;
            const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);
            
            if (daysSinceReset >= 100) {
                console.log('🔄 100 days passed, resetting leaderboard...');
                
                // Backup current season data before reset
                try {
                    console.log('💾 Backing up Season #1 data...');
                    
                    // Create season backup data
                    const seasonBackup = {
                        seasonNumber: metadata.resetCount || 1,
                        seasonStartDate: lastReset,
                        seasonEndDate: now,
                        totalDays: daysSinceReset,
                        leaderboard: leaderboard,
                        metadata: {
                            totalPlayers: metadata.totalPlayers || 0,
                            totalGames: metadata.totalGames || 0,
                            totalScore: metadata.totalScore || 0,
                            seasonStats: {
                                averageScore: metadata.totalScore && metadata.totalGames ? 
                                    Math.round(metadata.totalScore / metadata.totalGames) : 0,
                                topScore: leaderboard.length > 0 ? leaderboard[0].highestScore : 0,
                                mostActivePlayer: leaderboard.length > 0 ? leaderboard[0].address : null
                            }
                        },
                        backupDate: now
                    };
                    
                    // Save to season backup bin (using a different bin ID for season archives)
                    const backupResponse = await fetch('https://api.jsonbin.io/v3/b/65f8b8b8266cfc3fde8b1234', {
                        method: 'PUT',
                        headers: {
                            'X-Master-Key': this.LEADERBOARD_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            seasonBackups: [seasonBackup]
                        })
                    });
                    
                    if (backupResponse.ok) {
                        console.log('✅ Season #1 data backed up successfully');
                    } else {
                        console.error('❌ Failed to backup season data');
                    }
                } catch (error) {
                    console.error('❌ Error backing up season data:', error);
                }
                
                // Reset leaderboard for new season
                leaderboard = [];
                metadata.lastReset = now;
                metadata.resetCount = (metadata.resetCount || 0) + 1;
                console.log('✅ Leaderboard reset complete for Season #2');
            }
            
            // Find existing player or create new entry
            const existingIndex = leaderboard.findIndex(entry => 
                entry.address.toLowerCase() === this.address.toLowerCase()
            );
            
            if (existingIndex !== -1) {
                // Update existing player
                leaderboard[existingIndex].totalScore += score;
                leaderboard[existingIndex].highestScore = Math.max(leaderboard[existingIndex].highestScore, score);
                leaderboard[existingIndex].gamesPlayed += 1;
                leaderboard[existingIndex].lastGameDate = now;
            } else {
                // Add new player
                leaderboard.push({
                    address: this.address.toLowerCase(),
                    totalScore: score,
                    highestScore: score,
                    gamesPlayed: 1,
                    firstGameDate: now,
                    lastGameDate: now
                });
            }
            
            // Sort by total score (highest first)
            leaderboard.sort((a, b) => b.totalScore - a.totalScore);
            
            // Update metadata
            metadata.totalPlayers = leaderboard.length;
            metadata.totalGames = leaderboard.reduce((sum, player) => sum + player.gamesPlayed, 0);
            metadata.totalScore = leaderboard.reduce((sum, player) => sum + player.totalScore, 0);
            metadata.lastUpdated = new Date().toISOString();
            
            // Update the leaderboard on JSONBin.io
            const updateResponse = await fetch(this.LEADERBOARD_API_URL, {
                method: 'PUT',
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    leaderboard: leaderboard,
                    metadata: metadata,
                    settings: settings
                })
            });
            
            if (updateResponse.ok) {
                console.log('✅ Score updated successfully:', {
                    address: this.address,
                    score: score,
                    totalScore: existingIndex !== -1 ? leaderboard[existingIndex].totalScore : score,
                    daysUntilReset: Math.max(0, 100 - daysSinceReset).toFixed(1)
                });
            } else {
                console.log('Failed to update score on JSONBin.io');
            }
            
        } catch (error) {
            console.error('Error updating player score:', error);
        }
    }
    
    async getGlobalLeaderboard() {
        try {
            console.log('Fetching leaderboard from JSONBin.io...');
            
            const response = await fetch(this.LEADERBOARD_API_URL, {
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                let leaderboard = data.record?.leaderboard || [];
                
                // Filter out test accounts (ending in 7890 or marked as test players)
                leaderboard = leaderboard.filter(entry => {
                    const isTestAccount = entry.address.toLowerCase().endsWith('7890') || 
                                        entry.isTestPlayer === true;
                    if (isTestAccount) {
                        console.log('Filtering out test account:', entry.address);
                    }
                    return !isTestAccount;
                });
                
                console.log('📊 JSONBin.io leaderboard loaded:', {
                    totalPlayers: leaderboard.length,
                    players: leaderboard.map(p => ({
                        address: p.address.substring(0, 6) + '...' + p.address.substring(38),
                        totalScore: p.totalScore,
                        gamesPlayed: p.gamesPlayed
                    }))
                });
                
                return leaderboard;
            } else {
                console.log('Failed to fetch JSONBin.io leaderboard, returning empty');
                return [];
            }
        } catch (error) {
            console.error('Error fetching JSONBin.io leaderboard:', error);
            return [];
        }
    }
    
    async getLeaderboardMetadata() {
        try {
            const response = await fetch(this.LEADERBOARD_API_URL, {
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.record?.metadata || {};
            }
        } catch (error) {
            console.error('Failed to fetch leaderboard metadata:', error);
        }
        return {};
    }
    
    async updateGlobalLeaderboard(leaderboard) {
        // No longer needed - blockchain leaderboard is read-only from Etherscan
        console.log('Blockchain leaderboard is automatically updated from transaction data');
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
        
        // Show/hide wallet info based on connection state
        const walletInfo = document.getElementById('walletInfo');
        if (walletInfo) {
            if (state === 'connected') {
                walletInfo.style.display = 'block';
                console.log('Wallet info shown');
            } else {
                walletInfo.style.display = 'none';
                console.log('Wallet info hidden');
            }
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
    
    async removeTestAccounts() {
        try {
            console.log('Removing test accounts from leaderboard...');
            
            const response = await fetch(this.LEADERBOARD_API_URL, {
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard data');
            }
            
            const data = await response.json();
            let leaderboard = data.record?.leaderboard || [];
            let metadata = data.record?.metadata || {};
            let settings = data.record?.settings || {};
            
            // Count test accounts before removal
            const testAccounts = leaderboard.filter(entry => 
                entry.address.toLowerCase().endsWith('7890') || 
                entry.isTestPlayer === true
            );
            
            console.log(`Found ${testAccounts.length} test accounts to remove:`, 
                testAccounts.map(acc => acc.address.substring(0, 6) + '...' + acc.address.substring(38))
            );
            
            // Remove test accounts
            leaderboard = leaderboard.filter(entry => 
                !entry.address.toLowerCase().endsWith('7890') && 
                entry.isTestPlayer !== true
            );
            
            // Update metadata
            metadata.totalPlayers = leaderboard.length;
            metadata.totalGames = leaderboard.reduce((sum, player) => sum + player.gamesPlayed, 0);
            metadata.totalScore = leaderboard.reduce((sum, player) => sum + player.totalScore, 0);
            metadata.lastUpdated = new Date().toISOString();
            
            // Save updated data
            const updateResponse = await fetch(this.LEADERBOARD_API_URL, {
                method: 'PUT',
                headers: {
                    'X-Master-Key': this.LEADERBOARD_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    leaderboard: leaderboard,
                    metadata: metadata,
                    settings: settings
                })
            });
            
            if (updateResponse.ok) {
                console.log(`✅ Successfully removed ${testAccounts.length} test accounts from leaderboard`);
                return testAccounts.length;
            } else {
                throw new Error('Failed to update leaderboard');
            }
            
        } catch (error) {
            console.error('Error removing test accounts:', error);
            throw error;
        }
    }
    
    async getLeaderboardCountdown() {
        try {
            const metadata = await this.getLeaderboardMetadata();
            console.log('📊 Countdown metadata:', metadata);
            
            // If no metadata or lastReset, initialize it
            if (!metadata || !metadata.lastReset) {
                console.log('🆕 No lastReset found, initializing...');
                const now = Date.now();
                
                // Try to update the metadata with a lastReset timestamp
                try {
                    const response = await fetch(this.LEADERBOARD_API_URL, {
                        headers: {
                            'X-Master-Key': this.LEADERBOARD_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const currentMetadata = data.record?.metadata || {};
                        const currentSettings = data.record?.settings || {};
                        const currentLeaderboard = data.record?.leaderboard || [];
                        
                        currentMetadata.lastReset = now;
                        currentMetadata.lastUpdated = new Date().toISOString();
                        
                        const updateResponse = await fetch(this.LEADERBOARD_API_URL, {
                            method: 'PUT',
                            headers: {
                                'X-Master-Key': this.LEADERBOARD_API_KEY,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                leaderboard: currentLeaderboard,
                                metadata: currentMetadata,
                                settings: currentSettings
                            })
                        });
                        
                        if (updateResponse.ok) {
                            console.log('✅ Initialized lastReset timestamp');
                        }
                    }
                } catch (error) {
                    console.error('Failed to initialize lastReset:', error);
                }
                
                // Return initial countdown
                return {
                    days: 99,
                    hours: 23,
                    minutes: 59,
                    seconds: 59,
                    totalSeconds: 99 * 24 * 60 * 60 + 23 * 60 * 60 + 59 * 60 + 59,
                    daysUntilReset: 99.99,
                    daysSinceReset: 0.01
                };
            }
            
            const now = Date.now();
            const lastReset = metadata.lastReset;
            const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);
            const daysUntilReset = Math.max(0, 100 - daysSinceReset);
            
            // Calculate time components
            const totalSeconds = daysUntilReset * 24 * 60 * 60;
            const days = Math.floor(totalSeconds / (24 * 60 * 60));
            const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
            const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            
            console.log('⏰ Countdown calculated:', {
                daysSinceReset: daysSinceReset.toFixed(2),
                daysUntilReset: daysUntilReset.toFixed(2),
                display: `${days}d ${hours}h ${minutes}m ${seconds}s`
            });
            
            return {
                days,
                hours,
                minutes,
                seconds,
                totalSeconds,
                daysUntilReset,
                daysSinceReset
            };
        } catch (error) {
            console.error('Error calculating countdown:', error);
            return null;
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

function payToPlay(tier = 1) {
    if (window.web3Manager) {
        window.web3Manager.payToPlay(tier);
    }
}

function disconnectWallet() {
    if (window.web3Manager) {
        window.web3Manager.disconnectWallet();
    }
}

function showWalletScreen() {
    console.log('showWalletScreen() called');
    const menuOverlay = document.getElementById('menuOverlay');
    const walletScreen = document.getElementById('walletScreen');
    
    console.log('Before changes:');
    console.log('menuOverlay hidden:', menuOverlay?.classList.contains('hidden'));
    console.log('walletScreen hidden:', walletScreen?.classList.contains('hidden'));
    
    if (menuOverlay) menuOverlay.classList.add('hidden');
    if (walletScreen) walletScreen.classList.remove('hidden');
    
    console.log('After changes:');
    console.log('menuOverlay hidden:', menuOverlay?.classList.contains('hidden'));
    console.log('walletScreen hidden:', walletScreen?.classList.contains('hidden'));
    
    // Force the wallet screen to be visible
    if (walletScreen) {
        walletScreen.style.display = 'flex';
        console.log('Forced wallet screen to display: flex');
    }
}

function showMenu() {
    console.log('showMenu() called - starting menu display process...');
    
    // Force hide all other screens with multiple approaches
    const screens = [
        'walletScreen',
        'gameOverOverlay', 
        'lifeLostOverlay',
        'leaderboardOverlay'
    ];
    
    screens.forEach(screenId => {
        const element = document.getElementById(screenId);
        if (element) {
            element.classList.add('hidden');
            element.style.display = 'none'; // Force hide with CSS
            console.log(`Hidden ${screenId}`);
        }
    });
    
    // Add a small delay to ensure UI updates properly
    setTimeout(() => {
        // Show the menu
        const menuElement = document.getElementById('menuOverlay');
        if (menuElement) {
            menuElement.classList.remove('hidden');
            menuElement.style.display = 'flex'; // Force show with CSS
            console.log('Menu shown - all other screens hidden');
        } else {
            console.error('Menu overlay element not found!');
        }
    }, 150); // Increased delay for better reliability
}

function showGameOver() {
    console.log('showGameOver() called - displaying game over screen');
    
    // Hide all other overlays first
    const overlays = ['menuOverlay', 'walletScreen', 'lifeLostOverlay', 'leaderboardOverlay'];
    overlays.forEach(overlayId => {
        const element = document.getElementById(overlayId);
        if (element) {
            element.classList.add('hidden');
            element.style.display = 'none';
            console.log(`Hidden ${overlayId}`);
        } else {
            console.error(`${overlayId} element not found!`);
        }
    });
    
    // Show game over overlay with enhanced debugging
    const gameOverElement = document.getElementById('gameOverOverlay');
    console.log('Game over element found:', !!gameOverElement);
    
    if (gameOverElement) {
        // Force remove hidden class and set display
        gameOverElement.classList.remove('hidden');
        gameOverElement.style.display = 'flex';
        gameOverElement.style.zIndex = '1000';
        gameOverElement.style.visibility = 'visible';
        gameOverElement.style.opacity = '1';
        
        console.log('Game over overlay display properties:', {
            display: gameOverElement.style.display,
            zIndex: gameOverElement.style.zIndex,
            visibility: gameOverElement.style.visibility,
            opacity: gameOverElement.style.opacity,
            hiddenClass: gameOverElement.classList.contains('hidden')
        });
        
        // Verify the overlay is actually visible
        setTimeout(() => {
            const rect = gameOverElement.getBoundingClientRect();
            console.log('Game over overlay visibility check:', {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                visible: rect.width > 0 && rect.height > 0
            });
        }, 50);
        
        console.log('Game over overlay displayed successfully');
    } else {
        console.error('Game over overlay element not found!');
        
        // Try to find any overlay elements for debugging
        const allOverlays = document.querySelectorAll('.overlay');
        console.log('All overlay elements found:', allOverlays.length);
        allOverlays.forEach((overlay, index) => {
            console.log(`Overlay ${index}:`, overlay.id, overlay.className);
        });
    }
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

// Manual refresh blockchain stats
function refreshBlockchainStats() {
    if (window.web3Manager) {
        console.log('Manually refreshing blockchain stats...');
        window.web3Manager.fetchBlockchainStats();
    }
}

// Remove test accounts from leaderboard
async function removeTestAccounts() {
    if (window.web3Manager) {
        try {
            console.log('Removing test accounts...');
            const removedCount = await window.web3Manager.removeTestAccounts();
            console.log(`✅ Removed ${removedCount} test accounts from leaderboard`);
            return removedCount;
        } catch (error) {
            console.error('Failed to remove test accounts:', error);
            throw error;
        }
    }
}

// Global Web3 manager instance
let web3Manager;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - checking initial UI state');
    const walletScreen = document.getElementById('walletScreen');
    const menuOverlay = document.getElementById('menuOverlay');
    console.log('Initial state:');
    console.log('walletScreen display:', walletScreen?.style.display);
    console.log('walletScreen hidden class:', walletScreen?.classList.contains('hidden'));
    console.log('menuOverlay hidden class:', menuOverlay?.classList.contains('hidden'));
    
    web3Manager = new Web3Manager();
    window.web3Manager = web3Manager;
}); 