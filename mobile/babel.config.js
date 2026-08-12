module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Must stay last: the worklets plugin rewrites Reanimated 4 worklets and
    // has to see the fully-transformed output.
    plugins: ['react-native-worklets/plugin'],
  };
};
