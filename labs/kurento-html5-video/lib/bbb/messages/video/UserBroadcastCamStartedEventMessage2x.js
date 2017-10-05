/*
 * 
 */

var inherits = require('inherits');
var OutMessage2x = require('../OutMessage2x');

module.exports = function (C) {
  function UserBroadcastCamStartedEventMessage2x (userId, stream, meetingId) {
    UserBroadcastCamStartedEventMessage2x.super_.call(this, C.USER_BROADCAST_CAM_STARTED_2x,
        {sender: "kurento-html5video"}, {userId: userId, meetingId: meetingId});

    this.core.body = {};
    this.core.body[C.STREAM] = stream;
    this.core.body["isHtml5Client"] = false;
  };

  inherits(UserBroadcastCamStartedEventMessage2x, OutMessage2x);
  return UserBroadcastCamStartedEventMessage2x;
}
