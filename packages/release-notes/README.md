# Cumulocity Release Notes Plugin

[![Node.js CI](https://github.com/Cumulocity-IoT/cumulocity-release-notes-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/Cumulocity-IoT/cumulocity-release-notes-plugin/actions/workflows/test.yml)

![](./_media/demo_1.gif)

The release notes plugin provides the functionality to create release notes that can then be viewed by other users.

---

## Features

- One view to create, update, delete and publish release notes.
- Another view to show the release notes to the users.
- It is tracked if a user has read a release – using the localstorage –, and if a new one is availabel, it will automatically be shown to the user.
- Two plugins within this package – one for the view, one to admin – allows to install each part in a separate app, to handle user access.

![](./_media/admin-ui_1.png)  
<small>**Admin UI**: providing a new menu item and admin interface. **View UI**: provides a new user menu item, to manually open the release notes dialog. </small>

![](./_media/release_view.png)  
<small>**View UI**: when manually clicking the user menu item, a dialog with all releasenotes will be shown.</small>

![](./_media/plugin-install_1.png)  
<small>Please use the package details, if you wish to install the two plugins separately.</small>

---

## Local Development

### How to start

Change the target tenant and application you want to run this plugin on in the `package.json`.

```bash
ng serve -u https://{{your-tenant}}.cumulocity.com/ --shell {{cockpit}}
```

Keep in mind that this plugin needs to have an app (e.g. cockpit) running with at least the same version as this plugin. if your tenant contains an older version, use the c8ycli to create a cockpit clone running with **at least version 1016.0.59**! Upload this clone to the target tenant (e.g. cockpit-1016) and reference this name in the `--shell` command.

The widget plugin can be locally tested via the start script:

```bash
npm start
```

In the Module Federation terminology, `widget` plugin is called `remote` and the `cockpit` is called `shell`. Modules provided by this `widget` will be loaded by the `cockpit` application at the runtime. This plugin provides a basic custom widget that can be accessed through the `Add widget` menu.

> Note that the `--shell` flag creates a proxy to the cockpit application and provides `ReminderPluginModule` as an `remote` via URL options.

Also deploying needs no special handling and can be simply done via `npm run deploy`. As soon as the application has exports it will be uploaded as a plugin.

---

## Useful links

### 📘 Explore the Knowledge Base

Dive into a wealth of Cumulocity IoT tutorials and articles in the [TECHcommunity Knowledge Base](https://tech.forums.softwareag.com/tags/c/knowledge-base/6/cumulocity-iot).

### 💡 Get Expert Answers

Stuck or just curious? Ask the Cumulocity IoT experts directly on our [Software AG TECHcommunity Forums](https://tech.forums.softwareag.com/tags/c/forum/1/Cumulocity-IoT).

### 🚀 Try Cumulocity IoT

See Cumulocity IoT in action with a [Free Trial](https://techcommunity.softwareag.com/en_en/downloads.html).

### ✍️ Share Your Feedback

Your input drives our innovation. If you find a bug, please create an [issue](./issues) in the repository. If you’d like to share your ideas or feedback, please post them in our [Tech Forums](https://tech.forums.softwareag.com/c/feedback/2).

### More to discover

- [Cumulocity IoT Web Development Tutorial - Part 1: Start your journey](https://tech.forums.softwareag.com/t/cumulocity-iot-web-development-tutorial-part-1-start-your-journey/259613)
- [How to install a Microfrontend Plugin on a tenant and use it in an app?](https://tech.forums.softwareag.com/t/how-to-install-a-microfrontend-plugin-on-a-tenant-and-use-it-in-an-app/268981)
- [The power of micro frontends – How to dynamically extend Cumulocity IoT Frontends](https://tech.forums.softwareag.com/t/the-power-of-micro-frontends-how-to-dynamically-extend-cumulocity-iot-frontends/266665)

---

This widget is provided as-is and without warranty or support. They do not constitute part of the Software AG product suite. Users are free to use, fork and modify them, subject to the license agreement. While Software AG welcomes contributions, we cannot guarantee to include every contribution in the master project.

<!-- <:3  )~~ -->
