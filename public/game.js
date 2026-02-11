import { DiscordSDK } from "https://unpkg.com/@discord/embedded-app-sdk@1.2.0/dist/index.mjs";

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || "1471127697739485308");

// تأكد من تحميل الصفحة داخل Discord
await discordSdk.ready();

// المصادقة
const { code } = await discordSdk.commands.authorize({
  client_id: discordSdk.clientId,
  response_type: "code",
  state: "",
  prompt: "none",
  scope: ["identify", "guilds", "applications.commands"]
});

const response = await fetch("/.proxy/api/token", { // هذه الـ API توفرها Discord Embedded App SDK
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code })
});
const { access_token } = await response.json();

const auth = await discordSdk.commands.authenticate({ access_token });
const discordUser = auth.user;
const userId = discordUser.id;
const username = discordUser.username;

// الحصول على معرف الغرفة (يمكنك توليده أو أخذه من الـ URL)
// Discord Activities تنشئ غرفة افتراضية بناءً على voice channel أو activity instance
const roomId = discordSdk.instanceId; // هذا المعرف الفريد لكل جلسة نشاط

// ------------------------------------------------------------
// باقي الكود الخاص بالشطرنج
const socket = io({
  path: "/socket.io", // تأكد من تطابق المسار مع السيرفر
  transports: ["websocket"]
});

const game = new Chess();
const board = document.getElementById("board");
let selected = null;
let gameStarted = false;
let myColor = null;

// الانضمام للغرفة مع userId
socket.emit("join", { roomId, userId });

// استقبال لون اللاعب
socket.on("colorAssigned", (color) => {
  myColor = color;
  console.log(`Your color: ${color === "w" ? "White" : "Black"}`);
});

// تحديث عدد اللاعبين (لعرض أسمائهم)
socket.on("players", (count) => {
  if (count < 2) {
    board.innerHTML = `<div class="waiting">🕶 انتظار الخصم... (${count}/2)</div>`;
  }
});

// بدء اللعبة
socket.on("startGame", ({ fen, turn, players }) => {
  gameStarted = true;
  game.load(fen);
  // عرض أسماء اللاعبين
  const white = players.find(p => p.color === "w");
  const black = players.find(p => p.color === "b");
  document.getElementById("player-names").innerHTML = `
    <span style="color:white;">⬜ ${white?.username || "أبيض"}</span> vs 
    <span style="color:black;">⬛ ${black?.username || "أسود"}</span>
  `;
  render();
});

// تحديث الرقعة
socket.on("updateBoard", (fen) => {
  game.load(fen);
  render();
});

// كش مات
socket.on("checkmate", () => {
  const winner = game.turn() === "w" ? "الأسود" : "الأبيض";
  board.innerHTML += `<div class="checkmate">♛ كِش مات! الفائز: ${winner} ♛</div>`;
});

socket.on("invalidMove", (msg) => alert(msg));
socket.on("roomFull", () => alert("الغرفة ممتلئة"));

function render() {
  board.innerHTML = "";
  const squares = game.board();
  squares.forEach((row, i) => {
    row.forEach((sq, j) => {
      const div = document.createElement("div");
      div.classList.add("square");
      div.classList.add((i + j) % 2 === 0 ? "white" : "black");
      if (sq) {
        div.textContent = getPieceIcon(sq);
        div.style.color = sq.color === "w" ? "#fff" : "#222";
      }
      const file = "abcdefgh"[j];
      const rank = 8 - i;
      const squareName = file + rank;
      if (selected === squareName) div.classList.add("selected");
      div.onclick = () => clickSquare(i, j);
      board.appendChild(div);
    });
  });
}

function getPieceIcon(piece) {
  const white = { p: "♙", r: "♖", n: "♘", b: "♗", q: "♕", k: "♔" };
  const black = { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" };
  return piece.color === "w" ? white[piece.type] : black[piece.type];
}

function clickSquare(row, col) {
  if (!gameStarted || !myColor) return;
  const file = "abcdefgh"[col];
  const rank = 8 - row;
  const square = file + rank;
  if (!selected) {
    const piece = game.get(square);
    if (piece && piece.color === myColor) selected = square;
    render();
  } else {
    socket.emit("move", { roomId, move: { from: selected, to: square } });
    selected = null;
  }
}