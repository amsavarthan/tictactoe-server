require("dotenv").config();
const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const socketHandler = require("./handlers/socketHandler");

//MongoDB Cloud (Atlas)
const dbURI = process.env.MONGODB_URI;
const port = process.env.PORT || 9900;

mongoose
  .connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.get("/", (req, res) => {
      res.send({ message: "I'm alive" });
    });

    // Add headers
    app.use(function (req, res, next) {
      // Website you wish to allow to connect
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Request methods you wish to allow
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, PUT, PATCH, DELETE"
      );

      // Pass to next layer of middleware
      next();
    });
  })
  .catch((reason) => {
    console.log(reason);
  });

io.on("connection", (socket) => {
  //on creating it emits 'created-room'
  socket.on("create-room", ({ name, roomId }) => {
    socketHandler.createRoom(io, socket, name, roomId);
  });

  //on joined it emits 'joined-room'
  socket.on("join-room", ({ name, roomId, oldSocketId }) => {
    socketHandler.joinRoom(io, socket, name, roomId, oldSocketId);
  });

  socket.on("on-user-selection", ({ roomId, completedCells, playedBy }) => {
    socketHandler.updateGameBoard(io, socket, roomId, completedCells, playedBy);
  });

  socket.on("game-restart", (roomId) => {
    socketHandler.restartGame(socket, roomId);
  });

  socket.on("disconnecting", () => {
    socketHandler.removeOrUpdateClientStatus(io, socket);
  });
});

http.listen(port, () => {
  console.log(`Server is running at port ${port} :)`);
});
