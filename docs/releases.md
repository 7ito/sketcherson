# Releases

Sketcherson uses Changesets to version and publish public packages.

## Package policy

- Public packages use independent semantic versions.
- `@7ito/sketcherson-common` is currently publishable.
- `@7ito/sketcherson-server` and `@7ito/sketcherson-web` are private until their extraction issues are complete.
- `@sketcherson/demo-game` stays private unless it becomes a supported template package.
- Internal workspace dependency ranges are updated as patch changes by Changesets.

## Create a changeset

After changing a publishable package, run:

```sh
npm run changeset
```

Select the changed package, choose the semver bump, and write a short user-facing summary. Commit the generated file in `.changeset/` with the code change.

## Version packages

Maintainers prepare a release commit with:

```sh
npm run version-packages
```

This consumes pending changesets, bumps package versions, updates changelogs, and updates internal dependency ranges.

## Publish packages

Publish from a clean checkout after CI is green:

```sh
npm run publish-packages
```

The publish script builds and tests the workspace before running `changeset publish`.

## Prerelease flow for downstream projects

Use prereleases when private downstream games need to validate unreleased package changes:

```sh
npx changeset pre enter next
npm run changeset
npm run version-packages
npm run publish-packages -- --tag next
npx changeset pre exit
```

Downstream repos can then install the prerelease tag, for example:

```sh
npm install @7ito/sketcherson-common@next
```
