// Global stuff
var mediaPipelines = {};
var sharedWebcams = {};
var rtpEndpoints = {};

// TODO Later
// var loadBalancer = require('')
const kurento = require('kurento-client');
const config = require('config');
const BigBlueButtonGW = require('./bbb/pubsub/bbb-gw');
const Messaging = require('./bbb/messages/Messaging');
const h264_sdp = require('./h264-sdp');
var C = require('./bbb/messages/Constants');
const MediaHandler = require('./media-handler');

const kurentoUrl = config.get('kurentoUrl');
const kurentoIp = config.get('kurentoIp');
const localIpAddress = config.get('localIpAddress');

if (config.get('acceptSelfSignedCertificate')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED=0;
}

var kurentoClient = null;

function getKurentoClient(callback) {

  if (kurentoClient !== null) {
    return callback(null, kurentoClient);
  }

  kurento(kurentoUrl, function(error, _kurentoClient) {
    if (error) {
      console.log("Could not find media server at address " + kurentoUrl);
      return callback("Could not find media server at address" + kurentoUrl + ". Exiting with error " + error);
    }

    console.log(" [server] Initiating kurento client. Connecting to: " + kurentoUrl);

    kurentoClient = _kurentoClient;
    callback(null, kurentoClient);
  });
}

function getMediaPipeline(id, callback) {

  console.log(' [media] Creating media pipeline for ' + id);

  if (mediaPipelines[id]) {

    console.log(' [media] Pipeline already exists.');

    callback(null, mediaPipelines[id]);

  } else {

    kurentoClient.create('MediaPipeline', function(err, pipeline) {

      mediaPipelines[id] = pipeline;

      return callback(err, pipeline);
    });

  }

}

function Video(_ws, _id, _shared, _meetingId) {

  var ws = _ws;
  var id = _id;
  var shared = _shared;
  var meetingId = _meetingId;
  var webRtcEndpoint = null;
  var rtpEndpoint = null;
  var stream = "";

  var candidatesQueue = [];

  var bbbGW = new BigBlueButtonGW();
  bbbGW.addSubscribeChannel(C.FROM_BBB_TRANSCODE_SYSTEM_CHAN, function(error, redisWrapper) {
    if(error) {
      console.log(' Could not connect to transcoder redis channel, finishing app...');
      self._stopAll(); // TODO
    }
    console.log('  [server] Successfully subscribed to redis channel');
  });

  this.onIceCandidate = function(_candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (webRtcEndpoint) {
      webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
      candidatesQueue.push(candidate);
    }
  };

  this.start = function(sdpOffer, callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {

      if (error) {
        return callback(error);
      }

      getMediaPipeline(id, function(error, pipeline) {

        if (error) {
          return callback(error);
        }

        createMediaElements(pipeline, function(error, _webRtcEndpoint) {

          if (error) {
            pipeline.release();
            return callback(error);
          }

          while(candidatesQueue.length) {
            var candidate = candidatesQueue.shift();
            _webRtcEndpoint.addIceCandidate(candidate);
          }

          var flowInOut = function(event) {
            console.log(' [=] ' + event.type + ' for endpoint ' + id);

            if (event.state === 'NOT_FLOWING') {
              ws.sendMessage({ id : 'playStop', cameraId : id });
            } else if (event.state === 'FLOWING') {
              ws.sendMessage({ id : 'playStart', cameraId : id });
            }
          };

          _webRtcEndpoint.on('MediaFlowInStateChange', flowInOut);
          _webRtcEndpoint.on('MediaFlowOutStateChange', flowInOut);

          connectMediaElements(_webRtcEndpoint, function(error) {

            if (error) {
              pipeline.release();
              return callback(error);
            }

            // It's a user sharing a webcam
            if (shared) {
              sharedWebcams[id] = _webRtcEndpoint;
            }

            // Store our endpoint
            webRtcEndpoint = _webRtcEndpoint;

            _webRtcEndpoint.on('OnIceCandidate', function(event) {
              var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
              ws.sendMessage({ id : 'iceCandidate', cameraId: id, candidate : candidate });
            });

            sdpOffer = h264_sdp.transform(sdpOffer);

            _webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
              console.log("  [webrtcedpoint] KMS answer SDP => " + sdpAnswer);
              if (error) {
                pipeline.release();
                return callback(error);
              }


              _webRtcEndpoint.gatherCandidates(function(error) {
                if (error) {
                  return callback(error);
                }


                if (shared) {
                  console.log("User is sharing webcam");
                  createRtpMediaElements(pipeline, function(error, _rtpEndpoint){
             
                    if (error) {
                      pipeline.release();
                      return callback(error);
                    }
              
                    connectRtpMediaElements(_rtpEndpoint, function(error) {

                      if (error) {
                        pipeline.release();
                        return callback(error);
                      }

                      // Store our endpoint
                      rtpEndpoint = _rtpEndpoint;

                      var sendVideoPort = MediaHandler.getVideoPort();

                      var rtpSdpOffer = MediaHandler.generateVideoSdp(localIpAddress, sendVideoPort);
                      console.log("  [rtpendpoint] RtpEndpoint processing => " + rtpSdpOffer);
                
                      _rtpEndpoint.processOffer(rtpSdpOffer, function(error, rtpSdpAnswer) {
                        if (error) {
                          //pipeline.release();
                          return callback(error);
                        }
                  
                        console.log("  [rtpendpoint] KMS answer SDP => " + rtpSdpAnswer);
                        var recvVideoPort = rtpSdpAnswer.match(/m=video\s(\d*)/)[1];
                        var rtpParams = MediaHandler.generateTranscoderParams(kurentoIp,
                            localIpAddress, sendVideoPort, recvVideoPort, meetingId, "stream_type_video", C.RTP_TO_RTMP, "copy", "caller");

                        rtpEndpoint.on('MediaFlowInStateChange', function(event) {
                          if (event.state === 'NOT_FLOWING') {
                            console.log(" RTP NOT FLOWING IN");
                            self.onRtpMediaNotFlowing();
                          } else if (event.state === 'FLOWING') {
                            console.log(" RTP FLOWING IN");
                            self.onRtpMediaFlowing(meetingId, rtpParams);
                          }
                        });

                        return callback(null, sdpAnswer);
                      });
                    });
                  });
                };
                return callback(null, sdpAnswer);
              });
	    });
          });
        });
      });
    });
  };

  var createMediaElements = function(pipeline, callback) {

    console.log(" [webrtc] Creating webrtc endpoint");

    pipeline.create('WebRtcEndpoint', function(error, _webRtcEndpoint) {

      if (error) {
        return callback(error);
      }

      webRtcEndpoint = _webRtcEndpoint;

      return callback(null, _webRtcEndpoint);
    });
  };

  var createRtpMediaElements = function(pipeline, callback) {

    console.log(" [webrtc] Creating rtp endpoint");

    pipeline.create('RtpEndpoint', function(error, _rtpEndpoint) {

      if (error) {
        return callback(error);
      }

      rtpEndpoint = _rtpEndpoint;

      return callback(null, _rtpEndpoint);
    });
  };

  var connectMediaElements = function(webRtcEndpoint, callback) {

    // User is sharing webcam (sendOnly connection from the client)
    if (shared) {
      console.log(" [webrtc] User has shared the webcam, no connection needed");
      // Dont connect this, just create the webrtcEndpoint
      // webRtcEndpoint.connect(webRtcEndpoint, callback);

      return callback(null);
    } else {

      console.log(" [webrtc] User wants to receive webcam ");

      if (sharedWebcams[id]) {
        var wRtc = sharedWebcams[id];

        wRtc.connect(webRtcEndpoint, function(error) {

          if (error) {
            return callback(error);
          }
          return callback(null);
        });
      }
    };
  };

  var connectRtpMediaElements = function(rtpEndpoint, callback) {

    console.log(" [webrtc] Connecting webRtcEndpoint to rtpEndpoint ");

    if (sharedWebcams[id]) {
      var wRtc = sharedWebcams[id];

      wRtc.connect(rtpEndpoint, function(error) {

        if (error) {
          return callback(error);
        }
        return callback(null);
      });
    }
  };

  this.onRtpMediaFlowing = function(meetingId, rtpParams) {
    var self = this;
    var strm = Messaging.generateStartTranscoderRequestMessage(meetingId, meetingId, rtpParams);

    // Interoperability: capturing 1.1 start_transcoder_reply messages
    bbbGW.once(C.START_TRANSCODER_REPLY, function(payload) {
      var meetingId = payload[C.MEETING_ID];
      var output = payload["params"].output;
      self.startRtmpBroadcast(meetingId, output);
    });

    // Capturing stop transcoder responses from the 2x model
    bbbGW.once(C.START_TRANSCODER_RESP_2x, function(payload) {
      var meetingId = payload[C.MEETING_ID_2x];
      var output = payload["params"].output;
      self.startRtmpBroadcast(meetingId, output);
    });

    bbbGW.publish(strm, C.TO_BBB_TRANSCODE_SYSTEM_CHAN, function(error) {});
  };

  this.stopRtmpBroadcast = function(meetingId) {
    var self = this;
    if(meetingId === _meetingId) {
      var dsrbstam = Messaging.generateUserBroadcastCamStoppedEvent2x(id, _meetingId);
      bbbGW.publish(dsrbstam, C.TO_AKKA_APPS_SYSTEM_CHAN, function(error) {});
    }
  }

  this.startRtmpBroadcast = function(_meetingId, output) {
    var self = this;
    if(meetingId === _meetingId) {
      stream = output;
      var dsrbstam = Messaging.generateUserBroadcastCamStartedEvent2x(id, output, _meetingId);
      bbbGW.publish(dsrbstam, C.TO_AKKA_APPS_SYSTEM_CHAN, function(error) {});
    }
  }

  this.onRtpMediaNotFlowing = function() {
    console.log("  [video] TODO RTP NOT_FLOWING");
  };

  this.stop = function() {

    console.log(' [stop] Releasing webrtc endpoint for ' + id);

    if (webRtcEndpoint) {
      webRtcEndpoint.release();
      webRtcEndpoint = null;
    } else {
      console.log(" [webRtcEndpoint] PLEASE DONT TRY STOPPING THINGS TWICE");
    }

    if (shared) {
      console.log(' [stop] Webcam is shared, releasing ' + id);

      if (mediaPipelines[id]) {
        mediaPipelines[id].release();
      } else {
        console.log(" [mediaPipeline] PLEASE DONT TRY STOPPING THINGS TWICE");
      }

      delete mediaPipelines[id];
      delete sharedWebcams[id];
    }

    delete candidatesQueue;
  };

  return this;
};

module.exports = Video;
