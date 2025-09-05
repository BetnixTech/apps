// server.js

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static frontend
app.use(express.static(path.join(__dirname)));

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, displayName }) => {
    socket.join(roomId);
    socket.data.displayName = displayName || "Guest";

    // Tell others
    socket.to(roomId).emit("peer-joined", {
      peerId: socket.id,
      displayName: socket.data.displayName
    });

    // Send current peers to the joining client
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const others = clients.filter(id => id !== socket.id);
    socket.emit("existing-peers", { peers: others });

    // Forward offers/answers/candidates
    socket.on("offer", ({ to, offer }) => {
      io.to(to).emit("offer", { from: socket.id, offer, displayName: socket.data.displayName });
    });

    socket.on("answer", ({ to, answer }) => {
      io.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("chat-message", msg => {
      io.to(roomId).emit("chat-message", { from: socket.id, name: socket.data.displayName, text: msg });
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("peer-left", { peerId: socket.id });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
