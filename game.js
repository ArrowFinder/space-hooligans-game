// FORCE SYNC: This comment is to force git to recognize a change and allow a commit/push.
// TIMESTAMP: 2025-07-06 13:47 - Force overwrite to match local working version
// Space Hooligans - Web3 Arcade Game
// Optimized for maximum performance

class SpaceHooligans {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.state = 'menu';
        this.score = 0;
        this.highScore = 0;
        this.lives = 5; // 5 lives per payment
        
        // Intensity and difficulty scaling (reduced by 90%)
        this.baseEnemySpawnRate = 0.002; // Reduced from 0.02 (90% reduction)
        this.enemySpawnRate = this.baseEnemySpawnRate;
        this.maxIntensity = 1.5; // Reduced from 3.0 (50% reduction for smoother scaling)
        this.intensityMultiplier = 1.0;
        
        // Object pools for performance
        this.objectPools = {
            bullets: [],
            enemies: [],
            particles: []
        };
        
        // Active game objects
        this.gameObjects = {
            player: null,
            bullets: [],
            enemies: [],
            particles: []
        };
        
        // Input tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.keys = {};
        this.invincible = false;
        this.invincibilityStartTime = null;
        this.invincibilityTimer = null;
        
        // Performance settings
        this.maxBullets = 5;
        
        // Pre-allocated objects for reuse
        this.initObjectPools();
        
        // Asset management
        this.sprites = {
            player: new Image(),
            enemy: new Image()
        };
        
        this.loadAssets();
        this.setupEventListeners();
        this.init();
    }
    
    initObjectPools() {
        // Pre-allocate objects to reduce garbage collection
        for (let i = 0; i < 50; i++) {
            this.objectPools.bullets.push(new Bullet(0, 0, 0));
            this.objectPools.enemies.push(new Enemy(800, 600, 0));
            this.objectPools.particles.push(new Particle(0, 0, 0));
        }
    }
    
    loadAssets() {
        this.sprites.player.src = 'carrot.png';
        this.sprites.enemy.src = 'OGzuckbot.png';
    }
    
    setupEventListeners() {
        // Optimized mouse tracking with throttling
        let mouseThrottle = 0;
        this.canvas.addEventListener('mousemove', (e) => {
            if (mouseThrottle++ % 2 === 0) { // Throttle to every other frame
                const rect = this.canvas.getBoundingClientRect();
                this.mouseX = e.clientX - rect.left;
                this.mouseY = e.clientY - rect.top;
            }
        });
        
        // Keyboard input with event delegation
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (this.state === 'playing' && e.code === 'Space') {
                this.shoot();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }
    
    init() {
        this.gameObjects.player = new Player(this.canvas.width / 2, this.canvas.height / 2);
        this.gameLoop();
    }
    
    getLivesFromPayment() {
        try {
            const savedPayment = localStorage.getItem('spaceHooligans_payment');
            if (savedPayment) {
                const paymentData = JSON.parse(savedPayment);
                return paymentData.lives || 5; // Default to 5 if not specified
            }
        } catch (error) {
            console.error('Error reading payment data:', error);
        }
        return 5; // Default fallback
    }
    
    startGame() {
        if (!window.web3Manager) {
            alert('Web3 manager not initialized. Please refresh the page and try again.');
            return;
        }
        
        // Check if user has paid and is still connected
        if (!window.web3Manager.hasPaid) {
            // Don't automatically try to connect - let user choose
            showWalletScreen();
            return;
        }
        
        // Check if wallet is still connected
        if (!window.web3Manager.address) {
            alert('Wallet connection lost. Please reconnect your wallet.');
            showWalletScreen();
            return;
        }
        
        console.log('startGame() called - resetting all game state');
        
        this.state = 'playing';
        this.score = 0;
        this.lives = this.getLivesFromPayment(); // Get lives from payment tier
        
        // CRITICAL: Reset invincibility state for new game
        this.invincible = false;
        this.invincibilityStartTime = null;
        console.log('Invincibility reset for new game');
        
        // Clear any existing invincibility timers
        if (this.invincibilityTimer) {
            clearTimeout(this.invincibilityTimer);
            this.invincibilityTimer = null;
            console.log('Cleared existing invincibility timer');
        }
        
        this.clearGameObjects();
        
        // Reset intensity for new game
        this.enemySpawnRate = this.baseEnemySpawnRate;
        this.intensityMultiplier = 1.0;
        
        // Show UI elements
        document.getElementById('scoreDisplay').style.display = 'block';
        document.getElementById('livesDisplay').style.display = 'block';
        document.getElementById('intensityDisplay').style.display = 'block';
        document.getElementById('menuOverlay').classList.add('hidden');
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('lifeLostOverlay').classList.add('hidden');
        document.getElementById('leaderboardOverlay').classList.add('hidden');
        document.getElementById('walletScreen').classList.add('hidden');
        
        // Reset UI styling
        const livesElementUI = document.getElementById('livesValue');
        if (livesElementUI) {
            livesElementUI.style.color = '';
            livesElementUI.style.textShadow = '';
            livesElementUI.style.fontWeight = '';
        }
        
        // Update UI
        this.updateGameUI();
        console.log('startGame() completed - game ready to play');
    }
    
    clearGameObjects() {
        // Return objects to pools
        this.gameObjects.bullets.forEach(bullet => this.returnToPool('bullets', bullet));
        this.gameObjects.enemies.forEach(enemy => this.returnToPool('enemies', enemy));
        this.gameObjects.particles.forEach(particle => this.returnToPool('particles', particle));
        
        // Clear arrays
        this.gameObjects.bullets.length = 0;
        this.gameObjects.enemies.length = 0;
        this.gameObjects.particles.length = 0;
    }
    
    async gameOver() {
        console.log('gameOver() called - finalizing game state');
        
        // Prevent multiple game over calls
        if (this.state === 'gameOver') {
            console.log('Game over already triggered - ignoring duplicate call');
            return;
        }
        
        // Set state first to prevent further processing
        this.state = 'gameOver';
        
        // Update global leaderboard with current score
        if (window.web3Manager && window.web3Manager.address) {
            console.log('🎮 Game Over - Updating score:', this.score);
            
            // Update real score in JSONBin.io database
            try {
                await window.web3Manager.updatePlayerScore(this.score);
                console.log('✅ Score updated successfully to JSONBin.io');
            } catch (error) {
                console.error('❌ Failed to update score to JSONBin.io:', error);
            }
        } else {
            console.log('⚠️ No web3Manager or address available for score update');
        }
        
        // Check if this is a new high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
        }
        
        // Update UI elements with enhanced debugging
        const finalScoreElement = document.getElementById('finalScore');
        const highScoreElement = document.getElementById('highScore');
        
        console.log('Updating score elements:', {
            finalScoreElement: !!finalScoreElement,
            highScoreElement: !!highScoreElement,
            score: this.score,
            highScore: this.highScore
        });
        
        if (finalScoreElement) {
            finalScoreElement.textContent = this.score;
            console.log('Final score updated to:', this.score);
        } else {
            console.error('Final score element not found!');
        }
        
        if (highScoreElement) {
            highScoreElement.textContent = this.highScore;
            console.log('High score updated to:', this.highScore);
        } else {
            console.error('High score element not found!');
        }
        
        // Hide game UI elements
        const gameUIElements = ['scoreDisplay', 'livesDisplay', 'intensityDisplay'];
        gameUIElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'none';
                console.log(`Hidden ${elementId}`);
            } else {
                console.error(`${elementId} element not found!`);
            }
        });
        
        // Hide other overlays
        const overlaysToHide = ['lifeLostOverlay', 'leaderboardOverlay'];
        overlaysToHide.forEach(overlayId => {
            const element = document.getElementById(overlayId);
            if (element) {
                element.classList.add('hidden');
                console.log(`Hidden ${overlayId}`);
            } else {
                console.error(`${overlayId} element not found!`);
            }
        });
        
        console.log('Game over UI updated - calling showGameOver()');
        
        // Add a small delay to ensure UI updates are processed
        setTimeout(() => {
            showGameOver();
            console.log('showGameOver() called after delay');
        }, 100);
    }
    
    loseLife() {
        // Prevent multiple life losses in quick succession
        if (this.state === 'lifeLost' || this.state === 'gameOver') {
            console.log('Life loss prevented - already in lifeLost or gameOver state');
            return;
        }
        
        console.log('loseLife() called - current lives:', this.lives);
        this.lives--;
        this.updateGameUI();
        
        if (this.lives <= 0) {
            console.log('No lives remaining - triggering game over');
            // Reset payment state when all lives are lost
            if (window.web3Manager) {
                window.web3Manager.resetPaymentState();
            }
            this.gameOver();
        } else {
            console.log('Lives remaining - showing life lost screen');
            // Pause game and show life lost screen
            this.state = 'lifeLost';
            this.showLifeLostScreen();
        }
    }
    
    showLifeLostScreen() {
        console.log('showLifeLostScreen() called - lives remaining:', this.lives);
        
        // Clear all enemies and bullets
        this.gameObjects.enemies.forEach(enemy => this.returnToPool('enemies', enemy));
        this.gameObjects.bullets.forEach(bullet => this.returnToPool('bullets', bullet));
        this.gameObjects.enemies.length = 0;
        this.gameObjects.bullets.length = 0;
        console.log('Game objects cleared');
        
        // Reset player position
        this.gameObjects.player.x = this.canvas.width / 2;
        this.gameObjects.player.y = this.canvas.height / 2;
        console.log('Player position reset');
        
        // Hide the game UI elements
        const scoreElement = document.getElementById('scoreDisplay');
        const livesElement = document.getElementById('livesDisplay');
        const intensityElement = document.getElementById('intensityDisplay');
        
        if (scoreElement) {
            scoreElement.style.display = 'none';
        }
        if (livesElement) {
            livesElement.style.display = 'none';
        }
        if (intensityElement) {
            intensityElement.style.display = 'none';
        }
        console.log('Game UI elements hidden');
        
        // Show life lost overlay with enhanced debugging
        const lifeLostElement = document.getElementById('lifeLostOverlay');
        const livesRemainingElement = document.getElementById('livesRemaining');
        const continueButton = lifeLostElement ? lifeLostElement.querySelector('button') : null;
        
        console.log('Life lost elements found:', {
            overlay: !!lifeLostElement,
            livesRemaining: !!livesRemainingElement,
            continueButton: !!continueButton
        });
        
        if (lifeLostElement) {
            // Force show the overlay
            lifeLostElement.classList.remove('hidden');
            lifeLostElement.style.display = 'flex';
            lifeLostElement.style.zIndex = '1000';
            console.log('Life lost overlay shown with forced display');
        }
        
        if (livesRemainingElement) {
            livesRemainingElement.textContent = this.lives;
            console.log('Lives remaining updated:', this.lives);
        }
        
        if (continueButton) {
            // Ensure button is visible and clickable
            continueButton.style.display = 'block';
            continueButton.style.visibility = 'visible';
            continueButton.style.opacity = '1';
            continueButton.style.pointerEvents = 'auto';
            console.log('Continue button made visible and clickable');
            
            // Add a visual highlight to make it obvious
            continueButton.style.background = '#4CAF50';
            continueButton.style.color = 'white';
            continueButton.style.fontWeight = 'bold';
            continueButton.style.border = '2px solid #45a049';
            continueButton.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
            console.log('Continue button styled for visibility');
        }
        
        // Add a brief flash to make the screen obvious
        setTimeout(() => {
            if (lifeLostElement) {
                lifeLostElement.style.animation = 'pulse 0.5s ease-in-out';
                console.log('Added pulse animation to life lost screen');
            }
        }, 100);
        
        console.log('showLifeLostScreen() completed');
    }
    
    continueGame() {
        console.log('continueGame() called - current state:', this.state);
        
        // Set game state to playing
        this.state = 'playing';
        console.log('Game state set to playing');
        
        // Hide the life lost overlay
        const lifeLostElement = document.getElementById('lifeLostOverlay');
        if (lifeLostElement) {
            lifeLostElement.classList.add('hidden');
            console.log('Life lost overlay hidden');
        }
        
        // Show the game UI elements
        const scoreElement = document.getElementById('scoreDisplay');
        const livesElement = document.getElementById('livesDisplay');
        const intensityElement = document.getElementById('intensityDisplay');
        
        if (scoreElement) {
            scoreElement.style.display = 'block';
            console.log('Score display shown');
        }
        if (livesElement) {
            livesElement.style.display = 'block';
            console.log('Lives display shown');
        }
        if (intensityElement) {
            intensityElement.style.display = 'block';
            console.log('Intensity display shown');
        }
        
        // Update the UI
        this.updateGameUI();
        console.log('Game UI updated');
        
        // Enhanced invincibility period with visual feedback
        this.invincible = true;
        this.invincibilityStartTime = Date.now();
        console.log('Player invincible for 3 seconds - invincibilityStartTime:', this.invincibilityStartTime);
        
        // Add visual indicator to UI
        const livesElementUI = document.getElementById('livesValue');
        if (livesElementUI) {
            livesElementUI.style.color = '#4CAF50';
            livesElementUI.style.textShadow = '0 0 10px #4CAF50';
            livesElementUI.style.fontWeight = 'bold';
        }
        
        // Store timer reference so it can be cleared if needed
        this.invincibilityTimer = setTimeout(() => {
            this.invincible = false;
            this.invincibilityStartTime = null;
            this.invincibilityTimer = null;
            console.log('Player invincibility ended at:', Date.now());
            
            // Remove visual indicator
            if (livesElementUI) {
                livesElementUI.style.color = '';
                livesElementUI.style.textShadow = '';
                livesElementUI.style.fontWeight = '';
            }
        }, 3000); // Increased to 3 seconds for better visibility
        
        console.log('continueGame() completed successfully');
    }
    
    updateGameUI() {
        // Update score display
        const scoreElement = document.getElementById('scoreValue');
        if (scoreElement) {
            scoreElement.textContent = this.score.toLocaleString();
        }
        
        // Update lives display
        const livesElement = document.getElementById('livesValue');
        if (livesElement) {
            livesElement.textContent = this.lives;
        }
        
        // Update intensity display
        const intensityElement = document.getElementById('intensityValue');
        if (intensityElement) {
            intensityElement.textContent = this.intensityMultiplier.toFixed(1) + 'x';
        }
    }
    
    shoot() {
        if (this.gameObjects.bullets.length >= this.maxBullets) return;
        
        const player = this.gameObjects.player;
        const bullet = this.getFromPool('bullets',
            player.x + player.width / 2,
            player.y + player.height / 2,
            player.angle
        );
        
        this.gameObjects.bullets.push(bullet);
    }
    
    spawnEnemy() {
        const enemy = this.getFromPool('enemies', this.canvas.width, this.canvas.height, this.score);
        this.gameObjects.enemies.push(enemy);
    }
    
    update(deltaTime) {
        if (this.state !== 'playing') return;
        
        // Update player
        this.gameObjects.player.update(this.mouseX, this.mouseY);
        
        // Scale intensity based on score
        this.updateIntensity();
        
        // Spawn enemies with scaled intensity
        if (Math.random() < this.enemySpawnRate * deltaTime) {
            this.spawnEnemy();
        }
        
        // Update bullets with pool management
        for (let i = this.gameObjects.bullets.length - 1; i >= 0; i--) {
            const bullet = this.gameObjects.bullets[i];
            bullet.update();
            
            if (!bullet.isOnScreen(this.canvas.width, this.canvas.height)) {
                this.returnToPool('bullets', bullet);
                this.gameObjects.bullets.splice(i, 1);
            }
        }
        
        // Update enemies with pool management
        for (let i = this.gameObjects.enemies.length - 1; i >= 0; i--) {
            const enemy = this.gameObjects.enemies[i];
            enemy.update();
            
            if (!enemy.isOnScreen(this.canvas.width, this.canvas.height)) {
                this.returnToPool('enemies', enemy);
                this.gameObjects.enemies.splice(i, 1);
            }
        }
        
        // Update particles with pool management
        for (let i = this.gameObjects.particles.length - 1; i >= 0; i--) {
            const particle = this.gameObjects.particles[i];
            particle.update();
            
            if (particle.life <= 0) {
                this.returnToPool('particles', particle);
                this.gameObjects.particles.splice(i, 1);
            }
        }
        
        // Check collisions
        this.checkCollisions();
        
        // Update UI
        this.updateGameUI();
    }
    
    updateIntensity() {
        // Scale intensity based on score milestones (reduced scaling)
        const scoreMilestones = [1000, 2500, 5000, 10000, 20000, 50000];
        let newIntensity = 1.0;
        
        for (let i = 0; i < scoreMilestones.length; i++) {
            if (this.score >= scoreMilestones[i]) {
                newIntensity = 1.0 + (i + 1) * 0.1; // Reduced from 0.3 to 0.1 (67% reduction)
            }
        }
        
        // Cap at maximum intensity
        newIntensity = Math.min(newIntensity, this.maxIntensity);
        
        if (newIntensity !== this.intensityMultiplier) {
            this.intensityMultiplier = newIntensity;
            this.enemySpawnRate = this.baseEnemySpawnRate * this.intensityMultiplier;
        }
    }
    
    checkCollisions() {
        const bullets = this.gameObjects.bullets;
        const enemies = this.gameObjects.enemies;
        const player = this.gameObjects.player;
        
        // Bullet-Enemy collisions
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                
                if (this.isColliding(bullet, enemy)) {
                    this.returnToPool('bullets', bullet);
                    this.returnToPool('enemies', enemy);
                    bullets.splice(i, 1);
                    enemies.splice(j, 1);
                    
                    this.score += 100;
                    this.addExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                    break;
                }
            }
        }
        
        // Enemy-Player collisions
        if (!this.invincible && this.state === 'playing') {
            for (const enemy of enemies) {
                if (this.isColliding(player, enemy)) {
                    console.log('🚨 COLLISION DETECTED! Player collision with enemy at:', {
                        playerPos: { x: player.x, y: player.y },
                        enemyPos: { x: enemy.x, y: enemy.y },
                        invincible: this.invincible,
                        state: this.state,
                        lives: this.lives
                    });
                    
                    // Set invincible immediately to prevent multiple collisions
                    this.invincible = true;
                    console.log('Invincibility set to true to prevent multiple collisions');
                    
                    this.loseLife();
                    
                    return; // Exit immediately after first collision
                }
            }
        } else if (this.invincible) {
            // Debug: Log when invincibility is preventing collisions
            if (enemies.length > 0 && this.state === 'playing') {
                const enemy = enemies[0]; // Check first enemy
                if (this.isColliding(player, enemy)) {
                    console.log('🛡️ Invincibility protecting player from collision:', {
                        invincible: this.invincible,
                        invincibilityTime: this.invincibilityStartTime ? Date.now() - this.invincibilityStartTime : 'N/A',
                        state: this.state
                    });
                }
            }
        }
    }
    
    isColliding(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }
    
    addExplosion(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const particle = this.getFromPool('particles', x, y, angle);
            this.gameObjects.particles.push(particle);
        }
    }
    
    draw() {
        // Clear canvas efficiently
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.state === 'playing' || this.state === 'gameOver') {
            // Batch similar drawing operations
            this.ctx.save();
            
            // Draw particles
            this.ctx.globalAlpha = 0.8;
            this.gameObjects.particles.forEach(particle => particle.draw(this.ctx));
            
            // Draw bullets
            this.ctx.globalAlpha = 1.0;
            this.gameObjects.bullets.forEach(bullet => bullet.draw(this.ctx));
            
            // Draw enemies
            this.gameObjects.enemies.forEach(enemy => enemy.draw(this.ctx));
            
            // Draw player
            this.gameObjects.player.draw(this.ctx, this.sprites.player);
            
            this.ctx.restore();
        }
    }
    
    gameLoop(currentTime = 0) {
        const deltaTime = Math.min(currentTime - this.lastFrameTime, 16.67);
        this.lastFrameTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    getFromPool(poolName, ...args) {
        const pool = this.objectPools[poolName];
        if (pool.length > 0) {
            const obj = pool.pop();
            obj.reset(...args);
            return obj;
        }
        // Fallback if pool is empty
        switch (poolName) {
            case 'bullets': return new Bullet(...args);
            case 'enemies': return new Enemy(...args);
            case 'particles': return new Particle(...args);
        }
    }
    
    returnToPool(poolName, obj) {
        this.objectPools[poolName].push(obj);
    }
    
    async updateLeaderboardDisplay() {
        console.log('updateLeaderboardDisplay() called');
        
        const leaderboardElement = document.getElementById('leaderboard');
        const leaderboardContent = document.getElementById('leaderboardContent');
        
        console.log('Leaderboard elements found:', {
            leaderboardElement: !!leaderboardElement,
            leaderboardContent: !!leaderboardContent
        });
        
        if (!leaderboardElement && !leaderboardContent) {
            console.log('Leaderboard elements not found');
            return;
        }
        
        try {
            console.log('🔄 Loading leaderboard data...');
            
            // Load global leaderboard from API with timeout
            const globalLeaderboard = await Promise.race([
                loadGlobalLeaderboard(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('API timeout')), 8000)
                )
            ]);
            
            console.log('📊 Leaderboard data received:', {
                totalEntries: globalLeaderboard.length,
                entries: globalLeaderboard.map(entry => ({
                    address: entry.address.substring(0, 6) + '...' + entry.address.substring(38),
                    totalScore: entry.totalScore,
                    gamesPlayed: entry.gamesPlayed
                }))
            });
            
            let html = '';
            
            // Add countdown timer if available
            if (window.web3Manager) {
                try {
                    const metadata = await window.web3Manager.getLeaderboardMetadata();
                    const countdown = await window.web3Manager.getLeaderboardCountdown();
                    console.log('📈 Leaderboard countdown:', countdown);
                    
                    if (countdown) {
                        const daysSinceReset = countdown.daysSinceReset;
                        const daysUntilReset = countdown.daysUntilReset;
                        
                        // Format countdown display
                        let countdownText = '';
                        if (countdown.days > 0) {
                            countdownText = `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`;
                        } else if (countdown.hours > 0) {
                            countdownText = `${countdown.hours}h ${countdown.minutes}m ${countdown.seconds}s`;
                        } else if (countdown.minutes > 0) {
                            countdownText = `${countdown.minutes}m ${countdown.seconds}s`;
                        } else {
                            countdownText = `${countdown.seconds}s`;
                        }
                        
                        html += `
                            <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(76, 175, 80, 0.1); border-radius: 5px;">
                                <div style="color: #4CAF50; font-size: 12px; margin-bottom: 5px;">
                                    SEASON #${(metadata.resetCount || 1)} LIVE NOW (${daysSinceReset.toFixed(0)} days in)
                                </div>
                                <div style="color: #FFD700; font-size: 11px;">
                                    Next reset in ${countdownText}
                                </div>
                            </div>
                        `;
                        console.log('✅ Countdown timer added to leaderboard');
                    } else {
                        console.log('⚠️ Countdown is null, showing fallback');
                        // Fallback countdown display
                        html += `
                            <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(76, 175, 80, 0.1); border-radius: 5px;">
                                <div style="color: #4CAF50; font-size: 12px; margin-bottom: 5px;">
                                    SEASON #${(metadata.resetCount || 1)} LIVE NOW (0 days in)
                                </div>
                                <div style="color: #FFD700; font-size: 11px;">
                                    Next reset in 99d 23h 59m
                                </div>
                            </div>
                        `;
                    }
                } catch (error) {
                    console.error('❌ Error getting countdown:', error);
                    // Fallback countdown display on error
                    html += `
                        <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(76, 175, 80, 0.1); border-radius: 5px;">
                            <div style="color: #4CAF50; font-size: 12px; margin-bottom: 5px;">
                                SEASON #${(metadata.resetCount || 1)} LIVE NOW (0 days in)
                            </div>
                            <div style="color: #FFD700; font-size: 11px;">
                                Next reset in 99d 23h 59m
                            </div>
                        </div>
                    `;
                }
            } else {
                console.log('⚠️ web3Manager not available for countdown');
            }
            
            // Get current user's address for highlighting
            const currentUserAddress = window.web3Manager ? window.web3Manager.address : null;
            
            // Sort by total score (highest first)
            globalLeaderboard.sort((a, b) => b.totalScore - a.totalScore);
            
            // Show all players
            globalLeaderboard.forEach((entry, index) => {
                const shortAddress = entry.address.substring(0, 6) + '...' + entry.address.substring(38);
                const lastGameDate = entry.lastGameDate ? new Date(entry.lastGameDate).toLocaleDateString() : 'Never';
                const rank = entry.rank || (index + 1);
                const gamesPlayed = entry.gamesPlayed || 0;
                
                // Highlight current user's entry
                const isCurrentUser = currentUserAddress && entry.address.toLowerCase() === currentUserAddress.toLowerCase();
                const highlightClass = isCurrentUser ? 'current-user' : '';
                
                html += `
                    <div class="leaderboard-entry ${highlightClass}">
                        <span class="rank">${rank}.</span>
                        <span class="address">${shortAddress}${isCurrentUser ? ' (You)' : ''}</span>
                        <span class="score">${entry.totalScore.toLocaleString()} pts</span>
                        <span class="games">${gamesPlayed} games</span>
                        <span class="date">${lastGameDate}</span>
                    </div>
                `;
            });
            
            // Add message if no entries
            if (globalLeaderboard.length === 0) {
                html += '<div class="leaderboard-entry">No players yet. Be the first to pay and play!</div>';
                console.log('⚠️ No leaderboard entries found');
            } else {
                console.log('✅ Leaderboard populated with', globalLeaderboard.length, 'entries');
            }
            
            if (leaderboardElement) {
                leaderboardElement.innerHTML = html;
            }
            
            if (leaderboardContent) {
                leaderboardContent.innerHTML = html;
            }
            
        } catch (error) {
            console.error('Error loading global leaderboard:', error);
            
            // Create a fallback leaderboard with local data
            let fallbackHtml = `
                <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(76, 175, 80, 0.1); border-radius: 5px;">
                    <div style="color: #4CAF50; font-size: 12px; margin-bottom: 5px;">
                        SEASON #1 LIVE NOW
                    </div>
                    <div style="color: #FFD700; font-size: 11px;">
                        Next reset in 99d 23h 59m
                    </div>
                </div>
            `;
            
            // Add some sample entries or current user data
            if (window.web3Manager && window.web3Manager.address) {
                const shortAddress = window.web3Manager.address.substring(0, 6) + '...' + window.web3Manager.address.substring(38);
                fallbackHtml += `
                    <div class="leaderboard-entry current-user">
                        <span class="rank">1.</span>
                        <span class="address">${shortAddress} (You)</span>
                        <span class="score">0 pts</span>
                        <span class="games">0 games</span>
                        <span class="date">Today</span>
                    </div>
                `;
            }
            
            fallbackHtml += `
                <div class="leaderboard-entry">
                    <span class="rank">2.</span>
                    <span class="address">0x1234...5678</span>
                    <span class="score">0 pts</span>
                    <span class="games">0 games</span>
                    <span class="date">Never</span>
                </div>
                <div class="leaderboard-entry">
                    <span class="rank">3.</span>
                    <span class="address">0xabcd...efgh</span>
                    <span class="score">0 pts</span>
                    <span class="games">0 games</span>
                    <span class="date">Never</span>
                </div>
            `;
            
            if (leaderboardElement) {
                leaderboardElement.innerHTML = fallbackHtml;
            }
            
            if (leaderboardContent) {
                leaderboardContent.innerHTML = fallbackHtml;
            }
            
            console.log('Fallback leaderboard displayed');
        }
    }
}

// Optimized Game Objects with object pooling support
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 43;
        this.height = 65;
        this.angle = 0;
    }
    
    update(mouseX, mouseY) {
        const dx = mouseX - (this.x + this.width / 2);
        const dy = mouseY - (this.y + this.height / 2);
        this.angle = Math.atan2(dy, dx) + Math.PI / 2;
    }
    
    draw(ctx, sprite) {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.angle + Math.PI);
        
        // Enhanced invincibility effect if player is invincible
        if (window.game && window.game.invincible) {
            const time = Date.now() * 0.01;
            const alpha = 0.6 + Math.sin(time) * 0.4;
            ctx.globalAlpha = alpha;
            
            // Add multiple shadow effects for better visibility
            ctx.shadowColor = '#4CAF50';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Add a pulsing glow effect
            const glowSize = 5 + Math.sin(time * 2) * 3;
            ctx.shadowBlur = glowSize;
        }
        
        ctx.drawImage(sprite, -this.width / 2, -this.height / 2, this.width, this.height);
        
        // Add an additional invincibility indicator ring
        if (window.game && window.game.invincible) {
            const time = Date.now() * 0.01;
            ctx.globalAlpha = 0.3 + Math.sin(time * 3) * 0.2;
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, this.width * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

class Enemy {
    constructor(canvasWidth, canvasHeight, score) {
        this.reset(canvasWidth, canvasHeight, score);
    }
    
    reset(canvasWidth, canvasHeight, score) {
        this.width = 50;
        this.height = 50;
        this.baseSpeed = 2;
        
        // Scale speed with game intensity
        const intensityMultiplier = window.game ? window.game.intensityMultiplier : 1.0;
        this.speed = this.baseSpeed * intensityMultiplier;
        
        // More complex movement patterns at higher scores
        if (score >= 1000) {
            const side = Math.floor(Math.random() * 4);
            switch (side) {
                case 0:
                    this.x = Math.random() * (canvasWidth - this.width);
                    this.y = -this.height;
                    this.dx = (Math.random() - 0.5) * 2 * intensityMultiplier;
                    this.dy = this.speed;
                    break;
                case 1:
                    this.x = canvasWidth + this.width;
                    this.y = Math.random() * (canvasHeight - this.height);
                    this.dx = -this.speed;
                    this.dy = (Math.random() - 0.5) * 2 * intensityMultiplier;
                    break;
                case 2:
                    this.x = Math.random() * (canvasWidth - this.width);
                    this.y = canvasHeight + this.height;
                    this.dx = (Math.random() - 0.5) * 2 * intensityMultiplier;
                    this.dy = -this.speed;
                    break;
                case 3:
                    this.x = -this.width;
                    this.y = Math.random() * (canvasHeight - this.height);
                    this.dx = this.speed;
                    this.dy = (Math.random() - 0.5) * 2 * intensityMultiplier;
                    break;
            }
        } else {
            this.x = Math.random() * (canvasWidth - this.width);
            this.y = -this.height;
            this.dx = 0;
            this.dy = this.speed;
        }
    }
    
    update() {
        this.x += this.dx;
        this.y += this.dy;
    }
    
    draw(ctx) {
        ctx.drawImage(game.sprites.enemy, this.x, this.y, this.width, this.height);
    }
    
    isOnScreen(canvasWidth, canvasHeight) {
        return this.x > -this.width - 100 &&
               this.x < canvasWidth + 100 &&
               this.y > -this.height - 100 &&
               this.y < canvasHeight + 100;
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.reset(x, y, angle);
    }
    
    reset(x, y, angle) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 10;
        this.speed = 7;
        this.angle = angle;
    }
    
    update() {
        this.x += Math.sin(this.angle) * this.speed;
        this.y -= Math.cos(this.angle) * this.speed;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
    
    isOnScreen(canvasWidth, canvasHeight) {
        return this.x > 0 && this.x < canvasWidth && this.y > 0 && this.y < canvasHeight;
    }
}

class Particle {
    constructor(x, y, angle) {
        this.reset(x, y, angle);
    }
    
    reset(x, y, angle) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * 3;
        this.vy = Math.sin(angle) * 3;
        this.life = 30;
        this.maxLife = 30;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FF6B35';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Global game instance
let game;

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    game = new SpaceHooligans();
    window.game = game; // Make game accessible globally
});

// Global functions for HTML onclick handlers
function startGame() {
    game.startGame();
}

function continueGame() {
    game.continueGame();
}

function showLeaderboard() {
    console.log('showLeaderboard() called');
    
    // Show leaderboard overlay first
    const leaderboardOverlay = document.getElementById('leaderboardOverlay');
    if (leaderboardOverlay) {
        leaderboardOverlay.classList.remove('hidden');
        leaderboardOverlay.style.display = 'flex';
        console.log('Leaderboard overlay shown');
    } else {
        console.error('Leaderboard overlay not found!');
        return;
    }
    
    // Hide other overlays
    const overlaysToHide = ['gameOverOverlay', 'menuOverlay', 'walletScreen'];
    overlaysToHide.forEach(overlayId => {
        const element = document.getElementById(overlayId);
        if (element) {
            element.classList.add('hidden');
            console.log(`Hidden ${overlayId}`);
        }
    });
    
    // Load and display global leaderboard with timeout protection
    if (window.game) {
        console.log('Starting leaderboard update...');
        
        // Add a loading message
        const leaderboardContent = document.getElementById('leaderboardContent');
        if (leaderboardContent) {
            leaderboardContent.innerHTML = '<div class="leaderboard-entry">Loading leaderboard...</div>';
        }
        
        // Call updateLeaderboardDisplay with timeout protection
        Promise.race([
            window.game.updateLeaderboardDisplay(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Leaderboard timeout')), 10000)
            )
        ]).then(() => {
            console.log('Leaderboard updated successfully');
        }).catch((error) => {
            console.error('Error updating leaderboard:', error);
            
            // Show error message
            if (leaderboardContent) {
                leaderboardContent.innerHTML = `
                    <div class="leaderboard-entry">Error loading leaderboard.</div>
                    <div class="leaderboard-entry">Please try again later.</div>
                    <button class="button" onclick="showLeaderboard()" style="margin-top: 10px;">Retry</button>
                `;
            }
        });
    } else {
        console.error('Game not initialized');
        if (leaderboardContent) {
            leaderboardContent.innerHTML = '<div class="leaderboard-entry">Game not initialized</div>';
        }
    }
}

function showLeaderboardFromWallet() {
    console.log('showLeaderboardFromWallet() called');
    
    // Show leaderboard overlay first
    const leaderboardOverlay = document.getElementById('leaderboardOverlay');
    if (leaderboardOverlay) {
        leaderboardOverlay.classList.remove('hidden');
        leaderboardOverlay.style.display = 'flex';
        console.log('Leaderboard overlay shown from wallet');
    } else {
        console.error('Leaderboard overlay not found!');
        return;
    }
    
    // Hide wallet screen
    const walletScreen = document.getElementById('walletScreen');
    if (walletScreen) {
        walletScreen.classList.add('hidden');
        console.log('Wallet screen hidden');
    }
    
    // Load and display global leaderboard with timeout protection
    if (window.game) {
        console.log('Starting leaderboard update from wallet...');
        
        // Add a loading message
        const leaderboardContent = document.getElementById('leaderboardContent');
        if (leaderboardContent) {
            leaderboardContent.innerHTML = '<div class="leaderboard-entry">Loading leaderboard...</div>';
        }
        
        // Call updateLeaderboardDisplay with timeout protection
        Promise.race([
            window.game.updateLeaderboardDisplay(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Leaderboard timeout')), 10000)
            )
        ]).then(() => {
            console.log('Leaderboard updated successfully from wallet');
        }).catch((error) => {
            console.error('Error updating leaderboard from wallet:', error);
            
            // Show error message
            if (leaderboardContent) {
                leaderboardContent.innerHTML = `
                    <div class="leaderboard-entry">Error loading leaderboard.</div>
                    <div class="leaderboard-entry">Please try again later.</div>
                    <button class="button" onclick="showLeaderboardFromWallet()" style="margin-top: 10px;">Retry</button>
                `;
            }
        });
    } else {
        console.error('Game not initialized');
        if (leaderboardContent) {
            leaderboardContent.innerHTML = '<div class="leaderboard-entry">Game not initialized</div>';
        }
    }
}

function hideLeaderboard() {
    document.getElementById('leaderboardOverlay').classList.add('hidden');
    // Return to appropriate screen based on game state
    if (window.game && window.game.state === 'gameOver') {
        document.getElementById('gameOverOverlay').classList.remove('hidden');
    } else if (window.web3Manager && window.web3Manager.address) {
        // If wallet is connected, show menu
        document.getElementById('menuOverlay').classList.remove('hidden');
    } else {
        // Otherwise show wallet screen
        document.getElementById('walletScreen').classList.remove('hidden');
    }
}

// Debug function to test game over screen
function testGameOver() {
    console.log('Testing game over screen...');
    if (window.game) {
        window.game.score = 1500;
        window.game.highScore = 2000;
        window.game.state = 'gameOver';
        showGameOver();
    } else {
        console.error('Game not initialized');
    }
}

 