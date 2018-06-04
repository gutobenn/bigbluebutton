import Users from '/imports/api/users';
import Auth from '/imports/ui/services/auth';

const isPresenter = () => {
  const currentUser = Users.findOne({ userId: Auth.userID });
  return currentUser ? currentUser.presenter : false;
};

export default {
  isPresenter,
};
