/*
 * 
 */

var inherits = require('inherits');
var OutMessage2x = require('../OutMessage2x');

module.exports = function (C) {
  function UserBroadcastCamStoppedEventMessage2x (userId, stream, meetingId) {
    UserBroadcastCamStoppedEventMessage2x.super_.call(this, C.USER_BROADCAST_CAM_STOPPED_2x,
        {sender: "kurento-html5video"}, {userId: userId, meetingId: meetingId});

    this.core.body = {};
    this.core.body[C.STREAM] = stream;
    this.core.body["isHtml5Client"] = false;
  };

  inherits(UserBroadcastCamStoppedEventMessage2x, OutMessage2x);
  return UserBroadcastCamStoppedEventMessage2x;
}
