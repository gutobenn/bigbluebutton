const Constants = require('./Constants.js');

// Messages

let OutMessage = require('./OutMessage.js');

let StartTranscoderRequestMessage =
    require('./transcode/StartTranscoderRequestMessage.js')(Constants);
let StopTranscoderRequestMessage =
    require('./transcode/StopTranscoderRequestMessage.js')(Constants);
let StartTranscoderSysReqMsg =
    require('./transcode/StartTranscoderSysReqMsg.js')(Constants);
let StopTranscoderSysReqMsg =
    require('./transcode/StopTranscoderSysReqMsg.js')(Constants);
let DeskShareRTMPBroadcastStartedEventMessage =
    require('./screenshare/DeskShareRTMPBroadcastStartedEventMessage.js')(Constants);
let DeskShareRTMPBroadcastStoppedEventMessage =
    require('./screenshare/DeskShareRTMPBroadcastStoppedEventMessage.js')(Constants);
let ScreenshareRTMPBroadcastStartedEventMessage2x =
    require('./screenshare/ScreenshareRTMPBroadcastStartedEventMessage2x.js')(Constants);
let ScreenshareRTMPBroadcastStoppedEventMessage2x =
    require('./screenshare/ScreenshareRTMPBroadcastStoppedEventMessage2x.js')(Constants);


 /**
  * @classdesc
  * Messaging utils to assemble JSON/Redis BigBlueButton messages 
  * @constructor
  */
function Messaging() {}

Messaging.prototype.generateStartTranscoderRequestMessage =
  function(meetingId, transcoderId, params) {
  let statrm;
  switch (Constants.COMMON_MESSAGE_VERSION) {
    case "1.x":
      statrm = new StartTranscoderRequestMessage(meetingId, transcoderId, params);
      break;
    default:
      statrm = new StartTranscoderSysReqMsg(meetingId, transcoderId, params);
  }
  return statrm.toJson();
}

Messaging.prototype.generateStopTranscoderRequestMessage =
  function(meetingId, transcoderId) {
  let stotrm;
  switch (Constants.COMMON_MESSAGE_VERSION) {
    case "1.x":
      stotrm = new StopTranscoderRequestMessage(meetingId, transcoderId);
      break;
    default:
      stotrm = new StopTranscoderSysReqMsg(meetingId, transcoderId);
  }
  return stotrm.toJson();
}

Messaging.prototype.generateDeskShareRTMPBroadcastStartedEvent =
  function(meetingId, screenshareConf, streamUrl, vw, vh, timestamp) {
  let stadrbem;
  switch (Constants.COMMON_MESSAGE_VERSION) {
    case "1.x":
      stadrbem = new DeskShareRTMPBroadcastStartedEventMessage(
          meetingId,
          streamUrl,
          vw,
          vh,
          timestamp
      );
      break;
    default:
      stadrbem = new ScreenshareRTMPBroadcastStartedEventMessage2x(
          screenshareConf,
          screenshareConf,
          streamUrl,
          vw,
          vh,
          timestamp
      );
  }
  return stadrbem.toJson();
}

Messaging.prototype.generateDeskShareRTMPBroadcastStoppedEvent =
  function(meetingId, screenshareConf, streamUrl, vw, vh, timestamp) {
  let stodrbem;
  switch (Constants.COMMON_MESSAGE_VERSION) {
    case "1.x":
      stodrbem = new DeskShareRTMPBroadcastStoppedEventMessage(
          meetingId,
          streamUrl,
          vw,
          vh,
          timestamp
      );
      break;
    default:
      stodrbem = new ScreenshareRTMPBroadcastStoppedEventMessage2x(
          screenshareConf,
          screenshareConf,
          streamUrl,
          vw,
          vh,
          timestamp
      );
  }
  return stodrbem.toJson();
}

module.exports = new Messaging();
