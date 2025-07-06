// Space Hooligans - Web3 Arcade Game
// Optimized for maximum performance

class SpaceHooligans {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.state = 'menu';
        this.score = 0;
        this.lives = 5; // 5 lives per payment
        this.highScore = 0;
        
        // Intensity and difficulty scaling
        this.baseEnemySpawnRate = 0.002; // Reduced by 90%
        this.enemySpawnRate = this.baseEnemySpawnRate;
        this.intensityMultiplier = 1.0;
        this.maxIntensity = 3.0; // Maximum intensity multiplier
        
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
        
        // Performance settings
        this.maxBullets = 3;
        this.lastFrameTime = 0;
        
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
        this.loadLeaderboard();
        this.updateLeaderboardDisplay();
        this.loadBlockchainLeaderboard();
    }
    
    initObjectPools() {
        // Pre-allocate objects to reduce garbage collection
        for (let i = 0; i < 50; i++) {
            this.objectPools.bullets.push(new Bullet(0, 0, 0));
            this.objectPools.enemies.push(new Enemy(800, 600, 0));
            this.objectPools.particles.push(new Particle(0, 0, 0));
        }
    }
    
    // Leaderboard functionality
    loadLeaderboard() {
        try {
            const savedLeaderboard = localStorage.getItem('spaceHooligans_leaderboard');
            if (savedLeaderboard) {
                this.leaderboard = JSON.parse(savedLeaderboard);
                
                // Ensure backward compatibility for existing entries
                this.leaderboard.forEach(entry => {
                    if (!entry.gamesPlayed) {
                        entry.gamesPlayed = 1;
                    }
                });
            } else {
                this.leaderboard = [];
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.leaderboard = [];
        }
    }
    
    saveLeaderboard() {
        try {
            localStorage.setItem('spaceHooligans_leaderboard', JSON.stringify(this.leaderboard));
        } catch (error) {
            console.error('Error saving leaderboard:', error);
        }
    }
    
    async updateLeaderboard(score, walletAddress) {
        if (!walletAddress) return;
        
        // Update local leaderboard
        const existingIndex = this.leaderboard.findIndex(entry => entry.address === walletAddress);
        
        if (existingIndex !== -1) {
            if (score > this.leaderboard[existingIndex].score) {
                this.leaderboard[existingIndex].score = score;
                this.leaderboard[existingIndex].timestamp = Date.now();
            }
            this.leaderboard[existingIndex].gamesPlayed = (this.leaderboard[existingIndex].gamesPlayed || 0) + 1;
        } else {
            this.leaderboard.push({
                address: walletAddress,
                score: score,
                timestamp: Date.now(),
                gamesPlayed: 1
            });
        }
        
        this.leaderboard.sort((a, b) => b.score - a.score);
        if (this.leaderboard.length > 100) {
            this.leaderboard = this.leaderboard.slice(0, 100);
        }
        
        this.saveLeaderboard();
        this.updateLeaderboardDisplay();
        
        // Submit to blockchain if available
        if (window.web3Manager && window.web3Manager.leaderboardContract) {
            const gamesPlayed = existingIndex !== -1 ? this.leaderboard[existingIndex].gamesPlayed : 1;
            await window.web3Manager.submitScoreToBlockchain(score, gamesPlayed);
        }
    }
    
    updateLeaderboardDisplay() {
        const leaderboardElement = document.getElementById('leaderboard');
        const leaderboardContent = document.getElementById('leaderboardContent');
        
        let html = '';
        
        this.leaderboard.slice(0, 10).forEach((entry, index) => {
            const shortAddress = entry.address.substring(0, 6) + '...' + entry.address.substring(38);
            const date = new Date(entry.timestamp).toLocaleDateString();
            const rank = index + 1;
            const gamesPlayed = entry.gamesPlayed || 1;
            
            html += `
                <div class="leaderboard-entry">
                    <span class="rank">${rank}.</span>
                    <span class="address">${shortAddress}</span>
                    <span class="score">${entry.score.toLocaleString()}</span>
                    <span class="games">${gamesPlayed} games</span>
                    <span class="date">${date}</span>
                </div>
            `;
        });
        
        if (leaderboardElement) {
            leaderboardElement.innerHTML = html;
        }
        
        if (leaderboardContent) {
            leaderboardContent.innerHTML = html;
        }
    }
    
    async loadBlockchainLeaderboard() {
        if (window.web3Manager && window.web3Manager.leaderboardContract) {
            try {
                const blockchainLeaderboard = await window.web3Manager.getBlockchainLeaderboard();
                if (blockchainLeaderboard.length > 0) {
                    // Merge blockchain data with local data
                    blockchainLeaderboard.forEach(entry => {
                        const existingIndex = this.leaderboard.findIndex(localEntry => localEntry.address === entry.address);
                        if (existingIndex === -1) {
                            this.leaderboard.push(entry);
                        } else if (entry.score > this.leaderboard[existingIndex].score) {
                            this.leaderboard[existingIndex] = entry;
                        }
                    });
                    
                    this.leaderboard.sort((a, b) => b.score - a.score);
                    this.saveLeaderboard();
                    this.updateLeaderboardDisplay();
                }
            } catch (error) {
                console.error('Error loading blockchain leaderboard:', error);
            }
        }
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
    
    startGame() {
        if (!window.web3Manager) {
            alert('Web3 manager not initialized. Please refresh the page and try again.');
            return;
        }
        
        if (!window.web3Manager.hasPaid) {
            alert('Please connect your wallet and pay 1 $KARRAT to play!');
            return;
        }
        
        this.state = 'playing';
        this.score = 0;
        this.lives = 5; // Reset lives for new game
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
        
        // Update UI
        this.updateGameUI();
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
        // Update leaderboard with current score
        if (window.web3Manager && window.web3Manager.address) {
            await this.updateLeaderboard(this.score, window.web3Manager.address);
        }
        
        // Check if this is a new high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
        }
        
        this.state = 'gameOver';
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('highScore').textContent = this.highScore;
        document.getElementById('scoreDisplay').style.display = 'none';
        document.getElementById('livesDisplay').style.display = 'none';
        document.getElementById('intensityDisplay').style.display = 'none';
        document.getElementById('lifeLostOverlay').classList.add('hidden');
        document.getElementById('leaderboardOverlay').classList.add('hidden');
        showGameOver();
    }
    
    loseLife() {
        this.lives--;
        this.updateGameUI();
        
        if (this.lives <= 0) {
            // Reset payment state when all lives are lost
            if (window.web3Manager) {
                window.web3Manager.resetPaymentState();
            }
            this.gameOver();
        } else {
            // Pause game and show life lost screen
            this.state = 'lifeLost';
            this.showLifeLostScreen();
        }
    }
    
    showLifeLostScreen() {
        // Clear all enemies and bullets
        this.gameObjects.enemies.forEach(enemy => this.returnToPool('enemies', enemy));
        this.gameObjects.bullets.forEach(bullet => this.returnToPool('bullets', bullet));
        this.gameObjects.enemies.length = 0;
        this.gameObjects.bullets.length = 0;
        
        // Reset player position
        this.gameObjects.player.x = this.canvas.width / 2;
        this.gameObjects.player.y = this.canvas.height / 2;
        
        // Show life lost overlay
        document.getElementById('lifeLostOverlay').classList.remove('hidden');
        document.getElementById('livesRemaining').textContent = this.lives;
    }
    
    continueGame() {
        this.state = 'playing';
        document.getElementById('lifeLostOverlay').classList.add('hidden');
        
        // Brief invincibility period
        this.invincible = true;
        setTimeout(() => {
            this.invincible = false;
        }, 2000);
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
        // Scale intensity based on score milestones
        const scoreMilestones = [1000, 2500, 5000, 10000, 20000, 50000];
        let newIntensity = 1.0;
        
        for (let i = 0; i < scoreMilestones.length; i++) {
            if (this.score >= scoreMilestones[i]) {
                newIntensity = 1.0 + (i + 1) * 0.3; // Increase by 0.3 for each milestone
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
        if (!this.invincible) {
            for (const enemy of enemies) {
                if (this.isColliding(player, enemy)) {
                    this.loseLife();
                    return;
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
        ctx.drawImage(sprite, -this.width / 2, -this.height / 2, this.width, this.height);
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
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('walletOverlay').classList.add('hidden');
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('lifeLostOverlay').classList.add('hidden');
    document.getElementById('leaderboardOverlay').classList.remove('hidden');
}

function hideLeaderboard() {
    document.getElementById('leaderboardOverlay').classList.add('hidden');
    // Return to game over screen if we came from there
    if (window.game && window.game.state === 'gameOver') {
        document.getElementById('gameOverOverlay').classList.remove('hidden');
    } else {
        document.getElementById('menuOverlay').classList.remove('hidden');
    }
}

 