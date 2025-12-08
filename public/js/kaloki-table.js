// KALOKI table logic with real PNG cards and basic drag-and-drop for Player 1

// Global debug flag: when true, relaxes some turn checks so you can test layouts easily.
let DEBUG_MODE = false;

// Demo mode: all 4 players are bots, human spectates
let demoMode = false;
let spectatorMode = false;

const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const CARD_IMAGE_MAP = {
  'AC': '001_AC',
  'AD': '002_AD',
  'AH': '003_AH',
  'AS': '004_AS',
  '2C': '005_2C',
  '2D': '006_2D',
  '2H': '007_2H',
  '2S': '008_2S',
  '3C': '009_3C',
  '3D': '010_3D',
  '3H': '011_3H',
  '3S': '012_3S',
  '4C': '013_4C',
  '4D': '014_4D',
  '4H': '015_4H',
  '4S': '016_4S',
  '5C': '017_5C',
  '5D': '018_5D',
  '5H': '019_5H',
  '5S': '020_5S',
  '6C': '021_6C',
  '6D': '022_6D',
  '6H': '023_6H',
  '6S': '024_6S',
  '7C': '025_7C',
  '7D': '026_7D',
  '7H': '027_7H',
  '7S': '028_7S',
  '8C': '029_8C',
  '8D': '030_8D',
  '8H': '031_8H',
  '8S': '032_8S',
  '9C': '033_9C',
  '9D': '034_9D',
  '9H': '035_9H',
  '9S': '036_9S',
  '10C': '037_10C',
  '10D': '038_10D',
  '10H': '039_10H',
  '10S': '040_10S',
  'JC': '041_JC',
  'JD': '042_JD',
  'JH': '043_JH',
  'JS': '044_JS',
  'QC': '045_QC',
  'QD': '046_QD',
  'QH': '047_QH',
  'QS': '048_QS',
  'KC': '049_KC',
  'KD': '050_KD',
  'KH': '051_KH',
  'KS': '052_KS',
  'JOKER': '105_JOKER'
};

// Helper function to get card image path from card object
function getCardImagePath(card) {
  if (!card || !card.code) return 'cards/BACK_JAMAICA.png';
  const imageKey = CARD_IMAGE_MAP[card.code];
  if (imageKey) {
    return `cards/${imageKey}.png`;
  }
  return 'cards/BACK_JAMAICA.png';
}

// Multiplayer readiness tracking
let socketInitialized = false;
let domReady = false;
let pendingAnimations = [];
let pendingState = null;

// ============= SOUND SYSTEM =============
// High-quality sound effects from Kenney.nl (CC0 License)
let soundEnabled = true;
const audioElements = {};

// Sound file mappings using Kenney casino audio pack
const SOUND_FILES = {
  shuffle: '/sounds/Audio/card-shuffle.ogg',
  deal: '/sounds/Audio/card-slide-1.ogg',
  cardFlip: '/sounds/Audio/card-place-1.ogg',
  draw: '/sounds/Audio/card-slide-3.ogg',
  discard: '/sounds/Audio/card-place-2.ogg',
  // Variations for more natural sound
  deal2: '/sounds/Audio/card-slide-2.ogg',
  deal3: '/sounds/Audio/card-slide-4.ogg',
  place1: '/sounds/Audio/card-place-3.ogg',
  place2: '/sounds/Audio/card-place-4.ogg',
  fan: '/sounds/Audio/card-fan-1.ogg'
};

// Preload all audio files for instant playback
function initSounds() {
  try {
    for (const [name, path] of Object.entries(SOUND_FILES)) {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = 0.6;
      audioElements[name] = audio;
    }
  } catch (e) {
    console.warn('Failed to initialize sounds:', e);
    soundEnabled = false;
  }
}

function playSound(soundName) {
  if (!soundEnabled) return;
  
  // For deal sounds, randomly pick a variation
  let actualSound = soundName;
  if (soundName === 'deal') {
    const variations = ['deal', 'deal2', 'deal3'];
    actualSound = variations[Math.floor(Math.random() * variations.length)];
  } else if (soundName === 'cardFlip') {
    const variations = ['cardFlip', 'place1', 'place2'];
    actualSound = variations[Math.floor(Math.random() * variations.length)];
  }
  
  const audio = audioElements[actualSound];
  if (!audio) return;
  
  // Clone the audio to allow overlapping sounds
  const clone = audio.cloneNode();
  // Use settings volume if available, otherwise default to 60%
  clone.volume = (typeof settings !== 'undefined' && settings.volume !== undefined) 
    ? settings.volume / 100 
    : 0.6;
  clone.play().catch(() => {
    // Ignore autoplay restrictions silently
  });
}

function playShuffleSound(duration, onComplete) {
  // Play shuffle sound once at start - it naturally matches a short shuffle
  if (soundEnabled) {
    playSound('shuffle');
  }
  
  // Complete after the visual duration
  setTimeout(() => {
    if (onComplete) onComplete();
  }, duration);
}

// ============= SHUFFLE ANIMATION =============
function showShuffleAnimation(onComplete) {
  const deckEl = document.getElementById('deckPile');
  if (!deckEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const deckRect = deckEl.getBoundingClientRect();
  const shuffleContainer = document.createElement('div');
  shuffleContainer.id = 'shuffleAnimation';
  shuffleContainer.className = 'shuffle-animation';
  shuffleContainer.style.position = 'fixed';
  shuffleContainer.style.left = (deckRect.left - 30) + 'px';
  shuffleContainer.style.top = (deckRect.top - 20) + 'px';
  shuffleContainer.style.zIndex = '1500';
  shuffleContainer.style.pointerEvents = 'none';
  
  document.body.appendChild(shuffleContainer);
  
  // Create two card stacks for riffle animation
  const leftStack = document.createElement('div');
  leftStack.className = 'shuffle-stack shuffle-left';
  leftStack.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
  
  const rightStack = document.createElement('div');
  rightStack.className = 'shuffle-stack shuffle-right';
  rightStack.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
  
  shuffleContainer.appendChild(leftStack);
  shuffleContainer.appendChild(rightStack);
  
  // Shuffle duration 1.5-2 seconds - matches the sound effect length
  const shuffleDuration = 1500 + Math.random() * 500;
  
  // Start shuffle animation and sound
  shuffleContainer.classList.add('shuffling');
  playShuffleSound(shuffleDuration, () => {
    // End animation
    shuffleContainer.classList.remove('shuffling');
    shuffleContainer.classList.add('shuffle-complete');
    
    setTimeout(() => {
      shuffleContainer.remove();
      if (onComplete) onComplete();
    }, 300);
  });
}

// Initialize sounds when page loads
document.addEventListener('DOMContentLoaded', () => {
  initSounds();
});

// ============= MULTIPLAYER & SETTINGS =============
let multiplayerMode = false;
let socket = null;
let playerName = '';
let roomCode = '';
let playerId = '';
let roomPlayers = [];

// Track all game-related timeouts so we can clear them on game reset
let gameTimeouts = [];

// Set a game timeout that can be cleared when starting a new game
function setGameTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    // Remove from tracking array when executed
    const idx = gameTimeouts.indexOf(timeoutId);
    if (idx > -1) gameTimeouts.splice(idx, 1);
    callback();
  }, delay);
  gameTimeouts.push(timeoutId);
  return timeoutId;
}

// Clear all pending game timeouts
function clearAllGameTimeouts() {
  for (const timeoutId of gameTimeouts) {
    clearTimeout(timeoutId);
  }
  gameTimeouts = [];
}

// Settings stored in localStorage
let settings = {
  soundEnabled: true,
  volume: 60,
  tableColor: '#1a472a',
  botDifficulty: 'medium', // 'easy', 'medium', 'hard'
  animationSpeed: 100 // 100% = normal speed, lower = slower, higher = faster
};

// Base animation durations (at 100% speed) - all values in milliseconds
// These MUST match CSS base values for proper synchronization
const BASE_ANIM = {
  discard: 450,      // Discard card flying to pack (matches CSS 0.45s)
  draw: 500,         // Draw card animation (matches CSS 0.5s)
  botDraw: 450,      // Bot draw animation (matches CSS 0.45s)
  packCard: 450,     // Pack card transitions (matches CSS 0.45s)
  firstPack: 600,    // First card flip to pack
  botDelay: 1800,    // Delay before bot turn
  betweenBots: 750,  // Delay between bot turns
  deal: 300          // Deal animation per card (matches CSS 0.3s)
};

// Get animation duration adjusted by speed setting
function getAnimDuration(baseMs) {
  // Speed 100 = normal, 200 = 2x faster, 50 = 2x slower
  // We invert the speed: higher speed = shorter duration
  // Add small buffer (50ms) to ensure CSS completes before JS cleanup
  return Math.round(baseMs * (100 / settings.animationSpeed)) + 50;
}

// Get CSS duration in seconds (no buffer, for CSS property values)
function getAnimDurationCSS(baseMs) {
  return (baseMs * (100 / settings.animationSpeed) / 1000);
}

// Update CSS transitions based on animation speed
function updateAnimationCSS() {
  const root = document.documentElement;
  
  // Set CSS variables using unified BASE_ANIM values
  root.style.setProperty('--anim-pack-card', getAnimDurationCSS(BASE_ANIM.packCard) + 's');
  root.style.setProperty('--anim-discard', getAnimDurationCSS(BASE_ANIM.discard) + 's');
  root.style.setProperty('--anim-draw', getAnimDurationCSS(BASE_ANIM.draw) + 's');
  root.style.setProperty('--anim-bot-draw', getAnimDurationCSS(BASE_ANIM.botDraw) + 's');
  root.style.setProperty('--anim-deal', getAnimDurationCSS(BASE_ANIM.deal) + 's');
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('kalookiSettings');
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  applySettings();
  updateAnimationCSS();
}

function saveSettings() {
  try {
    localStorage.setItem('kalookiSettings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

function applySettings() {
  soundEnabled = settings.soundEnabled;
  
  // Update volume for all audio elements
  for (const audio of Object.values(audioElements)) {
    audio.volume = settings.volume / 100;
  }
  
  // Apply table color
  const tableRoot = document.getElementById('table-root');
  if (tableRoot) {
    const colors = {
      '#1a472a': 'radial-gradient(circle at 50% 30%, #106030 0, #003300 60%, #001800 100%)',
      '#1a2a4a': 'radial-gradient(circle at 50% 30%, #1a3a6a 0, #0a1a3a 60%, #050a1a 100%)',
      '#4a1a1a': 'radial-gradient(circle at 50% 30%, #6a2a2a 0, #3a0a0a 60%, #1a0505 100%)',
      '#3d3d3d': 'radial-gradient(circle at 50% 30%, #555555 0, #2a2a2a 60%, #151515 100%)'
    };
    tableRoot.style.background = colors[settings.tableColor] || colors['#1a472a'];
  }
}

// ============= FULLSCREEN FUNCTIONS =============
function isFullscreen() {
  return !!(document.fullscreenElement || 
            document.webkitFullscreenElement || 
            document.mozFullScreenElement || 
            document.msFullscreenElement);
}

function toggleFullscreen() {
  if (isFullscreen()) {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } else {
    // Enter fullscreen
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }
}

function updateFullscreenButton() {
  const btn = document.getElementById('btnFullscreen');
  if (!btn) return;
  
  if (isFullscreen()) {
    btn.textContent = 'Exit Fullscreen';
    btn.classList.add('active');
  } else {
    btn.textContent = 'Enter Fullscreen';
    btn.classList.remove('active');
  }
}

function initSettings() {
  loadSettings();
  
  // Settings button
  const btnSettings = document.getElementById('btnSettings');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      settingsOverlay.classList.remove('hidden');
    });
  }
  
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });
  }
  
  // Close on overlay click
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) {
        settingsOverlay.classList.add('hidden');
      }
    });
  }
  
  // Sound toggle
  const toggleSound = document.getElementById('toggleSound');
  if (toggleSound) {
    toggleSound.checked = settings.soundEnabled;
    toggleSound.addEventListener('change', () => {
      settings.soundEnabled = toggleSound.checked;
      saveSettings();
      applySettings();
    });
  }
  
  // Volume slider
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeSlider) {
    volumeSlider.value = settings.volume;
    if (volumeValue) volumeValue.textContent = settings.volume + '%';
    
    volumeSlider.addEventListener('input', () => {
      settings.volume = parseInt(volumeSlider.value);
      if (volumeValue) volumeValue.textContent = settings.volume + '%';
      saveSettings();
      applySettings();
    });
  }
  
  // Animation speed slider
  const animSpeedSlider = document.getElementById('animationSpeedSlider');
  const animSpeedValue = document.getElementById('animationSpeedValue');
  if (animSpeedSlider) {
    animSpeedSlider.value = settings.animationSpeed;
    if (animSpeedValue) animSpeedValue.textContent = settings.animationSpeed + '%';
    
    animSpeedSlider.addEventListener('input', () => {
      settings.animationSpeed = parseInt(animSpeedSlider.value);
      if (animSpeedValue) animSpeedValue.textContent = settings.animationSpeed + '%';
      saveSettings();
      updateAnimationCSS();
    });
  }
  
  // Color options
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    if (btn.dataset.color === settings.tableColor) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.tableColor = btn.dataset.color;
      saveSettings();
      applySettings();
    });
  });
  
  // Bot difficulty options
  const difficultyBtns = document.querySelectorAll('.difficulty-btn');
  difficultyBtns.forEach(btn => {
    // Set active state based on current setting
    if (btn.dataset.difficulty === settings.botDifficulty) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    btn.addEventListener('click', () => {
      difficultyBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.botDifficulty = btn.dataset.difficulty;
      saveSettings();
    });
  });
  
  // Fullscreen button
  const btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    // Update button state based on current fullscreen status
    updateFullscreenButton();
    
    btnFullscreen.addEventListener('click', () => {
      toggleFullscreen();
    });
    
    // Listen for fullscreen changes (e.g., user presses Escape)
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    document.addEventListener('mozfullscreenchange', updateFullscreenButton);
    document.addEventListener('MSFullscreenChange', updateFullscreenButton);
  }
  
  // Lobby button
  const btnLobby = document.getElementById('btnLobby');
  if (btnLobby) {
    btnLobby.addEventListener('click', () => {
      if (confirm('Leave the game and return to lobby?')) {
        window.location.href = '/';
      }
    });
  }
  
  // Tab switching
  const tabs = document.querySelectorAll('.settings-tab');
  const settingsContent = document.getElementById('settingsTabContent');
  const leaderboardContent = document.getElementById('leaderboardTabContent');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tab.dataset.tab === 'settings') {
        settingsContent.classList.remove('hidden');
        leaderboardContent.classList.add('hidden');
      } else if (tab.dataset.tab === 'leaderboard') {
        settingsContent.classList.add('hidden');
        leaderboardContent.classList.remove('hidden');
        updateLeaderboardDisplay();
      }
    });
  });
  
  // Reset stats button
  const btnResetStats = document.getElementById('btnResetStats');
  if (btnResetStats) {
    btnResetStats.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all your statistics? This cannot be undone.')) {
        resetPlayerStats();
        updateLeaderboardDisplay();
      }
    });
  }
  
  // Leaderboard mode tabs (Solo vs Multiplayer)
  const modeTabs = document.querySelectorAll('.leaderboard-mode-tab');
  const soloContent = document.getElementById('soloLeaderboardContent');
  const mpContent = document.getElementById('multiplayerLeaderboardContent');
  
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tab.dataset.mode === 'solo') {
        soloContent.classList.remove('hidden');
        mpContent.classList.add('hidden');
      } else {
        soloContent.classList.add('hidden');
        mpContent.classList.remove('hidden');
      }
      
      // Refresh the leaderboard data when switching tabs
      updateLeaderboardDisplay();
    });
  });
  
  // Initial leaderboard update
  updateLeaderboardDisplay();
}

// ============= PLAYER STATISTICS SYSTEM =============

let playerStats = {
  solo: { players: {} },
  multiplayer: { players: {} }
};

function getDefaultPlayerStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    rating: 1000,
    currentStreak: 0,
    bestStreak: 0,
    lastPlayed: null
  };
}

function loadPlayerStats() {
  try {
    const saved = localStorage.getItem('kalookiPlayerStats');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.solo && parsed.multiplayer) {
        playerStats = parsed;
      } else if (parsed.players) {
        playerStats = {
          solo: { players: parsed.players },
          multiplayer: { players: {} }
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load player stats:', e);
    playerStats = { solo: { players: {} }, multiplayer: { players: {} } };
  }
}

function savePlayerStats() {
  try {
    localStorage.setItem('kalookiPlayerStats', JSON.stringify(playerStats));
  } catch (e) {
    console.warn('Failed to save player stats:', e);
  }
}

function getPlayerStats(name, mode) {
  const modeStats = mode === 'multiplayer' ? playerStats.multiplayer : playerStats.solo;
  if (!modeStats.players[name]) {
    modeStats.players[name] = getDefaultPlayerStats();
  }
  return modeStats.players[name];
}

function recordGameResult(winnerName, allPlayerNames, isMultiplayer = false) {
  loadPlayerStats();
  
  const mode = isMultiplayer ? 'multiplayer' : 'solo';
  
  allPlayerNames.forEach(name => {
    const stats = getPlayerStats(name, mode);
    stats.gamesPlayed++;
    stats.lastPlayed = new Date().toISOString();
    
    if (name === winnerName) {
      stats.gamesWon++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
      stats.rating += 25;
    } else {
      stats.currentStreak = 0;
      stats.rating = Math.max(100, stats.rating - 10);
    }
  });
  
  savePlayerStats();
}

function resetPlayerStats() {
  const currentPlayer = playerName || 'Player';
  
  if (playerStats.solo.players[currentPlayer]) {
    playerStats.solo.players[currentPlayer] = getDefaultPlayerStats();
  }
  if (playerStats.multiplayer.players[currentPlayer]) {
    playerStats.multiplayer.players[currentPlayer] = getDefaultPlayerStats();
  }
  
  savePlayerStats();
}

function updateLeaderboardDisplay() {
  loadPlayerStats();
  
  const currentPlayer = playerName || localStorage.getItem('kalookiPlayerName') || 'Player';
  
  // Update Solo stats
  updateModeStats('solo', currentPlayer);
  updateModeLeaderboard('solo');
  
  // Update Multiplayer stats
  updateModeStats('multiplayer', currentPlayer);
  updateModeLeaderboard('multiplayer');
}

function updateModeStats(mode, currentPlayer) {
  const prefix = mode === 'solo' ? 'solo' : 'mp';
  const stats = getPlayerStats(currentPlayer, mode);
  
  const nameEl = document.getElementById(`${prefix}StatsPlayerName`);
  const ratingEl = document.getElementById(`${prefix}StatsPlayerRating`);
  const gamesPlayedEl = document.getElementById(`${prefix}StatsGamesPlayed`);
  const gamesWonEl = document.getElementById(`${prefix}StatsGamesWon`);
  const winRateEl = document.getElementById(`${prefix}StatsWinRate`);
  const streakEl = document.getElementById(`${prefix}StatsCurrentStreak`);
  
  if (nameEl) nameEl.textContent = currentPlayer;
  if (ratingEl) ratingEl.textContent = `Rating: ${stats.rating}`;
  if (gamesPlayedEl) gamesPlayedEl.textContent = stats.gamesPlayed;
  if (gamesWonEl) gamesWonEl.textContent = stats.gamesWon;
  if (winRateEl) {
    const winRate = stats.gamesPlayed > 0 
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
      : 0;
    winRateEl.textContent = winRate + '%';
  }
  if (streakEl) streakEl.textContent = stats.currentStreak;
}

function updateModeLeaderboard(mode) {
  const listId = mode === 'solo' ? 'soloLeaderboardList' : 'mpLeaderboardList';
  const emptyMessage = mode === 'solo' ? 'No solo games played yet' : 'No multiplayer games played yet';
  const leaderboardList = document.getElementById(listId);
  
  if (!leaderboardList) return;
  
  const modeStats = mode === 'multiplayer' ? playerStats.multiplayer : playerStats.solo;
  
  const allPlayers = Object.entries(modeStats.players)
    .map(([name, s]) => ({ name, ...s }))
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => b.rating - a.rating);
  
  if (allPlayers.length === 0) {
    leaderboardList.innerHTML = `<div class="leaderboard-empty">${emptyMessage}</div>`;
    return;
  }
  
  leaderboardList.innerHTML = allPlayers.slice(0, 10).map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const winRate = p.gamesPlayed > 0 ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0;
    return `
      <div class="leaderboard-entry">
        <div class="leaderboard-rank ${rankClass}">${i + 1}</div>
        <div class="leaderboard-entry-name">${p.name}</div>
        <div class="leaderboard-entry-stats">
          <div class="leaderboard-entry-rating">${p.rating}</div>
          <div class="leaderboard-entry-record">${p.gamesWon}W/${p.gamesPlayed - p.gamesWon}L (${winRate}%)</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============= CHAT SYSTEM =============
function initChat() {
  const chatBox = document.getElementById('chatBox');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnToggleChat = document.getElementById('btnToggleChat');
  
  if (!chatBox) return;
  
  // Toggle chat minimize/expand
  if (btnToggleChat) {
    btnToggleChat.addEventListener('click', () => {
      chatBox.classList.toggle('minimized');
      btnToggleChat.textContent = chatBox.classList.contains('minimized') ? '+' : '−';
    });
  }
  
  // Send message on button click
  if (btnSendChat) {
    btnSendChat.addEventListener('click', sendChatMessage);
  }
  
  // Send message on Enter key
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
  }
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  
  const message = chatInput.value.trim();
  if (!message) return;
  
  // Clear input
  chatInput.value = '';
  
  // Get sender name
  const senderName = playerName || 'Player';
  const isSpectator = spectatorMode;
  
  if (socket && (multiplayerMode || spectatorMode)) {
    // Send via socket for multiplayer/spectator
    socket.emit('chatMessage', {
      roomCode: roomCode,
      sender: senderName,
      message: message,
      isSpectator: isSpectator
    });
  } else {
    // Solo mode - just show locally
    addChatMessage(senderName, message, false);
  }
}

function addChatMessage(sender, message, isSpectator, isSystem = false) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  
  if (isSystem) {
    msgDiv.classList.add('system-msg');
    msgDiv.textContent = message;
  } else {
    if (isSpectator) {
      msgDiv.classList.add('spectator-msg');
    }
    msgDiv.innerHTML = `<span class="chat-sender">${escapeHtml(sender)}:</span><span class="chat-text">${escapeHtml(message)}</span>`;
  }
  
  chatMessages.appendChild(msgDiv);
  
  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Limit messages to prevent memory issues
  while (chatMessages.children.length > 50) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addSystemMessage(message) {
  addChatMessage('', message, false, true);
}

function initMultiplayer() {
  // Check if we're in multiplayer mode
  const gameMode = localStorage.getItem('kalookiGameMode');
  playerName = localStorage.getItem('kalookiPlayerName') || 'Player';
  roomCode = localStorage.getItem('kalookiRoomCode') || '';
  playerId = localStorage.getItem('kalookiPlayerId') || '';
  
  // Check for demo mode and spectator mode
  demoMode = localStorage.getItem('kalookiDemoMode') === 'true';
  spectatorMode = localStorage.getItem('kalookiSpectatorMode') === 'true';
  
  // Initialize chat
  initChat();
  
  if (gameMode === 'spectator' && roomCode) {
    // Spectator mode - watching a live game
    spectatorMode = true;
    multiplayerMode = true;
    initSpectatorSocket();
  } else if (gameMode === 'multiplayer' && roomCode) {
    multiplayerMode = true;
    initSocket();
  } else {
    // Solo mode - use player name for bottom label
    const labelBottom = document.getElementById('label-bottom');
    if (labelBottom && playerName) {
      // In demo mode, show "Bot 4" for bottom player
      labelBottom.textContent = demoMode ? 'Bot 4' : playerName;
    }
  }
  
  // Clear localStorage values used for game init
  localStorage.removeItem('kalookiGameMode');
  localStorage.removeItem('kalookiRoomCode');
  localStorage.removeItem('kalookiPlayerId');
  localStorage.removeItem('kalookiDemoMode');
  localStorage.removeItem('kalookiSpectatorMode');
}

function initSocket() {
  if (!window.io) {
    console.warn('Socket.io not available');
    return;
  }
  
  // Prevent double initialization
  if (socketInitialized) {
    console.log('Socket already initialized');
    return;
  }
  socketInitialized = true;
  
  socket = io();
  
  socket.on('connect', () => {
    console.log('Connected to game server, roomCode:', roomCode, 'playerName:', playerName);
    if (roomCode) {
      // Send rejoinGame immediately - don't wait for DOM
      // DOM elements are created dynamically after game state is received
      console.log('Sending rejoinGame to room:', roomCode);
      socket.emit('rejoinGame', { 
        roomCode: roomCode, 
        playerName: playerName 
      });
    } else {
      console.log('No roomCode, not rejoining (solo mode?)');
    }
  });
  
  function processPendingEvents() {
    console.log(`Processing ${pendingAnimations.length} pending animations`);
    // Process buffered animations first
    pendingAnimations.forEach(fn => fn());
    pendingAnimations = [];
    // Then apply pending state if any
    if (pendingState) {
      syncGameState(pendingState);
      pendingState = null;
    }
  }
  
  socket.on('roomPlayers', (data) => {
    roomPlayers = data.players;
    updatePlayerLabelsFromServer(data.players);
  });
  
  // Multiplayer animation queue system
  // Server sends: gameStateUpdate first (creates DOM), then animation events
  // This queue ensures animations complete before state updates rebuild DOM
  let mpAnimationQueue = [];
  let mpAnimating = false;
  let pendingGameState = null;
  let domInitialized = false;
  
  function isAnimationBlocking() {
    return mpAnimating || mpAnimationQueue.length > 0;
  }
  
  function processMpAnimationQueue() {
    if (mpAnimating || mpAnimationQueue.length === 0) {
      // Queue empty - apply any pending state after a small delay
      if (mpAnimationQueue.length === 0 && pendingGameState && !mpAnimating) {
        const state = pendingGameState;
        pendingGameState = null;
        console.log('Animations done, applying pending state');
        syncGameState(state);
      }
      return;
    }
    
    mpAnimating = true;
    const anim = mpAnimationQueue.shift();
    
    anim.fn(() => {
      mpAnimating = false;
      // Continue to next animation or apply pending state
      processMpAnimationQueue();
    });
  }
  
  function queueMpAnimation(animFn) {
    console.log('Queuing animation, queue length:', mpAnimationQueue.length + 1);
    mpAnimationQueue.push({ fn: animFn });
    processMpAnimationQueue();
  }
  
  socket.on('gameStateUpdate', (data) => {
    console.log('Received gameStateUpdate, domInit:', domInitialized, 'animating:', isAnimationBlocking());
    
    // First state update creates DOM
    if (!domInitialized) {
      console.log('First state - initializing DOM');
      syncGameState(data);
      domInitialized = true;
      return;
    }
    
    // If animations in progress, defer state update
    if (isAnimationBlocking()) {
      console.log('Deferring state - animations in progress');
      pendingGameState = data;
    } else {
      syncGameState(data);
    }
  });
  
  // Animation events from server - ALL SEATS USE THE SAME CORE ANIMATION FUNCTIONS
  socket.on('animateDraw', (data) => {
    console.log('Received animateDraw:', data);
    queueMpAnimation((done) => {
      playSound('draw');
      
      // Prepare card with imageKey
      const card = data.card || {};
      if (card.code && !card.imageKey) {
        card.imageKey = getImageKey(card.code);
      }
      
      // ALL seats use the SAME core animation function
      animateDrawCore(data.source, data.seat, card, done);
    });
  });
  
  socket.on('animateDiscard', (data) => {
    console.log('Received animateDiscard:', data);
    
    // Prepare card with imageKey
    const card = data.card || {};
    if (card.code && !card.imageKey) {
      card.imageKey = getImageKey(card.code);
    }
    
    // CAPTURE card position IMMEDIATELY before queuing, while card is still in DOM
    let capturedRect = null;
    if (data.seat === 'bottom') {
      const handEl = document.getElementById('hand-bottom');
      if (handEl && card) {
        const cardEls = handEl.querySelectorAll('.card');
        for (const cardEl of cardEls) {
          const cardId = cardEl.getAttribute('data-id');
          const cardCode = cardEl.getAttribute('data-code');
          if ((card.id && cardId === card.id) || (card.code && cardCode === card.code)) {
            capturedRect = cardEl.getBoundingClientRect();
            console.log('Captured discard position for card:', card.code, capturedRect);
            break;
          }
        }
        // Fallback to last card if not found
        if (!capturedRect && cardEls.length > 0) {
          capturedRect = cardEls[cardEls.length - 1].getBoundingClientRect();
        }
      }
    } else {
      // For other seats, capture mini-hand position
      const miniEl = document.getElementById(`mini-${data.seat}`);
      if (miniEl) {
        capturedRect = miniEl.getBoundingClientRect();
      }
    }
    
    queueMpAnimation((done) => {
      playSound('discard');
      // Use the captured position from when event arrived
      animateDiscardFromCapturedRect(card, capturedRect, data.seat, done);
    });
  });
  
  // dealInit - creates empty layout before deal animation
  socket.on('dealInit', (data) => {
    console.log('Received dealInit - creating empty layout');
    
    // Reset gameState to empty but keep correct structure for renderAll()
    gameState.deck = [];
    gameState.hands = { bottom: [], top: [], left: [], right: [] };
    gameState.sets = { bottom: [], top: [], left: [], right: [] };
    gameState.pack = [];
    gameState.draggingCardId = null;
    gameState.turnSeat = 'bottom';
    gameState.hasDrawn = false;
    gameState.lastDrawSource = null;
    gameState.lastPackCardId = null;
    gameState.lastDiscardSource = null;
    gameState.lastDiscardCardId = null;
    gameState.lastDiscardSeat = null;
    gameState.currentTurnId = 0;
    gameState.hasDiscardedThisTurn = false;
    gameState.opened = { bottom: false, top: false, left: false, right: false };
    gameState.eliminated = { bottom: false, top: false, left: false, right: false };
    gameState.invalidMelds = { bottom: [], top: [], left: [], right: [] };
    gameState.pendingExtendMelds = {};
    gameState.pendingLayoffs = {};
    gameState.inVoting = { isOpen: false, votes: [] };
    gameState.dealerSeat = data.dealer || 'bottom';
    
    // Render empty layout
    renderAll();
    domInitialized = true;
    console.log('Empty layout ready for deal animation');
  });
  
  // Deal animation - server sends this AFTER dealInit so DOM exists
  socket.on('animateDeal', (data) => {
    console.log('Received animateDeal:', data, 'domInit:', domInitialized);
    
    if (!domInitialized) {
      console.warn('animateDeal arrived before DOM - this should not happen');
      return;
    }
    
    queueMpAnimation((done) => {
      playMpDealAnimation(data.dealer, done);
    });
  });
  
  socket.on('actionError', (data) => {
    console.warn('Action error:', data.message);
    setStatus(data.message || 'Action failed');
    
    // If this was an extendMeld failure and we have a card to restore, restore it
    if (data.action === 'extendMeld' && data.cardId) {
      const hand = gameState.hands['bottom'];
      if (hand && !hand.find(c => c.id === data.cardId)) {
        // Check if we have the full card object stored
        const storedCard = gameState.pendingExtendMelds && gameState.pendingExtendMelds[data.cardId];
        if (storedCard) {
          // Restore the full card object
          hand.push(storedCard);
          delete gameState.pendingExtendMelds[data.cardId];
        } else {
          // Fallback - push minimal card (will need sync to fix)
          hand.push({ id: data.cardId });
        }
        renderBottomHand();
        renderMiniHands();
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from game server');
  });
  
  // Overlay synchronization - all players see the same overlays
  // Track pending overlays to avoid duplicate display
  socket.on('showOverlay', (data) => {
    console.log('Received overlay:', data.type, data.data);
    
    if (data.type === 'victory') {
      // Only show if we didn't trigger it (check if victory overlay already visible)
      const victoryOverlay = document.getElementById('victoryOverlay');
      if (!victoryOverlay || victoryOverlay.classList.contains('hidden')) {
        showVictoryFromServer(data.data.winnerName, data.data.winnerSeat);
      }
    } else if (data.type === 'elimination') {
      // Only show if elimination overlay not already visible
      const elimOverlay = document.getElementById('eliminationOverlay');
      if (!elimOverlay || elimOverlay.classList.contains('hidden')) {
        showEliminationFromServer(data.data.playerName, data.data.reason, data.data.details);
      }
    } else if (data.type === 'inRestart') {
      // Only show if restart overlay not already visible
      const restartOverlay = document.getElementById('restartOverlay');
      if (!restartOverlay || restartOverlay.classList.contains('hidden')) {
        showRestartOverlay(data.data.voterNames);
      }
    }
  });
  
  // IN voting updates
  socket.on('inVoteUpdate', (data) => {
    // Update local voting state from server using seat data
    if (data.voterSeats) {
      gameState.inVoting.votes = data.voterSeats;
    }
    updateInButtonUI();
    if (data.voteCount > 0) {
      setStatus(`${data.voteCount}/3 players voted to restart`);
    }
  });
  
  socket.on('inVotingClosed', () => {
    gameState.inVoting.isOpen = false;
    updateInButtonUI();
  });
  
  // Chat messages
  socket.on('chatMessage', (data) => {
    addChatMessage(data.sender, data.message, data.isSpectator);
  });
  
  socket.on('systemMessage', (data) => {
    addSystemMessage(data.message);
  });
}

function initSpectatorSocket() {
  if (!window.io) {
    console.warn('Socket.io not available');
    return;
  }
  
  socket = io();
  
  socket.on('connect', () => {
    console.log('Connected as spectator');
    if (roomCode) {
      socket.emit('rejoinAsSpectator', { 
        roomCode: roomCode 
      });
    }
  });
  
  socket.on('gameStateUpdate', (data) => {
    syncSpectatorGameState(data);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from game server');
    setStatus('Connection lost. Refresh to reconnect.');
  });
  
  // Spectators see overlays too
  socket.on('showOverlay', (data) => {
    console.log('Spectator received overlay:', data.type, data.data);
    
    if (data.type === 'victory') {
      const victoryOverlay = document.getElementById('victoryOverlay');
      if (!victoryOverlay || victoryOverlay.classList.contains('hidden')) {
        showVictoryFromServer(data.data.winnerName, data.data.winnerSeat);
      }
    } else if (data.type === 'elimination') {
      const elimOverlay = document.getElementById('eliminationOverlay');
      if (!elimOverlay || elimOverlay.classList.contains('hidden')) {
        showEliminationFromServer(data.data.playerName, data.data.reason, data.data.details);
      }
    } else if (data.type === 'inRestart') {
      const restartOverlay = document.getElementById('restartOverlay');
      if (!restartOverlay || restartOverlay.classList.contains('hidden')) {
        showRestartOverlay(data.data.voterNames);
      }
    }
  });
  
  // Hide the IN button for spectators
  const inButton = document.getElementById('btnIN');
  if (inButton) {
    inButton.style.display = 'none';
  }
  
  // Chat messages for spectators
  socket.on('chatMessage', (data) => {
    addChatMessage(data.sender, data.message, data.isSpectator);
  });
  
  socket.on('systemMessage', (data) => {
    addSystemMessage(data.message);
  });
  
  // Set spectator status
  setStatus('Spectating game... All hands are hidden.');
}

function syncSpectatorGameState(serverState) {
  if (!serverState) return;
  
  console.log('Syncing spectator game state');
  
  updatePlayerLabelsFromServer(serverState.players);
  
  // All hands are hidden for spectators
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const handData = serverState.hands[seat] || [];
    gameState.hands[seat] = handData.map((card, i) => ({
      id: card.id || `hidden_${seat}_${i}`,
      hidden: true,
      code: null,
      rank: null,
      suit: null,
      imageKey: null
    }));
  }
  
  // Sync sets (melds are visible)
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const serverSets = serverState.sets[seat] || [];
    gameState.sets[seat] = serverSets.map(group => ({
      id: group.id,
      cards: group.cards.map(card => ({
        ...card,
        imageKey: getImageKey(card.code)
      }))
    }));
  }
  
  // Sync pack (discard pile is visible)
  gameState.pack = (serverState.pack || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  // Sync deck count
  if (typeof serverState.deckCount === 'number') {
    gameState.deck = new Array(serverState.deckCount).fill({ hidden: true });
  }
  
  // Sync turn and game state
  gameState.turnSeat = serverState.turnSeat;
  gameState.hasDrawn = serverState.hasDrawn;
  gameState.currentDealer = serverState.currentDealer;
  gameState.opened = serverState.opened || { bottom: false, top: false, left: false, right: false };
  gameState.eliminated = serverState.eliminated || { bottom: false, top: false, left: false, right: false };
  gameState.gameOver = serverState.gameOver || false;
  gameState.winner = serverState.winner || null;
  
  // Render everything for spectator view
  renderSpectatorView();
  
  // Update status
  if (gameState.gameOver && gameState.winner) {
    setStatus(`Game Over! ${gameState.winner} wins!`);
  } else {
    const turnPlayerInfo = serverState.players[gameState.turnSeat];
    const turnPlayerName = turnPlayerInfo ? turnPlayerInfo.name : gameState.turnSeat;
    setStatus(`Spectating: ${turnPlayerName}'s turn`);
  }
}

function renderSpectatorView() {
  // Render all hands as face-down cards for spectators
  renderSpectatorMiniHands();
  
  // Render melds (visible to spectators)
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    renderMeldRow(seat);
  }
  
  // Render deck and pack
  renderPiles();
  
  // Update turn glow
  updateActiveTurnGlow();
}

function renderSpectatorMiniHands() {
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const hand = gameState.hands[seat];
    const container = document.getElementById(`hand-${seat}`);
    if (!container) continue;
    
    container.innerHTML = '';
    
    // Get correct card back image
    const backImage = getSavedCardPack() + '/back.png';
    
    if (seat === 'bottom') {
      // Bottom hand shows face-down cards side by side
      hand.forEach((card, i) => {
        const el = document.createElement('div');
        el.className = 'mini-card spectator-card';
        el.style.backgroundImage = `url('cards/${backImage}')`;
        el.style.backgroundSize = 'cover';
        container.appendChild(el);
      });
    } else {
      // Other seats show mini-hand indicators
      const handEl = document.getElementById(`mini-hand-${seat}`);
      if (handEl) {
        handEl.innerHTML = '';
        hand.forEach((card, i) => {
          const el = document.createElement('div');
          el.className = 'mini-card spectator-card';
          el.style.backgroundImage = `url('cards/${backImage}')`;
          el.style.backgroundSize = 'cover';
          handEl.appendChild(el);
        });
      }
    }
  }
}

function updatePlayerLabels() {
  if (!multiplayerMode) return;
}

function updatePlayerLabelsFromServer(players) {
  if (!players) return;
  
  const labels = {
    bottom: document.getElementById('label-bottom'),
    left: document.getElementById('label-left'),
    top: document.getElementById('label-top'),
    right: document.getElementById('label-right')
  };
  
  for (const seat of ['bottom', 'left', 'top', 'right']) {
    const player = players[seat];
    if (player && labels[seat]) {
      labels[seat].textContent = player.name + (player.isBot ? ' (Bot)' : '');
    }
  }
}

function syncGameState(serverState) {
  if (!multiplayerMode || !serverState) return;
  
  console.log('Syncing game state from server');
  
  // Clear pending extend melds - server state is now authoritative
  gameState.pendingExtendMelds = {};
  
  updatePlayerLabelsFromServer(serverState.players);
  
  gameState.hands.bottom = (serverState.hands.bottom || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  for (const seat of ['top', 'left', 'right']) {
    const handData = serverState.hands[seat] || [];
    gameState.hands[seat] = handData.map((card, i) => ({
      id: card.id || `hidden_${seat}_${i}`,
      hidden: card.hidden || false,
      code: card.code,
      rank: card.rank,
      suit: card.suit,
      imageKey: card.hidden ? null : getImageKey(card.code)
    }));
  }
  
  gameState.pack = (serverState.pack || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  // Convert server meld structure to client flat array format
  // Server: [{ id: 'meld_1', cards: [...] }, ...]
  // Client: [card1, card2, ...] with groupId property
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const flatCards = [];
    const serverMelds = serverState.sets[seat] || [];
    
    for (const meldGroup of serverMelds) {
      const groupId = meldGroup.id;
      for (const card of meldGroup.cards) {
        flatCards.push({
          ...card,
          groupId: groupId,
          imageKey: getImageKey(card.code)
        });
      }
    }
    
    gameState.sets[seat] = flatCards;
    gameState.opened[seat] = serverState.opened[seat] || false;
    gameState.eliminated[seat] = serverState.eliminated[seat] || false;
  }
  
  // Store meld structure for server communication
  gameState.serverMelds = serverState.sets;
  
  gameState.turnSeat = serverState.turnSeat || 'bottom';
  gameState.hasDrawn = serverState.hasDrawn || false;
  gameState.currentDealer = serverState.currentDealer || 'bottom';
  
  // Sync deck count (server sends count, we create placeholder array)
  if (typeof serverState.deckCount === 'number') {
    gameState.deck = new Array(serverState.deckCount).fill({ hidden: true });
  }
  
  // Sync game over state
  gameState.gameOver = serverState.gameOver || false;
  gameState.winner = serverState.winner || null;
  
  if (serverState.gameOver && serverState.winner) {
    showWinnerCelebration(serverState.winner);
  }
  
  renderAll();
  updateTurnIndicators();
  updateActiveTurnGlow();
  
  // Update status bar
  if (gameState.turnSeat === 'bottom') {
    if (gameState.hasDrawn) {
      setStatus('Your turn - lay cards or discard to end your turn');
    } else {
      setStatus('Your turn - draw from DECK or PACK');
    }
  } else {
    const turnPlayerInfo = serverState.players ? serverState.players[gameState.turnSeat] : null;
    const turnPlayerName = turnPlayerInfo ? turnPlayerInfo.name : gameState.turnSeat;
    setStatus(`${turnPlayerName}'s turn`);
  }
}

function getImageKey(code) {
  if (!code) return null;
  return CARD_IMAGE_MAP[code] || null;
}

function updateTurnIndicators() {
  const seats = ['bottom', 'top', 'left', 'right'];
  for (const seat of seats) {
    const indicator = document.querySelector(`#seat-${seat} .turn-indicator`);
    if (indicator) {
      indicator.style.display = gameState.turnSeat === seat ? 'block' : 'none';
    }
  }
}

function mpDrawCard(source) {
  if (!multiplayerMode || !socket) return;
  socket.emit('drawCard', { source: source });
}

function mpDiscardCard(cardId) {
  if (!multiplayerMode || !socket) return;
  socket.emit('discardCard', { cardId: cardId });
}

function mpLayMeld(cardIds) {
  if (!multiplayerMode || !socket) return;
  socket.emit('layMeld', { cardIds: cardIds });
}

function mpExtendMeld(cardId, targetSeat, meldId) {
  if (!multiplayerMode || !socket) return;
  socket.emit('extendMeld', { 
    cardId: cardId, 
    targetSeat: targetSeat, 
    meldId: meldId 
  });
}

// ============= UNIFIED ANIMATION FUNCTIONS =============
// These functions work for ANY seat (bottom, top, left, right)
// They use the same CSS classes, timing, and easing as solo mode

function animateDrawUnified(source, seat, card, onComplete) {
  // Get source element (deck or pack)
  const sourceEl = source === 'deck' 
    ? document.getElementById('deckPile') 
    : document.getElementById('packArea');
  
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  // Get target element based on seat
  let targetEl;
  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
  } else {
    targetEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Create flying card with proper CSS class for transitions
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  // Show card face for pack draws (visible), card back for deck draws (hidden)
  let cardImage = 'cards/BACK_JAMAICA.png';
  if (source === 'pack' && card && card.code) {
    const imgKey = card.imageKey || getImageKey(card.code);
    if (imgKey) {
      cardImage = `cards/${imgKey}.png`;
    }
  }
  flyingCard.style.backgroundImage = `url("${cardImage}")`;
  
  // Start position: center of source
  flyingCard.style.left = (sourceRect.left + sourceRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow to ensure starting position is applied
  flyingCard.offsetHeight;
  
  // Calculate end position based on seat
  let endX, endY;
  if (seat === 'bottom') {
    // For player's hand, position at end of existing cards
    const cards = targetEl.querySelectorAll('.card');
    if (cards.length > 0) {
      const lastCard = cards[cards.length - 1];
      const lastCardRect = lastCard.getBoundingClientRect();
      endX = lastCardRect.right - 10;
      endY = lastCardRect.top;
    } else {
      endX = targetRect.left + targetRect.width / 2 - 50;
      endY = targetRect.top;
    }
  } else {
    // For other seats, center of mini-hand area
    endX = targetRect.left + targetRect.width / 2 - 50;
    endY = targetRect.top + targetRect.height / 2 - 75;
  }
  
  // Animate to target
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.draw));
}

function animateDiscardUnified(seat, card, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }
  
  // Get source element based on seat
  let sourceEl;
  if (seat === 'bottom') {
    sourceEl = document.getElementById('hand-bottom');
  } else {
    sourceEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const packRect = packAreaEl.getBoundingClientRect();
  
  // Create flying card with proper CSS class for transitions
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  
  // Show card face
  let cardImage = 'cards/BACK_JAMAICA.png';
  if (card && card.code) {
    const imgKey = card.imageKey || getImageKey(card.code);
    if (imgKey) {
      cardImage = `cards/${imgKey}.png`;
    }
  }
  flyingCard.style.backgroundImage = `url("${cardImage}")`;
  
  // Start position: center of source hand
  flyingCard.style.left = (sourceRect.left + sourceRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow
  flyingCard.offsetHeight;
  
  // Calculate random end position in pack area
  const endX = packRect.left + Math.random() * 80 - 10;
  const endY = packRect.top + Math.random() * 60 - 5;
  const endRotation = (Math.random() - 0.5) * 50;
  
  // Store position for rendering later
  if (card && card.id) {
    packCardPositions.set(card.id, { 
      x: endX - packRect.left, 
      y: endY - packRect.top, 
      rotation: endRotation 
    });
  }
  
  // Animate to pack
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

// Multiplayer deal animation - uses same CSS classes and timing as solo
function playMpDealAnimation(dealerSeat, onComplete) {
  console.log('Playing MP deal animation (unified with solo), dealer:', dealerSeat);
  playSound('shuffle');
  
  const deckEl = document.getElementById('deckPile');
  if (!deckEl) {
    console.error('Deck element not found');
    if (onComplete) onComplete();
    return;
  }
  
  const deckRect = deckEl.getBoundingClientRect();
  const seats = ['bottom', 'left', 'top', 'right'];
  
  let cardIndex = 0;
  const totalCards = 52;
  
  // Use same timing as solo mode
  const dealDuration = getAnimDuration(BASE_ANIM.deal);
  const dealInterval = Math.round(dealDuration * 0.2); // Cards dealt at 20% of animation duration
  
  function dealNextCard() {
    if (cardIndex >= totalCards) {
      setTimeout(() => {
        playSound('cardFlip');
        if (onComplete) onComplete();
      }, dealDuration);
      return;
    }
    
    const seatIndex = cardIndex % 4;
    const seat = seats[seatIndex];
    
    let targetEl;
    if (seat === 'bottom') {
      targetEl = document.getElementById('hand-bottom');
    } else {
      targetEl = document.getElementById(`mini-${seat}`);
    }
    
    if (!targetEl) {
      cardIndex++;
      setTimeout(dealNextCard, dealInterval);
      return;
    }
    
    const targetRect = targetEl.getBoundingClientRect();
    
    // Same CSS class as solo mode - 100x150 sizing
    const flyingCard = document.createElement('div');
    flyingCard.className = seat === 'bottom' ? 'dealing-card to-player' : 'dealing-card to-bot';
    flyingCard.style.left = (deckRect.left + deckRect.width/2 - 50) + 'px';
    flyingCard.style.top = (deckRect.top + deckRect.height/2 - 75) + 'px';
    
    document.body.appendChild(flyingCard);
    
    if (cardIndex % 4 === 0) playSound('deal');
    
    requestAnimationFrame(() => {
      flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
      flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
      if (seat === 'left' || seat === 'right') {
        flyingCard.style.transform = 'rotate(90deg)';
      }
    });
    
    setTimeout(() => {
      flyingCard.remove();
    }, dealDuration);
    
    cardIndex++;
    setTimeout(dealNextCard, dealInterval);
  }
  
  dealNextCard();
}

function playMpDrawAnimation(source, seat, card, isMe, onComplete) {
  console.log('Playing MP draw animation (unified with solo):', source, seat);
  playSound('draw');
  
  const sourceEl = source === 'deck' ? document.getElementById('deckPile') : document.getElementById('packArea');
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  let targetEl;
  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
  } else {
    targetEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Same CSS class as solo mode - 100x150 sizing
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  const cardImg = (source === 'pack' && card && card.code) ? getCardImagePath(card) : 'cards/BACK_JAMAICA.png';
  flyingCard.style.backgroundImage = `url("${cardImg}")`;
  flyingCard.style.left = (sourceRect.left + sourceRect.width/2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height/2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  requestAnimationFrame(() => {
    flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
    flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
  });
  
  // Use same timing as solo mode
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.draw));
}

function playMpDiscardAnimation(seat, card, onComplete) {
  console.log('Playing MP discard animation (unified with solo):', seat);
  playSound('discard');
  
  let sourceEl;
  if (seat === 'bottom') {
    sourceEl = document.getElementById('hand-bottom');
  } else {
    sourceEl = document.getElementById(`mini-${seat}`);
  }
  
  const targetEl = document.getElementById('packArea');
  
  if (!sourceEl || !targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Same CSS class as solo mode - 100x150 sizing
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  const cardImg = (card && card.code) ? getCardImagePath(card) : 'cards/BACK_JAMAICA.png';
  flyingCard.style.backgroundImage = `url("${cardImg}")`;
  flyingCard.style.left = (sourceRect.left + sourceRect.width/2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height/2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  requestAnimationFrame(() => {
    flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
    flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
  });
  
  // Use same timing as solo mode
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

function mpReorderHand(cardIds) {
  if (!multiplayerMode || !socket) return;
  socket.emit('reorderHand', { cardIds: cardIds });
}

function broadcastGameAction(action, payload) {
  if (!multiplayerMode || !socket) return;
  
  socket.emit('gameAction', {
    action: action,
    payload: payload
  });
}

let gameState = {
  deck: [],
  hands: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },
  sets: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },
  pack: [],
  draggingCardId: null,

  // Turn / rule-engine state
  turnSeat: 'bottom',
  hasDrawn: false,
  lastDrawSource: null,        // 'deck' or 'pack'
  lastPackCardId: null,        // id of the PACK card drawn this turn (if any)
  lastDiscardSource: null,     // 'deck' or 'pack' for the most recent discard
  lastDiscardCardId: null,     // id of the most recent discard
  lastDiscardSeat: null,       // which seat made the most recent discard
  currentTurnId: 0,
  hasDiscardedThisTurn: false,

  opened: {
    bottom: false,
    top: false,
    left: false,
    right: false
  },

  eliminated: {
    bottom: false,
    top: false,
    left: false,
    right: false
  },

  // Track which meld groups are invalid when a player is eliminated
  invalidMelds: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },

  // Track goers played this turn (cards played on other players' sets)
  goersThisTurn: [],

  // Current dealer for this hand
  currentDealer: 'bottom',

  nextGroupId: 1,               // counter for manual set grouping
  
  // Joker swap staging for win attempts
  // When a player swaps a natural card for a Joker, we stage the swap
  // and only validate it when they try to win (discard their last card)
  stagedJokerSwaps: [],         // Array of { jokerCard, naturalCard, targetSeat, groupId, originalMeldState }
  winAttemptSnapshot: null,     // Snapshot of game state before swap (for rollback)
  
  // Pending Joker swap - when swapping for a Joker, the Joker goes to player's set box
  // The player can add cards to form a meld, or double-click to undo
  pendingJokerSwap: null,       // { jokerCard, naturalCard, originalSeat, originalGroupId, newGroupId, addedCards }
  
  // Card tracking for smart bot AI
  cardTracking: {
    discardHistory: [],         // Array of { card, seat, turnNumber } - all discards this hand
    knownCards: new Set(),      // Set of card IDs that have been seen (discards + melds)
    totalCardsInGame: 106,      // 52 cards x 2 decks + 2 jokers
    playerDiscardPatterns: {    // Track what each player tends to discard
      bottom: [],
      top: [],
      left: [],
      right: []
    }
  },
  
  // IN voting system (multiplayer only) - vote to restart/re-deal the hand
  // Voting is open until the first player takes their second draw
  inVoting: {
    isOpen: false,              // Whether voting window is open
    votes: [],                  // Array of seat names who voted IN
    drawCounts: {               // Track how many times each player has drawn
      bottom: 0,
      top: 0,
      left: 0,
      right: 0
    }
  }
};

// Global group-id allocator used by human + bots
function nextGroupId() {
  if (typeof gameState.nextGroupId !== 'number') {
    gameState.nextGroupId = 1;
  }
  const id = 'g_' + gameState.nextGroupId;
  gameState.nextGroupId += 1;
  return id;
}

// ============= IN VOTING SYSTEM (MULTIPLAYER ONLY) =============
// Allows players to vote for restarting the hand before anyone takes their second draw

function resetInVoting() {
  gameState.inVoting = {
    isOpen: multiplayerMode, // Only open in multiplayer
    votes: [],
    drawCounts: {
      bottom: 0,
      top: 0,
      left: 0,
      right: 0
    }
  };
  updateInButtonUI();
}

function castInVote(seat) {
  if (!gameState.inVoting.isOpen) return;
  if (gameState.inVoting.votes.includes(seat)) return;
  
  // In multiplayer, let server handle the voting
  if (multiplayerMode && socket && seat === 'bottom') {
    socket.emit('inVote', { seat: seat });
    // Mark locally that we voted (for UI feedback)
    gameState.inVoting.votes.push(seat);
    updateInButtonUI();
    setStatus('You voted to restart!');
    return; // Server will broadcast the result
  }
  
  // Solo mode: handle locally (shouldn't happen since button is hidden)
  gameState.inVoting.votes.push(seat);
  
  // Get player name for this seat
  const seatNames = {
    bottom: playerName || 'You',
    top: 'Bot 1',
    left: 'Bot 2', 
    right: 'Bot 3'
  };
  
  setStatus(`${seatNames[seat]} voted to restart! (${gameState.inVoting.votes.length}/3 votes)`);
  updateInButtonUI();
  
  // Check if 3 votes reached (solo mode only)
  if (gameState.inVoting.votes.length >= 3) {
    triggerInVoteRestart();
  }
}

function incrementDrawCount(seat) {
  if (!gameState.inVoting) return;
  
  gameState.inVoting.drawCounts[seat]++;
  
  // Close voting if any player takes their second draw
  if (gameState.inVoting.drawCounts[seat] >= 2 && gameState.inVoting.isOpen) {
    gameState.inVoting.isOpen = false;
    updateInButtonUI();
    if (multiplayerMode) {
      setStatus('Voting to restart is now closed.');
      // Notify server that voting is closed
      if (socket) {
        socket.emit('closeInVoting');
      }
    }
  }
}

function updateInButtonUI() {
  const btnIn = document.getElementById('btnIn');
  if (!btnIn) return;
  
  // Hide in solo mode and demo mode
  if (!multiplayerMode || demoMode) {
    btnIn.style.display = 'none';
    return;
  }
  
  // Show in multiplayer
  btnIn.style.display = '';
  
  // Update button state
  const hasVoted = gameState.inVoting.votes.includes('bottom');
  const isOpen = gameState.inVoting.isOpen;
  
  if (!isOpen) {
    btnIn.disabled = true;
    btnIn.classList.remove('in-voted');
    btnIn.textContent = 'IN';
    btnIn.title = 'Voting closed';
  } else if (hasVoted) {
    btnIn.disabled = true;
    btnIn.classList.add('in-voted');
    btnIn.textContent = `IN ✓`;
    btnIn.title = 'You voted to restart';
  } else {
    btnIn.disabled = false;
    btnIn.classList.remove('in-voted');
    const voteCount = gameState.inVoting.votes.length;
    btnIn.textContent = voteCount > 0 ? `IN (${voteCount}/3)` : 'IN';
    btnIn.title = 'Vote to restart the hand';
  }
}

function triggerInVoteRestart() {
  // Close voting
  gameState.inVoting.isOpen = false;
  updateInButtonUI();
  
  // Get voter names
  const seatNames = {
    bottom: playerName || 'You',
    top: 'Bot 1',
    left: 'Bot 2',
    right: 'Bot 3'
  };
  
  const voterNames = gameState.inVoting.votes.map(seat => seatNames[seat]);
  
  // Show restart overlay
  showRestartOverlay(voterNames);
}

function showRestartOverlay(voterNames) {
  // Create or get the restart overlay
  let overlay = document.getElementById('restartOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'restartOverlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="restart-content">
        <div class="restart-header">RE-DEAL</div>
        <div class="restart-voters">
          <div class="restart-subtitle">Voted IN:</div>
          <div class="voter-names"></div>
        </div>
        <div class="restart-message">New hand in</div>
        <div class="restart-countdown">5</div>
      </div>
    `;
    document.getElementById('table-root').appendChild(overlay);
  }
  
  // Populate voter names
  const voterNamesEl = overlay.querySelector('.voter-names');
  voterNamesEl.innerHTML = voterNames.map(name => `<span class="voter-name">${name}</span>`).join('');
  
  // Show overlay
  overlay.classList.remove('hidden');
  
  // Start countdown
  let countdown = 5;
  const countdownEl = overlay.querySelector('.restart-countdown');
  
  const countdownInterval = setInterval(() => {
    countdown--;
    countdownEl.textContent = countdown;
    
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      overlay.classList.add('hidden');
      
      // Restart the game with same dealer
      restartHandAfterInVote();
    }
  }, 1000);
}

function restartHandAfterInVote() {
  // Clear all pending timeouts
  clearAllGameTimeouts();
  
  // Reset game state but keep dealer the same (they re-deal)
  const currentDealer = gameState.currentDealer;
  
  // Reset hands and piles
  clearAllHands();
  
  // Re-deal with same dealer
  gameState.currentDealer = currentDealer;
  dealInitialHands();
}

function setStatus(message) {
  const el = document.getElementById('playerStatus');
  if (el) {
    el.textContent = message;
  }
}

function clearGoersGlow() {
  // Clear the goer flag from all cards and remove from tracking
  gameState.goersThisTurn.forEach(cardId => {
    // Find and clear the isGoer flag on the card in all sets
    ['bottom', 'top', 'left', 'right'].forEach(seat => {
      const seatSets = gameState.sets[seat] || [];
      seatSets.forEach(card => {
        if (card.id === cardId) {
          card.isGoer = false;
        }
      });
    });
  });
  
  // Clear the tracking array
  gameState.goersThisTurn = [];
  
  // Re-render all set rows to remove the yellow glow
  renderBottomSetRow();
  renderTopSetRow();
  renderLeftSetRow();
  renderRightSetRow();
}

function checkForBottomOut() {
  const handCount = gameState.hands.bottom.length;
  if (handCount === 0) {
    // Clear staged Joker swaps on successful win
    clearStagedJokerSwaps();
    setStatus('You are OUT! Hand finished.');
    gameState.turnSeat = null;
    showVictoryScreen('bottom');
  }
}

let handDropIndex = null;
let draggingCardElement = null;
let dropZoneElement = null;

// Performance optimization: cache card elements and positions during drag
let cachedCardElements = [];
let cachedCardRects = [];
let pendingSplitUpdate = null;
let lastAppliedSplitIndex = null;

function clearHandSplit() {
  handDropIndex = null;
  lastAppliedSplitIndex = null;
  
  // Clear cached data
  cachedCardElements = [];
  cachedCardRects = [];
  
  // Cancel any pending animation frame
  if (pendingSplitUpdate) {
    cancelAnimationFrame(pendingSplitUpdate);
    pendingSplitUpdate = null;
  }
  
  // Clear all split classes from cards
  const handEl = document.getElementById('hand-bottom');
  if (handEl) {
    handEl.querySelectorAll('.card').forEach(card => {
      card.classList.remove('split-left', 'split-right');
    });
  }
  
  // Remove drop zone highlight
  if (dropZoneElement && dropZoneElement.parentElement) {
    dropZoneElement.parentElement.removeChild(dropZoneElement);
  }
  dropZoneElement = null;
  
  // Clear dragging class
  if (draggingCardElement) {
    draggingCardElement.classList.remove('dragging');
    draggingCardElement = null;
  }
}

// Cache card positions at drag start for faster hit testing
function cacheCardPositions() {
  const handEl = document.getElementById('hand-bottom');
  if (!handEl) return;
  
  cachedCardElements = Array.from(handEl.querySelectorAll('.card'));
  cachedCardRects = cachedCardElements.map(card => card.getBoundingClientRect());
}

// Throttled split update using requestAnimationFrame
function requestSplitUpdate(targetIndex, draggingIndex) {
  // Skip if same as last applied
  if (targetIndex === lastAppliedSplitIndex) return;
  
  // Cancel pending update and schedule new one
  if (pendingSplitUpdate) {
    cancelAnimationFrame(pendingSplitUpdate);
  }
  
  pendingSplitUpdate = requestAnimationFrame(() => {
    applyVShapeSplitImmediate(targetIndex, draggingIndex);
    pendingSplitUpdate = null;
  });
}

function applyVShapeSplitImmediate(targetIndex, draggingIndex) {
  // Skip if same as last applied
  if (targetIndex === lastAppliedSplitIndex) return;
  lastAppliedSplitIndex = targetIndex;
  
  const handEl = document.getElementById('hand-bottom');
  if (!handEl) return;
  
  // Use cached elements if available, otherwise query
  const cards = cachedCardElements.length > 0 
    ? cachedCardElements.filter(c => !c.classList.contains('dragging'))
    : Array.from(handEl.querySelectorAll('.card:not(.dragging)'));
  
  // Clear previous split classes
  cards.forEach(card => {
    card.classList.remove('split-left', 'split-right');
  });
  
  // Remove old drop zone
  if (dropZoneElement && dropZoneElement.parentElement) {
    dropZoneElement.parentElement.removeChild(dropZoneElement);
  }
  
  // Don't show split if dropping in same position
  if (targetIndex === draggingIndex || targetIndex === draggingIndex + 1) {
    handDropIndex = null;
    return;
  }
  
  // Adjust target index if dragging from before
  let adjustedTarget = targetIndex;
  if (draggingIndex !== null && draggingIndex < targetIndex) {
    adjustedTarget = targetIndex - 1;
  }
  
  // Apply V-shape split: cards before split go left, cards at/after go right
  cards.forEach((card) => {
    const cardIndex = parseInt(card.dataset.index);
    // Skip the card being dragged
    if (cardIndex === draggingIndex) return;
    
    // Adjust index for visual position (accounting for dragged card)
    let visualIndex = cardIndex;
    if (draggingIndex !== null && cardIndex > draggingIndex) {
      visualIndex = cardIndex - 1;
    }
    
    if (visualIndex < adjustedTarget) {
      card.classList.add('split-left');
    } else {
      card.classList.add('split-right');
    }
  });
  
  handDropIndex = targetIndex;
}

// Legacy function name for compatibility
function applyVShapeSplit(targetIndex, draggingIndex) {
  requestSplitUpdate(targetIndex, draggingIndex);
}

function buildDeck() {
  const deck = [];
  let idCounter = 0;

  // Two decks of standard cards
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const code = rank + suit;
        const imageKey = CARD_IMAGE_MAP[code];
        if (!imageKey) {
          console.warn('No image mapping for', code);
        }
        deck.push({
          id: 'card_' + (idCounter++),
          rank,
          suit,
          code,
          imageKey
        });
      }
    }
  }

  // Two jokers
  for (let j = 0; j < 2; j++) {
    deck.push({
      id: 'joker_' + j,
      rank: 'JOKER',
      suit: 'J',
      code: 'JOKER',
      imageKey: CARD_IMAGE_MAP['JOKER']
    });
  }

  // Fisher–Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function createCardElement(card) {
  const img = document.createElement('img');
  img.classList.add('card');
  img.src = `/cards/${card.imageKey}.png`;
  img.draggable = false; // Disable HTML5 drag - use pointer events instead
  img.dataset.cardId = card.id;
  
  // Add orange glow for joker swap cards
  if (card.isJokerSwapCard) {
    img.classList.add('joker-swap-glow');
  }

  // ========== SMOOTH POINTER-BASED DRAGGING ==========
  // Uses pointer events for instant, one-motion drag (no browser threshold delay)
  
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let dragClone = null;
  let dragThreshold = 5; // Pixels of movement before drag starts
  let hasMoved = false;
  let localDropIndex = null; // Local tracking for drop position (sync)
  
  const startDrag = (e) => {
    if (e.button !== 0) return; // Only left mouse button
    
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    hasMoved = false;
    localDropIndex = null;
    
    // Immediately set up for potential drag
    gameState.draggingCardId = card.id;
    gameState.draggingCardIndex = Number(img.dataset.index || 0);
    cacheCardPositions();
    
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  };
  
  const onPointerMove = (e) => {
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Start actual drag after threshold
    if (!isDragging && distance > dragThreshold) {
      isDragging = true;
      hasMoved = true;
      
      // Create visual drag clone
      dragClone = img.cloneNode(true);
      dragClone.classList.add('drag-clone');
      dragClone.style.position = 'fixed';
      dragClone.style.pointerEvents = 'none';
      dragClone.style.zIndex = '10000';
      dragClone.style.width = img.offsetWidth + 'px';
      dragClone.style.height = img.offsetHeight + 'px';
      dragClone.style.opacity = '0.9';
      dragClone.style.transform = 'rotate(-3deg) scale(1.05)';
      dragClone.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)';
      document.body.appendChild(dragClone);
      
      // Mark original as being dragged
      img.classList.add('dragging');
      document.body.classList.add('drag-mode');
      draggingCardElement = img;
    }
    
    if (isDragging && dragClone) {
      // Move the clone with the cursor
      dragClone.style.left = (e.clientX - img.offsetWidth / 2) + 'px';
      dragClone.style.top = (e.clientY - img.offsetHeight / 2) + 'px';
      
      // Find drop target and update split visualization
      localDropIndex = calculateDropTarget(e.clientX, e.clientY);
      if (localDropIndex !== null) {
        applyVShapeSplit(localDropIndex, gameState.draggingCardIndex);
      }
    }
  };
  
  const onPointerUp = (e) => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    
    let handledBySetZone = false;
    
    if (isDragging) {
      // First, check if dropping on a set zone
      const setZoneResult = checkSetZoneDrop(e.clientX, e.clientY, card);
      if (setZoneResult) {
        handledBySetZone = true;
        // Set zone drop was handled (or rejected with a status message)
      } else if (localDropIndex !== null) {
        // Perform the drop in hand using our synchronously tracked index
        const hand = gameState.hands.bottom;
        const fromIndex = hand.findIndex(c => c.id === card.id);
        
        // Only reorder if actually moving to a different position
        if (fromIndex !== -1 && localDropIndex !== fromIndex && localDropIndex !== fromIndex + 1) {
          let toIndex = localDropIndex;
          const [moved] = hand.splice(fromIndex, 1);
          if (fromIndex < toIndex) {
            toIndex -= 1;
          }
          if (toIndex < 0) toIndex = 0;
          if (toIndex > hand.length) toIndex = hand.length;
          hand.splice(toIndex, 0, moved);
        }
      }
    }
    
    // Clean up
    if (dragClone && dragClone.parentNode) {
      dragClone.parentNode.removeChild(dragClone);
    }
    if (img.classList) {
      img.classList.remove('dragging');
    }
    document.body.classList.remove('drag-mode');
    clearHandSplit();
    
    if (isDragging && !handledBySetZone) {
      renderBottomHand();
    }
    
    // Reset state
    isDragging = false;
    dragClone = null;
    localDropIndex = null;
    gameState.draggingCardId = null;
    gameState.draggingCardIndex = null;
    draggingCardElement = null;
  };
  
  // Helper to calculate drop position based on cursor (returns index synchronously)
  const calculateDropTarget = (clientX, clientY) => {
    const handEl = document.getElementById('hand-bottom');
    if (!handEl) return null;
    
    const cards = Array.from(handEl.querySelectorAll('.card:not(.dragging)'));
    if (cards.length === 0) return 0;
    
    const hand = gameState.hands.bottom;
    
    // Check each card position
    for (let i = 0; i < cards.length; i++) {
      const cardEl = cards[i];
      const rect = cardEl.getBoundingClientRect();
      
      if (clientX < rect.left + rect.width / 2) {
        return parseInt(cardEl.dataset.index);
      }
    }
    
    // If past all cards, drop at end
    return hand.length;
  };
  
  img.addEventListener('pointerdown', startDrag);
  
  // Prevent default drag behavior
  img.addEventListener('dragstart', (e) => e.preventDefault());

  // Double-click to discard (only after drawing)
  img.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (multiplayerMode) {
      if (gameState.turnSeat !== 'bottom') {
        setStatus("It's not your turn.");
        return;
      }
      if (!gameState.hasDrawn) {
        setStatus('You must draw first before discarding.');
        return;
      }
      mpDiscardCard(card.id);
      playSound('discard');
      return;
    }

    if (!isBottomTurn()) return;

    if (!gameState.hasDrawn) {
      setStatus('You must draw from DECK or PACK before discarding.');
      return;
    }

    const hand = gameState.hands.bottom;
    const idx = hand.findIndex(c => c.id === card.id);
    if (idx === -1) return;

    // If last draw was PACK, must use that card in a meld before discarding anything.
    if (gameState.lastDrawSource === 'pack') {
      const stillHoldingPackCard = hand.some(c => c.id === gameState.lastPackCardId);
      if (stillHoldingPackCard) {
        setStatus('You took from the PACK. You must use that card in a meld before discarding.');
        return;
      }
    }

    // Validate pending Joker swap BEFORE any state mutation
    // If invalid, player must fix it or undo before discarding
    if (gameState.pendingJokerSwap) {
      const swap = gameState.pendingJokerSwap;
      const playerSets = gameState.sets.bottom;
      const groupCards = playerSets.filter(c => c.groupId === swap.newGroupId);
      
      // Must have at least 3 cards to form a valid meld
      if (groupCards.length < 3) {
        setStatus('Your Joker meld needs at least 3 cards! Add more cards or double-click to undo.');
        return;
      }
      
      // Must form a valid set or run
      if (!isValidSet(groupCards) && !isValidRun(groupCards)) {
        setStatus('Your Joker meld is not valid! Rearrange cards or double-click to undo.');
        return;
      }
      
      // Validation passed - finalize the swap (remove pending markers)
      for (const groupCard of groupCards) {
        groupCard.isPendingJoker = false;
      }
      swap.naturalCard.isJokerSwapCard = false;
      
      // Update Joker representation in the finalized meld
      const joker = groupCards.find(c => c.rank === 'JOKER');
      if (joker) {
        updateJokerRepresentation(joker, groupCards);
      }
      
      gameState.pendingJokerSwap = null;
    }

    // Capture the card position BEFORE removing from DOM
    const cardRect = event.target.getBoundingClientRect();
    
    // Save whether we drew from pack BEFORE clearing state
    const drewFromPack = gameState.lastDrawSource === 'pack';
    
    const [discarded] = hand.splice(idx, 1);

    gameState.lastDiscardSource = gameState.lastDrawSource;
    gameState.lastDiscardCardId = discarded.id;
    gameState.lastDiscardSeat = 'bottom';

    gameState.hasDiscardedThisTurn = true;

    gameState.hasDrawn = false;
    gameState.lastDrawSource = null;
    gameState.lastPackCardId = null;

    renderBottomHand();
    renderMiniHands();
    setStatus('You discarded.');
    
    // Play discard sound
    playSound('discard');
    
    // Clear the yellow glow from any goers played this turn
    clearGoersGlow();

    // Animate the discard using saved position, then add to pack and render
    animateDiscardFromRect(discarded, cardRect, () => {
      gameState.pack.push(discarded);
      trackDiscard(discarded, 'bottom'); // Track for bot AI
      renderPiles();

      // Helper function to handle post-elimination or continue game
      const handlePostCheck = (wasEliminated) => {
        if (wasEliminated) {
          const activePlayers = ['bottom', 'top', 'left', 'right'].filter(s => !gameState.eliminated[s] && !isSeatOut(s));
          if (activePlayers.length <= 1) {
            if (activePlayers.length === 1) {
              const winner = activePlayers[0];
              const winnerName = winner === 'bottom' ? 'You' : 
                                winner === 'top' ? 'Bot 1' :
                                winner === 'left' ? 'Bot 2' : 'Bot 3';
              setStatus(`${winnerName} won! All other players eliminated.`);
              showVictoryScreen(winner);
            } else {
              setStatus('Game over - no players remaining.');
            }
            gameState.turnSeat = null;
            return;
          }
          advanceTurn();
          runBotsUntilBottomOrEnd();
          return;
        }

        checkForBottomOut();
        if (!gameState.turnSeat) return;

        advanceTurn();
        runBotsUntilBottomOrEnd();
      };

      // First check 40-point pack rule (if drew from pack)
      checkPackDrawElimination('bottom', drewFromPack, (was40Eliminated) => {
        if (was40Eliminated) {
          handlePostCheck(true);
          return;
        }
        
        // Then check for invalid melds
        checkAndEliminateIfInvalid('bottom', handlePostCheck);
      });
    });
  });

  return img;
}

function renderBottomHand() {
  const handEl = document.getElementById('hand-bottom');
  handEl.innerHTML = '';
  
  // Add left edge drop zone for moving cards to first position
  const leftZone = document.createElement('div');
  leftZone.className = 'edge-drop-zone edge-drop-left';
  leftZone.dataset.position = 'first';
  setupEdgeDropZone(leftZone, 0);
  handEl.appendChild(leftZone);
  
  gameState.hands.bottom.forEach((card, index) => {
    const el = createCardElement(card);
    el.dataset.index = index;
    handEl.appendChild(el);
  });
  
  // Add right edge drop zone for moving cards to last position
  const rightZone = document.createElement('div');
  rightZone.className = 'edge-drop-zone edge-drop-right';
  rightZone.dataset.position = 'last';
  setupEdgeDropZone(rightZone, gameState.hands.bottom.length);
  handEl.appendChild(rightZone);
  
  clearHandSplit();
  
  // Add container-level drag handlers for edge cases
  setupHandContainerDragHandlers(handEl);
}

function setupEdgeDropZone(zone, targetIndex) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (gameState.draggingCardId != null) {
      zone.classList.add('active');
      // For right zone, use the current hand length
      const actualIndex = zone.dataset.position === 'last' 
        ? gameState.hands.bottom.length 
        : 0;
      applyVShapeSplit(actualIndex, gameState.draggingCardIndex);
    }
  });
  
  zone.addEventListener('dragleave', (e) => {
    zone.classList.remove('active');
  });
  
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('active');
    
    const cardId = e.dataTransfer.getData('text/plain') || gameState.draggingCardId;
    if (!cardId) return;
    
    const hand = gameState.hands.bottom;
    const fromIndex = hand.findIndex(c => c.id === cardId);
    if (fromIndex === -1) return;
    
    // Determine target index
    let toIndex = zone.dataset.position === 'last' ? hand.length : 0;
    
    const [moved] = hand.splice(fromIndex, 1);
    if (fromIndex < toIndex) {
      toIndex -= 1;
    }
    if (toIndex < 0) toIndex = 0;
    if (toIndex > hand.length) toIndex = hand.length;
    hand.splice(toIndex, 0, moved);
    
    clearHandSplit();
    renderBottomHand();
  });
}

function setupHandContainerDragHandlers(handEl) {
  // Guard: Only attach listeners once per element
  if (handEl.dataset.dragHandlersAttached === 'true') return;
  handEl.dataset.dragHandlersAttached = 'true';
  
  // Handle dragover on container for edge positions
  handEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // If dragging over empty space at edges, show split for end positions
    if (gameState.draggingCardId != null && e.target === handEl) {
      // Use cached rects if available for performance
      const cardCount = cachedCardRects.length > 0 
        ? cachedCardRects.length 
        : handEl.querySelectorAll('.card').length;
      
      // Determine if we're at the left or right edge
      if (cardCount > 0) {
        const firstRect = cachedCardRects.length > 0 
          ? cachedCardRects[0] 
          : handEl.querySelector('.card').getBoundingClientRect();
        const lastRect = cachedCardRects.length > 0 
          ? cachedCardRects[cardCount - 1] 
          : handEl.querySelectorAll('.card')[cardCount - 1].getBoundingClientRect();
        
        if (e.clientX < firstRect.left) {
          // Dropping at the beginning
          applyVShapeSplit(0, gameState.draggingCardIndex);
        } else if (e.clientX > lastRect.right) {
          // Dropping at the end
          applyVShapeSplit(cardCount, gameState.draggingCardIndex);
        }
      }
    }
  });
  
  // Handle drop on empty container area
  handEl.addEventListener('drop', (e) => {
    if (e.target === handEl || e.target.classList.contains('hand-drop-zone')) {
      e.preventDefault();
      const cardId = e.dataTransfer.getData('text/plain') || gameState.draggingCardId;
      if (!cardId) return;
      
      const hand = gameState.hands.bottom;
      const fromIndex = hand.findIndex(c => c.id === cardId);
      if (fromIndex === -1) return;
      
      let toIndex = handDropIndex;
      if (toIndex == null) {
        // Default to end
        toIndex = hand.length;
      }
      
      const [moved] = hand.splice(fromIndex, 1);
      if (fromIndex < toIndex) {
        toIndex -= 1;
      }
      if (toIndex < 0) toIndex = 0;
      if (toIndex > hand.length) toIndex = hand.length;
      hand.splice(toIndex, 0, moved);
      
      clearHandSplit();
      renderBottomHand();
    }
  });
  
  // Handle dragleave to clear split when leaving hand area
  handEl.addEventListener('dragleave', (e) => {
    // Only clear if truly leaving the hand container
    const rect = handEl.getBoundingClientRect();
    if (e.clientX < rect.left - 10 || e.clientX > rect.right + 10 || 
        e.clientY < rect.top - 10 || e.clientY > rect.bottom + 10) {
      clearHandSplit();
    }
  });
}

function createSetCardElement(card, seat) {
  const img = document.createElement('img');
  img.classList.add('card', 'set-card', 'meld-card');
  img.src = `/cards/${card.imageKey}.png`;
  img.draggable = false;
  img.dataset.cardId = card.id;
  img.dataset.seat = seat;
  
  // Add yellow glow for goers played this turn
  if (card.isGoer && gameState.goersThisTurn.includes(card.id)) {
    img.classList.add('goer-glow');
  }
  
  // Add orange glow for joker swap cards (the natural card that replaced a joker)
  if (card.isJokerSwapCard) {
    img.classList.add('joker-swap-glow');
  }

  if (seat === 'left') {
    img.classList.add('set-card-left');
  } else if (seat === 'right') {
    img.classList.add('set-card-right');
  }

  // Double-click to undo own meld cards from this turn only
  img.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isBottomTurn()) {
      setStatus('It is not your turn.');
      return;
    }

    if (gameState.hasDiscardedThisTurn) {
      setStatus('You have already discarded this turn. You cannot adjust your meld until your next turn.');
      return;
    }

    if (!card.laidTurn || card.laidTurn !== gameState.currentTurnId) {
      setStatus('You cannot disrupt melds laid in previous turns. You may only adjust new sets you add this turn.');
      return;
    }

    const setArr = gameState.sets[seat];
    const idx = setArr.findIndex(c => c.id === card.id);
    if (idx === -1) return;

    const [cardObj] = setArr.splice(idx, 1);

    const isCurrentPackCard =
      isBottomTurn() &&
      gameState.hasDrawn &&
      gameState.lastDrawSource === 'pack' &&
      gameState.lastPackCardId === cardObj.id;

    if (isCurrentPackCard) {
      gameState.pack.push(cardObj);
      gameState.hasDrawn = false;
      gameState.lastDrawSource = null;
      gameState.lastPackCardId = null;

      renderBottomSetRow();
      renderPiles();
      renderMiniHands();
      setStatus('Your PACK card has been returned to the PACK. You may draw again.');
      return;
    }

    cardObj.groupId = null;
    cardObj.jokerRepRank = null;
    cardObj.jokerRepSuit = null;
    gameState.hands.bottom.push(cardObj);

    renderBottomHand();
    if (seat === 'bottom') {
      renderBottomSetRow();
    } else if (seat === 'top') {
      renderTopSetRow();
    } else if (seat === 'left') {
      renderLeftSetRow();
    } else if (seat === 'right') {
      renderRightSetRow();
    }
  });

  return img;
}

function groupMeldCards(cards) {
  if (!cards || cards.length === 0) return [];

  const byGroup = new Map();

  for (const card of cards) {
    if (card.groupId) {
      if (!byGroup.has(card.groupId)) {
        byGroup.set(card.groupId, []);
      }
      byGroup.get(card.groupId).push(card);
    }
  }

  const result = [];
  const seenGroups = new Set();

  for (const card of cards) {
    if (card.groupId) {
      if (!seenGroups.has(card.groupId)) {
        seenGroups.add(card.groupId);
        const grp = byGroup.get(card.groupId) || [card];
        result.push(grp);
      }
    } else {
      result.push([card]);
    }
  }

  return result;
}

// Helper to map ranks in Ace-high order (2..K,A).
const ACE_HIGH_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// ----- Core Kalooki rule helpers (shared by human + bots) -----

function effectiveRank(card) {
  if (!card) return null;
  if (card.rank === 'JOKER' && card.jokerRepRank) {
    return card.jokerRepRank;
  }
  return card.rank;
}

function effectiveSuit(card) {
  if (!card) return null;
  if (card.rank === 'JOKER' && card.jokerRepSuit) {
    return card.jokerRepSuit;
  }
  return card.suit;
}

function cardPointValue(card) {
  const r = effectiveRank(card);
  if (!r) return 0;
  if (r === 'A') return 11;
  if (r === 'K' || r === 'Q' || r === 'J') return 10;
  if (r === 'JOKER') return 25;
  const num = parseInt(r, 10);
  return isNaN(num) ? 0 : num;
}

// 3–5 cards for initial melds, max 1 joker per set
// allowExtended: if true, allows 6+ cards (for melds extended with goers)
function isValidSetGroup(cards, allowExtended = false) {
  if (!cards || cards.length < 3) return false;
  // Initial melds: max 5 cards. Extended melds: no max
  if (!allowExtended && cards.length > 5) return false;

  const ranks = new Set();
  const suitKeys = new Set();
  let jokerCount = 0;

  for (const c of cards) {
    // Count actual jokers (not their represented value)
    if (c.rank === 'JOKER') {
      jokerCount++;
      // Rule: max 1 joker per set
      if (jokerCount > 1) return false;
    }
    
    const r = effectiveRank(c);
    const s = effectiveSuit(c);
    if (!r || r === 'JOKER') return false;
    ranks.add(r);
    suitKeys.add(r + '_' + (s || '?'));
  }

  if (ranks.size !== 1) return false;

  if (suitKeys.size !== cards.length) {
    return false;
  }

  return true;
}

// 3–5 cards for initial melds, jokers must represent distinct consecutive positions
// allowExtended: if true, allows 6+ cards (for melds extended with goers)
function isValidRunGroup(cards, allowExtended = false) {
  if (!cards || cards.length < 3) return false;
  // Initial melds: max 5 cards. Extended melds: no max
  if (!allowExtended && cards.length > 5) return false;

  // Count jokers and ensure they represent distinct positions
  let jokerCount = 0;
  for (const c of cards) {
    if (c.rank === 'JOKER') {
      jokerCount++;
      // Allow up to 2 jokers in a run, but they must occupy distinct positions
      // (e.g., 9, Joker(10), Joker(J), Q is valid if both jokers have different representations)
    }
  }

  const effs = cards.map(c => ({
    r: effectiveRank(c),
    s: effectiveSuit(c)
  }));

  const suit = effs[0].s;
  if (!suit) return false;
  for (const e of effs) {
    if (!e.r || e.r === 'JOKER') return false;
    if (e.s !== suit) return false;
  }

  const idxs = effs.map(e => ACE_HIGH_ORDER.indexOf(e.r));
  if (idxs.some(i => i < 0)) return false;
  
  // Check for duplicate positions (jokers representing same rank = invalid)
  const uniqueIdxs = new Set(idxs);
  if (uniqueIdxs.size !== idxs.length) return false;
  
  idxs.sort((a, b) => a - b);

  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) {
      return false;
    }
  }

  return true;
}

function scoreMeldGroup(cards, allowExtended = false) {
  if (!cards || cards.length === 0) return 0;
  if (!isValidSetGroup(cards, allowExtended) && !isValidRunGroup(cards, allowExtended)) {
    return 0;
  }
  return cards.reduce((sum, c) => sum + cardPointValue(c), 0);
}

function analyseSeatMelds(seat) {
  const seatSets = gameState.sets[seat] || [];
  const grouped = groupMeldCards(seatSets);
  const resultGroups = [];
  let totalScore = 0;
  let allValid = true;

  for (const g of grouped) {
    // Use allowExtended=true because melds on the table may have been extended with goers
    const isSet = isValidSetGroup(g, true);
    const isRun = !isSet && isValidRunGroup(g, true);
    const score = scoreMeldGroup(g, true);
    if (!isSet && !isRun) {
      allValid = false;
    }
    totalScore += score;
    resultGroups.push({
      cards: g,
      isSet,
      isRun,
      score
    });
  }

  return {
    groups: resultGroups,
    totalScore,
    allValid
  };
}

function checkAndEliminateIfInvalid(seat, onComplete) {
  // BOTS ARE EXEMPT from elimination - they "know the rules" and wouldn't make mistakes
  // This elimination feature is for human error only, adding challenge to the game
  if (isBotSeat(seat)) {
    if (onComplete) onComplete(false);
    return;
  }
  
  const seatSets = gameState.sets[seat] || [];
  
  if (seatSets.length === 0) {
    if (onComplete) onComplete(false);
    return;
  }
  
  const analysis = analyseSeatMelds(seat);
  
  if (analysis.allValid) {
    if (onComplete) onComplete(false);
    return;
  }
  
  gameState.eliminated[seat] = true;
  
  // Mark which meld groups are invalid for this seat
  if (!gameState.invalidMelds) gameState.invalidMelds = {};
  gameState.invalidMelds[seat] = [];
  
  // Find invalid groups and their indices
  const invalidGroups = [];
  analysis.groups.forEach((group, index) => {
    if (!group.isSet && !group.isRun) {
      gameState.invalidMelds[seat].push(index);
      invalidGroups.push({
        index,
        cards: group.cards,
        reason: describeInvalidMeld(group.cards)
      });
    }
  });
  
  const playerName = seat === 'bottom' ? 'YOU' : 
                     seat === 'top' ? 'Bot 1' :
                     seat === 'left' ? 'Bot 2' : 'Bot 3';
  
  // Show elimination overlay
  showEliminationNotification(playerName, invalidGroups, () => {
    // After notification dismisses, mark invalid sets visually and continue
    renderSetsWithInvalidMarkers(seat);
    
    // Only hand cards go to discard - sets stay on table
    const handCards = [...gameState.hands[seat]];
    gameState.hands[seat] = [];
    
    // Immediately clear the hand display
    if (seat === 'bottom') {
      renderBottomHand();
    } else {
      renderMiniHands();
    }
    
    if (handCards.length === 0) {
      if (onComplete) onComplete(true);
      return;
    }
    
    // Hand cards go to BOTTOM of pack (discarded card stays on top)
    animateEliminationCards(handCards, seat, () => {
      renderPiles();
      if (onComplete) onComplete(true);
    });
  });
}

function describeInvalidMeld(cards) {
  if (cards.length < 3) {
    return `Only ${cards.length} card(s) - need at least 3`;
  }
  
  const ranks = cards.map(c => c.rank);
  const suits = cards.map(c => c.suit);
  const uniqueRanks = [...new Set(ranks)];
  const uniqueSuits = [...new Set(suits)];
  
  // Check if it's trying to be a set (same rank)
  if (uniqueRanks.length === 1) {
    return `Duplicate suits in set - ${cards.map(c => c.rank + c.suit).join(', ')}`;
  }
  
  // Check if it's trying to be a run (same suit)
  if (uniqueSuits.length === 1) {
    return `Cards not in sequence - ${cards.map(c => c.rank).join(', ')}`;
  }
  
  // Mixed - neither set nor run
  return `Mixed ranks and suits - not a valid set or run`;
}

function checkPackDrawElimination(seat, drewFromPack, onComplete) {
  // Rule: If you drew from the pack, you MUST come down with 40+ points
  // If you haven't opened (laid down 40+ points) after drawing from pack, you're eliminated
  // NOTE: This rule only applies to human players - bots are exempt since they "know" the rules
  // This is designed to catch human counting/calculation errors
  
  // Bots are exempt from this rule - they understand game logic
  if (seat !== 'bottom') {
    if (onComplete) onComplete(false);
    return;
  }
  
  if (!drewFromPack) {
    if (onComplete) onComplete(false);
    return;
  }
  
  // If already opened, this rule doesn't apply
  if (gameState.opened[seat]) {
    if (onComplete) onComplete(false);
    return;
  }
  
  // Check if player has any sets down
  const seatSets = gameState.sets[seat] || [];
  if (seatSets.length === 0) {
    // Drew from pack but laid nothing down - eliminated!
    eliminateFor40PointRule(seat, 0, onComplete);
    return;
  }
  
  // Calculate total score of sets
  const analysis = analyseSeatMelds(seat);
  
  // Only count valid melds toward the 40-point requirement
  let validScore = 0;
  analysis.groups.forEach(group => {
    if (group.isSet || group.isRun) {
      validScore += group.score;
    }
  });
  
  if (validScore < 40) {
    // Didn't reach 40 points - eliminated!
    eliminateFor40PointRule(seat, validScore, onComplete);
    return;
  }
  
  // Player met the 40-point requirement
  gameState.opened[seat] = true;
  if (onComplete) onComplete(false);
}

function eliminateFor40PointRule(seat, actualScore, onComplete) {
  // Mark player as eliminated
  gameState.eliminated[seat] = true;
  
  const playerName = seat === 'bottom' ? 'YOU' : 
                     seat === 'top' ? 'Bot 1' :
                     seat === 'left' ? 'Bot 2' : 'Bot 3';
  
  // Use the existing elimination notification system with custom message
  const overlay = document.getElementById('eliminationOverlay');
  const playerNameEl = document.getElementById('eliminationPlayerName');
  const detailsEl = document.getElementById('eliminationDetails');
  
  if (!overlay || !playerNameEl || !detailsEl) {
    // Fallback: do cleanup without notification
    performEliminationCleanup(seat, onComplete);
    return;
  }
  
  playerNameEl.textContent = playerName;
  detailsEl.innerHTML = `
    <div class="invalid-group-detail">
      <strong>40-Point Rule Violation!</strong><br>
      <em>Drew from the pack but only laid down ${actualScore} points.</em><br>
      <em>You must lay down at least 40 points when drawing from the pack.</em>
    </div>
  `;
  
  // Show the overlay
  overlay.classList.remove('hidden');
  
  // Hide after 5 seconds, then perform cleanup with animations
  setTimeout(() => {
    overlay.classList.add('hidden');
    performEliminationCleanup(seat, onComplete);
  }, 5000);
}

function performEliminationCleanup(seat, onComplete) {
  // Copy hand cards and clear hand (same as checkAndEliminateIfInvalid flow)
  const handCards = [...gameState.hands[seat]];
  gameState.hands[seat] = [];
  
  // Immediately clear the hand display
  if (seat === 'bottom') {
    renderBottomHand();
  } else {
    renderMiniHands();
  }
  
  if (handCards.length === 0) {
    if (onComplete) onComplete(true);
    return;
  }
  
  // Hand cards go to BOTTOM of pack with animation (same as existing elimination flow)
  animateEliminationCards(handCards, seat, () => {
    renderPiles();
    if (onComplete) onComplete(true);
  });
}

function showEliminationNotification(playerName, invalidGroups, onComplete) {
  const overlay = document.getElementById('eliminationOverlay');
  const playerNameEl = document.getElementById('eliminationPlayerName');
  const detailsEl = document.getElementById('eliminationDetails');
  
  if (!overlay || !playerNameEl || !detailsEl) {
    if (onComplete) onComplete();
    return;
  }
  
  playerNameEl.textContent = playerName;
  
  // Build details about what's wrong
  let detailsHTML = '';
  invalidGroups.forEach((group, i) => {
    const cardNames = group.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    detailsHTML += `<div class="invalid-group-detail">`;
    detailsHTML += `<strong>Group ${group.index + 1}:</strong> ${cardNames}<br>`;
    detailsHTML += `<em>${group.reason}</em>`;
    detailsHTML += `</div>`;
    if (i < invalidGroups.length - 1) {
      detailsHTML += '<br>';
    }
  });
  detailsEl.innerHTML = detailsHTML;
  
  // Show the overlay
  overlay.classList.remove('hidden');
  
  // Hide after 5 seconds and continue
  setTimeout(() => {
    overlay.classList.add('hidden');
    if (onComplete) onComplete();
  }, 5000);
  
  // Broadcast to other players in multiplayer
  if (multiplayerMode && socket) {
    socket.emit('showElimination', {
      playerName: playerName,
      reason: 'Invalid Melds',
      details: invalidGroups.map(g => g.reason).join('; ')
    });
  }
}

// Show elimination overlay from server (for remote players)
function showEliminationFromServer(playerName, reason, details) {
  const overlay = document.getElementById('eliminationOverlay');
  const playerNameEl = document.getElementById('eliminationPlayerName');
  const detailsEl = document.getElementById('eliminationDetails');
  
  if (!overlay || !playerNameEl || !detailsEl) return;
  
  playerNameEl.textContent = playerName;
  detailsEl.innerHTML = `<div class="invalid-group-detail"><em>${details || reason}</em></div>`;
  
  overlay.classList.remove('hidden');
  
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 5000);
}

// Show victory overlay from server (for remote players)
function showVictoryFromServer(winnerName, winnerSeat) {
  const overlay = document.getElementById('victoryOverlay');
  const playerNameEl = document.getElementById('victoryPlayerName');
  const messageEl = document.getElementById('victoryMessage');
  const confettiContainer = document.getElementById('confettiContainer');
  
  if (!overlay || !playerNameEl || !messageEl) return;
  
  playerNameEl.textContent = winnerName;
  messageEl.textContent = winnerSeat === 'bottom' 
    ? 'Congratulations Champion! You cleared your hand!'
    : `${winnerName} cleared their hand first.`;
  
  if (confettiContainer) {
    confettiContainer.innerHTML = '';
    createConfetti(confettiContainer);
    createSparkles(confettiContainer);
  }
  
  overlay.classList.remove('hidden');
}

function showVictoryScreen(winnerSeat) {
  const overlay = document.getElementById('victoryOverlay');
  const playerNameEl = document.getElementById('victoryPlayerName');
  const messageEl = document.getElementById('victoryMessage');
  const confettiContainer = document.getElementById('confettiContainer');
  
  if (!overlay || !playerNameEl || !messageEl) {
    return;
  }
  
  // Get actual player names from the table labels
  const humanPlayer = playerName || localStorage.getItem('kalookiPlayerName') || 'Player';
  const bot1Name = document.getElementById('label-top')?.textContent || 'Bot 1';
  const bot2Name = document.getElementById('label-left')?.textContent || 'Bot 2';
  const bot3Name = document.getElementById('label-right')?.textContent || 'Bot 3';
  
  // All players in the game (for stats tracking)
  const allPlayerNames = [humanPlayer, bot1Name, bot2Name, bot3Name];
  
  // Determine winner name for display and stats
  let winnerDisplayName = '';
  let winnerActualName = '';
  let message = '';
  
  if (winnerSeat === 'bottom') {
    winnerDisplayName = humanPlayer;
    winnerActualName = humanPlayer;
    message = 'Congratulations Champion! You cleared your hand!';
  } else if (winnerSeat === 'top') {
    winnerDisplayName = bot1Name;
    winnerActualName = bot1Name;
    message = `Better luck next time! ${bot1Name} cleared their hand first.`;
  } else if (winnerSeat === 'left') {
    winnerDisplayName = bot2Name;
    winnerActualName = bot2Name;
    message = `Better luck next time! ${bot2Name} cleared their hand first.`;
  } else if (winnerSeat === 'right') {
    winnerDisplayName = bot3Name;
    winnerActualName = bot3Name;
    message = `Better luck next time! ${bot3Name} cleared their hand first.`;
  } else {
    winnerDisplayName = winnerSeat || 'Unknown';
    winnerActualName = winnerSeat || 'Unknown';
    message = 'Game Over!';
  }
  
  // Record the game result for leaderboard (solo vs multiplayer)
  recordGameResult(winnerActualName, allPlayerNames, multiplayerMode);
  
  playerNameEl.textContent = winnerDisplayName;
  messageEl.textContent = message;
  
  // Clear old confetti
  confettiContainer.innerHTML = '';
  
  // Create confetti particles
  createConfetti(confettiContainer);
  
  // Create sparkles
  createSparkles(confettiContainer);
  
  // Show the overlay
  overlay.classList.remove('hidden');
  
  // Add red glow to the winning discard (top card in pack)
  const packArea = document.getElementById('packArea');
  if (packArea) {
    const packCards = packArea.querySelectorAll('.pack-card');
    if (packCards.length > 0) {
      // Get the last (top) card and add the glow
      const topCard = packCards[packCards.length - 1];
      topCard.classList.add('winning-discard-glow');
    }
  }
  
  // Add red glow to the winner's set box
  const winnerSetBoxId = winnerSeat === 'bottom' ? 'set-bottom' :
                         winnerSeat === 'top' ? 'set-top' :
                         winnerSeat === 'left' ? 'set-left' :
                         winnerSeat === 'right' ? 'set-right' : null;
  if (winnerSetBoxId) {
    const winnerSetBox = document.getElementById(winnerSetBoxId);
    if (winnerSetBox) {
      winnerSetBox.classList.add('winner-glow');
    }
  }
  
  // Add click handler for Play Again button - uses unified startNewGame function
  const playAgainBtn = document.getElementById('victoryPlayAgain');
  if (playAgainBtn) {
    playAgainBtn.onclick = () => {
      startNewGame();
    };
  }
  
  // Broadcast to other players in multiplayer
  if (multiplayerMode && socket) {
    socket.emit('showVictory', {
      winnerName: winnerDisplayName,
      winnerSeat: winnerSeat
    });
  }
}

// Flag to prevent multiple simultaneous game starts
let isStartingGame = false;

function hideVictoryScreen() {
  const overlay = document.getElementById('victoryOverlay');
  const confettiContainer = document.getElementById('confettiContainer');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  if (confettiContainer) {
    confettiContainer.innerHTML = '';
  }
  // Remove winning discard glow
  const packArea = document.getElementById('packArea');
  if (packArea) {
    const glowingCards = packArea.querySelectorAll('.winning-discard-glow');
    glowingCards.forEach(card => card.classList.remove('winning-discard-glow'));
  }
  // Remove winner set box glow
  const allSetBoxes = document.querySelectorAll('.winner-glow');
  allSetBoxes.forEach(box => box.classList.remove('winner-glow'));
}

// Unified function to start a new game - used by both Start button and Play Again
function startNewGame() {
  // Prevent multiple simultaneous starts
  if (isStartingGame) {
    console.log('Game start already in progress, ignoring...');
    return;
  }
  
  isStartingGame = true;
  
  // CRITICAL: Clear all pending game timeouts from previous game
  // This prevents bot turns from the old game firing during the new game
  clearAllGameTimeouts();
  
  // Always hide victory screen first
  hideVictoryScreen();
  
  // Ensure player name is loaded from localStorage and displayed
  playerName = localStorage.getItem('kalookiPlayerName') || 'Player';
  const labelBottom = document.getElementById('label-bottom');
  if (labelBottom) {
    // In demo mode, bottom player is Bot 4
    labelBottom.textContent = demoMode ? 'Bot 4' : playerName;
  }
  
  // Small delay to ensure UI is cleared
  setTimeout(() => {
    clearAllHands();
    dealInitialHands();
    // Reset the flag after dealing completes (estimate based on 52 cards at deal speed)
    setTimeout(() => {
      isStartingGame = false;
    }, getAnimDuration(BASE_ANIM.deal) * 52 + 1000);
  }, 50);
}

function createConfetti(container) {
  const colors = ['#ff0000', '#ffd700', '#00ff00', '#000000']; // Jamaican colors: Red, Gold, Green, Black
  const shapes = ['square', 'circle', 'triangle'];
  
  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = color;
    confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
    confetti.style.animationDelay = (Math.random() * 2) + 's';
    
    if (shape === 'circle') {
      confetti.style.borderRadius = '50%';
    } else if (shape === 'triangle') {
      confetti.style.width = '0';
      confetti.style.height = '0';
      confetti.style.backgroundColor = 'transparent';
      confetti.style.borderLeft = '6px solid transparent';
      confetti.style.borderRight = '6px solid transparent';
      confetti.style.borderBottom = '12px solid ' + color;
    }
    
    container.appendChild(confetti);
  }
}

function createSparkles(container) {
  for (let i = 0; i < 30; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    
    sparkle.style.left = Math.random() * 100 + '%';
    sparkle.style.top = Math.random() * 100 + '%';
    sparkle.style.animationDelay = (Math.random() * 2) + 's';
    sparkle.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
    
    container.appendChild(sparkle);
  }
}

function renderSetsWithInvalidMarkers(seat) {
  // Re-render the set row for this seat with invalid markers
  if (seat === 'bottom') {
    renderBottomSetRow();
  } else if (seat === 'top') {
    renderTopSetRow();
  } else if (seat === 'left') {
    renderLeftSetRow();
  } else {
    renderRightSetRow();
  }
}

function animateEliminationCards(cards, seat, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl || cards.length === 0) {
    // Add to BOTTOM of pack (unshift adds to beginning of array)
    for (const card of cards) {
      gameState.pack.unshift(card);
    }
    if (onComplete) onComplete();
    return;
  }
  
  const packRect = packAreaEl.getBoundingClientRect();
  
  let seatRect;
  if (seat === 'bottom') {
    const handEl = document.getElementById('hand-bottom');
    seatRect = handEl ? handEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 100, width: 200, height: 150 };
  } else if (seat === 'top') {
    const handEl = document.getElementById('mini-top');
    seatRect = handEl ? handEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: 50, width: 100, height: 50 };
  } else if (seat === 'left') {
    const handEl = document.getElementById('mini-left');
    seatRect = handEl ? handEl.getBoundingClientRect() : { left: 50, top: window.innerHeight / 2, width: 50, height: 100 };
  } else {
    const handEl = document.getElementById('mini-right');
    seatRect = handEl ? handEl.getBoundingClientRect() : { left: window.innerWidth - 100, top: window.innerHeight / 2, width: 50, height: 100 };
  }
  
  let completed = 0;
  const delay = 80;
  
  // Collect all cards first, then add to bottom of pack all at once
  const cardsToAdd = [];
  
  cards.forEach((card, index) => {
    setTimeout(() => {
      const flyingCard = document.createElement('div');
      flyingCard.className = 'discarding-card elimination-card';
      flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
      flyingCard.style.left = (seatRect.left + seatRect.width / 2 - 50) + 'px';
      flyingCard.style.top = (seatRect.top + seatRect.height / 2 - 75) + 'px';
      
      document.body.appendChild(flyingCard);
      
      const endX = packRect.left + Math.random() * 80 - 10;
      const endY = packRect.top + Math.random() * 60 - 5;
      const endRotation = (Math.random() - 0.5) * 50;
      
      packCardPositions.set(card.id, { 
        x: endX - packRect.left, 
        y: endY - packRect.top, 
        rotation: endRotation 
      });
      
      requestAnimationFrame(() => {
        flyingCard.style.left = endX + 'px';
        flyingCard.style.top = endY + 'px';
        flyingCard.style.transform = `rotate(${endRotation}deg)`;
      });
      
      setTimeout(() => {
        flyingCard.remove();
        cardsToAdd.push(card);
        completed++;
        
        if (completed === cards.length) {
          // Add all cards to BOTTOM of pack (the discarded card stays on top)
          gameState.pack = [...cardsToAdd, ...gameState.pack];
          renderPiles();
          if (onComplete) onComplete();
        }
      }, 400);
    }, index * delay);
  });
}

// Build all valid 3–5 card meld candidates in a hand.
function chooseOpeningMeldsForSeat(seat, options = {}) {
  const hand = gameState.hands[seat] || [];
  if (!hand || hand.length < 3) return [];

  const opts = options || {};
  const requiredCardId = opts.requiredCardId || null;

  const n = hand.length;
  const candidates = [];
  const packCandidates = [];

  // Enumerate all subsets of the hand and keep only valid melds (size >= 3)
  for (let mask = 0; mask < (1 << n); mask++) {
    // Quick bit-count; skip small subsets
    let bits = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) bits++;
    }
    if (bits < 3) continue;

    const group = [];
    let containsRequired = !requiredCardId;

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const card = hand[i];
        group.push(card);
        if (requiredCardId && card.id === requiredCardId) {
          containsRequired = true;
        }
      }
    }

    if (!group.length) continue;

    const setOk = isValidSetGroup(group);
    const runOk = !setOk && isValidRunGroup(group);
    if (!setOk && !runOk) continue;

    const score = scoreMeldGroup(group);
    if (!score || score <= 0) continue;

    const cand = { mask, group, score };
    candidates.push(cand);

    if (requiredCardId && containsRequired) {
      packCandidates.push(cand);
    }
  }

  if (!candidates.length) return [];

  // Sort highest score first
  candidates.sort((a, b) => b.score - a.score);

  const chosen = [];
  let usedMask = 0;

  // If we must use a specific card (eg, PACK card), force the best meld
  // containing that card to be chosen first.
  if (requiredCardId) {
    if (!packCandidates.length) {
      // No meld uses the required card – caller will decide how to handle this.
      return [];
    }
    // Pick the highest-scoring candidate that includes the required card
    packCandidates.sort((a, b) => b.score - a.score);
    const first = packCandidates[0];
    chosen.push(first);
    usedMask |= first.mask;
  }

  // Then greedily add the best non-overlapping melds
  for (const cand of candidates) {
    if ((usedMask & cand.mask) !== 0) continue;
    chosen.push(cand);
    usedMask |= cand.mask;
  }

  return chosen;
}

// Let a bot extend existing melds (own AND other players') with goers from its hand.
// Rule: only allowed once that seat has "opened" (40+ points down).
// Bots can play cards on ANY player's valid sets/runs, not just their own.
function botAddGoersForSeat(seat) {
  const hand = gameState.hands[seat];
  if (!hand || !hand.length) return;
  if (!gameState.opened[seat]) return;   // no goers until 40+ is down

  // If this seat just drew from PACK, we must NOT allow that PACK card
  // to be used as a goer to extend existing melds this turn.
  const packCardIdThisTurn = (gameState.lastDrawSource === 'pack') ? gameState.lastPackCardId : null;

  // Get all seats to check for goer opportunities
  const allSeats = ['bottom', 'top', 'left', 'right'];
  // Prioritize own sets first, then others
  const orderedSeats = [seat, ...allSeats.filter(s => s !== seat)];
  
  let changed = true;
  while (changed) {
    changed = false;

    // Iterate through hand (use index to handle splice safely)
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi];

      // PACK rule: the PACK card taken this turn may NOT be used as a goer
      // to extend existing melds. It can only ever appear in brand-new melds.
      if (packCardIdThisTurn && card.id === packCardIdThisTurn) {
        continue;
      }
      let placed = false;
      
      for (const targetSeat of orderedSeats) {
        if (placed) break;
        
        const targetSets = gameState.sets[targetSeat];
        if (!targetSets || !targetSets.length) continue;
        
        // Build fresh grouped data for this target seat
        const groups = groupMeldCards(targetSets);

        for (let gi = 0; gi < groups.length; gi++) {
          if (placed) break;
          
          const g = groups[gi];
          if (!g.length) continue;
          const gid = g[0].groupId;

          // Create a test candidate without modifying anything yet
          const testCard = { ...card };
          
          // If joker, assign representation for testing
          if (testCard.rank === 'JOKER') {
            assignJokerRepresentation(testCard, g);
          }
          
          const candidate = g.concat(testCard);
          
          // Check if adding this card creates a valid meld
          if (!isValidSetGroup(candidate) && !isValidRunGroup(candidate)) {
            continue;
          }

          // Valid placement found - now modify the actual card and state
          if (card.rank === 'JOKER') {
            card.jokerRepRank = testCard.jokerRepRank;
            card.jokerRepSuit = testCard.jokerRepSuit;
          }
          
          card.groupId = gid;
          
          // If playing on another player's set, mark as a goer
          if (targetSeat !== seat) {
            card.isGoer = true;
            if (gameState.goersThisTurn) {
              gameState.goersThisTurn.push(card.id);
            }
          }
          
          // Add card to target seat's sets and remove from hand
          targetSets.push(card);
          hand.splice(hi, 1);

          // Keep the meld visually normalised after a goer is added
          autoSortGroupIfComplete(targetSets, gid);

          placed = true;
          changed = true;
          
          // Immediately re-render the affected seat's meld row to fix goer positioning
          if (targetSeat === 'bottom') {
            renderBottomSetRow();
          } else if (targetSeat === 'top') {
            renderTopSetRow();
          } else if (targetSeat === 'left') {
            renderLeftSetRow();
          } else if (targetSeat === 'right') {
            renderRightSetRow();
          }
        }
      }

      if (placed) {
        // Restart from beginning of hand since we modified it
        break;
      }
    }
  }
}

// Assign joker representations to ALL jokers in a meld group
// Call this after any meld is completed/modified to ensure all jokers have valid representations
function assignAllJokerRepresentationsInGroup(seatSets, groupId) {
  if (!seatSets || !groupId) return;
  
  const groupCards = seatSets.filter(c => c.groupId === groupId);
  const jokers = groupCards.filter(c => c.rank === 'JOKER');
  
  for (const joker of jokers) {
    // ALWAYS re-evaluate and assign representation based on current group state
    // Previous representation might have been incorrect or incomplete
    assignJokerRepresentation(joker, groupCards);
  }
}

// Helper to assign joker representation based on existing meld cards
// This works for melds with 2+ natural cards (the Joker makes the 3rd card)
// IMPORTANT: We analyze ONLY natural cards to infer set vs run, since Joker has no rep yet
function assignJokerRepresentation(joker, existingGroup) {
  if (!joker || joker.rank !== 'JOKER' || !existingGroup || !existingGroup.length) return;
  
  // Get non-joker cards from the group - these are the only reliable cards
  const nonJokers = existingGroup.filter(c => c.rank !== 'JOKER');
  if (nonJokers.length === 0) return;
  
  // Analyze ONLY the natural cards to determine if this is a set or run
  // (We can't use isValidSetGroup/isValidRunGroup because Joker has no representation yet)
  const ranks = nonJokers.map(c => c.rank);
  const suits = nonJokers.map(c => c.suit);
  
  let isSet = false;
  let isRun = false;
  
  // Check if all natural cards have the same rank (forming a set)
  if (ranks.every(r => r === ranks[0])) {
    isSet = true;
  }
  // Check if all natural cards have the same suit (potentially forming a run)
  else if (suits.every(s => s === suits[0])) {
    const indices = ranks.map(r => ACE_HIGH_ORDER.indexOf(r));
    indices.sort((a, b) => a - b);
    // Check if the natural cards span a small enough range for Joker to fill
    const gap = indices[indices.length - 1] - indices[0];
    // Gap should be at most (natural cards + jokers in group - 1) for a valid run
    const jokerCount = existingGroup.filter(c => c.rank === 'JOKER').length;
    if (gap <= nonJokers.length + jokerCount - 1) {
      isRun = true;
    }
  }
  
  if (isSet) {
    // For sets, joker takes the rank of the set and a missing suit
    const rank = nonJokers[0].rank;
    const usedSuits = nonJokers.map(c => c.suit);
    const allSuits = ['C', 'D', 'H', 'S'];
    const missingSuit = allSuits.find(s => !usedSuits.includes(s));
    joker.jokerRepRank = rank;
    joker.jokerRepSuit = missingSuit || 'C';
  } else if (isRun) {
    // For runs, joker takes a missing position in the sequence
    const suit = nonJokers[0].suit;
    const indices = nonJokers.map(c => ACE_HIGH_ORDER.indexOf(c.rank));
    indices.sort((a, b) => a - b);
    
    const minIdx = indices[0];
    const maxIdx = indices[indices.length - 1];
    
    // First, check for gaps in the middle of the sequence
    for (let i = minIdx; i <= maxIdx; i++) {
      if (!indices.includes(i)) {
        joker.jokerRepRank = ACE_HIGH_ORDER[i];
        joker.jokerRepSuit = suit;
        return;
      }
    }
    
    // No gap in middle - extend at the appropriate end
    // Prefer extending at the low end first (so high cards like A-K-Q get J)
    if (minIdx - 1 >= 0) {
      joker.jokerRepRank = ACE_HIGH_ORDER[minIdx - 1];
    } else if (maxIdx + 1 < ACE_HIGH_ORDER.length) {
      joker.jokerRepRank = ACE_HIGH_ORDER[maxIdx + 1];
    }
    joker.jokerRepSuit = suit;
  } else {
    // FALLBACK: Cards don't clearly form a set or run yet
    // Still assign a reasonable representation so the Joker is valid
    // Default to treating as a SET (same rank, different suit)
    // This covers edge cases where the meld is still being built
    const rank = nonJokers[0].rank;
    const usedSuits = nonJokers.map(c => c.suit);
    const allSuits = ['C', 'D', 'H', 'S'];
    const missingSuit = allSuits.find(s => !usedSuits.includes(s));
    joker.jokerRepRank = rank;
    joker.jokerRepSuit = missingSuit || allSuits[0];
  }
}

// ============= JOKER SWAP LOGIC =============
// Joker swaps allow you to take a Joker from any meld by providing the natural card
// The natural card goes into the meld, the Joker comes back to hand

// Check if a card being played can swap a Joker in a meld
// For SETS: You need a card matching the set's rank with a suit not already in the set
// For RUNS: You need the exact card the Joker represents (based on position in run)
function findMatchingJokerInMeld(naturalCard, seatSets, groupId) {
  if (!naturalCard || naturalCard.rank === 'JOKER' || !seatSets || !groupId) return null;
  
  const groupCards = seatSets.filter(c => c.groupId === groupId);
  
  // Find jokers in this group
  const jokers = groupCards.filter(c => c.rank === 'JOKER');
  if (jokers.length === 0) return null;
  
  // Get non-joker cards
  const nonJokers = groupCards.filter(c => c.rank !== 'JOKER');
  if (nonJokers.length === 0) return null;
  
  // Check if it's a set (same rank) or run (same suit consecutive)
  const ranks = nonJokers.map(c => c.rank);
  const suits = nonJokers.map(c => c.suit);
  const isSet = ranks.every(r => r === ranks[0]);
  const isRun = suits.every(s => s === suits[0]);
  
  if (isSet) {
    // For SETS: Natural card must match the set's rank
    const setRank = nonJokers[0].rank;
    if (naturalCard.rank !== setRank) return null;
    
    const presentSuits = new Set(nonJokers.map(c => c.suit));
    const allSuits = ['C', 'D', 'H', 'S'];
    const missingSuits = allSuits.filter(s => !presentSuits.has(s));
    
    // If the natural card's suit is not one of the missing suits, can't swap
    if (!missingSuits.includes(naturalCard.suit)) return null;
    
    // The natural card matches one of the missing suits - swap is valid!
    // Update the Joker's representation to match the card being provided
    const joker = jokers[0];
    joker.jokerRepRank = naturalCard.rank;
    joker.jokerRepSuit = naturalCard.suit;
    return joker;
    
  } else if (isRun) {
    // For RUNS: The Joker represents a specific card in the sequence
    // Check if the natural card matches what the Joker represents
    for (const joker of jokers) {
      if (joker.jokerRepRank === naturalCard.rank && joker.jokerRepSuit === naturalCard.suit) {
        return joker;
      }
    }
    return null;
  }
  
  return null;
}

// Perform a Joker swap - natural card goes into meld, Joker goes to player's SET BOX (not hand)
// The Joker forms a new pending group that can receive cards to form a valid meld
function performJokerSwap(naturalCard, jokerCard, targetSeat, groupId) {
  const seatSets = gameState.sets[targetSeat];
  if (!seatSets) return false;
  
  // Find the joker in the meld
  const jokerIndex = seatSets.findIndex(c => c.id === jokerCard.id);
  if (jokerIndex === -1) return false;
  
  // Get the joker's actual groupId from the array (more reliable than passed parameter)
  const actualGroupId = seatSets[jokerIndex].groupId || groupId;
  if (!actualGroupId) {
    console.error('No groupId found for joker swap');
    return false;
  }
  
  // Initialize pending Joker swaps tracking if needed
  if (!gameState.pendingJokerSwap) {
    gameState.pendingJokerSwap = null;
  }
  
  // Create a new group for the Joker in player's set box
  const newGroupId = 'pending_joker_' + Date.now();
  
  // Store the swap info for potential undo
  gameState.pendingJokerSwap = {
    jokerCard: jokerCard,
    naturalCard: naturalCard,
    originalSeat: targetSeat,
    originalGroupId: actualGroupId,
    originalJokerIndex: jokerIndex,
    newGroupId: newGroupId,
    addedCards: [] // Cards added to the pending Joker group from hand
  };
  
  // Put natural card into the meld at the joker's position with the SAME groupId
  naturalCard.groupId = actualGroupId;
  naturalCard.laidTurn = gameState.currentTurnId || 0;
  naturalCard.isJokerSwapCard = true; // Mark for orange glow
  seatSets[jokerIndex] = naturalCard;
  
  // Move Joker to player's SET BOX (not hand) with new pending group
  jokerCard.jokerRepRank = null;
  jokerCard.jokerRepSuit = null;
  jokerCard.groupId = newGroupId;
  jokerCard.isPendingJoker = true; // Mark as pending for special styling
  jokerCard.laidTurn = gameState.currentTurnId || 0;
  gameState.sets.bottom.push(jokerCard);
  
  // Re-sort the original group to ensure proper card ordering
  autoSortGroupIfComplete(seatSets, actualGroupId);
  
  return true;
}

// Undo a pending Joker swap - returns everything to original positions
function undoPendingJokerSwap() {
  if (!gameState.pendingJokerSwap) {
    return false;
  }
  
  const swap = gameState.pendingJokerSwap;
  const originalSeatSets = gameState.sets[swap.originalSeat];
  const playerSets = gameState.sets.bottom;
  
  // Find and remove the Joker from player's set box
  const jokerIdx = playerSets.findIndex(c => c.id === swap.jokerCard.id);
  if (jokerIdx !== -1) {
    playerSets.splice(jokerIdx, 1);
  }
  
  // Return all cards added to the pending group back to hand
  for (const addedCard of swap.addedCards) {
    const cardIdx = playerSets.findIndex(c => c.id === addedCard.id);
    if (cardIdx !== -1) {
      const card = playerSets.splice(cardIdx, 1)[0];
      card.groupId = null;
      card.isPendingJoker = false;
      gameState.hands.bottom.push(card);
    }
  }
  
  // Find the natural card we put in and remove it
  const naturalIdx = originalSeatSets.findIndex(c => c.id === swap.naturalCard.id);
  if (naturalIdx !== -1) {
    originalSeatSets.splice(naturalIdx, 1);
  }
  
  // Return the natural card to hand
  swap.naturalCard.groupId = null;
  swap.naturalCard.isJokerSwapCard = false;
  gameState.hands.bottom.push(swap.naturalCard);
  
  // Put Joker back in its original position in the original meld
  swap.jokerCard.groupId = swap.originalGroupId;
  swap.jokerCard.isPendingJoker = false;
  swap.jokerCard.jokerRepRank = null;
  swap.jokerCard.jokerRepSuit = null;
  originalSeatSets.push(swap.jokerCard);
  
  // Re-sort the original group
  autoSortGroupIfComplete(originalSeatSets, swap.originalGroupId);
  
  // Update Joker representation in the restored group
  const groupCards = originalSeatSets.filter(c => c.groupId === swap.originalGroupId);
  const jokers = groupCards.filter(c => c.rank === 'JOKER');
  for (const joker of jokers) {
    updateJokerRepresentation(joker, groupCards);
  }
  
  // Clear the pending swap
  gameState.pendingJokerSwap = null;
  
  return true;
}

// Add a card from hand to the pending Joker group
function addCardToPendingJokerGroup(card) {
  if (!gameState.pendingJokerSwap) {
    return false;
  }
  
  const swap = gameState.pendingJokerSwap;
  const hand = gameState.hands.bottom;
  const playerSets = gameState.sets.bottom;
  
  // Remove card from hand
  const idx = hand.findIndex(c => c.id === card.id);
  if (idx === -1) return false;
  hand.splice(idx, 1);
  
  // Add card to the pending group
  card.groupId = swap.newGroupId;
  card.laidTurn = gameState.currentTurnId || 0;
  playerSets.push(card);
  
  // Track that this card was added (for undo)
  swap.addedCards.push(card);
  
  return true;
}

// Check if a pending Joker swap has a valid meld
function isPendingJokerMeldValid() {
  if (!gameState.pendingJokerSwap) return false;
  
  const swap = gameState.pendingJokerSwap;
  const playerSets = gameState.sets.bottom;
  const groupCards = playerSets.filter(c => c.groupId === swap.newGroupId);
  
  // Need at least 3 cards for a valid meld
  if (groupCards.length < 3) return false;
  
  // Check if it forms a valid set or run
  return isValidSet(groupCards) || isValidRun(groupCards);
}

// Check if this is a valid Joker swap attempt
function isValidJokerSwapAttempt(naturalCard, jokerCard, targetSeat) {
  if (!naturalCard || !jokerCard || naturalCard.rank === 'JOKER' || jokerCard.rank !== 'JOKER') {
    return false;
  }
  
  // Check if natural card matches joker's representation
  if (jokerCard.jokerRepRank !== naturalCard.rank || jokerCard.jokerRepSuit !== naturalCard.suit) {
    return false;
  }
  
  return true;
}

// Stage a Joker swap - put natural card in meld, Joker goes to player's hand
// This is STAGED and only validated when player tries to win
// Stage a Joker swap - put natural card in meld, Joker goes to player's hand
// This is STAGED and only validated when player tries to win
function stageJokerSwap(naturalCard, jokerCard, targetSeat, groupId) {
  const seatSets = gameState.sets[targetSeat];
  if (!seatSets) return false;

  // Find the joker in the meld
  const jokerIndex = seatSets.findIndex(c => c.id === jokerCard.id);
  if (jokerIndex === -1) return false;

  // Get the joker's actual groupId from the array (more reliable than passed parameter)
  const actualGroupId = seatSets[jokerIndex].groupId || groupId;
  if (!actualGroupId) {
    console.error('No groupId found for joker swap');
    return false;
  }

  // First joker swap in this OUT attempt: take a snapshot
  if (!gameState.winAttemptSnapshot) {
    gameState.winAttemptSnapshot = createGameStateSnapshot();
    gameState.stagedJokerSwaps = [];
  }

  // Record the swap for possible rollback (we only really need ids here)
  gameState.stagedJokerSwaps.push({
    jokerCardId: jokerCard.id,
    naturalCardId: naturalCard.id,
    targetSeat,
    groupId: actualGroupId,
    jokerIndex
  });

  // Mark both cards as part of a joker swap (orange glow)
  naturalCard.isJokerSwapCard = true;
  jokerCard.isJokerSwapCard = true;

  // Put natural card into the meld at the joker's position with the SAME groupId
  naturalCard.groupId = actualGroupId;
  naturalCard.laidTurn = gameState.currentTurnId || 0;
  seatSets[jokerIndex] = naturalCard;

  // Move joker back to player's hand (free – no special group, no lock)
  jokerCard.jokerRepRank = null;
  jokerCard.jokerRepSuit = null;
  jokerCard.groupId = null;
  jokerCard.laidTurn = gameState.currentTurnId || 0;
  gameState.hands.bottom.push(jokerCard);

  // Re-sort and re-assign joker reps in the target meld
  autoSortGroupIfComplete(seatSets, actualGroupId);
  assignAllJokerRepresentationsInGroup(seatSets, actualGroupId);

  return true;
}




// Create a snapshot of the game state for rollback
function createGameStateSnapshot() {
  return {
    hands: {
      bottom: gameState.hands.bottom.map(c => ({ ...c })),
      top: gameState.hands.top.map(c => ({ ...c })),
      left: gameState.hands.left.map(c => ({ ...c })),
      right: gameState.hands.right.map(c => ({ ...c }))
    },
    sets: {
      bottom: gameState.sets.bottom.map(c => ({ ...c })),
      top: gameState.sets.top.map(c => ({ ...c })),
      left: gameState.sets.left.map(c => ({ ...c })),
      right: gameState.sets.right.map(c => ({ ...c }))
    }
  };
}

// Rollback all staged Joker swaps
function rollbackJokerSwaps() {
  if (!gameState.winAttemptSnapshot) return;
  
  // Restore hands and sets from snapshot
  gameState.hands.bottom = gameState.winAttemptSnapshot.hands.bottom;
  gameState.hands.top = gameState.winAttemptSnapshot.hands.top;
  gameState.hands.left = gameState.winAttemptSnapshot.hands.left;
  gameState.hands.right = gameState.winAttemptSnapshot.hands.right;
  
  gameState.sets.bottom = gameState.winAttemptSnapshot.sets.bottom;
  gameState.sets.top = gameState.winAttemptSnapshot.sets.top;
  gameState.sets.left = gameState.winAttemptSnapshot.sets.left;
  gameState.sets.right = gameState.winAttemptSnapshot.sets.right;
  
  // Clear staged swaps
  gameState.stagedJokerSwaps = [];
  gameState.winAttemptSnapshot = null;
  
  // Re-render
  renderBottomHand();
  renderBottomSetRow();
  renderTopSetRow();
  renderLeftSetRow();
  renderRightSetRow();
  renderMiniHands();
}

// Clear staged swaps after successful win
function clearStagedJokerSwaps() {
  gameState.stagedJokerSwaps = [];
  gameState.winAttemptSnapshot = null;
}

// Validate Joker swap for SET (need BOTH copies from 2 decks)
function validateSetJokerSwap(naturalCard, groupCards) {
  // For sets, you need BOTH natural copies of the card to swap
  // Count how many copies of this exact card are in the meld after swap
  const sameCardCount = groupCards.filter(c => 
    c.rank === naturalCard.rank && c.suit === naturalCard.suit
  ).length;
  
  // Since we're using 2 decks, sets can have duplicates from both decks
  // For a valid set swap, the set should remain valid after the swap
  // The rule says: you need both natural copies, but we only have one deck implemented
  // For now, just validate that the resulting set is valid
  // Use allowExtended=true since melds may have been extended with goers
  return isValidSetGroup(groupCards, true);
}

// Validate Joker swap for RUN (need exact natural card)
function validateRunJokerSwap(naturalCard, groupCards) {
  // For runs, you just need the exact natural card the Joker represents
  // Validate the resulting run is valid
  // Use allowExtended=true since melds may have been extended with goers
  return isValidRunGroup(groupCards, true);
}

// After manual or bot changes, auto-sort a complete set/run so that
// runs are in ASCENDING order (low to high: 3,4,5,6) and sets by suit.
function autoSortGroupIfComplete(seatSets, groupId) {
  if (!seatSets || !groupId) return;

  const groupCards = seatSets.filter(c => c.groupId === groupId);
  if (!groupCards || groupCards.length < 3) return;

  // Use allowExtended=true since melds may have been extended with goers
  const isRun = isValidRunGroup(groupCards, true);
  const isSet = !isRun && isValidSetGroup(groupCards, true);
  if (!isRun && !isSet) return;

  const rankIndex = (card) => {
    const r = effectiveRank(card);
    const idx = ACE_HIGH_ORDER.indexOf(r);
    return idx === -1 ? -1 : idx;
  };

  const suitIndex = (card) => {
    const s = effectiveSuit(card);
    if (!s) return 4;
    const order = ['C', 'D', 'H', 'S'];
    const idx = order.indexOf(s[0].toUpperCase());
    return idx === -1 ? 4 : idx;
  };

  const sorted = groupCards.slice().sort((a, b) => {
    const ra = rankIndex(a);
    const rb = rankIndex(b);
    
    if (isRun) {
      // For RUNS: sort ASCENDING by rank (low to high: 3,4,5,6)
      if (ra !== rb) {
        return ra - rb;
      }
    } else if (isSet) {
      // For SETS: all cards have same rank, sort by suit order (C,D,H,S)
      const sa = suitIndex(a);
      const sb = suitIndex(b);
      if (sa !== sb) return sa - sb;
    }

    return seatSets.indexOf(a) - seatSets.indexOf(b);
  });

  let gi = 0;
  for (let i = 0; i < seatSets.length; i++) {
    if (seatSets[i].groupId === groupId) {
      seatSets[i] = sorted[gi++];
    }
  }
}

function isVerticalSeat(seat) {
  return seat === 'left' || seat === 'right';
}

function renderSeatSetRow(seat, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';

  const cards = gameState.sets[seat] || [];
  const groups = groupMeldCards(cards);

  // Separate pending Joker group from regular melds (for bottom seat)
  let pendingJokerGroupData = null;
  let pendingJokerGroupIndex = -1;
  
  if (seat === 'bottom' && gameState.pendingJokerSwap) {
    const pendingGroupId = gameState.pendingJokerSwap.newGroupId;
    pendingJokerGroupIndex = groups.findIndex(g => g.some(c => c.groupId === pendingGroupId));
    if (pendingJokerGroupIndex >= 0) {
      pendingJokerGroupData = groups[pendingJokerGroupIndex];
    }
  }

  // Render regular melds first (skipping pending Joker group)
  groups.forEach((group, groupIndex) => {
    // Skip the pending Joker group - it will be rendered at the end
    if (groupIndex === pendingJokerGroupIndex) return;
    
    const groupEl = document.createElement('div');
    groupEl.classList.add('set-group', 'meld-group');
    if (isVerticalSeat(seat)) {
      groupEl.classList.add('set-group-vert');
    }
    
    group.forEach((card, index) => {
      const cardEl = createSetCardElement(card, seat);
      if (index === 0) {
        cardEl.classList.add('set-card-first');
      }
      groupEl.appendChild(cardEl);
    });

    el.appendChild(groupEl);
  });

  // Render pending Joker group LAST (at the end, with visual separation)
  if (pendingJokerGroupData) {
    // Add a spacer for visual separation
    const spacer = document.createElement('div');
    spacer.classList.add('pending-joker-spacer');
    el.appendChild(spacer);
    
    const groupEl = document.createElement('div');
    groupEl.classList.add('set-group', 'meld-group', 'pending-joker-group');
    if (isVerticalSeat(seat)) {
      groupEl.classList.add('set-group-vert');
    }
    groupEl.dataset.pendingJoker = 'true';
    
    // Add double-click handler for undo
    groupEl.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      if (gameState.pendingJokerSwap && gameState.hasDrawn && !gameState.hasDiscardedThisTurn) {
        if (undoPendingJokerSwap()) {
          setStatus('Joker swap undone. Cards returned to original positions.');
          playSound('discard');
          renderAll();
        }
      }
    });

    pendingJokerGroupData.forEach((card, index) => {
      const cardEl = createSetCardElement(card, seat);
      if (index === 0) {
        cardEl.classList.add('set-card-first');
      }
      cardEl.classList.add('pending-joker-card');
      groupEl.appendChild(cardEl);
    });

    el.appendChild(groupEl);
  }
}

function renderBottomSetRow() {
  renderSeatSetRow('bottom', 'set-bottom');
}

function renderTopSetRow() {
  renderSeatSetRow('top', 'set-top');
}

function renderLeftSetRow() {
  renderSeatSetRow('left', 'set-left');
}

function renderRightSetRow() {
  renderSeatSetRow('right', 'set-right');
}

function renderMiniHands() {
  const topEl = document.getElementById('mini-top');
  const leftEl = document.getElementById('mini-left');
  const rightEl = document.getElementById('mini-right');

  topEl.innerHTML = '';
  leftEl.innerHTML = '';
  rightEl.innerHTML = '';

  const miniFor = (container, count) => {
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.classList.add('mini-card');
      container.appendChild(div);
    }
  };

  miniFor(topEl, gameState.hands.top.length);
  miniFor(leftEl, gameState.hands.left.length);
  miniFor(rightEl, gameState.hands.right.length);
}

// Store random positions for pack cards
const packCardPositions = new Map();

function getRandomPackPosition(cardId) {
  if (!packCardPositions.has(cardId)) {
    // Random position within the pack area - much more spread out, any angle
    const x = Math.random() * 140 - 70;   // -70 to +70 px (wider scatter)
    const y = Math.random() * 120 - 60;   // -60 to +60 px (taller scatter)
    const rotation = Math.random() * 360; // 0–360 degrees, fully random orientation
    packCardPositions.set(cardId, { x, y, rotation });
  }
  return packCardPositions.get(cardId);
}

function renderAll() {
  renderBottomHand();
  renderMiniHands();
  renderBottomSetRow();
  renderTopSetRow();
  renderLeftSetRow();
  renderRightSetRow();
  renderPiles();
}

function renderPiles() {
  const deckEl = document.getElementById('deckPile');
  const packEl = document.getElementById('packPile');
  const packAreaEl = document.getElementById('packArea');
  if (!deckEl || !packEl) return;

  // Show card back on deck if there are cards
  if (gameState.deck && gameState.deck.length > 0) {
    deckEl.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
    deckEl.style.backgroundSize = 'cover';
    deckEl.style.backgroundPosition = 'center';
  } else {
    deckEl.style.backgroundImage = 'none';
  }

  // Hide the original packPile element (we use packArea now)
  packEl.style.backgroundImage = 'none';

  // Render scattered pack cards
  if (packAreaEl) {
    packAreaEl.innerHTML = '';
    
    if (gameState.pack && gameState.pack.length > 0) {
      gameState.pack.forEach((card, index) => {
        const isTopCard = index === gameState.pack.length - 1;
        const pos = getRandomPackPosition(card.id);
        
        const cardEl = document.createElement('div');
        cardEl.className = 'pack-card' + (isTopCard ? ' top-card' : '');
        cardEl.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
        cardEl.style.left = pos.x + 'px';
        cardEl.style.top = pos.y + 'px';
        cardEl.style.transform = `rotate(${pos.rotation}deg)`;
        cardEl.style.zIndex = index;
        
        // Only top card is clickable for drawing
        if (isTopCard) {
          cardEl.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            drawPackCardDirectToBottomMeld();
          });
        }
        
        packAreaEl.appendChild(cardEl);
      });
    }
  }
}

// Animate discard using a pre-captured rect (for multiplayer where DOM may change)
function animateDiscardFromCapturedRect(card, capturedRect, seat, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const packRect = packAreaEl.getBoundingClientRect();
  
  // Calculate start position from captured rect
  let startX, startY;
  if (capturedRect) {
    if (seat === 'bottom') {
      // For bottom player, use exact card position
      startX = capturedRect.left;
      startY = capturedRect.top;
    } else {
      // For other seats, center of mini-hand
      startX = capturedRect.left + capturedRect.width / 2 - 50;
      startY = capturedRect.top + capturedRect.height / 2 - 75;
    }
  } else {
    // Fallback
    startX = packRect.left + 50;
    startY = packRect.top + 50;
  }
  
  // Create flying card - SAME as solo mode
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
  flyingCard.style.left = startX + 'px';
  flyingCard.style.top = startY + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow
  flyingCard.offsetHeight;
  
  // Random end position in pack
  const endX = packRect.left + Math.random() * 80 - 10;
  const endY = packRect.top + Math.random() * 60 - 5;
  const endRotation = (Math.random() - 0.5) * 50;
  
  // Store position
  if (card.id) {
    packCardPositions.set(card.id, { 
      x: endX - packRect.left, 
      y: endY - packRect.top, 
      rotation: endRotation 
    });
  }
  
  // Animate
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });
  
  // Clean up
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

// Core discard animation function - works for ANY seat
// This is the single source of truth for discard animations
function animateDiscardCore(seat, card, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const packRect = packAreaEl.getBoundingClientRect();
  
  // Try to find the exact card element in the DOM for precise positioning
  let startX, startY;
  let foundCard = false;
  
  if (seat === 'bottom') {
    // For bottom player, try to find the actual card element by ID or code
    const handEl = document.getElementById('hand-bottom');
    if (handEl && card) {
      const cardEls = handEl.querySelectorAll('.card');
      for (const cardEl of cardEls) {
        // Check if this is the card being discarded (by data-id or data-code)
        const cardId = cardEl.getAttribute('data-id');
        const cardCode = cardEl.getAttribute('data-code');
        if ((card.id && cardId === card.id) || (card.code && cardCode === card.code)) {
          const cardRect = cardEl.getBoundingClientRect();
          startX = cardRect.left;
          startY = cardRect.top;
          foundCard = true;
          break;
        }
      }
      // Fallback to last card in hand if specific card not found
      if (!foundCard && cardEls.length > 0) {
        const lastCard = cardEls[cardEls.length - 1];
        const lastCardRect = lastCard.getBoundingClientRect();
        startX = lastCardRect.left;
        startY = lastCardRect.top;
        foundCard = true;
      }
    }
    // Final fallback to hand center
    if (!foundCard && handEl) {
      const handRect = handEl.getBoundingClientRect();
      startX = handRect.left + handRect.width / 2 - 50;
      startY = handRect.top;
    }
  } else {
    // For other seats, use mini-hand center (no individual cards visible)
    const miniEl = document.getElementById(`mini-${seat}`);
    if (miniEl) {
      const miniRect = miniEl.getBoundingClientRect();
      startX = miniRect.left + miniRect.width / 2 - 50;
      startY = miniRect.top + miniRect.height / 2 - 75;
    }
  }
  
  // Default fallback
  if (startX === undefined) {
    startX = packRect.left + 50;
    startY = packRect.top + 50;
  }
  
  // Create flying card with the EXACT same class as solo mode
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
  flyingCard.style.left = startX + 'px';
  flyingCard.style.top = startY + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow to ensure starting position is applied
  flyingCard.offsetHeight;
  
  // Calculate random end position within pack area - more spread out
  const endX = packRect.left + Math.random() * 80 - 10;
  const endY = packRect.top + Math.random() * 60 - 5;
  const endRotation = (Math.random() - 0.5) * 50;
  
  // Store this position for the card
  if (card.id) {
    packCardPositions.set(card.id, { 
      x: endX - packRect.left, 
      y: endY - packRect.top, 
      rotation: endRotation 
    });
  }
  
  // Animate to destination
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

// Original rect-based function - kept for internal use
function animateDiscardFromRect(card, fromRect, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }

  const packRect = packAreaEl.getBoundingClientRect();

  // Create flying card
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;

  // Start position from saved rect
  if (fromRect) {
    flyingCard.style.left = fromRect.left + 'px';
    flyingCard.style.top = fromRect.top + 'px';
  } else {
    flyingCard.style.left = (packRect.left + 50) + 'px';
    flyingCard.style.top = (packRect.top + 50) + 'px';
  }

  document.body.appendChild(flyingCard);
  
  // Force reflow to ensure starting position is applied
  flyingCard.offsetHeight;

  // Calculate random end position within pack area - more spread out
  const endX = packRect.left + Math.random() * 80 - 10;
  const endY = packRect.top + Math.random() * 60 - 5;
  const endRotation = (Math.random() - 0.5) * 50;

  // Store this position for the card
  packCardPositions.set(card.id, { 
    x: endX - packRect.left, 
    y: endY - packRect.top, 
    rotation: endRotation 
  });

  // Animate to destination
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });

  // Clean up and complete
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

// Wrapper for backward compatibility - solo mode discard
function animateDiscard(card, fromElement, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }

  // Get start position from the card element or hand area
  const fromRect = fromElement ? fromElement.getBoundingClientRect() : null;
  
  // Use the rect-based function
  animateDiscardFromRect(card, fromRect, onComplete);
}

// Clockwise seat order around the table (from bottom's perspective)
// bottom -> left -> top -> right -> bottom
const CLOCKWISE_SEATS = ['bottom', 'left', 'top', 'right'];

// Randomly select a dealer for the new game
function selectRandomDealer() {
  const randomIndex = Math.floor(Math.random() * CLOCKWISE_SEATS.length);
  return CLOCKWISE_SEATS[randomIndex];
}

// Get the player to the left of the dealer (who goes first)
// In clockwise order, the next player is to the dealer's left
function getFirstPlayer(dealer) {
  const dealerIndex = CLOCKWISE_SEATS.indexOf(dealer);
  const firstPlayerIndex = (dealerIndex + 1) % 4;
  return CLOCKWISE_SEATS[firstPlayerIndex];
}

// Get dealer display name from the actual label on the table
function getDealerName(seat) {
  const labelId = seat === 'bottom' ? 'label-bottom' :
                  seat === 'top' ? 'label-top' :
                  seat === 'left' ? 'label-left' :
                  seat === 'right' ? 'label-right' : null;
  
  if (labelId) {
    const labelEl = document.getElementById(labelId);
    if (labelEl && labelEl.textContent) {
      return labelEl.textContent;
    }
  }
  
  // Fallback to default names
  if (seat === 'bottom') return playerName || 'You';
  if (seat === 'top') return 'Bot 1';
  if (seat === 'left') return 'Bot 2';
  if (seat === 'right') return 'Bot 3';
  return seat;
}

function clearAllHands() {
  ['bottom','top','left','right'].forEach(seat => {
    gameState.hands[seat] = [];
    gameState.sets[seat] = [];
  });
  gameState.deck = [];
  gameState.pack = [];
  packCardPositions.clear(); // Clear saved positions for new game
  
  // Randomly select dealer and first player
  gameState.currentDealer = selectRandomDealer();
  gameState.turnSeat = getFirstPlayer(gameState.currentDealer);
  gameState.hasDrawn = false;
  gameState.lastDrawSource = null;
  gameState.lastPackCardId = null;
  gameState.lastDiscardSource = null;
  gameState.lastDiscardCardId = null;
  gameState.lastDiscardSeat = null;
  gameState.currentTurnId = 0;
  gameState.hasDiscardedThisTurn = false;
  gameState.draggingCardId = null;
  gameState.nextGroupId = 1;
  gameState.stagedJokerSwaps = [];
  gameState.winAttemptSnapshot = null;
  gameState.pendingJokerSwap = null;  // Clear any pending Joker swap
  
  gameState.opened = {
    bottom: false,
    top: false,
    left: false,
    right: false
  };
  gameState.eliminated = {
    bottom: false,
    top: false,
    left: false,
    right: false
  };
  gameState.invalidMelds = {
    bottom: [],
    top: [],
    left: [],
    right: []
  };
  gameState.goersThisTurn = [];
  
  // Reset IN voting for new game
  resetInVoting();

  document.getElementById('hand-bottom').innerHTML = '';
  document.getElementById('mini-top').innerHTML = '';
  document.getElementById('mini-left').innerHTML = '';
  document.getElementById('mini-right').innerHTML = '';
  document.getElementById('set-bottom').innerHTML = '';
  document.getElementById('set-top').innerHTML = '';
  document.getElementById('set-left').innerHTML = '';
  document.getElementById('set-right').innerHTML = '';

  renderPiles();
  setStatus('');
}

function dealInitialHands() {
  gameState.deck = buildDeck();

  // Prepare cards to deal (52 cards, 13 per player)
  // Deal starting from the first player (to the left of dealer), going clockwise
  const cardsToDeal = [];
  const firstPlayer = gameState.turnSeat || 'bottom';
  const startIndex = CLOCKWISE_SEATS.indexOf(firstPlayer);
  
  // Build deal order starting from first player, going clockwise
  const dealOrder = [];
  for (let i = 0; i < 4; i++) {
    dealOrder.push(CLOCKWISE_SEATS[(startIndex + i) % 4]);
  }
  
  for (let i = 0; i < 13 * 4; i++) {
    const seat = dealOrder[i % 4];
    const card = gameState.deck.shift();
    cardsToDeal.push({ card, seat });
  }

  // Pack starts empty - first discard comes AFTER dealing
  gameState.pack = [];

  // Reset card tracking for the new hand
  resetCardTracking();

  // Clear hands initially
  ['bottom', 'top', 'left', 'right'].forEach(seat => {
    gameState.hands[seat] = [];
  });

  // Render empty state first
  renderBottomHand();
  renderMiniHands();
  renderBottomSetRow();
  renderTopSetRow();
  renderLeftSetRow();
  renderRightSetRow();
  renderPiles();

  const dealerName = getDealerName(gameState.currentDealer);
  setStatus(`${dealerName} is dealing. Shuffling...`);

  // Show dealer indicator with orange glow
  showDealerIndicator(gameState.currentDealer, dealerName);

  // Play shuffle sound and show shuffle animation
  playSound('shuffle');
  showShuffleAnimation(() => {
    setStatus('Dealing cards...');
    playSound('deal');
    
    // Animate dealing, then flip first card to pack
    animateDeal(cardsToDeal, 0, () => {
      // Hide dealer indicator when dealing is complete
      hideDealerIndicator();
      // After all cards dealt, flip one card from deck to start the pack
      const firstDiscard = gameState.deck.shift();
      if (firstDiscard) {
        playSound('cardFlip');
        animateFirstPackCard(firstDiscard, () => {
          gameState.pack = [firstDiscard];
          renderPiles();
          
          // First player is already set in clearAllHands
          gameState.hasDrawn = false;
          gameState.lastDrawSource = null;
          gameState.lastPackCardId = null;

          updateActiveTurnGlow();
          
          const firstPlayerName = getDealerName(gameState.turnSeat);
          if (gameState.turnSeat === 'bottom' && !demoMode) {
            setStatus('Game started. Your turn: draw from DECK or PACK.');
          } else {
            const statusMsg = demoMode ? `Demo Mode: ${firstPlayerName} plays first.` : `Game started. ${firstPlayerName} plays first.`;
            setStatus(statusMsg);
            // If a bot starts (or demo mode), run the bot turns (using tracked timeout)
            setGameTimeout(() => runBotsUntilBottomOrEnd(), getAnimDuration(BASE_ANIM.betweenBots));
          }
        });
      } else {
        gameState.hasDrawn = false;
        gameState.lastDrawSource = null;
        gameState.lastPackCardId = null;

        updateActiveTurnGlow();
        
        const firstPlayerName = getDealerName(gameState.turnSeat);
        if (gameState.turnSeat === 'bottom' && !demoMode) {
          setStatus('Game started. Your turn: draw from DECK or PACK.');
        } else {
          const statusMsg = demoMode ? `Demo Mode: ${firstPlayerName} plays first.` : `Game started. ${firstPlayerName} plays first.`;
          setStatus(statusMsg);
          setGameTimeout(() => runBotsUntilBottomOrEnd(), getAnimDuration(BASE_ANIM.betweenBots));
        }
      }
    });
  });
}

function animateFirstPackCard(card, onComplete) {
  const deckEl = document.getElementById('deckPile');
  const packAreaEl = document.getElementById('packArea');
  
  if (!deckEl || !packAreaEl) {
    if (onComplete) onComplete();
    return;
  }

  const deckRect = deckEl.getBoundingClientRect();
  const packRect = packAreaEl.getBoundingClientRect();

  // Create flying card (starts as card back, then shows face)
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  flyingCard.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
  flyingCard.style.left = (deckRect.left + deckRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (deckRect.top + deckRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);

  // Calculate end position (center of pack area with some randomness)
  const endX = packRect.left + 35 + (Math.random() - 0.5) * 20;
  const endY = packRect.top + 25 + (Math.random() - 0.5) * 20;
  const endRotation = (Math.random() - 0.5) * 30;

  // Store this position for the card
  packCardPositions.set(card.id, { 
    x: endX - packRect.left, 
    y: endY - packRect.top, 
    rotation: endRotation 
  });

  // Show card face and animate to pack
  requestAnimationFrame(() => {
    flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });

  // Clean up and complete
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.firstPack));
}

function animateDeal(cardsToDeal, index, onComplete) {
  if (index >= cardsToDeal.length) {
    if (onComplete) onComplete();
    return;
  }

  const { card, seat } = cardsToDeal[index];

  // Get deck position for starting point
  const deckEl = document.getElementById('deckPile');
  const deckRect = deckEl.getBoundingClientRect();
  const startX = deckRect.left + deckRect.width / 2;
  const startY = deckRect.top + deckRect.height / 2;

  // Get target position based on seat
  let targetEl, targetRect, endX, endY;

  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
    targetRect = targetEl.getBoundingClientRect();
    // Position cards spread across the hand area
    const cardIndex = gameState.hands.bottom.length;
    endX = targetRect.left + 20 + (cardIndex * 45);
    endY = targetRect.top + targetRect.height / 2;
  } else if (seat === 'top') {
    targetEl = document.getElementById('mini-top');
    targetRect = targetEl.getBoundingClientRect();
    const cardIndex = gameState.hands.top.length;
    endX = targetRect.left + 10 + (cardIndex * 30);
    endY = targetRect.top + targetRect.height / 2;
  } else if (seat === 'left') {
    targetEl = document.getElementById('mini-left');
    targetRect = targetEl.getBoundingClientRect();
    const cardIndex = gameState.hands.left.length;
    endX = targetRect.left + targetRect.width / 2;
    endY = targetRect.top + 20 + (cardIndex * 28);
  } else if (seat === 'right') {
    targetEl = document.getElementById('mini-right');
    targetRect = targetEl.getBoundingClientRect();
    const cardIndex = gameState.hands.right.length;
    endX = targetRect.left + targetRect.width / 2;
    endY = targetRect.top + 20 + (cardIndex * 28);
  }

  // Create animated card element - ALL cards use standard 100x150 size
  const dealCard = document.createElement('div');
  dealCard.className = seat === 'bottom' ? 'dealing-card to-player' : 'dealing-card to-bot';

  // For player's cards, show the card face
  if (seat === 'bottom') {
    dealCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
  }

  // Position at deck - all cards use standard 100x150 size (offset 50, 75)
  dealCard.style.left = (startX - 50) + 'px';
  dealCard.style.top = (startY - 75) + 'px';
  document.body.appendChild(dealCard);

  // Play deal sound for each card
  playSound('deal');

  // Trigger animation to target - all cards use standard size offsets
  requestAnimationFrame(() => {
    dealCard.style.left = (endX - 50) + 'px';
    dealCard.style.top = (endY - 75) + 'px';

    if (seat !== 'bottom') {
      dealCard.style.transform = (seat === 'left' || seat === 'right') ? 'rotate(90deg)' : '';
    }
  });

  // After animation, add card to hand and remove animated element
  setTimeout(() => {
    dealCard.remove();
    gameState.hands[seat].push(card);

    // Re-render the appropriate area
    if (seat === 'bottom') {
      renderBottomHand();
    } else {
      renderMiniHands();
    }

    // Deal next card
    animateDeal(cardsToDeal, index + 1, onComplete);
  }, getAnimDuration(BASE_ANIM.deal));
}

// Show dealer indicator with orange glow on their set box
function showDealerIndicator(dealerSeat, dealerName) {
  // Get the set row element for the dealer
  const setRowId = dealerSeat === 'bottom' ? 'set-bottom' :
                   dealerSeat === 'top' ? 'set-top' :
                   dealerSeat === 'left' ? 'set-left' :
                   'set-right';
  
  const setRow = document.getElementById(setRowId);
  if (!setRow) return;
  
  // Add orange glow class
  setRow.classList.add('dealer-active');
  
  // Create and add the dealer indicator text
  const indicator = document.createElement('div');
  indicator.className = 'dealer-indicator';
  indicator.id = 'dealerIndicator';
  // Use proper grammar - "is dealing" for bots/names, but could also just use the name
  indicator.textContent = `${dealerName} is dealing`;
  setRow.appendChild(indicator);
}

// Hide dealer indicator and remove orange glow
function hideDealerIndicator() {
  // Remove the indicator text
  const indicator = document.getElementById('dealerIndicator');
  if (indicator) {
    indicator.remove();
  }
  
  // Remove orange glow from all set rows
  ['set-bottom', 'set-top', 'set-left', 'set-right'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('dealer-active');
    }
  });
}

// Check if a pointer drop is over a set zone and handle it
// Returns true if drop was handled (or rejected with message), false if not over a set zone
function checkSetZoneDrop(clientX, clientY, card) {
  const seats = ['bottom', 'top', 'left', 'right'];
  
  for (const seat of seats) {
    const zone = document.getElementById(`set-${seat}`);
    if (!zone) continue;
    
    const rect = zone.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && 
        clientY >= rect.top && clientY <= rect.bottom) {
      // Cursor is over this set zone - handle the drop
      return handleSetZonePointerDrop(seat, clientX, clientY, card);
    }
  }
  
  return false; // Not over any set zone
}

// Handle a pointer-based drop on a set zone
function handleSetZonePointerDrop(seat, clientX, clientY, card) {
  if (!DEBUG_MODE) {
    if (!isBottomTurn()) {
      setStatus('It is not your turn.');
      return true; // Handled (rejected)
    }
    if (!gameState.hasDrawn) {
      setStatus('You must draw from DECK or PACK before laying a card.');
      return true; // Handled (rejected)
    }
  }
  
  // Check drop target position for set zone interactions
  const elemAtPoint = document.elementFromPoint(clientX, clientY);
  const targetGroup = elemAtPoint ? elemAtPoint.closest('.meld-group') : null;
  
  const hand = gameState.hands.bottom;
  const idx = hand.findIndex(c => c.id === card.id);
  if (idx === -1) return true; // Card not in hand
  
  // FIRST: Check if dropping onto the pending Joker group (to build a meld around the Joker)
  // This must be checked BEFORE Joker swap logic to allow adding cards to the pending group
  if (seat === 'bottom' && gameState.pendingJokerSwap) {
    const pendingGroupId = gameState.pendingJokerSwap.newGroupId;
    const targetCardEl = elemAtPoint ? elemAtPoint.closest('.set-card') : null;
    const targetMeldGroup = elemAtPoint ? elemAtPoint.closest('.meld-group') : null;
    
    // Check if target is the pending Joker group
    let isTargetingPendingGroup = false;
    if (targetCardEl) {
      const targetCardId = targetCardEl.dataset.cardId;
      const playerSets = gameState.sets.bottom;
      const targetCard = playerSets.find(c => c.id === targetCardId);
      if (targetCard && targetCard.groupId === pendingGroupId) {
        isTargetingPendingGroup = true;
      }
    } else if (targetMeldGroup && targetMeldGroup.dataset.pendingJoker === 'true') {
      isTargetingPendingGroup = true;
    }
    
    if (isTargetingPendingGroup) {
      // Add the card to the pending Joker group
      if (addCardToPendingJokerGroup(card)) {
        setStatus('Card added to Joker meld. Continue adding cards or double-click to undo.');
        playSound('discard');
        renderBottomHand();
        renderBottomSetRow();
        renderMiniHands();
        return true;
      }
    }
  }
  
  // Check if this is a Joker swap attempt
  if (card.rank !== 'JOKER') {
    const seatSets = gameState.sets[seat];
    if (seatSets && seatSets.length > 0) {
      // Find the group being dropped onto
      const targetCardEl = elemAtPoint ? elemAtPoint.closest('.set-card') : null;
      if (targetCardEl) {
        const targetCardId = targetCardEl.dataset.cardId;
        const targetCard = seatSets.find(c => c.id === targetCardId);
        if (targetCard && targetCard.groupId) {
          // Skip Joker swap check if targeting the pending Joker group
          const isPendingGroup = gameState.pendingJokerSwap && 
                                 targetCard.groupId === gameState.pendingJokerSwap.newGroupId;
          
          if (!isPendingGroup) {
            // Check if there's a Joker in this group that matches our natural card
            const matchingJoker = findMatchingJokerInMeld(card, seatSets, targetCard.groupId);
            if (matchingJoker) {
              // Validate the joker object
              if (!matchingJoker || !matchingJoker.id || matchingJoker.rank !== 'JOKER') {
                console.error('Invalid joker card in swap:', matchingJoker);
                return true;
              }

              // Joker swap is only valid when going out to WIN
              // (hand-size restriction temporarily disabled for movement testing)
// Remove the natural card from hand
              hand.splice(idx, 1);

              // Stage the swap: natural card into meld, Joker to your HAND (no locked group)
              if (!stageJokerSwap(card, matchingJoker, seat, targetCard.groupId)) {
                // Put card back if anything goes wrong
                hand.splice(idx, 0, card);
                setStatus('Joker swap failed.');
                return true;
              }

              setStatus('Joker swapped to your hand. You must go OUT this turn or the swap will be rolled back.');
              playSound('draw');

              renderBottomHand();
              renderBottomSetRow();
              if (seat === 'top') {
                renderTopSetRow();
              } else if (seat === 'left') {
                renderLeftSetRow();
              } else if (seat === 'right') {
                renderRightSetRow();
              }
              renderMiniHands();
              return true;
            }

          }
        }
      }
    }
  }
  
  // Normal card placement (not a Joker swap)
  
  // Remove from hand first
  hand.splice(idx, 1);
  
  if (gameState.lastDrawSource === 'pack' && gameState.lastPackCardId === card.id) {
    // PACK card now used in a meld; rule is enforced via discard checks.
  }
  
  card.laidTurn = gameState.currentTurnId || 0;
  
  // If playing on another player's set, mark as a goer (yellow glow)
  if (seat !== 'bottom') {
    card.isGoer = true;
    gameState.goersThisTurn.push(card.id);
  }
  
  // Capture existing groupIds in this seat BEFORE placement
  const existingGroupIds = new Set(
    (gameState.sets[seat] || [])
      .filter(c => c.groupId)
      .map(c => c.groupId)
  );
  
  // Create a mock event object for placeCardIntoSetRow
  const mockEvent = { clientX: clientX, clientY: clientY };
  placeCardIntoSetRow(card, seat, mockEvent);
  
  // In multiplayer mode, emit to server ONLY if extending an existing meld
  // We know it's an existing meld if the groupId was already present before placement
  const isExtendingExisting = card.groupId && existingGroupIds.has(card.groupId);
  
  if (multiplayerMode && isExtendingExisting) {
    // Store full card object for potential rollback
    if (!gameState.pendingExtendMelds) {
      gameState.pendingExtendMelds = {};
    }
    gameState.pendingExtendMelds[card.id] = { ...card };
    
    // Emit to server - use the groupId that was assigned by the same logic as solo mode
    mpExtendMeld(card.id, seat, card.groupId);
  }
  
  renderBottomHand();
  
  if (seat === 'bottom') {
    renderBottomSetRow();
  } else if (seat === 'top') {
    renderTopSetRow();
  } else if (seat === 'left') {
    renderLeftSetRow();
  } else if (seat === 'right') {
    renderRightSetRow();
  }
  renderMiniHands();
  
  playSound('discard'); // Sound feedback for placing card
  
  return true; // Drop was handled
}

function placeCardIntoSetRow(card, seat, dropEvent) {
  const seatSets = gameState.sets[seat];
  if (!seatSets) return;

  const clientX = dropEvent ? dropEvent.clientX : null;
  const clientY = dropEvent ? dropEvent.clientY : null;
  
  // Get pending Joker group ID to exclude from auto-attachment
  const pendingJokerGroupId = (seat === 'bottom' && gameState.pendingJokerSwap) 
    ? gameState.pendingJokerSwap.newGroupId 
    : null;
  
  // Helper to check if a card element belongs to the pending Joker group
  const isPendingJokerCard = (cardEl) => {
    if (!pendingJokerGroupId) return false;
    return cardEl.classList.contains('pending-joker-card') || 
           cardEl.closest('.pending-joker-group') !== null;
  };

  let targetCardEl = null;
  let targetSide = null; // 'before' or 'after'

  if (clientX != null && clientY != null) {
    const rowId =
      seat === 'bottom' ? 'set-bottom' :
      seat === 'top'    ? 'set-top'    :
      seat === 'left'   ? 'set-left'   :
      seat === 'right'  ? 'set-right'  :
      null;

    if (rowId) {
      const rowEl = document.getElementById(rowId);
      if (rowEl) {
        // Exclude pending Joker cards from auto-attachment
        const cardEls = Array.from(rowEl.querySelectorAll('.set-card'))
          .filter(el => !isPendingJokerCard(el));
        
        // For vertical seats, use proximity-based detection since rotated overlapping cards
        // have complex hit zones. Find the closest card to the drop point.
        if (isVerticalSeat(seat) && cardEls.length > 0) {
          let closestCard = null;
          let closestDist = Infinity;
          
          for (const el of cardEls) {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(
              Math.pow(clientX - centerX, 2) + 
              Math.pow(clientY - centerY, 2)
            );
            
            // Use a generous threshold - if within 120px of any card center, snap to it
            if (dist < closestDist && dist < 120) {
              closestDist = dist;
              closestCard = el;
            }
          }
          
          if (closestCard) {
            targetCardEl = closestCard;
            const rect = closestCard.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            targetSide = clientY < midY ? 'before' : 'after';
          }
        } else {
          // Horizontal seats - use exact hit detection
          for (const el of cardEls) {
            const rect = el.getBoundingClientRect();
            if (
              clientX >= rect.left && clientX <= rect.right &&
              clientY >= rect.top && clientY <= rect.bottom
            ) {
              targetCardEl = el;
              const midX = rect.left + rect.width / 2;
              targetSide = clientX < midX ? 'before' : 'after';
              break;
            }
          }
        }
        
        // For vertical seats, if no card was close enough but there are groups,
        // try to find the nearest group and add to it (excluding pending Joker group)
        if (!targetCardEl && isVerticalSeat(seat)) {
          const groups = Array.from(rowEl.querySelectorAll('.set-group, .meld-group'))
            .filter(g => !g.classList.contains('pending-joker-group'));
          if (groups.length > 0) {
            let closestGroup = null;
            let closestDist = Infinity;
            
            for (const group of groups) {
              const rect = group.getBoundingClientRect();
              const centerY = rect.top + rect.height / 2;
              const dist = Math.abs(clientY - centerY);
              if (dist < closestDist) {
                closestDist = dist;
                closestGroup = group;
              }
            }
            
            if (closestGroup) {
              const groupCards = closestGroup.querySelectorAll('.set-card');
              if (groupCards.length > 0) {
                // Use the last card in the closest group
                targetCardEl = groupCards[groupCards.length - 1];
                targetSide = 'after';
              }
            }
          }
        }
      }
    }
  }

  if (targetCardEl) {
    const targetId = targetCardEl.dataset.cardId;
    const targetIndex = seatSets.findIndex(c => c.id === targetId);
    const targetCard = targetIndex >= 0 ? seatSets[targetIndex] : null;

    if (targetCard) {
      // Double-check: don't auto-attach to pending Joker group
      if (targetCard.groupId === pendingJokerGroupId) {
        // Skip - the player must explicitly drop on pending group to add cards there
        // Fall through to create a new group instead
      } else {
        if (!targetCard.groupId) {
          targetCard.groupId = nextGroupId();
        }
        const gid = targetCard.groupId;
        card.groupId = gid;

        // Joker identity from hover side - attempt position-based assignment
        // If out of bounds, leave as-is; assignAllJokerRepresentationsInGroup will fix it
        if (card.rank === 'JOKER') {
          const refRank = targetCard.rank;
          const refSuit = targetCard.suit;

          if (refRank && refRank !== 'JOKER') {
            const idx = ACE_HIGH_ORDER.indexOf(refRank);
            let repIdx = idx;

            if (targetSide === 'after') {
              repIdx = idx + 1;   // higher card
            } else if (targetSide === 'before') {
              repIdx = idx - 1;   // lower card
            }

            // Only set if the calculated position is valid
            // assignAllJokerRepresentationsInGroup will handle edge cases
            if (repIdx >= 0 && repIdx < ACE_HIGH_ORDER.length) {
              card.jokerRepRank = ACE_HIGH_ORDER[repIdx];
              card.jokerRepSuit = refSuit;
            }
            // Don't set to null - let assignAllJokerRepresentationsInGroup handle it
          }
        }

        let insertIdx = targetIndex;

        if (card.groupId) {
          if (targetSide === 'before') {
            while (insertIdx > 0 && seatSets[insertIdx - 1].groupId === gid) {
              insertIdx--;
            }
          } else {
            insertIdx++;
            while (insertIdx < seatSets.length && seatSets[insertIdx].groupId === gid) {
              insertIdx++;
            }
          }
        }

        if (insertIdx < 0) insertIdx = 0;
        if (insertIdx > seatSets.length) insertIdx = seatSets.length;

        seatSets.splice(insertIdx, 0, card);
        autoSortGroupIfComplete(seatSets, card.groupId);
        // Assign Joker representations for all Jokers in this group
        assignAllJokerRepresentationsInGroup(seatSets, card.groupId);
        return;
      }
    }
  }

  // No card directly hit – start a fresh group.
  card.groupId = nextGroupId();

  if (card.rank === 'JOKER') {
    card.jokerRepRank = null;
    card.jokerRepSuit = null;
  }

  seatSets.push(card);
  autoSortGroupIfComplete(seatSets, card.groupId);
  // Assign Joker representations for all Jokers in this group
  assignAllJokerRepresentationsInGroup(seatSets, card.groupId);
}

// (Not currently used, retained for possible future Joker snapping refinements)
function insertJokerWithSnap(card, seat, dropEvent, seatSets) {
  if (!seatSets) return;

  if (!dropEvent || (!dropEvent.clientX && !dropEvent.clientY) || seatSets.length === 0) {
    seatSets.push(card);
    return;
  }

  const rowId =
    seat === 'bottom' ? 'set-bottom' :
    seat === 'top'    ? 'set-top'    :
    seat === 'left'   ? 'set-left'   :
    seat === 'right'  ? 'set-right'  :
    null;

  if (!rowId) {
    seatSets.push(card);
    return;
  }

  const rowEl = document.getElementById(rowId);
  if (!rowEl) {
    seatSets.push(card);
    return;
  }

  const groups = Array.from(rowEl.querySelectorAll('.set-group'));
  if (!groups.length) {
    seatSets.push(card);
    return;
  }

  const clientX = dropEvent.clientX;
  const clientY = dropEvent.clientY;

  let chosenGroup = null;
  let bestDist = Infinity;

  groups.forEach((groupEl) => {
    const rect = groupEl.getBoundingClientRect();
    const groupCenter = isVerticalSeat(seat)
      ? rect.top + rect.height / 2
      : rect.left + rect.width / 2;
    const pointerPos = isVerticalSeat(seat) ? clientY : clientX;
    const dist = Math.abs(pointerPos - groupCenter);
    if (dist < bestDist) {
      bestDist = dist;
      chosenGroup = groupEl;
    }
  });

  if (!chosenGroup) {
    seatSets.push(card);
    return;
  }

  const rect = chosenGroup.getBoundingClientRect();
  const before = isVerticalSeat(seat)
    ? clientY < rect.top + rect.height / 2
    : clientX < rect.left + rect.width / 2;

  const groupCardIds = Array.from(chosenGroup.querySelectorAll('.set-card'))
    .map((el) => el.dataset.cardId)
    .filter(Boolean);

  if (!groupCardIds.length) {
    seatSets.push(card);
    return;
  }

  const indices = groupCardIds
    .map((id) => seatSets.findIndex((c) => c.id === id))
    .filter((idx) => idx >= 0);

  if (!indices.length) {
    seatSets.push(card);
    return;
  }

  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);

  let targetIndex = before ? minIdx : maxIdx + 1;
  if (targetIndex < 0 || targetIndex > seatSets.length) {
    targetIndex = seatSets.length;
  }

  seatSets.splice(targetIndex, 0, card);
}

function setupSetZoneDragAndDrop() {
  const seats = ['bottom', 'top', 'left', 'right'];

  seats.forEach((seat) => {
    const zone = document.getElementById(`set-${seat}`);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    zone.addEventListener('drop', (e) => {
      if (!DEBUG_MODE) {
        if (!isBottomTurn()) {
          setStatus('It is not your turn.');
          return;
        }
        if (!gameState.hasDrawn) {
          setStatus('You must draw from DECK or PACK before laying a card.');
          return;
        }
      }

      e.preventDefault();
      
      
      const cardId = e.dataTransfer.getData('text/plain') || gameState.draggingCardId;
      if (!cardId) return;

      const hand = gameState.hands.bottom;
      const idx = hand.findIndex(c => c.id === cardId);
      if (idx === -1) return;

      const card = hand[idx];
      
      // Check if this is a Joker swap attempt
      // (natural card being dropped on a meld that contains a Joker representing that card)
      // Joker swaps are ONLY allowed when going out to WIN (hand must have <= 2 cards)
      if (card.rank !== 'JOKER') {
        const seatSets = gameState.sets[seat];
        if (seatSets && seatSets.length > 0) {
          // Find the group being dropped onto
          const targetCardEl = e.target.closest('.set-card');
          if (targetCardEl) {
            const targetCardId = targetCardEl.dataset.cardId;
            const targetCard = seatSets.find(c => c.id === targetCardId);
            if (targetCard && targetCard.groupId) {
              // Check if there's a Joker in this group that matches our natural card
              const matchResult = findMatchingJokerInMeld(card, seatSets, targetCard.groupId);
              if (matchResult) {
                // Handle case where multiple cards are required to swap the Joker
                // matchResult can be either:
                //   - A joker card directly (for runs, or sets with only 1 missing suit)
                //   - An object { joker, requiresMultipleCards, missingSuits, setRank }
                let actualJoker;
                
                if (matchResult.requiresMultipleCards) {
                  // For sets with 2+ missing suits, player needs ALL missing suit cards
                  const missingSuits = matchResult.missingSuits;
                  const setRank = matchResult.setRank;
                  actualJoker = matchResult.joker;
                  
                  // Check if player has ALL missing suit cards in their hand
                  const handCards = gameState.hands.bottom;
                  const hasAllMissingSuits = missingSuits.every(suit => 
                    handCards.some(c => c.rank === setRank && c.suit === suit)
                  );
                  
                  if (!hasAllMissingSuits) {
                    const missingNames = missingSuits.map(s => 
                      s === 'C' ? 'Clubs' : s === 'D' ? 'Diamonds' : s === 'H' ? 'Hearts' : 'Spades'
                    ).join(' AND ');
                    setStatus(`To swap this Joker, you need BOTH ${setRank} of ${missingNames}!`);
                    return;
                  }
                } else {
                  // Direct joker card returned (runs or sets with only 1 missing suit)
                  actualJoker = matchResult;
                }
                
                // Ensure actualJoker is a valid card object with an id
                if (!actualJoker || !actualJoker.id || actualJoker.rank !== 'JOKER') {
                  console.error('Invalid joker card in swap:', actualJoker);
                  return;
                }
                
                // Joker swap is only valid when going out to WIN
                // (hand-size restriction temporarily disabled for movement testing)
// This is a Joker swap attempt!
                // Remove card from hand first
                hand.splice(idx, 1);
                
                // Stage the swap
                if (stageJokerSwap(card, actualJoker, seat, targetCard.groupId)) {
                  setStatus('Joker swap staged! Discard the Joker to WIN, or your swap will be rolled back.');
                  playSound('draw');
                  
                  renderBottomHand();
                  if (seat === 'bottom') {
                    renderBottomSetRow();
                  } else if (seat === 'top') {
                    renderTopSetRow();
                  } else if (seat === 'left') {
                    renderLeftSetRow();
                  } else if (seat === 'right') {
                    renderRightSetRow();
                  }
                  renderMiniHands();
                  return;
                } else {
                  // Swap failed, put card back
                  hand.splice(idx, 0, card);
                  setStatus('Joker swap failed.');
                  return;
                }
              }
            }
          }
        }
      }

      // Normal card placement (not a Joker swap)
      hand.splice(idx, 1);

      if (gameState.lastDrawSource === 'pack' && gameState.lastPackCardId === card.id) {
        // PACK card now used in a meld; rule is enforced via discard checks.
      }

      card.laidTurn = gameState.currentTurnId || 0;
      
      // If playing on another player's set, mark as a goer (yellow glow)
      if (seat !== 'bottom') {
        card.isGoer = true;
        gameState.goersThisTurn.push(card.id);
      }
      
      placeCardIntoSetRow(card, seat, e);

      renderBottomHand();

      if (seat === 'bottom') {
        renderBottomSetRow();
      } else if (seat === 'top') {
        renderTopSetRow();
      } else if (seat === 'left') {
        renderLeftSetRow();
      } else if (seat === 'right') {
        renderRightSetRow();
      }
      renderMiniHands();
    });
  });
}

function isBottomTurn() {
  // In demo mode, human never has control - all 4 players are bots
  if (demoMode) return false;
  return gameState.turnSeat === 'bottom' && gameState.turnSeat !== null;
}

function updateActiveTurnGlow() {
  const setBottom = document.getElementById('set-bottom');
  const setTop = document.getElementById('set-top');
  const setLeft = document.getElementById('set-left');
  const setRight = document.getElementById('set-right');

  // Remove glow from all set boxes
  [setBottom, setTop, setLeft, setRight].forEach(el => {
    if (el) el.classList.remove('active-turn');
  });

  // Add glow to the active player's set box
  if (gameState.turnSeat === 'bottom' && setBottom) {
    setBottom.classList.add('active-turn');
  } else if (gameState.turnSeat === 'top' && setTop) {
    setTop.classList.add('active-turn');
  } else if (gameState.turnSeat === 'left' && setLeft) {
    setLeft.classList.add('active-turn');
  } else if (gameState.turnSeat === 'right' && setRight) {
    setRight.classList.add('active-turn');
  }
}

function startNewTurn() {
  gameState.currentTurnId = (gameState.currentTurnId || 0) + 1;
  gameState.hasDiscardedThisTurn = false;
  
  // Rollback any staged Joker swaps from previous turn (player didn't win)
  // This restores the Joker to the meld and removes the natural card
  if (gameState.stagedJokerSwaps && gameState.stagedJokerSwaps.length > 0) {
    rollbackJokerSwaps();
  }
}

// Use CLOCKWISE_SEATS for turn order (defined earlier in the file)
// Clockwise: bottom -> left -> top -> right -> bottom

function nextSeat(current) {
  const idx = CLOCKWISE_SEATS.indexOf(current);
  if (idx === -1) return 'bottom';
  return CLOCKWISE_SEATS[(idx + 1) % CLOCKWISE_SEATS.length];
}

function isSeatOut(seat) {
  if (gameState.eliminated[seat]) return true;
  const hand = gameState.hands[seat];
  return !hand || hand.length === 0;
}

function isBotSeat(seat) {
  // In demo mode, ALL seats are bots including bottom
  if (demoMode) {
    return seat === 'top' || seat === 'left' || seat === 'right' || seat === 'bottom';
  }
  return seat === 'top' || seat === 'left' || seat === 'right';
}

// ============= SMART BOT AI SYSTEM =============

// Reset card tracking at the start of each hand
function resetCardTracking() {
  gameState.cardTracking = {
    discardHistory: [],
    knownCards: new Set(),
    totalCardsInGame: 106,
    playerDiscardPatterns: {
      bottom: [],
      top: [],
      left: [],
      right: []
    }
  };
}

// Track a discard for bot analysis
function trackDiscard(card, seat) {
  if (!gameState.cardTracking) resetCardTracking();
  
  gameState.cardTracking.discardHistory.push({
    card: { ...card },
    seat: seat,
    turnNumber: gameState.currentTurnId
  });
  
  gameState.cardTracking.knownCards.add(card.id);
  gameState.cardTracking.playerDiscardPatterns[seat].push({
    rank: card.rank,
    suit: card.suit
  });
}

// Get all visible cards in melds
function getVisibleMeldCards() {
  const visible = [];
  ['bottom', 'top', 'left', 'right'].forEach(seat => {
    const sets = gameState.sets[seat] || [];
    sets.forEach(card => visible.push({ ...card, seat }));
  });
  return visible;
}

// Analyze what cards an opponent might need based on their melds
function analyzeOpponentNeeds(seat) {
  const needs = [];
  const opponentSets = gameState.sets[seat] || [];
  
  // Group cards by groupId
  const groups = {};
  opponentSets.forEach(card => {
    if (!groups[card.groupId]) groups[card.groupId] = [];
    groups[card.groupId].push(card);
  });
  
  // For each meld, determine what cards could extend it
  Object.values(groups).forEach(group => {
    if (group.length < 3) return;
    
    // Check if it's a set (same rank) or run (same suit, sequential)
    const ranks = group.map(c => c.rank);
    const suits = group.map(c => c.suit);
    const uniqueRanks = new Set(ranks.filter(r => r !== 'JOKER'));
    const uniqueSuits = new Set(suits.filter(s => s !== 'J'));
    
    if (uniqueRanks.size === 1) {
      // It's a set - they might want more of the same rank
      const setRank = [...uniqueRanks][0];
      ['C', 'D', 'H', 'S'].forEach(suit => {
        if (!suits.includes(suit)) {
          needs.push({ rank: setRank, suit, priority: 'high' });
        }
      });
    } else if (uniqueSuits.size === 1) {
      // It's a run - they might want adjacent cards
      const runSuit = [...uniqueSuits][0];
      const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const cardRanks = group.map(c => c.jokerRepRank || c.rank).filter(r => r !== 'JOKER');
      const indices = cardRanks.map(r => rankOrder.indexOf(r)).sort((a, b) => a - b);
      
      if (indices.length > 0) {
        // Cards before the run
        if (indices[0] > 0) {
          needs.push({ rank: rankOrder[indices[0] - 1], suit: runSuit, priority: 'medium' });
        }
        // Cards after the run
        if (indices[indices.length - 1] < rankOrder.length - 1) {
          needs.push({ rank: rankOrder[indices[indices.length - 1] + 1], suit: runSuit, priority: 'medium' });
        }
      }
    }
  });
  
  return needs;
}

// Get the next player (player to the left who receives the pack first)
function getNextPlayer(seat) {
  const order = ['bottom', 'left', 'top', 'right'];
  const currentIndex = order.indexOf(seat);
  if (currentIndex === -1) return null;
  
  // Find next active player in clockwise order
  for (let i = 1; i <= 4; i++) {
    const nextSeat = order[(currentIndex + i) % 4];
    if (!isSeatOut(nextSeat)) {
      return nextSeat;
    }
  }
  return null;
}

// Check if discarding a card might help an opponent
// Prioritizes the player to the left (next player) as they get first pick
function wouldHelpOpponent(card, botSeat) {
  const difficulty = settings.botDifficulty || 'medium';
  const nextPlayer = getNextPlayer(botSeat);
  const opponents = ['bottom', 'top', 'left', 'right'].filter(s => s !== botSeat && !isSeatOut(s));
  
  let worstResult = { helps: false };
  
  for (const oppSeat of opponents) {
    const needs = analyzeOpponentNeeds(oppSeat);
    const isNextPlayer = oppSeat === nextPlayer;
    const threatLevel = getOpponentThreatLevel(oppSeat);
    
    for (const need of needs) {
      if (card.rank === need.rank && card.suit === need.suit) {
        // Determine priority based on who we're helping and their threat level
        let priority = need.priority;
        
        // Next player gets highest priority - they pick from pack first!
        if (isNextPlayer) {
          priority = 'critical';
        } else if (threatLevel === 'critical') {
          priority = 'high';
        } else if (threatLevel === 'high' && priority === 'medium') {
          priority = 'high';
        }
        
        // Return worst case (most dangerous discard)
        if (!worstResult.helps || 
            (priority === 'critical') ||
            (priority === 'high' && worstResult.priority !== 'critical')) {
          worstResult = { 
            helps: true, 
            opponent: oppSeat, 
            priority: priority,
            isNextPlayer: isNextPlayer
          };
        }
      }
    }
  }
  
  return worstResult;
}

// Check how close an opponent is to winning (based on hand size)
function getOpponentThreatLevel(seat) {
  const handSize = (gameState.hands[seat] || []).length;
  if (handSize <= 2) return 'critical';
  if (handSize <= 4) return 'high';
  if (handSize <= 7) return 'medium';
  return 'low';
}

// Calculate how useful a card is for potential melds
function calculateCardUtility(card, hand) {
  let utility = 0;
  
  // Check if card can form sets with other cards in hand
  const sameRank = hand.filter(c => c.rank === card.rank && c.id !== card.id);
  utility += sameRank.length * 2;
  
  // Check if card can form runs with other cards in hand
  const sameSuit = hand.filter(c => c.suit === card.suit && c.id !== card.id);
  const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const cardRankIndex = rankOrder.indexOf(card.rank);
  
  sameSuit.forEach(c => {
    const otherIndex = rankOrder.indexOf(c.rank);
    const diff = Math.abs(cardRankIndex - otherIndex);
    if (diff === 1) utility += 3; // Adjacent = very useful
    if (diff === 2) utility += 1; // One gap = somewhat useful
  });
  
  // Jokers are always high utility
  if (card.rank === 'JOKER') utility = 100;
  
  return utility;
}

// Strategic decision: should bot reveal melds now or hold them?
function shouldBotRevealMelds(seat, melds, totalMeldScore) {
  const difficulty = settings.botDifficulty || 'medium';
  const hand = gameState.hands[seat] || [];
  
  // Easy bots always reveal when they can
  if (difficulty === 'easy') return true;
  
  // Check if bot hasn't opened yet - must reveal to get 40+ points
  if (!gameState.opened[seat]) {
    return totalMeldScore >= 40;
  }
  
  // Already opened - strategic decision
  const handSize = hand.length;
  const meldCardCount = melds.reduce((sum, m) => sum + m.group.length, 0);
  const remainingAfterMeld = handSize - meldCardCount;
  
  // Medium difficulty: reveal if it gets us close to winning
  if (difficulty === 'medium') {
    if (remainingAfterMeld <= 3) return true; // Close to winning
    if (handSize > 10) return true; // Too many cards, need to reduce
    return Math.random() > 0.4; // 60% chance to reveal otherwise
  }
  
  // Hard difficulty: strategic evaluation
  if (difficulty === 'hard') {
    // Check opponent threat levels
    const opponents = ['bottom', 'top', 'left', 'right'].filter(s => s !== seat);
    const anyOpponentCritical = opponents.some(s => getOpponentThreatLevel(s) === 'critical');
    
    // If opponent is close to winning, we need to speed up
    if (anyOpponentCritical && remainingAfterMeld <= 4) return true;
    
    // If we can win or get very close, reveal
    if (remainingAfterMeld <= 2) return true;
    
    // Hold cards if we have a strong hand that's not complete
    if (remainingAfterMeld > 5 && handSize <= 8) {
      return false; // Hold and build a stronger position
    }
    
    // Reveal if hand is getting too large
    if (handSize > 11) return true;
    
    // Random element for unpredictability
    return Math.random() > 0.5;
  }
  
  return true;
}

// Smart discard selection based on difficulty
function smartBotChooseDiscard(seat) {
  const hand = gameState.hands[seat];
  if (!hand || hand.length === 0) return null;
  if (hand.length === 1) return hand[0];
  
  const difficulty = settings.botDifficulty || 'medium';
  
  // Separate jokers from non-jokers
  const jokers = hand.filter(c => c.rank === 'JOKER');
  const nonJokers = hand.filter(c => c.rank !== 'JOKER');
  
  if (nonJokers.length === 0) {
    return jokers[jokers.length - 1]; // Must discard joker
  }
  
  // Filter out pack card if applicable
  let candidates = nonJokers.filter(c => {
    if (gameState.lastDrawSource === 'pack' && gameState.lastPackCardId === c.id) {
      return false;
    }
    return true;
  });
  
  if (candidates.length === 0) candidates = nonJokers;
  
  // Easy bot: just discard highest point value card
  if (difficulty === 'easy') {
    return getHighestPointCard(candidates);
  }
  
  // Get the next player for strategic blocking
  const nextPlayer = getNextPlayer(seat);
  
  // Score each candidate for discard
  const scoredCandidates = candidates.map(card => {
    let score = 0;
    
    // Base score: point value (higher points = more likely to discard)
    score += getCardPointValue(card);
    
    // Utility score: how useful is this card for our melds (lower utility = more likely to discard)
    const utility = calculateCardUtility(card, hand);
    score -= utility * 2;
    
    // Medium/Hard: Check if discarding helps opponents
    if (difficulty === 'medium' || difficulty === 'hard') {
      const helpCheck = wouldHelpOpponent(card, seat);
      if (helpCheck.helps) {
        // Critical = next player can use it - NEVER discard!
        if (helpCheck.priority === 'critical') {
          score -= 100; // Heavy penalty for helping next player
        } else if (helpCheck.priority === 'high') {
          score -= 40;
        } else if (helpCheck.priority === 'medium') {
          score -= 20;
        }
        
        // Extra penalty if the opponent is close to winning
        if (difficulty === 'hard') {
          const threatLevel = getOpponentThreatLevel(helpCheck.opponent);
          if (threatLevel === 'critical') score -= 60;
          else if (threatLevel === 'high') score -= 30;
        }
        
        // Medium bots also care about critical threats
        if (difficulty === 'medium') {
          const threatLevel = getOpponentThreatLevel(helpCheck.opponent);
          if (threatLevel === 'critical') score -= 40;
        }
      }
    }
    
    // Bonus: prefer discarding cards that have already been discarded (less useful to opponents)
    if (gameState.cardTracking && gameState.cardTracking.discardHistory) {
      const sameRankDiscarded = gameState.cardTracking.discardHistory.filter(
        c => c.rank === card.rank
      ).length;
      score += sameRankDiscarded * 5; // Bonus for discarding ranks already seen
    }
    
    return { card, score };
  });
  
  // Sort by score (highest = best to discard)
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  // Hard bots add some unpredictability
  if (difficulty === 'hard' && scoredCandidates.length > 2 && Math.random() < 0.15) {
    // Occasionally pick the second-best option to be unpredictable
    return scoredCandidates[1].card;
  }
  
  return scoredCandidates[0].card;
}

function getCardPointValue(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === 'A') return 15;
  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') return 10;
  return parseInt(card.rank) || 0;
}

function getHighestPointCard(cards) {
  return cards.reduce((highest, card) => {
    return getCardPointValue(card) > getCardPointValue(highest) ? card : highest;
  }, cards[0]);
}

function advanceTurn() {
  if (!gameState.turnSeat) {
    updateActiveTurnGlow();
    return;
  }

  let next = gameState.turnSeat;
  let safety = CLOCKWISE_SEATS.length;

  while (safety-- > 0) {
    next = nextSeat(next);
    if (!isSeatOut(next)) {
      gameState.turnSeat = next;
      gameState.hasDrawn = false;
      gameState.lastDrawSource = null;
      gameState.lastPackCardId = null;
      gameState.hasDiscardedThisTurn = false;
      updateActiveTurnGlow();

      if (next === 'bottom') {
        if (demoMode) {
          setStatus('Bot 4 is playing...');
        } else {
          setStatus('Your turn: draw from DECK or PACK.');
        }
      } else if (next === 'top') {
        setStatus('Bot 1 is playing...');
      } else if (next === 'left') {
        setStatus('Bot 2 is playing...');
      } else if (next === 'right') {
        setStatus('Bot 3 is playing...');
      }
      return;
    }
  }

  gameState.turnSeat = null;
  setStatus('Hand finished.');
}

// Decide whether a bot should draw from PACK instead of DECK.
// CRITICAL: Only draw from pack if bot can ACTUALLY form and play a valid meld with it
function botShouldDrawFromPack(seat) {
  const hand = gameState.hands[seat];
  const pack = gameState.pack;
  if (!hand || !hand.length || !pack || !pack.length) return false;

  const topCard = pack[pack.length - 1];

  // Can't immediately take back your own discard after drawing from the DECK
  if (
    gameState.lastDiscardSeat === seat &&
    gameState.lastDiscardSource === 'deck' &&
    gameState.lastDiscardCardId === topCard.id
  ) {
    return false;
  }

  // Temporarily simulate having taken the PACK card into this hand
  const originalHand = hand;
  const tempHand = hand.slice();
  tempHand.push(topCard);

  // Swap in the simulated hand so we can reuse the meld chooser logic
  gameState.hands[seat] = tempHand;
  const chosen = chooseOpeningMeldsForSeat(seat, { requiredCardId: topCard.id }) || [];
  // Restore the real hand
  gameState.hands[seat] = originalHand;

  if (!chosen.length) {
    // No new meld is possible that uses the PACK card – drawing from PACK would be illegal
    return false;
  }

  if (gameState.opened[seat]) {
    // Already opened: as long as we can create a brand-new meld that uses the PACK card,
    // it is legal (and usually beneficial) to draw from PACK.
    return true;
  }

  // Not opened yet: only draw from PACK if we can actually OPEN (40+) this turn
  const openingScore = chosen.reduce((sum, cand) => sum + (cand.score || 0), 0);

  return openingScore >= 40;
}


// Helper to find all possible 3-card melds in a hand
function findAllPossibleMelds(hand) {
  const melds = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const candidate = [hand[i], hand[j], hand[k]];
        if (isValidSetGroup(candidate) || isValidRunGroup(candidate)) {
          let meldScore = 0;
          candidate.forEach(c => {
            if (c.rank === 'JOKER') meldScore += 25;
            else if (c.rank === 'A') meldScore += 15;
            else if (['K', 'Q', 'J', '10'].includes(c.rank)) meldScore += 10;
            else meldScore += parseInt(c.rank) || 0;
          });
          melds.push({ cards: candidate, score: meldScore });
        }
      }
    }
  }
  return melds;
}

// Bot chooses which card to discard - uses smart AI based on difficulty setting
function botChooseDiscard(seat) {
  return smartBotChooseDiscard(seat);
}

function runSingleBotTurn(seat) {
  if (!seat || !isBotSeat(seat)) return;
  const hand = gameState.hands[seat];
  if (!hand) return;

  if (!gameState.deck || gameState.deck.length === 0) {
    if (gameState.pack && gameState.pack.length > 1) {
      const topPack = gameState.pack[gameState.pack.length - 1];
      const rest = gameState.pack.slice(0, gameState.pack.length - 1);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = rest[i];
        rest[i] = rest[j];
        rest[j] = tmp;
      }
      gameState.deck = rest;
      gameState.pack = [topPack];
      renderPiles();
      setStatus('Deck was empty. PACK reshuffled into new DECK for bots.');
    } else {
      setStatus('Deck is empty. Hand stalled.');
      gameState.turnSeat = null;
      return;
    }
  }

  startNewTurn();

  let drawn = null;
  let drawSource = 'deck';

  const wantPack = botShouldDrawFromPack(seat);

  if (wantPack) {
    drawn = gameState.pack.pop();
    drawSource = 'pack';
  } else {
    drawn = gameState.deck.shift();
    drawSource = 'deck';
  }

  if (drawn) {
    hand.push(drawn);
    gameState.hasDrawn = true;
    gameState.lastDrawSource = drawSource;
    gameState.lastPackCardId = drawSource === 'pack' ? drawn.id : null;
    
    // Track draw count for IN voting (closes voting when any player takes 2nd draw)
    incrementDrawCount(seat);
  }

  // Animate bot drawing from deck or pack, then wait before discarding
  animateBotDraw(seat, drawSource, () => {
    // Update piles after animation shows card being taken
    renderPiles();
    
    // Wait 2 seconds before bot processes and discards
    setTimeout(() => {
      botProcessAndDiscard(seat, drawSource);
    }, getAnimDuration(2000)); // 2 second delay between draw and discard
  });
}

// Bot processing after draw - melds and discard
function botProcessAndDiscard(seat, drawSource) {
  const hand = gameState.hands[seat];
  
  const requiredCardId = (drawSource === 'pack') ? gameState.lastPackCardId : null;

  const chosen = chooseOpeningMeldsForSeat(seat, {
    requiredCardId: requiredCardId
  });

  if (!gameState.opened[seat]) {
    let openingScore = 0;

    if (chosen && chosen.length) {
      const seatSets = gameState.sets[seat];
      const usedIds = new Set();
      chosen.forEach(cand => {
        cand.group.forEach(card => usedIds.add(card.id));
      });

      const remaining = [];
      hand.forEach(c => {
        if (!usedIds.has(c.id)) remaining.push(c);
      });
      gameState.hands[seat] = remaining;

      chosen.forEach(cand => {
        const gid = nextGroupId();
        
        // Assign Joker representations BEFORE adding to sets (so sorting works correctly)
        cand.group.forEach(card => {
          if (card.rank === 'JOKER' && !card.jokerRepRank) {
            assignJokerRepresentation(card, cand.group);
          }
        });
        
        cand.group.forEach(card => {
          card.groupId = gid;
          seatSets.push(card);
        });
        // Normalise order for this meld.
        autoSortGroupIfComplete(seatSets, gid);
        
        openingScore += cand.score;
      });
    }

    if (openingScore >= 40) {
      gameState.opened[seat] = true;
    } else if (chosen && chosen.length) {
      const backCards = [];
      chosen.forEach(cand => {
        cand.group.forEach(card => backCards.push(card));
      });
      gameState.sets[seat] = gameState.sets[seat].filter(c => !backCards.includes(c));
      gameState.hands[seat] = gameState.hands[seat].concat(backCards);
      gameState.hands[seat].sort((a, b) => {
        const ra = ACE_HIGH_ORDER.indexOf(a.rank);
        const rb = ACE_HIGH_ORDER.indexOf(b.rank);
        return ra - rb;
      });
    }
  } else {
    // Already opened - use strategic decision to reveal melds
    if (chosen && chosen.length) {
      // Calculate total score of melds we could play
      const totalMeldScore = chosen.reduce((sum, cand) => sum + cand.score, 0);
      
      // Strategic decision: should we reveal melds now or hold them?
      if (shouldBotRevealMelds(seat, chosen, totalMeldScore)) {
        const seatSets = gameState.sets[seat];
        const usedIds = new Set();
        chosen.forEach(cand => {
          cand.group.forEach(card => usedIds.add(card.id));
        });

        const remaining = [];
        hand.forEach(c => {
          if (!usedIds.has(c.id)) remaining.push(c);
        });
        gameState.hands[seat] = remaining;

        chosen.forEach(cand => {
          const gid = nextGroupId();
          
          // Assign Joker representations BEFORE adding to sets (so sorting works correctly)
          cand.group.forEach(card => {
            if (card.rank === 'JOKER' && !card.jokerRepRank) {
              assignJokerRepresentation(card, cand.group);
            }
          });
          
          cand.group.forEach(card => {
            card.groupId = gid;
            seatSets.push(card);
          });
          autoSortGroupIfComplete(seatSets, gid);
        });
      }
    }
  }

  // Extend own melds with goers (only if opened, enforced inside)
  botAddGoersForSeat(seat);

  // Check if bot has no cards left BEFORE trying to discard (won by laying all cards)
  if (gameState.hands[seat].length === 0) {
    // Bot laid down all their cards - they win!
    setStatus('A bot has gone OUT by laying all cards! Hand finished.');
    gameState.turnSeat = null;
    // In demo mode, bottom is a bot so we need to update its hand display
    if (demoMode && seat === 'bottom') {
      renderBottomHand();
    }
    renderMiniHands();
    renderBottomSetRow();
    renderTopSetRow();
    renderLeftSetRow();
    renderRightSetRow();
    showVictoryScreen(seat);
    return;
  }

  // Choose a card to discard - NEVER discard jokers unless it's the only option
  const discarded = botChooseDiscard(seat);
  if (!discarded) {
    // This shouldn't happen if hand.length > 0, but just in case
    advanceTurn();
    return;
  }
  
  // Remove the discarded card from hand
  const discardIdx = gameState.hands[seat].findIndex(c => c.id === discarded.id);
  if (discardIdx !== -1) {
    gameState.hands[seat].splice(discardIdx, 1);
  }

  if (seat === 'top') {
    setStatus('Bot 1 discarded ' + (discarded.code || 'a card') + '.');
  } else if (seat === 'left') {
    setStatus('Bot 2 discarded ' + (discarded.code || 'a card') + '.');
  } else if (seat === 'right') {
    setStatus('Bot 3 discarded ' + (discarded.code || 'a card') + '.');
  }

  gameState.lastDiscardSource = 'deck';
  gameState.lastDiscardCardId = discarded.id;
  gameState.lastDiscardSeat = seat;
  gameState.hasDiscardedThisTurn = true;

  // In demo mode, bottom is a bot so we need to update its hand display
  if (demoMode && seat === 'bottom') {
    renderBottomHand();
  }
  renderMiniHands();
  renderBottomSetRow();
  renderTopSetRow();
  renderLeftSetRow();
  renderRightSetRow();

  // Get the mini-hand element for animation start position
  let miniHandEl = null;
  if (seat === 'top') {
    miniHandEl = document.getElementById('mini-top');
  } else if (seat === 'left') {
    miniHandEl = document.getElementById('mini-left');
  } else if (seat === 'right') {
    miniHandEl = document.getElementById('mini-right');
  }

  // Save whether bot drew from pack before animating
  const drewFromPack = drawSource === 'pack';

  // Play discard sound when animation starts (synced with visual)
  playSound('discard');

  // Animate bot discard
  animateDiscard(discarded, miniHandEl, () => {
    gameState.pack.push(discarded);
    trackDiscard(discarded, seat); // Track for bot AI
    renderPiles();

    // Helper function to handle post-elimination
    const handleBotPostCheck = (wasEliminated) => {
      if (wasEliminated) {
        const activePlayers = ['bottom', 'top', 'left', 'right'].filter(s => !gameState.eliminated[s] && !isSeatOut(s));
        if (activePlayers.length <= 1) {
          if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            const winnerName = winner === 'bottom' ? 'You' : 
                              winner === 'top' ? 'Bot 1' :
                              winner === 'left' ? 'Bot 2' : 'Bot 3';
            setStatus(`${winnerName} won! All other players eliminated.`);
            showVictoryScreen(winner);
          } else {
            setStatus('Game over - no players remaining.');
          }
          gameState.turnSeat = null;
          return;
        }
        advanceTurn();
        continueBotsAfterAnimation();
        return;
      }

      if (gameState.hands[seat].length === 0) {
        setStatus('A bot has gone OUT. Hand finished.');
        gameState.turnSeat = null;
        showVictoryScreen(seat);
        return;
      }

      advanceTurn();
      
      // Continue to next bot turn after animation completes
      continueBotsAfterAnimation();
    };

    // First check 40-point pack rule (if drew from pack)
    checkPackDrawElimination(seat, drewFromPack, (was40Eliminated) => {
      if (was40Eliminated) {
        handleBotPostCheck(true);
        return;
      }
      
      // Then check for invalid melds
      checkAndEliminateIfInvalid(seat, handleBotPostCheck);
    });
  });
}

function runBotsUntilBottomOrEnd() {
  runNextBotWithDelay();
}

function continueBotsAfterAnimation() {
  // Called after bot's discard animation completes
  if (!gameState.turnSeat) {
    return;
  }
  
  // In demo mode, continue even when it's bottom's turn (bottom is a bot)
  if (gameState.turnSeat === 'bottom') {
    if (demoMode) {
      // Demo mode - bottom is Bot 4, continue playing
      setGameTimeout(() => runNextBotWithDelay(), getAnimDuration(BASE_ANIM.betweenBots));
      return;
    } else {
      setStatus('Bots have played. Your turn: draw from DECK or PACK.');
      return;
    }
  }
  
  // Small delay before next bot plays (using tracked timeout)
  setGameTimeout(() => runNextBotWithDelay(), getAnimDuration(BASE_ANIM.betweenBots));
}

function runNextBotWithDelay() {
  // Safety check: if game was reset, don't continue
  if (isStartingGame) return;
  
  if (!gameState.turnSeat) {
    return;
  }
  
  const seat = gameState.turnSeat;
  
  // Check if this seat is a bot
  // In demo mode, isBotSeat returns true for ALL seats including bottom
  if (!isBotSeat(seat)) {
    // Not a bot seat - must be bottom in non-demo mode
    setStatus('Bots have played. Your turn: draw from DECK or PACK.');
    return;
  }

  setGameTimeout(() => {
    // Safety check again after delay
    if (isStartingGame) return;
    
    try {
      runSingleBotTurn(seat);
      // Note: The next bot turn will be triggered by the animation callback
    } catch (e) {
      console.error('Bot error during runSingleBotTurn', e);
      setStatus('Bot error: ' + (e && e.message ? e.message : 'unknown error') + '. Skipping to your turn.');
      gameState.turnSeat = 'bottom';
      renderMiniHands();
      renderPiles();
      renderBottomSetRow();
      renderTopSetRow();
      renderLeftSetRow();
      renderRightSetRow();
      return;
    }
  }, getAnimDuration(BASE_ANIM.botDelay));
}

// Core draw animation function - works for ANY seat
// This is the single source of truth for draw animations
function animateDrawCore(source, seat, card, onComplete) {
  // Get source element (deck or pack)
  const sourceEl = source === 'deck' 
    ? document.getElementById('deckPile') 
    : document.getElementById('packArea');
  
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  // Get target element based on seat
  let targetEl;
  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
  } else {
    targetEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Calculate end position based on seat
  let endX, endY;
  if (seat === 'bottom') {
    // For player's hand, position at end of existing cards
    const cards = targetEl.querySelectorAll('.card');
    if (cards.length > 0) {
      const lastCard = cards[cards.length - 1];
      const lastCardRect = lastCard.getBoundingClientRect();
      endX = lastCardRect.right - 10;
      endY = lastCardRect.top;
    } else {
      endX = targetRect.left + targetRect.width / 2 - 50;
      endY = targetRect.top;
    }
  } else {
    // For other seats, center of mini-hand area
    endX = targetRect.left + targetRect.width / 2 - 50;
    endY = targetRect.top + targetRect.height / 2 - 75;
  }
  
  // Determine card image
  let cardImage = 'cards/BACK_JAMAICA.png';
  if (seat === 'bottom' && card && card.imageKey) {
    // Player sees their own cards
    cardImage = `cards/${card.imageKey}.png`;
  } else if (source === 'pack' && card && card.imageKey) {
    // Pack cards are visible to everyone
    cardImage = `cards/${card.imageKey}.png`;
  }
  // For deck draws by other players, keep card back
  
  // Create flying card with the EXACT same class as solo mode
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  flyingCard.style.backgroundImage = `url("${cardImage}")`;
  flyingCard.style.left = (sourceRect.left + sourceRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow to ensure starting position is applied
  flyingCard.offsetHeight;
  
  // Animate to target with flip effect for deck draws to player
  requestAnimationFrame(() => {
    // For deck draws to player, flip to show face during animation
    if (source === 'deck' && seat === 'bottom' && card && card.imageKey) {
      flyingCard.style.backgroundImage = `url("cards/${card.imageKey}.png")`;
    }
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.draw));
}

// Wrapper for backward compatibility - solo mode deck draw
function animateDrawFromDeck(card, onComplete) {
  animateDrawCore('deck', 'bottom', card, onComplete);
}

// Wrapper for backward compatibility - solo mode pack draw
function animateDrawFromPack(card, onComplete) {
  animateDrawCore('pack', 'bottom', card, onComplete);
}

// Animate bot drawing a card from deck or pack to their mini-hand
// Now uses the unified animateDrawCore function for consistency
function animateBotDraw(seat, source, onComplete) {
  // Use the unified core function - no separate bot animation logic needed
  // Pass null for card since bots' cards are hidden (shows card back)
  animateDrawCore(source, seat, null, onComplete);
}

function drawFromDeck() {
  if (multiplayerMode) {
    if (gameState.turnSeat !== 'bottom') {
      setStatus("It's not your turn.");
      return;
    }
    if (gameState.hasDrawn) {
      setStatus('You have already drawn this turn.');
      return;
    }
    mpDrawCard('deck');
    playSound('draw');
    return;
  }
  
  if (!isBottomTurn()) return;
  if (gameState.hasDrawn) {
    setStatus('You have already drawn this turn. Click a card in your hand to discard.');
    return;
  }
  if (!gameState.deck || gameState.deck.length === 0) {
    if (gameState.pack && gameState.pack.length > 1) {
      const topPack = gameState.pack[gameState.pack.length - 1];
      const rest = gameState.pack.slice(0, gameState.pack.length - 1);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = rest[i];
        rest[i] = rest[j];
        rest[j] = tmp;
      }
      gameState.deck = rest;
      gameState.pack = [topPack];
      packCardPositions.clear();
      renderPiles();
      setStatus('Deck was empty. PACK reshuffled into new DECK.');
    } else {
      setStatus('Deck is empty. Hand stalled.');
      gameState.turnSeat = null;
      return;
    }
  }

  startNewTurn();

  const card = gameState.deck.shift();
  
  playSound('draw');
  
  animateDrawFromDeck(card, () => {
    gameState.hands.bottom.push(card);
    gameState.hasDrawn = true;
    gameState.lastDrawSource = 'deck';
    gameState.lastPackCardId = null;
    
    // Track draw count for IN voting (closes voting when any player takes 2nd draw)
    incrementDrawCount('bottom');

    renderBottomHand();
    renderMiniHands();
    renderPiles();
    setStatus('You drew from the DECK. Play cards, then double-click a card in your hand to discard.');
  });
}

function drawFromPack() {
  if (multiplayerMode) {
    if (gameState.turnSeat !== 'bottom') {
      setStatus("It's not your turn.");
      return;
    }
    if (gameState.hasDrawn) {
      setStatus('You have already drawn this turn.');
      return;
    }
    if (!gameState.pack || gameState.pack.length === 0) {
      setStatus('There is no card in the PACK.');
      return;
    }
    mpDrawCard('pack');
    playSound('draw');
    return;
  }
  
  if (!isBottomTurn()) return;
  if (gameState.hasDrawn) {
    setStatus('You have already drawn this turn. Click a card in your hand to discard.');
    return;
  }
  if (!gameState.pack || gameState.pack.length === 0) {
    setStatus('There is no card in the PACK.');
    return;
  }

  const topCard = gameState.pack[gameState.pack.length - 1];
  if (
    topCard &&
    gameState.lastDiscardSource === 'deck' &&
    gameState.lastDiscardCardId === topCard.id &&
    gameState.lastDiscardSeat === 'bottom'
  ) {
    setStatus('You cannot immediately take back the card you just discarded after drawing from the DECK.');
    return;
  }

  startNewTurn();

  playSound('draw');

  const card = gameState.pack.pop();
  
  // Render piles first to remove the card from pack visually
  renderPiles();
  
  // Animate the card from pack to hand
  animateDrawFromPack(card, () => {
    gameState.hands.bottom.push(card);
    gameState.hasDrawn = true;
    gameState.lastDrawSource = 'pack';
    gameState.lastPackCardId = card.id;
    
    // Track draw count for IN voting (closes voting when any player takes 2nd draw)
    incrementDrawCount('bottom');

    renderBottomHand();
    renderMiniHands();
    setStatus('You took from the PACK. You must use that card in a meld before discarding.');
  });
}

function drawPackCardDirectToBottomMeld() {
  if (multiplayerMode) {
    drawFromPack();
    return;
  }
  
  if (!isBottomTurn()) return;
  if (gameState.hasDrawn) {
    setStatus('You have already drawn this turn. Click a card in your hand to discard.');
    return;
  }
  if (!gameState.pack || gameState.pack.length === 0) {
    setStatus('There is no card in the PACK.');
    return;
  }

  const topCard = gameState.pack[gameState.pack.length - 1];
  if (
    topCard &&
    gameState.lastDiscardSource === 'deck' &&
    gameState.lastDiscardCardId === topCard.id &&
    gameState.lastDiscardSeat === 'bottom'
  ) {
    setStatus('You cannot immediately take back the card you just discarded after drawing from the DECK.');
    return;
  }

  startNewTurn();

  const card = gameState.pack.pop();
  gameState.hasDrawn = true;
  gameState.lastDrawSource = 'pack';
  gameState.lastPackCardId = card.id;
  
  // Track draw count for IN voting (closes voting when any player takes 2nd draw)
  incrementDrawCount('bottom');

  card.laidTurn = gameState.currentTurnId || 0;
  card.groupId = nextGroupId();
  gameState.sets.bottom.push(card);
  autoSortGroupIfComplete(gameState.sets.bottom, card.groupId);

  renderBottomHand();
  renderBottomSetRow();
  renderMiniHands();
  renderPiles();

  setStatus('You took from the PACK and it has been placed directly into your meld row. You still need to discard to end your turn.');
}

function autoMeldPackCardToBottom() {
  if (!isBottomTurn()) return;

  if (!gameState.hasDrawn || gameState.lastDrawSource !== 'pack' || !gameState.lastPackCardId) {
    return;
  }

  const hand = gameState.hands.bottom;
  const idx = hand.findIndex(c => c.id === gameState.lastPackCardId);
  if (idx === -1) {
    return;
  }

  const [card] = hand.splice(idx, 1);
  card.laidTurn = gameState.currentTurnId || 0;
  card.groupId = nextGroupId();
  gameState.sets.bottom.push(card);
  autoSortGroupIfComplete(gameState.sets.bottom, card.groupId);

  renderBottomHand();
  renderBottomSetRow();
  renderMiniHands();

  setStatus('Your PACK card has been moved into your meld row. You still need to discard to end your turn.');
}

function wireControls() {
  const btnStart = document.getElementById('btnStart');
  const btnIn = document.getElementById('btnIn');
  const btnDebug = document.getElementById('btnDebug');
  const deckPile = document.getElementById('deckPile');
  const packPile = document.getElementById('packPile');

  if (btnStart) {
    btnStart.addEventListener('click', () => {
      startNewGame();
    });
  }

  if (btnIn) {
    // IN button is for multiplayer voting to restart the hand
    // Hidden in solo mode, only visible in multiplayer
    btnIn.addEventListener('click', () => {
      if (!multiplayerMode) {
        return; // Should be hidden anyway
      }
      
      // Check if voting is still open
      if (!gameState.inVoting.isOpen) {
        setStatus('Voting to restart is no longer available.');
        return;
      }
      
      // Check if player already voted
      if (gameState.inVoting.votes.includes('bottom')) {
        setStatus('You have already voted to restart.');
        return;
      }
      
      // Cast vote
      castInVote('bottom');
    });
  }

  if (btnDebug) {
    btnDebug.addEventListener('click', () => {
      DEBUG_MODE = !DEBUG_MODE;
      if (DEBUG_MODE) {
        btnDebug.classList.add('debug-on');
        btnDebug.textContent = 'Debug: ON';
        setStatus('DEBUG MODE: drag cards into any set box for testing. Turn/draw checks are relaxed.');
      } else {
        btnDebug.classList.remove('debug-on');
        btnDebug.textContent = 'Debug';
        setStatus('Debug mode off. Normal turn rules restored.');
      }
    });
  }

  if (deckPile) {
    deckPile.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      drawFromDeck();
    });
  }

  if (packPile) {
    packPile.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      drawPackCardDirectToBottomMeld();
    });
  }

  setupSetZoneDragAndDrop();
}

window.addEventListener('DOMContentLoaded', () => {
  wireControls();
  initSettings();
  initMultiplayer();
  loadPlayerStats();
});
