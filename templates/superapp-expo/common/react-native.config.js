// Routes `react-native start` / `bundle` (and the native Release builds that
// call `bundle`) to Re.Pack's Rspack commands instead of Metro.
module.exports = {
  commands: require('@callstack/repack/commands'),
};
