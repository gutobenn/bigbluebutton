import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import RedisPubSub from '/imports/startup/server/redis';
import Logger from '/imports/startup/server/logger';

export default function userJoin(meetingId, userId, authToken) {
  const REDIS_CONFIG = Meteor.settings.private.redis;
  const CHANNEL = REDIS_CONFIG.channels.toAkkaApps;
  const EVENT_NAME = 'UserJoinMeetingReqMsg';

  Logger.info(`User='${userId}' is joining meeting='${meetingId}' authToken='${authToken}' pt1`);

  check(meetingId, String);
  check(userId, String);
  check(authToken, String);

  const payload = {
    userId,
    authToken,
  };

  Logger.info(`User='${userId}' is joining meeting='${meetingId}' authToken='${authToken}' pt2`);

  return RedisPubSub.publishUserMessage(CHANNEL, EVENT_NAME, meetingId, userId, payload);
}
