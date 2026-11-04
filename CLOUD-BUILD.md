# TFGBC iPhone build

This is build source, not an IPA installer. A successful Xcode build produces an unsigned IPA for personal signing.

The manual GitHub Actions workflow builds the app on a Mac runner without Apple signing credentials. It does not change the live church website or its records. It uploads the unsigned IPA as a build artifact; a successful native build is required before that file exists.

Create a private GitHub repository containing the contents of this folder, with package.json and .github at its root. Review the account's included Actions allowance and spending limits before starting a cloud run. Run the manual iOS workflow from Actions. Download the resulting artifact after a successful build.

An unsigned IPA needs to be signed for your iPhone before it can run. Windows tools such as Sideloadly can use your free Apple Account for personal installation. Enter Apple credentials only into your chosen installation tool yourself. Free provisioning expires after seven days and needs renewal; the church records stay on the shared church service.

No Apple password, signing key, backend configuration, or church records are included in this source package.
