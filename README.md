# cumulocity-ui-toolkit

---

## Workspaces

Workspace description from the [npm workspaces docs](https://docs.npmjs.com/cli/v11/using-npm/workspaces):

> **Workspaces** is a generic term that refers to the set of features in the npm cli that provides support for managing multiple packages from your local file system from within a singular top-level, root package.
>
> This set of features makes up for a much more streamlined workflow handling linked packages from the local file system. It automates the linking process as part of npm install and removes the need to manually use npm link in order to add references to packages that should be symlinked into the current node_modules folder.
>
> We also refer to these packages being auto-symlinked during npm install as a single **workspace**, meaning it's a nested package within the current local file system that is explicitly defined in the package.json workspaces configuration.

### Installing Dependencies

`npm install [your-package] -w [your-workspace]`

ℹ️ `[your-package]` references to "name" in the package.json

### Testing

- `npm run test --workspace=[your-workspace]` runs tests for a single plugin
- `npm run test --workspace=plugins --if-present` runs test for all plugins
- `npm run test --workspaces --if-present` » run tests for all workspaces (plugins & components)

---

## Useful links

### 📘 Explore the Knowledge Base

Dive into a wealth of Cumulocity tutorials and articles in the [TECHcommunity Knowledge Base](https://techcommunity.cumulocity.com/c/knowledge-base/7).

### 💡 Get Expert Answers

Stuck or just curious? Ask the Cumulocity experts directly on our [Cumulocity TECHcommunity Forums](https://techcommunity.cumulocity.com/c/forum/5).

### 🚀 Try Cumulocity

See Cumulocity in action with a [Free Trial](https://techcommunity.cumulocity.com/t/cumulocity-iot-free-trial-faqs/1475).

### ✍️ Share Your Feedback

Your input drives our innovation. If you find a bug, please create an [issue](./issues) in the repository. If you’d like to share your ideas or feedback, please post them in our [Tech Forums](https://techcommunity.cumulocity.com/c/feedback-ideas/14).

### More to discover

- [Cumulocity IoT Web Development Tutorial - Part 1: Start your journey](https://techcommunity.cumulocity.com/t/cumulocity-iot-web-development-tutorial-part-1-start-your-journey/4124)
- [How to install a Microfrontend Plugin on a tenant and use it in an app?](https://techcommunity.cumulocity.com/t/how-to-install-a-microfrontend-plugin-on-a-tenant-and-use-it-in-an-app/3034)
- [The power of micro frontends – How to dynamically extend Cumulocity IoT Frontends](https://techcommunity.cumulocity.com/t/the-power-of-micro-frontends-how-to-dynamically-extend-cumulocity-iot-frontends/2577)

---

This widget is provided as-is and without warranty or support. They do not constitute part of the Cumulocity product suite. Users are free to use, fork and modify them, subject to the license agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every contribution in the master project.
