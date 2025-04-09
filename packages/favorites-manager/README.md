# Cumulocity UI Critical Alarm Reminder Plugin

[![Node.js CI](https://github.com/cumulocity/cumulocity-reminder-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/cumulocity/cumulocity-reminder-plugin/actions/workflows/test.yml)

---

## Features

![A short recording of the basic functionalities of the reminder plugin featuring: creating a reminder, seeing it being updated from "upcoming" to "due" and how it is manually cleared.](./public/reminder-feature.gif)

The critical alarm reminder plugin provides an option to manually setup reminders. These [reminders](#reminders) – technically speaking cumulocity events – are attached to groups or devices. They also feature a configurable timestamp, to define when to be reminded.

All the reminders are neatly accessibly from with a new drawer, positioned on the right – just like the "user menu".

### Reminders

As mentioned earlier, reminders are cumulocity events attached to assets (groups or devices). But they function similar to cumulocity alarms, as their status is either "**active**", "**acknowledged**" or "**cleared**". Providing the same clear state handling that should solve the basic question "do I need to do something?".

![Screenshot of the reminder creation dialog, highlighting the selected asset](./public/reminder-creation.png)  
<small>The "create a reminder" dialog will have the current asset – the page you looking at – preselected.</small>

So why do I need a reminder it is just like an alarm?  
Because you want a [notification](#notifications), once the reminder has become due. (continue reading)

### Notifications

Reminders sorted into **three logical groups**:

1. "**due**": reminders that are not cleared, and timestamp is in the past.
2. "**upcoming**": similar to "due"; reminders that are not cleared but whos timestamp is in the future.
3. "**cleared**": reminder that were manually cleared

That said, you will receive a notification once an upcoming reminder reaches its timestamp and will move from "upcoming" to "due".

Please note that, as you can also re-active a cleared alarm, **a notification for this reminder will not be send**.

![Screenshot of the reminder drawer, highlighting the notification options at the bottom](./media/../public/reminder-notification-type.png)  
<small>At the bottom of the reminder drawer, you can choose want type of notification you want to receive: an in-cumulocity "toast" message, a browser notification, both or neither.</small>

> For browser notifications to function, your browser needs to support notifications and you need to accept the permission request.

Please reference your browsers documentation, in case you experience issues granting notification permission.

### Reminder Type Config

Selectable reminder types can be configured using the tenant option – best using the [Tenant Option Manager Plugin](https://github.com/SoftwareAG/cumulocity-tenant-option-management-plugin) –, using the configuration as described below. Per default, no config is set and the type selection hidden.

![](./public/type-filter.png)  
<small>Reminder type filter – available to the user, accessible from within the reminder drawer –, and display of types on reminder items.</small>

![](./media/../public/type-create-reminder.png)  
<small>The reminder type field is shown, within the reminder creation dialog, when types are configured.</small>

| Fragment |  Type  | Info                                                                                                                                 |
| -------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`     | string | Any unique string value, used to reference the filter, when saved in local storage. Not displayed to the user. As short as possible. |
| `name`   | string | Human-readable label for the reminder type, displayed to the user.                                                                   |

![Screenshot of an example tenant option config, within the manager plugin UI](./public/type-tenant-options.png)  
<small>Tenant option config: Category `c8y.reminder`, Key `types`.</small>

##### Example Config

```json
[
  {
    "id": "1",
    "name": "Type 1"
  },
  {
    "id": "2",
    "name": "My Preferred Type"
  },
  {
    "id": "a_123",
    "name": "A123"
  }
]
```

---

<!--
## Installation and update

_TBD_

---

-->

## Local Development

### Recommended version

|   C8Y |  Plugin | Versions                             |
| ----: | ------: | ------------------------------------ |
| ^1020 |      v1 | node v18.x, npm v10.x, Angular v17.x |
|  1018 |      v0 |                                      |
|  1017 |      v0 | node v16.x, npm v9.x, Angular v14.x  |

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

This widget is provided as-is and without warranty or support. They do not constitute part of the Cumulocity product suite. Users are free to use, fork and modify them, subject to the license agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every contribution in the master project.

<!-- <:3  )~~ -->
