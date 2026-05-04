# Updating downstream games

This process is for pulling released Sketcherson updates into downstream game repositories.

## Dependency model

Downstream games should keep only game-specific code locally.

Example private repo layout:

```txt
packages/my-drawing-game
apps/server
apps/web
shell.config.ts
```

The generic framework should come from package dependencies:

```json
{
  "dependencies": {
    "@7ito/sketcherson-common": "^0.1.4",
    "@7ito/sketcherson-server": "^0.1.4",
    "@7ito/sketcherson-web": "^0.1.4"
  }
}
```

## Manual update workflow

1. Open the downstream repo.

```sh
cd /path/to/downstream-game-a
```

or:

```sh
cd /path/to/downstream-game-b
```

2. Update Sketcherson packages.

```sh
npm update @7ito/sketcherson-common @7ito/sketcherson-server @7ito/sketcherson-web
```

3. Validate the downstream game.

```sh
npm test
npm run build
```

4. Run the app locally if the change affects runtime behavior.

```sh
npm run dev
```

5. Commit the package metadata and lockfile changes.

```sh
git add package.json package-lock.json
git commit -m "Update Sketcherson packages"
```

## Automated update workflow

Use Renovate or Dependabot in downstream repos.

The bot should open pull requests when packages such as these receive new versions:

```txt
@7ito/sketcherson-common
@7ito/sketcherson-server
@7ito/sketcherson-web
```

A normal bot PR should contain only dependency version and lockfile changes. CI should run the downstream test and build commands.

## When updates fail

If a downstream update fails, classify the failure before changing code.

1. If the failure is caused by a breaking Sketcherson API change, either fix the downstream app or release a compatibility fix from Sketcherson.
2. If the failure is caused by game-specific behavior that required a copied shell edit, create or update an upstream Sketcherson extension issue.
3. If the failure is caused by package metadata or exports, fix the package publication issue in Sketcherson first.

Do not patch copied generic framework files in the downstream repo. That recreates the mirroring problem. For a new package-based downstream game, start from the [starter game template](starter-template.md).

## Local testing with unpublished Sketcherson changes

Use `yalc` when a Sketcherson change needs validation in a downstream game before publication.

From Sketcherson:

```sh
npm run build
yalc publish packages/common
yalc publish packages/server
yalc publish packages/web
```

From the downstream repo:

```sh
yalc add @7ito/sketcherson-common @7ito/sketcherson-server @7ito/sketcherson-web
npm install
npm test
npm run build
```

If the downstream game passes, publish real package versions from Sketcherson and update the downstream repo using the manual or automated workflow above.

## Recommended migration order

1. Migrate the smaller downstream game first because it has fewer framework leaks.
2. Migrate larger downstream games after close guess feedback, prompt display metadata, CSS skin assets, and web extension slots exist upstream.

Relevant issue:

1. Sketcherson roadmap: https://github.com/7ito/sketcherson/issues/10
