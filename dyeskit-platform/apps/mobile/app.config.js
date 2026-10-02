/**
 * Adds to app.json at build time.
 *
 * ALLOW_HTTP=1 (only the "phone-test" build profile in eas.json) lets the Android app talk to a
 * server on plain http:// — needed to test against a computer on the same Wi-Fi. Store builds
 * never set it, so they only accept https.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.ALLOW_HTTP === '1' ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]] : []),
  ],
});
