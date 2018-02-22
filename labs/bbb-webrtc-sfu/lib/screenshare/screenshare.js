/*
 * Lucas Fialho Zawacki
 * Paulo Renato Lanzarin
 * (C) Copyright 2017 Bigbluebutton
 *
 */

'use strict'

const C = require('../bbb/messages/Constants');
const MediaHandler = require('../media-handler');
const Messaging = require('../bbb/messages/Messaging');
const moment = require('moment');
const h264_sdp = require('../h264-sdp');
const now = moment();
const MCSApi = require('../mcs-core/lib/media/MCSApiStub');
const config = require('config');
const kurentoIp = config.get('kurentoIp');
const localIpAddress = config.get('localIpAddress');
const Logger = require('../utils/Logger');
const mediaFlowTimeoutDuration = config.get('mediaFlowTimeoutDuration');

// Global MCS endpoints mapping. These hashes maps IDs generated by the mcs-core
// lib to the ones generate in the ScreenshareManager
var sharedScreens = {};
var rtpEndpoints = {};

module.exports = class Screenshare {
  constructor(id, bbbgw, voiceBridge, caller = 'caller', vh, vw, meetingId, streamId) {
    this.mcs = new MCSApi();
    this._id = id;
    this._BigBlueButtonGW = bbbgw;
    this._presenterEndpoint = null;
    this._ffmpegEndpoint = null;
    this._voiceBridge = voiceBridge;
    this._meetingId = meetingId;
    this._streamId = streamId;
    this._caller = caller;
    this._streamUrl = "";
    this._vw = vw;
    this._vh = vh;
    this._presenterCandidatesQueue = [];
    this._viewersEndpoint = [];
    this._viewersCandidatesQueue = [];
    this._mediaFlowingTimeout = null;
  }

  onIceCandidate (_candidate) {
    Logger.debug("[screenshare] onIceCandidate");
    if (this._presenterEndpoint) {
      try {
        this.flushCandidatesQueue(this._presenterEndpoint, this._presenterCandidatesQueue);
        this.mcs.addIceCandidate(this._presenterEndpoint, _candidate);
      } catch (err) {
        Logger.error("[screenshare] ICE candidate could not be added to media controller.", err);
      }
    } else {
      Logger.debug("[screenshare] Pushing ICE candidate to presenter queue");
      this._presenterCandidatesQueue.push(_candidate);
    }
  }

  onViewerIceCandidate(candidate, callerName) {
    Logger.debug("[screenshare] onViewerIceCandidate");
    if (this._viewersEndpoint[callerName]) {
      try {
        this.flushCandidatesQueue(this._viewersEndpoint[callerName], this._viewersCandidatesQueue[callerName]);
        this.mcs.addIceCandidate(this._viewersEndpoint[callerName], candidate);
      } catch (err) {
        Logger.error("[screenshare] Viewer ICE candidate could not be added to media controller.", err);
      }
    } else {
      if (!this._viewersCandidatesQueue[callerName]) {
        this._viewersCandidatesQueue[callerName] = [];
      }
      Logger.debug("[screenshare] Pushing ICE candidate to viewer queue", callerName);
      this._viewersCandidatesQueue[callerName].push(candidate);
    }
  }

  flushCandidatesQueue (mediaId, queue) {
    Logger.debug("[screenshare] flushCandidatesQueue", queue);
    if (mediaId) {
      try {
        while(queue.length) {
          let candidate = queue.shift();
          this.mcs.addIceCandidate(mediaId, candidate);
        }
      } catch (err) {
        Logger.error("[screenshare] ICE candidate could not be added to media controller.", err);
      }
    } else {
      Logger.error("[screenshare] No mediaId");
    }
  }

  setMediaFlowingTimeout() {
    if (!this._mediaFlowingTimeout) {
      Logger.debug("[screenshare] setMediaFlowingTimeout");
      this._mediaFlowingTimeout = setTimeout(() => {
            this._onRtpMediaNotFlowing();
          },
          mediaFlowTimeoutDuration
      );
    }
  };

  clearMediaFlowingTimeout() {
    if (this._mediaFlowingTimeout) {
      Logger.debug("[screenshare] clearMediaFlowingTimeout");
      clearTimeout(this._mediaFlowingTimeout);
      this._mediaFlowingTimeout = null;
    }
  };

  mediaStateRtp (event) {
    let msEvent = event.event;

    switch (event.eventTag) {
      case "MediaStateChanged":
        break;

      case "MediaFlowOutStateChange":
        Logger.info('[screenshare]', msEvent.type, '[' + msEvent.state? msEvent.state : 'UNKNOWN_STATE' + ']', 'for media session ',  event.id);
        break;

      case "MediaFlowInStateChange":
        Logger.info('[screenshare]', msEvent.type, '[' + msEvent.state? msEvent.state : 'UNKNOWN_STATE' + ']', 'for media session ',  event.id);
        if (msEvent.state === 'FLOWING') {
          this._onRtpMediaFlowing();
        }
        else {
          this._onRtpMediaNotFlowing();
        }
        break;

      default: Logger.warn("[screenshare] Unrecognized event", event);
    }
  }

  mediaStateWebRtc (event, id) {
    let msEvent = event.event;

    switch (event.eventTag) {
      case "OnIceCandidate":
        let candidate = msEvent.candidate;
        Logger.debug('[screenshare] Received ICE candidate from mcs-core for media session', event.id, '=>', candidate);

        this._BigBlueButtonGW.publish(JSON.stringify({
          connectionId: id,
          id : 'iceCandidate',
          cameraId: this._id,
          candidate : candidate
        }), C.FROM_SCREENSHARE);

        break;

      case "MediaStateChanged":
        break;

      case "MediaFlowOutStateChange":
      case "MediaFlowInStateChange":
        Logger.info('[screenshare]', msEvent.type, '[' + msEvent.state? msEvent.state : 'UNKNOWN_STATE' + ']', 'for media session',  event.id);
        break;

      default: Logger.warn("[screenshare] Unrecognized event", event);
    }
  }

  async _startPresenter(id, sdpOffer, callback) {
    let presenterSdpAnswer, rtpSdpAnswer;
    let _callback = callback;

    // Force H264 on Firefox and Chrome
    sdpOffer = h264_sdp.transform(sdpOffer);
    Logger.info("[screenshare] Starting presenter", id , "at session", this._voiceBridge);

    try {
      this.userId = await this.mcs.join(this._meetingId, 'SFU', {});
      Logger.info("[screenshare] MCS Join for", this._id, "returned", this.userId);

    }
    catch (error) {
      Logger.error("[screenshare] MCS Join returned error =>", error);
      return callback(error);
    }

    try {
      const retSource = await this.mcs.publish(this.userId, this._meetingId, 'WebRtcEndpoint', {descriptor: sdpOffer});

      this._presenterEndpoint = retSource.sessionId;
      sharedScreens[id] = this._presenterEndpoint;
      presenterSdpAnswer = retSource.answer;
      this.flushCandidatesQueue(this._presenterEndpoint, this._presenterCandidatesQueue);
      this.setMediaFlowingTimeout();

      this.mcs.on('MediaEvent' + this._presenterEndpoint, (event) => {
        this.mediaStateWebRtc(event, this._id)
      });

      Logger.info("[screenshare] MCS publish for user", this.userId, "returned", this._presenterEndpoint);
    }
    catch (err) {
      Logger.error("[screenshare] MCS publish returned error =>", err);
      return callback(err);
    }

    try {
      let sendVideoPort = MediaHandler.getVideoPort();
      let rtpSdpOffer = MediaHandler.generateVideoSdp(localIpAddress, sendVideoPort);

      const retRtp = await this.mcs.subscribe(this.userId, sharedScreens[id], 'RtpEndpoint', {descriptor: rtpSdpOffer});

      this._ffmpegEndpoint = retRtp.sessionId;
      rtpEndpoints[id] = this._ffmpegEndpoint;

      let recvVideoPort = retRtp.answer.match(/m=video\s(\d*)/)[1];
      this._rtpParams = MediaHandler.generateTranscoderParams(kurentoIp, localIpAddress,
          sendVideoPort, recvVideoPort, this._streamId, "stream_type_deskshare", C.RTP_TO_RTMP, "copy", this._caller, this._voiceBridge);

      this.mcs.on('MediaEvent' + this._ffmpegEndpoint, this.mediaStateRtp.bind(this));

      Logger.info("[screenshare] MCS subscribe for user", this.userId, "returned", this._ffmpegEndpoint);

      return callback(null, presenterSdpAnswer);
    }
    catch (err) {
      Logger.error("[screenshare] MCS subscribe returned error =>", err);
      return callback(err);
    }
  }

    async _startViewer(connectionId, voiceBridge, sdp, callerName, presenterEndpoint, callback) {
    Logger.info("[screenshare] Starting viewer", callerName, "for voiceBridge", this._voiceBridge);
    // TODO refactor the callback handling
    let _callback = function(){};
    let sdpAnswer, sdpOffer;

    sdpOffer = h264_sdp.transform(sdp);
    sdpOffer = sdp;
    this._viewersCandidatesQueue[callerName] = [];

    try {
      const retSource = await this.mcs.subscribe(this.userId, sharedScreens[voiceBridge], 'WebRtcEndpoint', {descriptor: sdpOffer});

      this._viewersEndpoint[callerName] = retSource.sessionId;
      sdpAnswer = retSource.answer;
      this.flushCandidatesQueue(this._viewersEndpoint[callerName], this._viewersCandidatesQueue[callerName]);

      this.mcs.on('MediaEvent' + this._viewersEndpoint[callerName], (event) => {
        this.mediaStateWebRtc(event, connectionId);
      });

      this._BigBlueButtonGW.publish(JSON.stringify({
        connectionId: connectionId,
        id: "viewerResponse",
        sdpAnswer: sdpAnswer,
        response: "accepted"
      }), C.FROM_SCREENSHARE);

      Logger.info("[screenshare] MCS subscribe returned for user", this.userId, "returned", this._viewersEndpoint[callerName]);
    }
    catch (err) {
      Logger.error("[screenshare] MCS publish returned error =>", err);
      return _callback(err);
    }
  }

  async _stop() {
    Logger.info('[screnshare] Stopping and releasing endpoints for MCS user', this.userId);

    this._stopScreensharing();

    if (this._presenterEndpoint) {
      try {
        await this.mcs.leave(this._meetingId, this.userId);
        sharedScreens[this._presenterEndpoint] = null;
        this._candidatesQueue = null;
        this._presenterEndpoint = null;
        this._ffmpegEndpoint = null;
        return;
      }
      catch (err) {
        Logger.error('[screenshare] MCS returned an error when trying to leave =>', err);
        return;
      }
    }
    return;
  }

  _stopScreensharing() {
    let strm = Messaging.generateStopTranscoderRequestMessage(this._meetingId, this._meetingId);

    // Interoperability between transcoder messages
    switch (C.COMMON_MESSAGE_VERSION) {
      case "1.x":
        this._BigBlueButtonGW.once(C.STOP_TRANSCODER_REPLY, (payload) => {
          let meetingId = payload[C.MEETING_ID];
          this._stopRtmpBroadcast(meetingId);
        });
        break;
      default:
        this._BigBlueButtonGW.once(C.STOP_TRANSCODER_RESP_2x, (payload) => {
          let meetingId = payload[C.MEETING_ID_2x];
          this._stopRtmpBroadcast(meetingId);
        });
    }

    this._BigBlueButtonGW.publish(strm, C.TO_BBB_TRANSCODE_SYSTEM_CHAN, function(error) {});
  }

  _onRtpMediaFlowing() {
    Logger.info("[screenshare] RTP Media FLOWING for meeting", this._meetingId);
    this.clearMediaFlowingTimeout();
    let strm = Messaging.generateStartTranscoderRequestMessage(this._meetingId, this._meetingId, this._rtpParams);

    // Interoperability between transcoder messages
    switch (C.COMMON_MESSAGE_VERSION) {
      case "1.x":
        this._BigBlueButtonGW.once(C.START_TRANSCODER_REPLY, (payload) => {
          let meetingId = payload[C.MEETING_ID];
          let output = payload[C.PARAMS].output;
          this._startRtmpBroadcast(meetingId, output);
        });
        break;
      default:
        this._BigBlueButtonGW.once(C.START_TRANSCODER_RESP_2x, (payload) => {
          let meetingId = payload[C.MEETING_ID_2x];
          let output = payload[C.PARAMS].output;
          this._startRtmpBroadcast(meetingId, output);
        });
    }

    this._BigBlueButtonGW.publish(strm, C.TO_BBB_TRANSCODE_SYSTEM_CHAN, function(error) {});
  }

  _stopRtmpBroadcast (meetingId) {
    Logger.info("[screenshare] _stopRtmpBroadcast for meeting", meetingId);
    if(this._meetingId === meetingId) {
      switch (C.COMMON_MESSAGE_VERSION) {
        case "1.x":
          this._BigBlueButtonGW.publish(JSON.stringify({
              connectionId: this._id,
              id: "webRTCScreenshareStopped",
              meetingId: meetingId,
              streamId: this._streamId
          }), C.FROM_SCREENSHARE);
          break;
        default:
          // TODO correctly assemble this timestamp
          let timestamp = now.format('hhmmss');
          let dsrstom = Messaging.generateDeskShareRTMPBroadcastStoppedEvent(
              meetingId,
              this._voiceBridge,
              this._streamUrl,
              this._vw,
              this._vh,
              timestamp
          );
          this._BigBlueButtonGW.publish(dsrstom, C.FROM_VOICE_CONF_SYSTEM_CHAN_2x, function(error) {});
      }
    }
  }

  _startRtmpBroadcast (meetingId, output) {
    Logger.info("[screenshare] _startRtmpBroadcast for meeting", + meetingId);
    if(this._meetingId === meetingId) {
      // Interoperability between redis channel name
      switch (C.COMMON_MESSAGE_VERSION) {
        case "1.x":
          this._BigBlueButtonGW.publish(JSON.stringify({
              connectionId: this._id,
              id: "webRTCScreenshareStarted",
              meetingId: meetingId,
              streamId: this._streamId,
              width: this._vw,
              height: this._vh
          }), C.FROM_SCREENSHARE);
          break;
        default:
          // TODO correctly assemble this timestamp
          let timestamp = now.format('hhmmss');
          this._streamUrl = MediaHandler.generateStreamUrl(localIpAddress, meetingId, output);
          let dsrbstam = Messaging.generateDeskShareRTMPBroadcastStartedEvent(
              meetingId,
              this._voiceBridge,
              this._streamUrl,
              this._vw,
              this._vh,
              timestamp
          );
          this._BigBlueButtonGW.publish(dsrbstam, C.FROM_VOICE_CONF_SYSTEM_CHAN_2x, function(error) {});
      }
    }
  }

  _onRtpMediaNotFlowing() {
    Logger.warn("  [screenshare] Media NOT FLOWING for meeting => " + this._meetingId);
    // Interoperability between transcoder messages
    switch (C.COMMON_MESSAGE_VERSION) {
      case "1.x":
          this._BigBlueButtonGW.publish(JSON.stringify({
              connectionId: this._id,
              id: "webRTCScreenshareError",
              error: C.MEDIA_ERROR
          }), C.FROM_SCREENSHARE);
          // TODO Change this when 2.x routine is done
          this._stop();
        break;
      default:
        console.log("  [screenshare] TODO RTP NOT_FLOWING");
    }
  }

  async stopViewer(id) {
    let viewer = this._viewersEndpoint[id];
    Logger.info('[screenshare] Releasing endpoints for', viewer);

    if (viewer) {
      try {
        await this.mcs.unsubscribe(this.userId, this.viewer);
        this._viewersCandidatesQueue[id] = null;
        this._viewersEndpoint[id] = null;
        return;
      }
      catch (err) {
        Logger.error('[screenshare] MCS returned error when trying to unsubscribe', err);
        return;
      }
    }
  }
};
