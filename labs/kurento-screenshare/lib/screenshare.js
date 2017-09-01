/*
 * Lucas Fialho Zawacki
 * Paulo Renato Lanzarin
 * (C) Copyright 2017 Bigbluebutton
 *
 */

'use strict'

// Imports
const C = require('./bbb/messages/Constants');
const MediaHandler = require('./media-handler');
const Messaging = require('./bbb/messages/Messaging');
const moment = require('moment');
const h264_sdp = require('./h264-sdp');
const now = moment();
const MediaController = require('./media-controller');
const uuidv4 = require('uuid/v4')

// Global stuff
var sharedScreens = {};
var rtpEndpoints = {};

const kurento = require('kurento-client');
const config = require('config');
const kurentoUrl = config.get('kurentoUrl');
const kurentoIp = config.get('kurentoIp');
const localIpAddress = config.get('localIpAddress');

if (config.get('acceptSelfSignedCertificate')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED=0;
}

module.exports = class Screenshare {
  constructor(ws, id, bbbgw, voiceBridge, caller, vh, vw, meetingId) {
    this._ws = ws;
    this._id = id;
    this._BigBlueButtonGW = bbbgw;
    this._presenterEndpoint = null;
    this._ffmpegRtpEndpoint = null;
    this._voiceBridge = voiceBridge;
    this._meetingId = meetingId;
    this._caller = caller;
    this._streamUrl = "";
    this._vw = vw;
    this._vh = vh;
    this._candidatesQueue = [];

    this._viewersEndpoint = [];
    this._viewersCandidatesQueue = [];
  }

  // TODO isolate ICE
  _onIceCandidate(_candidate) {
    let candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (this._presenterEndpoint) {
      this._presenterEndpoint.addIceCandidate(candidate);
    }
    else {
      this._candidatesQueue.push(candidate);
    }
  };
  
  _onViewerIceCandidate(_candidate, viewerId) {
    let candidate = kurento.getComplexType('IceCandidate')(_candidate);
    
    if (this._viewersEndpoint[viewerId]) {
      this._viewersEndpoint[viewerId].addIceCandidate(candidate);
    }
    else {
      if (!this._viewersCandidatesQueue[viewerId]) {
        this._viewersCandidatesQueue[viewerId] = [];
      }
      this._viewersCandidatesQueue[viewerId].push(candidate);
    }
  }

  _startViewer(ws, voiceBridge, sdp, presenterEndpoint, callback) {
    let self = this;
    let _callback = function(){};
    let viewerId = uuidv4();
    self._viewersCandidatesQueue[viewerId] = [];
    ws.sendMessage({id: "viewerId", viewerId: viewerId.toString()}); // TODO string ou int?
    
    console.log("VIEWER ID: " + viewerId);
    console.log("VIEWER VOICEBRIDGE:    "+self._voiceBridge);
 
    MediaController.createMediaElement(voiceBridge, C.WebRTC, function(error, webRtcEndpoint) {
      if (error) {
        console.log("Media elements error" + error);
        return _callback(error);
      }

      self._viewersEndpoint[viewerId] = webRtcEndpoint;

      // QUEUES UP ICE CANDIDATES IF NEGOTIATION IS NOT YET READY
      while(self._viewersCandidatesQueue[viewerId].length) {
        let candidate = self._viewersCandidatesQueue[viewerId].shift();
        MediaController.addIceCandidate(self._viewersEndpoint[viewerId].id, candidate);
      }
      // CONNECTS TWO MEDIA ELEMENTS
      MediaController.connectMediaElements(presenterEndpoint.id, self._viewersEndpoint[viewerId].id, C.VIDEO, function(error) {
        if (error) {
          console.log("Media elements CONNECT error " + error);
          //pipeline.release();
          return _callback(error);
        }
      });

      // ICE NEGOTIATION WITH THE ENDPOINT
      self._viewersEndpoint[viewerId].on('OnIceCandidate', function(event) {
        let candidate = kurento.getComplexType('IceCandidate')(event.candidate);
        ws.sendMessage({ id : 'iceCandidate', candidate : candidate });
      });

      sdp = h264_sdp.transform(sdp);
      // PROCESS A SDP OFFER
      MediaController.processOffer(webRtcEndpoint.id, sdp, function(error, webRtcSdpAnswer) {
        if (error) {
          console.log("  [webrtc] processOffer error => " + error + " for SDP " + sdp);
          //pipeline.release();
          return _callback(error);
        }
        ws.sendMessage({id: "sdp", sdp: webRtcSdpAnswer});
        console.log(" Sent sdp message to client with viewerId:" + viewerId);

        MediaController.gatherCandidates(webRtcEndpoint.id, function(error) {
          if (error) {
            return _callback(error);
          }

	  self._viewersEndpoint[viewerId].on('MediaFlowInStateChange', function(event) {
            if (event.state === 'NOT_FLOWING') {                          
              console.log(" NOT FLOWING ");                              
            }                                                             
            else if (event.state === 'FLOWING') {                         
              console.log(" FLOWING ");      
            }                                                             
          });
        });
      });
    });
  }


  _startPresenter(id, ws, sdpOffer, callback) {
    let self = this;
    let _callback = callback;

    // Force H264 on Firefox and Chrome
    sdpOffer = h264_sdp.transform(sdpOffer);
    console.log("Starting presenter for " + sdpOffer);
    console.log("PRESENTER VOICEBRIDGE:   " + self._voiceBridge);
    MediaController.createMediaElement(self._voiceBridge, C.WebRTC, function(error, webRtcEndpoint) {
      if (error) {
        console.log("Media elements error" + error);
        return _callback(error);
      }
      MediaController.createMediaElement(self._voiceBridge, C.RTP, function(error, rtpEndpoint) {
        if (error) {
          console.log("Media elements error" + error);
          return _callback(error);
        }


        while(self._candidatesQueue.length) {
          let candidate = self._candidatesQueue.shift();
          MediaController.addIceCandidate(webRtcEndpoint.id, candidate);
        }

        MediaController.connectMediaElements(webRtcEndpoint.id, rtpEndpoint.id, C.VIDEO, function(error) {
          if (error) {
            console.log("Media elements CONNECT error " + error);
            //pipeline.release();
            return _callback(error);
          }

          // It's a user sharing a Screen
          sharedScreens[id] = webRtcEndpoint;
          rtpEndpoints[id] = rtpEndpoint;

          // Store our endpoint
          self._presenterEndpoint = webRtcEndpoint;
          self._ffmpegRtpEndpoint = rtpEndpoint;

          self._presenterEndpoint.on('OnIceCandidate', function(event) {
            let candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            ws.sendMessage({ id : 'iceCandidate', cameraId: id, candidate : candidate });
          });

          MediaController.processOffer(webRtcEndpoint.id, sdpOffer, function(error, webRtcSdpAnswer) {
            if (error) {
              console.log("  [webrtc] processOffer error => " + error + " for SDP " + sdpOffer);
              //pipeline.release();
              return _callback(error);
            }

            let sendVideoPort = MediaHandler.getVideoPort();

            let rtpSdpOffer = MediaHandler.generateVideoSdp(localIpAddress, sendVideoPort);
            console.log("  [rtpendpoint] RtpEndpoint processing => " + rtpSdpOffer);

            MediaController.gatherCandidates(webRtcEndpoint.id, function(error) {
              if (error) {
                return _callback(error);
              }

              MediaController.processOffer(rtpEndpoint.id, rtpSdpOffer, function(error, rtpSdpAnswer) {
                if (error) {
                  console.log("  [rtpendpoint] processOffer error => " + error + " for SDP " + rtpSdpOffer);
                  //pipeline.release();
                  return _callback(error);
                }

                console.log("  [rtpendpoint] KMS answer SDP => " + rtpSdpAnswer);
                let recvVideoPort = rtpSdpAnswer.match(/m=video\s(\d*)/)[1];
                let rtpParams = MediaHandler.generateTranscoderParams(kurentoIp, localIpAddress,
                    sendVideoPort, recvVideoPort, self._meetingId, "stream_type_video", C.RTP_TO_RTMP, "copy", "caller");

                self._ffmpegRtpEndpoint.on('MediaFlowInStateChange', function(event) {
                  if (event.state === 'NOT_FLOWING') {
                    self._onRtpMediaNotFlowing();
                  }
                  else if (event.state === 'FLOWING') {
                    self._onRtpMediaFlowing(self._meetingId, rtpParams);
                  }
                });
                return _callback(null, webRtcSdpAnswer);
              });
            });
          });
        });
      });
    });
  };

  _stop() {

    console.log(' [stop] Releasing endpoints for ' + this._id);

    this._stopScreensharing();

    if (this._presenterEndpoint) {
      MediaController.releaseMediaElement(this._presenterEndpoint.id);
      this._presenterEndpoint = null;
    } else {
      console.log(" [webRtcEndpoint] PLEASE DONT TRY STOPPING THINGS TWICE");
    }

    if (this._ffmpegRtpEndpoint) {
      MediaController.releaseMediaElement(this._ffmpegRtpEndpoint.id);
      this._ffmpegRtpEndpoint = null;
    } else {
      console.log(" [rtpEndpoint] PLEASE DONT TRY STOPPING THINGS TWICE");
    }

    console.log(' [stop] Screen is shared, releasing ' + this._id);

    delete sharedScreens[this._id];

    delete this._candidatesQueue;
  };

  _stopScreensharing() {
    let self = this;
    let strm = Messaging.generateStopTranscoderRequestMessage(this._meetingId, this._meetingId);

    self._BigBlueButtonGW.publish(strm, C.TO_BBB_TRANSCODE_SYSTEM_CHAN, function(error) {});

    // Interoperability: capturing 1.1 stop_transcoder_reply messages
    self._BigBlueButtonGW.once(C.STOP_TRANSCODER_REPLY, function(payload) {
      let meetingId = payload[C.MEETING_ID];
      self._stopRtmpBroadcast(meetingId);
    });

    // Capturing stop transcoder responses from the 2x model
    self._BigBlueButtonGW.once(C.STOP_TRANSCODER_RESP_2x, function(payload) {
      let meetingId = payload[C.MEETING_ID_2x];
      self._stopRtmpBroadcast(meetingId);
    });

  }

  _onRtpMediaFlowing(meetingId, rtpParams) {
    let self = this;
    let strm = Messaging.generateStartTranscoderRequestMessage(meetingId, meetingId, rtpParams);

    // Interoperability: capturing 1.1 start_transcoder_reply messages
    self._BigBlueButtonGW.once(C.START_TRANSCODER_REPLY, function(payload) {
      let meetingId = payload[C.MEETING_ID];
      let output = payload["params"].output;
      self._startRtmpBroadcast(meetingId, output);
    });

    // Capturing stop transcoder responses from the 2x model
    self._BigBlueButtonGW.once(C.START_TRANSCODER_RESP_2x, function(payload) {
      let meetingId = payload[C.MEETING_ID_2x];
      let output = payload["params"].output;
      self._startRtmpBroadcast(meetingId, output);
    });


    self._BigBlueButtonGW.publish(strm, C.TO_BBB_TRANSCODE_SYSTEM_CHAN, function(error) {});
  };

  _stopRtmpBroadcast (meetingId) {
    var self = this;
    if(self._meetingId === meetingId) {
      // TODO correctly assemble this timestamp
      let timestamp = now.format('hhmmss');
      let dsrstom = Messaging.generateScreenshareRTMPBroadcastStoppedEvent2x(self._voiceBridge,
          self._voiceBridge, self._streamUrl, self._vw, self._vh, timestamp);
      self._BigBlueButtonGW.publish(dsrstom, C.FROM_VOICE_CONF_SYSTEM_CHAN, function(error) {});
    }
  }

  _startRtmpBroadcast (meetingId, output) {
    var self = this;
    if(self._meetingId === meetingId) {
      // TODO correctly assemble this timestamp
      let timestamp = now.format('hhmmss');
      self._streamUrl = MediaHandler.generateStreamUrl(localIpAddress, meetingId, output);
      let dsrbstam = Messaging.generateScreenshareRTMPBroadcastStartedEvent2x(self._voiceBridge,
          self._voiceBridge, self._streamUrl, self._vw, self._vh, timestamp);

      self._BigBlueButtonGW.publish(dsrbstam, C.FROM_VOICE_CONF_SYSTEM_CHAN, function(error) {});
    }
  }

  _onRtpMediaNotFlowing() {
    console.log("  [screenshare] TODO RTP NOT_FLOWING");
  };


};
