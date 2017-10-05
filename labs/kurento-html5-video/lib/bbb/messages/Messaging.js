var Constants = require('./Constants.js');

// Messages

var OutMessage = require('./OutMessage.js');

var StartTranscoderRequestMessage =
    require('./transcode/StartTranscoderRequestMessage.js')(Constants);
var StopTranscoderRequestMessage =
    require('./transcode/StopTranscoderRequestMessage.js')(Constants);
var StartTranscoderSysReqMsg =
    require('./transcode/StartTranscoderSysReqMsg.js')();
var StopTranscoderSysReqMsg =
    require('./transcode/StopTranscoderSysReqMsg.js')();
var UserBroadcastCamStartedEventMessage2x =
    require('./video/UserBroadcastCamStartedEventMessage2x.js')(Constants);
var UserBroadcastCamStoppedEventMessage2x =
    require('./video/UserBroadcastCamStoppedEventMessage2x.js')(Constants);

 /**
  * @classdesc
  * Messaging utils to assemble JSON/Redis BigBlueButton messages 
  * @constructor
  */
function Messaging() {}

Messaging.prototype.generateStartTranscoderRequestMessage =
  function(meetingId, transcoderId, params) {
  var statrm = new StartTranscoderSysReqMsg(meetingId, transcoderId, params);
  return statrm.toJson();
}

Messaging.prototype.generateStopTranscoderRequestMessage =
  function(meetingId, transcoderId) {
  var stotrm = new StopTranscoderSysReqMsg(meetingId, transcoderId);
  return stotrm.toJson();
}

Messaging.prototype.generateUserBroadcastCamStartedEvent2x =
  function(userId, stream, meetingId) {
  var stadrbem = new UserBroadcastCamStartedEventMessage2x(userId, stream, meetingId);
  return stadrbem.toJson();
}

Messaging.prototype.generateUserBroadcastCamStoppedEvent2x =
  function(userId, stream) {
  var stadrbem = new UserBroadcastCamStoppedEventMessage2x(userId, stream);
  return stodrbem.toJson();
}

module.exports = new Messaging();
module.exports.Constants = Constants;
