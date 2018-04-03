import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { defineMessages, injectIntl, intlShape } from 'react-intl';
import Modal from 'react-modal';
import cx from 'classnames';

import ToastContainer from '../toast/container';
import ModalContainer from '../modal/container';
import NotificationsBarContainer from '../notifications-bar/container';
import AudioContainer from '../audio/container';
import MediaContainer from '../media/container';
import ActionsBarContainer from '../actions-bar/container';
import ChatNotificationContainer from '../chat/notification/container';
import { styles } from './styles';

const intlMessages = defineMessages({
  userListLabel: {
    id: 'app.userList.label',
    description: 'Aria-label for Userlist Nav',
  },
  chatLabel: {
    id: 'app.chat.label',
    description: 'Aria-label for Chat Section',
  },
  mediaLabel: {
    id: 'app.media.label',
    description: 'Aria-label for Media Section',
  },
  actionsBarLabel: {
    id: 'app.actionsBar.label',
    description: 'Aria-label for ActionsBar Section',
  },
});

const propTypes = {
  fontSize: PropTypes.string,
  navbar: PropTypes.element,
  sidebar: PropTypes.element,
  media: PropTypes.element,
  actionsbar: PropTypes.element,
  closedCaption: PropTypes.element,
  userList: PropTypes.element,
  chat: PropTypes.element,
  locale: PropTypes.string,
  intl: intlShape.isRequired,
};

const defaultProps = {
  fontSize: '16px',
  navbar: null,
  sidebar: null,
  media: null,
  actionsbar: null,
  closedCaption: null,
  userList: null,
  chat: null,
  locale: 'en',
};

class App extends Component {
  constructor() {
    super();

    this.state = {
      compactUserList: false, // TODO: Change this on userlist resize (?)
      defaultLayout: true,
    };

    this.handleSwapLayout = this.handleSwapLayout.bind(this);
  }

  componentDidMount() {
    const { locale } = this.props;

    Modal.setAppElement('#app');
    document.getElementsByTagName('html')[0].lang = locale;
    document.getElementsByTagName('html')[0].style.fontSize = this.props.fontSize;
  }

  renderNavBar() {
    const { navbar } = this.props;

    if (!navbar) return null;

    return (
      <header className={styles.navbar}>
        {navbar}
      </header>
    );
  }

  renderSidebar() {
    const { sidebar } = this.props;

    if (!sidebar) return null;

    return (
      <aside className={styles.sidebar}>
        {sidebar}
      </aside>
    );
  }

  renderClosedCaption() {
    const { closedCaption } = this.props;

    if (!closedCaption) return null;

    return (
      <div className={styles.closedCaptionBox}>
        {closedCaption}
      </div>
    );
  }

  renderUserList() {
    const { intl } = this.props;
    let { userList } = this.props;
    const { compactUserList } = this.state;

    if (!userList) return null;

    const userListStyle = {};
    userListStyle[styles.compact] = compactUserList;
    userList = React.cloneElement(userList, {
      compact: compactUserList,
    });

    return (
      <div
        className={cx(styles.userList, userListStyle)}
        aria-label={intl.formatMessage(intlMessages.userListLabel)}
      >
        {userList}
      </div>
    );
  }

  renderChat() {
    const { chat, intl } = this.props;

    if (!chat) return null;

    return (
      <section
        className={styles.chat}
        aria-label={intl.formatMessage(intlMessages.chatLabel)}
      >
        {chat}
      </section>
    );
  }

  renderMedia() {
    const { media, intl } = this.props;
    const { defaultLayout } = this.state;

    if (!media) return null;

    return (
      <section
        className={styles.media}
        aria-label={intl.formatMessage(intlMessages.mediaLabel)}
      >
        <MediaContainer defaultLayout={defaultLayout} />
        {/* TODO is it possible to keep using the media variable and pass the defaultLayout to it? */}
        {this.renderClosedCaption()}
      </section>
    );
  }

  renderActionsBar() {
    const { actionsbar, intl } = this.props;
    const { defaultLayout } = this.state;

    if (!actionsbar) return null;

    return (
      <section
        className={styles.actionsbar}
        aria-label={intl.formatMessage(intlMessages.actionsBarLabel)}
      >
        <ActionsBarContainer handleSwapLayout={this.handleSwapLayout} />
        {/* TODO is it possible to keep using the actionsbar variable and pass the handleSwaplayout to it? */}
      </section>
    );
  }

  render() {
    const { params } = this.props;

    return (
      <main className={styles.main}>
        <NotificationsBarContainer />
        <section className={styles.wrapper}>
          <div className={styles.content}>
            {this.renderNavBar()}
            {this.renderMedia()}
            {this.renderActionsBar()}
          </div>
          {this.renderUserList()}
          {this.renderChat()}
          {this.renderSidebar()}
        </section>
        <ModalContainer />
        <AudioContainer />
        <ToastContainer />
        <ChatNotificationContainer currentChatID={params.chatID} />
      </main>
    );
  }

  handleSwapLayout() {
    this.setState({ defaultLayout: !this.state.defaultLayout });
  }
}

App.propTypes = propTypes;
App.defaultProps = defaultProps;
export default injectIntl(App);
