import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Chess } from "chess.js";

const app = express();
app.use(express.static("public")); // مجلد الواجهة

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // سيتم تقييده لاحقاً عبر Discord
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // تخزين بيانات الغرف

io.on("connection", (socket) => {
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
    room.players.push({ id: socket.id, userId, color });

    socket.emit("colorAssigned", color);
    io.to(roomId).emit("players", room.players.length);

    if (room.players.length === 2) {
      io.to(roomId).emit("startGame", {
        fen: room.game.fen(),
        turn: room.turn,
        players: room.players.map(p => ({ userId: p.userId, color: p.color }))
      });
    }

    socket.on("disconnect", () => {
      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("players", room.players.length);
      if (room.players.length === 0) delete rooms[roomId];
    });
  });

  socket.on("move", ({ roomId, move }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (room.game.turn() !== player.color) {
      socket.emit("invalidMove", "ليس دورك");
      return;
    }

    try {
      const result = room.game.move(move);
      if (result) {
        io.to(roomId).emit("updateBoard", room.game.fen());
        if (room.game.isCheckmate()) {
          io.to(roomId).emit("checkmate");
        }
        room.turn = room.game.turn();
      } else {
        socket.emit("invalidMove", "حركة غير قانونية");
      }
    } catch {
      socket.emit("invalidMove", "خطأ في النقلة");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mafia Chess running on port ${PORT}`);
});