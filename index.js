require("dotenv").config();
const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const socketHandler = require("./handlers/socketHandler");

const cors = require("cors");
app.use(cors());
app.options("*", cors());

//MongoDB Cloud (Atlas)
const dbURI = process.env.MONGODB_URI;
const port = process.env.PORT || 9900;

mongoose
  .connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.get("/", (req, res) => {
      res.send({ message: "I'm alive" });
    });

    io.on("connection", (socket) => {
      console.log("new connection :", socket.id);

      //on creating it emits 'created-room'
      socket.on("create-room", ({ name, roomId }) => {
        socketHandler.createRoom(io, socket, name, roomId);
      });

      //on joined it emits 'joined-room'
      socket.on("join-room", ({ name, roomId, oldSocketId }) => {
        socketHandler.joinRoom(io, socket, name, roomId, oldSocketId);
      });

      socket.on("on-user-selection", ({ roomId, completedCells, playedBy }) => {
        socketHandler.updateGameBoard(
          io,
          socket,
          roomId,
          completedCells,
          playedBy
        );
      });

      socket.on("game-restart", (roomId) => {
        socketHandler.restartGame(socket, roomId);
      });

      socket.on("disconnecting", () => {
        socketHandler.removeOrUpdateClientStatus(io, socket);
      });
    });
  })
  .catch((reason) => {
    console.log(reason);
  });

http.listen(port, () => {
  console.log(`Server is running at port ${port} :)`);
});
