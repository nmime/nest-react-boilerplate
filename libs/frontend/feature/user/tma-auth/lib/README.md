# @app/frontend-feature-user-tma-auth

## Purpose

Platform-neutral Telegram Mini App launch/auth domain logic shared by the web
`app` and native `mobile` frontends: start-param → route mapping
(`parseTmaLaunchState` and friends) and the `useTmaAuth` hook that resolves the
launch state and triggers authentication.

No `react-dom` / `react-native` / platform UI imports; the web panel UI stays in
the app and consumes the shared model.
