const shortid = require("shortid");
const Room = require("../models/room");

shortid.characters(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_@"
);
//To update the player information if some one has joined, left the room
//emits to everyone in the room including the sender
const sendRoomData = (io, roomId, document) => {
  io.in(roomId).emit("room-update", document);
};

//To send message from server to client (only to certain socket)
const sendAlert = (socket, message, severity) => {
  socket.emit("alert", {
    message,
    severity,
  });
};

//To add a room instance in mongodb
const addRoomToDb = (roomId, player1) => {
  const room = new Room({
    roomId: roomId,
    player1: player1,
    player2: { online: false },
    playedCells: [],
    winCells: [],
    won: false,
  });
  return room.save();
};

//To handle create room request. Adds room instance to mongodb and once added emits 'created-room'
const createRoom = (io, socket, name, roomId) => {
  if (roomId === undefined) roomId = shortid.generate();
  addRoomToDb(roomId, { id: socket.id, name, online: true })
    .then((document) => {
      socket.join(roomId);
      sendRoomData(io, roomId, document);
      socket.emit("created-room", { name, roomId });
    })
    .catch((error) => {
      sendAlert(socket, "Error creating room :(", "error");
    });
};

//To handle join request.
const joinRoom = (io, socket, name, roomId, oldSocketId) => {
  if (!shortid.isValid(roomId)) {
    socket.emit("redirect", { path: "/" });
    sendAlert(socket, "Invalid Room ID", "danger");
    return;
  }

  //Find one document with given roomId
  //If not found
  Room.findOne({ roomId: roomId })
    .then((document) => {
      //only when reconnecting the creator of room the document will be null
      //beacuse when old socket disconnects doc from 'rooms' collection is deleted
      //so on refresh we creat a room with same roomId

      //if there was only one user in room and he pressed refresh...the document gets deleted
      //so we create a room
      if (document === null) {
        if (oldSocketId === undefined) {
          socket.emit("redirect", { path: "/" });
          sendAlert(socket, "Room not found :(", "danger");
        } else {
          createRoom(io, socket, name, roomId);
        }
        return;
      }

      //only on reconnection oldSocketId is defined
      if (oldSocketId === undefined) {
        //If both players are online then room is full
        if (document.player1.online && document.player2.online) {
          socket.emit("redirect", { path: "/" });
          sendAlert(socket, "Room is full :(", "danger");
          return;
        }

        //if player one is offline we are waiting for any socket to be joined
        //(in else if) same applies for player 2
        if (!document.player1.online) {
          document.player1 = {
            id: socket.id,
            name,
            online: true,
          };
        } else if (!document.player2.online) {
          document.player2 = {
            id: socket.id,
            name,
            online: true,
          };
        }

        //saving the changes to mongodb and joining the current socket in to room
        document.save().then((updatedDocument) => {
          socket.join(roomId);
          sendRoomData(io, roomId, updatedDocument);
          socket.emit("joined-room", {
            name,
            roomId,
          });
          socket.to(roomId).broadcast.emit("alert", {
            message: `${name} joined the room :)`,
            severity: "info",
          });
          sendAlert(socket, `You joined the room :)`, "success");

          io.in(roomId).emit("game-status-update", document);
        });

        return;
      }

      //To rejoin users to their room

      //If player1 is rejoining
      //(in else if) player2 is rejoining
      if (document.player1.id == oldSocketId) {
        document.player1 = {
          id: socket.id,
          name,
          online: true,
        };
      } else if (document.player2.id == oldSocketId) {
        document.player2 = {
          id: socket.id,
          name,
          online: true,
        };
      }

      document.save().then((updatedDocument) => {
        socket.join(roomId);
        sendRoomData(io, roomId, updatedDocument);
        socket.emit("joined-room", {
          name,
          roomId,
        });
        socket.to(roomId).broadcast.emit("alert", {
          message: `${name} joined the room :)`,
          severity: "info",
        });
        sendAlert(socket, `You joined the room :)`, "success");
        io.in(roomId).emit("game-status-update", document);
      });
    })
    .catch((error) => {
      sendAlert(socket, `Server error :(`, "danger");
    });
};

const updateGameBoard = (
  io,
  socket,
  roomId,
  clickedAt,
  clickedBy,
  playedBy
) => {
  socket.to(roomId).broadcast.emit("on-user-selected", {
    clickedAt,
    clickedBy,
    playedBy,
  });

  Room.findOne({ roomId: roomId })
    .then((document) => {
      if (document === null) return;
      if (
        document.playedCells.find((cell) => cell.clickedAt === clickedAt) !==
        undefined
      )
        return;
      document.playedCells.push({ clickedAt, clickedBy });
      document
        .save()
        .then((updatedDocument) =>
          sendRoomData(io, roomId, updatedDocument, playedBy)
        );
    })
    .catch((reason) => {
      console.log(reason);
    });
};

const restartGame = (socket, roomId) => {
  socket.broadcast.emit("restart-game");
  Room.findOne({ roomId: roomId })
    .then((document) => {
      document.playedCells = [];
      document.save();
    })
    .catch((reason) => {
      console.log(reason);
    });
};

//when socket is disconneting we perform the following based on condition
//1. If only one player was online we delete the room (on reconnect join-room with oldsocketid is emitted)
//2. If both players were online, we check if the leaving socket is player1 or player2 and make them offline accordingly
const removeOrUpdateClientStatus = (io, socket) => {
  let rooms = Object.keys(socket.rooms); //[<socketid>,roomid]
  Room.findOne({
    roomId: rooms[1],
  })
    .then((document) => {
      if (document === null) return;
      if (!document.player1.online || !document.player2.online) {
        document.deleteOne();
        return;
      }
      if (document.player1.id == socket.id) {
        //emit to all in room expect the sending socket
        socket.to(document.roomId).broadcast.emit("alert", {
          message: `${document.player1.name} left the room :(`,
          severity: "warning",
        });
        document.player1 = { id: socket.id, online: false };
      } else if (document.player2.id == socket.id) {
        //emit to all in room expect the sending socket
        socket.to(document.roomId).broadcast.emit("alert", {
          message: `${document.player2.name} left the room :(`,
          severity: "warning",
        });
        document.player2 = { id: socket.id, online: false };
      }
      document
        .save()
        .then((updatedDocument) => {
          io.in(updatedDocument.roomId).emit("game-status-update", document);
          sendRoomData(io, updatedDocument.roomId, updatedDocument);
        })
        .catch((error) => console.log(error));
    })
    .catch((reason) => {
      console.log(reason);
    });
};

module.exports = {
  sendRoomData,
  sendAlert,
  addRoomToDb,
  createRoom,
  joinRoom,
  restartGame,
  removeOrUpdateClientStatus,
  updateGameBoard,
};
