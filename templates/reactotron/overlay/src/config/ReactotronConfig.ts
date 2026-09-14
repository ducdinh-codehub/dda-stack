import Reactotron from 'reactotron-react-native';

// Requires the Reactotron desktop app (https://github.com/infinitered/reactotron)
// running on the same machine/network — this only wires up the client side.
if (__DEV__) {
  Reactotron.configure({ name: '{{projectName}}' })
    .useReactNative({
      asyncStorage: true,
      networking: true,
      errors: true,
    })
    .connect();
}

export default Reactotron;
