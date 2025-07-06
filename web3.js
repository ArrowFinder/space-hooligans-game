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
        
        // Contract configuration - using correct checksummed address
        this.KARRAT_CONTRACT = '0xAcd2c239012D17BEB128B0944D49015104113650';
        this.GAME_WALLET = '0x8379AE5b257C4F20a502881f70A08C40ed1305A0'; // Game wallet to receive payments
        
        // Leaderboard contract (will be deployed)
        this.LEADERBOARD_CONTRACT = '0x0000000000000000000000000000000000000000'; // Placeholder - will be updated after deployment
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
                    this.hasPaid = true;
                    this.address = paymentData.address;
                    showMenu();
                    return;
                } else {
                    localStorage.removeItem('spaceHooligans_payment');
                }
            }
        } catch (error) {
            console.error('Error checking saved payment:', error);
            localStorage.removeItem('spaceHooligans_payment');
        }
    }
    
    async connectMetaMask() {
        if (this.isConnecting) return;
        
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
            
            await this.setupWalletInfo();
            this.showSuccess('MetaMask connected successfully!');
            
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
            },
            
            // Approach 4: Check for legacy web3
            () => {
                if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
                    return window.web3.currentProvider;
                }
                return null;
            }
        ];
        
        for (let i = 0; i < approaches.length; i++) {
            try {
                const result = await approaches[i]();
                if (result) {
                    return result;
                }
            } catch (error) {
                // Silent fail and continue to next approach
            }
        }
        
        return null;
    }
    
    async setupWalletInfo() {
        if (!this.address) return;
        
        this.updateUIState('connected');
        
        // Update wallet address display
        document.getElementById('walletAddress').textContent = 
            this.address.substring(0, 6) + '...' + this.address.substring(38);
        
        // Get KARRAT balance
        await this.getKarratBalance();
        
        // Show wallet info
        document.getElementById('walletInfo').style.display = 'block';
        
                    // Initialize contracts
            this.gameContract = new ethers.Contract(
                this.KARRAT_CONTRACT,
                this.KARRAT_ABI,
                this.signer
            );
            
            this.leaderboardContract = new ethers.Contract(
                this.LEADERBOARD_CONTRACT,
                this.LEADERBOARD_ABI,
                this.signer
            );
    }
    
    async getKarratBalance() {
        try {
            if (!this.address) return;
            
            console.log('Checking KARRAT balance for address:', this.address);
            console.log('Using KARRAT contract:', this.KARRAT_CONTRACT);
            
            // Fix the contract address checksum
            const checksummedContract = ethers.utils.getAddress(this.KARRAT_CONTRACT);
            console.log('Checksummed contract address:', checksummedContract);
            
            const contract = new ethers.Contract(
                checksummedContract,
                this.KARRAT_ABI,
                this.provider
            );
            
            console.log('Contract instance created, calling balanceOf...');
            
            const balance = await contract.balanceOf(this.address);
            console.log('Raw balance from contract:', balance.toString());
            
            this.karratBalance = parseFloat(ethers.utils.formatEther(balance));
            console.log('Formatted balance:', this.karratBalance);
            
            document.getElementById('karratBalance').textContent = 
                this.karratBalance.toFixed(2);
                
        } catch (error) {
            console.error('Error getting KARRAT balance:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                data: error.data
            });
            
            // Try alternative contract address if the first one fails
            if (error.message.includes('execution reverted') || error.message.includes('invalid address')) {
                console.log('Trying alternative KARRAT contract address...');
                await this.tryAlternativeKarratContract();
            } else {
                document.getElementById('karratBalance').textContent = 'Error';
                this.karratBalance = 0;
            }
        }
    }
    
    async tryAlternativeKarratContract() {
        // Alternative KARRAT contract addresses to try (with proper checksums)
        const alternativeAddresses = [
            '0xAcd2c239012D17BEB128B0944D49015104113650', // Main KARRAT contract
            '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', // Alternative 1
            '0x4E84E9e5fb0A972628Cf4565c3E4dC1c5A97b708'  // Alternative 2
        ];
        
        for (const contractAddress of alternativeAddresses) {
            try {
                console.log('Trying KARRAT contract:', contractAddress);
                
                // Fix the contract address checksum
                const checksummedContract = ethers.utils.getAddress(contractAddress);
                console.log('Checksummed contract address:', checksummedContract);
                
                const contract = new ethers.Contract(
                    checksummedContract,
                    this.KARRAT_ABI,
                    this.provider
                );
                
                const balance = await contract.balanceOf(this.address);
                this.karratBalance = parseFloat(ethers.utils.formatEther(balance));
                
                console.log('Success with contract:', checksummedContract, 'Balance:', this.karratBalance);
                
                // Update the contract address for future use
                this.KARRAT_CONTRACT = checksummedContract;
                
                document.getElementById('karratBalance').textContent = 
                    this.karratBalance.toFixed(2);
                    
                return; // Success, exit the function
                
            } catch (error) {
                console.log('Failed with contract:', contractAddress, 'Error:', error.message);
                continue; // Try next address
            }
        }
        
        // If all addresses fail, show error
        console.error('All KARRAT contract addresses failed');
        document.getElementById('karratBalance').textContent = 'Error';
        this.karratBalance = 0;
    }
    
    async payToPlay() {
        if (!this.signer || !this.gameContract) {
            this.showError('Please connect MetaMask first.');
            return;
        }
        
        if (this.karratBalance < 1) {
            this.showError('Insufficient $KARRAT balance. You need at least 1 $KARRAT to play.');
            return;
        }
        
        const payButton = document.getElementById('payButton');
        const originalText = payButton.textContent;
        
        try {
            payButton.disabled = true;
            payButton.textContent = 'Processing...';
            this.hideMessages();
            
            const amount = ethers.utils.parseEther('1');
            const tx = await this.gameContract.transfer(this.GAME_WALLET, amount);
            
            payButton.textContent = 'Confirming...';
            
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                this.hasPaid = true;
                
                localStorage.setItem('spaceHooligans_payment', JSON.stringify({
                    address: this.address,
                    timestamp: Date.now()
                }));
                
                this.showSuccess('Payment successful! You have 5 more lives!');
                
                // If we're on the game over screen, start a new game immediately
                const gameOverOverlay = document.getElementById('gameOverOverlay');
                if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden')) {
                    setTimeout(() => {
                        if (window.game) {
                            window.game.startGame();
                        }
                    }, 2000);
                } else {
                    setTimeout(() => showMenu(), 2000);
                }
            } else {
                throw new Error('Transaction failed');
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            this.handlePaymentError(error);
        } finally {
            payButton.disabled = false;
            payButton.textContent = originalText;
        }
    }
    
    disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.karratBalance = 0;
        this.hasPaid = false;
        this.gameContract = null;
        this.isConnecting = false;
        
        localStorage.removeItem('spaceHooligans_payment');
        
        this.updateUIState('disconnected');
        this.hideMessages();
        showWalletScreen();
    }
    
    resetPaymentState() {
        this.hasPaid = false;
        localStorage.removeItem('spaceHooligans_payment');
    }
    
    updateUIState(state) {
        const metamaskButton = document.querySelector('.metamask-button');
        const payButton = document.getElementById('payButton');
        
        switch (state) {
            case 'connecting':
                metamaskButton.disabled = true;
                metamaskButton.textContent = 'Connecting...';
                break;
            case 'connected':
                metamaskButton.disabled = false;
                metamaskButton.innerHTML = '<img src="https://cdn.iconscout.com/icon/free/png-256/metamask-2728406-2261817.png" alt="MetaMask">Connect MetaMask';
                break;
            case 'disconnected':
                document.getElementById('walletInfo').style.display = 'none';
                document.getElementById('walletAddress').textContent = '...';
                document.getElementById('karratBalance').textContent = '0';
                metamaskButton.disabled = false;
                metamaskButton.innerHTML = '<img src="https://cdn.iconscout.com/icon/free/png-256/metamask-2728406-2261817.png" alt="MetaMask">Connect MetaMask';
                break;
        }
    }
    
    handleConnectionError(error) {
        let message = 'Failed to connect MetaMask. Please try again.';
        
        if (error.message.includes('not installed')) {
            message = 'MetaMask is not installed. Please install the MetaMask browser extension and try again.';
        } else if (error.message.includes('No accounts found')) {
            message = 'No accounts found. Please unlock MetaMask and try again.';
        } else if (error.message.includes('User rejected')) {
            message = 'Connection was cancelled. Please try again.';
        } else if (error.message.includes('Ethereum Mainnet')) {
            message = 'Please switch to Ethereum Mainnet in MetaMask and try again.';
        }
        
        this.showError(message);
    }
    
    handlePaymentError(error) {
        let message = 'Payment failed. Please try again.';
        
        if (error.message.includes('insufficient funds')) {
            message = 'Insufficient funds for gas fees. Please add ETH to your wallet.';
        } else if (error.message.includes('User rejected')) {
            message = 'Transaction was cancelled. Please try again.';
        } else if (error.message.includes('insufficient allowance')) {
            message = 'Insufficient token allowance. Please approve the transaction.';
        } else if (error.message.includes('network')) {
            message = 'Network error. Please check your connection and try again.';
        }
        
        this.showError(message);
    }
    
    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        document.getElementById('successMessage').style.display = 'none';
    }
    
    showSuccess(message) {
        const successElement = document.getElementById('successMessage');
        successElement.textContent = message;
        successElement.style.display = 'block';
        document.getElementById('errorMessage').style.display = 'none';
    }
    
    hideMessages() {
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('successMessage').style.display = 'none';
    }
    
    async submitScoreToBlockchain(score, gamesPlayed) {
        if (!this.leaderboardContract || !this.signer) {
            console.error('Leaderboard contract not initialized');
            return false;
        }
        
        try {
            const tx = await this.leaderboardContract.submitScore(score, gamesPlayed);
            await tx.wait();
            return true;
        } catch (error) {
            console.error('Error submitting score to blockchain:', error);
            return false;
        }
    }
    
    async getBlockchainLeaderboard() {
        if (!this.leaderboardContract) {
            console.error('Leaderboard contract not initialized');
            return [];
        }
        
        try {
            const leaderboard = await this.leaderboardContract.getTopScores(10);
            return leaderboard.map(entry => ({
                address: entry.player,
                score: entry.score.toNumber(),
                gamesPlayed: entry.gamesPlayed.toNumber(),
                timestamp: entry.timestamp.toNumber() * 1000 // Convert to milliseconds
            }));
        } catch (error) {
            console.error('Error fetching blockchain leaderboard:', error);
            return [];
        }
    }
}

// Global Web3 manager instance
let web3Manager;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    web3Manager = new Web3Manager();
    window.web3Manager = web3Manager;
});

// Global functions for HTML onclick handlers
function connectMetaMask() {
    web3Manager.connectMetaMask();
}

function refreshBalance() {
    if (web3Manager && web3Manager.address) {
        web3Manager.getKarratBalance();
    } else {
        alert('Please connect MetaMask first.');
    }
}

function payToPlay() {
    if (web3Manager) {
        web3Manager.payToPlay();
    } else {
        alert('Web3 manager not initialized. Please refresh the page.');
    }
}

function disconnectWallet() {
    web3Manager.disconnectWallet();
}

// UI Management Functions
function showWalletScreen() {
    document.getElementById('walletOverlay').classList.remove('hidden');
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
}

function showMenu() {
    document.getElementById('walletOverlay').classList.add('hidden');
    document.getElementById('menuOverlay').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
}

function showGameOver() {
    document.getElementById('walletOverlay').classList.add('hidden');
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// Export for game.js
window.web3Manager = web3Manager;
window.showWalletScreen = showWalletScreen;
window.showMenu = showMenu;
window.showGameOver = showGameOver; 