const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const roomSchema = new Schema({
  roomId: String,
  player1: Schema.Types.Mixed,
  player2: Schema.Types.Mixed,
  playedCells: Schema.Types.Array,
});

const Room = mongoose.model("Room", roomSchema);
module.exports = Room;
