const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Disable caching for JS files to ensure fresh code loads
app.use((req, res, next) => {
  if (req.url.endsWith('.js') || req.url.endsWith('.css')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = new Map();

const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SEATS = ['bottom', 'left', 'top', 'right'];

// Animation timing delays - calculated for slowest speed (50%) to ensure
// animations always complete before state updates arrive
// Formula: BASE_MS * 2 (for 50% speed) + 50ms buffer + 25% safety margin
const ANIM_DELAYS = {
  DRAW: 1300,      // 500ms base * 2 + 50 + 25% = ~1300ms
  DISCARD: 1200,   // 450ms base * 2 + 50 + 25% = ~1200ms  
  BOT_TURN: 1500,  // Extra time for bot AI + animation
  DEAL_TOTAL: 9000 // 52 cards at slow speed + first pack flip + buffer
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function buildDeck() {
  const deck = [];
  let idCounter = 0;

  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const code = rank + suit;
        deck.push({
          id: 'card_' + (idCounter++),
          rank,
          suit,
          code
        });
      }
    }
  }

  for (let j = 0; j < 2; j++) {
    deck.push({
      id: 'joker_' + j,
      rank: 'JOKER',
      suit: 'J',
      code: 'JOKER'
    });
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function initGameState(room) {
  const deck = buildDeck();
  
  const dealerIndex = Math.floor(Math.random() * 4);
  const dealerSeat = SEATS[dealerIndex];
  const firstPlayerIndex = (dealerIndex + 1) % 4;
  const firstPlayerSeat = SEATS[firstPlayerIndex];

  const gameState = {
    deck: deck,
    hands: { bottom: [], top: [], left: [], right: [] },
    sets: { bottom: [], top: [], left: [], right: [] },
    pack: [],
    turnSeat: firstPlayerSeat,
    hasDrawn: false,
    currentDealer: dealerSeat,
    opened: { bottom: false, top: false, left: false, right: false },
    eliminated: { bottom: false, top: false, left: false, right: false },
    nextGroupId: 1,
    gameOver: false,
    winner: null
  };

  for (let i = 0; i < 13; i++) {
    for (const seat of SEATS) {
      if (gameState.deck.length > 0) {
        gameState.hands[seat].push(gameState.deck.pop());
      }
    }
  }

  if (gameState.deck.length > 0) {
    gameState.pack.push(gameState.deck.pop());
  }

  room.gameState = gameState;
  return gameState;
}

function getPlayerView(room, playerId) {
  const gameState = room.gameState;
  if (!gameState) return null;

  const playerInfo = room.players.find(p => p.id === playerId);
  if (!playerInfo) return null;

  const mySeat = playerInfo.seat;
  const seatRotation = SEATS.indexOf(mySeat);

  const rotatedHands = {};
  const rotatedSets = {};
  const rotatedOpened = {};
  const rotatedEliminated = {};
  const rotatedPlayers = {};

  for (let i = 0; i < 4; i++) {
    const actualSeat = SEATS[(seatRotation + i) % 4];
    const viewSeat = SEATS[i];

    if (viewSeat === 'bottom') {
      rotatedHands[viewSeat] = gameState.hands[actualSeat];
    } else {
      rotatedHands[viewSeat] = gameState.hands[actualSeat].map(card => ({
        id: card.id,
        hidden: true
      }));
    }

    rotatedSets[viewSeat] = gameState.sets[actualSeat];
    rotatedOpened[viewSeat] = gameState.opened[actualSeat];
    rotatedEliminated[viewSeat] = gameState.eliminated[actualSeat];

    const playerAtSeat = room.players.find(p => p.seat === actualSeat);
    rotatedPlayers[viewSeat] = playerAtSeat ? {
      name: playerAtSeat.name,
      isBot: playerAtSeat.isBot || false,
      isMe: playerAtSeat.id === playerId
    } : null;
  }

  const rotatedTurnSeat = SEATS[(SEATS.indexOf(gameState.turnSeat) - seatRotation + 4) % 4];
  const rotatedDealer = SEATS[(SEATS.indexOf(gameState.currentDealer) - seatRotation + 4) % 4];

  return {
    hands: rotatedHands,
    sets: rotatedSets,
    pack: gameState.pack,
    deckCount: gameState.deck.length,
    turnSeat: rotatedTurnSeat,
    hasDrawn: gameState.hasDrawn,
    currentDealer: rotatedDealer,
    opened: rotatedOpened,
    eliminated: rotatedEliminated,
    players: rotatedPlayers,
    gameOver: gameState.gameOver,
    winner: gameState.winner
  };
}

function isMyTurn(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;
  return room.gameState.turnSeat === player.seat;
}

function getActualSeat(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  return player ? player.seat : null;
}

// Convert an actual seat to the view seat for a specific player
function getViewSeat(room, viewerPlayerId, actualSeat) {
  const viewer = room.players.find(p => p.id === viewerPlayerId);
  if (!viewer) return actualSeat;
  
  const viewerSeatIndex = SEATS.indexOf(viewer.seat);
  const actualSeatIndex = SEATS.indexOf(actualSeat);
  const rotatedIndex = (actualSeatIndex - viewerSeatIndex + 4) % 4;
  return SEATS[rotatedIndex];
}

function advanceTurn(room) {
  const currentIndex = SEATS.indexOf(room.gameState.turnSeat);
  let nextIndex = (currentIndex + 1) % 4;
  
  let attempts = 0;
  while (room.gameState.eliminated[SEATS[nextIndex]] && attempts < 4) {
    nextIndex = (nextIndex + 1) % 4;
    attempts++;
  }

  room.gameState.turnSeat = SEATS[nextIndex];
  room.gameState.hasDrawn = false;

  const nextPlayer = room.players.find(p => p.seat === SEATS[nextIndex]);
  if (nextPlayer && nextPlayer.isBot) {
    // Use ANIM_DELAYS.BOT_TURN to ensure previous animations complete before next bot starts
    setTimeout(() => processBotTurn(room), ANIM_DELAYS.BOT_TURN);
  }
}

function processBotTurn(room) {
  const botSeat = room.gameState.turnSeat;
  const botPlayer = room.players.find(p => p.seat === botSeat);
  if (!botPlayer || !botPlayer.isBot) return;

  if (room.gameState.deck.length > 0) {
    const card = room.gameState.deck.pop();
    room.gameState.hands[botSeat].push(card);
    room.gameState.hasDrawn = true;

    // Emit draw animation to all human players
    room.players.forEach(player => {
      if (player.isBot) return;
      const playerSocket = io.sockets.sockets.get(player.id);
      if (!playerSocket) return;
      
      const viewSeat = getViewSeat(room, player.id, botSeat);
      playerSocket.emit('animateDraw', {
        source: 'deck',
        seat: viewSeat,
        card: { hidden: true },
        isMe: false
      });
    });

    setTimeout(() => broadcastGameState(room), ANIM_DELAYS.DRAW);

    setTimeout(() => {
      const hand = room.gameState.hands[botSeat];
      if (hand.length > 0) {
        const discardIndex = Math.floor(Math.random() * hand.length);
        const discardCard = hand.splice(discardIndex, 1)[0];
        room.gameState.pack.push(discardCard);

        // Emit discard animation to all human players
        room.players.forEach(player => {
          if (player.isBot) return;
          const playerSocket = io.sockets.sockets.get(player.id);
          if (!playerSocket) return;
          
          const viewSeat = getViewSeat(room, player.id, botSeat);
          playerSocket.emit('animateDiscard', {
            seat: viewSeat,
            card: discardCard
          });
        });

        if (hand.length === 0) {
          room.gameState.gameOver = true;
          room.gameState.winner = botPlayer.name;
        }

        advanceTurn(room);
        // Just broadcast state after discard animation - advanceTurn already handles bot scheduling
        setTimeout(() => {
          broadcastGameState(room);
        }, ANIM_DELAYS.DISCARD);
      }
    }, ANIM_DELAYS.BOT_TURN);
  }
}

function broadcastGameState(room) {
  room.players.forEach(player => {
    if (!player.isBot) {
      const view = getPlayerView(room, player.id);
      io.to(player.id).emit('gameStateUpdate', view);
    }
  });
  
  if (room.spectators && room.spectators.length > 0) {
    const spectatorView = getSpectatorView(room);
    room.spectators.forEach(spectator => {
      io.to(spectator.id).emit('gameStateUpdate', spectatorView);
    });
  }
}

function getSpectatorView(room) {
  const gameState = room.gameState;
  if (!gameState) return null;

  const spectatorHands = {};
  const playerInfo = {};

  for (const seat of SEATS) {
    spectatorHands[seat] = gameState.hands[seat].map(card => ({
      id: card.id,
      hidden: true
    }));

    const playerAtSeat = room.players.find(p => p.seat === seat);
    playerInfo[seat] = playerAtSeat ? {
      name: playerAtSeat.name,
      isBot: playerAtSeat.isBot || false,
      isMe: false
    } : null;
  }

  return {
    hands: spectatorHands,
    sets: gameState.sets,
    pack: gameState.pack,
    deckCount: gameState.deck.length,
    turnSeat: gameState.turnSeat,
    hasDrawn: gameState.hasDrawn,
    currentDealer: gameState.currentDealer,
    opened: gameState.opened,
    eliminated: gameState.eliminated,
    players: playerInfo,
    gameOver: gameState.gameOver,
    winner: gameState.winner,
    isSpectator: true
  };
}

function broadcastOverlay(room, overlayType, data) {
  io.to(room.code).emit('showOverlay', {
    type: overlayType,
    data: data
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('createRoom', (data) => {
    const { playerName, maxPlayers } = data;
    const roomCode = generateRoomCode();
    
    const room = {
      code: roomCode,
      hostId: socket.id,
      maxPlayers: maxPlayers,
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true,
        seat: 'bottom'
      }],
      spectators: [],
      gameState: null,
      gameStarted: false
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`Room created: ${roomCode} by ${playerName}`);
    
    socket.emit('roomCreated', {
      roomCode: roomCode,
      maxPlayers: maxPlayers,
      players: room.players
    });
  });
  
  socket.on('joinRoom', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('joinError', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    
    if (room.gameStarted) {
      socket.emit('joinError', { message: 'Game has already started.' });
      return;
    }
    
    if (room.players.length >= room.maxPlayers) {
      socket.emit('joinError', { message: 'Room is full.' });
      return;
    }
    
    const existingNames = room.players.map(p => p.name.toLowerCase());
    if (existingNames.includes(playerName.toLowerCase())) {
      socket.emit('joinError', { message: 'That name is already taken in this room.' });
      return;
    }
    
    const usedSeats = room.players.map(p => p.seat);
    const availableSeat = SEATS.find(s => !usedSeats.includes(s));
    
    room.players.push({
      id: socket.id,
      name: playerName,
      isHost: false,
      seat: availableSeat
    });
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`${playerName} joined room ${roomCode}`);
    
    socket.emit('roomJoined', {
      roomCode: roomCode,
      maxPlayers: room.maxPlayers,
      players: room.players
    });
    
    socket.to(roomCode).emit('playerJoined', {
      players: room.players,
      maxPlayers: room.maxPlayers
    });
  });
  
  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket);
  });
  
  socket.on('spectateRoom', (data) => {
    const { roomCode, spectatorName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('spectateError', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    
    room.spectators = room.spectators || [];
    
    room.spectators.push({
      id: socket.id,
      name: spectatorName
    });
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.isSpectator = true;
    
    console.log(`Spectator ${spectatorName} joined room ${roomCode}`);
    
    socket.emit('spectateJoined', {
      roomCode: roomCode,
      players: room.players,
      gameStarted: room.gameStarted
    });
    
    if (room.gameStarted && room.gameState) {
      const spectatorView = getSpectatorView(room);
      socket.emit('gameStateUpdate', spectatorView);
    }
  });
  
  socket.on('leaveSpectate', () => {
    handleSpectatorLeave(socket);
  });
  
  socket.on('rejoinAsSpectator', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    
    if (!room || !room.gameStarted) {
      socket.emit('spectateError', { message: 'Game not found or not started.' });
      return;
    }
    
    room.spectators = room.spectators || [];
    room.spectators.push({
      id: socket.id,
      name: 'Spectator'
    });
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.isSpectator = true;
    
    const spectatorView = getSpectatorView(room);
    socket.emit('gameStateUpdate', spectatorView);
  });
  
  socket.on('startGame', (data) => {
    const room = rooms.get(data.roomCode);
    
    if (!room) return;
    if (socket.id !== room.hostId) return;
    
    room.gameStarted = true;
    
    const botsNeeded = 4 - room.players.length;
    const botNames = ['Bot 1', 'Bot 2', 'Bot 3'];
    let botIndex = 0;
    
    for (const seat of SEATS) {
      const hasPlayer = room.players.some(p => p.seat === seat);
      if (!hasPlayer && botIndex < botsNeeded) {
        room.players.push({
          id: `bot-${botIndex}`,
          name: botNames[botIndex],
          isBot: true,
          seat: seat
        });
        botIndex++;
      }
    }
    
    initGameState(room);
    room.dealAnimationSent = false;
    room.playersRejoined = 0;
    room.humanPlayerCount = room.players.filter(p => !p.isBot).length;
    
    console.log(`Game starting in room ${data.roomCode} with ${room.humanPlayerCount} human players`);
    
    io.to(data.roomCode).emit('gameStarting', {
      roomCode: data.roomCode,
      players: room.players
    });
    
    if (room.spectators && room.spectators.length > 0) {
      room.spectators.forEach(spectator => {
        io.to(spectator.id).emit('spectateGameStarting', {
          roomCode: data.roomCode,
          players: room.players
        });
      });
    }
    
    // Deal animation will be triggered when players rejoin via rejoinGame
  });

  socket.on('rejoinGame', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    console.log(`rejoinGame attempt: ${playerName} trying to join ${roomCode}`);
    
    if (!room || !room.gameStarted) {
      console.log(`Room ${roomCode} not found or game not started`);
      return;
    }
    
    // First try to find a disconnected player with matching name
    let player = room.players.find(p => 
      (p.name === playerName || p.originalName === playerName) && 
      p.disconnected && 
      !p.isBot
    );
    
    // Also check for player that was converted to bot (can reclaim)
    if (!player) {
      player = room.players.find(p => 
        p.originalName === playerName && p.isBot && p.wasHuman
      );
      if (player) {
        console.log(`Reclaiming bot seat for ${playerName}`);
        player.isBot = false;
        player.wasHuman = false;
      }
    }
    
    // Also check for exact match (already connected player)
    if (!player) {
      player = room.players.find(p => p.name === playerName && !p.isBot);
    }
    
    if (player) {
      // Reconnect the player
      player.id = socket.id;
      player.disconnected = false;
      player.name = player.originalName || player.name;
      
      socket.join(roomCode);
      socket.roomCode = roomCode;
      
      console.log(`Player ${playerName} reconnected to room ${roomCode}`);
      
      // Track rejoins for initial deal animation
      if (!room.dealAnimationSent) {
        room.playersRejoined = (room.playersRejoined || 0) + 1;
        console.log(`Players rejoined: ${room.playersRejoined}/${room.humanPlayerCount}`);
        
        // When all human players have rejoined, trigger deal animation
        if (room.playersRejoined >= room.humanPlayerCount) {
          room.dealAnimationSent = true;
          
          // Short delay to let pages fully load
          setTimeout(() => {
            console.log('Sending dealInit with empty hands, then animation');
            
            // FIRST: Send dealInit with EMPTY hands so DOM exists but no cards shown
            room.players.forEach(p => {
              if (p.isBot || p.disconnected) return;
              const pSocket = io.sockets.sockets.get(p.id);
              if (!pSocket) return;
              
              const mySeat = p.seat;
              const dealerViewSeat = getViewSeat(room, p.id, room.gameState.currentDealer);
              
              // Send empty state - hands are empty arrays
              pSocket.emit('dealInit', {
                dealer: dealerViewSeat,
                deckCount: 52,
                players: room.players.map((pl, idx) => ({
                  name: pl.name,
                  seat: getViewSeat(room, p.id, pl.seat),
                  isMe: pl.seat === mySeat
                }))
              });
            });
            
            // After dealInit renders empty layout, send animateDeal (500ms for DOM to render)
            setTimeout(() => {
              room.players.forEach(p => {
                if (p.isBot || p.disconnected) return;
                const pSocket = io.sockets.sockets.get(p.id);
                if (!pSocket) return;
                
                const dealerViewSeat = getViewSeat(room, p.id, room.gameState.currentDealer);
                pSocket.emit('animateDeal', { dealer: dealerViewSeat });
              });
              
              // Send real game state AFTER deal animation completes
              // Uses ANIM_DELAYS.DEAL_TOTAL to support slowest animation speed (50%)
              setTimeout(() => {
                broadcastGameState(room);
                
                // Start first bot turn after state delivered
                setTimeout(() => {
                  const firstPlayer = room.players.find(p => p.seat === room.gameState.turnSeat);
                  if (firstPlayer && firstPlayer.isBot) {
                    processBotTurn(room);
                  }
                }, 500);
              }, ANIM_DELAYS.DEAL_TOTAL);
            }, 500);
          }, 300);
        }
      } else {
        // Game already in progress, just send current state
        const view = getPlayerView(room, socket.id);
        socket.emit('gameStateUpdate', view);
      }
    }
  });

  socket.on('drawCard', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameState) return;
    
    if (!isMyTurn(room, socket.id)) {
      socket.emit('actionError', { message: 'Not your turn' });
      return;
    }
    
    if (room.gameState.hasDrawn) {
      socket.emit('actionError', { message: 'Already drew this turn' });
      return;
    }
    
    const mySeat = getActualSeat(room, socket.id);
    const source = data.source;
    let drawnCard = null;
    
    if (source === 'deck') {
      if (room.gameState.deck.length === 0) {
        socket.emit('actionError', { message: 'Deck is empty' });
        return;
      }
      drawnCard = room.gameState.deck.pop();
      room.gameState.hands[mySeat].push(drawnCard);
      room.gameState.hasDrawn = true;
    } else if (source === 'pack') {
      if (room.gameState.pack.length === 0) {
        socket.emit('actionError', { message: 'Pack is empty' });
        return;
      }
      drawnCard = room.gameState.pack.pop();
      room.gameState.hands[mySeat].push(drawnCard);
      room.gameState.hasDrawn = true;
    }
    
    // Emit animation event to all players before state sync
    // Each player sees the draw from their perspective (rotated seat)
    room.players.forEach(player => {
      if (player.isBot) return;
      const playerSocket = io.sockets.sockets.get(player.id);
      if (!playerSocket) return;
      
      const viewSeat = getViewSeat(room, player.id, mySeat);
      const isMe = player.id === socket.id;
      
      playerSocket.emit('animateDraw', {
        source: source,
        seat: viewSeat,
        card: isMe ? drawnCard : { hidden: true },
        isMe: isMe
      });
    });
    
    // Delay state update to let animation play
    // Uses ANIM_DELAYS.DRAW to support slowest animation speed (50%)
    setTimeout(() => {
      if (rooms.has(socket.roomCode)) {
        broadcastGameState(room);
      }
    }, ANIM_DELAYS.DRAW);
  });

  socket.on('discardCard', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameState) return;
    
    if (!isMyTurn(room, socket.id)) {
      socket.emit('actionError', { message: 'Not your turn' });
      return;
    }
    
    if (!room.gameState.hasDrawn) {
      socket.emit('actionError', { message: 'Must draw before discarding' });
      return;
    }
    
    const mySeat = getActualSeat(room, socket.id);
    const hand = room.gameState.hands[mySeat];
    const cardIndex = hand.findIndex(c => c.id === data.cardId);
    
    if (cardIndex === -1) {
      socket.emit('actionError', { message: 'Card not in hand' });
      return;
    }
    
    const card = hand.splice(cardIndex, 1)[0];
    room.gameState.pack.push(card);
    
    // Emit animation event to all players
    room.players.forEach(player => {
      if (player.isBot) return;
      const playerSocket = io.sockets.sockets.get(player.id);
      if (!playerSocket) return;
      
      const viewSeat = getViewSeat(room, player.id, mySeat);
      
      playerSocket.emit('animateDiscard', {
        seat: viewSeat,
        card: card
      });
    });
    
    if (hand.length === 0) {
      const player = room.players.find(p => p.id === socket.id);
      room.gameState.gameOver = true;
      room.gameState.winner = player ? player.name : 'Unknown';
    }
    
    advanceTurn(room);
    
    // Delay state update to let animation play
    // Uses ANIM_DELAYS.DISCARD to support slowest animation speed (50%)
    setTimeout(() => {
      if (rooms.has(socket.roomCode)) {
        broadcastGameState(room);
      }
    }, ANIM_DELAYS.DISCARD);
  });

  socket.on('layMeld', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameState) return;
    
    if (!isMyTurn(room, socket.id)) {
      socket.emit('actionError', { message: 'Not your turn' });
      return;
    }
    
    const mySeat = getActualSeat(room, socket.id);
    const hand = room.gameState.hands[mySeat];
    const cardIds = data.cardIds;
    
    const cards = [];
    for (const cardId of cardIds) {
      const cardIndex = hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        socket.emit('actionError', { message: 'Card not in hand' });
        return;
      }
      cards.push(hand[cardIndex]);
    }
    
    for (const cardId of cardIds) {
      const cardIndex = hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        hand.splice(cardIndex, 1);
      }
    }
    
    const meldGroup = {
      id: 'meld_' + (room.gameState.nextGroupId++),
      cards: cards
    };
    
    room.gameState.sets[mySeat].push(meldGroup);
    room.gameState.opened[mySeat] = true;
    
    broadcastGameState(room);
  });

  // Handle extending an existing meld (playing a goer on any player's meld)
  socket.on('extendMeld', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameState) return;
    
    const cardId = data.cardId;
    
    if (!isMyTurn(room, socket.id)) {
      socket.emit('actionError', { message: 'Not your turn', action: 'extendMeld', cardId });
      return;
    }
    
    if (!room.gameState.hasDrawn) {
      socket.emit('actionError', { message: 'Must draw before playing cards', action: 'extendMeld', cardId });
      return;
    }
    
    const mySeat = getActualSeat(room, socket.id);
    const hand = room.gameState.hands[mySeat];
    
    // Validate the card is in hand
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      socket.emit('actionError', { message: 'Card not in hand', action: 'extendMeld', cardId });
      return;
    }
    
    // Get the target seat (convert from client view to actual seat)
    const targetViewSeat = data.targetSeat;
    const playerInfo = room.players.find(p => p.id === socket.id);
    if (!playerInfo) return;
    
    const seatRotation = SEATS.indexOf(playerInfo.seat);
    const targetActualSeat = SEATS[(SEATS.indexOf(targetViewSeat) + seatRotation) % 4];
    
    // Find the target meld group
    const targetSets = room.gameState.sets[targetActualSeat];
    if (!targetSets || targetSets.length === 0) {
      socket.emit('actionError', { message: 'No melds to extend', action: 'extendMeld', cardId });
      return;
    }
    
    const targetMeldIndex = targetSets.findIndex(meld => meld.id === data.meldId);
    if (targetMeldIndex === -1) {
      socket.emit('actionError', { message: 'Meld not found', action: 'extendMeld', cardId });
      return;
    }
    
    // Check if player has opened (40+ points) before allowing goers
    if (!room.gameState.opened[mySeat]) {
      socket.emit('actionError', { message: 'Must lay 40+ points first before playing goers', action: 'extendMeld', cardId });
      return;
    }
    
    // Remove card from hand
    const card = hand.splice(cardIndex, 1)[0];
    
    // Mark as goer if playing on another player's meld
    if (targetActualSeat !== mySeat) {
      card.isGoer = true;
    }
    
    // Add card to the target meld
    targetSets[targetMeldIndex].cards.push(card);
    
    // Check for win (empty hand)
    if (hand.length === 0) {
      const player = room.players.find(p => p.id === socket.id);
      room.gameState.gameOver = true;
      room.gameState.winner = player ? player.name : 'Unknown';
    }
    
    broadcastGameState(room);
  });

  socket.on('reorderHand', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameState) return;
    
    const mySeat = getActualSeat(room, socket.id);
    if (!mySeat) return;
    
    const hand = room.gameState.hands[mySeat];
    const newOrder = data.cardIds;
    
    const reorderedHand = [];
    for (const cardId of newOrder) {
      const card = hand.find(c => c.id === cardId);
      if (card) {
        reorderedHand.push(card);
      }
    }
    
    room.gameState.hands[mySeat] = reorderedHand;
    broadcastGameState(room);
  });

  socket.on('showVictory', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    
    broadcastOverlay(room, 'victory', {
      winnerName: data.winnerName,
      winnerSeat: data.winnerSeat
    });
  });

  socket.on('showElimination', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    
    broadcastOverlay(room, 'elimination', {
      playerName: data.playerName,
      playerSeat: data.playerSeat,
      reason: data.reason,
      details: data.details
    });
  });

  socket.on('inVote', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    
    if (!room.inVoting) {
      room.inVoting = {
        isOpen: true,
        votes: [],
        drawCounts: { bottom: 0, top: 0, left: 0, right: 0 }
      };
    }
    
    if (!room.inVoting.isOpen) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    if (room.inVoting.votes.some(v => v.playerId === socket.id)) return;
    
    room.inVoting.votes.push({
      playerId: socket.id,
      seat: player.seat,
      name: player.name
    });
    
    io.to(room.code).emit('inVoteUpdate', {
      voteCount: room.inVoting.votes.length,
      voterNames: room.inVoting.votes.map(v => v.name),
      voterSeats: room.inVoting.votes.map(v => v.seat)
    });
    
    if (room.inVoting.votes.length >= 3) {
      room.inVoting.isOpen = false;
      broadcastOverlay(room, 'inRestart', {
        voterNames: room.inVoting.votes.map(v => v.name)
      });
    }
  });

  socket.on('closeInVoting', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.inVoting) return;
    
    room.inVoting.isOpen = false;
    io.to(room.code).emit('inVotingClosed');
  });
  
  // Chat message handling
  socket.on('chatMessage', (data) => {
    const { roomCode, sender, message, isSpectator } = data;
    
    if (!roomCode || !message) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Sanitize message (basic - strip HTML)
    const sanitizedMessage = message.substring(0, 100).replace(/[<>]/g, '');
    
    // Broadcast to everyone in the room (players and spectators)
    io.to(roomCode).emit('chatMessage', {
      sender: sender || 'Anonymous',
      message: sanitizedMessage,
      isSpectator: isSpectator || false
    });
    
    console.log(`Chat [${roomCode}]: ${sender}: ${sanitizedMessage}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    handlePlayerLeave(socket);
  });
});

function handleSpectatorLeave(socket) {
  const roomCode = socket.roomCode;
  if (!roomCode) return;
  
  const room = rooms.get(roomCode);
  if (!room || !room.spectators) return;
  
  const spectatorIndex = room.spectators.findIndex(s => s.id === socket.id);
  if (spectatorIndex !== -1) {
    room.spectators.splice(spectatorIndex, 1);
    console.log(`Spectator left room ${roomCode}`);
  }
  
  socket.leave(roomCode);
  socket.roomCode = null;
  socket.isSpectator = false;
}

function handlePlayerLeave(socket) {
  if (socket.isSpectator) {
    handleSpectatorLeave(socket);
    return;
  }
  
  const roomCode = socket.roomCode;
  if (!roomCode) return;
  
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const playerIndex = room.players.findIndex(p => p.id === socket.id);
  if (playerIndex === -1) return;
  
  const leavingPlayer = room.players[playerIndex];
  const wasHost = leavingPlayer.isHost;
  
  if (room.gameStarted) {
    // Mark as disconnected but give grace period to reconnect (page navigation)
    leavingPlayer.disconnected = true;
    leavingPlayer.disconnectTime = Date.now();
    leavingPlayer.originalName = leavingPlayer.originalName || leavingPlayer.name;
    
    console.log(`Player ${leavingPlayer.name} disconnected from room ${roomCode} - waiting for reconnect`);
    
    // Set a timer to convert to bot if they don't reconnect within 10 seconds
    setTimeout(() => {
      const currentRoom = rooms.get(roomCode);
      if (!currentRoom) return;
      
      const player = currentRoom.players.find(p => p.seat === leavingPlayer.seat);
      if (player && player.disconnected && !player.isBot) {
        player.isBot = true;
        player.wasHuman = true; // Mark so they can reclaim their seat
        player.name = player.originalName + ' (Bot)';
        player.disconnected = false;
        
        console.log(`Player ${player.originalName} timed out - converted to bot in room ${roomCode}`);
        
        if (currentRoom.gameState && currentRoom.gameState.turnSeat === player.seat) {
          processBotTurn(currentRoom);
        }
        
        broadcastGameState(currentRoom);
      }
    }, 10000); // 10 second grace period
    
  } else {
    room.players.splice(playerIndex, 1);
  }
  
  socket.leave(roomCode);
  
  console.log(`Player left room ${roomCode}`);
  
  if (!room.gameStarted && (room.players.length === 0 || wasHost)) {
    io.to(roomCode).emit('roomClosed');
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} closed`);
  } else if (!room.gameStarted) {
    io.to(roomCode).emit('playerLeft', {
      players: room.players,
      maxPlayers: room.maxPlayers
    });
  }
}

setInterval(() => {
  rooms.forEach((room, code) => {
    if (!room.gameStarted && room.players.filter(p => !p.isBot).length === 0) {
      rooms.delete(code);
      console.log(`Empty room ${code} cleaned up`);
    }
  });
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`KALOOKI CHAMPION server running on http://localhost:${PORT}`);
  console.log('Multiplayer enabled with Socket.io');
});
