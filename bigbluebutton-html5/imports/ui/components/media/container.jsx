import React, { Component } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import Settings from '/imports/ui/services/settings';
import Meetings from '/imports/api/meetings/';
import Auth from '/imports/ui/services/auth';
import Media from './component';
import MediaService from './service';
import PresentationAreaContainer from '../presentation/container';
import VideoDockContainer from '../video-dock/container';
import ScreenshareContainer from '../screenshare/container';
import DefaultContent from '../presentation/default-content/component';
import { styles } from './styles';

const defaultProps = {
  overlay: null,
  content: <PresentationAreaContainer />,
  defaultContent: <DefaultContent />,
};

class MediaContainer extends Component {
  constructor(props) {
    super(props);

    const { overlay, content, defaultContent } = this.props;
    this.state = {
      overlay,
      content: this.props.current_presentation ? content : defaultContent,
    };

    this.handleToggleLayout = this.handleToggleLayout.bind(this);
  }

  componentDidMount() {
    document.addEventListener('toggleLayout', this.handleToggleLayout); // TODO find a better way to do this
  }

  componentWillUnmount() {
    document.removeEventListener('toggleLayout', this.handleToggleLayout);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.current_presentation !== this.props.current_presentation) {
      if (nextProps.current_presentation) {
        this.setState({ content: this.props.content });
      } else {
        this.setState({ content: this.props.defaultContent });
      }
    }
  }

  handleToggleLayout() {
    const { overlay, content } = this.state;
    console.log(overlay); console.log(overlay);

    this.setState({ overlay: content, content: overlay });
  }

  render() {
    return <Media {...this.props}>{this.props.children}</Media>;
  }
}

MediaContainer.defaultProps = defaultProps;

export default withTracker((props) => {
  const { dataSaving } = Settings;
  const { viewParticipantsWebcams: viewVideoDock, viewScreenshare } = dataSaving;

  const data = {};
  data.currentPresentation = MediaService.getPresentationInfo();

  const meeting = Meetings.findOne({ meetingId: Auth.meetingID });
  const webcamOnlyModerator = meeting.usersProp.webcamsOnlyForModerator;

  data.content = <DefaultContent />;

  if (MediaService.shouldShowWhiteboard()) {
    data.content = <PresentationAreaContainer key="a123" currentLayout={props.isDefaultLayout} overlayClass={styles.overlayWrapper} reparentableClass={styles.reparentableDiv} />;
  }

  if (MediaService.shouldShowScreenshare() && (viewScreenshare || MediaService.isUserPresenter())) {
    data.content = <ScreenshareContainer currentLayout={props.isDefaultLayout} overlayClass={styles.overlayWrapper} reparentableClass={styles.reparentableDiv} />;
  }

  if (MediaService.shouldShowOverlay() && viewVideoDock && !webcamOnlyModerator) {
    data.overlay = <VideoDockContainer key="b123" currentLayout={props.isDefaultLayout} overlayClass={styles.overlayWrapper} reparentableClass={styles.reparentableDiv} />;
  }

  if(!props.isDefaultLayout){
    data.content = [data.overlay, data.overlay=data.content][0];
  }

  return data;
})(MediaContainer);
