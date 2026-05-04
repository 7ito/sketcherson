# Publishing Sketcherson packages

This process releases changes from the public Sketcherson repo so downstream games can consume them as dependency updates instead of copied source.

## Published package set

Sketcherson packages are versioned with Changesets.

```txt
@7ito/sketcherson-common
@7ito/sketcherson-server
@7ito/sketcherson-web
```

The demo app packages remain private app entrypoints unless they intentionally become template packages.

```txt
@7ito/sketcherson-server-app
@7ito/sketcherson-web-app
```

## Release workflow

1. Make the shared change in the Sketcherson repo.
2. Run validation.

```sh
npm test
npm run build
```

3. Create a changeset.

```sh
npm run changeset
```

4. Select the changed packages and the semver bump.

Use `patch` for compatible fixes, `minor` for new backwards-compatible APIs, and `major` for breaking changes.

Example package selections:

```txt
@7ito/sketcherson-common patch
@7ito/sketcherson-server patch
@7ito/sketcherson-web minor
```

5. Commit the code change and generated `.changeset` file.

```sh
git add .
git commit -m "Describe the Sketcherson change"
```

6. Prepare the release commit after CI is green.

```sh
npm run version-packages
npm install
```

7. Review generated version and changelog changes.
8. Commit the release preparation.

```sh
git add .
git commit -m "Release Sketcherson packages"
```

9. Publish packages from a clean checkout.

```sh
npm run publish-packages
```

The publish script runs the workspace build and test commands before `changeset publish`.

## Expected result

The registry receives new package versions, for example:

```txt
@7ito/sketcherson-common@0.1.4
@7ito/sketcherson-server@0.1.4
@7ito/sketcherson-web@0.1.4
```

Downstream projects can then update dependency versions instead of receiving mirrored source edits.

## Prerelease workflow

Use prereleases when private downstream games need to validate changes before a stable release.

```sh
npx changeset pre enter next
npm run changeset
npm run version-packages
npm run publish-packages -- --tag next
npx changeset pre exit
```

Downstream repos can install the prerelease tag:

```sh
npm install @7ito/sketcherson-common@next @7ito/sketcherson-server@next @7ito/sketcherson-web@next
```

## Local unpublished testing

Use this when you want to test Sketcherson changes inside downstream games without publishing to npm.

Install `yalc` if needed:

```sh
npm install -g yalc
```

Build and publish local package snapshots from Sketcherson:

```sh
npm run build
yalc publish packages/common
yalc publish packages/server
yalc publish packages/web
```

Then add those local snapshots in a downstream repo:

```sh
yalc add @7ito/sketcherson-common @7ito/sketcherson-server @7ito/sketcherson-web
npm install
npm test
npm run build
```

After validation, publish real package versions from Sketcherson and move the downstream repo back to normal npm package versions. Do not commit temporary `yalc` wiring unless it is intentionally part of a short-lived testing branch.

## Notes

1. Publish built package outputs, not TypeScript source paths.
2. Keep package exports stable because downstream games import subpaths such as `@7ito/sketcherson-common/game`.
3. Update package versions through Changesets rather than manually editing versions.
4. Run downstream game test suites before treating a Sketcherson release as safe for production games.
