import { DiscordSDK } from "https://unpkg.com/@discord/embedded-app-sdk@1.2.0/dist/index.mjs";

// ------------------- تهيئة Discord -------------------
const discordSdk = new DiscordSDK("1471127697739485308");

// ------------------- متغيرات عامة -------------------
const socket = io();
let currentUser = null;
let currentGameMode = null;
let aiGame = null;
let game = new Chess();
let selected = null;
let myColor = null;
let aiDifficulty = "medium";

// ------------------- عناصر DOM -------------------
const loginScreen = document.getElementById("login-screen");
const gameScreen = document.getElementById("game-screen");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const gameModeMenu = document.getElementById("game-mode-menu");
const aiSettings = document.getElementById("ai-settings");
const onlineGame = document.getElementById("online-game");
const aiGameDiv = document.getElementById("ai-game");
const aiBoard = document.getElementById("ai-board");
const playOnlineBtn = document.getElementById("play-online-btn");
const playAiBtn = document.getElementById("play-ai-btn");
const startAiGameBtn = document.getElementById("start-ai-game-btn");
const difficultyCards = document.querySelectorAll(".difficulty-card");
const backToMenuBtn = document.getElementById("back-to-menu-btn");
const aiBackToMenuBtn = document.getElementById("ai-back-to-menu-btn");
const aiDifficultyDisplay = document.getElementById("ai-difficulty-display");
const aiTurnIndicator = document.getElementById("ai-turn-indicator");

// ------------------- تسجيل الدخول عبر Discord -------------------
loginBtn.addEventListener("click", async () => {
  try {
    await discordSdk.ready();
    
    const { code } = await discordSdk.commands.authorize({
      client_id: "YOUR_APPLICATION_ID_HERE",
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds"]
    });

    // ملاحظة: في الإنتاج، يجب أن يتم التبادل عبر السيرفر الخاص بك
    // هذا تبسيط للتجربة المحلية
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: "1471127697739485308",
        client_secret: "K9wmMLQf3n-Xns__GaMhuZMrNiNSA3Re",
        grant_type: "authorization_code",
        code: code,
        redirect_uri: window.location.origin,
      }),
    });

    const { access_token } = await response.json();
    const auth = await discordSdk.commands.authenticate({ access_token });
    
    currentUser = {
      id: auth.user.id,
      username: auth.user.username,
      avatar: `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png`,
      discriminator: auth.user.discriminator
    };

    socket.emit("login", currentUser);
    
    loginScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    userName.textContent = currentUser.username;
    userAvatar.src = currentUser.avatar;
    
  } catch (error) {
    console.error("Login error:", error);
    alert("❌ فشل تسجيل الدخول. تأكد من إعدادات Discord.");
  }
});

// ------------------- تسجيل الخروج -------------------
logoutBtn.addEventListener("click", () => {
  currentUser = null;
  gameScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  resetGame();
});

// ------------------- اختيار وضع اللعب -------------------
playOnlineBtn.addEventListener("click", () => {
  currentGameMode = "online";
  gameModeMenu.classList.add("hidden");
  aiSettings.classList.add("hidden");
  onlineGame.classList.remove("hidden");
  
  socket.emit("join", { 
    roomId: "mafia-room", 
    userId: currentUser?.id || "guest" 
  });
});

playAiBtn.addEventListener("click", () => {
  currentGameMode = "ai";
  gameModeMenu.classList.add("hidden");
  aiSettings.classList.remove("hidden");
});

// ------------------- اختيار مستوى الصعوبة -------------------
difficultyCards.forEach(card => {
  card.addEventListener("click", () => {
    difficultyCards.forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    aiDifficulty = card.dataset.difficulty;
  });
});

// ------------------- بدء لعبة الذكاء الاصطناعي -------------------
startAiGameBtn.addEventListener("click", () => {
  aiSettings.classList.add("hidden");
  aiGameDiv.classList.remove("hidden");
  
  const difficultyNames = {
    easy: "🟢 سهل",
    medium: "🟡 متوسط",
    hard: "🔴 صعب"
  };
  
  aiDifficultyDisplay.textContent = `🤖 ${difficultyNames[aiDifficulty]}`;
  
  socket.emit("play_ai", { difficulty: aiDifficulty });
});

// ------------------- أزرار الرجوع -------------------
backToMenuBtn.addEventListener("click", () => {
  onlineGame.classList.add("hidden");
  gameModeMenu.classList.remove("hidden");
  resetGame();
});

aiBackToMenuBtn.addEventListener("click", () => {
  aiGameDiv.classList.add("hidden");
  gameModeMenu.classList.remove("hidden");
  resetGame();
});

// ------------------- دوال اللعبة -------------------
function resetGame() {
  selected = null;
  myColor = null;
  game = new Chess();
  document.getElementById("board").innerHTML = "";
  if (aiBoard) aiBoard.innerHTML = "";
}

function render(boardElement, currentGame) {
  boardElement.innerHTML = "";
  const squares = currentGame.board();

  squares.forEach((row, i) => {
    row.forEach((sq, j) => {
      const div = document.createElement("div");
      div.classList.add("square");
      div.classList.add((i + j) % 2 === 0 ? "white" : "black");

      if (sq) {
        div.textContent = getPieceIcon(sq);
        div.style.color = sq.color === "w" ? "#fff" : "#222";
        div.style.textShadow = sq.color === "w" 
          ? "0 0 10px rgba(255,255,255,0.8)" 
          : "0 0 10px rgba(0,0,0,0.8)";
      }

      const file = "abcdefgh"[j];
      const rank = 8 - i;
      const squareName = file + rank;
      
      if (selected === squareName) {
        div.classList.add("selected");
      }

      div.onclick = () => clickSquare(i, j, boardElement, currentGame);
      boardElement.appendChild(div);
    });
  });
}

function getPieceIcon(piece) {
  // ايموجيات ملكية فاخرة 👑
  const whiteIcons = {
    p: "♙",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "👑",
    k: "🤴"
  };
  
  const blackIcons = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "👸",
    k: "🦹"
  };
  
  return piece.color === "w" ? whiteIcons[piece.type] : blackIcons[piece.type];
}

function clickSquare(row, col, boardElement, currentGame) {
  if (!currentUser && currentGameMode !== "ai") {
    alert("👑 سجل دخولك أولاً");
    return;
  }

  const file = "abcdefgh"[col];
  const rank = 8 - row;
  const square = file + rank;

  if (!selected) {
    const piece = currentGame.get(square);
    if (piece && piece.color === myColor) {
      selected = square;
      render(boardElement, currentGame);
    }
  } else {
    if (currentGameMode === "ai") {
      socket.emit("ai_move", { 
        move: { from: selected, to: square } 
      });
    } else {
      socket.emit("move", { 
        roomId: "mafia-room", 
        move: { from: selected, to: square } 
      });
    }
    selected = null;
  }
}

// ------------------- أحداث Socket.IO -------------------
socket.on("connect", () => {
  console.log("✅ اتصال السيرفر الملكي");
});

socket.on("login_success", (userData) => {
  console.log(`👑 مرحباً بك يا ${userData.username}`);
});

// أحداث اللعبة البشرية
socket.on("colorAssigned", (color) => {
  myColor = color;
  console.log(`🎨 لونك: ${color === "w" ? "أبيض 🤴" : "أسود 🦹"}`);
});

socket.on("players", (players) => {
  const playerNames = document.getElementById("player-names");
  if (players && players.length === 2) {
    playerNames.innerHTML = `
      <span>🤴 ${players[0]?.username || "الأبيض"}</span>
      <span>🦹 ${players[1]?.username || "الأسود"}</span>
    `;
  }
});

socket.on("startGame", ({ fen, players }) => {
  game.load(fen);
  render(document.getElementById("board"), game);
  
  const playerNames = document.getElementById("player-names");
  if (players) {
    const white = players.find(p => p.color === "w");
    const black = players.find(p => p.color === "b");
    playerNames.innerHTML = `
      <span>🤴 ${white?.userData?.username || "أبيض"}</span>
      <span>🦹 ${black?.userData?.username || "أسود"}</span>
    `;
  }
});

socket.on("updateBoard", (fen) => {
  game.load(fen);
  render(document.getElementById("board"), game);
});

// أحداث الذكاء الاصطناعي
socket.on("ai_game_started", ({ fen, playerColor, difficulty }) => {
  game = new Chess();
  game.load(fen);
  myColor = playerColor;
  aiGame = game;
  render(aiBoard, game);
});

socket.on("ai_board_update", (fen) => {
  game.load(fen);
  render(aiBoard, game);
  
  // تحديث دور اللعب
  if (aiTurnIndicator) {
    if (game.turn() === myColor) {
      aiTurnIndicator.className = "turn-indicator player-turn";
      aiTurnIndicator.innerHTML = "🎮 دورك";
    } else {
      aiTurnIndicator.className = "turn-indicator ai-turn";
      aiTurnIndicator.innerHTML = "🤖 دور الذكاء الاصطناعي";
    }
  }
});

socket.on("ai_game_over", ({ result, winner }) => {
  let message = "";
  if (result === "checkmate") {
    if (winner === "white") {
      message = "🤴 انتصر الملك الأبيض!";
    } else {
      message = "🦹 انتصر الملك الأسود!";
    }
  } else {
    message = "🤝 تعادل!";
  }
  
  const gameDiv = document.getElementById("ai-game");
  const checkmateDiv = document.createElement("div");
  checkmateDiv.className = "checkmate";
  checkmateDiv.innerHTML = message;
  gameDiv.appendChild(checkmateDiv);
  
  setTimeout(() => {
    checkmateDiv.remove();
  }, 5000);
});

socket.on("checkmate", ({ winner }) => {
  const gameDiv = document.getElementById("online-game");
  const checkmateDiv = document.createElement("div");
  checkmateDiv.className = "checkmate";
  checkmateDiv.innerHTML = winner === "w" 
    ? "🤴 فوز الملك الأبيض!" 
    : "🦹 فوز الملك الأسود!";
  gameDiv.appendChild(checkmateDiv);
  
  setTimeout(() => {
    checkmateDiv.remove();
  }, 5000);
});

socket.on("invalidMove", (msg) => {
  alert(msg);
  selected = null;
});

socket.on("roomFull", () => {
  alert("❌ الغرفة ممتلئة، حاول لاحقاً");
});

// ------------------- دوال مساعدة -------------------
window.addEventListener('load', () => {
  console.log("♛ Mafia Chess v2.0 - الإصدار الملكي ♛");
});