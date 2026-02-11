import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Chess } from "chess.js";

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};
const aiPlayers = {};

io.on("connection", (socket) => {
  // تسجيل الدخول
  socket.on("login", (userData) => {
    socket.userData = userData;
    socket.emit("login_success", userData);
    console.log(`👑 ${userData.username} دخل القلعة`);
  });

  // انضمام للعبة بشرية
  socket.on("join", ({ roomId, userId }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        game: new Chess(),
        players: [],
        turn: "w"
      };
    }

    const room = rooms[roomId];

    if (room.players.length >= 2) {
      socket.emit("roomFull");
      return;
    }

    const color = room.players.length === 0 ? "w" : "b";
    room.players.push({ 
      id: socket.id, 
      userId, 
      color,
      userData: socket.userData 
    });

    socket.emit("colorAssigned", color);
    io.to(roomId).emit("players", room.players.map(p => p.userData));

    if (room.players.length === 2) {
      io.to(roomId).emit("startGame", {
        fen: room.game.fen(),
        turn: room.turn,
        players: room.players.map(p => ({ 
          userId: p.userId, 
          color: p.color,
          userData: p.userData 
        }))
      });
    }

    socket.on("disconnect", () => {
      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("players", room.players.map(p => p.userData));
      if (room.players.length === 0) delete rooms[roomId];
    });
  });

  // لعبة ضد الذكاء الاصطناعي
  socket.on("play_ai", ({ difficulty = "medium" }) => {
    const game = new Chess();
    
    aiPlayers[socket.id] = {
      game,
      difficulty,
      playerColor: "w",
      aiColor: "b"
    };

    socket.emit("ai_game_started", {
      fen: game.fen(),
      playerColor: "w",
      difficulty
    });

    console.log(`🤖 ${socket.userData?.username || "لاعب"} بدأ معركة ضد الذكاء الاصطناعي - ${
      difficulty === "easy" ? "سهل" : difficulty === "medium" ? "متوسط" : "صعب"
    }`);
  });

  // حركة ضد الذكاء الاصطناعي
  socket.on("ai_move", ({ move }) => {
    const aiGame = aiPlayers[socket.id];
    if (!aiGame) return;

    const game = aiGame.game;
    
    try {
      const result = game.move(move);
      if (result) {
        socket.emit("ai_board_update", game.fen());
        
        if (game.isGameOver()) {
          let winner = "";
          if (game.isCheckmate()) {
            winner = game.turn() === "w" ? "black" : "white";
          }
          socket.emit("ai_game_over", { 
            result: game.isCheckmate() ? "checkmate" : "gameover",
            winner
          });
          return;
        }

        // ذكاء اصطناعي يفكر 🤔
        setTimeout(() => {
          const aiMove = getAIMove(game, aiGame.difficulty);
          if (aiMove) {
            game.move(aiMove);
            socket.emit("ai_board_update", game.fen());
            
            if (game.isGameOver()) {
              let winner = "";
              if (game.isCheckmate()) {
                winner = game.turn() === "w" ? "black" : "white";
              }
              socket.emit("ai_game_over", { 
                result: game.isCheckmate() ? "checkmate" : "gameover",
                winner
              });
            }
          }
        }, 600);
      }
    } catch (e) {
      socket.emit("invalidMove", "❌ حركة غير قانونية");
    }
  });

  // حركة في اللعبة البشرية
  socket.on("move", ({ roomId, move }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (room.game.turn() !== player.color) {
      socket.emit("invalidMove", "⏳ ليس دورك");
      return;
    }

    try {
      const result = room.game.move(move);
      if (result) {
        io.to(roomId).emit("updateBoard", room.game.fen());
        if (room.game.isCheckmate()) {
          io.to(roomId).emit("checkmate", {
            winner: room.game.turn() === "w" ? "b" : "w"
          });
        }
        room.turn = room.game.turn();
      } else {
        socket.emit("invalidMove", "❌ حركة غير قانونية");
      }
    } catch {
      socket.emit("invalidMove", "❌ خطأ في النقلة");
    }
  });
});

// ذكاء اصطناعي متطور 🧠
function getAIMove(game, difficulty) {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;

  switch(difficulty) {
    case "easy":
      // سهل - حركات عشوائية
      return moves[Math.floor(Math.random() * moves.length)];
    
    case "medium":
      // متوسط - يفضل أكل القطع
      const captures = moves.filter(m => m.flags.includes('c'));
      if (captures.length > 0) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
      // يفضل التحرك للأمام
      const forwardMoves = moves.filter(m => 
        m.piece === 'p' && parseInt(m.to[1]) > parseInt(m.from[1])
      );
      if (forwardMoves.length > 0) {
        return forwardMoves[Math.floor(Math.random() * forwardMoves.length)];
      }
      return moves[Math.floor(Math.random() * moves.length)];
    
    case "hard":
      // صعب - ذكاء متقدم
      // 1. أكل القطع أولوية قصوى
      const goodCaptures = moves.filter(m => {
        if (m.flags.includes('c')) {
          const capturedPiece = game.get(m.to);
          const movingPiece = game.get(m.from);
          // تقييم القيمة: ملكة > قلعة > حصان/فيل > جندي
          if (capturedPiece) {
            const values = { q: 9, r: 5, n: 3, b: 3, p: 1, k: 100 };
            return values[capturedPiece.type] >= values[movingPiece.type];
          }
        }
        return false;
      });
      
      if (goodCaptures.length > 0) {
        return goodCaptures[Math.floor(Math.random() * goodCaptures.length)];
      }
      
      // 2. تحريك القطع القريبة من الملك
      const centerMoves = moves.filter(m => {
        const col = m.to.charCodeAt(0) - 97;
        const row = parseInt(m.to[1]) - 1;
        return col >= 2 && col <= 5 && row >= 2 && row <= 5;
      });
      
      if (centerMoves.length > 0) {
        return centerMoves[Math.floor(Math.random() * centerMoves.length)];
      }
      
      return moves[Math.floor(Math.random() * moves.length)];
    
    default:
      return moves[Math.floor(Math.random() * moves.length)];
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`♛ Mafia Chess v2.0 - الملكي ♛`);
  console.log(`🚀 سيرفر شغال على البورت ${PORT}`);
});