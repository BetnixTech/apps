// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend
app.use(express.static(path.join(__dirname)));

const rooms = {}; // roomName -> [socketIds]

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomName, displayName }) => {
    socket.join(roomName);
    socket.data.displayName = displayName || "Guest";

    if (!rooms[roomName]) rooms[roomName] = [];
    rooms[roomName].push(socket.id);

    // Inform others
    socket.to(roomName).emit("user-joined", {
      userId: socket.id,
      displayName: socket.data.displayName,
    });

    // Send current users to joining client
    const users = rooms[roomName]
      .filter((id) => id !== socket.id)
      .map((id) => ({
        userId: id,
        displayName: io.sockets.sockets.get(id)?.data.displayName || "Guest",
      }));
    socket.emit("current-users", users);

    // Messaging
    socket.on("chat-message", (msg) => {
      io.to(roomName).emit("chat-message", {
        from: socket.data.displayName,
        text: msg,
      });
    });

    socket.on("disconnect", () => {
      rooms[roomName] = rooms[roomName].filter((id) => id !== socket.id);
      socket.to(roomName).emit("user-left", { userId: socket.id });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
