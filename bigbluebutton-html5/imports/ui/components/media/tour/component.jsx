import React, { Component } from 'react';
import { injectIntl, intlShape, defineMessages } from 'react-intl';
import Button from '/imports/ui/components/button/component';
import cx from 'classnames';
import { styles } from './styles';

const intlMessages = defineMessages({
  stepAudioVideoControlsTitle: {
    id: 'app.media.tour.stepAudioVideoControlsTitle',
    description: 'Title for audio and video controls',
  },
  stepAudioVideoControlsContent: {
    id: 'app.media.tour.stepAudioVideoControlsContent',
    description: 'Message for audio and video controls',
  },
  stepChatTitle: {
    id: 'app.media.tour.stepChatTitle',
    description: 'Title for participants and chat',
  },
  stepChatContent: {
    id: 'app.media.tour.stepChatContent',
    description: 'Message for participants and chat',
  },
  stepSettingsTitle: {
    id: 'app.media.tour.stepSettingsTitle',
    description: 'Title for the settings',
  },
  stepSettingsContent: {
    id: 'app.media.tour.stepSettingsContent',
    description: 'Message for the settings',
  },
  stepScreenshareTitle: {
    id: 'app.media.tour.stepScreenshareTitle',
    description: 'Title for screenshare and presentation',
  },
  stepScreenshareContent: {
    id: 'app.media.tour.stepScreenshareContent',
    description: 'Message for screenshare and presentation',
  },
  tourGotIt: {
    id: 'app.media.tour.gotIt',
    description: 'Message for Got It button',
  },
});

const slides = [
  {
    title: intlMessages.stepAudioVideoControlsTitle,
    content: intlMessages.stepAudioVideoControlsContent,
    style: styles.stepAudioVideoControls,
  }, {
    title: intlMessages.stepChatTitle,
    content: intlMessages.stepChatContent,
    style: styles.stepChat,
  }, {
    title: intlMessages.stepSettingsTitle,
    content: intlMessages.stepSettingsContent,
    style: styles.stepSettings,
  }, {
    title: intlMessages.stepScreenshareTitle,
    content: intlMessages.stepScreenshareContent,
    style: styles.stepScreenshare,
  }
];

class TourOverlay extends Component {
  constructor(props) {
    super(props);
    
    this.state = {
      activeSlide: 0
    };
  }

  nextSlide() {
    let slidesLength = slides.length - 1;
    let index = this.state.activeSlide;

    if (index === slidesLength) {
      index = -1;
    }

    ++index;

    this.setState({
      activeSlide: index
    });
  }

  render() {
    const {
      intl,
    } = this.props;

    return (
      <div className={styles.overlay}>
        <div className={cx(slides[this.state.activeSlide].style, styles.hint)}>
          <div className={styles.hintTitle}>{ intl.formatMessage(slides[this.state.activeSlide].title) }</div>
          <div className={styles.hintContent}>{ intl.formatMessage(slides[this.state.activeSlide].content) }</div><br />
          <Button
            onClick={() => this.nextSlide()}
            label={ intl.formatMessage(intlMessages.tourGotIt) }
            size="sm"
          />
        </div>
      </div>
    );
  }
}

export default injectIntl(TourOverlay);
