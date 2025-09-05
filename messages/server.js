// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// In-memory storage
const users = {}; // phone -> socket.id

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("login", ({ phone }) => {
    socket.data.phone = phone;
    users[phone] = socket.id;
    socket.emit("login-success", phone);
  });

  socket.on("send-message", ({ toPhone, text }) => {
    const toSocketId = users[toPhone];
    if (toSocketId) {
      io.to(toSocketId).emit("receive-message", {
        fromPhone: socket.data.phone,
        text
      });
    } else {
      socket.emit("error-message", "User not online");
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.phone) {
      delete users[socket.data.phone];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
